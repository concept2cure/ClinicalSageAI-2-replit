"""Neon (PostgreSQL) batch store adapter."""

from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from typing import Any, Callable, Coroutine, Protocol

from .models import BatchRow, BatchSummaryUpdate, DocRow, BatchInputRow


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
                request_digest, documents_total, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        started_at: datetime | None = None,
    ) -> None:
        """
        Mark batch as running (for async mode).

        Args:
            batch_id: Batch UUID
            started_at: Optional timestamp (defaults to now)
        """
        query = """
            UPDATE vault.review_batches
            SET status = 'running', started_at = $2
            WHERE batch_id = $1 AND status = 'queued'
        """
        await self._execute(
            query,
            (batch_id, started_at or datetime.now(timezone.utc)),
        )

    async def claim_next_batch(
        self,
        program_id: str,
        now: datetime,
        heartbeat_timeout_sec: int,
    ) -> str | None:
        """
        Claim the next queued or stale running batch for processing.

        Args:
            program_id: Program UUID
            now: Timestamp for claim
            heartbeat_timeout_sec: Staleness threshold in seconds

        Returns:
            Batch ID or None if nothing to claim
        """
        stale_before = now - timedelta(seconds=heartbeat_timeout_sec)
        query = """
            WITH candidate AS (
                SELECT batch_id
                FROM vault.review_batches
                WHERE program_id = $1
                  AND (
                    status = 'queued'
                    OR (
                        status = 'running'
                        AND COALESCE(heartbeat_at, started_at, created_at) < $2
                    )
                  )
                ORDER BY
                    CASE WHEN status = 'queued' THEN 0 ELSE 1 END,
                    created_at,
                    batch_id
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            UPDATE vault.review_batches b
            SET status = 'running',
                locked_at = $3,
                heartbeat_at = $3,
                attempts = COALESCE(attempts, 0) + 1,
                started_at = COALESCE(started_at, $3)
            FROM candidate
            WHERE b.batch_id = candidate.batch_id
            RETURNING b.batch_id
        """
        rows = await self._execute(query, (program_id, stale_before, now))
        if not rows:
            return None
        return str(rows[0]["batch_id"])

    async def heartbeat_batch(
        self,
        program_id: str,
        batch_id: str,
        now: datetime,
    ) -> None:
        """Update heartbeat for a running batch."""
        query = """
            UPDATE vault.review_batches
            SET heartbeat_at = $3
            WHERE batch_id = $1 AND program_id = $2 AND status = 'running'
        """
        await self._execute(query, (batch_id, program_id, now))

    # -------------------------------------------------------------------------
    # Worker API wrappers (for batch_worker.py compatibility)
    # -------------------------------------------------------------------------

    async def claim_next_queued_batch(
        self,
        program_id: str,
        worker_id: str,
        heartbeat_timeout_sec: int = 300,
    ) -> str | None:
        """
        Claim next queued batch for worker processing.

        This is a wrapper for worker API compatibility that delegates to
        claim_next_batch with automatic timestamping.

        Args:
            program_id: Program UUID
            worker_id: Worker identifier (currently unused, for future tracking)
            heartbeat_timeout_sec: Staleness threshold for reclaiming stale batches

        Returns:
            Batch ID or None if no batches available
        """
        return await self.claim_next_batch(
            program_id=program_id,
            now=datetime.now(timezone.utc),
            heartbeat_timeout_sec=heartbeat_timeout_sec,
        )

    async def heartbeat(
        self,
        batch_id: str,
        program_id: str,
        docs_processed: int = 0,
        docs_succeeded: int = 0,
        docs_failed: int = 0,
    ) -> None:
        """
        Send heartbeat for a running batch.

        This is a wrapper for worker API compatibility. Progress fields
        are currently logged but not persisted.

        Args:
            batch_id: Batch UUID
            program_id: Program UUID
            docs_processed: Documents processed so far
            docs_succeeded: Documents succeeded so far
            docs_failed: Documents failed so far
        """
        await self.heartbeat_batch(
            program_id=program_id,
            batch_id=batch_id,
            now=datetime.now(timezone.utc),
        )

    async def mark_batch_failed(
        self,
        program_id: str,
        batch_id: str,
        now: datetime,
        reason: str,
    ) -> None:
        """Mark a batch as failed with a reason."""
        query = """
            UPDATE vault.review_batches
            SET status = 'failed',
                last_error = $4,
                completed_at = $3
            WHERE batch_id = $1 AND program_id = $2
        """
        await self._execute(query, (batch_id, program_id, now, reason))

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

    async def upsert_batch_input(
        self,
        batch_id: str,
        program_id: str,
        seq: int,
        doc_id: str,
        content_hash: str,
        source_type: str,
        filename: str | None = None,
        text_content: str = "",
    ) -> BatchInputRow:
        """Insert or update a batch input payload."""
        query = """
            INSERT INTO vault.review_batch_inputs (
                program_id, batch_id, seq, filename, source_type,
                doc_id, content_hash, text_content, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (program_id, batch_id, seq) DO UPDATE SET
                content_hash = EXCLUDED.content_hash,
                source_type = EXCLUDED.source_type,
                filename = EXCLUDED.filename,
                text_content = EXCLUDED.text_content
            RETURNING *
        """
        now = datetime.now(timezone.utc)
        rows = await self._execute(
            query,
            (
                program_id,
                batch_id,
                seq,
                filename,
                source_type,
                doc_id,
                content_hash,
                text_content,
                now,
            ),
        )
        return self._row_to_batch_input(rows[0])

    async def get_batch_inputs(self, batch_id: str, program_id: str) -> list[BatchInputRow]:
        """Fetch batch input payloads for processing."""
        query = """
            SELECT * FROM vault.review_batch_inputs
            WHERE batch_id = $1 AND program_id = $2
            ORDER BY seq
        """
        rows = await self._execute(query, (batch_id, program_id))
        return [self._row_to_batch_input(r) for r in rows]

    async def finalize_batch(
        self,
        batch_id: str,
        summary: BatchSummaryUpdate | None = None,
        status: str = "completed",
        completed_at: datetime | None = None,
        *,  # Keyword-only args below for worker compatibility
        program_id: str | None = None,
        docs_total: int | None = None,
        docs_succeeded: int | None = None,
        docs_failed: int | None = None,
        last_error: str | None = None,
    ) -> BatchRow:
        """
        Finalize batch with summary statistics.

        Args:
            batch_id: Batch UUID
            summary: Aggregated summary data (if None, uses passed values)
            status: Final status ('completed' or 'failed')
            completed_at: Completion timestamp (defaults to now)
            program_id: Program UUID (optional, passed by worker)
            docs_total: Total documents (ignored, read from batch)
            docs_succeeded: Documents succeeded (used if summary is None)
            docs_failed: Documents failed (used if summary is None)
            last_error: Error message for failed batches

        Returns:
            Updated BatchRow
        """
        # Build summary from individual fields if not provided
        if summary is None:
            summary = BatchSummaryUpdate(
                documents_succeeded=docs_succeeded or 0,
                documents_failed=docs_failed or 0,
                findings_total=0,
                by_severity={},
                error_summary=[{"error": last_error}] if last_error else [],
            )

        query = """
            UPDATE vault.review_batches SET
                status = $2,
                documents_succeeded = $3,
                documents_failed = $4,
                findings_total = $5,
                by_severity = $6,
                error_summary = $7,
                completed_at = $8,
                last_error = $9
            WHERE batch_id = $1
            RETURNING *
        """
        rows = await self._execute(
            query,
            (
                batch_id,
                status,
                summary.documents_succeeded,
                summary.documents_failed,
                summary.findings_total,
                json.dumps(summary.by_severity),
                json.dumps(summary.error_summary),
                completed_at or datetime.now(timezone.utc),
                last_error,
            ),
        )
        return self._row_to_batch(rows[0])

    async def get_batch(
        self, batch_id: str, program_id: str | None = None
    ) -> BatchRow | None:
        """
        Get batch by ID.

        Args:
            batch_id: Batch UUID
            program_id: Program UUID (optional, for additional filtering)

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

    async def get_batch_docs(self, batch_id: str) -> list[DocRow]:
        """
        Get all document results for a batch.

        Args:
            batch_id: Batch UUID

        Returns:
            List of DocRow (may be empty)
        """
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
            locked_at=row.get("locked_at"),
            heartbeat_at=row.get("heartbeat_at"),
            attempts=row.get("attempts", 0),
            last_error=row.get("last_error"),
            error_summary=error_summary,
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

    def _row_to_batch_input(self, row: dict[str, Any]) -> BatchInputRow:
        """Convert database row dict to BatchInputRow."""
        return BatchInputRow(
            program_id=str(row["program_id"]),
            batch_id=str(row["batch_id"]),
            seq=int(row["seq"]),
            filename=row.get("filename"),
            source_type=row.get("source_type", "text"),
            doc_id=str(row["doc_id"]),
            content_hash=row.get("content_hash", ""),
            text_content=row.get("text_content", ""),
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
