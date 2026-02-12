"""Phase 7.0A — Render Job Runner (in-process, synchronous).

Executes render jobs by dispatching to the correct renderer based on artifact_type.
No Redis/Celery — this is the simplest possible runner for v1.

Usage:
    from .render_runner import execute_render_job
    result_bytes = await execute_render_job(pool, render_job_id)

Lifecycle:
    QUEUED → RUNNING → COMPLETED | FAILED
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import traceback
from datetime import datetime, timezone
from typing import Any

from .models_render import (
    ArtifactType,
    ARTIFACT_OUTPUT_PATHS,
    RenderResult,
    RenderStatus,
    compute_inputs_hash,
)
from . import sql_render_jobs as rj_sql
from . import sql_proof_pack as pp_sql

logger = logging.getLogger(__name__)

# Maximum render execution time (seconds) to prevent DoS
RENDER_TIMEOUT_SECONDS = 60


# ═══════════════════════════════════════════════════════════════════════════════
# Renderer Registry
# ═══════════════════════════════════════════════════════════════════════════════

# Maps artifact_type → callable(proof_pack_row, options) → bytes
_RENDERERS: dict[str, Any] = {}


def register_renderer(artifact_type: str):
    """Decorator to register a renderer function for an artifact type."""
    def decorator(fn):
        _RENDERERS[artifact_type] = fn
        return fn
    return decorator


def get_renderer(artifact_type: str):
    """Get the renderer function for an artifact type."""
    renderer = _RENDERERS.get(artifact_type)
    if not renderer:
        raise ValueError(f"No renderer registered for artifact_type={artifact_type}")
    return renderer


# ═══════════════════════════════════════════════════════════════════════════════
# Job Execution
# ═══════════════════════════════════════════════════════════════════════════════

async def execute_render_job(pool, render_job_id: str) -> bytes:
    """Execute a render job end-to-end: QUEUED → RUNNING → COMPLETED|FAILED.

    Returns the rendered artifact bytes on success.
    Raises on failure (job status set to FAILED in DB).
    """
    # 1. Transition QUEUED → RUNNING
    started = await pool.fetchrow(rj_sql.UPDATE_RENDER_JOB_STARTED, render_job_id)
    if not started:
        # Maybe already running or completed — check current state
        job = await pool.fetchrow(rj_sql.SELECT_RENDER_JOB_BY_ID, render_job_id)
        if not job:
            raise ValueError(f"Render job not found: {render_job_id}")
        raise ValueError(
            f"Cannot start render job {render_job_id}: current status={job['status']}"
        )

    artifact_type = started["artifact_type"]
    proof_pack_id = str(started["proof_pack_id"])

    try:
        # 2. Load proof pack data (full join with defense_packets)
        pp_row = await pool.fetchrow(pp_sql.SELECT_PROOF_PACK_FOR_DOWNLOAD_BY_ID, started["proof_pack_id"])
        if not pp_row:
            raise ValueError(f"Proof pack not found: {proof_pack_id}")

        # 3. Check block_download — if the pack is blocked, refuse to render
        if pp_row.get("block_download"):
            raise ValueError(
                f"Proof pack {proof_pack_id} has block_download=true "
                f"(drift_severity={pp_row.get('drift_severity')}). Cannot render."
            )

        # 4. Dispatch to registered renderer (with timeout guard)
        renderer = get_renderer(artifact_type)
        loop = asyncio.get_event_loop()
        try:
            artifact_bytes = await asyncio.wait_for(
                loop.run_in_executor(None, renderer, pp_row, started.get("request_id", "")),
                timeout=RENDER_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            raise TimeoutError(
                f"Render timed out after {RENDER_TIMEOUT_SECONDS}s for job {render_job_id}"
            )

        # 5. Compute hash + size
        artifact_hash = hashlib.sha256(artifact_bytes).hexdigest()
        artifact_size = len(artifact_bytes)
        if artifact_type not in ARTIFACT_OUTPUT_PATHS:
            raise ValueError(f"Unknown artifact_type for path mapping: {artifact_type}")
        artifact_path = ARTIFACT_OUTPUT_PATHS[artifact_type]

        # 6. Transition RUNNING → COMPLETED
        completed = await pool.fetchrow(
            rj_sql.UPDATE_RENDER_JOB_COMPLETED,
            render_job_id,
            artifact_hash,
            artifact_size,
            artifact_path,
        )
        if not completed:
            logger.warning("Render job %s: COMPLETED update returned no row", render_job_id)

        logger.info(
            "Render job %s COMPLETED: type=%s, size=%d, hash=%s…",
            render_job_id, artifact_type, artifact_size, artifact_hash[:16],
        )
        return artifact_bytes

    except Exception as exc:
        # Transition RUNNING → FAILED
        error_msg = f"{type(exc).__name__}: {exc}"
        try:
            await pool.fetchrow(rj_sql.UPDATE_RENDER_JOB_FAILED, render_job_id, error_msg[:2000])
        except Exception as db_exc:
            logger.error("Failed to mark render job %s as FAILED: %s", render_job_id, db_exc)
        logger.error("Render job %s FAILED: %s", render_job_id, error_msg)
        raise


async def create_and_execute_render(
    pool,
    *,
    proof_pack_id: str,
    artifact_type: str,
    user_id: str = "system",
    request_id: str = "",
    options: dict[str, Any] | None = None,
    reuse_completed: bool = True,
) -> tuple[bytes, dict[str, Any]]:
    """Create a render job and execute it immediately.

    If reuse_completed=True and a COMPLETED job with the same inputs_hash
    exists, return a placeholder (the caller still needs the artifact bytes
    from a cache or re-render). For v1, we always re-render.

    Returns (artifact_bytes, job_record_dict).
    """
    # Load proof pack to compute inputs_hash
    pp_row = await pool.fetchrow(pp_sql.SELECT_PROOF_PACK_BY_ID, proof_pack_id)
    if not pp_row:
        raise ValueError(f"Proof pack not found: {proof_pack_id}")

    manifest_json = pp_row.get("manifest_json")
    if isinstance(manifest_json, str):
        manifest_json = json.loads(manifest_json)

    # Import here to avoid circular import
    from .contract_hashes import get_contract_snapshot
    contract = get_contract_snapshot()

    inputs_hash = compute_inputs_hash(proof_pack_id, artifact_type, manifest_json, contract)

    # Check for existing QUEUED/RUNNING job with same inputs to prevent duplicate work
    existing = await pool.fetchrow(
        """SELECT id, status FROM predicate.render_jobs
           WHERE inputs_hash = $1 AND status IN ('QUEUED', 'RUNNING')
           ORDER BY created_at DESC LIMIT 1""",
        inputs_hash,
    )
    if existing:
        logger.info(
            "Duplicate render prevented: existing job %s (status=%s) for inputs_hash=%s",
            existing["id"], existing["status"], inputs_hash[:16],
        )
        # Wait briefly then check if it completed
        await asyncio.sleep(0.5)
        maybe_done = await pool.fetchrow(rj_sql.SELECT_RENDER_JOB_BY_INPUTS_HASH, inputs_hash)
        if maybe_done and maybe_done["status"] == "COMPLETED":
            # Re-render to get bytes (v1: no blob cache)
            renderer = get_renderer(artifact_type)
            pp_full = await pool.fetchrow(pp_sql.SELECT_PROOF_PACK_FOR_DOWNLOAD_BY_ID, pp_row["id"])
            artifact_bytes = renderer(pp_full or pp_row, request_id)
            return artifact_bytes, dict(maybe_done)

    # Insert QUEUED job
    job = await pool.fetchrow(
        rj_sql.INSERT_RENDER_JOB,
        pp_row["id"],            # proof_pack_id (UUID)
        artifact_type,
        "QUEUED",
        inputs_hash,
        user_id,
        request_id,
    )

    render_job_id = str(job["id"])

    # Execute immediately (in-process, synchronous)
    artifact_bytes = await execute_render_job(pool, render_job_id)

    # Re-fetch final state
    final_job = await pool.fetchrow(rj_sql.SELECT_RENDER_JOB_BY_ID, job["id"])
    return artifact_bytes, dict(final_job) if final_job else {}
