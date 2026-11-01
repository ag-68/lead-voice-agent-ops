from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from ..utils.db import get_db
from ..models import Lead, LeadStatus
from ..services import get_voice_agent_config, log_action, BlastRadius

router = APIRouter(prefix="/api/voice", tags=["voice"])


class VoiceCallbackPayload(BaseModel):
    conversation_id: str
    lead_id: Optional[int] = None
    status: str  # "completed", "failed", "no_answer", "voicemail"
    duration_seconds: int
    transcript: Optional[str] = None
    summary: Optional[str] = None
    meeting_booked: bool = False
    meeting_time: Optional[datetime] = None


@router.get("/config")
async def get_config():
    """Get current voice agent configuration (for debugging/display)"""
    
    return get_voice_agent_config()


@router.post("/callback")
async def voice_call_callback(
    payload: VoiceCallbackPayload,
    db: AsyncSession = Depends(get_db),
):
    """
    Callback endpoint for completed voice calls.
    ElevenAgents sends results here after call completion.
    """
    
    lead = None
    if payload.lead_id:
        result = await db.execute(select(Lead).where(Lead.id == payload.lead_id))
        lead = result.scalar_one_or_none()
    
    if not lead and payload.conversation_id:
        pass
    
    if not lead:
        await log_action(
            db=db,
            action="voice_callback_orphan",
            actor="elevenlabs",
            details=f"Received callback for unknown lead. conversation_id: {payload.conversation_id}",
            blast_radius=BlastRadius.READ_ONLY,
        )
        return {"status": "ok", "warning": "Lead not found"}
    
    lead.status = LeadStatus.VOICE_COMPLETED
    lead.voice_call_completed_at = datetime.utcnow()
    lead.voice_call_summary = payload.summary or f"Call {payload.status}. Duration: {payload.duration_seconds}s"
    
    await db.commit()
    
    await log_action(
        db=db,
        action="voice_call_completed",
        actor="elevenlabs",
        lead_id=lead.id,
        details=f"Status: {payload.status}, Duration: {payload.duration_seconds}s, Meeting: {payload.meeting_booked}",
        reasoning=payload.transcript[:500] if payload.transcript else None,
        blast_radius=BlastRadius.DB_WRITE,
    )
    
    return {
        "status": "ok",
        "lead_id": lead.id,
        "call_status": payload.status,
        "meeting_booked": payload.meeting_booked,
    }


@router.post("/simulate/{lead_id}")
async def simulate_voice_call(
    lead_id: int,
    status: str = "completed",
    meeting_booked: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """
    Simulate a voice call completion (for testing without real calls).
    """
    
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    simulated_summary = f"""
SIMULATED VOICE CALL SUMMARY
============================
Lead: {lead.name}
Company: {lead.company_name}

Call Status: {status}
Duration: 180 seconds (simulated)

Key Points Discussed:
- Introduced ElevenLabs voice AI capabilities
- Discussed potential use cases for {lead.company_industry or 'their industry'}
- {'Scheduled follow-up meeting' if meeting_booked else 'Requested more information via email'}

Next Steps:
- {'Calendar invite sent for demo' if meeting_booked else 'Send product overview email'}
""".strip()
    
    lead.status = LeadStatus.VOICE_COMPLETED
    lead.voice_call_completed_at = datetime.utcnow()
    lead.voice_call_summary = simulated_summary
    
    await db.commit()
    
    await log_action(
        db=db,
        action="voice_call_simulated",
        actor="system:simulator",
        lead_id=lead.id,
        details=f"Simulated call: {status}, Meeting: {meeting_booked}",
        blast_radius=BlastRadius.DB_WRITE,
    )
    
    return {
        "status": "simulated",
        "lead_id": lead.id,
        "call_status": status,
        "meeting_booked": meeting_booked,
        "summary": simulated_summary,
    }
