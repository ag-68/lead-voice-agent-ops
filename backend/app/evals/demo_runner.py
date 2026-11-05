"""Golden-dataset demo_extract evals — call-text fixtures → booking/date judges."""

from __future__ import annotations

import asyncio
import json
import statistics
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

from ..services.demo_booking import _llm_extract_demo, _looks_booked_from_text
from ..services.prompt_registry import active_prompt_version, load_prompt
from ..telemetry import init_mlflow, lead_trace

ProgressFn = Callable[[dict[str, Any]], Awaitable[None] | None]

_BACKEND = Path(__file__).resolve().parent.parent.parent
_ROOT = _BACKEND.parent
_DATASET_CANDIDATES = (
    _ROOT / "evals" / "demo_golden_dataset.json",
    _BACKEND / "evals" / "demo_golden_dataset.json",
)
_DEFAULT_REPEATS = 3

_run_lock = asyncio.Lock()
_job: dict[str, Any] = {
    "job_id": None,
    "status": "idle",
    "phase": None,
    "label": None,
    "case_index": 0,
    "n_cases": 0,
    "pass_index": 0,
    "n_repeats": _DEFAULT_REPEATS,
    "step_index": 0,
    "n_steps": 0,
    "case_id": None,
    "error": None,
    "summary": None,
    "started_at": None,
    "finished_at": None,
}


def get_demo_eval_job_status() -> dict[str, Any]:
    return dict(_job)


async def _emit(on_progress: ProgressFn | None, payload: dict[str, Any]) -> None:
    _job.update(payload)
    if on_progress is None:
        return
    maybe = on_progress(dict(_job))
    if asyncio.iscoroutine(maybe):
        await maybe


def _dataset_path() -> Path:
    for path in _DATASET_CANDIDATES:
        if path.is_file():
            return path
    raise FileNotFoundError(
        f"demo_golden_dataset.json not found (searched {[str(p) for p in _DATASET_CANDIDATES]})"
    )


def _results_dir() -> Path:
    dataset = _dataset_path()
    out = dataset.parent / "results" / "demo"
    out.mkdir(parents=True, exist_ok=True)
    return out


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 3) if values else None


def _stdev(values: list[float]) -> float | None:
    if len(values) < 2:
        return 0.0 if values else None
    return round(statistics.pstdev(values), 3)


def judge_demo_case(
    *,
    expected_booked: bool,
    expected_date_contains: list[str],
    predicted_booked: bool | None,
    predicted_when: str | None,
) -> dict[str, Any]:
    if predicted_booked is None:
        booked_acc = 0.0
    else:
        booked_acc = 1.0 if predicted_booked == expected_booked else 0.0

    when = (predicted_when or "").strip()
    when_l = when.lower()
    tokens = [t.lower() for t in expected_date_contains if t]

    if not expected_booked:
        # No booking → date should be empty / null-ish
        date_ok = 1.0 if not when or when_l in {"null", "none", "n/a"} else 0.5
    elif not tokens:
        # Booked but no required date tokens — any non-empty when is bonus; empty still ok
        date_ok = 1.0
    else:
        hits = sum(1 for t in tokens if t in when_l)
        date_ok = round(hits / len(tokens), 3)

    return {
        "booked_accuracy": booked_acc,
        "date_ok": date_ok,
        "aggregate": round((booked_acc + date_ok) / 2.0, 3),
        "expected_meeting_booked": expected_booked,
        "predicted_meeting_booked": predicted_booked,
        "predicted_when": predicted_when,
    }


def aggregate_demo_trials(case_id: str, trials: list[dict[str, Any]]) -> dict[str, Any]:
    ok = [t for t in trials if t.get("judge") and not t.get("error")]
    if not ok:
        err = next((t.get("error") for t in trials if t.get("error")), "all passes failed")
        return {"id": case_id, "n_repeats": len(trials), "n_ok_passes": 0, "error": err, "trials": trials}

    booked_acc = [float(t["judge"]["booked_accuracy"]) for t in ok]
    date_ok = [float(t["judge"]["date_ok"]) for t in ok]
    aggregates = [float(t["judge"]["aggregate"]) for t in ok]
    pred_booked = [t["judge"].get("predicted_meeting_booked") for t in ok]
    true_c = sum(1 for v in pred_booked if v is True)
    false_c = sum(1 for v in pred_booked if v is False)
    none_c = sum(1 for v in pred_booked if v is None)
    majority = True if true_c >= false_c and true_c >= none_c else (
        False if false_c >= none_c else None
    )
    expected = ok[0]["judge"]["expected_meeting_booked"]
    whens = [t["judge"].get("predicted_when") for t in ok if t["judge"].get("predicted_when")]

    return {
        "id": case_id,
        "n_repeats": len(trials),
        "n_ok_passes": len(ok),
        "scorer": ",".join(sorted({t.get("scorer") for t in ok if t.get("scorer")})),
        "judge": {
            "booked_accuracy": _mean(booked_acc),
            "date_ok": _mean(date_ok),
            "date_ok_stdev": _stdev(date_ok),
            "aggregate": _mean(aggregates),
            "aggregate_stdev": _stdev(aggregates),
            "expected_meeting_booked": expected,
            "predicted_meeting_booked": majority,
            "predicted_booked_counts": {
                "true": true_c,
                "false": false_c,
                "unknown": none_c,
            },
            "sample_when": whens[0] if whens else None,
        },
        "prompt_version": ok[-1].get("prompt_version"),
        "prompt_hash": ok[-1].get("prompt_hash"),
        "trials": trials,
    }


async def run_demo_case_once(
    case: dict[str, Any],
    *,
    on_progress: ProgressFn | None = None,
    case_index: int = 1,
    n_cases: int = 1,
    pass_index: int = 1,
    n_repeats: int = 1,
    step_index: int = 1,
    n_steps: int = 1,
) -> dict[str, Any]:
    case_id = case["id"]
    call_text = case.get("call_text") or ""
    await _emit(
        on_progress,
        {
            "phase": "waiting_llm",
            "label": f"Demo extract {case_index}/{n_cases} · pass {pass_index}/{n_repeats}: {case_id}",
            "case_index": case_index,
            "n_cases": n_cases,
            "pass_index": pass_index,
            "n_repeats": n_repeats,
            "step_index": step_index,
            "n_steps": n_steps,
            "case_id": case_id,
        },
    )
    with lead_trace(0, f"demo-eval-{case_id}-p{pass_index}"):
        booked, when, notes = await _llm_extract_demo(call_text)
        scorer = "llm"
        if booked is None:
            # No model key / LLM failed — keyword fallback like production text hints
            booked = _looks_booked_from_text(call_text)
            when = when
            scorer = "rules"
            notes = notes or "rules fallback"

    expected_booked = bool(case.get("expected_meeting_booked"))
    tokens = list(case.get("expected_date_contains") or [])
    scores = judge_demo_case(
        expected_booked=expected_booked,
        expected_date_contains=tokens,
        predicted_booked=booked,
        predicted_when=when,
    )
    prompt_meta = load_prompt("demo_extract")
    await _emit(
        on_progress,
        {
            "phase": "case_done",
            "label": f"Finished demo case {case_index}/{n_cases} · pass {pass_index}/{n_repeats}: {case_id}",
            "case_index": case_index,
            "pass_index": pass_index,
            "step_index": step_index,
            "n_steps": n_steps,
            "case_id": case_id,
        },
    )
    return {
        "id": case_id,
        "pass": pass_index,
        "scorer": scorer,
        "judge": scores,
        "notes": notes,
        "prompt_version": active_prompt_version(),
        "prompt_hash": prompt_meta["prompt_hash"],
    }


async def run_demo_golden_evals(
    *,
    n_repeats: int = _DEFAULT_REPEATS,
    on_progress: ProgressFn | None = None,
) -> dict[str, Any]:
    n_repeats = max(1, min(int(n_repeats), 10))
    async with _run_lock:
        await _emit(
            on_progress,
            {
                "status": "running",
                "phase": "starting",
                "label": "Loading demo golden dataset…",
                "case_index": 0,
                "n_cases": 0,
                "pass_index": 0,
                "n_repeats": n_repeats,
                "step_index": 0,
                "n_steps": 0,
                "case_id": None,
                "error": None,
                "summary": None,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "finished_at": None,
            },
        )
        init_mlflow()
        cases = json.loads(_dataset_path().read_text(encoding="utf-8"))
        n_cases = len(cases)
        n_steps = n_cases * n_repeats
        await _emit(
            on_progress,
            {
                "phase": "loaded",
                "label": f"Loaded {n_cases} demo fixtures × {n_repeats} passes",
                "n_cases": n_cases,
                "n_repeats": n_repeats,
                "n_steps": n_steps,
            },
        )
        results: list[dict[str, Any]] = []
        step = 0
        for i, case in enumerate(cases, start=1):
            trials: list[dict[str, Any]] = []
            for p in range(1, n_repeats + 1):
                step += 1
                try:
                    trials.append(
                        await run_demo_case_once(
                            case,
                            on_progress=on_progress,
                            case_index=i,
                            n_cases=n_cases,
                            pass_index=p,
                            n_repeats=n_repeats,
                            step_index=step,
                            n_steps=n_steps,
                        )
                    )
                except Exception as exc:
                    trials.append({"id": case["id"], "pass": p, "error": str(exc)})
            results.append(aggregate_demo_trials(case["id"], trials))

        await _emit(
            on_progress,
            {"phase": "writing", "label": "Writing demo eval report…", "step_index": n_steps, "n_steps": n_steps},
        )
        aggregates = [r["judge"]["aggregate"] for r in results if r.get("judge")]
        booked_acc = [r["judge"]["booked_accuracy"] for r in results if r.get("judge")]
        prompt_meta = load_prompt("demo_extract")
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        report = {
            "kind": "demo",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "prompt_version": active_prompt_version(),
            "prompt_hash": prompt_meta["prompt_hash"],
            "n_repeats": n_repeats,
            "n_cases": n_cases,
            "n_ok": sum(1 for r in results if r.get("judge")),
            "mean_aggregate": _mean(aggregates),
            "mean_booked_accuracy": _mean(booked_acc),
            "results": results,
        }
        out_dir = _results_dir()
        out_path = out_dir / f"demo_eval_{stamp}.json"
        out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        (out_dir / "latest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        summary = {
            "report_id": out_path.stem,
            "filename": out_path.name,
            "wrote": str(out_path),
            "prompt_version": report["prompt_version"],
            "prompt_hash": report["prompt_hash"],
            "n_repeats": n_repeats,
            "n_cases": report["n_cases"],
            "n_ok": report["n_ok"],
            "mean_aggregate": report["mean_aggregate"],
            "mean_booked_accuracy": report["mean_booked_accuracy"],
        }
        await _emit(
            on_progress,
            {
                "status": "completed",
                "phase": "completed",
                "label": f"Done — demo {summary['n_ok']}/{summary['n_cases']} × {n_repeats} · mean {summary['mean_aggregate']}",
                "summary": summary,
                "finished_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        return summary


async def start_demo_eval_job(n_repeats: int = _DEFAULT_REPEATS) -> dict[str, Any]:
    if _job.get("status") == "running":
        return get_demo_eval_job_status()
    n_repeats = max(1, min(int(n_repeats), 10))
    job_id = uuid.uuid4().hex[:12]
    _job.update(
        {
            "job_id": job_id,
            "status": "running",
            "phase": "queued",
            "label": f"Queued demo eval ({n_repeats}×)…",
            "case_index": 0,
            "n_cases": 0,
            "pass_index": 0,
            "n_repeats": n_repeats,
            "step_index": 0,
            "n_steps": 0,
            "case_id": None,
            "error": None,
            "summary": None,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "finished_at": None,
        }
    )

    async def _worker() -> None:
        try:
            await run_demo_golden_evals(n_repeats=n_repeats)
        except Exception as exc:
            _job.update(
                {
                    "status": "failed",
                    "phase": "failed",
                    "label": f"Demo eval failed: {exc}",
                    "error": str(exc),
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                }
            )

    asyncio.create_task(_worker())
    return get_demo_eval_job_status()
