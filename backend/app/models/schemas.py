from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from .database import LeadStatus, LeadTier


class LeadCreate(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=1, max_length=255)
    company_name: str = Field(..., min_length=1, max_length=255)
    job_title: Optional[str] = None
    phone: Optional[str] = None
    message: Optional[str] = None


class LeadEnrichment(BaseModel):
    company_domain: Optional[str] = None
    company_industry: Optional[str] = None
    company_size: Optional[str] = None
    company_employees: Optional[int] = None
    company_revenue: Optional[float] = None
    company_region: Optional[str] = None
    company_description: Optional[str] = None
    is_fortune_500: bool = False
    
    icp_score: float = 0.0
    icp_reasoning: str = ""
    tier: LeadTier = LeadTier.UNQUALIFIED


class LeadResponse(BaseModel):
    id: int
    email: str
    name: str
    company_name: str
    job_title: Optional[str]
    phone: Optional[str]
    message: Optional[str]
    
    company_domain: Optional[str]
    company_industry: Optional[str]
    company_size: Optional[str]
    company_employees: Optional[int]
    company_revenue: Optional[float]
    company_region: Optional[str]
    company_description: Optional[str]
    is_fortune_500: bool
    
    icp_score: float
    icp_reasoning: Optional[str]
    tier: Optional[LeadTier]
    status: LeadStatus
    
    assigned_to: Optional[str]
    voice_call_scheduled_at: Optional[datetime]
    voice_call_completed_at: Optional[datetime]
    voice_call_summary: Optional[str]
    voice_conversation_id: Optional[str] = None
    demo_scheduled_for: Optional[str] = None
    demo_booking_notes: Optional[str] = None
    
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AuditLogResponse(BaseModel):
    id: int
    lead_id: Optional[int]
    action: str
    actor: str
    details: Optional[str]
    reasoning: Optional[str]
    blast_radius: Optional[str]
    requires_approval: bool
    approved_by: Optional[str]
    approved_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class SlackApprovalAction(BaseModel):
    token: str
    action: str  # "approve_voice" or "claim_manually"
    user_id: str
    user_name: str


class PipelineStats(BaseModel):
    total_leads: int
    leads_by_status: dict
    leads_by_tier: dict
    avg_icp_score: float
    approval_rate: float
    voice_calls_scheduled: int
    voice_calls_completed: int
    demos_booked: int = 0


class VoiceCallRequest(BaseModel):
    lead_id: int
    scheduled_time: Optional[datetime] = None


class VoiceCallResult(BaseModel):
    lead_id: int
    summary: str
    meeting_booked: bool
    meeting_time: Optional[datetime] = None
    follow_up_required: bool
    notes: Optional[str] = None
