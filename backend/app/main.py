from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .utils.db import init_db
from .routers import leads_router, slack_router, audit_router, voice_router
from .config import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Lead Qualifier Pipeline",
    description="""
    Autonomous Inbound Lead Qualifier & Voice Follow-Up Pipeline
    
    This system demonstrates:
    - Webhook-driven lead intake
    - Claude-powered lead enrichment and ICP scoring
    - Human-in-the-loop approval for high-value leads via Slack
    - ElevenAgents voice AI integration for automated outreach
    - Complete audit trail with blast-radius controls
    
    Built as a portfolio project demonstrating AI-first internal tooling.
    """,
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(leads_router)
app.include_router(slack_router)
app.include_router(audit_router)
app.include_router(voice_router)


@app.get("/")
async def root():
    return {
        "name": "Lead Qualifier Pipeline",
        "version": "1.0.0",
        "status": "operational",
        "endpoints": {
            "leads": "/api/leads",
            "slack": "/api/slack",
            "audit": "/api/audit",
            "voice": "/api/voice",
            "docs": "/docs",
        },
        "features": {
            "claude_enrichment": bool(settings.anthropic_api_key),
            "slack_integration": bool(settings.slack_webhook_url),
            "elevenlabs_integration": bool(settings.elevenlabs_api_key),
        }
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}
