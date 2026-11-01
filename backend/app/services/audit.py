from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from ..models import AuditLog, Lead


class BlastRadius:
    """Blast radius categories for audit logging"""
    READ_ONLY = "read_only"      # No external effects
    DB_WRITE = "db_write"        # Internal database changes
    CRM_WRITE = "crm_write"      # External CRM updates
    SLACK_POST = "slack_post"    # Slack notifications
    VOICE_TRIGGER = "voice_trigger"  # Voice call initiation
    EXTERNAL_API = "external_api"    # Other external API calls


async def log_action(
    db: AsyncSession,
    action: str,
    actor: str,
    lead_id: int | None = None,
    details: str | None = None,
    reasoning: str | None = None,
    blast_radius: str = BlastRadius.READ_ONLY,
    requires_approval: bool = False,
    approved_by: str | None = None,
) -> AuditLog:
    """
    Create an immutable audit log entry.
    
    This is a core guardrail - every significant action is logged with:
    - WHO: The actor (system, claude, slack:user_id, api:key_hash)
    - WHAT: The action and details
    - WHY: Claude's reasoning chain (when AI-driven)
    - SCOPE: The blast radius of the action
    - APPROVAL: Whether human approval was required/given
    """
    
    log_entry = AuditLog(
        lead_id=lead_id,
        action=action,
        actor=actor,
        details=details,
        reasoning=reasoning,
        blast_radius=blast_radius,
        requires_approval=requires_approval,
        approved_by=approved_by,
        approved_at=datetime.utcnow() if approved_by else None,
    )
    
    db.add(log_entry)
    await db.commit()
    await db.refresh(log_entry)
    
    return log_entry


async def get_lead_audit_trail(
    db: AsyncSession,
    lead_id: int,
) -> list[AuditLog]:
    """Get complete audit trail for a lead"""
    
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.lead_id == lead_id)
        .order_by(AuditLog.created_at.asc())
    )
    return result.scalars().all()


async def get_recent_high_risk_actions(
    db: AsyncSession,
    limit: int = 50,
) -> list[AuditLog]:
    """Get recent high-risk actions (voice triggers, external APIs)"""
    
    high_risk = [BlastRadius.VOICE_TRIGGER, BlastRadius.EXTERNAL_API, BlastRadius.CRM_WRITE]
    
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.blast_radius.in_(high_risk))
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


async def get_audit_stats(db: AsyncSession) -> dict:
    """Get audit statistics for dashboard"""
    
    result = await db.execute(
        select(
            AuditLog.blast_radius,
            func.count(AuditLog.id).label("count")
        )
        .group_by(AuditLog.blast_radius)
    )
    by_blast_radius = {row.blast_radius: row.count for row in result}
    
    result = await db.execute(
        select(func.count(AuditLog.id))
        .where(AuditLog.requires_approval == True)
    )
    requiring_approval = result.scalar() or 0
    
    result = await db.execute(
        select(func.count(AuditLog.id))
        .where(AuditLog.approved_by.isnot(None))
    )
    approved = result.scalar() or 0
    
    return {
        "by_blast_radius": by_blast_radius,
        "requiring_approval": requiring_approval,
        "approved": approved,
        "approval_rate": approved / requiring_approval if requiring_approval > 0 else 0,
    }
