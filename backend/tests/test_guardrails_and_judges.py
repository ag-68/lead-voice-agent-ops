"""Smoke tests for guardrails and offline judges (no live LLM required)."""

import pytest
from fastapi import HTTPException

from app.evals.judges import (
    gate_from_score,
    judge_scoring_case,
    parse_judge_json,
    score_gate_accuracy,
    score_groundedness,
    score_tone_policy,
)
from app.guardrails import DecideGuard, LeadIntakeGuard, assert_voice_dial_allowed, validate_decide_action
from app.models import Lead, LeadStatus
from app.services.prompt_registry import load_prompt, prompt_hash, render_prompt


def test_lead_intake_rejects_bad_phone():
    with pytest.raises(Exception):
        LeadIntakeGuard(
            name="A",
            email="a@meta.com",
            company_name="Meta",
            phone="abc",
        )


def test_lead_intake_accepts_valid():
    g = LeadIntakeGuard(
        name="Sarah",
        email="sarah@meta.com",
        company_name="Meta",
        phone="+1-555-0100",
    )
    assert g.company_name == "Meta"


def test_decide_action_guard():
    assert validate_decide_action("call") == "call"
    with pytest.raises(HTTPException):
        validate_decide_action("explode")


def test_voice_dial_guard_blocks_parked():
    lead = Lead(
        id=1,
        email="a@b.com",
        name="A",
        company_name="B",
        phone="+15550100",
        status=LeadStatus.PARKED,
    )
    with pytest.raises(HTTPException):
        assert_voice_dial_allowed(lead)


def test_voice_dial_guard_allows_selected_with_phone():
    lead = Lead(
        id=1,
        email="a@b.com",
        name="A",
        company_name="B",
        phone="+15550100",
        status=LeadStatus.SELECTED,
    )
    assert_voice_dial_allowed(lead)


def test_judges_gate_and_groundedness():
    assert gate_from_score(95, False) == "selected"
    assert gate_from_score(40, False) == "parked"
    assert score_gate_accuracy("selected", "selected") == 1.0
    lead = {"company_name": "Meta", "email": "a@meta.com"}
    enrichment = {
        "company_domain": "meta.com",
        "company_description": "Meta Platforms",
        "company_industry": "technology",
        "icp_reasoning": "Large tech enterprise matching ICP.",
        "is_fortune_500": True,
        "icp_score": 92,
    }
    g = score_groundedness(lead, enrichment)
    assert g >= 0.5
    tone = score_tone_policy(enrichment["icp_reasoning"])
    assert tone >= 0.5
    judged = judge_scoring_case(lead, enrichment, expected_gate="selected")
    assert judged["gate_accuracy"] == 1.0


def test_parse_judge_json():
    assert parse_judge_json('{"groundedness": 0.9}')["groundedness"] == 0.9


def test_prompt_registry_loads_v1():
    loaded = load_prompt("lead_scoring")
    assert loaded["version"] == "v1"
    assert len(loaded["prompt_hash"]) == 16
    rendered = render_prompt(
        "lead_scoring",
        name="A",
        email="a@b.com",
        company_name="Co",
        job_title="X",
        message="Y",
        ideal_client="Ideal: tech",
    )
    assert "Ideal: tech" in rendered["rendered"]
    assert prompt_hash(rendered["rendered"]) == rendered["prompt_hash"]
