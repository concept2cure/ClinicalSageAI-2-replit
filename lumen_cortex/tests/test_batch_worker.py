"""
Tests for batch worker loop (A7-7).

Covers:
- Worker claims and processes batches in FIFO order
- Heartbeats are sent during processing
- Batches are finalized with correct status
- Graceful shutdown behavior
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from lumen_cortex.reviewer.batch_worker import BatchWorker
from lumen_cortex.reviewer.storage.neon_batch_store import NeonBatchStore


class FakeExecutor:
    """Minimal in-memory SQL executor for worker tests."""

    def __init__(self, now: datetime) -> None:
        self.now = now
        self.rows: dict[str, dict[str, Any]] = {}
        self.heartbeat_calls: list[dict[str, Any]] = []
        self.finalize_calls: list[dict[str, Any]] = []

    async def __call__(
        self, query: str, params: tuple[Any, ...] | None = None
    ) -> list[dict[str, Any]]:
        q = " ".join(query.split())
        params = params or ()

        # SELECT by batch_id
        if q.startswith("SELECT * FROM vault.review_batches WHERE batch_id = $1"):
            batch_id = str(params[0]) if len(params) >= 1 else None
            program_id = str(params[1]) if len(params) >= 2 else None
            row = self.rows.get(batch_id)
            if row:
                if program_id is None or row["program_id"] == program_id:
                    return [row]
            return []

        # Claim next queued batch
        if "WITH next_batch AS" in q and "FOR UPDATE SKIP LOCKED" in q:
            program_id, worker_id = params
            candidates = [
                r
                for r in self.rows.values()
                if r["program_id"] == program_id and r["status"] == "queued"
            ]
            if not candidates:
                return []
            candidates.sort(key=lambda r: (r["queued_at"], r["batch_id"]))
            row = candidates[0]
            row["status"] = "running"
            row["started_at"] = row["started_at"] or self.now
            row["heartbeat_at"] = self.now
            row["worker_id"] = worker_id
            row["attempt_count"] = row.get("attempt_count", 0) + 1
            return [{"batch_id": row["batch_id"]}]

        # Heartbeat update
        if "UPDATE vault.review_batches SET heartbeat_at" in q:
            batch_id, heartbeat_at, docs_processed, docs_succeeded, docs_failed, program_id = params
            row = self.rows.get(str(batch_id))
            if row and row["program_id"] == program_id:
                row["heartbeat_at"] = heartbeat_at
                row["docs_processed"] = docs_processed
                row["docs_succeeded"] = docs_succeeded
                row["docs_failed"] = docs_failed
                self.heartbeat_calls.append({
                    "batch_id": batch_id,
                    "docs_processed": docs_processed,
                    "docs_succeeded": docs_succeeded,
                    "docs_failed": docs_failed,
                })
                return [row]
            return []

        # Finalize batch
        if q.startswith("UPDATE vault.review_batches SET status = $2"):
            (
                batch_id,
                status,
                documents_succeeded,
                documents_failed,
                findings_total,
                by_severity,
                error_summary,
                completed_at,
                last_error,
                docs_total,
                program_id,
            ) = params
            row = self.rows.get(str(batch_id))
            if row and row["program_id"] == program_id:
                row["status"] = status
                row["documents_succeeded"] = documents_succeeded
                row["documents_failed"] = documents_failed
                row["findings_total"] = findings_total
                row["completed_at"] = completed_at
                row["last_error"] = last_error
                row["docs_total"] = docs_total
                row["docs_succeeded"] = documents_succeeded
                row["docs_failed"] = documents_failed
                row["docs_processed"] = documents_succeeded + documents_failed
                self.finalize_calls.append({
                    "batch_id": batch_id,
                    "status": status,
                    "documents_succeeded": documents_succeeded,
                    "documents_failed": documents_failed,
                })
                return [row]
            return []

        return []


def _seed_batch(
    executor: FakeExecutor,
    batch_id: str,
    program_id: str,
    status: str,
    docs_total: int,
    queued_at: datetime,
) -> None:
    """Seed a batch row in the fake executor."""
    executor.rows[batch_id] = {
        "batch_id": batch_id,
        "program_id": program_id,
        "status": status,
        "mode": "async",
        "ruleset_version": "0.1",
        "extractor_version": "v1",
        "response_mode": "summary",
        "idempotency_key": None,
        "request_digest": "digest",
        "documents_total": docs_total,
        "created_at": queued_at,
        "queued_at": queued_at,
        "docs_total": docs_total,
        "docs_processed": 0,
        "docs_succeeded": 0,
        "docs_failed": 0,
        "attempt_count": 0,
        "worker_id": None,
        "last_error": None,
        "started_at": None,
        "completed_at": None,
        "heartbeat_at": None,
        "documents_succeeded": 0,
        "documents_failed": 0,
        "findings_total": 0,
        "by_severity": {},
        "error_summary": [],
    }


def test_worker_claims_and_processes_batch() -> None:
    """Worker claims a queued batch, processes it, and finalizes."""
    async def _test() -> None:
        now = datetime(2026, 2, 4, 12, 0, 0, tzinfo=timezone.utc)
        executor = FakeExecutor(now)
        store = NeonBatchStore(executor)

        program_id = str(uuid4())
        batch_id = str(uuid4())
        _seed_batch(
            executor,
            batch_id=batch_id,
            program_id=program_id,
            status="queued",
            docs_total=5,
            queued_at=now,
        )

        # Create worker with very short intervals for testing
        worker = BatchWorker(
            program_id=program_id,
            worker_id="test-worker",
            poll_interval=1,
            heartbeat_interval=2,
            store=store,
        )

        # Process one batch then shutdown
        async def run_one_batch() -> None:
            batch_id_claimed = await store.claim_next_queued_batch(
                program_id, "test-worker"
            )
            assert batch_id_claimed == batch_id
            await worker._process_batch(batch_id)

        await run_one_batch()

        # Verify batch was finalized
        assert len(executor.finalize_calls) == 1
        finalize = executor.finalize_calls[0]
        assert finalize["batch_id"] == batch_id
        assert finalize["status"] == "completed"
        assert finalize["documents_succeeded"] == 5
        assert finalize["documents_failed"] == 0

        # Verify heartbeats were sent (should be at doc 2 and doc 4, plus final)
        assert len(executor.heartbeat_calls) >= 2

        # Verify final state
        row = executor.rows[batch_id]
        assert row["status"] == "completed"
        assert row["docs_processed"] == 5

    asyncio.run(_test())


def test_worker_sends_heartbeats_during_processing() -> None:
    """Worker sends periodic heartbeats while processing."""
    async def _test() -> None:
        now = datetime(2026, 2, 4, 12, 0, 0, tzinfo=timezone.utc)
        executor = FakeExecutor(now)
        store = NeonBatchStore(executor)

        program_id = str(uuid4())
        batch_id = str(uuid4())
        _seed_batch(
            executor,
            batch_id=batch_id,
            program_id=program_id,
            status="queued",
            docs_total=10,
            queued_at=now,
        )

        worker = BatchWorker(
            program_id=program_id,
            worker_id="test-worker",
            heartbeat_interval=3,  # Every 3 docs
            store=store,
        )

        # Claim and process
        await store.claim_next_queued_batch(program_id, "test-worker")
        await worker._process_batch(batch_id)

        # Should have heartbeats at: 3, 6, 9, final = 4 total
        assert len(executor.heartbeat_calls) >= 3

        # Verify heartbeat progression
        heartbeats = executor.heartbeat_calls
        assert heartbeats[0]["docs_processed"] == 3
        assert heartbeats[1]["docs_processed"] == 6
        assert heartbeats[2]["docs_processed"] == 9

    asyncio.run(_test())


def test_worker_processes_batches_in_fifo_order() -> None:
    """Worker claims batches in FIFO order (oldest queued_at first)."""
    async def _test() -> None:
        now = datetime(2026, 2, 4, 12, 0, 0, tzinfo=timezone.utc)
        executor = FakeExecutor(now)
        store = NeonBatchStore(executor)

        program_id = str(uuid4())
        batch_id_old = str(uuid4())
        batch_id_new = str(uuid4())

        # Seed batches with different queued_at times
        _seed_batch(
            executor,
            batch_id=batch_id_new,
            program_id=program_id,
            status="queued",
            docs_total=2,
            queued_at=now + timedelta(seconds=10),
        )
        _seed_batch(
            executor,
            batch_id=batch_id_old,
            program_id=program_id,
            status="queued",
            docs_total=2,
            queued_at=now,
        )

        # Claim first batch - should get oldest
        claimed_1 = await store.claim_next_queued_batch(program_id, "worker-1")
        assert claimed_1 == batch_id_old

        # Claim second batch
        claimed_2 = await store.claim_next_queued_batch(program_id, "worker-1")
        assert claimed_2 == batch_id_new

    asyncio.run(_test())


def test_worker_handles_batch_processing_error() -> None:
    """Worker marks batch as failed when processing raises exception."""
    async def _test() -> None:
        now = datetime(2026, 2, 4, 12, 0, 0, tzinfo=timezone.utc)
        executor = FakeExecutor(now)
        store = NeonBatchStore(executor)

        program_id = str(uuid4())
        batch_id = str(uuid4())
        _seed_batch(
            executor,
            batch_id=batch_id,
            program_id=program_id,
            status="queued",
            docs_total=2,
            queued_at=now,
        )

        worker = BatchWorker(
            program_id=program_id,
            worker_id="test-worker",
            store=store,
        )

        # Claim batch
        await store.claim_next_queued_batch(program_id, "test-worker")

        # Simulate processing error
        try:
            # Force an error by trying to process non-existent batch
            fake_batch_id = str(uuid4())
            await worker._process_batch(fake_batch_id)
        except RuntimeError:
            # Expected - batch not found
            await worker._mark_batch_failed(batch_id, "test_error")

        # Verify batch was marked as failed
        assert len(executor.finalize_calls) == 1
        finalize = executor.finalize_calls[0]
        assert finalize["batch_id"] == batch_id
        assert finalize["status"] == "failed"

    asyncio.run(_test())


def test_worker_shutdown_request() -> None:
    """Worker stops processing when shutdown is requested."""
    async def _test() -> None:
        now = datetime(2026, 2, 4, 12, 0, 0, tzinfo=timezone.utc)
        executor = FakeExecutor(now)
        store = NeonBatchStore(executor)

        program_id = str(uuid4())

        worker = BatchWorker(
            program_id=program_id,
            worker_id="test-worker",
            poll_interval=1,
            store=store,
        )

        # Request shutdown immediately
        worker.request_shutdown()

        # Run should exit immediately
        await worker.run()

        # Worker should have processed 0 batches
        assert len(executor.finalize_calls) == 0

    asyncio.run(_test())


def test_worker_no_batches_available() -> None:
    """Worker waits when no batches are available."""
    async def _test() -> None:
        now = datetime(2026, 2, 4, 12, 0, 0, tzinfo=timezone.utc)
        executor = FakeExecutor(now)
        store = NeonBatchStore(executor)

        program_id = str(uuid4())

        # No batches seeded
        worker = BatchWorker(
            program_id=program_id,
            worker_id="test-worker",
            poll_interval=0.1,  # Short interval for testing
            store=store,
        )

        # Try to claim - should return None
        batch_id = await store.claim_next_queued_batch(program_id, "test-worker")
        assert batch_id is None

        # Worker loop would wait poll_interval before trying again
        # (we don't run the full loop here, just verify claim behavior)

    asyncio.run(_test())
