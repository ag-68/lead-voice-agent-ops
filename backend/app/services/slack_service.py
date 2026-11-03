import httpx
import logging
import secrets
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..models import Lead, SlackApprovalToken
from .local_keys import active_slack

logger = logging.getLogger(__name__)


def _build_approval_message(lead: Lead, approve_token: str, claim_token: str) -> dict:
    """Build Slack Block Kit message with approval buttons"""

    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f"How to call {lead.name}?",
                "emoji": True
            }
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Contact:*\n{lead.name}"},
                {"type": "mrkdwn", "text": f"*Company:*\n{lead.company_name}"},
                {"type": "mrkdwn", "text": f"*Email:*\n{lead.email}"},
                {"type": "mrkdwn", "text": f"*Title:*\n{lead.job_title or 'N/A'}"},
            ]
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Industry:*\n{lead.company_industry or 'Unknown'}"},
                {"type": "mrkdwn", "text": f"*Size:*\n{lead.company_employees or 'Unknown'} employees"},
                {"type": "mrkdwn", "text": f"*Tier:*\n{lead.tier.value.replace('_', ' ').title()}"},
                {"type": "mrkdwn", "text": f"*ICP Score:*\n{lead.icp_score:.0f}/100"},
            ]
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*AI Analysis:*\n>{lead.icp_reasoning}"
            }
        },
        {
            "type": "divider"
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"How to call {lead.name}? Nothing is dialed until a person chooses."
                }
            ]
        },
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Voice Agent", "emoji": True},
                    "style": "primary",
                    "action_id": "approve_voice_call",
                    "value": approve_token
                },
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Myself", "emoji": True},
                    "action_id": "claim_manually",
                    "value": claim_token
                },
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Remove", "emoji": True},
                    "style": "danger",
                    "action_id": "reject_lead",
                    "value": approve_token
                }
            ]
        }
    ]

    return {
        "text": f"How to call {lead.name}? {lead.company_name}",
        "blocks": blocks,
    }


async def send_approval_request(
    db: AsyncSession,
    lead: Lead,
) -> tuple[bool, str]:
    """
    Send Slack message with approval buttons for high-value leads.
    Returns (success, message_ts or error)
    """
    
    approve_token = secrets.token_urlsafe(32)
    claim_token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=24)
    
    approve_token_record = SlackApprovalToken(
        lead_id=lead.id,
        token=approve_token,
        action="approve_voice",
        expires_at=expires_at,
    )
    claim_token_record = SlackApprovalToken(
        lead_id=lead.id,
        token=claim_token,
        action="claim_manually",
        expires_at=expires_at,
    )
    
    db.add(approve_token_record)
    db.add(claim_token_record)
    await db.commit()
    
    message = _build_approval_message(lead, approve_token, claim_token)
    webhook_url = (active_slack().get("webhook_url") or "").strip()

    if not webhook_url:
        logger.warning("Slack webhook not set; skipping real post for lead %s", lead.id)
        return True, f"mock_ts_{lead.id}"

    async with httpx.AsyncClient() as client:
        response = await client.post(
            webhook_url,
            json=message,
            timeout=10.0,
        )

        if response.status_code == 200:
            return True, response.text

        error = f"Slack API error: {response.status_code} - {response.text}"
        logger.error("Slack approval post failed for lead %s: %s", lead.id, error)
        return False, error


async def update_approval_message(
    lead: Lead,
    action: str,
    user_name: str,
) -> bool:
    """Update Slack message after approval/rejection"""

    if not (active_slack().get("webhook_url") or "").strip():
        return True

    status_text = {
        "approve_voice": f"Voice Agent chosen by {user_name} — call scheduled",
        "claim_manually": f"Myself — claimed by {user_name} for manual outreach",
        "reject": f"Removed by {user_name}",
    }

    _ = {
        "text": status_text.get(action, "Status updated"),
        "blocks": [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Lead: {lead.name} ({lead.company_name})*\n{status_text.get(action, 'Status updated')}"
                }
            }
        ]
    }

    return True


async def validate_approval_token(
    db: AsyncSession,
    token: str,
) -> tuple[SlackApprovalToken | None, str]:
    """Validate a Slack approval token"""
    
    result = await db.execute(
        select(SlackApprovalToken).where(SlackApprovalToken.token == token)
    )
    token_record = result.scalar_one_or_none()
    
    if not token_record:
        return None, "Invalid token"
    
    if token_record.used:
        return None, "Token already used"
    
    if token_record.expires_at < datetime.utcnow():
        return None, "Token expired"
    
    return token_record, ""
