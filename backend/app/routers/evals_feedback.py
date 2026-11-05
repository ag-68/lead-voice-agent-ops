"""Eval reports + review feedback loop APIs."""

from __future__ import annotations

import json
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..evals.demo_runner import get_demo_eval_job_status, start_demo_eval_job
from ..evals.runner import get_eval_job_status, start_eval_job
from ..services.admin_gate import require_admin
from ..services.prompt_registry import active_prompt_version, load_prompt
from ..services.review_feedback import list_feedback, record_human_verdict
from ..telemetry import list_recent_traces, mlflow_reachable
from ..utils.db import get_db

router = APIRouter(prefix="/api/evals", tags=["evals"])

_BACKEND = Path(__file__).resolve().parent.parent.parent
_ROOT = _BACKEND.parent
_RESULTS_DIRS = (
    _ROOT / "evals" / "results",
    _BACKEND / "evals" / "results",
)
_DEMO_RESULTS_DIRS = (
    _ROOT / "evals" / "results" / "demo",
    _BACKEND / "evals" / "results" / "demo",
)
_REPORT_NAME_RE = re.compile(r"^(latest|eval_\d{8}T\d{6}Z)\.json$")
_DEMO_REPORT_NAME_RE = re.compile(r"^(latest|demo_eval_\d{8}T\d{6}Z)\.json$")
_LEAD_FIXTURE_CANDIDATES = (
    _ROOT / "evals" / "golden_dataset.json",
    _BACKEND / "evals" / "golden_dataset.json",
)
_DEMO_FIXTURE_CANDIDATES = (
    _ROOT / "evals" / "demo_golden_dataset.json",
    _BACKEND / "evals" / "demo_golden_dataset.json",
)


class FeedbackCreate(BaseModel):
    lead_id: int
    human_verdict: str = Field(
        pattern="^(approve_handover_to_ai|call_by_human|lead_call_rejected|approved|claimed|flagged_for_review|rejected)$"
    )
    actor: str = "api"
    action: str | None = None
    judge_scores: dict | None = None
    details: str | None = None


def _results_dir() -> Path | None:
    for path in _RESULTS_DIRS:
        if path.is_dir():
            return path
    return None


def _resolve_report(report_id: str | None = None) -> Path | None:
    directory = _results_dir()
    if directory is None:
        return None
    name = report_id or "latest.json"
    if not name.endswith(".json"):
        name = f"{name}.json"
    if not _REPORT_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Invalid report id")
    path = (directory / name).resolve()
    if not str(path).startswith(str(directory.resolve())):
        raise HTTPException(status_code=400, detail="Invalid report path")
    return path if path.is_file() else None


def _peek_meta(path: Path) -> dict:
    meta: dict = {
        "id": path.stem,
        "filename": path.name,
        "is_latest": path.name == "latest.json",
        "modified_at": path.stat().st_mtime,
        "generated_at": None,
        "prompt_version": None,
        "prompt_hash": None,
        "n_cases": None,
        "n_ok": None,
        "mean_aggregate": None,
        "mean_gate_accuracy": None,
        "n_repeats": None,
        "scorers": [],
    }
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return meta
    meta["generated_at"] = data.get("generated_at")
    meta["prompt_version"] = data.get("prompt_version")
    meta["prompt_hash"] = data.get("prompt_hash")
    meta["n_cases"] = data.get("n_cases")
    meta["n_ok"] = data.get("n_ok")
    meta["mean_aggregate"] = data.get("mean_aggregate")
    meta["mean_gate_accuracy"] = data.get("mean_gate_accuracy")
    meta["n_repeats"] = data.get("n_repeats") or 1
    meta["scorers"] = data.get("scorers") or []
    if not meta["prompt_hash"]:
        for row in data.get("results") or []:
            if row.get("prompt_hash"):
                meta["prompt_hash"] = row["prompt_hash"]
                break
    if not meta["scorers"]:
        meta["scorers"] = sorted(
            {row["scorer"] for row in (data.get("results") or []) if row.get("scorer")}
        )
    return meta


def _enrich_report(data: dict) -> dict:
    """Fill top-level run params for older reports that only stamped rows."""
    if not data.get("prompt_hash"):
        for row in data.get("results") or []:
            if row.get("prompt_hash"):
                data["prompt_hash"] = row["prompt_hash"]
                break
    if not data.get("scorers"):
        data["scorers"] = sorted(
            {row["scorer"] for row in (data.get("results") or []) if row.get("scorer")}
        )
    return data


@router.get("/status")
async def evals_status():
    settings = get_settings()
    scoring = None
    demo = None
    try:
        scoring = load_prompt("lead_scoring")
    except Exception:
        scoring = None
    try:
        demo = load_prompt("demo_extract")
    except Exception:
        demo = None
    report = _resolve_report("latest")
    return {
        "active_prompt_version": active_prompt_version(),
        "prompt_hash": scoring["prompt_hash"] if scoring else None,
        "demo_extract_hash": demo["prompt_hash"] if demo else None,
        "mlflow_reachable": mlflow_reachable(),
        "mlflow_tracking_uri": settings.mlflow_tracking_uri,
        "latest_report_available": report is not None,
        "latest_report_path": str(report) if report else None,
    }


@router.get("/reports")
async def list_eval_reports():
    """List saved golden-eval JSON reports (latest + timestamped snapshots)."""
    directory = _results_dir()
    if directory is None:
        return {"reports": []}
    items = []
    for path in directory.glob("*.json"):
        if not _REPORT_NAME_RE.match(path.name):
            continue
        items.append(_peek_meta(path))
    items.sort(
        key=lambda row: (row.get("generated_at") or "", row.get("modified_at") or 0),
        reverse=True,
    )
    return {"reports": items}


@router.get("/report")
async def get_eval_report(report_id: str | None = Query(default=None)):
    """Golden-eval JSON for the dashboard. Defaults to latest; pass report_id to pick a snapshot."""
    try:
        path = _resolve_report(report_id)
    except HTTPException:
        raise
    if path is None:
        return {
            "available": False,
            "message": "No eval report yet. Use Run eval now or: python evals/run_evals.py",
            "report_id": report_id or "latest",
            "report": None,
        }
    try:
        data = _enrich_report(json.loads(path.read_text(encoding="utf-8")))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not read eval report: {exc}") from exc
    return {
        "available": True,
        "message": None,
        "report_id": path.stem,
        "filename": path.name,
        "report": data,
    }


@router.post("/run", dependencies=[Depends(require_admin)])
async def post_run_evals(n_repeats: int = Query(default=3, ge=1, le=10)):
    """Start a golden-eval run in the background (poll GET /api/evals/run/status).

    Each golden lead is scored n_repeats times (default 3); the report stores means.
    """
    try:
        job = await start_eval_job(n_repeats=n_repeats)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not start eval run: {exc}") from exc
    return job


@router.get("/run/status")
async def get_run_evals_status():
    """Live progress for the current/last golden-eval job."""
    return get_eval_job_status()


@router.get("/traces")
async def get_traces(limit: int = Query(default=50, ge=1, le=200)):
    """Recent MLflow runs for the MLOps trace log popup."""
    rows = list_recent_traces(limit=limit)
    return {
        "available": mlflow_reachable(),
        "count": len(rows),
        "traces": rows,
    }


def _first_existing(paths: tuple[Path, ...]) -> Path | None:
    for path in paths:
        if path.is_file():
            return path
    return None


def _demo_results_dir() -> Path | None:
    for path in _DEMO_RESULTS_DIRS:
        if path.is_dir():
            return path
    # Prefer creating next to lead results when present
    lead = _results_dir()
    if lead is not None:
        demo = lead / "demo"
        demo.mkdir(parents=True, exist_ok=True)
        return demo
    return None


def _resolve_demo_report(report_id: str | None = None) -> Path | None:
    directory = _demo_results_dir()
    if directory is None:
        return None
    name = report_id or "latest.json"
    if not name.endswith(".json"):
        name = f"{name}.json"
    if not _DEMO_REPORT_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Invalid demo report id")
    path = (directory / name).resolve()
    if not str(path).startswith(str(directory.resolve())):
        raise HTTPException(status_code=400, detail="Invalid demo report path")
    return path if path.is_file() else None


def _peek_demo_meta(path: Path) -> dict:
    meta = _peek_meta(path)
    meta["id"] = path.stem
    meta["is_latest"] = path.name == "latest.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        meta["mean_booked_accuracy"] = data.get("mean_booked_accuracy")
        meta["kind"] = data.get("kind") or "demo"
    except Exception:
        meta["mean_booked_accuracy"] = None
        meta["kind"] = "demo"
    return meta


@router.get("/fixtures/leads")
async def get_lead_fixtures():
    path = _first_existing(_LEAD_FIXTURE_CANDIDATES)
    if path is None:
        return {"available": False, "cases": []}
    cases = json.loads(path.read_text(encoding="utf-8"))
    return {"available": True, "path": str(path), "cases": cases}


@router.get("/fixtures/demos")
async def get_demo_fixtures():
    path = _first_existing(_DEMO_FIXTURE_CANDIDATES)
    if path is None:
        return {"available": False, "cases": []}
    cases = json.loads(path.read_text(encoding="utf-8"))
    return {"available": True, "path": str(path), "cases": cases}


@router.get("/demo/reports")
async def list_demo_eval_reports():
    directory = _demo_results_dir()
    if directory is None:
        return {"reports": []}
    items = []
    for path in directory.glob("*.json"):
        if not _DEMO_REPORT_NAME_RE.match(path.name):
            continue
        items.append(_peek_demo_meta(path))
    items.sort(
        key=lambda row: (row.get("generated_at") or "", row.get("modified_at") or 0),
        reverse=True,
    )
    return {"reports": items}


@router.get("/demo/report")
async def get_demo_eval_report(report_id: str | None = Query(default=None)):
    try:
        path = _resolve_demo_report(report_id)
    except HTTPException:
        raise
    if path is None:
        return {
            "available": False,
            "message": "No demo eval report yet. Use Run eval now on the Demo tab.",
            "report_id": report_id or "latest",
            "report": None,
        }
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not read demo report: {exc}") from exc
    return {
        "available": True,
        "message": None,
        "report_id": path.stem,
        "filename": path.name,
        "report": data,
    }


@router.post("/demo/run", dependencies=[Depends(require_admin)])
async def post_run_demo_evals(n_repeats: int = Query(default=3, ge=1, le=10)):
    try:
        job = await start_demo_eval_job(n_repeats=n_repeats)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not start demo eval: {exc}") from exc
    return job


@router.get("/demo/run/status")
async def get_demo_run_evals_status():
    return get_demo_eval_job_status()


@router.get("/feedback")
async def get_feedback(lead_id: int | None = None, db: AsyncSession = Depends(get_db)):
    """Read-only feedback log for the MLOps panel and lead detail."""
    rows = await list_feedback(db, lead_id=lead_id)
    return [
        {
            "id": row.id,
            "lead_id": row.lead_id,
            "trace_id": row.trace_id,
            "judge_scores": json.loads(row.judge_scores) if row.judge_scores else None,
            "human_verdict": row.human_verdict,
            "actor": row.actor,
            "action": row.action,
            "details": row.details,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


@router.post("/feedback", dependencies=[Depends(require_admin)])
async def post_feedback(body: FeedbackCreate, db: AsyncSession = Depends(get_db)):
    if body.human_verdict not in {
        "approve_handover_to_ai",
        "call_by_human",
        "lead_call_rejected",
        "approved",
        "claimed",
        "flagged_for_review",
        "rejected",
    }:
        raise HTTPException(status_code=400, detail="Invalid human_verdict")
    entry = await record_human_verdict(
        db,
        lead_id=body.lead_id,
        human_verdict=body.human_verdict,
        actor=body.actor,
        action=body.action,
        judge_scores=body.judge_scores,
        details=body.details,
    )
    return {"id": entry.id, "status": "recorded"}
