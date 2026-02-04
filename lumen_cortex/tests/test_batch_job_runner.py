"""
Deterministic tests for A7-6 batch job runner hardening.

Covers idempotency, heartbeat updates, sweeper behavior, and claim ordering
using a fake SQL executor (no external DB required).
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from lumen_cortex.reviewer.storage.neon_batch_store import NeonBatchStore


class FakeExecutor:
    """Minimal in-memory SQL executor for NeonBatchStore tests."""

    def __init__(self, now: datetime) -> None:
        self.now = now
        self.rows: dict[str, dict[str, Any]] = {}

    async def __call__(self, query: str, params: tuple[Any, ...] | None = None) -> list[dict[str, Any]]:
        q = " ".join(query.split())
        params = params or ()

        if q.startswith("SELECT * FROM vault.review_batches WHERE program_id = $1 AND idempotency_key = $2"):
            program_id, key = params
            for row in self.rows.values():
                if row["program_id"] == program_id and row.get("idempotency_key") == key:
                    return [row]
            return []

        if q.startswith("SELECT * FROM vault.review_batches WHERE batch_id = $1 AND program_id = $2"):
            batch_id, program_id = params
            row = self.rows.get(str(batch_id))
            if row and row["program_id"] == program_id:
                return [row]
            return []

        if q.startswith("SELECT * FROM vault.review_batches WHERE batch_id = $1"):
            (batch_id,) = params
            row = self.rows.get(str(batch_id))
            return [row] if row else []

        if q.startswith("INSERT INTO vault.review_batches"):
            (
                batch_id,
                program_id,
                status,
                mode,
                ruleset_version,
                extractor_version,
                response_mode,
                idempotency_key,
                request_digest,
                documents_total,
                created_at,
            ) = params
            batch_id = str(batch_id)
            if batch_id in self.rows:
                return []
            row = {
                "batch_id": batch_id,
                "program_id": program_id,
                "status": status,
                "mode": mode,
                "ruleset_version": ruleset_version,
                "extractor_version": extractor_version,
                "response_mode": response_mode,
                "idempotency_key": idempotency_key,
                "request_digest": request_digest,
                "documents_total": documents_total,
                "created_at": created_at,
                "queued_at": created_at,
                "docs_total": documents_total,
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
            self.rows[batch_id] = row
            return [row]

        if "UPDATE vault.review_batches SET heartbeat_at" in q:
            batch_id, heartbeat_at, docs_processed, docs_succeeded, docs_failed, program_id = params
            row = self.rows.get(str(batch_id))
            if row and row["program_id"] == program_id:
                row["heartbeat_at"] = heartbeat_at
                row["docs_processed"] = docs_processed
                row["docs_succeeded"] = docs_succeeded
                row["docs_failed"] = docs_failed
                return [row]
            return []

        if "WITH next_batch AS" in q:
            program_id, worker_id = params
            candidates = [
                r for r in self.rows.values()
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

        if "WITH stalled AS" in q:
            program_id, stall_seconds, max_attempts = params
            stall_seconds = int(stall_seconds)
            cutoff = self.now - timedelta(seconds=stall_seconds)
            stalled = []
            for row in self.rows.values():
                if row["program_id"] != program_id or row["status"] != "running":
                    continue
                heartbeat = row.get("heartbeat_at")
                started_at = row.get("started_at")
                if heartbeat and heartbeat < cutoff:
                    stalled.append(row)
                elif heartbeat is None and started_at and started_at < cutoff:
                    stalled.append(row)
            requeued_ids: list[str] = []
            failed_ids: list[str] = []
            for row in stalled:
                if row.get("attempt_count", 0) < max_attempts:
                    row["status"] = "queued"
                    row["started_at"] = None
                    row["heartbeat_at"] = None
                    row["worker_id"] = None
                    row["last_error"] = "requeued_due_to_stall"
                    requeued_ids.append(row["batch_id"])
                else:
                    row["status"] = "failed"
                    row["completed_at"] = self.now
                    row["last_error"] = "stalled_exceeded_attempts"
                    failed_ids.append(row["batch_id"])
            return [{"requeued_ids": requeued_ids, "failed_ids": failed_ids}]

        return []


def _seed_row(
    executor: FakeExecutor,
    batch_id: str,
    program_id: str,
    status: str,
    queued_at: datetime,
    started_at: datetime | None = None,
    heartbeat_at: datetime | None = None,
    attempt_count: int = 0,
) -> None:
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
        "documents_total": 2,
        "created_at": queued_at,
        "queued_at": queued_at,
        "docs_total": 2,
        "docs_processed": 0,
        "docs_succeeded": 0,
        "docs_failed": 0,
        "attempt_count": attempt_count,
        "worker_id": None,
        "last_error": None,
        "started_at": started_at,
        "completed_at": None,
        "heartbeat_at": heartbeat_at,
        "documents_succeeded": 0,
        "documents_failed": 0,
        "findings_total": 0,
        "by_severity": {},
        "error_summary": [],
    }


def test_idempotency_same_key_returns_same_batch() -> None:
    async def _test() -> None:
        now = datetime(2026, 2, 4, 12, 0, 0, tzinfo=timezone.utc)
        executor = FakeExecutor(now)
        store = NeonBatchStore(executor)

        program_id = str(uuid4())
        batch_id_1 = str(uuid4())
        batch_id_2 = str(uuid4())

        batch1, created1 = await store.create_or_get_batch(
            batch_id=batch_id_1,
            program_id=program_id,
            mode="async",
            ruleset_version="0.1",
            extractor_version="v1",
            response_mode="summary",
            request_digest="digest",
            documents_total=2,
            idempotency_key="key-1",
        )
        batch2, created2 = await store.create_or_get_batch(
            batch_id=batch_id_2,
            program_id=program_id,
            mode="async",
            ruleset_version="0.1",
            extractor_version="v1",
            response_mode="summary",
            request_digest="digest",
            documents_total=2,
            idempotency_key="key-1",
        )

        assert created1 is True
        assert created2 is False
        assert batch1.batch_id == batch2.batch_id
        assert len(executor.rows) == 1

    asyncio.run(_test())


def test_heartbeat_updates_counters() -> None:
    async def _test() -> None:
        now = datetime(2026, 2, 4, 12, 0, 0, tzinfo=timezone.utc)
        executor = FakeExecutor(now)
        store = NeonBatchStore(executor)

        program_id = str(uuid4())
        batch_id = str(uuid4())
        _seed_row(
            executor,
            batch_id=batch_id,
            program_id=program_id,
            status="running",
            queued_at=now,
        )

        await store.heartbeat(
            batch_id=batch_id,
            program_id=program_id,
            docs_processed=2,
            docs_succeeded=1,
            docs_failed=1,
        )

        row = executor.rows[batch_id]
        assert row["docs_processed"] == 2
        assert row["docs_succeeded"] == 1
        assert row["docs_failed"] == 1
        assert row["heartbeat_at"] is not None

    asyncio.run(_test())


def test_sweeper_requeues_stalled_when_attempts_remain() -> None:
    async def _test() -> None:
        now = datetime(2026, 2, 4, 12, 0, 0, tzinfo=timezone.utc)
        executor = FakeExecutor(now)
        store = NeonBatchStore(executor)

        program_id = str(uuid4())
        batch_id = str(uuid4())
        _seed_row(
            executor,
            batch_id=batch_id,
            program_id=program_id,
            status="running",
            queued_at=now - timedelta(seconds=600),
            started_at=now - timedelta(seconds=600),
            heartbeat_at=now - timedelta(seconds=600),
            attempt_count=1,
        )

        result = await store.sweep_stalled_batches(
            program_id=program_id,
            stall_seconds=300,
            max_attempts=3,
        )

        row = executor.rows[batch_id]
        assert row["status"] == "queued"
        assert row["last_error"] == "requeued_due_to_stall"
        assert result["requeued"] == 1
        assert batch_id in result["requeued_ids"]

    asyncio.run(_test())


def test_sweeper_fails_stalled_when_attempts_exceeded() -> None:
    async def _test() -> None:
        now = datetime(2026, 2, 4, 12, 0, 0, tzinfo=timezone.utc)
        executor = FakeExecutor(now)
        store = NeonBatchStore(executor)

        program_id = str(uuid4())
        batch_id = str(uuid4())
        _seed_row(
            executor,
            batch_id=batch_id,
            program_id=program_id,
            status="running",
            queued_at=now - timedelta(seconds=600),
            started_at=now - timedelta(seconds=600),
            heartbeat_at=now - timedelta(seconds=600),
            attempt_count=3,
        )

        result = await store.sweep_stalled_batches(
            program_id=program_id,
            stall_seconds=300,
            max_attempts=3,
        )

        row = executor.rows[batch_id]
        assert row["status"] == "failed"
        assert row["last_error"] == "stalled_exceeded_attempts"
        assert row["completed_at"] == now
        assert result["failed"] == 1
        assert batch_id in result["failed_ids"]

    asyncio.run(_test())


def test_claim_next_queued_batch_respects_ordering() -> None:
    async def _test() -> None:
        now = datetime(2026, 2, 4, 12, 0, 0, tzinfo=timezone.utc)
        executor = FakeExecutor(now)
        store = NeonBatchStore(executor)

        program_id = str(uuid4())
        batch_id_early = "00000000-0000-0000-0000-000000000001"
        batch_id_late = "00000000-0000-0000-0000-000000000002"
        batch_id_same_time = "00000000-0000-0000-0000-000000000000"

        _seed_row(
            executor,
            batch_id=batch_id_late,
            program_id=program_id,
            status="queued",
            queued_at=now + timedelta(seconds=10),
        )
        _seed_row(
            executor,
            batch_id=batch_id_early,
            program_id=program_id,
            status="queued",
            queued_at=now,
        )
        _seed_row(
            executor,
            batch_id=batch_id_same_time,
            program_id=program_id,
            status="queued",
            queued_at=now,
        )

        claimed_first = await store.claim_next_queued_batch(program_id, "worker-1")
        claimed_second = await store.claim_next_queued_batch(program_id, "worker-1")

        assert claimed_first == batch_id_same_time
        assert claimed_second == batch_id_early

    asyncio.run(_test())
