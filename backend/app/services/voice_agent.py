import httpx
from datetime import datetime
from ..config import get_settings
from ..models import Lead, VoiceCallResult

settings = get_settings()

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


async def trigger_voice_call(
    lead: Lead,
    scheduled_time: datetime | None = None,
) -> tuple[bool, str, str | None]:
    """
    Trigger an ElevenAgents voice call to the lead.
    Returns (success, message, call_id)
    
    In production, this would integrate with ElevenLabs Conversational AI API.
    For this demo, we simulate the trigger and show the integration pattern.
    """
    
    if not lead.phone:
        return False, "No phone number available for lead", None
    
    call_config = {
        "lead_id": lead.id,
        "phone_number": lead.phone,
        "contact_name": lead.name,
        "company_name": lead.company_name,
        "company_industry": lead.company_industry,
        "icp_score": lead.icp_score,
        "scheduled_time": scheduled_time.isoformat() if scheduled_time else None,
        "agent_config": {
            "system_prompt": VOICE_AGENT_SYSTEM_PROMPT,
            "voice_id": "EXAVITQu4vr4xnSDxMaL",  # Rachel voice
            "model_id": "eleven_turbo_v2",
            "first_message": f"Hi, is this {lead.name}? This is Alex calling from ElevenLabs.",
            "max_duration_seconds": 300,
        },
        "callbacks": {
            "on_complete": f"{settings.base_url}/api/voice/callback",
            "on_transcript": f"{settings.base_url}/api/voice/transcript",
        }
    }
    
    if settings.elevenlabs_api_key:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.elevenlabs.io/v1/convai/conversation",
                headers={
                    "xi-api-key": settings.elevenlabs_api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "agent_id": "your-agent-id",
                    "first_message": call_config["agent_config"]["first_message"],
                    "variables": {
                        "lead_name": lead.name,
                        "company_name": lead.company_name,
                    }
                },
                timeout=30.0,
            )
            
            if response.status_code == 200:
                data = response.json()
                return True, "Voice call initiated", data.get("conversation_id")
            else:
                return False, f"ElevenLabs API error: {response.text}", None
    
    mock_call_id = f"call_{lead.id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    return True, f"Voice call scheduled (MOCK - set ELEVENLABS_API_KEY for real calls)", mock_call_id


async def process_voice_callback(
    call_id: str,
    transcript: str,
    duration_seconds: int,
    outcome: str,
) -> VoiceCallResult:
    """
    Process the callback from a completed voice call.
    In production, this would parse the actual ElevenAgents callback.
    """
    
    meeting_keywords = ["schedule", "meeting", "calendar", "demo", "call back", "interested"]
    meeting_booked = any(kw in transcript.lower() for kw in meeting_keywords) and "yes" in transcript.lower()
    
    return VoiceCallResult(
        lead_id=0,  # Will be set by caller
        summary=f"Call completed in {duration_seconds}s. Outcome: {outcome}",
        meeting_booked=meeting_booked,
        meeting_time=None,
        follow_up_required=not meeting_booked and "not interested" not in transcript.lower(),
        notes=f"Transcript length: {len(transcript)} chars"
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
        "api_configured": bool(settings.elevenlabs_api_key),
    }
