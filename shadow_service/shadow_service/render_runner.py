"""Phase 7.0A–D — Render Job Runner (in-process, synchronous).

Executes render jobs by dispatching to the correct renderer based on artifact_type.
No Redis/Celery — this is the simplest possible runner for v1.

Phase 7.0C: Added program_id ownership enforcement.
Phase 7.0D: Added concurrency cap, rate limiting, idempotency, TTL cleanup.

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
# Phase 7.0D — Rate Limiting & Concurrency Guards
# ═══════════════════════════════════════════════════════════════════════════════

async def check_concurrency_cap(pool, program_id: str) -> None:
    """Raise if program exceeds max concurrent render jobs (QUEUED + RUNNING).

    Prevents resource exhaustion from a single tenant.
    """
    from .config import get_settings
    settings = get_settings()
    max_concurrent = settings.render_max_concurrent_per_program + settings.render_max_queued_per_program

    row = await pool.fetchrow(rj_sql.COUNT_ACTIVE_JOBS_BY_PROGRAM, program_id)
    active = row["cnt"] if row else 0
    if active >= max_concurrent:
        raise ValueError(
            f"Concurrency cap exceeded: program {program_id[:8]}… has {active} active jobs "
            f"(max {max_concurrent}). Wait for existing jobs to complete."
        )


async def check_rate_limit(pool, program_id: str) -> None:
    """Raise if program exceeds rate limit (renders per time window).

    Prevents abuse — e.g., 20 renders per 10 minutes.
    """
    from .config import get_settings
    settings = get_settings()

    row = await pool.fetchrow(
        rj_sql.COUNT_RECENT_RENDERS_BY_PROGRAM,
        program_id,
        settings.render_rate_limit_window_seconds,
    )
    recent = row["cnt"] if row else 0
    if recent >= settings.render_rate_limit_max_requests:
        raise ValueError(
            f"Rate limit exceeded: program {program_id[:8]}… has {recent} renders "
            f"in {settings.render_rate_limit_window_seconds}s window "
            f"(max {settings.render_rate_limit_max_requests}). Try again later."
        )


async def check_idempotency(pool, idempotency_key: str | None, program_id: str = ""):
    """Return existing job if idempotency key + program matches, else None."""
    if not idempotency_key:
        return None
    row = await pool.fetchrow(rj_sql.SELECT_RENDER_JOB_BY_IDEMPOTENCY_KEY, idempotency_key, program_id)
    return dict(row) if row else None


async def cleanup_expired_jobs(pool, ttl_days: int | None = None) -> int:
    """Delete FAILED jobs older than TTL. Returns count deleted."""
    from .config import get_settings
    if ttl_days is None:
        ttl_days = get_settings().render_job_ttl_days

    rows = await pool.fetch(rj_sql.DELETE_EXPIRED_FAILED_JOBS, ttl_days)
    count = len(rows)
    if count > 0:
        logger.info("TTL cleanup: deleted %d expired FAILED render jobs (ttl=%d days)", count, ttl_days)
    return count


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
    program_id: str = "",
    idempotency_key: str | None = None,
    options: dict[str, Any] | None = None,
    reuse_completed: bool = True,
) -> tuple[bytes, dict[str, Any]]:
    """Create a render job and execute it immediately.

    Phase 7.0C: Enforces program_id is stored on the job.
    Phase 7.0D: Checks idempotency, concurrency cap, and rate limit.

    Returns (artifact_bytes, job_record_dict).
    """
    # ── Phase 7.0D — Idempotency check ──
    existing_job = await check_idempotency(pool, idempotency_key, program_id)
    if existing_job:
        logger.info(
            "Idempotency key '%s' matched existing job %s (status=%s)",
            idempotency_key, existing_job["id"], existing_job["status"],
        )
        if existing_job["status"] == "COMPLETED":
            # Re-render bytes (v1: no blob cache)
            renderer = get_renderer(artifact_type)
            pp_full = await pool.fetchrow(
                pp_sql.SELECT_PROOF_PACK_FOR_DOWNLOAD_BY_ID, existing_job["proof_pack_id"]
            )
            if pp_full:
                artifact_bytes = renderer(pp_full, request_id)
                return artifact_bytes, existing_job
        # Return existing (possibly still running) — let caller handle status
        return b"", existing_job

    # ── Phase 7.0D — Concurrency + rate limit checks ──
    if program_id:
        await check_concurrency_cap(pool, program_id)
        await check_rate_limit(pool, program_id)

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

    # Insert QUEUED job — Phase 7.0C: includes program_id; 7.0D: includes idempotency_key
    job = await pool.fetchrow(
        rj_sql.INSERT_RENDER_JOB,
        pp_row["id"],            # $1: proof_pack_id (UUID)
        artifact_type,           # $2
        "QUEUED",                # $3: status
        inputs_hash,             # $4
        user_id,                 # $5: created_by
        request_id,              # $6
        program_id or str(pp_row.get("program_id", "")),  # $7: program_id
        idempotency_key,         # $8: idempotency_key
    )

    render_job_id = str(job["id"])

    # Execute immediately (in-process, synchronous)
    artifact_bytes = await execute_render_job(pool, render_job_id)

    # Re-fetch final state
    final_job = await pool.fetchrow(rj_sql.SELECT_RENDER_JOB_BY_ID, job["id"])
    return artifact_bytes, dict(final_job) if final_job else {}
