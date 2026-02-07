"""Phase 5.3.A — Contradiction Scanner.

A8-compatible batch job that detects contradictions across claims in a program.
Can run on-demand (via REST endpoint) or as a nightly scheduled scan.

Architecture:
  1. Creates a scan record (status='running')
  2. Fetches active claims, groups by entity:field
  3. Detects value divergence → contradictions
  4. Persists results snapshot in evidence.contradiction_scans
  5. Returns scan summary

Design principles:
  - Scan results are immutable snapshots (append-only, never mutated after completion)
  - Idempotent: re-running produces new snapshot, does not modify old ones
  - Fire-and-forget compatible: scan failures are recorded, not raised
  - Works with existing evidence_runner.detect_contradictions() logic
"""

import json
import logging
from typing import Any, Optional
from uuid import UUID

from . import db
from . import sql_evidence as sql
from . import evidence_runner

logger = logging.getLogger(__name__)


# =============================================================================
# RLS context (same pattern as evidence_runner)
# =============================================================================

async def _set_rls(conn, program_id: UUID) -> None:
    """Set the RLS GUC for the current transaction."""
    await conn.execute(sql.SET_PROGRAM_CONTEXT, str(program_id))


# =============================================================================
# Scan lifecycle
# =============================================================================

async def run_scan(
    program_id: UUID,
    scan_type: str = "full",
    section_ref: Optional[str] = None,
    triggered_by: str = "manual",
    actor: str = "system",
) -> dict[str, Any]:
    """Execute a contradiction scan and persist the results.

    Steps:
      1. Create scan record (status='running')
      2. Delegate to evidence_runner.detect_contradictions()
      3. Update scan record with results (status='completed')
      4. Return scan summary

    On failure: marks scan as failed with error message.
    """
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)

        # 1. Create running scan record
        async with conn.transaction():
            scan_row = await conn.fetchrow(
                sql.INSERT_CONTRADICTION_SCAN,
                program_id,
                scan_type,
                section_ref,
                "running",       # status
                0,               # total_claims (placeholder)
                0,               # contradictions_found (placeholder)
                json.dumps([]),  # results (placeholder)
                triggered_by,
                actor,
            )
        scan_id = scan_row["id"]  # type: ignore[index]

        # 2. Run the actual scan (reuse existing logic)
        try:
            contradictions = await evidence_runner.detect_contradictions(
                program_id, section_ref,
            )

            # Count total claims scanned (sum of claim_count across groups)
            total_claims = sum(c.get("claim_count", 0) for c in contradictions)
            contradictions_found = len(contradictions)

            # 3. Persist results
            async with conn.transaction():
                completed_row = await conn.fetchrow(
                    sql.UPDATE_CONTRADICTION_SCAN_COMPLETE,
                    scan_id,
                    total_claims,
                    contradictions_found,
                    json.dumps(contradictions),
                )

            logger.info(
                "Scan completed: scan=%s program=%s contradictions=%d claims=%d",
                scan_id, program_id, contradictions_found, total_claims,
            )
            return dict(completed_row)  # type: ignore[arg-type]

        except Exception as e:
            # Scan failed — record the error
            logger.error("Scan failed: scan=%s error=%s", scan_id, e, exc_info=True)
            async with conn.transaction():
                await conn.fetchrow(
                    sql.UPDATE_CONTRADICTION_SCAN_FAILED,
                    scan_id,
                    str(e)[:500],
                )
            return {
                "id": scan_id,
                "program_id": program_id,
                "status": "failed",
                "error_message": str(e)[:500],
            }

    finally:
        await db.release_connection(conn)


async def get_scan(scan_id: UUID, program_id: UUID) -> Optional[dict[str, Any]]:
    """Fetch a specific scan by ID."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        row = await conn.fetchrow(sql.SELECT_CONTRADICTION_SCAN_BY_ID, scan_id)
        return dict(row) if row else None
    finally:
        await db.release_connection(conn)


async def list_scans(
    program_id: UUID,
    limit: int = 20,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """List scans for a program (newest first)."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        rows = await conn.fetch(
            sql.SELECT_CONTRADICTION_SCANS_BY_PROGRAM,
            program_id, limit, offset,
        )
        return [dict(r) for r in rows]
    finally:
        await db.release_connection(conn)


# =============================================================================
# Health Summary — aggregated evidence health for dashboard panel
# =============================================================================

async def health_summary(program_id: UUID) -> dict[str, Any]:
    """Build an evidence health summary for the dashboard.

    Returns:
        {
            "program_id": ...,
            "latest_scan": { ... } | null,
            "claims": { "active": N, "superseded": N, ... },
            "sources_count": N,
            "provenance_count": N,
            "scans": { "completed": N, "failed": N, "running": N },
            "top_contradictions": [ ... ],  # up to 5 from latest scan
        }
    """
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)

        # Latest completed scan
        scan_row = await conn.fetchrow(
            sql.SELECT_LATEST_COMPLETED_SCAN, program_id,
        )
        latest_scan = None
        top_contradictions: list = []
        if scan_row:
            latest_scan = dict(scan_row)
            # Parse results (JSONB) for top 5 contradictions
            results = latest_scan.get("results")
            if isinstance(results, str):
                results = json.loads(results)
            if isinstance(results, list):
                top_contradictions = results[:5]
            latest_scan.pop("results", None)  # Don't send full payload in summary

        # Claims breakdown by status
        claims_rows = await conn.fetch(sql.COUNT_CLAIMS_BY_STATUS, program_id)
        claims = {r["status"]: r["cnt"] for r in claims_rows}

        # Source and provenance counts
        sources_row = await conn.fetchrow(sql.COUNT_SOURCES, program_id)
        sources_count = sources_row["cnt"] if sources_row else 0

        prov_row = await conn.fetchrow(sql.COUNT_PROVENANCE_ENTRIES, program_id)
        provenance_count = prov_row["cnt"] if prov_row else 0

        # Scan counts by status
        scans_rows = await conn.fetch(sql.COUNT_SCANS_BY_STATUS, program_id)
        scans = {r["status"]: r["cnt"] for r in scans_rows}

        return {
            "program_id": str(program_id),
            "latest_scan": latest_scan,
            "claims": claims,
            "sources_count": sources_count,
            "provenance_count": provenance_count,
            "scans": scans,
            "top_contradictions": top_contradictions,
        }

    finally:
        await db.release_connection(conn)


# =============================================================================
# Nightly A8 scan — cross-tenant batch
# =============================================================================

async def run_nightly_scans(
    *,
    program_id: Optional[UUID] = None,
    max_programs: Optional[int] = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Run contradiction scans for ALL active programs.

    Queries the regulatory_programs table directly (cross-tenant) and
    runs a full scan for each with triggered_by='a8_nightly'.

    Args:
        program_id:   If set, scan only this single program.
        max_programs: Cap the number of programs to scan (safety valve).
        dry_run:      If True, log what would be scanned but skip execution.

    Returns a summary of scan results per-program.
    """
    # --- Resolve program list ---
    if program_id:
        program_ids = [program_id]
        logger.info("Nightly scan: single-program override → %s", program_id)
    else:
        conn = await db.acquire_connection()
        try:
            rows = await conn.fetch(sql.SELECT_ACTIVE_PROGRAM_IDS)
        finally:
            await db.release_connection(conn)
        program_ids = [r["id"] for r in rows]

    if max_programs and len(program_ids) > max_programs:
        logger.info(
            "Nightly scan: capping %d programs to max_programs=%d",
            len(program_ids), max_programs,
        )
        program_ids = program_ids[:max_programs]

    logger.info("Nightly scan: found %d active programs", len(program_ids))

    if dry_run:
        logger.info("DRY RUN — skipping actual scans")
        return {
            "total_programs": len(program_ids),
            "succeeded": 0,
            "failed": 0,
            "dry_run": True,
            "program_ids": [str(p) for p in program_ids],
            "results": [],
        }

    results: list[dict[str, Any]] = []
    succeeded = 0
    failed = 0

    for pid in program_ids:
        try:
            result = await run_scan(
                program_id=pid,
                scan_type="full",
                triggered_by="a8_nightly",
                actor="system",
            )
            status = result.get("status", "unknown")
            results.append({
                "program_id": str(pid),
                "scan_id": str(result.get("id", "")),
                "status": status,
                "contradictions_found": result.get("contradictions_found", 0),
            })
            if status == "completed":
                succeeded += 1
            else:
                failed += 1
        except Exception as e:
            logger.error("Nightly scan failed for program %s: %s", pid, e)
            results.append({
                "program_id": str(pid),
                "scan_id": None,
                "status": "error",
                "error": str(e)[:200],
            })
            failed += 1

    summary = {
        "total_programs": len(program_ids),
        "succeeded": succeeded,
        "failed": failed,
        "results": results,
    }
    logger.info(
        "Nightly scan complete: %d programs, %d succeeded, %d failed",
        len(program_ids), succeeded, failed,
    )
    return summary
