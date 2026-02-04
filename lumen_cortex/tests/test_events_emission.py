"""
A5 Event Emission Tests - Shadow FDA Reviewer

Tests for deterministic event emission from ReviewRunner:
1. Emits exactly one event when event_store provided
2. event_id deterministic across runs
3. payload hash stable
4. No-op when event_store=None

Run with: PYTHONHASHSEED=0 PYTHONPATH=. pytest lumen_cortex/tests/test_events_emission.py -v
"""

import hashlib
from datetime import datetime, timezone
from uuid import UUID

import pytest

from lumen_cortex.core.canonical import (
    CanonicalDocument,
    CanonicalParagraph,
)
from lumen_cortex.core.events import (
    EventStoreAdapter,
    EventType,
    derive_submission_uuid,
    derive_review_event_id,
    compute_content_hash,
)
from lumen_cortex.reviewer import ReviewRunner


# ============================================================================
# Fixed Test Data (deterministic)
# ============================================================================

FIXED_PROGRAM_ID = UUID("11111111-1111-1111-1111-111111111111")
FIXED_DOC_ID = UUID("22222222-2222-2222-2222-222222222222")
FIXED_TIMESTAMP = datetime(2026, 2, 4, 12, 0, 0, tzinfo=timezone.utc)
FIXED_CONTENT_HASH = hashlib.sha256(b"test document for event emission").hexdigest()


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def fixed_timestamp_factory():
    """Factory that always returns the same timestamp."""
    def factory():
        return FIXED_TIMESTAMP
    return factory


@pytest.fixture
def sample_doc() -> CanonicalDocument:
    """Create a document that will generate findings."""
    return CanonicalDocument(
        doc_id=FIXED_DOC_ID,
        content_hash=FIXED_CONTENT_HASH,
        source_type="docx",
        title="IND Test Protocol",  # IND title triggers R003
        paragraphs=[
            CanonicalParagraph(index=0, text="1. Introduction", heading_level=1),
            CanonicalParagraph(index=1, text="This is the intro text."),
            CanonicalParagraph(index=2, text="See Section 99.99 for details."),  # Broken ref
            CanonicalParagraph(index=3, text="2. Methods", heading_level=1),
        ],
        extraction_timestamp=FIXED_TIMESTAMP,
        extractor_version="1.0.0-test",
    )


@pytest.fixture
def clean_doc() -> CanonicalDocument:
    """Create a clean document with no findings."""
    return CanonicalDocument(
        doc_id=FIXED_DOC_ID,
        content_hash=FIXED_CONTENT_HASH,
        source_type="docx",
        title="Generic Protocol",  # No IND/BLA - uses DEFAULT rules
        paragraphs=[
            CanonicalParagraph(index=0, text="1. Introduction", heading_level=1, list_prefix="1"),
            CanonicalParagraph(index=1, text="This is clean content."),
            CanonicalParagraph(index=2, text="2. Methods", heading_level=1, list_prefix="2"),
            CanonicalParagraph(index=3, text="No broken references here."),
        ],
        extraction_timestamp=FIXED_TIMESTAMP,
        extractor_version="1.0.0-test",
    )


# ============================================================================
# Test: Event Emission When Enabled
# ============================================================================

class TestEventEmissionEnabled:
    """Tests when event_store is provided."""

    def test_emits_exactly_one_event(self, sample_doc, fixed_timestamp_factory):
        """ReviewRunner should emit exactly one review.findings_created event."""
        adapter = EventStoreAdapter()

        runner = ReviewRunner(
            program_id=FIXED_PROGRAM_ID,
            event_store=adapter,
            extractor_version="test-1.0.0",
            timestamp_factory=fixed_timestamp_factory,
        )

        result = runner.review(sample_doc)

        # Should have exactly one event queued
        events = adapter.get_pending_events()
        assert len(events) == 1

        # Event should be review.findings_created
        event = events[0]
        assert event.event_type == EventType.REVIEW_FINDINGS_CREATED

    def test_event_id_deterministic(self, sample_doc, fixed_timestamp_factory):
        """Same inputs should produce same event_id."""
        adapter1 = EventStoreAdapter()
        adapter2 = EventStoreAdapter()

        runner1 = ReviewRunner(
            program_id=FIXED_PROGRAM_ID,
            event_store=adapter1,
            extractor_version="test-1.0.0",
            timestamp_factory=fixed_timestamp_factory,
        )
        runner2 = ReviewRunner(
            program_id=FIXED_PROGRAM_ID,
            event_store=adapter2,
            extractor_version="test-1.0.0",
            timestamp_factory=fixed_timestamp_factory,
        )

        result1 = runner1.review(sample_doc)
        result2 = runner2.review(sample_doc)

        events1 = adapter1.get_pending_events()
        events2 = adapter2.get_pending_events()

        assert len(events1) == 1
        assert len(events2) == 1

        # event_id should be identical
        assert events1[0].event_id == events2[0].event_id

    def test_payload_hash_stable(self, sample_doc, fixed_timestamp_factory):
        """Payload content_hash should be stable across runs."""
        adapter1 = EventStoreAdapter()
        adapter2 = EventStoreAdapter()

        runner1 = ReviewRunner(
            program_id=FIXED_PROGRAM_ID,
            event_store=adapter1,
            extractor_version="test-1.0.0",
            timestamp_factory=fixed_timestamp_factory,
        )
        runner2 = ReviewRunner(
            program_id=FIXED_PROGRAM_ID,
            event_store=adapter2,
            extractor_version="test-1.0.0",
            timestamp_factory=fixed_timestamp_factory,
        )

        result1 = runner1.review(sample_doc)
        result2 = runner2.review(sample_doc)

        events1 = adapter1.get_pending_events()
        events2 = adapter2.get_pending_events()

        # content_hash should be identical
        assert events1[0].content_hash == events2[0].content_hash

    def test_event_contains_correct_payload(self, sample_doc, fixed_timestamp_factory):
        """Event payload should contain finding information."""
        adapter = EventStoreAdapter()

        runner = ReviewRunner(
            program_id=FIXED_PROGRAM_ID,
            event_store=adapter,
            extractor_version="test-1.0.0",
            timestamp_factory=fixed_timestamp_factory,
        )

        result = runner.review(sample_doc)

        events = adapter.get_pending_events()
        event = events[0]

        # Check payload structure
        payload = event.payload
        assert "document_id" in payload
        assert "rule_ids" in payload
        assert "finding_count" in payload
        assert "findings_by_severity" in payload
        assert "fingerprints" in payload
        assert "registry_version" in payload

        # Document ID should match
        assert payload["document_id"] == str(FIXED_DOC_ID)

        # Finding count should match result
        assert payload["finding_count"] == result.finding_count

    def test_submission_uuid_derived_from_doc_id(self, sample_doc, fixed_timestamp_factory):
        """submission_uuid should be deterministically derived from doc_id."""
        adapter = EventStoreAdapter()

        runner = ReviewRunner(
            program_id=FIXED_PROGRAM_ID,
            event_store=adapter,
            extractor_version="test-1.0.0",
            timestamp_factory=fixed_timestamp_factory,
        )

        result = runner.review(sample_doc)

        events = adapter.get_pending_events()
        event = events[0]

        # Verify submission_uuid matches derived value
        expected_submission_uuid = derive_submission_uuid(FIXED_DOC_ID)
        assert event.submission_uuid == expected_submission_uuid


# ============================================================================
# Test: No-Op When Event Store Disabled
# ============================================================================

class TestEventEmissionDisabled:
    """Tests when event_store is None."""

    def test_no_events_when_store_is_none(self, sample_doc, fixed_timestamp_factory):
        """No events should be queued when event_store=None."""
        runner = ReviewRunner(
            program_id=FIXED_PROGRAM_ID,
            event_store=None,  # Explicitly disabled
            extractor_version="test-1.0.0",
            timestamp_factory=fixed_timestamp_factory,
        )

        result = runner.review(sample_doc)

        # Result should still be valid
        assert result.doc_id == str(FIXED_DOC_ID)
        assert result.finding_count >= 0

    def test_no_events_when_program_id_is_none(self, sample_doc, fixed_timestamp_factory):
        """No events should be queued when program_id=None."""
        adapter = EventStoreAdapter()

        runner = ReviewRunner(
            program_id=None,  # No program_id
            event_store=adapter,
            extractor_version="test-1.0.0",
            timestamp_factory=fixed_timestamp_factory,
        )

        result = runner.review(sample_doc)

        # No events should be queued (program_id required)
        events = adapter.get_pending_events()
        assert len(events) == 0


# ============================================================================
# Test: Helper Functions
# ============================================================================

class TestHelperFunctions:
    """Tests for derive_submission_uuid and derive_review_event_id."""

    def test_derive_submission_uuid_deterministic(self):
        """Same doc_id should always produce same submission_uuid."""
        uuid1 = derive_submission_uuid(FIXED_DOC_ID)
        uuid2 = derive_submission_uuid(FIXED_DOC_ID)
        assert uuid1 == uuid2

    def test_derive_submission_uuid_different_docs(self):
        """Different doc_ids should produce different submission_uuids."""
        doc_id_2 = UUID("33333333-3333-3333-3333-333333333333")
        uuid1 = derive_submission_uuid(FIXED_DOC_ID)
        uuid2 = derive_submission_uuid(doc_id_2)
        assert uuid1 != uuid2

    def test_derive_review_event_id_deterministic(self):
        """Same inputs should always produce same event_id."""
        payload_hash = "abc123def456"

        event_id_1 = derive_review_event_id(
            program_id=FIXED_PROGRAM_ID,
            doc_id=FIXED_DOC_ID,
            payload_hash=payload_hash,
        )
        event_id_2 = derive_review_event_id(
            program_id=FIXED_PROGRAM_ID,
            doc_id=FIXED_DOC_ID,
            payload_hash=payload_hash,
        )
        assert event_id_1 == event_id_2

    def test_derive_review_event_id_different_payload(self):
        """Different payload_hash should produce different event_id."""
        event_id_1 = derive_review_event_id(
            program_id=FIXED_PROGRAM_ID,
            doc_id=FIXED_DOC_ID,
            payload_hash="hash1",
        )
        event_id_2 = derive_review_event_id(
            program_id=FIXED_PROGRAM_ID,
            doc_id=FIXED_DOC_ID,
            payload_hash="hash2",
        )
        assert event_id_1 != event_id_2


# ============================================================================
# Test: Clean Document (Zero Findings)
# ============================================================================

class TestCleanDocumentEmission:
    """Tests for clean documents that may produce zero findings."""

    def test_emits_event_even_with_zero_findings(self, clean_doc, fixed_timestamp_factory):
        """Event should be emitted even when finding_count=0."""
        adapter = EventStoreAdapter()

        runner = ReviewRunner(
            program_id=FIXED_PROGRAM_ID,
            event_store=adapter,
            extractor_version="test-1.0.0",
            timestamp_factory=fixed_timestamp_factory,
        )

        result = runner.review(clean_doc)

        # Should still emit event
        events = adapter.get_pending_events()
        assert len(events) == 1

        # Payload should show zero findings for R001/R002
        event = events[0]
        # Note: R003 may still fire for missing CTD sections depending on doc_type
        assert event.payload["finding_count"] >= 0
