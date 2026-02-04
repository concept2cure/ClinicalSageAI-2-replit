"""
Event Store Integration Tests - A7-4

Tests for event emission wiring without requiring Neon access.
Uses a fake execute_fn to capture emitted events.

PYTHONHASHSEED=0 required for determinism.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import List, Dict, Any
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
from lumen_cortex.reviewer import ReviewRunner


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

def fixed_ts() -> datetime:
    """Fixed timestamp factory for deterministic tests."""
    return datetime(2026, 2, 4, 12, 0, 0, tzinfo=timezone.utc)


def make_doc(content: str, doc_id: UUID = None) -> CanonicalDocument:
    """Create a CanonicalDocument for testing."""
    doc_id = doc_id or uuid4()
    content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()

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


class CapturingEventStore(EventStoreAdapter):
    """
    Event store that captures events via fake execute_fn.

    Tracks:
    - All queued events
    - SQL "statements" that would be executed
    - Event type counts
    """

    def __init__(self):
        self.captured_events: List[RPSEvent] = []
        self.sql_calls: List[Dict[str, Any]] = []

        def fake_execute(sql: str, params: Any = None):
            """Fake execute function that captures calls."""
            self.sql_calls.append({
                "sql": sql,
                "params": params,
            })

        super().__init__(execute_fn=fake_execute)

    def queue_event(self, event: RPSEvent) -> None:
        """Override to also capture events."""
        self.captured_events.append(event)
        super().queue_event(event)

    def get_event_type_counts(self) -> Dict[str, int]:
        """Count events by type."""
        counts: Dict[str, int] = {}
        for event in self.captured_events:
            event_type = event.event_type.value
            counts[event_type] = counts.get(event_type, 0) + 1
        return counts


# ─────────────────────────────────────────────────────────────────────────────
# Integration Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestBatchEventEmissionIntegration:
    """Test event emission for batch review with wiring verification."""

    def test_batch_with_two_good_docs_emits_correct_events(self):
        """
        Batch with 2 good docs → emits:
        - 2x review.findings_created
        - 1x review.batch_completed
        """
        program_id = UUID("11111111-1111-1111-1111-111111111111")

        docs = [
            make_doc("Document A content\n\nParagraph 2"),
            make_doc("Document B content\n\nParagraph 2"),
        ]

        event_store = CapturingEventStore()
        runner = ReviewRunner(
            program_id=program_id,
            event_store=event_store,
            timestamp_factory=fixed_ts,
        )

        result = runner.review_batch(docs=docs, program_id=program_id)

        # Verify event counts
        counts = event_store.get_event_type_counts()
        assert counts.get("review.findings_created", 0) == 2
        assert counts.get("review.batch_completed", 0) == 1
        assert counts.get("review.document_failed", 0) == 0

        # Total events = 3
        assert len(event_store.captured_events) == 3

    def test_batch_with_one_good_one_failed_emits_correct_events(self):
        """
        Batch with 1 good + 1 failed → emits:
        - 1x review.findings_created
        - 1x review.document_failed
        - 1x review.batch_completed
        """
        program_id = UUID("22222222-2222-2222-2222-222222222222")

        docs = [make_doc("Good document content")]

        errored_docs = [
            {
                "doc_id": "33333333-3333-3333-3333-333333333333",
                "content_hash": "error_hash_abc",
                "filename": "corrupt.pdf",
                "error_codes": ["extract_failed"],
            },
        ]

        event_store = CapturingEventStore()
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

        # Verify event counts
        counts = event_store.get_event_type_counts()
        assert counts.get("review.findings_created", 0) == 1
        assert counts.get("review.document_failed", 0) == 1
        assert counts.get("review.batch_completed", 0) == 1

        # Total events = 3
        assert len(event_store.captured_events) == 3

        # Verify document_failed payload
        failed_events = [
            e for e in event_store.captured_events
            if e.event_type == EventType.REVIEW_DOCUMENT_FAILED
        ]
        assert len(failed_events) == 1
        payload = failed_events[0].payload
        assert payload["doc_id"] == "33333333-3333-3333-3333-333333333333"
        assert payload["error_codes"] == ["extract_failed"]

    def test_determinism_with_fixed_timestamp(self):
        """
        Fixed timestamp factory → same event IDs + payload hashes.
        """
        program_id = UUID("44444444-4444-4444-4444-444444444444")
        doc_id = UUID("55555555-5555-5555-5555-555555555555")

        docs = [make_doc("Deterministic doc content", doc_id=doc_id)]

        # First run
        event_store_1 = CapturingEventStore()
        runner_1 = ReviewRunner(
            program_id=program_id,
            event_store=event_store_1,
            timestamp_factory=fixed_ts,
        )
        runner_1.review_batch(docs=docs, program_id=program_id)

        # Second run
        event_store_2 = CapturingEventStore()
        runner_2 = ReviewRunner(
            program_id=program_id,
            event_store=event_store_2,
            timestamp_factory=fixed_ts,
        )
        runner_2.review_batch(docs=docs, program_id=program_id)

        # Compare event IDs
        events_1 = event_store_1.captured_events
        events_2 = event_store_2.captured_events

        assert len(events_1) == len(events_2)

        for e1, e2 in zip(events_1, events_2):
            assert e1.event_id == e2.event_id, f"Event ID mismatch for {e1.event_type}"
            assert e1.content_hash == e2.content_hash, f"Content hash mismatch for {e1.event_type}"

    def test_batch_completed_contains_all_doc_summaries(self):
        """
        batch_completed payload contains summary for each document.
        """
        program_id = UUID("66666666-6666-6666-6666-666666666666")

        docs = [
            make_doc("Doc A"),
            make_doc("Doc B"),
            make_doc("Doc C"),
        ]

        event_store = CapturingEventStore()
        runner = ReviewRunner(
            program_id=program_id,
            event_store=event_store,
            timestamp_factory=fixed_ts,
        )

        result = runner.review_batch(docs=docs, program_id=program_id)

        # Get batch_completed event
        batch_events = [
            e for e in event_store.captured_events
            if e.event_type == EventType.REVIEW_BATCH_COMPLETED
        ]
        assert len(batch_events) == 1

        payload = batch_events[0].payload
        assert payload["total_documents"] == 3
        assert len(payload["documents"]) == 3

        # Each doc summary should have required fields
        for doc_summary in payload["documents"]:
            assert "doc_id" in doc_summary
            assert "content_hash" in doc_summary
            assert "findings_count" in doc_summary
            assert "findings_digest" in doc_summary

    def test_no_events_when_event_store_is_none(self):
        """
        event_store=None → no events emitted, no errors.
        """
        program_id = UUID("77777777-7777-7777-7777-777777777777")

        docs = [make_doc("Document content")]

        runner = ReviewRunner(
            program_id=program_id,
            event_store=None,  # Disabled
            timestamp_factory=fixed_ts,
        )

        # Should not raise
        result = runner.review_batch(docs=docs, program_id=program_id)

        # Results should still be valid
        assert result.total_documents == 1
        assert result.batch_id is not None


class TestEventPayloadIntegrity:
    """Test event payload structure and content."""

    def test_findings_created_payload_structure(self):
        """
        findings_created payload has correct structure.
        """
        program_id = UUID("88888888-8888-8888-8888-888888888888")
        docs = [make_doc("Document with content\n\nAnother paragraph")]

        event_store = CapturingEventStore()
        runner = ReviewRunner(
            program_id=program_id,
            event_store=event_store,
            timestamp_factory=fixed_ts,
        )

        runner.review_batch(docs=docs, program_id=program_id)

        findings_events = [
            e for e in event_store.captured_events
            if e.event_type == EventType.REVIEW_FINDINGS_CREATED
        ]
        assert len(findings_events) == 1

        payload = findings_events[0].payload
        assert "document_id" in payload
        assert "rule_ids" in payload
        assert "finding_count" in payload
        assert "findings_by_severity" in payload
        assert "fingerprints" in payload
        assert "registry_version" in payload

    def test_document_failed_payload_structure(self):
        """
        document_failed payload has correct structure.
        """
        program_id = UUID("99999999-9999-9999-9999-999999999999")

        errored_docs = [
            {
                "doc_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "content_hash": "hash123",
                "filename": "bad_file.pdf",
                "error_codes": ["unsupported_type", "too_large"],
            },
        ]

        event_store = CapturingEventStore()
        runner = ReviewRunner(
            program_id=program_id,
            event_store=event_store,
            timestamp_factory=fixed_ts,
        )

        runner.review_batch(docs=[], program_id=program_id, errored_docs=errored_docs)

        failed_events = [
            e for e in event_store.captured_events
            if e.event_type == EventType.REVIEW_DOCUMENT_FAILED
        ]
        assert len(failed_events) == 1

        payload = failed_events[0].payload
        assert payload["program_id"] == str(program_id)
        assert payload["doc_id"] == "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        assert payload["content_hash"] == "hash123"
        assert payload["filename"] == "bad_file.pdf"
        assert set(payload["error_codes"]) == {"too_large", "unsupported_type"}
        assert "extractor_version" in payload
        assert "ruleset_version" in payload
        assert "occurred_at" in payload
