from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "Lead Qualifier Pipeline"
    database_url: str = "sqlite+aiosqlite:///./leads.db"
    
    anthropic_api_key: str = ""
    elevenlabs_api_key: str = ""
    
    slack_webhook_url: str = ""
    slack_signing_secret: str = ""
    
    base_url: str = "http://localhost:8000"
    
    icp_criteria: dict = {
        "min_employees": 100,
        "target_industries": ["technology", "finance", "healthcare", "media", "telecommunications"],
        "target_regions": ["north_america", "europe", "apac"],
        "revenue_threshold": 10000000,
        "fortune_500_threshold": 90  # Score threshold for Fortune 500 companies
    }

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
