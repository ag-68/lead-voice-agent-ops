from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ROOT_DIR = _BACKEND_DIR.parent


class Settings(BaseSettings):
    app_name: str = "Lead Qualifier Pipeline"
    database_url: str = "sqlite+aiosqlite:///./leads.db"

    anthropic_api_key: str = ""
    openai_api_key: str = ""
    gemini_api_key: str = ""
    groq_api_key: str = ""
    openai_base_url: str = ""
    llm_provider: str = ""
    llm_model: str = ""
    elevenlabs_api_key: str = ""
    elevenlabs_agent_id: str = ""
    elevenlabs_phone_number_id: str = ""
    elevenlabs_webhook_secret: str = ""

    slack_webhook_url: str = ""
    slack_signing_secret: str = ""

    # When set, mutating APIs require header X-Admin-Key (public demo lock).
    admin_key: str = ""
    repo_url: str = "https://github.com/ag-68/lead-voice-agent-ops"

    base_url: str = "http://localhost:8000"

    icp_criteria: dict = {
        "min_employees": 100,
        "target_industries": ["technology", "finance", "healthcare", "media", "telecommunications"],
        "target_regions": ["north_america", "europe", "apac"],
        "revenue_threshold": 10000000,
        "fortune_500_threshold": 90,
    }

    model_config = SettingsConfigDict(
        # backend/.env then project root (root wins). Ambient OS env still applies last.
        env_file=(_BACKEND_DIR / ".env", _ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
