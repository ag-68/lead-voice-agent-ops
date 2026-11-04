from fastapi import APIRouter

from ..services.admin_gate import demo_status

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.get("/status")
async def get_demo_status():
    return demo_status()
