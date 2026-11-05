"""MLflow tracing helpers and structured JSON logging for local LLMOps."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Iterator

from .config import get_settings

_trace_id: ContextVar[str | None] = ContextVar("trace_id", default=None)
_mlflow_ready = False
_mlflow = None

# Rough USD per 1M tokens for local cost estimates (input, output).
_PRICING: dict[str, tuple[float, float]] = {
    "anthropic": (3.0, 15.0),
    "openai": (2.5, 10.0),
    "gemini": (0.35, 1.05),
    "groq": (0.05, 0.10),
    "openai_compatible": (1.0, 3.0),
}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "severity": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "trace_id": get_trace_id(),
            "time": self.formatTime(record, self.datefmt),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        for key in ("lead_id", "span", "latency_ms", "prompt_hash"):
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        return json.dumps(payload, default=str)


def configure_json_logging() -> None:
    root = logging.getLogger()
    if any(isinstance(h, logging.StreamHandler) and isinstance(h.formatter, JsonFormatter) for h in root.handlers):
        return
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)
    if root.level == logging.NOTSET:
        root.setLevel(logging.INFO)


def get_trace_id() -> str | None:
    return _trace_id.get()


def set_trace_id(trace_id: str | None) -> None:
    _trace_id.set(trace_id)


def new_trace_id(lead_id: int | None = None) -> str:
    raw = f"{lead_id or 0}:{uuid.uuid4().hex}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def init_mlflow() -> bool:
    """Bind local file store. Soft-fails if mlflow is missing."""
    global _mlflow_ready, _mlflow
    if _mlflow_ready:
        return True
    try:
        import mlflow

        settings = get_settings()
        uri = (settings.mlflow_tracking_uri or "file:./mlruns").strip()
        mlflow.set_tracking_uri(uri)
        mlflow.set_experiment(settings.mlflow_experiment or "lead-voice-agent")
        _mlflow = mlflow
        _mlflow_ready = True
        return True
    except Exception as exc:
        logging.getLogger(__name__).warning("MLflow init skipped: %s", exc)
        _mlflow_ready = False
        return False


def mlflow_reachable() -> bool:
    if not init_mlflow() or _mlflow is None:
        return False
    try:
        _mlflow.get_tracking_uri()
        return True
    except Exception:
        return False


def estimate_cost_usd(provider: str, prompt_tokens: int, completion_tokens: int) -> float:
    inp, out = _PRICING.get(provider, (1.0, 3.0))
    return (prompt_tokens / 1_000_000.0) * inp + (completion_tokens / 1_000_000.0) * out


def redact_email(email: str) -> str:
    if not email or "@" not in email:
        return "***"
    local, _, domain = email.partition("@")
    return f"{local[:1]}***@{domain}"


@contextmanager
def lead_trace(lead_id: int, name: str = "qualify_lead") -> Iterator[str]:
    """Parent MLflow run for one lead qualification."""
    trace_id = new_trace_id(lead_id)
    token = _trace_id.set(trace_id)
    started = time.perf_counter()
    run_ctx = None
    try:
        if init_mlflow() and _mlflow is not None:
            run_ctx = _mlflow.start_run(run_name=f"{name}-{lead_id}")
            run_ctx.__enter__()
            _mlflow.set_tags(
                {
                    "lead_id": str(lead_id),
                    "trace_id": trace_id,
                    "span": name,
                }
            )
        yield trace_id
    finally:
        latency_ms = int((time.perf_counter() - started) * 1000)
        try:
            if run_ctx is not None and _mlflow is not None:
                _mlflow.log_metric("latency_ms", latency_ms)
                run_ctx.__exit__(None, None, None)
        except Exception:
            pass
        _trace_id.reset(token)


@contextmanager
def llm_span(
    name: str,
    *,
    attrs: dict[str, Any] | None = None,
) -> Iterator[dict[str, Any]]:
    """Nested span/run for an LLM call. Yields a mutable bag for metrics."""
    bag: dict[str, Any] = {"attrs": dict(attrs or {})}
    started = time.perf_counter()
    nested = None
    try:
        if init_mlflow() and _mlflow is not None:
            nested = _mlflow.start_run(run_name=name, nested=True)
            nested.__enter__()
            tags = {"span": name, "trace_id": get_trace_id() or ""}
            for key, value in bag["attrs"].items():
                if value is not None:
                    tags[key] = str(value)[:250]
            _mlflow.set_tags(tags)
        yield bag
    finally:
        latency_ms = int((time.perf_counter() - started) * 1000)
        bag["latency_ms"] = latency_ms
        try:
            if nested is not None and _mlflow is not None:
                _mlflow.log_metric("latency_ms", latency_ms)
                if "prompt_tokens" in bag:
                    _mlflow.log_metric("prompt_tokens", float(bag["prompt_tokens"]))
                if "completion_tokens" in bag:
                    _mlflow.log_metric("completion_tokens", float(bag["completion_tokens"]))
                if "cost_usd" in bag:
                    _mlflow.log_metric("cost_usd", float(bag["cost_usd"]))
                if "icp_score" in bag:
                    _mlflow.log_metric("icp_score", float(bag["icp_score"]))
                nested.__exit__(None, None, None)
        except Exception:
            pass


def log_gate_outcome(gate: str, score: float | None = None) -> None:
    if not init_mlflow() or _mlflow is None:
        return
    try:
        _mlflow.set_tag("gate_outcome", gate)
        if score is not None:
            _mlflow.log_metric("gate_score", float(score))
    except Exception:
        pass


def list_recent_traces(limit: int = 50) -> list[dict[str, Any]]:
    """Recent MLflow runs as plain dicts for the dashboard trace log."""
    if not init_mlflow() or _mlflow is None:
        return []
    limit = max(1, min(int(limit), 200))
    try:
        from mlflow.tracking import MlflowClient

        settings = get_settings()
        client = MlflowClient()
        exp_name = settings.mlflow_experiment or "lead-voice-agent"
        exp = client.get_experiment_by_name(exp_name)
        if exp is None:
            return []
        runs = client.search_runs(
            [exp.experiment_id],
            order_by=["attributes.start_time DESC"],
            max_results=limit,
        )
        rows: list[dict[str, Any]] = []
        for run in runs:
            tags = run.data.tags or {}
            metrics = run.data.metrics or {}
            start_ms = run.info.start_time
            rows.append(
                {
                    "run_id": run.info.run_id,
                    "name": run.info.run_name or tags.get("span") or "—",
                    "span": tags.get("span"),
                    "lead_id": tags.get("lead_id"),
                    "trace_id": tags.get("trace_id"),
                    "prompt_hash": tags.get("prompt_hash"),
                    "gate_outcome": tags.get("gate_outcome"),
                    "status": run.info.status,
                    "start_time": (
                        datetime.fromtimestamp(start_ms / 1000.0, tz=timezone.utc).isoformat()
                        if start_ms
                        else None
                    ),
                    "latency_ms": metrics.get("latency_ms"),
                    "icp_score": metrics.get("icp_score"),
                    "cost_usd": metrics.get("cost_usd"),
                    "prompt_tokens": metrics.get("prompt_tokens"),
                    "completion_tokens": metrics.get("completion_tokens"),
                }
            )
        return rows
    except Exception as exc:
        logging.getLogger(__name__).warning("list_recent_traces failed: %s", exc)
        return []
