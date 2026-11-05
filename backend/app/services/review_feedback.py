"""Persist human verdicts + optional judge scores for the eval feedback loop."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.database import ReviewFeedbackLog
from ..telemetry import get_trace_id


async def record_human_verdict(
    db: AsyncSession,
    *,
    lead_id: int,
    human_verdict: str,
    actor: str,
    action: str | None = None,
    judge_scores: dict[str, Any] | None = None,
    details: str | None = None,
) -> ReviewFeedbackLog:
    entry = ReviewFeedbackLog(
        lead_id=lead_id,
        trace_id=get_trace_id(),
        judge_scores=json.dumps(judge_scores) if judge_scores else None,
        human_verdict=human_verdict,
        actor=actor,
        action=action,
        details=details,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def list_feedback(
    db: AsyncSession,
    *,
    lead_id: int | None = None,
    limit: int = 100,
) -> list[ReviewFeedbackLog]:
    query = select(ReviewFeedbackLog).order_by(ReviewFeedbackLog.id.desc()).limit(limit)
    if lead_id is not None:
        query = query.where(ReviewFeedbackLog.lead_id == lead_id)
    result = await db.execute(query)
    return list(result.scalars().all())
