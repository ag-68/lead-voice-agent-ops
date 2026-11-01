from fastapi import APIRouter, Depends, HTTPException, Request, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
import json

from ..utils.db import get_db
from ..models import Lead, LeadStatus, SlackApprovalAction
from ..services import (
    validate_approval_token, update_approval_message,
    trigger_voice_call, log_action, BlastRadius
)

router = APIRouter(prefix="/api/slack", tags=["slack"])


@router.post("/interactions")
async def handle_slack_interaction(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle Slack interactive components (button clicks).
    This is the human-in-the-loop approval endpoint.
    """
    
    form_data = await request.form()
    payload_str = form_data.get("payload")
    
    if payload_str:
        payload = json.loads(payload_str)
    else:
        body = await request.body()
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid payload")
    
    actions = payload.get("actions", [])
    if not actions:
        return {"ok": True}
    
    action = actions[0]
    action_id = action.get("action_id")
    token = action.get("value")
    user = payload.get("user", {})
    user_id = user.get("id", "unknown")
    user_name = user.get("name", "Unknown User")
    
    token_record, error = await validate_approval_token(db, token)
    
    if not token_record:
        return {
            "response_type": "ephemeral",
            "text": f"⚠️ {error}. Please contact an admin."
        }
    
    result = await db.execute(select(Lead).where(Lead.id == token_record.lead_id))
    lead = result.scalar_one_or_none()
    
    if not lead:
        return {"response_type": "ephemeral", "text": "Lead not found"}
    
    token_record.used = True
    await db.commit()
    
    if action_id == "approve_voice_call":
        lead.status = LeadStatus.APPROVED
        await db.commit()
        
        await log_action(
            db=db,
            action="lead_approved",
            actor=f"slack:{user_id}",
            lead_id=lead.id,
            details=f"Approved by {user_name} for voice outreach",
            blast_radius=BlastRadius.DB_WRITE,
            requires_approval=True,
            approved_by=user_name,
        )
        
        success, message, call_id = await trigger_voice_call(lead)
        
        if success:
            lead.status = LeadStatus.VOICE_SCHEDULED
            lead.voice_call_scheduled_at = datetime.utcnow()
            await db.commit()
            
            await log_action(
                db=db,
                action="voice_call_triggered",
                actor="system",
                lead_id=lead.id,
                details=f"Call ID: {call_id}",
                blast_radius=BlastRadius.VOICE_TRIGGER,
                requires_approval=True,
                approved_by=user_name,
            )
            
            return {
                "response_type": "in_channel",
                "replace_original": True,
                "text": f"✅ *Approved by {user_name}*\n\nVoice call scheduled for {lead.name} at {lead.company_name}.\nCall ID: `{call_id}`"
            }
        else:
            return {
                "response_type": "in_channel",
                "replace_original": True,
                "text": f"✅ *Approved by {user_name}* but voice call failed: {message}\n\nLead marked for manual follow-up."
            }
    
    elif action_id == "claim_manually":
        lead.status = LeadStatus.CLAIMED_MANUALLY
        lead.assigned_to = user_name
        await db.commit()
        
        await log_action(
            db=db,
            action="lead_claimed",
            actor=f"slack:{user_id}",
            lead_id=lead.id,
            details=f"Claimed by {user_name} for manual outreach",
            blast_radius=BlastRadius.DB_WRITE,
        )
        
        return {
            "response_type": "in_channel",
            "replace_original": True,
            "text": f"👤 *Claimed by {user_name}*\n\n{lead.name} at {lead.company_name} has been assigned for manual outreach."
        }
    
    elif action_id == "reject_lead":
        lead.status = LeadStatus.REJECTED
        await db.commit()
        
        await log_action(
            db=db,
            action="lead_rejected",
            actor=f"slack:{user_id}",
            lead_id=lead.id,
            details=f"Rejected by {user_name}",
            blast_radius=BlastRadius.DB_WRITE,
        )
        
        return {
            "response_type": "in_channel",
            "replace_original": True,
            "text": f"❌ *Rejected by {user_name}*\n\nLead {lead.name} at {lead.company_name} marked as rejected."
        }
    
    return {"ok": True}


@router.post("/approve/{token}")
async def approve_via_url(
    token: str,
    action: str = "approve_voice",
    user_name: str = "API User",
    db: AsyncSession = Depends(get_db),
):
    """
    Direct URL approval endpoint (for testing without Slack).
    In production, this would be secured with proper authentication.
    """
    
    token_record, error = await validate_approval_token(db, token)
    
    if not token_record:
        raise HTTPException(status_code=400, detail=error)
    
    result = await db.execute(select(Lead).where(Lead.id == token_record.lead_id))
    lead = result.scalar_one_or_none()
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    token_record.used = True
    
    if action == "approve_voice":
        lead.status = LeadStatus.APPROVED
        await db.commit()
        
        await log_action(
            db=db,
            action="lead_approved",
            actor=f"api:{user_name}",
            lead_id=lead.id,
            details=f"Approved via direct URL",
            blast_radius=BlastRadius.DB_WRITE,
            requires_approval=True,
            approved_by=user_name,
        )
        
        success, message, call_id = await trigger_voice_call(lead)
        
        if success:
            lead.status = LeadStatus.VOICE_SCHEDULED
            lead.voice_call_scheduled_at = datetime.utcnow()
            await db.commit()
            
            await log_action(
                db=db,
                action="voice_call_triggered",
                actor="system",
                lead_id=lead.id,
                details=f"Call ID: {call_id}",
                blast_radius=BlastRadius.VOICE_TRIGGER,
                requires_approval=True,
                approved_by=user_name,
            )
        
        return {"status": "approved", "voice_call": success, "call_id": call_id, "message": message}
    
    elif action == "claim":
        lead.status = LeadStatus.CLAIMED_MANUALLY
        lead.assigned_to = user_name
        await db.commit()
        
        await log_action(
            db=db,
            action="lead_claimed",
            actor=f"api:{user_name}",
            lead_id=lead.id,
            details=f"Claimed via direct URL",
            blast_radius=BlastRadius.DB_WRITE,
        )
        
        return {"status": "claimed", "assigned_to": user_name}
    
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
