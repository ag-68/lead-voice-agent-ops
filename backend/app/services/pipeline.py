"""Qualify one lead after the HTTP request has already finished.

The request that saved the lead must not hand its database session to this
job. That session is closed as soon as the response is sent. This job opens
its own session, runs the steps, and closes it. If any step fails, a second
session records the failure so the lead cannot stay on "scoring".
"""

import logging

from sqlalchemy import select

from ..models import Lead, LeadStatus
from ..utils.db import AsyncSessionLocal
from .audit import BlastRadius, log_action
from .claude_enrichment import enrich_lead
from .slack_service import send_approval_request
from ..config import get_settings
from ..telemetry import get_trace_id, lead_trace, log_gate_outcome

logger = logging.getLogger(__name__)
settings = get_settings()


async def qualify_lead(lead_id: int) -> None:
    try:
        with lead_trace(lead_id, "qualify_lead"):
            async with AsyncSessionLocal() as db:
                await _qualify(db, lead_id)
    except Exception as exc:
        logger.exception("Qualification failed for lead %s", lead_id)
        await _mark_failed(lead_id, exc)


async def _qualify(db, lead_id: int) -> None:
    lead = await _load(db, lead_id)
    if lead is None:
        return

    lead.status = LeadStatus.SCORING
    await db.commit()
    await log_action(
        db=db,
        action="lead_scoring_started",
        actor="system",
        lead_id=lead.id,
        details=f"Starting lead scoring (trace_id={get_trace_id() or 'n/a'})",
        blast_radius=BlastRadius.READ_ONLY,
    )

    enrichment, reasoning, scorer = await enrich_lead(
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
    lead.status = LeadStatus.SCORED
    await db.commit()

    await log_action(
        db=db,
        action="lead_scored",
        actor=scorer,
        lead_id=lead.id,
        details=f"ICP Score: {enrichment.icp_score}, Tier: {enrichment.tier.value}",
        reasoning=reasoning,
        blast_radius=BlastRadius.DB_WRITE,
    )

    needs_approval = (
        enrichment.is_fortune_500
        or enrichment.icp_score >= settings.icp_criteria["fortune_500_threshold"]
    )
    if needs_approval:
        lead.status = LeadStatus.SELECTED
        await db.commit()
        log_gate_outcome("selected", enrichment.icp_score)
        await log_action(
            db=db,
            action="lead_selected",
            actor="system",
            lead_id=lead.id,
            details=f"Selected for outreach (Fortune 500: {enrichment.is_fortune_500}, Score: {enrichment.icp_score}). Slack is asked to release the voice call.",
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
            await log_action(
                db=db,
                action="slack_approval_failed",
                actor="system",
                lead_id=lead.id,
                details=result,
                blast_radius=BlastRadius.SLACK_POST,
            )
        return

    lead.status = LeadStatus.PARKED
    await db.commit()
    log_gate_outcome("parked", enrichment.icp_score)
    await log_action(
        db=db,
        action="lead_parked",
        actor="system",
        lead_id=lead.id,
        details=f"Under 90 and not Fortune 500 (Score: {enrichment.icp_score}). No Slack, no call.",
        blast_radius=BlastRadius.READ_ONLY,
    )


async def _load(db, lead_id: int) -> Lead | None:
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    return result.scalar_one_or_none()


async def _mark_failed(lead_id: int, exc: Exception) -> None:
    try:
        async with AsyncSessionLocal() as db:
            lead = await _load(db, lead_id)
            if lead is None:
                return
            lead.status = LeadStatus.FAILED
            await db.commit()
            await log_action(
                db=db,
                action="scoring_failed",
                actor="system",
                lead_id=lead.id,
                details=str(exc),
                blast_radius=BlastRadius.READ_ONLY,
            )
    except Exception:
        logger.exception("Could not record failure for lead %s", lead_id)
