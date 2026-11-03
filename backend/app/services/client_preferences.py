"""Ideal-client choices sent to the model in place of a fixed sentence.

One row in SQLite. The first read stores the choices that used to be
written into the scoring prompt, so existing scores stay on the same rule
until someone edits this page.
"""

import json

from sqlalchemy import select

from ..models.database import ClientPreference
from ..utils.db import AsyncSessionLocal

SECTOR_OPTIONS = [
    "technology",
    "finance",
    "healthcare",
    "media",
    "telecommunications",
    "automotive",
    "energy",
    "retail",
    "manufacturing",
]

REGION_OPTIONS = [
    {"id": "north_america", "label": "North America"},
    {"id": "europe", "label": "Europe"},
    {"id": "apac", "label": "Asia Pacific"},
    {"id": "latam", "label": "Latin America"},
    {"id": "other", "label": "Other"},
]

EMPLOYEE_OPTIONS = [
    {"id": "10000_or_more", "label": "10,000 or more"},
    {"id": "1000_or_more", "label": "1,000 or more"},
    {"id": "100_or_more", "label": "100 or more"},
    {"id": "100_999", "label": "100–999"},
    {"id": "50_99", "label": "50–99"},
    {"id": "under_50", "label": "Under 50"},
]

SERVICE_OPTIONS = [
    "voice or audio tools",
    "voice agents",
    "text-to-speech",
    "voice cloning",
    "call-center automation",
]

_DEFAULTS = {
    "sectors": ["technology", "finance", "healthcare", "media", "telecommunications"],
    "regions": ["north_america", "europe", "apac"],
    "employee_bands": ["100_or_more"],
    "services": ["voice or audio tools"],
}

_REGION_IDS = {item["id"] for item in REGION_OPTIONS}
_EMPLOYEE_IDS = {item["id"] for item in EMPLOYEE_OPTIONS}
_REGION_LABELS = {item["id"]: item["label"] for item in REGION_OPTIONS}
_EMPLOYEE_LABELS = {item["id"]: item["label"] for item in EMPLOYEE_OPTIONS}

_MAX_ITEMS = 20
_MAX_CHARS = 40


class PreferenceError(ValueError):
    pass


def options() -> dict:
    return {
        "sectors": SECTOR_OPTIONS,
        "regions": REGION_OPTIONS,
        "employee_bands": EMPLOYEE_OPTIONS,
        "services": SERVICE_OPTIONS,
    }


def ideal_client_block(prefs: dict) -> str:
    return (
        "Ideal client:\n"
        f"- Sectors: {_join(prefs.get('sectors', []))}\n"
        f"- Regions: {_join(_REGION_LABELS.get(item, item) for item in prefs.get('regions', []))}\n"
        f"- Employees: {_join(_EMPLOYEE_LABELS.get(item, item) for item in prefs.get('employee_bands', []))}\n"
        f"- Likely needs: {_join(prefs.get('services', []))}\n"
        "Score a lead higher when the company matches this ideal client."
    )


def clean_preferences(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise PreferenceError("Client preferences must be an object.")
    return {
        "sectors": _clean_text_list(payload.get("sectors"), "sectors"),
        "regions": _clean_id_list(payload.get("regions"), "regions", _REGION_IDS),
        "employee_bands": _clean_id_list(payload.get("employee_bands"), "employee bands", _EMPLOYEE_IDS),
        "services": _clean_text_list(payload.get("services"), "services"),
    }


async def load_preferences() -> dict:
    try:
        async with AsyncSessionLocal() as db:
            row = await _row(db)
            return _from_row(row)
    except Exception:
        return dict(_DEFAULTS)


async def save_preferences(payload: dict) -> dict:
    cleaned = clean_preferences(payload)
    async with AsyncSessionLocal() as db:
        row = await _row(db)
        row.sectors = json.dumps(cleaned["sectors"])
        row.regions = json.dumps(cleaned["regions"])
        row.employee_bands = json.dumps(cleaned["employee_bands"])
        row.services = json.dumps(cleaned["services"])
        await db.commit()
        await db.refresh(row)
        return _public(_from_row(row))


async def read_preferences() -> dict:
    async with AsyncSessionLocal() as db:
        row = await _row(db)
        return _public(_from_row(row))


async def _row(db) -> ClientPreference:
    result = await db.execute(select(ClientPreference).where(ClientPreference.id == 1))
    row = result.scalar_one_or_none()
    if row is not None:
        return row
    row = ClientPreference(
        id=1,
        sectors=json.dumps(_DEFAULTS["sectors"]),
        regions=json.dumps(_DEFAULTS["regions"]),
        employee_bands=json.dumps(_DEFAULTS["employee_bands"]),
        services=json.dumps(_DEFAULTS["services"]),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


def _public(prefs: dict) -> dict:
    return {**prefs, "options": options(), "prompt_block": ideal_client_block(prefs)}


def _from_row(row: ClientPreference) -> dict:
    return {
        "sectors": _loads(row.sectors),
        "regions": _loads(row.regions),
        "employee_bands": _loads(row.employee_bands),
        "services": _loads(row.services),
    }


def _loads(raw: str) -> list[str]:
    try:
        data = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return []
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, str) and item.strip()]


def _clean_text_list(value, name: str) -> list[str]:
    items = _as_list(value, name)
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in items:
        text = " ".join(item.split())
        if not text:
            continue
        if len(text) > _MAX_CHARS:
            raise PreferenceError(f"Each {name[:-1] if name.endswith('s') else name} must be {_MAX_CHARS} characters or fewer.")
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(text)
    if len(cleaned) > _MAX_ITEMS:
        raise PreferenceError(f"Choose at most {_MAX_ITEMS} {name}.")
    return cleaned


def _clean_id_list(value, name: str, allowed: set[str]) -> list[str]:
    items = _as_list(value, name)
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in items:
        text = item.strip()
        if text not in allowed:
            raise PreferenceError(f"Choose {name} from the list.")
        if text in seen:
            continue
        seen.add(text)
        cleaned.append(text)
    return cleaned


def _as_list(value, name: str) -> list[str]:
    if not isinstance(value, list):
        raise PreferenceError(f"{name} must be a list.")
    if not all(isinstance(item, str) for item in value):
        raise PreferenceError(f"{name} must be text.")
    return value


def _join(items) -> str:
    values = [item.strip() for item in items if isinstance(item, str) and item.strip()]
    return ", ".join(values) if values else "any"
