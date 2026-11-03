from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean, Enum as SQLEnum, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

Base = declarative_base()


class LeadStatus(str, enum.Enum):
    RECEIVED = "received"
    SCORING = "scoring"
    SCORED = "scored"
    PENDING_APPROVAL = "pending_approval"
    SELECTED = "selected"
    PARKED = "parked"
    APPROVED = "approved"
    REJECTED = "rejected"
    VOICE_SCHEDULED = "voice_scheduled"
    VOICE_COMPLETED = "voice_completed"
    BOOKED_DEMO = "booked_demo"
    CLAIMED_MANUALLY = "claimed_manually"
    FAILED = "failed"


class LeadTier(str, enum.Enum):
    FORTUNE_500 = "fortune_500"
    ENTERPRISE = "enterprise"
    MID_MARKET = "mid_market"
    SMB = "smb"
    UNQUALIFIED = "unqualified"


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    
    email = Column(String(255), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    company_name = Column(String(255), nullable=False)
    job_title = Column(String(255))
    phone = Column(String(50))
    message = Column(Text)
    
    company_domain = Column(String(255))
    company_industry = Column(String(100))
    company_size = Column(String(50))
    company_employees = Column(Integer)
    company_revenue = Column(Float)
    company_region = Column(String(100))
    company_description = Column(Text)
    is_fortune_500 = Column(Boolean, default=False)
    
    icp_score = Column(Float, default=0.0)
    icp_reasoning = Column(Text)
    tier = Column(SQLEnum(LeadTier), default=LeadTier.UNQUALIFIED)
    
    status = Column(SQLEnum(LeadStatus), default=LeadStatus.RECEIVED)
    slack_message_ts = Column(String(50))
    slack_channel_id = Column(String(50))
    
    voice_call_scheduled_at = Column(DateTime)
    voice_call_completed_at = Column(DateTime)
    voice_call_summary = Column(Text)
    voice_conversation_id = Column(String(255), index=True)
    demo_scheduled_for = Column(String(255))
    demo_booking_notes = Column(Text)
    
    assigned_to = Column(String(255))
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    audit_logs = relationship("AuditLog", back_populates="lead")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=True)
    
    action = Column(String(100), nullable=False)
    actor = Column(String(255), nullable=False)  # "system", "claude", "slack:user_id", etc.
    details = Column(Text)
    reasoning = Column(Text)  # Claude's reasoning chain
    
    blast_radius = Column(String(50))  # "read_only", "crm_write", "voice_trigger", "external_api"
    requires_approval = Column(Boolean, default=False)
    approved_by = Column(String(255))
    approved_at = Column(DateTime)
    
    created_at = Column(DateTime, default=datetime.utcnow)

    lead = relationship("Lead", back_populates="audit_logs")


class ClientPreference(Base):
    __tablename__ = "client_preferences"

    id = Column(Integer, primary_key=True)
    sectors = Column(Text, nullable=False)
    regions = Column(Text, nullable=False)
    employee_bands = Column(Text, nullable=False)
    services = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SlackApprovalToken(Base):
    __tablename__ = "slack_approval_tokens"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False)
    token = Column(String(64), nullable=False, unique=True, index=True)
    action = Column(String(50), nullable=False)  # "approve_voice", "claim_manually"
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
