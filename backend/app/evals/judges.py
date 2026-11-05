"""Offline-friendly LLM-as-judge scorers for lead scoring outputs."""

from __future__ import annotations

import json
import re
from typing import Any


def gate_from_score(icp_score: float, is_fortune_500: bool, threshold: float = 90.0) -> str:
    if is_fortune_500 or icp_score >= threshold:
        return "selected"
    return "parked"


def score_gate_accuracy(expected_gate: str, actual_gate: str) -> float:
    return 1.0 if expected_gate == actual_gate else 0.0


def score_groundedness(lead: dict[str, Any], enrichment: dict[str, Any]) -> float:
    """Heuristic groundedness 0–1 without calling a judge model.

    Checks that company/email signals appear in enrichment text and that
    extreme Fortune-500 claims have supporting cues in the lead.
    """
    company = (lead.get("company_name") or "").lower()
    email = (lead.get("email") or "").lower()
    domain_hint = email.split("@")[-1] if "@" in email else ""
    blob = " ".join(
        str(enrichment.get(k) or "")
        for k in (
            "company_domain",
            "company_description",
            "company_industry",
            "icp_reasoning",
        )
    ).lower()

    hits = 0
    checks = 0
    if company:
        checks += 1
        token = re.split(r"[\s,.]+", company)[0]
        if token and token in blob:
            hits += 1
    if domain_hint and domain_hint not in {"gmail.com", "yahoo.com", "outlook.com"}:
        checks += 1
        if domain_hint.split(".")[0] in blob or domain_hint in blob:
            hits += 1
    if enrichment.get("is_fortune_500"):
        checks += 1
        known = ("meta", "telekom", "deutsche", "google", "microsoft", "amazon", "apple")
        if any(k in company for k in known) or any(k in blob for k in known):
            hits += 1
    if checks == 0:
        return 0.5
    return round(hits / checks, 3)


def score_tone_policy(reasoning: str | None) -> float:
    text = (reasoning or "").strip()
    if not text:
        return 0.0
    lowered = text.lower()
    penalties = 0
    for bad in ("guaranteed cure", "definitely will buy", "as an ai", "i hallucinated"):
        if bad in lowered:
            penalties += 1
    length_ok = 20 <= len(text) <= 2000
    base = 0.85 if length_ok else 0.4
    return max(0.0, min(1.0, round(base - 0.25 * penalties, 3)))


def judge_scoring_case(
    lead: dict[str, Any],
    enrichment: dict[str, Any],
    *,
    expected_gate: str,
    threshold: float = 90.0,
) -> dict[str, Any]:
    actual_gate = gate_from_score(
        float(enrichment.get("icp_score") or 0),
        bool(enrichment.get("is_fortune_500")),
        threshold=threshold,
    )
    grounded = score_groundedness(lead, enrichment)
    gate_acc = score_gate_accuracy(expected_gate, actual_gate)
    tone = score_tone_policy(enrichment.get("icp_reasoning"))
    return {
        "groundedness": grounded,
        "gate_accuracy": gate_acc,
        "tone_policy": tone,
        "actual_gate": actual_gate,
        "expected_gate": expected_gate,
        "aggregate": round((grounded + gate_acc + tone) / 3.0, 3),
    }


def parse_judge_json(text: str) -> dict[str, Any]:
    """Parse a judge model JSON blob (used when a live judge LLM is available)."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))
