"""
Tests for batch persistence, idempotency, and async mode (A7-5).

Tests storage layer and API integration without requiring Neon.
Uses CapturingBatchStore pattern for deterministic testing.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import pytest
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from lumen_cortex.reviewer.storage.models import (
    BatchRow,
    BatchSummaryUpdate,
    DocRow,
)


# ============================================================================
# Test Fixtures: CapturingBatchStore
# ============================================================================


class CapturingBatchStore:
    """
    In-memory batch store for testing.

    Captures all operations for assertions without database.
    """

    def __init__(self) -> None:
        self.batches: dict[str, BatchRow] = {}
        self.docs: dict[str, list[DocRow]] = {}  # batch_id -> docs
        self.operations: list[tuple[str, dict[str, Any]]] = []

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
        """Create or return existing batch."""
        self.operations.append(("create_or_get_batch", {
            "batch_id": batch_id,
            "idempotency_key": idempotency_key,
        }))

        # Check idempotency key first
        if idempotency_key:
            for b in self.batches.values():
                if b.program_id == program_id and b.idempotency_key == idempotency_key:
                    return b, False

        # Check if batch exists
        if batch_id in self.batches:
            return self.batches[batch_id], False

        # Create new batch
        now = datetime.now(timezone.utc)
        batch = BatchRow(
            batch_id=batch_id,
            program_id=program_id,
            status="queued" if mode == "async" else "running",
            mode=mode,
            ruleset_version=ruleset_version,
            extractor_version=extractor_version,
            response_mode=response_mode,
            request_digest=request_digest,
            documents_total=documents_total,
            idempotency_key=idempotency_key,
            created_at=now,
        )
        self.batches[batch_id] = batch
        self.docs[batch_id] = []
        return batch, True

    async def mark_batch_running(
        self,
        batch_id: str,
        started_at: datetime | None = None,
    ) -> None:
        """Mark batch as running."""
        self.operations.append(("mark_batch_running", {"batch_id": batch_id}))
        if batch_id in self.batches:
            batch = self.batches[batch_id]
            # Create new BatchRow with updated fields (dataclass is not frozen)
            self.batches[batch_id] = BatchRow(
                batch_id=batch.batch_id,
                program_id=batch.program_id,
                status="running",
                mode=batch.mode,
                ruleset_version=batch.ruleset_version,
                extractor_version=batch.extractor_version,
                response_mode=batch.response_mode,
                request_digest=batch.request_digest,
                documents_total=batch.documents_total,
                idempotency_key=batch.idempotency_key,
                created_at=batch.created_at,
                started_at=started_at or datetime.now(timezone.utc),
            )

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
        """Upsert document result."""
        self.operations.append(("upsert_doc_result", {
            "batch_id": batch_id,
            "doc_id": doc_id,
            "status": status,
        }))

        doc = DocRow(
            batch_id=batch_id,
            doc_id=doc_id,
            program_id=program_id,
            content_hash=content_hash,
            status=status,
            filename=filename,
            errors=errors or [],
            findings_count=findings_count,
            findings_digest=findings_digest,
            findings_preview=findings_preview or [],
            created_at=datetime.now(timezone.utc),
        )

        # Update or append
        if batch_id not in self.docs:
            self.docs[batch_id] = []

        existing_idx = None
        for i, d in enumerate(self.docs[batch_id]):
            if d.doc_id == doc_id:
                existing_idx = i
                break

        if existing_idx is not None:
            self.docs[batch_id][existing_idx] = doc
        else:
            self.docs[batch_id].append(doc)

        return doc

    async def finalize_batch(
        self,
        batch_id: str,
        summary: BatchSummaryUpdate,
        status: str = "completed",
        completed_at: datetime | None = None,
    ) -> BatchRow:
        """Finalize batch with summary."""
        self.operations.append(("finalize_batch", {
            "batch_id": batch_id,
            "status": status,
            "findings_total": summary.findings_total,
        }))

        batch = self.batches[batch_id]
        updated = BatchRow(
            batch_id=batch.batch_id,
            program_id=batch.program_id,
            status=status,
            mode=batch.mode,
            ruleset_version=batch.ruleset_version,
            extractor_version=batch.extractor_version,
            response_mode=batch.response_mode,
            request_digest=batch.request_digest,
            documents_total=batch.documents_total,
            idempotency_key=batch.idempotency_key,
            created_at=batch.created_at,
            started_at=batch.started_at,
            completed_at=completed_at or datetime.now(timezone.utc),
            documents_succeeded=summary.documents_succeeded,
            documents_failed=summary.documents_failed,
            findings_total=summary.findings_total,
            by_severity=summary.by_severity,
            error_summary=summary.error_summary,
        )
        self.batches[batch_id] = updated
        return updated

    async def get_batch(self, batch_id: str) -> BatchRow | None:
        """Get batch by ID."""
        return self.batches.get(batch_id)

    async def get_batch_docs(self, batch_id: str) -> list[DocRow]:
        """Get docs for batch."""
        return self.docs.get(batch_id, [])


# ============================================================================
# Storage Layer Tests
# ============================================================================


def test_create_batch_returns_new_batch():
    """Creating a batch returns the new batch with was_created=True."""
    async def _test():
        store = CapturingBatchStore()
        program_id = str(uuid4())
        batch_id = str(uuid4())

        batch, was_created = await store.create_or_get_batch(
            batch_id=batch_id,
            program_id=program_id,
            mode="sync",
            ruleset_version="0.1",
            extractor_version="test-v1",
            response_mode="summary",
            request_digest="a" * 64,
            documents_total=2,
        )

        assert was_created is True
        assert batch.batch_id == batch_id
        assert batch.program_id == program_id
        assert batch.status == "running"  # sync mode starts running
        assert batch.documents_total == 2

    asyncio.run(_test())


def test_idempotency_key_returns_existing_batch():
    """Same idempotency key returns the same batch."""
    async def _test():
        store = CapturingBatchStore()
        program_id = str(uuid4())
        batch_id_1 = str(uuid4())
        batch_id_2 = str(uuid4())

        # First request
        batch1, created1 = await store.create_or_get_batch(
            batch_id=batch_id_1,
            program_id=program_id,
            mode="sync",
            ruleset_version="0.1",
            extractor_version="test-v1",
            response_mode="summary",
            request_digest="a" * 64,
            documents_total=2,
            idempotency_key="my-key-123",
        )

        # Second request with same idempotency key but different batch_id
        batch2, created2 = await store.create_or_get_batch(
            batch_id=batch_id_2,
            program_id=program_id,
            mode="sync",
            ruleset_version="0.1",
            extractor_version="test-v1",
            response_mode="summary",
            request_digest="a" * 64,
            documents_total=2,
            idempotency_key="my-key-123",
        )

        assert created1 is True
        assert created2 is False  # Idempotent hit
        assert batch2.batch_id == batch1.batch_id  # Same batch returned

    asyncio.run(_test())


def test_async_mode_creates_queued_batch():
    """Async mode creates batch in 'queued' status."""
    async def _test():
        store = CapturingBatchStore()
        program_id = str(uuid4())
        batch_id = str(uuid4())

        batch, _ = await store.create_or_get_batch(
            batch_id=batch_id,
            program_id=program_id,
            mode="async",  # async mode
            ruleset_version="0.1",
            extractor_version="test-v1",
            response_mode="summary",
            request_digest="a" * 64,
            documents_total=2,
        )

        assert batch.status == "queued"

    asyncio.run(_test())


def test_mark_batch_running_transitions_status():
    """mark_batch_running transitions queued -> running."""
    async def _test():
        store = CapturingBatchStore()
        program_id = str(uuid4())
        batch_id = str(uuid4())

        # Create async batch (starts queued)
        await store.create_or_get_batch(
            batch_id=batch_id,
            program_id=program_id,
            mode="async",
            ruleset_version="0.1",
            extractor_version="test-v1",
            response_mode="summary",
            request_digest="a" * 64,
            documents_total=2,
        )

        assert store.batches[batch_id].status == "queued"

        # Mark running
        await store.mark_batch_running(batch_id)

        assert store.batches[batch_id].status == "running"
        assert store.batches[batch_id].started_at is not None

    asyncio.run(_test())


def test_upsert_doc_result_creates_doc():
    """upsert_doc_result creates a new doc row."""
    async def _test():
        store = CapturingBatchStore()
        program_id = str(uuid4())
        batch_id = str(uuid4())
        doc_id = str(uuid4())

        # Create batch first
        await store.create_or_get_batch(
            batch_id=batch_id,
            program_id=program_id,
            mode="sync",
            ruleset_version="0.1",
            extractor_version="test-v1",
            response_mode="summary",
            request_digest="a" * 64,
            documents_total=1,
        )

        # Upsert doc result
        doc = await store.upsert_doc_result(
            batch_id=batch_id,
            program_id=program_id,
            doc_id=doc_id,
            content_hash="b" * 64,
            status="succeeded",
            filename="test.pdf",
            findings_count=3,
            findings_digest="c" * 64,
            findings_preview=[{"id": "f1"}, {"id": "f2"}],
        )

        assert doc.doc_id == doc_id
        assert doc.status == "succeeded"
        assert doc.findings_count == 3
        assert len(doc.findings_preview) == 2

    asyncio.run(_test())


def test_finalize_batch_updates_summary():
    """finalize_batch updates batch with summary stats."""
    async def _test():
        store = CapturingBatchStore()
        program_id = str(uuid4())
        batch_id = str(uuid4())

        # Create batch
        await store.create_or_get_batch(
            batch_id=batch_id,
            program_id=program_id,
            mode="sync",
            ruleset_version="0.1",
            extractor_version="test-v1",
            response_mode="summary",
            request_digest="a" * 64,
            documents_total=3,
        )

        # Finalize with summary
        summary = BatchSummaryUpdate(
            documents_succeeded=2,
            documents_failed=1,
            findings_total=15,
            by_severity={"critical": 5, "major": 7, "minor": 3},
            error_summary=[{"doc_id": "d3", "error": "extraction_failed"}],
        )

        batch = await store.finalize_batch(
            batch_id=batch_id,
            summary=summary,
            status="completed",
        )

        assert batch.status == "completed"
        assert batch.documents_succeeded == 2
        assert batch.documents_failed == 1
        assert batch.findings_total == 15
        assert batch.by_severity == {"critical": 5, "major": 7, "minor": 3}
        assert batch.completed_at is not None

    asyncio.run(_test())


def test_get_batch_docs_returns_all_docs():
    """get_batch_docs returns all docs for a batch."""
    async def _test():
        store = CapturingBatchStore()
        program_id = str(uuid4())
        batch_id = str(uuid4())

        # Create batch
        await store.create_or_get_batch(
            batch_id=batch_id,
            program_id=program_id,
            mode="sync",
            ruleset_version="0.1",
            extractor_version="test-v1",
            response_mode="summary",
            request_digest="a" * 64,
            documents_total=2,
        )

        # Add two docs
        await store.upsert_doc_result(
            batch_id=batch_id,
            program_id=program_id,
            doc_id=str(uuid4()),
            content_hash="b" * 64,
            status="succeeded",
            findings_count=2,
        )
        await store.upsert_doc_result(
            batch_id=batch_id,
            program_id=program_id,
            doc_id=str(uuid4()),
            content_hash="c" * 64,
            status="failed",
            errors=[{"code": "empty_text", "message": "Empty"}],
        )

        docs = await store.get_batch_docs(batch_id)

        assert len(docs) == 2
        assert docs[0].status == "succeeded"
        assert docs[1].status == "failed"

    asyncio.run(_test())


# ============================================================================
# Request Digest Tests (for idempotency fallback)
# ============================================================================


def compute_request_digest(
    program_id: str,
    filenames: list[str],
    file_hashes: list[str],
    ruleset_version: str,
    extractor_version: str,
) -> str:
    """
    Compute deterministic request digest.

    This is the fallback for idempotency when no explicit key is provided.
    """
    data = {
        "program_id": program_id,
        "files": sorted(zip(filenames, file_hashes)),
        "ruleset_version": ruleset_version,
        "extractor_version": extractor_version,
    }
    serialized = json.dumps(data, sort_keys=True)
    return hashlib.sha256(serialized.encode()).hexdigest()


def test_request_digest_deterministic():
    """Same inputs produce same request digest."""
    program_id = str(uuid4())

    digest1 = compute_request_digest(
        program_id=program_id,
        filenames=["a.pdf", "b.pdf"],
        file_hashes=["hash1", "hash2"],
        ruleset_version="0.1",
        extractor_version="v1",
    )

    digest2 = compute_request_digest(
        program_id=program_id,
        filenames=["a.pdf", "b.pdf"],
        file_hashes=["hash1", "hash2"],
        ruleset_version="0.1",
        extractor_version="v1",
    )

    assert digest1 == digest2


def test_request_digest_order_independent():
    """File order doesn't affect digest (sorted internally)."""
    program_id = str(uuid4())

    digest1 = compute_request_digest(
        program_id=program_id,
        filenames=["a.pdf", "b.pdf"],
        file_hashes=["hash1", "hash2"],
        ruleset_version="0.1",
        extractor_version="v1",
    )

    digest2 = compute_request_digest(
        program_id=program_id,
        filenames=["b.pdf", "a.pdf"],  # Different order
        file_hashes=["hash2", "hash1"],
        ruleset_version="0.1",
        extractor_version="v1",
    )

    assert digest1 == digest2


def test_request_digest_different_files():
    """Different files produce different digest."""
    program_id = str(uuid4())

    digest1 = compute_request_digest(
        program_id=program_id,
        filenames=["a.pdf"],
        file_hashes=["hash1"],
        ruleset_version="0.1",
        extractor_version="v1",
    )

    digest2 = compute_request_digest(
        program_id=program_id,
        filenames=["a.pdf", "b.pdf"],  # Extra file
        file_hashes=["hash1", "hash2"],
        ruleset_version="0.1",
        extractor_version="v1",
    )

    assert digest1 != digest2


# ============================================================================
# Event Payload Tests
# ============================================================================


def test_batch_queued_payload_structure():
    """BatchQueuedPayload has correct structure."""
    from lumen_cortex.core.events import BatchQueuedPayload

    payload = BatchQueuedPayload(
        batch_id="batch-123",
        program_id="prog-456",
        documents_total=5,
        mode="async",
        idempotency_key="key-789",
        request_digest="a" * 64,
        queued_at="2026-02-04T10:00:00Z",
    )

    d = payload.to_dict()

    assert d["batch_id"] == "batch-123"
    assert d["mode"] == "async"
    assert d["idempotency_key"] == "key-789"
    assert d["documents_total"] == 5


def test_batch_persisted_payload_structure():
    """BatchPersistedPayload has correct structure."""
    from lumen_cortex.core.events import BatchPersistedPayload

    payload = BatchPersistedPayload(
        batch_id="batch-123",
        program_id="prog-456",
        status="completed",
        documents_total=5,
        documents_succeeded=4,
        documents_failed=1,
        findings_total=23,
        persisted_at="2026-02-04T10:05:00Z",
    )

    d = payload.to_dict()

    assert d["status"] == "completed"
    assert d["documents_succeeded"] == 4
    assert d["documents_failed"] == 1
    assert d["findings_total"] == 23


# ============================================================================
# Integration Test: Full Batch Lifecycle
# ============================================================================


def test_full_batch_lifecycle():
    """
    Test complete batch lifecycle:
    create -> upsert docs -> finalize -> get
    """
    async def _test():
        store = CapturingBatchStore()
        program_id = str(uuid4())
        batch_id = str(uuid4())

        # 1. Create batch
        batch, created = await store.create_or_get_batch(
            batch_id=batch_id,
            program_id=program_id,
            mode="sync",
            ruleset_version="0.1",
            extractor_version="test-v1",
            response_mode="summary",
            request_digest="a" * 64,
            documents_total=2,
            idempotency_key="test-key",
        )
        assert created is True
        assert batch.status == "running"

        # 2. Upsert doc results
        doc1_id = str(uuid4())
        doc2_id = str(uuid4())

        await store.upsert_doc_result(
            batch_id=batch_id,
            program_id=program_id,
            doc_id=doc1_id,
            content_hash="b" * 64,
            status="succeeded",
            filename="doc1.pdf",
            findings_count=5,
            findings_digest="c" * 64,
        )

        await store.upsert_doc_result(
            batch_id=batch_id,
            program_id=program_id,
            doc_id=doc2_id,
            content_hash="d" * 64,
            status="failed",
            filename="doc2.pdf",
            errors=[{"code": "extract_failed", "message": "PDF corrupt"}],
        )

        # 3. Finalize batch
        summary = BatchSummaryUpdate(
            documents_succeeded=1,
            documents_failed=1,
            findings_total=5,
            by_severity={"major": 3, "minor": 2},
            error_summary=[{"doc_id": doc2_id, "error": "extract_failed"}],
        )

        final_batch = await store.finalize_batch(
            batch_id=batch_id,
            summary=summary,
            status="completed",
        )

        assert final_batch.status == "completed"
        assert final_batch.findings_total == 5

        # 4. Retrieve and verify
        retrieved = await store.get_batch(batch_id)
        assert retrieved is not None
        assert retrieved.batch_id == batch_id
        assert retrieved.idempotency_key == "test-key"

        docs = await store.get_batch_docs(batch_id)
        assert len(docs) == 2

        # 5. Verify operations log
        op_types = [op[0] for op in store.operations]
        assert "create_or_get_batch" in op_types
        assert "upsert_doc_result" in op_types
        assert "finalize_batch" in op_types

    asyncio.run(_test())
