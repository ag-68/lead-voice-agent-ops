from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy import text

from .utils.db import init_db, AsyncSessionLocal
from .routers import (
    leads_router,
    slack_router,
    audit_router,
    voice_router,
    local_keys_router,
    client_preferences_router,
    demo_router,
    evals_feedback_router,
)
from .config import get_settings
from .services.local_keys import ai_status
from .services.admin_gate import demo_locked
from .telemetry import configure_json_logging, init_mlflow, mlflow_reachable

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_json_logging()
    init_mlflow()
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
    - Local LLMOps: MLflow tracing, prompt versions, eval feedback
    
    Built as a portfolio project demonstrating AI-first internal tooling.
    """,
    version="1.1.0",
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
app.include_router(local_keys_router)
app.include_router(client_preferences_router)
app.include_router(demo_router)
app.include_router(evals_feedback_router)


@app.get("/")
async def root():
    return {
        "name": "Lead Qualifier Pipeline",
        "version": "1.1.0",
        "status": "operational",
        "demo_locked": demo_locked(),
        "endpoints": {
            "leads": "/api/leads",
            "slack": "/api/slack",
            "audit": "/api/audit",
            "voice": "/api/voice",
            "demo": "/api/demo/status",
            "evals_feedback": "/api/evals/feedback",
            "docs": "/docs",
        },
        "features": {
            "llm_scoring": ai_status()["llm"]["configured"],
            "slack_integration": bool(settings.slack_webhook_url),
            "elevenlabs_integration": ai_status()["voice"]["configured"],
            "mlflow": mlflow_reachable(),
            "active_prompt_version": settings.active_prompt_version,
        }
    }


@app.get("/health")
@app.get("/healthz")
async def health():
    return {"status": "healthy"}


@app.get("/readyz")
async def readyz():
    db_ok = False
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
            db_ok = True
    except Exception as exc:
        return {
            "status": "not_ready",
            "database": False,
            "mlflow": mlflow_reachable(),
            "detail": str(exc),
        }
    mlflow_ok = mlflow_reachable()
    ready = db_ok and mlflow_ok
    return {
        "status": "ready" if ready else "degraded",
        "database": db_ok,
        "mlflow": mlflow_ok,
        "active_prompt_version": settings.active_prompt_version,
    }
