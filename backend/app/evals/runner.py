"""Golden-dataset scoring evals — shared by CLI and API."""

from __future__ import annotations

import asyncio
import json
import statistics
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

from ..services.claude_enrichment import enrich_lead
from ..services.prompt_registry import active_prompt_version, load_prompt
from ..telemetry import init_mlflow, lead_trace
from .judges import judge_scoring_case

ProgressFn = Callable[[dict[str, Any]], Awaitable[None] | None]

_BACKEND = Path(__file__).resolve().parent.parent.parent
_ROOT = _BACKEND.parent
_DATASET_CANDIDATES = (
    _ROOT / "evals" / "golden_dataset.json",
    _BACKEND / "evals" / "golden_dataset.json",
)
_DEFAULT_REPEATS = 3

_run_lock = asyncio.Lock()

# In-memory progress for the dashboard (single concurrent run).
_job: dict[str, Any] = {
    "job_id": None,
    "status": "idle",  # idle | running | completed | failed
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


def get_eval_job_status() -> dict[str, Any]:
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
        f"golden_dataset.json not found (searched {[str(p) for p in _DATASET_CANDIDATES]})"
    )


def _results_dir() -> Path:
    dataset = _dataset_path()
    sibling = dataset.parent / "results"
    sibling.mkdir(parents=True, exist_ok=True)
    return sibling


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 3) if values else None


def _stdev(values: list[float]) -> float | None:
    if len(values) < 2:
        return 0.0 if values else None
    return round(statistics.pstdev(values), 3)


def aggregate_trials(case_id: str, trials: list[dict[str, Any]]) -> dict[str, Any]:
    """Collapse per-pass trials into one table row (means + spread)."""
    ok = [t for t in trials if "judge" in t and not t.get("error")]
    if not ok:
        err = next((t.get("error") for t in trials if t.get("error")), "all passes failed")
        return {"id": case_id, "n_repeats": len(trials), "n_ok_passes": 0, "error": err, "trials": trials}

    scores = [float(t["icp_score"]) for t in ok if t.get("icp_score") is not None]
    grounded = [float(t["judge"]["groundedness"]) for t in ok]
    gate_acc = [float(t["judge"]["gate_accuracy"]) for t in ok]
    tone = [float(t["judge"]["tone_policy"]) for t in ok]
    aggregates = [float(t["judge"]["aggregate"]) for t in ok]
    actual_gates = [t["judge"]["actual_gate"] for t in ok]
    expected = ok[0]["judge"]["expected_gate"]
    # Majority actual gate
    actual_counts: dict[str, int] = {}
    for g in actual_gates:
        actual_counts[g] = actual_counts.get(g, 0) + 1
    majority_actual = max(actual_counts, key=actual_counts.get)
    scorers = sorted({t["scorer"] for t in ok if t.get("scorer")})

    return {
        "id": case_id,
        "n_repeats": len(trials),
        "n_ok_passes": len(ok),
        "scorer": ",".join(scorers) if scorers else None,
        "icp_score": _mean(scores),
        "icp_score_min": round(min(scores), 1) if scores else None,
        "icp_score_max": round(max(scores), 1) if scores else None,
        "icp_score_stdev": _stdev(scores),
        "tier": ok[-1].get("tier"),
        "is_fortune_500": ok[-1].get("is_fortune_500"),
        "judge": {
            "groundedness": _mean(grounded),
            "groundedness_stdev": _stdev(grounded),
            "gate_accuracy": _mean(gate_acc),
            "tone_policy": _mean(tone),
            "tone_policy_stdev": _stdev(tone),
            "aggregate": _mean(aggregates),
            "aggregate_stdev": _stdev(aggregates),
            "actual_gate": majority_actual,
            "expected_gate": expected,
            "actual_gate_counts": actual_counts,
            "gate_pass_rate": _mean(gate_acc),
        },
        "score_band_ok": all(bool(t.get("score_band_ok", True)) for t in ok),
        "prompt_version": ok[-1].get("prompt_version"),
        "prompt_hash": ok[-1].get("prompt_hash"),
        "trials": trials,
    }


async def run_case_once(
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
    lead = case["lead"]
    await _emit(
        on_progress,
        {
            "phase": "case_start",
            "label": f"Passing lead {case_index}/{n_cases} · pass {pass_index}/{n_repeats}: {case_id}",
            "case_index": case_index,
            "n_cases": n_cases,
            "pass_index": pass_index,
            "n_repeats": n_repeats,
            "step_index": step_index,
            "n_steps": n_steps,
            "case_id": case_id,
        },
    )
    await _emit(
        on_progress,
        {
            "phase": "waiting_llm",
            "label": f"Waiting for LLM response… ({case_id}, pass {pass_index}/{n_repeats})",
            "case_index": case_index,
            "pass_index": pass_index,
            "n_repeats": n_repeats,
            "step_index": step_index,
            "n_steps": n_steps,
            "case_id": case_id,
        },
    )
    with lead_trace(0, f"eval-{case_id}-p{pass_index}"):
        enrichment, reasoning, scorer = await enrich_lead(
            name=lead["name"],
            email=lead["email"],
            company_name=lead["company_name"],
            job_title=lead.get("job_title"),
            message=lead.get("message"),
        )
    await _emit(
        on_progress,
        {
            "phase": "judging",
            "label": f"Running judges… ({case_id}, pass {pass_index}/{n_repeats})",
            "case_index": case_index,
            "pass_index": pass_index,
            "step_index": step_index,
            "n_steps": n_steps,
            "case_id": case_id,
        },
    )
    enrichment_dict = enrichment.model_dump()
    enrichment_dict["icp_reasoning"] = enrichment.icp_reasoning or reasoning
    scores = judge_scoring_case(
        lead,
        enrichment_dict,
        expected_gate=case["expected_gate"],
    )
    band_ok = True
    if "expected_score_min" in case and enrichment.icp_score < case["expected_score_min"]:
        band_ok = False
    if "expected_score_max" in case and enrichment.icp_score > case["expected_score_max"]:
        band_ok = False
    await _emit(
        on_progress,
        {
            "phase": "case_done",
            "label": f"Finished lead {case_index}/{n_cases} · pass {pass_index}/{n_repeats}: {case_id}",
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
        "icp_score": enrichment.icp_score,
        "tier": enrichment.tier.value if enrichment.tier else None,
        "is_fortune_500": enrichment.is_fortune_500,
        "judge": scores,
        "score_band_ok": band_ok,
        "prompt_version": active_prompt_version(),
        "prompt_hash": load_prompt("lead_scoring")["prompt_hash"],
    }


# Back-compat alias used by older imports/tests
async def run_case(case: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
    return await run_case_once(case, **kwargs)


async def run_golden_evals(
    *,
    n_repeats: int = _DEFAULT_REPEATS,
    on_progress: ProgressFn | None = None,
) -> dict[str, Any]:
    """Score each golden lead n_repeats times, aggregate, write report."""
    n_repeats = max(1, min(int(n_repeats), 10))
    async with _run_lock:
        await _emit(
            on_progress,
            {
                "status": "running",
                "phase": "starting",
                "label": "Loading golden dataset…",
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
        dataset_path = _dataset_path()
        cases = json.loads(dataset_path.read_text(encoding="utf-8"))
        n_cases = len(cases)
        n_steps = n_cases * n_repeats
        await _emit(
            on_progress,
            {
                "phase": "loaded",
                "label": f"Loaded {n_cases} golden leads × {n_repeats} passes",
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
                        await run_case_once(
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
                    await _emit(
                        on_progress,
                        {
                            "phase": "case_error",
                            "label": f"Error on lead {i}/{n_cases} pass {p}: {case.get('id')} — {exc}",
                            "case_index": i,
                            "pass_index": p,
                            "step_index": step,
                            "n_steps": n_steps,
                            "case_id": case.get("id"),
                        },
                    )
                    trials.append({"id": case["id"], "pass": p, "error": str(exc)})
            results.append(aggregate_trials(case["id"], trials))

        await _emit(
            on_progress,
            {
                "phase": "writing",
                "label": "Writing eval report…",
                "case_index": n_cases,
                "step_index": n_steps,
                "n_steps": n_steps,
            },
        )
        aggregates = [
            r["judge"]["aggregate"] for r in results if r.get("judge") and "aggregate" in r["judge"]
        ]
        gate_acc = [
            r["judge"]["gate_accuracy"]
            for r in results
            if r.get("judge") and "gate_accuracy" in r["judge"]
        ]
        prompt_meta = load_prompt("lead_scoring")
        scorers: set[str] = set()
        for r in results:
            if r.get("scorer"):
                for part in str(r["scorer"]).split(","):
                    if part.strip():
                        scorers.add(part.strip())
            for trial in r.get("trials") or []:
                if trial.get("scorer"):
                    scorers.add(trial["scorer"])
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        report = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "prompt_version": active_prompt_version(),
            "prompt_hash": prompt_meta["prompt_hash"],
            "scorers": sorted(scorers),
            "n_repeats": n_repeats,
            "n_cases": n_cases,
            "n_ok": sum(1 for r in results if r.get("judge")),
            "mean_aggregate": _mean(aggregates),
            "mean_gate_accuracy": _mean(gate_acc),
            "results": results,
        }
        out_dir = _results_dir()
        out_path = out_dir / f"eval_{stamp}.json"
        out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        (out_dir / "latest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        summary = {
            "report_id": out_path.stem,
            "filename": out_path.name,
            "wrote": str(out_path),
            "prompt_version": report["prompt_version"],
            "prompt_hash": report["prompt_hash"],
            "scorers": sorted(scorers),
            "n_repeats": n_repeats,
            "n_cases": report["n_cases"],
            "n_ok": report["n_ok"],
            "mean_aggregate": report["mean_aggregate"],
            "mean_gate_accuracy": report["mean_gate_accuracy"],
        }
        await _emit(
            on_progress,
            {
                "status": "completed",
                "phase": "completed",
                "label": (
                    f"Done — {summary['n_ok']}/{summary['n_cases']} cases × "
                    f"{n_repeats} · mean {summary['mean_aggregate']}"
                ),
                "summary": summary,
                "finished_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        return summary


async def start_eval_job(n_repeats: int = _DEFAULT_REPEATS) -> dict[str, Any]:
    """Kick off a background golden eval if idle; return current job snapshot."""
    if _job.get("status") == "running":
        return get_eval_job_status()

    n_repeats = max(1, min(int(n_repeats), 10))
    job_id = uuid.uuid4().hex[:12]
    _job.update(
        {
            "job_id": job_id,
            "status": "running",
            "phase": "queued",
            "label": f"Queued eval run ({n_repeats}× per case)…",
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
            await run_golden_evals(n_repeats=n_repeats)
        except Exception as exc:
            _job.update(
                {
                    "status": "failed",
                    "phase": "failed",
                    "label": f"Eval run failed: {exc}",
                    "error": str(exc),
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                }
            )

    asyncio.create_task(_worker())
    return get_eval_job_status()
