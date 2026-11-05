"""Detect a booked demo from a post-call payload and extract a when/notes string."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from ..telemetry import llm_span
from .local_keys import active_llm
from .prompt_registry import render_prompt

logger = logging.getLogger(__name__)

_BOOKING_KEY_HINTS = (
    "demo",
    "meeting",
    "schedule",
    "appointment",
    "calendar",
    "book",
    "date",
    "time",
)
_BOOKING_TEXT_HINTS = (
    "demo booked",
    "booked a demo",
    "scheduled a demo",
    "schedule a demo",
    "meeting booked",
    "booked a meeting",
    "calendar invite",
    "see you on",
    "talk on",
)


def _collection_values(results: dict | None) -> list[tuple[str, str]]:
    if not results or not isinstance(results, dict):
        return []
    out: list[tuple[str, str]] = []
    for key, raw in results.items():
        if isinstance(raw, dict):
            value = raw.get("value")
            if value is None:
                value = raw.get("data")
        else:
            value = raw
        if value is None or value == "":
            continue
        out.append((str(key), str(value).strip()))
    return out


def _looks_booked_from_collection(pairs: list[tuple[str, str]]) -> tuple[bool, str | None]:
    for key, value in pairs:
        key_l = key.lower()
        if any(h in key_l for h in _BOOKING_KEY_HINTS) and value.lower() not in {
            "false",
            "no",
            "none",
            "n/a",
            "null",
        }:
            return True, value
    return False, None


def _looks_booked_from_text(*texts: str) -> bool:
    blob = " ".join(t for t in texts if t).lower()
    if not blob:
        return False
    if any(h in blob for h in _BOOKING_TEXT_HINTS):
        return True
    if re.search(r"\b(demo|meeting)\b.{0,40}\b(booked|scheduled|confirmed)\b", blob):
        return True
    if re.search(r"\b(booked|scheduled|confirmed)\b.{0,40}\b(demo|meeting)\b", blob):
        return True
    return False


async def _llm_extract_demo(summary: str) -> tuple[bool | None, str | None, str | None]:
    """Ask the scoring model for a structured booking read. None fields mean unknown."""
    setup = active_llm()
    if setup is None:
        return None, None, None

    prompt_meta = render_prompt("demo_extract", summary=summary[:12000])
    prompt = prompt_meta["rendered"]
    provider = setup["provider"]
    with llm_span(
        "demo_extract",
        attrs={
            "prompt_template_version": prompt_meta["version"],
            "prompt_hash": prompt_meta["prompt_hash"],
            "model_name": setup.get("model"),
            "provider": provider,
        },
    ):
        try:
            async with httpx.AsyncClient(timeout=40) as client:
                if provider in ("openai", "groq", "openai_compatible"):
                    response = await client.post(
                        f"{setup['base_url']}/chat/completions",
                        headers={
                            "authorization": f"Bearer {setup['api_key']}",
                            "content-type": "application/json",
                        },
                        json={
                            "model": setup["model"],
                            "messages": [{"role": "user", "content": prompt}],
                            "response_format": {"type": "json_object"},
                        },
                    )
                    if response.status_code != 200:
                        return None, None, None
                    content = response.json()["choices"][0]["message"]["content"]
                    data = json.loads(content)
                elif provider == "anthropic":
                    response = await client.post(
                        "https://api.anthropic.com/v1/messages",
                        headers={
                            "x-api-key": setup["api_key"],
                            "anthropic-version": "2023-06-01",
                            "content-type": "application/json",
                        },
                        json={
                            "model": setup["model"],
                            "max_tokens": 400,
                            "messages": [
                                {"role": "user", "content": prompt + "\nReply with JSON only."}
                            ],
                        },
                    )
                    if response.status_code != 200:
                        return None, None, None
                    blocks = response.json().get("content", [])
                    text = next((b.get("text") for b in blocks if b.get("type") == "text"), "")
                    data = json.loads(text)
                else:
                    return None, None, None
        except Exception as exc:
            logger.warning("Demo extraction LLM failed: %s", exc)
            return None, None, None

    if not isinstance(data, dict):
        return None, None, None
    booked = data.get("meeting_booked")
    when = data.get("demo_scheduled_for")
    notes = data.get("notes")
    return (
        bool(booked) if isinstance(booked, bool) else None,
        str(when).strip() if when else None,
        str(notes).strip() if notes else None,
    )


async def resolve_demo_booking(event: dict, summary: str) -> tuple[bool, str | None, str | None]:
    """
    Returns (meeting_booked, demo_scheduled_for, notes).
    Uses ElevenLabs collected fields first, then text hints, then optional LLM.
    """
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    analysis = data.get("analysis") if isinstance(data.get("analysis"), dict) else {}
    pairs = _collection_values(analysis.get("data_collection_results"))
    collected_booked, collected_when = _looks_booked_from_collection(pairs)
    transcript_summary = str(analysis.get("transcript_summary") or "")
    text_booked = _looks_booked_from_text(summary, transcript_summary)

    meeting_booked = collected_booked or text_booked
    demo_when = collected_when
    notes = None
    if pairs:
        notes = "; ".join(f"{k}: {v}" for k, v in pairs[:12])

    llm_booked, llm_when, llm_notes = await _llm_extract_demo(summary)
    if llm_booked is True:
        meeting_booked = True
    elif llm_booked is False and not collected_booked:
        # Trust explicit LLM "no" only when collection did not already claim a booking.
        meeting_booked = False if not text_booked else meeting_booked
    if llm_when:
        demo_when = llm_when
    if llm_notes:
        notes = llm_notes if not notes else f"{notes}. {llm_notes}"

    if meeting_booked and not demo_when:
        demo_when = "Time not extracted — check transcript"
    return meeting_booked, demo_when, notes
