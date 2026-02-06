"""Orchestration Runner — core execution engine.

Responsible for:
 1. start_workflow   — create a workflow_run + materialize step_runs from template
 2. advance_workflow — compute runnable steps, queue them
 3. claim_step       — worker lock (advisory)
 4. complete_step    — mark done, emit event, advance
 5. fail_step        — mark failed, emit event, check retry
 6. a8_bridge        — delegate batch_job steps to vault.review_batches
"""

import json
import logging
from typing import Any, Optional
from uuid import UUID

import asyncpg

from . import db
from . import sql_orchestration as sql

logger = logging.getLogger(__name__)


# =============================================================================
# RLS Context helpers
# =============================================================================

async def _set_rls(conn: asyncpg.Connection, program_id: UUID) -> None:
    """Set the RLS GUC for the current transaction."""
    await conn.execute(sql.SET_PROGRAM_CONTEXT, str(program_id))


async def _set_bypass(conn: asyncpg.Connection) -> None:
    """Bypass RLS for admin/system operations."""
    await conn.execute(sql.SET_BYPASS_RLS)


# =============================================================================
# 1) start_workflow
# =============================================================================

async def start_workflow(
    program_id: UUID,
    template_code: str,
    idempotency_key: Optional[str] = None,
    context: Optional[dict[str, Any]] = None,
    priority: int = 0,
    actor: str = "system",
    request_id: Optional[str] = None,
) -> dict[str, Any]:
    """Start a new workflow run from a template.

    1. Resolve latest active template by code
    2. Insert workflow_run
    3. Materialize step_runs from step_templates
    4. Advance (queue any steps with no dependencies)

    Returns the created workflow_run record.
    Raises ValueError on invalid template or duplicate idempotency_key.
    """
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)

        async with conn.transaction():
            # 1. Resolve template
            template = await conn.fetchrow(
                sql.SELECT_WORKFLOW_TEMPLATE_BY_CODE, template_code
            )
            if template is None:
                raise ValueError(
                    f"No active workflow template found for code={template_code!r}"
                )
            template_id = template["id"]

            # 2. Insert workflow_run
            ctx_json = json.dumps(context or {})
            try:
                run = await conn.fetchrow(
                    sql.INSERT_WORKFLOW_RUN,
                    program_id,
                    template_id,
                    idempotency_key,
                    ctx_json,
                    priority,
                    actor,
                )
            except asyncpg.UniqueViolationError:
                # Idempotency: return existing run
                existing = await conn.fetchrow(
                    """
                    SELECT id, program_id, workflow_template_id, idempotency_key,
                           status, started_at, completed_at, current_step_id,
                           context, error, priority, created_at, updated_at, created_by
                    FROM orchestration.workflow_runs
                    WHERE program_id = $1 AND idempotency_key = $2
                    """,
                    program_id,
                    idempotency_key,
                )
                if existing:
                    logger.info(
                        "Idempotent start: returning existing run %s",
                        existing["id"],
                    )
                    return dict(existing)
                raise

            run_id = run["id"]

            # 3. Fetch step templates + materialize step_runs
            steps = await conn.fetch(
                sql.SELECT_STEP_TEMPLATES_FOR_WORKFLOW, template_id
            )
            for step in steps:
                await conn.fetchrow(
                    sql.INSERT_STEP_RUN,
                    run_id,
                    step["id"],
                    program_id,
                    json.dumps({}),  # empty initial input
                )

            # 4. Mark workflow as running
            run = await conn.fetchrow(
                sql.UPDATE_WORKFLOW_RUN_STATUS, run_id, "running", None
            )

            # 5. Advance — queue any steps whose deps are satisfied
            await _advance_within_txn(conn, run_id, program_id, actor, request_id)

            logger.info(
                "Started workflow run=%s template=%s program=%s",
                run_id,
                template_code,
                program_id,
            )
            return dict(run)
    finally:
        await db.release_connection(conn)


# =============================================================================
# 2) advance_workflow — compute & queue runnable steps
# =============================================================================

async def advance_workflow(
    workflow_run_id: UUID,
    program_id: UUID,
    actor: str = "system",
    request_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Compute runnable steps and queue them.

    Returns the list of newly-queued step runs.
    """
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        async with conn.transaction():
            return await _advance_within_txn(
                conn, workflow_run_id, program_id, actor, request_id
            )
    finally:
        await db.release_connection(conn)


async def _advance_within_txn(
    conn: asyncpg.Connection,
    workflow_run_id: UUID,
    program_id: UUID,
    actor: str = "system",
    request_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Inner advance logic (must be inside a transaction)."""
    runnable = await conn.fetch(sql.SELECT_RUNNABLE_STEPS, workflow_run_id)
    queued = []
    for step in runnable:
        result = await conn.fetchrow(sql.UPDATE_STEP_RUN_QUEUE, step["id"])
        if result:
            # Emit event
            await conn.fetchrow(
                sql.INSERT_STEP_RUN_EVENT,
                step["id"],
                program_id,
                "status_change",
                "pending",
                "queued",
                json.dumps({"request_id": request_id} if request_id else {}),
                actor,
            )
            queued.append(dict(step))

    # Check if workflow is complete (all steps completed or failed/skipped)
    all_steps = await conn.fetch(sql.SELECT_STEP_RUNS_FOR_WORKFLOW_RUN, workflow_run_id)
    terminal = {"completed", "failed", "skipped", "cancelled"}
    if all_steps and all(row["status"] in terminal for row in all_steps):
        # All done — determine final status
        any_failed = any(row["status"] == "failed" for row in all_steps)
        final_status = "failed" if any_failed else "completed"
        await conn.fetchrow(
            sql.UPDATE_WORKFLOW_RUN_STATUS,
            workflow_run_id,
            final_status,
            None,
        )
        logger.info(
            "Workflow %s finished with status=%s", workflow_run_id, final_status
        )

    return queued


# =============================================================================
# 3) claim_step — worker lock
# =============================================================================

async def claim_step(
    step_run_id: UUID,
    worker_id: str,
    program_id: UUID,
    actor: str = "system",
    request_id: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Attempt to claim a queued step for processing.

    Returns the claimed step_run or None if already claimed / not queued.
    """
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        async with conn.transaction():
            row = await conn.fetchrow(sql.CLAIM_STEP_RUN, step_run_id, worker_id)
            if row is None:
                return None
            # Emit event
            await conn.fetchrow(
                sql.INSERT_STEP_RUN_EVENT,
                step_run_id,
                program_id,
                "status_change",
                "queued",
                "running",
                json.dumps({"worker_id": worker_id, "request_id": request_id}),
                actor,
            )
            return dict(row)
    finally:
        await db.release_connection(conn)


# =============================================================================
# 4) complete_step
# =============================================================================

async def complete_step(
    step_run_id: UUID,
    output: dict[str, Any],
    program_id: UUID,
    actor: str = "system",
    request_id: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Mark a running step as completed and advance the workflow.

    Returns the updated step_run or None if step was not running.
    """
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        async with conn.transaction():
            row = await conn.fetchrow(
                sql.COMPLETE_STEP_RUN, step_run_id, json.dumps(output)
            )
            if row is None:
                return None

            # Emit event
            await conn.fetchrow(
                sql.INSERT_STEP_RUN_EVENT,
                step_run_id,
                program_id,
                "status_change",
                "running",
                "completed",
                json.dumps({"output_keys": list(output.keys()), "request_id": request_id}),
                actor,
            )

            # Merge step output into workflow context
            await conn.execute(
                sql.UPDATE_WORKFLOW_RUN_CONTEXT,
                row["workflow_run_id"],
                json.dumps({f"step_{step_run_id}": output}),
            )

            # Advance workflow — queue next steps
            await _advance_within_txn(
                conn, row["workflow_run_id"], program_id, actor, request_id
            )

            return dict(row)
    finally:
        await db.release_connection(conn)


# =============================================================================
# 5) fail_step
# =============================================================================

async def fail_step(
    step_run_id: UUID,
    error: str,
    program_id: UUID,
    actor: str = "system",
    request_id: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Mark a running step as failed.

    Checks retry_policy — if attempts remain, re-queues.
    Returns the updated step_run or None if step was not running.
    """
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        async with conn.transaction():
            row = await conn.fetchrow(sql.FAIL_STEP_RUN, step_run_id, error)
            if row is None:
                return None

            # Emit event
            await conn.fetchrow(
                sql.INSERT_STEP_RUN_EVENT,
                step_run_id,
                program_id,
                "status_change",
                "running",
                "failed",
                json.dumps({"error": error, "request_id": request_id}),
                actor,
            )

            # Check retry policy
            step_detail = await conn.fetchrow(
                sql.SELECT_STEP_RUN_BY_ID, step_run_id
            )
            if step_detail:
                # Fetch retry config from step template
                tpl = await conn.fetchrow(
                    """
                    SELECT retry_policy
                    FROM orchestration.step_templates
                    WHERE id = $1
                    """,
                    step_detail["step_template_id"],
                )
                retry_policy = (
                    json.loads(tpl["retry_policy"])
                    if tpl and tpl["retry_policy"]
                    else {}
                )
                max_attempts = retry_policy.get("max_attempts", 1)
                current_attempt = step_detail["attempt"]

                if current_attempt < max_attempts:
                    # Create a new step_run with incremented attempt
                    new_sr = await conn.fetchrow(
                        """
                        INSERT INTO orchestration.step_runs
                            (workflow_run_id, step_template_id, program_id,
                             status, attempt, input)
                        VALUES ($1, $2, $3, 'queued', $4, $5)
                        RETURNING id
                        """,
                        step_detail["workflow_run_id"],
                        step_detail["step_template_id"],
                        program_id,
                        current_attempt + 1,
                        json.dumps(dict(step_detail["input"]) if step_detail["input"] else {}),
                    )
                    await conn.fetchrow(
                        sql.INSERT_STEP_RUN_EVENT,
                        new_sr["id"],
                        program_id,
                        "retry",
                        "failed",
                        "queued",
                        json.dumps({
                            "prev_step_run_id": str(step_run_id),
                            "attempt": current_attempt + 1,
                        }),
                        actor,
                    )
                    logger.info(
                        "Retrying step %s → new attempt %d/%d",
                        step_run_id,
                        current_attempt + 1,
                        max_attempts,
                    )

            # Advance workflow (may mark workflow failed if all done)
            await _advance_within_txn(
                conn, row["workflow_run_id"], program_id, actor, request_id
            )

            return dict(row)
    finally:
        await db.release_connection(conn)


# =============================================================================
# 6) A8 Bridge — delegate batch_job steps to vault.review_batches
# =============================================================================

async def create_batch_for_step(
    step_run_id: UUID,
    program_id: UUID,
    batch_config: dict[str, Any],
    actor: str = "system",
) -> Optional[UUID]:
    """Create a vault.review_batches row and link it to the step_run.

    This bridges the orchestration layer with the existing A8 batch worker.
    Returns the batch_id or None if vault schema not available.
    """
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        async with conn.transaction():
            # Check if vault.review_batches exists
            exists = await conn.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'vault' AND table_name = 'review_batches'
                )
                """
            )
            if not exists:
                logger.warning(
                    "vault.review_batches not found — A8 bridge unavailable"
                )
                return None

            # Insert batch
            batch_row = await conn.fetchrow(
                """
                INSERT INTO vault.review_batches
                    (program_id, status, config, created_by)
                VALUES ($1, 'pending', $2, $3)
                RETURNING batch_id
                """,
                program_id,
                json.dumps(batch_config),
                actor,
            )
            batch_id = batch_row["batch_id"]

            # Link to step_run
            await conn.fetchrow(
                sql.UPDATE_STEP_RUN_BATCH_ID, step_run_id, batch_id
            )

            # Emit event
            await conn.fetchrow(
                sql.INSERT_STEP_RUN_EVENT,
                step_run_id,
                program_id,
                "batch_created",
                None,
                None,
                json.dumps({"batch_id": str(batch_id)}),
                actor,
            )

            logger.info(
                "A8 bridge: step_run=%s → batch_id=%s", step_run_id, batch_id
            )
            return batch_id
    finally:
        await db.release_connection(conn)


async def on_batch_complete(
    batch_id: UUID,
    program_id: UUID,
    output: dict[str, Any],
    actor: str = "system",
    request_id: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Called when an A8 batch completes — marks the linked step_run as completed.

    Returns the completed step_run or None.
    """
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        async with conn.transaction():
            # Find the linked step_run
            step_run = await conn.fetchrow(
                """
                SELECT id, workflow_run_id, program_id, status
                FROM orchestration.step_runs
                WHERE batch_id = $1 AND status = 'running'
                """,
                batch_id,
            )
            if step_run is None:
                logger.warning(
                    "No running step_run found for batch_id=%s", batch_id
                )
                return None

            # Complete it
            row = await conn.fetchrow(
                sql.COMPLETE_STEP_RUN, step_run["id"], json.dumps(output)
            )
            if row:
                await conn.fetchrow(
                    sql.INSERT_STEP_RUN_EVENT,
                    step_run["id"],
                    program_id,
                    "status_change",
                    "running",
                    "completed",
                    json.dumps({
                        "batch_id": str(batch_id),
                        "trigger": "a8_batch_complete",
                        "request_id": request_id,
                    }),
                    actor,
                )
                await _advance_within_txn(
                    conn, step_run["workflow_run_id"], program_id, actor, request_id
                )
            return dict(row) if row else None
    finally:
        await db.release_connection(conn)


# =============================================================================
# Read helpers
# =============================================================================

async def get_workflow_run(
    run_id: UUID, program_id: UUID
) -> Optional[dict[str, Any]]:
    """Fetch a single workflow run with its step runs."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        run = await conn.fetchrow(sql.SELECT_WORKFLOW_RUN_BY_ID, run_id)
        if run is None:
            return None
        steps = await conn.fetch(
            sql.SELECT_STEP_RUNS_FOR_WORKFLOW_RUN, run_id
        )
        result = dict(run)
        result["steps"] = [dict(s) for s in steps]
        return result
    finally:
        await db.release_connection(conn)


async def list_workflow_runs(
    program_id: UUID, limit: int = 50, offset: int = 0
) -> list[dict[str, Any]]:
    """List workflow runs for a program."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        rows = await conn.fetch(
            sql.SELECT_WORKFLOW_RUNS_BY_PROGRAM, program_id, limit, offset
        )
        return [dict(r) for r in rows]
    finally:
        await db.release_connection(conn)


async def get_step_queue(program_id: UUID) -> list[dict[str, Any]]:
    """List claimable (queued) steps for a program."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        rows = await conn.fetch(sql.SELECT_CLAIMABLE_STEPS, program_id)
        return [dict(r) for r in rows]
    finally:
        await db.release_connection(conn)


async def get_step_events(
    step_run_id: UUID, program_id: UUID
) -> list[dict[str, Any]]:
    """List events for a step run."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        rows = await conn.fetch(sql.SELECT_EVENTS_FOR_STEP_RUN, step_run_id)
        return [dict(r) for r in rows]
    finally:
        await db.release_connection(conn)
