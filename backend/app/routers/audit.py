from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from ..utils.db import get_db
from ..models import AuditLogResponse
from ..services import get_lead_audit_trail, get_recent_high_risk_actions, get_audit_stats

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("/lead/{lead_id}", response_model=List[AuditLogResponse])
async def get_lead_audit(
    lead_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get complete audit trail for a specific lead"""
    
    logs = await get_lead_audit_trail(db, lead_id)
    return logs


@router.get("/high-risk", response_model=List[AuditLogResponse])
async def get_high_risk_actions(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """Get recent high-risk actions (voice triggers, external APIs)"""
    
    logs = await get_recent_high_risk_actions(db, limit)
    return logs


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Get audit statistics for dashboard"""
    
    stats = await get_audit_stats(db)
    return stats
