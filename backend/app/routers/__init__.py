from .leads import router as leads_router
from .slack import router as slack_router
from .audit import router as audit_router
from .voice import router as voice_router
from .local_keys import router as local_keys_router
from .client_preferences import router as client_preferences_router
from .demo import router as demo_router

__all__ = [
    "leads_router",
    "slack_router",
    "audit_router",
    "voice_router",
    "local_keys_router",
    "client_preferences_router",
    "demo_router",
]
