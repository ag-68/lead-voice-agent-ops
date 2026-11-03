from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from typing import List
from datetime import datetime

from ..utils.db import get_db
from ..models import (
    Lead, LeadStatus, LeadTier, AuditLog, SlackApprovalToken,
    LeadCreate, LeadResponse, LeadEnrichment, PipelineStats
)
from ..services import log_action, BlastRadius, qualify_lead, trigger_voice_call

router = APIRouter(prefix="/api/leads", tags=["leads"])


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
    
    background_tasks.add_task(qualify_lead, lead.id)
    
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
    
    released = await db.execute(
        select(func.count(Lead.id))
        .where(
            Lead.status.in_(
                [
                    LeadStatus.VOICE_SCHEDULED,
                    LeadStatus.VOICE_COMPLETED,
                    LeadStatus.BOOKED_DEMO,
                ]
            )
        )
    )
    released_count = released.scalar() or 0

    waiting = await db.execute(
        select(func.count(Lead.id))
        .where(Lead.status.in_([LeadStatus.SELECTED, LeadStatus.PENDING_APPROVAL]))
    )
    waiting_count = waiting.scalar() or 0

    approval_rate = released_count / (released_count + waiting_count) if (released_count + waiting_count) > 0 else 0
    
    voice_scheduled = await db.execute(
        select(func.count(Lead.id))
        .where(Lead.status == LeadStatus.VOICE_SCHEDULED)
    )
    
    voice_completed = await db.execute(
        select(func.count(Lead.id))
        .where(
            Lead.status.in_([LeadStatus.VOICE_COMPLETED, LeadStatus.BOOKED_DEMO])
        )
    )

    demos_booked = await db.execute(
        select(func.count(Lead.id)).where(Lead.status == LeadStatus.BOOKED_DEMO)
    )
    
    return PipelineStats(
        total_leads=total_leads,
        leads_by_status=leads_by_status,
        leads_by_tier=leads_by_tier,
        avg_icp_score=avg_icp_score,
        approval_rate=approval_rate,
        voice_calls_scheduled=voice_scheduled.scalar() or 0,
        voice_calls_completed=voice_completed.scalar() or 0,
        demos_booked=demos_booked.scalar() or 0,
    )


@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(lead_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific lead by ID"""
    
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    return lead


@router.delete("/{lead_id}")
async def delete_lead(lead_id: int, db: AsyncSession = Depends(get_db)):
    """Remove one lead and the records that belong to it."""

    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    await db.execute(delete(SlackApprovalToken).where(SlackApprovalToken.lead_id == lead_id))
    await db.execute(delete(AuditLog).where(AuditLog.lead_id == lead_id))
    await db.delete(lead)
    await db.commit()
    return {"deleted": lead_id}


@router.post("/{lead_id}/reprocess")
async def reprocess_lead(
    lead_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Reprocess a lead through the scoring pipeline"""
    
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    lead.status = LeadStatus.RECEIVED
    await db.commit()
    
    background_tasks.add_task(qualify_lead, lead.id)
    
    return {"message": "Lead reprocessing started", "lead_id": lead_id}


@router.post("/{lead_id}/decide")
async def decide_lead(lead_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """A person calls, claims, or rejects one lead from the page."""

    try:
        body = await request.json()
    except Exception:
        body = None
    action = body.get("action") if isinstance(body, dict) else None
    if action not in ("call", "claim", "reject"):
        raise HTTPException(status_code=400, detail="Choose call, claim, or reject.")

    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if action == "call":
        success, message, call_id = await trigger_voice_call(lead)
        if not success:
            await log_action(
                db=db,
                action="voice_call_not_placed",
                actor="dashboard",
                lead_id=lead.id,
                details=message,
                blast_radius=BlastRadius.READ_ONLY,
            )
            raise HTTPException(status_code=400, detail=message)
        lead.status = LeadStatus.VOICE_SCHEDULED
        lead.voice_call_scheduled_at = datetime.utcnow()
        if call_id:
            lead.voice_conversation_id = call_id
        await db.commit()
        await log_action(
            db=db,
            action="voice_call_triggered",
            actor="dashboard",
            lead_id=lead.id,
            details=f"Call released from the page. Call ID: {call_id}",
            blast_radius=BlastRadius.VOICE_TRIGGER,
            requires_approval=True,
            approved_by="dashboard",
        )
        return {"status": lead.status.value, "message": "Call started."}

    if action == "claim":
        lead.status = LeadStatus.CLAIMED_MANUALLY
        lead.assigned_to = "dashboard"
        await db.commit()
        await log_action(
            db=db,
            action="lead_claimed",
            actor="dashboard",
            lead_id=lead.id,
            details="Claimed from the page. No call.",
            blast_radius=BlastRadius.DB_WRITE,
        )
        return {"status": lead.status.value, "message": "Claimed. No call."}

    lead.status = LeadStatus.REJECTED
    await db.commit()
    await log_action(
        db=db,
        action="lead_rejected",
        actor="dashboard",
        lead_id=lead.id,
        details="Rejected from the page. No call.",
        blast_radius=BlastRadius.DB_WRITE,
    )
    return {"status": lead.status.value, "message": "Rejected. No call."}


@router.post("/{lead_id}/resolve")
async def resolve_claimed_lead(lead_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Manually finish a claimed (human) outreach as completed or booked demo."""

    try:
        body = await request.json()
    except Exception:
        body = None
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Send a JSON body.")
    action = body.get("action")
    if action not in ("complete", "book_demo"):
        raise HTTPException(status_code=400, detail="Choose complete or book_demo.")

    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if lead.status != LeadStatus.CLAIMED_MANUALLY:
        raise HTTPException(
            status_code=400,
            detail="Only a claimed lead can be manually completed or booked.",
        )

    notes = body.get("notes")
    notes_text = notes.strip() if isinstance(notes, str) and notes.strip() else None
    when = body.get("demo_scheduled_for")
    when_text = when.strip() if isinstance(when, str) and when.strip() else None

    lead.voice_call_completed_at = datetime.utcnow()
    if action == "book_demo":
        lead.status = LeadStatus.BOOKED_DEMO
        lead.demo_scheduled_for = when_text or "Time set by human agent"
        lead.demo_booking_notes = notes_text or "Booked manually after a claimed (human) call."
        lead.voice_call_summary = (
            (lead.voice_call_summary or "")
            + ("\n\n" if lead.voice_call_summary else "")
            + f"MANUAL BOOKING\nWhen: {lead.demo_scheduled_for}\n"
            + (f"Notes: {lead.demo_booking_notes}" if lead.demo_booking_notes else "")
        ).strip()
        await db.commit()
        await log_action(
            db=db,
            action="demo_booked",
            actor="dashboard",
            lead_id=lead.id,
            details=f"Manual book after claim. When: {lead.demo_scheduled_for}",
            blast_radius=BlastRadius.DB_WRITE,
        )
        return {"status": lead.status.value, "message": "Marked as booked demo."}

    lead.status = LeadStatus.VOICE_COMPLETED
    lead.demo_scheduled_for = None
    lead.demo_booking_notes = notes_text
    lead.voice_call_summary = (
        (lead.voice_call_summary or "")
        + ("\n\n" if lead.voice_call_summary else "")
        + "MANUAL COMPLETION\nHuman agent finished outreach without booking a demo."
        + (f"\nNotes: {notes_text}" if notes_text else "")
    ).strip()
    await db.commit()
    await log_action(
        db=db,
        action="voice_call_completed",
        actor="dashboard",
        lead_id=lead.id,
        details="Manual complete after claim. No demo booked.",
        blast_radius=BlastRadius.DB_WRITE,
    )
    return {"status": lead.status.value, "message": "Marked as completed."}
