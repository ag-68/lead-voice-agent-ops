"""Deterministic pre-execution guardrails for high-stakes actions."""

from __future__ import annotations

import re
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, EmailStr, Field, field_validator

from .models import Lead, LeadStatus

DecideAction = Literal["call", "claim", "reject"]

_PHONE_RE = re.compile(r"^\+?[0-9][0-9\s\-().]{6,24}$")
_EMAIL_DOMAIN_BLOCK = {"example.com", "test.local", "invalid"}


class LeadIntakeGuard(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    company_name: str = Field(min_length=1, max_length=255)
    job_title: str | None = None
    phone: str | None = None
    message: str | None = None

    @field_validator("phone")
    @classmethod
    def phone_format(cls, value: str | None) -> str | None:
        if value is None or not str(value).strip():
            return None
        cleaned = str(value).strip()
        if not _PHONE_RE.match(cleaned):
            raise ValueError("Phone must look like an international number.")
        return cleaned

    @field_validator("email")
    @classmethod
    def email_domain(cls, value: EmailStr) -> EmailStr:
        domain = str(value).rsplit("@", 1)[-1].lower()
        if domain in _EMAIL_DOMAIN_BLOCK:
            raise ValueError("Email domain is not allowed for intake.")
        return value


class DecideGuard(BaseModel):
    action: DecideAction


def validate_lead_intake(payload: dict) -> LeadIntakeGuard:
    try:
        return LeadIntakeGuard.model_validate(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Intake guardrail: {exc}") from exc


def validate_decide_action(action: str | None) -> DecideAction:
    try:
        return DecideGuard(action=action).action  # type: ignore[arg-type]
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="Choose call, claim, or reject.",
        ) from exc


def assert_voice_dial_allowed(lead: Lead) -> None:
    """Outbound voice is high blast-radius: only Selected (or already approved) leads."""
    allowed = {
        LeadStatus.SELECTED,
        LeadStatus.PENDING_APPROVAL,
        LeadStatus.APPROVED,
    }
    if lead.status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Voice dial blocked by blast-radius guardrail: lead status is "
                f"{lead.status.value}. Only Selected leads may be dialed after HITL."
            ),
        )
    if not lead.phone or not str(lead.phone).strip():
        raise HTTPException(
            status_code=400,
            detail="Voice dial blocked: phone number is required.",
        )


def assert_slack_signature_configured(signing_secret: str | None) -> None:
    if not (signing_secret or "").strip():
        # Local demos may skip Slack crypto; call sites still verify when secret is set.
        return
