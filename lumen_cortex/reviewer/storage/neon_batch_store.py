"""Neon (PostgreSQL) batch store adapter."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine, Protocol

from .models import BatchRow, BatchSummaryUpdate, DocRow


class AsyncExecutor(Protocol):
    """Protocol for async SQL execution."""

    async def __call__(
        self,
        query: str,
        params: tuple[Any, ...] | None = None,
    ) -> list[dict[str, Any]]:
        """Execute query and return rows as dicts."""
        ...


class NeonBatchStore:
    """
    Batch persistence adapter for Neon PostgreSQL.

    Isolates all SQL from reviewer business logic.
    Supports deterministic testing via injected executor.
    """

    def __init__(self, execute_fn: AsyncExecutor) -> None:
        """
        Initialize with async SQL executor.

        Args:
            execute_fn: Async function that executes SQL and returns rows.
        """
        self._execute = execute_fn

    async def create_or_get_batch(
        self,
        batch_id: str,
        program_id: str,
        mode: str,
        ruleset_version: str,
        extractor_version: str,
        response_mode: str,
        request_digest: str,
        documents_total: int,
        idempotency_key: str | None = None,
    ) -> tuple[BatchRow, bool]:
        """
        Create a new batch or return existing one (idempotency).

        Args:
            batch_id: Deterministic UUID for the batch
            program_id: Program UUID
            mode: 'sync' or 'async'
            ruleset_version: Version string for ruleset
            extractor_version: Version string for extractor
            response_mode: 'summary' or 'full'
            request_digest: SHA256 of normalized request
            documents_total: Number of documents in batch
            idempotency_key: Optional client-provided key

        Returns:
            Tuple of (BatchRow, was_created). was_created=False means
            an existing batch was returned (idempotent hit).
        """
        # Try to find existing batch by idempotency key first
        if idempotency_key:
            existing = await self._get_batch_by_idempotency_key(
                program_id, idempotency_key
            )
            if existing:
                return existing, False

        # Insert new batch
        query = """
            INSERT INTO vault.review_batches (
                batch_id, program_id, status, mode, ruleset_version,
                extractor_version, response_mode, idempotency_key,
                request_digest, documents_total, created_at,
                queued_at, docs_total, docs_processed, docs_succeeded, docs_failed
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $10, 0, 0, 0)
            ON CONFLICT (batch_id) DO NOTHING
            RETURNING *
        """
        now = datetime.now(timezone.utc)
        initial_status = "queued" if mode == "async" else "running"

        rows = await self._execute(
            query,
            (
                batch_id,
                program_id,
                initial_status,
                mode,
                ruleset_version,
                extractor_version,
                response_mode,
                idempotency_key,
                request_digest,
                documents_total,
                now,
            ),
        )

        if rows:
            return self._row_to_batch(rows[0]), True

        # Conflict on batch_id - fetch existing
        existing = await self.get_batch(batch_id)
        if existing:
            return existing, False

        # Should not happen, but handle gracefully
        raise RuntimeError(f"Failed to create or retrieve batch {batch_id}")

    async def _get_batch_by_idempotency_key(
        self,
        program_id: str,
        idempotency_key: str,
    ) -> BatchRow | None:
        """Find batch by program + idempotency key."""
        query = """
            SELECT * FROM vault.review_batches
            WHERE program_id = $1 AND idempotency_key = $2
        """
        rows = await self._execute(query, (program_id, idempotency_key))
        return self._row_to_batch(rows[0]) if rows else None

    async def mark_batch_running(
        self,
        batch_id: str,
        program_id: str,
        worker_id: str | None = None,
        started_at: datetime | None = None,
    ) -> None:
        """
        Mark batch as running (for async mode).

        Args:
            batch_id: Batch UUID
            program_id: Program UUID for RLS filtering
            worker_id: Worker identifier
            started_at: Optional timestamp (defaults to now)
        """
        now = started_at or datetime.now(timezone.utc)
        query = """
            UPDATE vault.review_batches
            SET status = 'running',
                started_at = $2,
                heartbeat_at = $2,
                worker_id = $3,
                attempt_count = attempt_count + 1
            WHERE batch_id = $1 AND program_id = $4 AND status = 'queued'
        """
        await self._execute(query, (batch_id, now, worker_id, program_id))

    async def heartbeat(
        self,
        batch_id: str,
        program_id: str,
        docs_processed: int,
        docs_succeeded: int,
        docs_failed: int,
    ) -> None:
        """
        Update heartbeat timestamp and progress counters.

        Called periodically during processing to indicate liveness.

        Args:
            batch_id: Batch UUID
            program_id: Program UUID for RLS filtering
            docs_total: Total documents to process
            docs_processed: Total documents processed so far
            docs_succeeded: Documents that succeeded
            docs_failed: Documents that failed
        """
        query = """
            UPDATE vault.review_batches
            SET heartbeat_at = $2,
                docs_processed = $3,
                docs_succeeded = $4,
                docs_failed = $5
            WHERE batch_id = $1 AND program_id = $6
        """
        await self._execute(
            query,
            (batch_id, datetime.now(timezone.utc), docs_processed, docs_succeeded, docs_failed, program_id),
        )

    async def claim_next_queued_batch(
        self,
        program_id: str,
        worker_id: str,
    ) -> str | None:
        """
        Atomically claim the next queued batch for processing.

        Args:
            program_id: Program UUID for RLS filtering
            worker_id: Worker identifier

        Returns:
            Claimed batch_id or None if none available
        """
        query = """
            WITH next_batch AS (
                SELECT batch_id
                FROM vault.review_batches
                WHERE program_id = $1
                  AND status = 'queued'
                ORDER BY queued_at, batch_id
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            UPDATE vault.review_batches
            SET status = 'running',
                started_at = COALESCE(started_at, now()),
                heartbeat_at = now(),
                worker_id = $2,
                attempt_count = attempt_count + 1
            WHERE program_id = $1
              AND batch_id IN (SELECT batch_id FROM next_batch)
            RETURNING batch_id
        """
        rows = await self._execute(query, (program_id, worker_id))
        return str(rows[0]["batch_id"]) if rows else None

    async def sweep_stalled_batches(
        self,
        program_id: str,
        stall_seconds: int,
        max_attempts: int,
    ) -> dict[str, Any]:
        """
        Find and handle stalled batches.

        For batches with attempts remaining: requeue them.
        For batches at max attempts: mark as failed.

        Args:
            program_id: Program UUID to scope sweep
            stall_seconds: Seconds after which heartbeat is considered stale
            max_attempts: Maximum retry attempts before permanent failure
            worker_id: Optional worker ID for logging

        Returns:
            List of affected batch_ids
        """
        query = """
            WITH stalled AS (
                SELECT batch_id, attempt_count
                FROM vault.review_batches
                WHERE program_id = $1
                  AND status = 'running'
                  AND (
                    heartbeat_at < now() - ($2 || ' seconds')::interval
                    OR (heartbeat_at IS NULL AND started_at < now() - ($2 || ' seconds')::interval)
                  )
            ),
            requeued AS (
                UPDATE vault.review_batches
                SET status = 'queued',
                    started_at = NULL,
                    heartbeat_at = NULL,
                    worker_id = NULL,
                    last_error = 'requeued_due_to_stall'
                WHERE program_id = $1
                  AND batch_id IN (SELECT batch_id FROM stalled WHERE attempt_count < $3)
                RETURNING batch_id
            ),
            failed AS (
                UPDATE vault.review_batches
                SET status = 'failed',
                    completed_at = now(),
                    last_error = 'stalled_exceeded_attempts'
                WHERE program_id = $1
                  AND batch_id IN (SELECT batch_id FROM stalled WHERE attempt_count >= $3)
                RETURNING batch_id
            )
            SELECT
                COALESCE((SELECT array_agg(batch_id) FROM requeued), ARRAY[]::uuid[]) AS requeued_ids,
                COALESCE((SELECT array_agg(batch_id) FROM failed), ARRAY[]::uuid[]) AS failed_ids
        """
        rows = await self._execute(query, (program_id, str(stall_seconds), max_attempts))
        row = rows[0] if rows else {"requeued_ids": [], "failed_ids": []}
        requeued_ids = [str(bid) for bid in (row.get("requeued_ids") or [])]
        failed_ids = [str(bid) for bid in (row.get("failed_ids") or [])]
        return {
            "requeued": len(requeued_ids),
            "failed": len(failed_ids),
            "requeued_ids": requeued_ids,
            "failed_ids": failed_ids,
        }

    async def upsert_doc_result(
        self,
        batch_id: str,
        program_id: str,
        doc_id: str,
        content_hash: str,
        status: str,
        filename: str | None = None,
        errors: list[dict[str, Any]] | None = None,
        findings_count: int = 0,
        findings_digest: str = "0" * 64,
        findings_preview: list[dict[str, Any]] | None = None,
    ) -> DocRow:
        """
        Insert or update a document result.

        Args:
            batch_id: Parent batch UUID
            program_id: Program UUID
            doc_id: Document UUID
            content_hash: SHA256 of document content
            status: 'succeeded' or 'failed'
            filename: Original filename
            errors: List of error dicts (for failed docs)
            findings_count: Number of findings
            findings_digest: SHA256 of canonical findings
            findings_preview: First N findings (bounded)

        Returns:
            The upserted DocRow
        """
        query = """
            INSERT INTO vault.review_batch_docs (
                batch_id, doc_id, program_id, filename, content_hash,
                status, errors, findings_count, findings_digest,
                findings_preview, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (batch_id, doc_id) DO UPDATE SET
                status = EXCLUDED.status,
                errors = EXCLUDED.errors,
                findings_count = EXCLUDED.findings_count,
                findings_digest = EXCLUDED.findings_digest,
                findings_preview = EXCLUDED.findings_preview
            RETURNING *
        """
        now = datetime.now(timezone.utc)
        rows = await self._execute(
            query,
            (
                batch_id,
                doc_id,
                program_id,
                filename,
                content_hash,
                status,
                json.dumps(errors or []),
                findings_count,
                findings_digest,
                json.dumps(findings_preview or []),
                now,
            ),
        )
        return self._row_to_doc(rows[0])

    async def finalize_batch(
        self,
        batch_id: str,
        program_id: str,
        summary: BatchSummaryUpdate,
        status: str = "completed",
        completed_at: datetime | None = None,
        last_error: str | None = None,
        docs_total: int | None = None,
        docs_succeeded: int | None = None,
        docs_failed: int | None = None,
    ) -> BatchRow:
        """
        Finalize batch with summary statistics.

        Args:
            batch_id: Batch UUID
            program_id: Program UUID for RLS filtering
            summary: Aggregated summary data
            status: Final status ('completed' or 'failed')
            completed_at: Completion timestamp (defaults to now)
            last_error: Error message if failed
            docs_total: Total number of documents
            docs_succeeded: Number of successfully processed documents
            docs_failed: Number of failed documents

        Returns:
            Updated BatchRow
        """
        # Use summary values if not explicitly provided
        final_docs_succeeded = docs_succeeded if docs_succeeded is not None else summary.documents_succeeded
        final_docs_failed = docs_failed if docs_failed is not None else summary.documents_failed
        final_docs_total = docs_total if docs_total is not None else (final_docs_succeeded + final_docs_failed)

        query = """
            UPDATE vault.review_batches SET
                status = $2,
                documents_succeeded = $3,
                documents_failed = $4,
                findings_total = $5,
                by_severity = $6,
                error_summary = $7,
                completed_at = $8,
                last_error = $9,
                docs_total = $10,
                docs_succeeded = $3,
                docs_failed = $4,
                docs_processed = $3 + $4
            WHERE batch_id = $1 AND program_id = $11
            RETURNING *
        """
        rows = await self._execute(
            query,
            (
                batch_id,
                status,
                final_docs_succeeded,
                final_docs_failed,
                summary.findings_total,
                json.dumps(summary.by_severity),
                json.dumps(summary.error_summary),
                completed_at or datetime.now(timezone.utc),
                last_error,
                final_docs_total,
                program_id,
            ),
        )
        return self._row_to_batch(rows[0]) if rows else None

    async def get_batch(self, batch_id: str, program_id: str | None = None) -> BatchRow | None:
        """
        Get batch by ID.

        Args:
            batch_id: Batch UUID
            program_id: Optional program UUID for RLS filtering

        Returns:
            BatchRow or None if not found
        """
        if program_id:
            query = "SELECT * FROM vault.review_batches WHERE batch_id = $1 AND program_id = $2"
            rows = await self._execute(query, (batch_id, program_id))
        else:
            query = "SELECT * FROM vault.review_batches WHERE batch_id = $1"
            rows = await self._execute(query, (batch_id,))
        return self._row_to_batch(rows[0]) if rows else None

    async def get_batch_docs(self, batch_id: str, program_id: str | None = None) -> list[DocRow]:
        """
        Get all document results for a batch.

        Args:
            batch_id: Batch UUID
            program_id: Optional program UUID for RLS filtering

        Returns:
            List of DocRow (may be empty)
        """
        if program_id:
            query = """
                SELECT * FROM vault.review_batch_docs
                WHERE batch_id = $1 AND program_id = $2
                ORDER BY created_at, doc_id
            """
            rows = await self._execute(query, (batch_id, program_id))
        else:
            query = """
                SELECT * FROM vault.review_batch_docs
                WHERE batch_id = $1
                ORDER BY created_at, doc_id
            """
            rows = await self._execute(query, (batch_id,))
        return [self._row_to_doc(r) for r in rows]

    def _row_to_batch(self, row: dict[str, Any]) -> BatchRow:
        """Convert database row dict to BatchRow."""
        by_severity = row.get("by_severity", {})
        if isinstance(by_severity, str):
            by_severity = json.loads(by_severity)

        error_summary = row.get("error_summary", [])
        if isinstance(error_summary, str):
            error_summary = json.loads(error_summary)

        return BatchRow(
            batch_id=str(row["batch_id"]),
            program_id=str(row["program_id"]),
            status=row["status"],
            mode=row["mode"],
            ruleset_version=row["ruleset_version"],
            extractor_version=row["extractor_version"],
            response_mode=row["response_mode"],
            request_digest=row["request_digest"],
            documents_total=row["documents_total"],
            created_at=row.get("created_at"),
            idempotency_key=row.get("idempotency_key"),
            documents_succeeded=row.get("documents_succeeded", 0),
            documents_failed=row.get("documents_failed", 0),
            findings_total=row.get("findings_total", 0),
            by_severity=by_severity,
            started_at=row.get("started_at"),
            completed_at=row.get("completed_at"),
            error_summary=error_summary,
            # A7-6: Job runner hardening fields
            queued_at=row.get("queued_at"),
            heartbeat_at=row.get("heartbeat_at"),
            attempt_count=row.get("attempt_count", 0),
            worker_id=row.get("worker_id"),
            last_error=row.get("last_error"),
            docs_total=row.get("docs_total", 0),
            docs_processed=row.get("docs_processed", 0),
            docs_succeeded=row.get("docs_succeeded", 0),
            docs_failed=row.get("docs_failed", 0),
        )

    def _row_to_doc(self, row: dict[str, Any]) -> DocRow:
        """Convert database row dict to DocRow."""
        errors = row.get("errors", [])
        if isinstance(errors, str):
            errors = json.loads(errors)

        findings_preview = row.get("findings_preview", [])
        if isinstance(findings_preview, str):
            findings_preview = json.loads(findings_preview)

        return DocRow(
            batch_id=str(row["batch_id"]),
            doc_id=str(row["doc_id"]),
            program_id=str(row["program_id"]),
            content_hash=row["content_hash"],
            status=row["status"],
            filename=row.get("filename"),
            errors=errors,
            findings_count=row.get("findings_count", 0),
            findings_digest=row.get("findings_digest", "0" * 64),
            findings_preview=findings_preview,
            created_at=row.get("created_at"),
        )


# -----------------------------------------------------------------------------
# Factory for default Neon connection
# -----------------------------------------------------------------------------

_default_store: NeonBatchStore | None = None


async def get_batch_store() -> NeonBatchStore:
    """
    Get the default NeonBatchStore instance.

    Lazily creates the store on first access using the
    configured Neon connection pool.

    Returns:
        NeonBatchStore instance
    """
    global _default_store

    if _default_store is None:
        from lumen_cortex.core.db import get_neon_execute

        execute_fn = await get_neon_execute()
        _default_store = NeonBatchStore(execute_fn)

    return _default_store


def set_batch_store(store: NeonBatchStore | None) -> None:
    """
    Set the default batch store (for testing).

    Args:
        store: NeonBatchStore instance or None to reset
    """
    global _default_store
    _default_store = store
