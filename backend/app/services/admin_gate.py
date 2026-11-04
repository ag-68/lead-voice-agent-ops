"""Optional demo lock: when ADMIN_KEY is set, mutating APIs require X-Admin-Key."""

from fastapi import Header, HTTPException, Request

from ..config import get_settings


def demo_locked() -> bool:
    return bool((get_settings().admin_key or "").strip())


def demo_status() -> dict:
    settings = get_settings()
    return {
        "locked": demo_locked(),
        "repo_url": (settings.repo_url or "").strip()
        or "https://github.com/ag-68/lead-voice-agent-ops",
    }


async def require_admin(
    request: Request,
    x_admin_key: str | None = Header(default=None, alias="X-Admin-Key"),
) -> None:
    expected = (get_settings().admin_key or "").strip()
    if not expected:
        return
    provided = (x_admin_key or "").strip()
    if provided and provided == expected:
        return
    raise HTTPException(
        status_code=403,
        detail={
            "code": "admin_unlock_required",
            "message": "Demo is view-only. Unlock with the operator admin key to run leads or calls.",
            "repo_url": demo_status()["repo_url"],
        },
    )
