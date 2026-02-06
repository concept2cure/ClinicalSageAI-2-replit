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
        scan_id = scan_row["id"]

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
            return dict(completed_row)

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
