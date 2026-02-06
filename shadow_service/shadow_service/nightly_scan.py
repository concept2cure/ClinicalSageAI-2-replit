"""CLI entrypoint for nightly contradiction scans.

Usage:
    python -m shadow_service.nightly_scan

Environment variables (all optional):
    PROGRAM_ID   — scan a single program UUID instead of all active
    MAX_PROGRAMS — cap on number of programs to scan
    DRY_RUN      — "true" to log what would be scanned without executing

Runs contradiction scans for all active regulatory programs.
Designed to be invoked by GitHub Actions cron or manually.

Exit codes:
    0 — all scans succeeded (or no active programs)
    1 — one or more scans failed
"""

import asyncio
import json
import logging
import os
import sys
from uuid import UUID

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("nightly_scan")


def _parse_env() -> dict:
    """Read ops knobs from environment variables."""
    opts: dict = {}

    raw_pid = os.environ.get("PROGRAM_ID", "").strip()
    if raw_pid:
        opts["program_id"] = UUID(raw_pid)

    raw_max = os.environ.get("MAX_PROGRAMS", "").strip()
    if raw_max:
        opts["max_programs"] = int(raw_max)

    raw_dry = os.environ.get("DRY_RUN", "").strip().lower()
    if raw_dry in ("true", "1", "yes"):
        opts["dry_run"] = True

    return opts


async def main() -> int:
    from .contradiction_scanner import run_nightly_scans

    opts = _parse_env()
    logger.info("=== Nightly A8 Contradiction Scan ===")
    if opts:
        logger.info("Options: %s", opts)

    summary = await run_nightly_scans(**opts)

    # Print JSON summary for GitHub Actions log
    print("\n" + json.dumps(summary, indent=2, default=str))

    total = summary["total_programs"]
    succeeded = summary["succeeded"]
    failed = summary["failed"]

    logger.info(
        "Done: %d programs scanned — %d succeeded, %d failed",
        total, succeeded, failed,
    )

    if total == 0:
        logger.info("No active programs found. Nothing to scan.")
        return 0

    return 1 if failed > 0 else 0


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
