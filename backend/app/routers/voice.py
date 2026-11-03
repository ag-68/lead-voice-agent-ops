from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from ..utils.db import get_db
from ..models import Lead, LeadStatus
from ..services import get_voice_agent_config, log_action, BlastRadius
from ..services.demo_booking import resolve_demo_booking
from ..services.local_keys import active_voice
from ..services.voice_agent import (
    build_call_summary_from_event,
    parse_elevenlabs_webhook,
    verify_elevenlabs_signature,
)

router = APIRouter(prefix="/api/voice", tags=["voice"])

_DONE_STATUSES = {LeadStatus.VOICE_COMPLETED, LeadStatus.BOOKED_DEMO}


@router.get("/config")
async def get_config():
    """Get current voice agent configuration (for debugging/display)"""

    return get_voice_agent_config()


async def _find_lead_for_webhook(
    db: AsyncSession,
    conversation_id: str | None,
    lead_id_var: str | None,
) -> Lead | None:
    if conversation_id:
        result = await db.execute(
            select(Lead).where(Lead.voice_conversation_id == conversation_id)
        )
        lead = result.scalar_one_or_none()
        if lead:
            return lead

    if lead_id_var and lead_id_var.isdigit():
        result = await db.execute(select(Lead).where(Lead.id == int(lead_id_var)))
        return result.scalar_one_or_none()

    return None


@router.post("/callback")
async def elevenlabs_post_call_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    ElevenLabs post-call webhook.
    Expects the real ElevenLabs payload and ElevenLabs-Signature HMAC header.
    """

    raw_body = await request.body()
    signature = request.headers.get("elevenlabs-signature")
    secret = active_voice().get("webhook_secret") or ""

    try:
        verify_elevenlabs_signature(raw_body, signature, secret)
        event = parse_elevenlabs_webhook(raw_body)
    except ValueError as exc:
        return JSONResponse(content={"error": str(exc)}, status_code=401)

    event_type = event.get("type")
    if event_type == "post_call_audio":
        return {"status": "ok", "ignored": "post_call_audio"}

    summary, conversation_id, lead_id_var = build_call_summary_from_event(event)
    lead = await _find_lead_for_webhook(db, conversation_id, lead_id_var)

    if not lead:
        await log_action(
            db=db,
            action="voice_callback_orphan",
            actor="elevenlabs",
            details=(
                f"Received {event_type} for unknown lead. "
                f"conversation_id={conversation_id}, lead_id_var={lead_id_var}"
            ),
            blast_radius=BlastRadius.READ_ONLY,
        )
        return {"status": "ok", "warning": "Lead not found"}

    if conversation_id and not lead.voice_conversation_id:
        lead.voice_conversation_id = conversation_id

    meeting_booked = False
    demo_when = None
    demo_notes = None
    if event_type == "post_call_transcription":
        meeting_booked, demo_when, demo_notes = await resolve_demo_booking(event, summary)

    already_done = lead.status in _DONE_STATUSES
    lead.voice_call_completed_at = datetime.utcnow()
    lead.voice_call_summary = summary
    if meeting_booked:
        lead.status = LeadStatus.BOOKED_DEMO
        lead.demo_scheduled_for = demo_when
        lead.demo_booking_notes = demo_notes
    else:
        lead.status = LeadStatus.VOICE_COMPLETED
        # Keep prior booking fields if a later non-booking event arrives.
        if not already_done:
            lead.demo_scheduled_for = None
            lead.demo_booking_notes = None
    await db.commit()

    if not already_done:
        await log_action(
            db=db,
            action="demo_booked" if meeting_booked else "voice_call_completed",
            actor="elevenlabs",
            lead_id=lead.id,
            details=(
                f"Event: {event_type}, conversation_id: {conversation_id}"
                + (f", demo: {demo_when}" if meeting_booked else "")
            ),
            reasoning=summary[:2000],
            blast_radius=BlastRadius.DB_WRITE,
        )

    return {
        "status": "ok",
        "lead_id": lead.id,
        "event_type": event_type,
        "conversation_id": conversation_id,
        "meeting_booked": meeting_booked,
        "demo_scheduled_for": demo_when,
        "lead_status": lead.status.value,
        "idempotent": already_done,
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

Transcript:
agent: Hi {lead.name}, this is Alex from ElevenLabs. Do you have a moment?
user: Sure.
agent: {"Great — I can book a demo for Thursday at 2pm. Does that work?" if meeting_booked else "I can send an overview by email if that helps."}
user: {"Yes, Thursday 2pm works." if meeting_booked else "Yes, please email me."}
""".strip()

    lead.voice_call_completed_at = datetime.utcnow()
    lead.voice_call_summary = simulated_summary
    if meeting_booked:
        lead.status = LeadStatus.BOOKED_DEMO
        lead.demo_scheduled_for = "Thursday 2pm (simulated)"
        lead.demo_booking_notes = "Simulated booking from dashboard"
    else:
        lead.status = LeadStatus.VOICE_COMPLETED
        lead.demo_scheduled_for = None
        lead.demo_booking_notes = None

    await db.commit()

    await log_action(
        db=db,
        action="demo_booked" if meeting_booked else "voice_call_simulated",
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
        "lead_status": lead.status.value,
        "summary": simulated_summary,
    }
