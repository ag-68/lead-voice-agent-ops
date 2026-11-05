"""Versioned prompt templates loaded from YAML on disk."""

from __future__ import annotations

import hashlib
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

from ..config import get_settings

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_ROOT_DIR = _BACKEND_DIR.parent
_PROMPTS_DIRS = (
    _ROOT_DIR / "prompts",
    _BACKEND_DIR / "prompts",
)


def _find_prompt_file(version: str, name: str) -> Path:
    filename = f"{version}_{name}.yaml"
    for directory in _PROMPTS_DIRS:
        path = directory / filename
        if path.is_file():
            return path
    raise FileNotFoundError(
        f"Prompt file not found: {filename} (searched {[str(d) for d in _PROMPTS_DIRS]})"
    )


@lru_cache(maxsize=32)
def _load_raw(version: str, name: str) -> dict[str, Any]:
    path = _find_prompt_file(version, name)
    try:
        import yaml
    except ImportError as exc:
        raise RuntimeError("PyYAML is required for the prompt registry.") from exc
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or "template" not in data:
        raise ValueError(f"Invalid prompt YAML: {path}")
    return data


def active_prompt_version() -> str:
    settings = get_settings()
    return (settings.active_prompt_version or "v1").strip() or "v1"


def prompt_hash(template: str) -> str:
    return hashlib.sha256(template.encode("utf-8")).hexdigest()[:16]


def load_prompt(name: str, version: str | None = None) -> dict[str, Any]:
    ver = version or active_prompt_version()
    raw = _load_raw(ver, name)
    template = str(raw["template"])
    return {
        "version": str(raw.get("version") or ver),
        "name": str(raw.get("name") or name),
        "template": template,
        "prompt_hash": prompt_hash(template),
        "temperature": raw.get("temperature"),
        "max_tokens": raw.get("max_tokens"),
        "path": str(_find_prompt_file(ver, name)),
    }


def render_prompt(prompt_name: str, *, version: str | None = None, **fields: str) -> dict[str, Any]:
    loaded = load_prompt(prompt_name, version=version)
    # Escape braces in dynamic blocks that are not format keys.
    safe = {}
    for key, value in fields.items():
        text = value if value is not None else ""
        if key == "ideal_client":
            text = text.replace("{", "{{").replace("}", "}}")
        safe[key] = text
    rendered = loaded["template"].format(**safe)
    return {
        **loaded,
        "rendered": rendered,
        "prompt_hash": prompt_hash(rendered),
    }


def register_prompts_with_mlflow() -> None:
    """Best-effort local Prompt Registry registration for browsing."""
    try:
        from ..telemetry import init_mlflow

        if not init_mlflow():
            return
        import mlflow

        for name in ("lead_scoring", "demo_extract"):
            try:
                loaded = load_prompt(name)
                mlflow.log_dict(
                    {
                        "version": loaded["version"],
                        "name": loaded["name"],
                        "prompt_hash": loaded["prompt_hash"],
                        "template": loaded["template"],
                    },
                    artifact_file=f"prompts/{loaded['version']}_{name}.json",
                )
            except Exception as exc:
                logger.debug("Could not register prompt %s: %s", name, exc)
    except Exception as exc:
        logger.debug("MLflow prompt registration skipped: %s", exc)
