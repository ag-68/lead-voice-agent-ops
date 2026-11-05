# Improving golden evals

## What we have today

The golden eval is a fixed set of **8 fake leads** (`golden_dataset.json`). Each case is scored **`n_repeats` times** (default **3**) with the active prompt/LLM; heuristic judges grade each pass; the report stores means, score min/max, gate vote counts, and stdev. Results land in `evals/results/` and show up on the MLOps panel (`Run eval now` or `python evals/run_evals.py --repeats 3`).

## Recommended next steps

1. **Configurable repeats in the UI** — Expose a 1/3/5 control next to Run eval now (API already accepts `?n_repeats=`).
2. **Expand the case set** — More edge cases (ambiguous ICP, missing fields, borderline Fortune-500, tone traps). Keep fixtures fake and versioned.
3. **Track regressions across prompt versions** — Store reports keyed by `prompt_version` (and ideally prompt hash). Diff aggregates when you bump YAML.
4. **Log generation settings** — Temperature, model id, and other knobs next to each report so “same prompt, different knobs” is visible.
5. **Side-by-side prompt compare** — Optional: run the same golden set on two prompt versions and show a delta table (mean aggregate, gate flips).
