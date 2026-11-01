from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
from datetime import datetime

from ..utils.db import get_db
from ..models import (
    Lead, LeadStatus, LeadTier,
    LeadCreate, LeadResponse, LeadEnrichment, PipelineStats
)
from ..services import (
    enrich_lead, send_approval_request, 
    log_action, BlastRadius
)
from ..config import get_settings

router = APIRouter(prefix="/api/leads", tags=["leads"])
settings = get_settings()


async def process_lead_pipeline(lead_id: int, db: AsyncSession):
    """Background task to process lead through the qualification pipeline"""
    
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        return
    
    lead.status = LeadStatus.ENRICHING
    await db.commit()
    
    await log_action(
        db=db,
        action="lead_enrichment_started",
        actor="system",
        lead_id=lead.id,
        details="Starting Claude enrichment",
        blast_radius=BlastRadius.READ_ONLY,
    )
    
    try:
        enrichment, reasoning = await enrich_lead(
            name=lead.name,
            email=lead.email,
            company_name=lead.company_name,
            job_title=lead.job_title,
            message=lead.message,
        )
        
        lead.company_domain = enrichment.company_domain
        lead.company_industry = enrichment.company_industry
        lead.company_size = enrichment.company_size
        lead.company_employees = enrichment.company_employees
        lead.company_revenue = enrichment.company_revenue
        lead.company_region = enrichment.company_region
        lead.company_description = enrichment.company_description
        lead.is_fortune_500 = enrichment.is_fortune_500
        lead.icp_score = enrichment.icp_score
        lead.icp_reasoning = enrichment.icp_reasoning
        lead.tier = enrichment.tier
        lead.status = LeadStatus.ENRICHED
        
        await db.commit()
        
        await log_action(
            db=db,
            action="lead_enriched",
            actor="claude",
            lead_id=lead.id,
            details=f"ICP Score: {enrichment.icp_score}, Tier: {enrichment.tier.value}",
            reasoning=reasoning,
            blast_radius=BlastRadius.DB_WRITE,
        )
        
        if enrichment.is_fortune_500 or enrichment.icp_score >= settings.icp_criteria["fortune_500_threshold"]:
            lead.status = LeadStatus.PENDING_APPROVAL
            await db.commit()
            
            await log_action(
                db=db,
                action="approval_required",
                actor="system",
                lead_id=lead.id,
                details=f"High-value lead (Fortune 500: {enrichment.is_fortune_500}, Score: {enrichment.icp_score})",
                blast_radius=BlastRadius.READ_ONLY,
                requires_approval=True,
            )
            
            success, result = await send_approval_request(db, lead)
            
            if success:
                lead.slack_message_ts = result
                await db.commit()
                
                await log_action(
                    db=db,
                    action="slack_approval_sent",
                    actor="system",
                    lead_id=lead.id,
                    details=f"Slack message sent: {result}",
                    blast_radius=BlastRadius.SLACK_POST,
                )
        else:
            lead.status = LeadStatus.APPROVED
            await db.commit()
            
            await log_action(
                db=db,
                action="auto_approved",
                actor="system",
                lead_id=lead.id,
                details=f"Below Fortune 500 threshold (Score: {enrichment.icp_score})",
                blast_radius=BlastRadius.READ_ONLY,
            )
            
    except Exception as e:
        lead.status = LeadStatus.FAILED
        await db.commit()
        
        await log_action(
            db=db,
            action="enrichment_failed",
            actor="system",
            lead_id=lead.id,
            details=str(e),
            blast_radius=BlastRadius.READ_ONLY,
        )


@router.post("/", response_model=LeadResponse)
async def create_lead(
    lead_data: LeadCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Webhook endpoint for inbound lead submissions.
    Triggers the full qualification pipeline in the background.
    """
    
    lead = Lead(
        email=lead_data.email,
        name=lead_data.name,
        company_name=lead_data.company_name,
        job_title=lead_data.job_title,
        phone=lead_data.phone,
        message=lead_data.message,
        status=LeadStatus.RECEIVED,
    )
    
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    
    await log_action(
        db=db,
        action="lead_created",
        actor="api:webhook",
        lead_id=lead.id,
        details=f"Inbound lead from {lead.email}",
        blast_radius=BlastRadius.DB_WRITE,
    )
    
    background_tasks.add_task(process_lead_pipeline, lead.id, db)
    
    return lead


@router.get("/", response_model=List[LeadResponse])
async def list_leads(
    status: LeadStatus | None = None,
    tier: LeadTier | None = None,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """List all leads with optional filtering"""
    
    query = select(Lead)
    
    if status:
        query = query.where(Lead.status == status)
    if tier:
        query = query.where(Lead.tier == tier)
    
    query = query.order_by(Lead.created_at.desc()).limit(limit).offset(offset)
    
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/stats", response_model=PipelineStats)
async def get_pipeline_stats(db: AsyncSession = Depends(get_db)):
    """Get pipeline statistics for dashboard"""
    
    total = await db.execute(select(func.count(Lead.id)))
    total_leads = total.scalar() or 0
    
    by_status = await db.execute(
        select(Lead.status, func.count(Lead.id))
        .group_by(Lead.status)
    )
    leads_by_status = {row[0].value: row[1] for row in by_status}
    
    by_tier = await db.execute(
        select(Lead.tier, func.count(Lead.id))
        .where(Lead.tier.isnot(None))
        .group_by(Lead.tier)
    )
    leads_by_tier = {row[0].value: row[1] for row in by_tier}
    
    avg_score = await db.execute(
        select(func.avg(Lead.icp_score))
        .where(Lead.icp_score > 0)
    )
    avg_icp_score = avg_score.scalar() or 0
    
    approved = await db.execute(
        select(func.count(Lead.id))
        .where(Lead.status.in_([LeadStatus.APPROVED, LeadStatus.VOICE_SCHEDULED, LeadStatus.VOICE_COMPLETED]))
    )
    approved_count = approved.scalar() or 0
    
    pending = await db.execute(
        select(func.count(Lead.id))
        .where(Lead.status == LeadStatus.PENDING_APPROVAL)
    )
    pending_count = pending.scalar() or 0
    
    approval_rate = approved_count / (approved_count + pending_count) if (approved_count + pending_count) > 0 else 0
    
    voice_scheduled = await db.execute(
        select(func.count(Lead.id))
        .where(Lead.status == LeadStatus.VOICE_SCHEDULED)
    )
    
    voice_completed = await db.execute(
        select(func.count(Lead.id))
        .where(Lead.status == LeadStatus.VOICE_COMPLETED)
    )
    
    return PipelineStats(
        total_leads=total_leads,
        leads_by_status=leads_by_status,
        leads_by_tier=leads_by_tier,
        avg_icp_score=avg_icp_score,
        approval_rate=approval_rate,
        voice_calls_scheduled=voice_scheduled.scalar() or 0,
        voice_calls_completed=voice_completed.scalar() or 0,
    )


@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(lead_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific lead by ID"""
    
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    return lead


@router.post("/{lead_id}/reprocess")
async def reprocess_lead(
    lead_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Reprocess a lead through the enrichment pipeline"""
    
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    lead.status = LeadStatus.RECEIVED
    await db.commit()
    
    background_tasks.add_task(process_lead_pipeline, lead.id, db)
    
    return {"message": "Lead reprocessing started", "lead_id": lead_id}
