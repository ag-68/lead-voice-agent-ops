"""In-memory AI setup for this run of the local server.

A value typed into the page overrides the same value from .env until it is
cleared or the server stops. Nothing here is written to disk.
"""

from ..config import get_settings

_settings = get_settings()

PROVIDERS = ("anthropic", "openai", "gemini", "groq", "openai_compatible")
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
DEFAULT_MODELS = {
    "anthropic": "claude-sonnet-4-20250514",
    "openai": "gpt-4o-mini",
    "gemini": "gemini-2.0-flash",
    "groq": "openai/gpt-oss-20b",
    "openai_compatible": "",
}
PROVIDER_LABELS = {
    "anthropic": "Claude (Anthropic)",
    "openai": "OpenAI",
    "gemini": "Gemini (Google)",
    "groq": "Groq",
    "openai_compatible": "OpenAI-compatible server",
}

_env_provider = (_settings.llm_provider or "").strip().lower()
_env_model = (_settings.llm_model or "").strip()
_env_base_url = (_settings.openai_base_url or "").strip()
_env_keys = {
    "anthropic": _settings.anthropic_api_key,
    "openai": _settings.openai_api_key,
    "gemini": _settings.gemini_api_key,
    "groq": _settings.groq_api_key,
    "openai_compatible": _settings.openai_api_key,
}
_env_voice_key = _settings.elevenlabs_api_key
_env_agent_id = _settings.elevenlabs_agent_id
_env_phone_number_id = _settings.elevenlabs_phone_number_id
_env_webhook_secret = _settings.elevenlabs_webhook_secret
_env_slack_webhook_url = _settings.slack_webhook_url
_env_slack_signing_secret = _settings.slack_signing_secret

_session_provider: str | None = None
_session_key: str | None = None
_session_model: str | None = None
_session_base_url: str | None = None
_session_voice_key: str | None = None
_session_agent_id: str | None = None
_session_phone_number_id: str | None = None
_session_webhook_secret: str | None = None
_session_slack_webhook_url: str | None = None
_session_slack_signing_secret: str | None = None


def _chosen_provider() -> str:
    """Provider must be chosen in the UI or via LLM_PROVIDER. Keys alone do not select one."""
    if _session_provider in PROVIDERS:
        return _session_provider
    if _env_provider in PROVIDERS:
        return _env_provider
    return ""


def _llm_selection() -> dict:
    """Provider, key, and model currently chosen, including when some of them are missing."""
    provider = _chosen_provider()
    session_choice = (
        _session_provider is not None
        or _session_key is not None
        or _session_model is not None
        or _session_base_url is not None
    )
    if _session_key is not None:
        key = _session_key
    else:
        key = _env_keys.get(provider, "") if provider else ""
    if session_choice:
        source = "this_session"
    elif key or provider:
        source = "environment"
    else:
        source = "none"
    # Only an explicitly saved/env model counts as "entered". Defaults are for calls after that.
    model_explicit = (_session_model or _env_model or "").strip()
    model = model_explicit
    base_url = ""
    if provider:
        if provider == "groq":
            base_url = GROQ_BASE_URL
        else:
            base_url = _session_base_url if _session_base_url is not None else _env_base_url
            if provider == "openai_compatible" and not base_url:
                base_url = "https://api.openai.com/v1"
        base_url = base_url or "https://api.openai.com/v1"
    return {
        "provider": provider,
        "api_key": key,
        "model": model,
        "model_set": bool(model_explicit),
        "base_url": base_url,
        "source": source,
        "label": PROVIDER_LABELS[provider] if provider else "Name list",
    }


def active_llm() -> dict | None:
    chosen = _llm_selection()
    if not chosen["provider"] or not chosen["api_key"] or not chosen["model_set"]:
        return None
    return chosen


def active_voice() -> dict:
    key = _session_voice_key if _session_voice_key is not None else _env_voice_key
    agent_id = _session_agent_id if _session_agent_id is not None else _env_agent_id
    phone_number_id = (
        _session_phone_number_id
        if _session_phone_number_id is not None
        else _env_phone_number_id
    )
    webhook_secret = (
        _session_webhook_secret
        if _session_webhook_secret is not None
        else _env_webhook_secret
    )
    if (
        _session_voice_key is not None
        or _session_agent_id is not None
        or _session_phone_number_id is not None
        or _session_webhook_secret is not None
    ):
        source = "this_session"
    elif key or agent_id or phone_number_id or webhook_secret:
        source = "environment"
    else:
        source = "none"
    ready = bool(key and agent_id and phone_number_id)
    return {
        "api_key": key or "",
        "agent_id": agent_id or "",
        "phone_number_id": phone_number_id or "",
        "webhook_secret": webhook_secret or "",
        "source": source,
        "ready": ready,
        "label": "ElevenLabs voice agent" if ready else "Simulated call",
    }


def active_slack() -> dict:
    webhook_url = (
        _session_slack_webhook_url
        if _session_slack_webhook_url is not None
        else _env_slack_webhook_url
    )
    signing_secret = (
        _session_slack_signing_secret
        if _session_slack_signing_secret is not None
        else _env_slack_signing_secret
    )
    if _session_slack_webhook_url is not None or _session_slack_signing_secret is not None:
        source = "this_session"
    elif webhook_url or signing_secret:
        source = "environment"
    else:
        source = "none"
    ready = bool(webhook_url)
    return {
        "webhook_url": webhook_url or "",
        "signing_secret": signing_secret or "",
        "source": source,
        "ready": ready,
        "label": "Slack approvals" if ready else "Dashboard only",
    }


def ai_status() -> dict:
    chosen = _llm_selection()
    voice = active_voice()
    slack = active_slack()
    provider_set = bool(chosen["provider"])
    key_set = bool(chosen["api_key"])
    model_set = bool(chosen["model_set"])
    llm_ready = provider_set and key_set and model_set
    # Env / Cloud Run vars and Configure saves both count as configured.
    llm_configured = llm_ready
    voice_configured = voice["ready"]
    slack_configured = slack["ready"]
    if llm_ready:
        scoring = f"{chosen['label']} scores the company"
    else:
        scoring = "Name list on this computer scores the company"
    return {
        "llm": {
            "configured": llm_configured,
            "provider": chosen["provider"] or "none",
            "key_set": key_set,
            "model_set": model_set,
            "model": chosen["model"],
            "source": chosen["source"],
            "label": chosen["label"] if provider_set else "Name list",
            "step": scoring,
        },
        "voice": {
            "configured": voice_configured,
            "key_set": bool(voice["api_key"]),
            "agent_set": bool(voice["agent_id"]),
            "phone_number_set": bool(voice["phone_number_id"]),
            "webhook_secret_set": bool(voice["webhook_secret"]),
            "source": voice["source"],
            "label": voice["label"],
            "step": "ElevenLabs places the call" if voice["ready"] else "This app simulates the call",
        },
        "slack": {
            "configured": slack_configured,
            "webhook_set": bool(slack["webhook_url"]),
            "signing_secret_set": bool(slack["signing_secret"]),
            "source": slack["source"],
            "label": slack["label"],
            "step": (
                "Slack asks a person to release Selected leads"
                if slack["ready"]
                else "Use the dashboard Call / Claim / Reject strip"
            ),
        },
        "max_attempts": 3,
        "stored_in_project": False,
    }


def save_llm(provider: str, api_key: str | None, model: str | None, base_url: str | None) -> dict:
    global _session_provider, _session_key, _session_model, _session_base_url
    if provider not in PROVIDERS:
        raise ValueError("Choose Claude, OpenAI, Gemini, Groq, or an OpenAI-compatible server.")
    switching = provider != _session_provider
    if switching and not (api_key and api_key.strip()):
        # Changing provider without a new key drops the previous key; env key for the new provider may still apply.
        _session_key = None
    _session_provider = provider
    if api_key and api_key.strip():
        _session_key = api_key.strip()
    if model and model.strip():
        _session_model = model.strip()
    elif switching or _session_model is None:
        # Saving from the UI counts as choosing a model: use the typed value or the provider default.
        _session_model = DEFAULT_MODELS[provider] or _session_model
    if not (_session_key or _env_keys.get(provider, "")):
        raise ValueError("Paste an API key for this provider (or set it in .env).")
    if not (_session_model or _env_model):
        raise ValueError("Enter a model name.")
    if base_url and base_url.strip():
        _session_base_url = base_url.strip().rstrip("/")
    return ai_status()


def clear_llm() -> dict:
    global _session_provider, _session_key, _session_model, _session_base_url
    _session_provider = None
    _session_key = None
    _session_model = None
    _session_base_url = None
    return ai_status()


def save_voice(
    api_key: str | None,
    agent_id: str | None,
    phone_number_id: str | None = None,
    webhook_secret: str | None = None,
) -> dict:
    global _session_voice_key, _session_agent_id, _session_phone_number_id, _session_webhook_secret
    if api_key and api_key.strip():
        _session_voice_key = api_key.strip()
    if agent_id and agent_id.strip():
        _session_agent_id = agent_id.strip()
    if phone_number_id and phone_number_id.strip():
        _session_phone_number_id = phone_number_id.strip()
    if webhook_secret and webhook_secret.strip():
        _session_webhook_secret = webhook_secret.strip()
    voice = active_voice()
    _settings.elevenlabs_api_key = voice["api_key"]
    _settings.elevenlabs_agent_id = voice["agent_id"]
    _settings.elevenlabs_phone_number_id = voice["phone_number_id"]
    _settings.elevenlabs_webhook_secret = voice["webhook_secret"]
    return ai_status()


def clear_voice() -> dict:
    global _session_voice_key, _session_agent_id, _session_phone_number_id, _session_webhook_secret
    _session_voice_key = None
    _session_agent_id = None
    _session_phone_number_id = None
    _session_webhook_secret = None
    _settings.elevenlabs_api_key = _env_voice_key
    _settings.elevenlabs_agent_id = _env_agent_id
    _settings.elevenlabs_phone_number_id = _env_phone_number_id
    _settings.elevenlabs_webhook_secret = _env_webhook_secret
    return ai_status()


def save_slack(
    webhook_url: str | None,
    signing_secret: str | None = None,
) -> dict:
    global _session_slack_webhook_url, _session_slack_signing_secret
    if webhook_url and webhook_url.strip():
        _session_slack_webhook_url = webhook_url.strip()
    if signing_secret and signing_secret.strip():
        _session_slack_signing_secret = signing_secret.strip()
    slack = active_slack()
    if not slack["webhook_url"]:
        raise ValueError("Paste a Slack incoming webhook URL (or set SLACK_WEBHOOK_URL in .env).")
    _settings.slack_webhook_url = slack["webhook_url"]
    _settings.slack_signing_secret = slack["signing_secret"]
    return ai_status()


def clear_slack() -> dict:
    global _session_slack_webhook_url, _session_slack_signing_secret
    _session_slack_webhook_url = None
    _session_slack_signing_secret = None
    _settings.slack_webhook_url = _env_slack_webhook_url
    _settings.slack_signing_secret = _env_slack_signing_secret
    return ai_status()
