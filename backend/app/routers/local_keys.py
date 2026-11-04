"""Accept model and voice keys from the local page only.

Keys stay in this process. A remote computer cannot submit them.
"""

from fastapi import APIRouter, Body, HTTPException, Request

from ..services.local_keys import (
    ai_status,
    clear_llm,
    clear_slack,
    clear_voice,
    save_llm,
    save_slack,
    save_voice,
)

router = APIRouter(prefix="/api/local-keys", tags=["local-keys"])

_LOOPBACK = {"127.0.0.1", "::1", "localhost"}


def _require_this_computer(request: Request) -> None:
    host = request.client.host if request.client else ""
    if host not in _LOOPBACK:
        raise HTTPException(
            status_code=403,
            detail="Keys can only be entered from the computer running this app.",
        )


def _optional_text(payload: dict, name: str) -> str | None:
    value = payload.get(name)
    if value is None:
        return None
    if not isinstance(value, str):
        raise HTTPException(status_code=400, detail=f"{name} must be text.")
    return value


@router.get("/")
async def get_ai_status():
    # Read-only chip status (booleans/labels only — no secret values). Allowed remotely
    # so a Cloud Run demo can show env-backed Model / Voice / Slack as configured.
    return ai_status()


@router.post("/llm")
async def save_llm_setup(request: Request, payload: dict = Body(...)):
    _require_this_computer(request)
    provider = payload.get("provider")
    if not isinstance(provider, str) or not provider.strip():
        raise HTTPException(status_code=400, detail="Choose a model provider.")
    try:
        return save_llm(
            provider.strip(),
            _optional_text(payload, "api_key"),
            _optional_text(payload, "model"),
            _optional_text(payload, "base_url"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/llm")
async def forget_llm_setup(request: Request):
    _require_this_computer(request)
    return clear_llm()


@router.post("/voice")
async def save_voice_setup(request: Request, payload: dict = Body(...)):
    _require_this_computer(request)
    return save_voice(
        _optional_text(payload, "api_key"),
        _optional_text(payload, "agent_id"),
        _optional_text(payload, "phone_number_id"),
        _optional_text(payload, "webhook_secret"),
    )


@router.delete("/voice")
async def forget_voice_setup(request: Request):
    _require_this_computer(request)
    return clear_voice()


@router.post("/slack")
async def save_slack_setup(request: Request, payload: dict = Body(...)):
    _require_this_computer(request)
    try:
        return save_slack(
            _optional_text(payload, "webhook_url"),
            _optional_text(payload, "signing_secret"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/slack")
async def forget_slack_setup(request: Request):
    _require_this_computer(request)
    return clear_slack()
