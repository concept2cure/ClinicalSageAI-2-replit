"""Tests for reviewer batch worker loop (A7-7)."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from lumen_cortex.reviewer.storage.models import BatchInputRow


def _load_worker():
    worker_path = Path(__file__).resolve().parents[2] / "scripts" / "worker" / "reviewer_batch_worker.py"
    spec = spec_from_file_location("reviewer_batch_worker", worker_path)
    assert spec and spec.loader
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@dataclass
class FakeDocResult:
    doc_id: str
    content_hash: str
    findings: tuple
    findings_count: int
    findings_digest: str


@dataclass
class FakeBatchResult:
    batch_id: str
    program_id: str
    documents: list[FakeDocResult]
    total_findings: int
    findings_by_severity: dict[str, int]


class FakeRunner:
    def __init__(self, program_id: UUID):
        self._program_id = program_id
        self._extractor_version = "test-extractor"
        self._ruleset_version = "test-rules"

    @property
    def extractor_version(self) -> str:
        return self._extractor_version

    @property
    def ruleset_version(self) -> str:
        return self._ruleset_version

    def review_batch(
        self,
        docs,
        program_id,
        extractor_version=None,
        ruleset_version=None,
        content_hashes=None,
        errored_docs=None,
    ) -> FakeBatchResult:
        return FakeBatchResult(
            batch_id="batch-1",
            program_id=str(program_id),
            documents=[
                FakeDocResult(
                    doc_id=str(d.doc_id),
                    content_hash=d.content_hash,
                    findings=(),
                    findings_count=0,
                    findings_digest="0" * 64,
                )
                for d in docs
            ],
            total_findings=0,
            findings_by_severity={"Critical": 0, "Major": 0, "Minor": 0},
        )


class InMemoryStore:
    def __init__(self) -> None:
        self.batches: dict[str, dict[str, Any]] = {}
        self.inputs: dict[str, list[BatchInputRow]] = {}
        self.doc_results: list[dict[str, Any]] = []
        self.finalized: list[str] = []

    async def claim_next_batch(self, program_id: str, now: datetime, heartbeat_timeout_sec: int) -> str | None:
        stale_before = now - timedelta(seconds=heartbeat_timeout_sec)
        candidates = []
        for batch_id, batch in self.batches.items():
            if batch["program_id"] != program_id:
                continue
            if batch["status"] == "queued":
                candidates.append((0, batch["created_at"], batch_id))
            elif batch["status"] == "running" and batch["heartbeat_at"] < stale_before:
                candidates.append((1, batch["created_at"], batch_id))
        if not candidates:
            return None
        candidates.sort()
        _, _, batch_id = candidates[0]
        batch = self.batches[batch_id]
        batch["status"] = "running"
        batch["locked_at"] = now
        batch["heartbeat_at"] = now
        batch["attempts"] += 1
        return batch_id

    async def heartbeat_batch(self, program_id: str, batch_id: str, now: datetime) -> None:
        batch = self.batches[batch_id]
        if batch["program_id"] != program_id:
            return
        batch["heartbeat_at"] = now

    async def mark_batch_failed(self, program_id: str, batch_id: str, now: datetime, reason: str) -> None:
        batch = self.batches[batch_id]
        if batch["program_id"] != program_id:
            return
        batch["status"] = "failed"
        batch["last_error"] = reason
        batch["completed_at"] = now

    async def get_batch_inputs(self, batch_id: str, program_id: str):
        return self.inputs.get(batch_id, [])

    async def upsert_doc_result(self, **kwargs):
        self.doc_results.append(kwargs)

    async def finalize_batch(self, batch_id: str, summary, status: str = "completed", completed_at: datetime | None = None):
        batch = self.batches[batch_id]
        batch["status"] = status
        batch["completed_at"] = completed_at or datetime.now(timezone.utc)
        self.finalized.append(batch_id)
        return batch


def test_claim_next_batch_prefers_queued_then_stale_running():
    now = datetime(2026, 2, 4, tzinfo=timezone.utc)
    store = InMemoryStore()
    program_id = str(uuid4())

    store.batches["queued"] = {
        "program_id": program_id,
        "status": "queued",
        "created_at": now - timedelta(minutes=5),
        "heartbeat_at": now - timedelta(minutes=5),
        "attempts": 0,
    }
    store.batches["stale"] = {
        "program_id": program_id,
        "status": "running",
        "created_at": now - timedelta(minutes=10),
        "heartbeat_at": now - timedelta(minutes=10),
        "attempts": 0,
    }

    batch_id = asyncio.run(store.claim_next_batch(program_id, now, heartbeat_timeout_sec=60))
    assert batch_id == "queued"

    batch_id = asyncio.run(store.claim_next_batch(program_id, now, heartbeat_timeout_sec=60))
    assert batch_id == "stale"


def test_claim_next_batch_respects_program_id():
    now = datetime(2026, 2, 4, tzinfo=timezone.utc)
    store = InMemoryStore()
    store.batches["queued"] = {
        "program_id": str(uuid4()),
        "status": "queued",
        "created_at": now,
        "heartbeat_at": now,
        "attempts": 0,
    }
    batch_id = asyncio.run(store.claim_next_batch(str(uuid4()), now, heartbeat_timeout_sec=60))
    assert batch_id is None


def test_worker_run_once_processes_and_finalizes():
    worker = _load_worker()
    now = datetime(2026, 2, 4, tzinfo=timezone.utc)
    program_id = UUID("11111111-1111-1111-1111-111111111111")

    store = InMemoryStore()
    store.batches["batch-1"] = {
        "program_id": str(program_id),
        "status": "queued",
        "created_at": now - timedelta(minutes=1),
        "heartbeat_at": now - timedelta(minutes=1),
        "attempts": 0,
    }
    store.inputs["batch-1"] = [
        BatchInputRow(
            program_id=str(program_id),
            batch_id="batch-1",
            seq=0,
            filename=None,
            source_type="docx",
            doc_id=str(uuid4()),
            content_hash="a" * 64,
            text_content="Test content",
            created_at=now,
        )
    ]

    processed = asyncio.run(
        worker.run_once(
            program_id=program_id,
            store=store,
            runner=FakeRunner(program_id),
            now_factory=lambda: now,
            sleep_seconds=0,
        )
    )

    assert processed == 1
    assert store.finalized == ["batch-1"]


def test_worker_reclaims_stale_batch():
    worker = _load_worker()
    now = datetime(2026, 2, 4, tzinfo=timezone.utc)
    program_id = UUID("22222222-2222-2222-2222-222222222222")

    store = InMemoryStore()
    store.batches["batch-1"] = {
        "program_id": str(program_id),
        "status": "running",
        "created_at": now - timedelta(minutes=10),
        "heartbeat_at": now - timedelta(minutes=10),
        "attempts": 0,
    }
    store.inputs["batch-1"] = [
        BatchInputRow(
            program_id=str(program_id),
            batch_id="batch-1",
            seq=0,
            filename=None,
            source_type="docx",
            doc_id=str(uuid4()),
            content_hash="b" * 64,
            text_content="More content",
            created_at=now,
        )
    ]

    processed = asyncio.run(
        worker.run_once(
            program_id=program_id,
            store=store,
            runner=FakeRunner(program_id),
            now_factory=lambda: now,
            sleep_seconds=0,
        )
    )

    assert processed == 1
    assert store.finalized == ["batch-1"]
