"""Read and save the ideal-client choices used when a lead is scored."""

from fastapi import APIRouter, Body, HTTPException

from ..services.client_preferences import PreferenceError, read_preferences, save_preferences

router = APIRouter(prefix="/api/client-preferences", tags=["client-preferences"])


@router.get("")
async def get_client_preferences():
    return await read_preferences()


@router.put("")
async def put_client_preferences(payload: dict = Body(...)):
    try:
        return await save_preferences(payload)
    except PreferenceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
