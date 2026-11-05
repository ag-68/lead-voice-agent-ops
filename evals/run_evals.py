"""Run golden-dataset scoring evals locally and write a JSON report.

Usage (from repo root or backend/):
  python evals/run_evals.py
  python evals/run_evals.py --repeats 3
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.evals.runner import run_golden_evals  # noqa: E402


async def main() -> int:
    parser = argparse.ArgumentParser(description="Run golden lead-scoring evals")
    parser.add_argument(
        "--repeats",
        type=int,
        default=3,
        help="How many times to score each golden lead (default: 3)",
    )
    args = parser.parse_args()
    summary = await run_golden_evals(n_repeats=args.repeats)
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
