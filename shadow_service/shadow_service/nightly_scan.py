"""CLI entrypoint for nightly contradiction scans.

Usage:
    python -m shadow_service.nightly_scan

Runs contradiction scans for all active regulatory programs.
Designed to be invoked by GitHub Actions cron or manually.

Exit codes:
    0 — all scans succeeded (or no active programs)
    1 — one or more scans failed
"""

import asyncio
import json
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("nightly_scan")


async def main() -> int:
    from .contradiction_scanner import run_nightly_scans

    logger.info("=== Nightly A8 Contradiction Scan ===")
    summary = await run_nightly_scans()

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
