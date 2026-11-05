"""Run demo_extract golden evals locally.

Usage:
  python evals/run_demo_evals.py
  python evals/run_demo_evals.py --repeats 3
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

from app.evals.demo_runner import run_demo_golden_evals  # noqa: E402


async def main() -> int:
    parser = argparse.ArgumentParser(description="Run demo booking extract evals")
    parser.add_argument("--repeats", type=int, default=3)
    args = parser.parse_args()
    summary = await run_demo_golden_evals(n_repeats=args.repeats)
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
