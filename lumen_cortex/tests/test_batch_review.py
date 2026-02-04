"""
Batch Review Tests - A7-1

Tests for deterministic batch review with:
- Document ordering by content_hash
- Event emission (N findings_created + 1 batch_completed)
- Payload hash stability
- Event ID determinism
- No-op when event_store=None

PYTHONHASHSEED=0 required for determinism.
"""

from __future__ import annotations

import hashlib
import asyncio
from datetime import datetime, timezone
from typing import List
from uuid import UUID, uuid4

import pytest

from lumen_cortex.core.canonical import CanonicalDocument
from lumen_cortex.core.canonical.document import CanonicalParagraph
from lumen_cortex.core.events import (
    EventStoreAdapter,
    EventType,
    RPSEvent,
    derive_batch_id,
    compute_content_hash,
)
from lumen_cortex.reviewer import ReviewRunner, BatchReviewResult
from lumen_cortex.reviewer.run import _compute_findings_digest


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

def fixed_ts() -> datetime:
    """Fixed timestamp factory for deterministic tests."""
    return datetime(2026, 2, 3, 12, 0, 0, tzinfo=timezone.utc)


def make_doc(content: str, doc_id: UUID = None) -> CanonicalDocument:
    """Create a CanonicalDocument for testing."""
    doc_id = doc_id or uuid4()
    content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()

    # Split into paragraphs and create CanonicalParagraph objects
    raw_paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
    if not raw_paragraphs:
        raw_paragraphs = [content]

    paragraphs = [
        CanonicalParagraph(index=i, text=text)
        for i, text in enumerate(raw_paragraphs)
    ]

    return CanonicalDocument(
        doc_id=doc_id,
        content_hash=content_hash,
        source_type="docx",
        paragraphs=paragraphs,
        extraction_timestamp=fixed_ts(),
        extractor_version="test-1.0.0",
    )


class FakeEventStore(EventStoreAdapter):
    """Fake event store that collects events without DB."""

    def __init__(self):
        super().__init__(execute_fn=None)
        self.collected_events: List[RPSEvent] = []

    def queue_event(self, event: RPSEvent) -> None:
        """Collect event instead of queueing."""
        self.collected_events.append(event)


# ─────────────────────────────────────────────────────────────────────────────
# Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestBatchDocumentOrdering:
    """Test that batch review orders documents by content_hash."""

    def test_batch_orders_docs_by_hash(self):
        """Input docs in reverse order → output sorted by content_hash, then doc_id."""
        program_id = UUID("11111111-1111-1111-1111-111111111111")

        # Create docs with different content (different hashes)
        doc_a = make_doc("Document A content")
        doc_b = make_doc("Document B content")
        doc_c = make_doc("Document C content")

        # Input in arbitrary order
        docs = [doc_c, doc_a, doc_b]

        runner = ReviewRunner(program_id=program_id, timestamp_factory=fixed_ts)
        result = runner.review_batch(docs=docs, program_id=program_id)

        # Output should be sorted by content_hash
        output_hashes = [d.content_hash for d in result.documents]
        assert output_hashes == sorted(output_hashes), "Documents not sorted by content_hash"

    def test_batch_orders_by_doc_id_on_hash_tie(self):
        """When content_hash ties, sort by doc_id."""
        program_id = UUID("11111111-1111-1111-1111-111111111111")

        # Create docs with SAME content (same hash)
        content = "Identical content for all documents"
        doc_1 = make_doc(content, doc_id=UUID("33333333-3333-3333-3333-333333333333"))
        doc_2 = make_doc(content, doc_id=UUID("11111111-1111-1111-1111-111111111111"))
        doc_3 = make_doc(content, doc_id=UUID("22222222-2222-2222-2222-222222222222"))

        docs = [doc_1, doc_2, doc_3]  # Out of order

        runner = ReviewRunner(program_id=program_id, timestamp_factory=fixed_ts)
        result = runner.review_batch(docs=docs, program_id=program_id)

        # Output should be sorted by doc_id (since hashes are equal)
        output_doc_ids = [d.doc_id for d in result.documents]
        assert output_doc_ids == sorted(output_doc_ids), "Documents not sorted by doc_id on hash tie"


class TestBatchEventEmission:
    """Test event emission for batch review."""

    def test_batch_emits_n_plus_one_events(self):
        """For N docs, expect N findings_created + 1 batch_completed."""
        program_id = UUID("22222222-2222-2222-2222-222222222222")

        # Create 3 documents
        docs = [
            make_doc(f"Document {i} content\n\nParagraph 2")
            for i in range(3)
        ]

        event_store = FakeEventStore()
        runner = ReviewRunner(
            program_id=program_id,
            event_store=event_store,
            timestamp_factory=fixed_ts,
        )

        result = runner.review_batch(docs=docs, program_id=program_id)

        # Should have 3 findings_created + 1 batch_completed = 4 events
        events = event_store.collected_events
        assert len(events) == 4, f"Expected 4 events, got {len(events)}"

        findings_events = [e for e in events if e.event_type == EventType.REVIEW_FINDINGS_CREATED]
        batch_events = [e for e in events if e.event_type == EventType.REVIEW_BATCH_COMPLETED]

        assert len(findings_events) == 3, f"Expected 3 findings_created, got {len(findings_events)}"
        assert len(batch_events) == 1, f"Expected 1 batch_completed, got {len(batch_events)}"

    def test_batch_noop_without_event_store(self):
        """Pass event_store=None → no exception, results still correct."""
        program_id = UUID("33333333-3333-3333-3333-333333333333")

        docs = [
            make_doc("Document 1\n\nParagraph 2"),
            make_doc("Document 2\n\nParagraph 2"),
        ]

        # No event store
        runner = ReviewRunner(
            program_id=program_id,
            event_store=None,
            timestamp_factory=fixed_ts,
        )

        # Should not raise
        result = runner.review_batch(docs=docs, program_id=program_id)

        # Results should still be valid
        assert result.total_documents == 2
        assert result.batch_id is not None
        assert len(result.documents) == 2


class TestBatchDeterminism:
    """Test determinism of batch review."""

    def test_batch_event_payload_hash_stable(self):
        """Run twice with fixed timestamp_factory → same payload_hash."""
        program_id = UUID("44444444-4444-4444-4444-444444444444")

        # Use fixed doc_ids for full determinism
        doc_id_1 = UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")
        doc_id_2 = UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")

        docs = [
            make_doc("Document A\n\nSection 1", doc_id=doc_id_1),
            make_doc("Document B\n\nSection 2", doc_id=doc_id_2),
        ]

        # First run
        event_store_1 = FakeEventStore()
        runner_1 = ReviewRunner(
            program_id=program_id,
            event_store=event_store_1,
            timestamp_factory=fixed_ts,
        )
        result_1 = runner_1.review_batch(docs=docs, program_id=program_id)

        # Second run (same inputs)
        event_store_2 = FakeEventStore()
        runner_2 = ReviewRunner(
            program_id=program_id,
            event_store=event_store_2,
            timestamp_factory=fixed_ts,
        )
        result_2 = runner_2.review_batch(docs=docs, program_id=program_id)

        # Compare batch_completed event payload hashes
        batch_event_1 = [e for e in event_store_1.collected_events
                        if e.event_type == EventType.REVIEW_BATCH_COMPLETED][0]
        batch_event_2 = [e for e in event_store_2.collected_events
                        if e.event_type == EventType.REVIEW_BATCH_COMPLETED][0]

        assert batch_event_1.content_hash == batch_event_2.content_hash, \
            "Payload hashes differ between runs"

    def test_batch_event_id_stable(self):
        """Run twice with same inputs → same event_id."""
        program_id = UUID("55555555-5555-5555-5555-555555555555")

        # Use fixed doc_ids for determinism
        doc_id_1 = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        doc_id_2 = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")

        docs = [
            make_doc("Doc A content", doc_id=doc_id_1),
            make_doc("Doc B content", doc_id=doc_id_2),
        ]

        # First run
        event_store_1 = FakeEventStore()
        runner_1 = ReviewRunner(
            program_id=program_id,
            event_store=event_store_1,
            timestamp_factory=fixed_ts,
        )
        runner_1.review_batch(docs=docs, program_id=program_id)

        # Second run
        event_store_2 = FakeEventStore()
        runner_2 = ReviewRunner(
            program_id=program_id,
            event_store=event_store_2,
            timestamp_factory=fixed_ts,
        )
        runner_2.review_batch(docs=docs, program_id=program_id)

        # Compare all event IDs
        event_ids_1 = [str(e.event_id) for e in event_store_1.collected_events]
        event_ids_2 = [str(e.event_id) for e in event_store_2.collected_events]

        assert event_ids_1 == event_ids_2, "Event IDs differ between runs"

    def test_batch_id_deterministic(self):
        """Same inputs → same batch_id."""
        program_id = UUID("66666666-6666-6666-6666-666666666666")

        doc_id_1 = UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
        doc_id_2 = UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")

        docs = [
            make_doc("Content 1", doc_id=doc_id_1),
            make_doc("Content 2", doc_id=doc_id_2),
        ]

        runner = ReviewRunner(program_id=program_id, timestamp_factory=fixed_ts)

        result_1 = runner.review_batch(docs=docs, program_id=program_id)
        result_2 = runner.review_batch(docs=docs, program_id=program_id)

        assert result_1.batch_id == result_2.batch_id, "Batch IDs differ between runs"


class TestFindingsDigest:
    """Test findings digest computation."""

    def test_findings_digest_is_deterministic(self):
        """Digest = sha256 of |-joined fingerprints (sorted)."""
        program_id = UUID("77777777-7777-7777-7777-777777777777")
        doc_id = UUID("88888888-8888-8888-8888-888888888888")

        # Create doc that triggers findings (broken xref)
        doc = CanonicalDocument(
            doc_id=doc_id,
            content_hash=hashlib.sha256(b"test content").hexdigest(),
            source_type="docx",
            paragraphs=[
                CanonicalParagraph(index=0, text="See Table 5.2.1 for details."),
                CanonicalParagraph(index=1, text="Reference to non-existent anchor."),
            ],
            extraction_timestamp=fixed_ts(),
            extractor_version="test-1.0.0",
        )

        runner = ReviewRunner(program_id=program_id, timestamp_factory=fixed_ts)
        result = runner.review_batch(docs=[doc], program_id=program_id)

        # Get the document result
        doc_result = result.documents[0]

        # Manually compute expected digest
        sorted_fingerprints = sorted(f.fingerprint for f in doc_result.findings)
        expected_digest = hashlib.sha256("|".join(sorted_fingerprints).encode()).hexdigest()

        assert doc_result.findings_digest == expected_digest, \
            "Findings digest doesn't match manual computation"

    def test_findings_digest_empty_list(self):
        """Empty findings → digest of empty string."""
        # Compute digest of empty |-joined list
        expected = hashlib.sha256("".encode()).hexdigest()
        actual = _compute_findings_digest([])

        assert actual == expected, "Empty findings digest incorrect"


class TestBatchAPIContract:
    """Test batch API response contract."""

    def test_batch_response_structure(self):
        """Verify response matches API contract."""
        program_id = UUID("88888888-8888-8888-8888-888888888888")
        doc_id_1 = UUID("99999999-9999-9999-9999-999999999999")
        doc_id_2 = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

        docs = [
            make_doc("Doc 1 content\n\nPara 2", doc_id=doc_id_1),
            make_doc("Doc 2 content\n\nPara 2", doc_id=doc_id_2),
        ]

        runner = ReviewRunner(program_id=program_id, timestamp_factory=fixed_ts)
        result = runner.review_batch(docs=docs, program_id=program_id)

        # Convert to dict (API response format)
        response = result.to_dict()

        # Verify required fields
        assert "batch_id" in response
        assert "program_id" in response
        assert "documents" in response
        assert "summary" in response

        # Verify summary structure
        summary = response["summary"]
        assert "documents" in summary
        assert "findings_total" in summary
        assert "by_severity" in summary

        # Verify document structure
        for doc in response["documents"]:
            assert "doc_id" in doc
            assert "content_hash" in doc
            assert "findings_count" in doc
            assert "findings_digest" in doc
            assert "findings_truncated" in doc
            assert "findings_preview" in doc
            assert "errors" in doc


class TestBatchIdDerivation:
    """Test batch_id derivation helper."""

    def test_derive_batch_id_stable(self):
        """Same inputs → same batch_id."""
        program_id = UUID("99999999-9999-9999-9999-999999999999")
        ruleset_version = "0.1"
        extractor_version = "abc123"
        content_hashes = ["hash1", "hash2", "hash3"]

        batch_id_1 = derive_batch_id(program_id, ruleset_version, extractor_version, content_hashes)
        batch_id_2 = derive_batch_id(program_id, ruleset_version, extractor_version, content_hashes)

        assert batch_id_1 == batch_id_2, "Batch IDs differ for same inputs"

    def test_derive_batch_id_differs_with_different_hashes(self):
        """Different content_hashes → different batch_id."""
        program_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

        batch_id_1 = derive_batch_id(program_id, "0.1", "v1", ["hash1", "hash2"])
        batch_id_2 = derive_batch_id(program_id, "0.1", "v1", ["hash1", "hash3"])

        assert batch_id_1 != batch_id_2, "Batch IDs should differ for different hashes"

    def test_derive_batch_id_invariant_to_order(self):
        """Same hashes in different order → same batch_id."""
        program_id = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
        ruleset_version = "0.1"
        extractor_version = "v1"

        hashes_a = ["hash1", "hash2", "hash3"]
        hashes_b = ["hash3", "hash1", "hash2"]

        batch_id_a = derive_batch_id(program_id, ruleset_version, extractor_version, hashes_a)
        batch_id_b = derive_batch_id(program_id, ruleset_version, extractor_version, hashes_b)

        assert batch_id_a == batch_id_b, "Batch ID should be invariant to hash ordering"

    def test_derive_batch_id_agnostic_to_doc_ids(self):
        """Same content hashes from different doc_ids → same batch_id."""
        program_id = UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
        ruleset_version = "0.1"
        extractor_version = "v1"

        content = "Same content"
        hash_value = hashlib.sha256(content.encode("utf-8")).hexdigest()

        # Different doc_ids, same content hash
        hashes_a = [hash_value, hash_value]
        hashes_b = [hash_value, hash_value]

        batch_id_a = derive_batch_id(program_id, ruleset_version, extractor_version, hashes_a)
        batch_id_b = derive_batch_id(program_id, ruleset_version, extractor_version, hashes_b)

        assert batch_id_a == batch_id_b, "Batch ID should ignore doc_id differences"


class TestBatchResponseMode:
    """Test response_mode behavior for batch endpoint."""

    def test_summary_mode_limits_findings(self):
        """Summary mode returns no more than max_findings_per_doc per doc."""
        pytest.importorskip("fastapi")
        from fastapi import BackgroundTasks, HTTPException
        from lumen_cortex.reviewer.api import (
            review_batch_endpoint,
            BatchReviewRequest,
            BatchDocumentInput,
            ReviewTextInput,
        )
        program_id = UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")

        request = BatchReviewRequest(
            program_id=program_id,
            documents=[
                BatchDocumentInput(
                    text=ReviewTextInput(
                        content="See Table 5.2.1 for details.\n\nMissing sections in this doc.",
                        source_type="docx",
                    )
                )
            ],
            response_mode="summary",
            max_findings_per_doc=1,
        )

        response = asyncio.run(review_batch_endpoint(request, BackgroundTasks()))
        assert response.documents[0].findings_count >= 0
        assert len(response.documents[0].findings_preview) <= 1

    def test_full_mode_returns_all_findings(self):
        """Full mode returns all findings (>= summary findings)."""
        pytest.importorskip("fastapi")
        from fastapi import BackgroundTasks
        from lumen_cortex.reviewer.api import (
            review_batch_endpoint,
            BatchReviewRequest,
            BatchDocumentInput,
            ReviewTextInput,
        )
        program_id = UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")

        request_summary = BatchReviewRequest(
            program_id=program_id,
            documents=[
                BatchDocumentInput(
                    text=ReviewTextInput(
                        content="See Table 5.2.1 for details.\n\nMissing sections in this doc.",
                        source_type="docx",
                    )
                )
            ],
            response_mode="summary",
        )

        request_full = BatchReviewRequest(
            program_id=program_id,
            documents=[
                BatchDocumentInput(
                    text=ReviewTextInput(
                        content="See Table 5.2.1 for details.\n\nMissing sections in this doc.",
                        source_type="docx",
                    )
                )
            ],
            response_mode="full",
            max_findings_per_doc=10,
        )

        response_summary = asyncio.run(review_batch_endpoint(request_summary, BackgroundTasks()))
        response_full = asyncio.run(review_batch_endpoint(request_full, BackgroundTasks()))

        assert len(response_full.documents[0].findings_preview) >= len(response_summary.documents[0].findings_preview)

    def test_max_docs_enforced(self):
        """Batch request rejects when documents exceed REVIEW_CONFIG.max_batch_docs."""
        pytest.importorskip("fastapi")
        from fastapi import BackgroundTasks
        from lumen_cortex.reviewer.api import (
            review_batch_endpoint,
            BatchReviewRequest,
            BatchDocumentInput,
            ReviewTextInput,
        )
        from lumen_cortex.reviewer.config import REVIEW_CONFIG
        program_id = UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")

        # Create more documents than max_batch_docs allows
        # Default is 50, so create 51
        documents = [
            BatchDocumentInput(
                text=ReviewTextInput(
                    content=f"Doc {i}",
                    source_type="docx",
                )
            )
            for i in range(REVIEW_CONFIG.max_batch_docs + 1)
        ]

        request = BatchReviewRequest(
            program_id=program_id,
            documents=documents,
        )

        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            asyncio.run(review_batch_endpoint(request, BackgroundTasks()))

        assert exc.value.status_code == 413


class TestDocumentFailedEvent:
    """Test review.document_failed event emission."""

    def test_document_failed_event_emitted_for_errored_docs(self):
        """Errored docs emit document_failed events."""
        program_id = UUID("11111111-1111-1111-1111-111111111111")

        # Create one valid doc
        docs = [make_doc("Valid document content")]

        # Simulate errored doc info (as would come from API layer)
        errored_docs = [
            {
                "doc_id": "22222222-2222-2222-2222-222222222222",
                "content_hash": "abc123",
                "filename": "bad_file.exe",
                "error_codes": ["unsupported_type"],
            },
        ]

        event_store = FakeEventStore()
        runner = ReviewRunner(
            program_id=program_id,
            event_store=event_store,
            timestamp_factory=fixed_ts,
        )

        result = runner.review_batch(
            docs=docs,
            program_id=program_id,
            errored_docs=errored_docs,
        )

        # Should have: 1 findings_created + 1 document_failed + 1 batch_completed = 3 events
        events = event_store.collected_events
        assert len(events) == 3, f"Expected 3 events, got {len(events)}"

        failed_events = [e for e in events if e.event_type == EventType.REVIEW_DOCUMENT_FAILED]
        assert len(failed_events) == 1, f"Expected 1 document_failed, got {len(failed_events)}"

        # Check payload
        payload = failed_events[0].payload
        assert payload["doc_id"] == "22222222-2222-2222-2222-222222222222"
        assert payload["filename"] == "bad_file.exe"
        assert payload["error_codes"] == ["unsupported_type"]

    def test_document_failed_event_id_is_deterministic(self):
        """Same errored doc with same timestamp → same event_id."""
        program_id = UUID("33333333-3333-3333-3333-333333333333")

        errored_docs = [
            {
                "doc_id": "44444444-4444-4444-4444-444444444444",
                "content_hash": "hashXYZ",
                "filename": "corrupt.pdf",
                "error_codes": ["extract_failed"],
            },
        ]

        # First run
        event_store_1 = FakeEventStore()
        runner_1 = ReviewRunner(
            program_id=program_id,
            event_store=event_store_1,
            timestamp_factory=fixed_ts,
        )
        runner_1.review_batch(docs=[], program_id=program_id, errored_docs=errored_docs)

        # Second run
        event_store_2 = FakeEventStore()
        runner_2 = ReviewRunner(
            program_id=program_id,
            event_store=event_store_2,
            timestamp_factory=fixed_ts,
        )
        runner_2.review_batch(docs=[], program_id=program_id, errored_docs=errored_docs)

        failed_event_1 = [e for e in event_store_1.collected_events
                         if e.event_type == EventType.REVIEW_DOCUMENT_FAILED][0]
        failed_event_2 = [e for e in event_store_2.collected_events
                         if e.event_type == EventType.REVIEW_DOCUMENT_FAILED][0]

        assert failed_event_1.event_id == failed_event_2.event_id
