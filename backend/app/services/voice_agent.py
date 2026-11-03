import hashlib
import hmac
import json
import time
from datetime import datetime

import httpx

from ..config import get_settings
from ..models import Lead, VoiceCallResult
from .local_keys import active_voice

settings = get_settings()

_WEBHOOK_TOLERANCE_SECS = 30 * 60

VOICE_AGENT_SYSTEM_PROMPT = """You are an AI sales development representative for ElevenLabs, a leading AI voice technology company.

Your role is to:
1. Warmly greet the prospect and introduce yourself
2. Confirm you're speaking with the right person
3. Briefly explain ElevenLabs' value proposition (AI voice generation, text-to-speech, voice cloning)
4. Ask qualifying questions about their use case and needs
5. Answer basic pricing and security questions
6. If interested, offer to schedule a meeting with an account executive

Key talking points:
- ElevenLabs serves millions of users and enterprises like Deutsche Telekom and Meta
- Our platform includes ElevenAgents for customer experience, ElevenCreative for content, and ElevenAPI for developers
- We support 70+ languages with human-like AI voices
- Enterprise-grade security and compliance

Stay professional, helpful, and conversational. Do not pressure the prospect.
If they're not interested, thank them politely and end the call.
"""


def _dial_number(phone: str) -> str:
    digits = phone.strip()
    if digits.startswith("+"):
        return digits
    cleaned = "".join(ch for ch in digits if ch.isdigit())
    return f"+{cleaned}" if cleaned else digits


async def trigger_voice_call(
    lead: Lead,
    scheduled_time: datetime | None = None,
) -> tuple[bool, str, str | None]:
    """
    Trigger an ElevenAgents voice call to the lead.
    Returns (success, message, call_id)
    """

    if not lead.phone:
        return False, "No phone number available for lead", None

    voice = active_voice()
    if voice["api_key"] and not voice["agent_id"]:
        return False, "ElevenLabs key is set, but no voice agent id is set.", None
    if voice["api_key"] and voice["agent_id"] and not voice["phone_number_id"]:
        return False, "ElevenLabs agent is set, but no phone number id is set.", None
    if voice["ready"]:
        to_number = _dial_number(lead.phone)
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
                headers={
                    "xi-api-key": voice["api_key"],
                    "Content-Type": "application/json",
                },
                json={
                    "agent_id": voice["agent_id"],
                    "agent_phone_number_id": voice["phone_number_id"],
                    "to_number": to_number,
                    "conversation_initiation_client_data": {
                        "dynamic_variables": {
                            "lead_id": str(lead.id),
                            "lead_name": lead.name,
                            "company_name": lead.company_name,
                        },
                    },
                },
                timeout=30.0,
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("success") is False:
                    return False, data.get("message") or "ElevenLabs did not start the call.", None
                call_id = data.get("conversation_id") or data.get("callSid")
                return True, "Voice call initiated", call_id
            return False, f"ElevenLabs API error: {response.text}", None

    mock_call_id = f"call_{lead.id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    return True, "Voice call scheduled (MOCK - set ELEVENLABS_API_KEY for real calls)", mock_call_id


def verify_elevenlabs_signature(raw_body: bytes, signature_header: str | None, secret: str) -> None:
    """Validate ElevenLabs-Signature (HMAC-SHA256 over `{t}.{raw_body}`)."""
    if not secret:
        raise ValueError("Post-call webhook secret is not configured.")
    if not signature_header:
        raise ValueError("Missing ElevenLabs-Signature header.")

    parts = [p.strip() for p in signature_header.split(",") if "=" in p]
    timestamp = next((p[2:] for p in parts if p.startswith("t=")), None)
    signatures = [p[3:] for p in parts if p.startswith("v0=")]
    if not timestamp or not signatures:
        raise ValueError("Invalid ElevenLabs-Signature header.")

    try:
        ts = int(timestamp)
    except ValueError as exc:
        raise ValueError("Invalid webhook timestamp.") from exc
    if abs(time.time() - ts) > _WEBHOOK_TOLERANCE_SECS:
        raise ValueError("Webhook timestamp outside tolerance.")

    signed = f"{timestamp}.".encode("utf-8") + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, sig) for sig in signatures):
        raise ValueError("Invalid webhook signature.")


def parse_elevenlabs_webhook(raw_body: bytes) -> dict:
    try:
        event = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Webhook body is not valid JSON.") from exc
    if not isinstance(event, dict) or "type" not in event:
        raise ValueError("Webhook body is missing an event type.")
    return event


def _format_transcript(turns: list | None) -> str:
    if not turns:
        return ""
    lines: list[str] = []
    for turn in turns:
        if not isinstance(turn, dict):
            continue
        role = str(turn.get("role") or "unknown").strip()
        message = turn.get("message")
        if not message:
            continue
        lines.append(f"{role}: {message}")
    return "\n".join(lines)


def _format_data_collection(results: dict | None) -> str:
    if not results or not isinstance(results, dict):
        return ""
    lines: list[str] = []
    for key, raw in results.items():
        if isinstance(raw, dict):
            value = raw.get("value")
            if value is None:
                value = raw.get("data")
            if value is None:
                continue
            lines.append(f"{key}: {value}")
        elif raw is not None and raw != "":
            lines.append(f"{key}: {raw}")
    return "\n".join(lines)


def build_call_summary_from_event(event: dict) -> tuple[str, str | None, str | None]:
    """
    Returns (summary_text, conversation_id, lead_id_from_vars).
    """
    event_type = event.get("type")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    conversation_id = data.get("conversation_id")
    if conversation_id is not None:
        conversation_id = str(conversation_id)

    client_data = data.get("conversation_initiation_client_data") or {}
    dynamic = client_data.get("dynamic_variables") if isinstance(client_data, dict) else {}
    lead_id_var = None
    if isinstance(dynamic, dict) and dynamic.get("lead_id") is not None:
        lead_id_var = str(dynamic.get("lead_id"))

    if event_type == "call_initiation_failure":
        reason = data.get("failure_reason") or "unknown"
        summary = (
            f"Call initiation failed.\n"
            f"Reason: {reason}\n"
            f"Conversation ID: {conversation_id or 'n/a'}"
        )
        return summary, conversation_id, lead_id_var

    if event_type == "post_call_audio":
        summary = (
            f"Post-call audio received.\n"
            f"Conversation ID: {conversation_id or 'n/a'}\n"
            f"(Audio payload is not stored in this app.)"
        )
        return summary, conversation_id, lead_id_var

    # Default: post_call_transcription (and unknown types with similar shape)
    analysis = data.get("analysis") if isinstance(data.get("analysis"), dict) else {}
    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    status = data.get("status") or "unknown"
    duration = metadata.get("call_duration_secs")
    transcript_summary = analysis.get("transcript_summary") or ""
    call_successful = analysis.get("call_successful") or ""
    collected = _format_data_collection(analysis.get("data_collection_results"))
    transcript = _format_transcript(data.get("transcript") if isinstance(data.get("transcript"), list) else None)

    parts = [
        f"Status: {status}",
        f"Duration: {duration}s" if duration is not None else None,
        f"Call successful: {call_successful}" if call_successful else None,
        f"Conversation ID: {conversation_id}" if conversation_id else None,
        "",
        "Summary:",
        transcript_summary or "(no transcript summary)",
    ]
    if collected:
        parts.extend(["", "Collected notes:", collected])
    if transcript:
        parts.extend(["", "Transcript:", transcript])
    summary = "\n".join(p for p in parts if p is not None)
    if len(summary) > 20000:
        summary = summary[:20000] + "\n…(truncated)"
    return summary, conversation_id, lead_id_var


async def process_voice_callback(
    call_id: str,
    transcript: str,
    duration_seconds: int,
    outcome: str,
) -> VoiceCallResult:
    """Legacy helper kept for local tooling / tests."""

    meeting_keywords = ["schedule", "meeting", "calendar", "demo", "call back", "interested"]
    meeting_booked = any(kw in transcript.lower() for kw in meeting_keywords) and "yes" in transcript.lower()

    return VoiceCallResult(
        lead_id=0,
        summary=f"Call completed in {duration_seconds}s. Outcome: {outcome}",
        meeting_booked=meeting_booked,
        meeting_time=None,
        follow_up_required=not meeting_booked and "not interested" not in transcript.lower(),
        notes=f"Transcript length: {len(transcript)} chars",
    )


def get_voice_agent_config() -> dict:
    """Return the current voice agent configuration for debugging/display"""

    return {
        "system_prompt": VOICE_AGENT_SYSTEM_PROMPT,
        "voice_settings": {
            "voice_id": "EXAVITQu4vr4xnSDxMaL",
            "model": "eleven_turbo_v2",
            "stability": 0.5,
            "similarity_boost": 0.75,
        },
        "call_settings": {
            "max_duration_seconds": 300,
            "silence_timeout_seconds": 10,
            "end_call_on_goodbye": True,
        },
        "api_configured": active_voice()["ready"],
    }
