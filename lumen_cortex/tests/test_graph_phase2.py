"""
Phase 2 Graph Tests - Deterministic Validation
===============================================

Tests for:
1. Anchor extraction determinism
2. Cross-reference detection determinism
3. Graph validation accuracy
4. Ordering stability

Run with: PYTHONHASHSEED=0 pytest lumen_cortex/tests/test_graph_phase2.py -v
"""

import hashlib
from datetime import datetime, timezone
from uuid import UUID

import pytest

from lumen_cortex.core.canonical import (
    CanonicalDocument,
    CanonicalParagraph,
    AnchorLocation,
    CrossRef as DocxCrossRef,
)
from lumen_cortex.graph.anchors import AnchorExtractor, Anchor
from lumen_cortex.graph.anchors.models import normalize_anchor_key
from lumen_cortex.graph.xrefs import CrossRefDetector, CrossRef
from lumen_cortex.graph.validate import GraphValidator, ValidationResult


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def fixed_uuid() -> UUID:
    return UUID("12345678-1234-5678-1234-567812345678")


@pytest.fixture
def fixed_timestamp() -> datetime:
    return datetime(2026, 2, 3, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def sample_content_hash() -> str:
    return hashlib.sha256(b"test document content").hexdigest()


@pytest.fixture
def doc_with_headings(fixed_uuid: UUID, sample_content_hash: str, fixed_timestamp: datetime) -> CanonicalDocument:
    """Document with headings for anchor extraction."""
    return CanonicalDocument(
        doc_id=fixed_uuid,
        content_hash=sample_content_hash,
        source_type="docx",
        title="Test Protocol",
        paragraphs=[
            CanonicalParagraph(index=0, text="Introduction", heading_level=1),
            CanonicalParagraph(index=1, text="This is the intro text."),
            CanonicalParagraph(index=2, text="Methods", heading_level=1),
            CanonicalParagraph(index=3, text="Study methodology here."),
            CanonicalParagraph(index=4, text="Results", heading_level=1),
            CanonicalParagraph(index=5, text="See Section 1 for background."),
            CanonicalParagraph(index=6, text="Discussion", heading_level=1),
        ],
        extraction_timestamp=fixed_timestamp,
        extractor_version="1.0.0-test",
    )


@pytest.fixture
def doc_with_xrefs(fixed_uuid: UUID, sample_content_hash: str, fixed_timestamp: datetime) -> CanonicalDocument:
    """Document with cross-references for detection."""
    return CanonicalDocument(
        doc_id=fixed_uuid,
        content_hash=sample_content_hash,
        source_type="docx",
        title="Test Protocol with Refs",
        paragraphs=[
            CanonicalParagraph(index=0, text="5.3.2 Pharmacokinetics", heading_level=2, list_prefix="5.3.2"),
            CanonicalParagraph(index=1, text="This section describes PK parameters."),
            CanonicalParagraph(index=2, text="See Section 5.3.2 for details on absorption."),
            CanonicalParagraph(index=3, text="Results are shown in Table 4."),
            CanonicalParagraph(index=4, text="As described in Section 2.1, the study was designed..."),
            CanonicalParagraph(index=5, text="Refer to Figure 3 for the plasma concentration curve."),
            CanonicalParagraph(index=6, text="See Section 99.99 which does not exist."),  # Broken ref
        ],
        extraction_timestamp=fixed_timestamp,
        extractor_version="1.0.0-test",
    )


@pytest.fixture
def doc_with_duplicate_anchors(fixed_uuid: UUID, sample_content_hash: str, fixed_timestamp: datetime) -> CanonicalDocument:
    """Document with duplicate heading text."""
    return CanonicalDocument(
        doc_id=fixed_uuid,
        content_hash=sample_content_hash,
        source_type="docx",
        title="Test with Duplicates",
        paragraphs=[
            CanonicalParagraph(index=0, text="Overview", heading_level=1),
            CanonicalParagraph(index=1, text="First overview section."),
            CanonicalParagraph(index=2, text="Overview", heading_level=1),  # Duplicate!
            CanonicalParagraph(index=3, text="Second overview section."),
            CanonicalParagraph(index=4, text="Overview", heading_level=1),  # Third duplicate!
            CanonicalParagraph(index=5, text="Third overview section."),
        ],
        extraction_timestamp=fixed_timestamp,
        extractor_version="1.0.0-test",
    )


# =============================================================================
# Anchor Key Normalization Tests
# =============================================================================

class TestAnchorKeyNormalization:
    """Test deterministic anchor key generation."""

    def test_basic_normalization(self):
        """Basic text normalization."""
        assert normalize_anchor_key("Introduction") == "introduction"
        assert normalize_anchor_key("  Introduction  ") == "introduction"

    def test_with_numbering(self):
        """Section numbering handling."""
        assert normalize_anchor_key("Pharmacokinetics", "5.3.2") == "section-5-3-2-pharmacokinetics"
        assert normalize_anchor_key("Overview", "1.2") == "section-1-2-overview"

    def test_special_characters(self):
        """Special character handling."""
        assert normalize_anchor_key("Table 4: Demographics") == "table-4-demographics"
        assert normalize_anchor_key("Results (Preliminary)") == "results-preliminary"

    def test_unicode_folding(self):
        """Unicode to ASCII folding."""
        assert normalize_anchor_key("Résumé") == "resume"
        assert normalize_anchor_key("naïve") == "naive"

    def test_determinism(self):
        """Same input always produces same output."""
        text = "5.3.2 Pharmacokinetics and Drug Metabolism"
        key1 = normalize_anchor_key(text, "5.3.2")
        key2 = normalize_anchor_key(text, "5.3.2")
        assert key1 == key2


# =============================================================================
# Anchor Extraction Tests
# =============================================================================

class TestAnchorExtraction:
    """Test deterministic anchor extraction."""

    def test_extract_headings(self, doc_with_headings: CanonicalDocument):
        """Extract heading anchors."""
        extractor = AnchorExtractor()
        anchors = extractor.extract(doc_with_headings)

        # Should extract 4 headings
        assert len(anchors) == 4

        # Check anchor keys
        keys = [a.anchor_key for a in anchors]
        assert "introduction" in keys
        assert "methods" in keys
        assert "results" in keys
        assert "discussion" in keys

    def test_extraction_determinism(self, doc_with_headings: CanonicalDocument):
        """Same document always produces identical anchors."""
        extractor = AnchorExtractor()

        anchors1 = extractor.extract(doc_with_headings)
        anchors2 = extractor.extract(doc_with_headings)

        # Same count
        assert len(anchors1) == len(anchors2)

        # Same order and content
        for a1, a2 in zip(anchors1, anchors2):
            assert a1.anchor_key == a2.anchor_key
            assert a1.anchor_ordinal == a2.anchor_ordinal
            assert a1.evidence_pointer.paragraph_index == a2.evidence_pointer.paragraph_index

    def test_duplicate_handling(self, doc_with_duplicate_anchors: CanonicalDocument):
        """Duplicate anchors get incrementing ordinals."""
        extractor = AnchorExtractor()
        anchors = extractor.extract(doc_with_duplicate_anchors)

        # Should have 3 "overview" anchors
        overview_anchors = [a for a in anchors if a.anchor_key == "overview"]
        assert len(overview_anchors) == 3

        # Check ordinals are 0, 1, 2
        ordinals = sorted([a.anchor_ordinal for a in overview_anchors])
        assert ordinals == [0, 1, 2]

    def test_ordering_stability(self, doc_with_headings: CanonicalDocument):
        """Anchors are sorted by paragraph_index."""
        extractor = AnchorExtractor()
        anchors = extractor.extract(doc_with_headings)

        # Check order matches paragraph order
        paragraph_indices = [a.evidence_pointer.paragraph_index for a in anchors]
        assert paragraph_indices == sorted(paragraph_indices)


# =============================================================================
# Cross-Reference Detection Tests
# =============================================================================

class TestCrossRefDetection:
    """Test deterministic cross-reference detection."""

    def test_detect_section_refs(self, doc_with_xrefs: CanonicalDocument):
        """Detect 'See Section X.Y.Z' patterns."""
        # First extract anchors for validation
        extractor = AnchorExtractor()
        anchors = extractor.extract(doc_with_xrefs)

        detector = CrossRefDetector()
        xrefs = detector.detect(doc_with_xrefs, anchors)

        # Should detect multiple references
        assert len(xrefs) > 0

        # Check for section-5-3-2 reference
        section_refs = [x for x in xrefs if "section-5-3-2" in x.target_anchor_key]
        assert len(section_refs) >= 1

    def test_detect_table_refs(self, doc_with_xrefs: CanonicalDocument):
        """Detect 'Table N' references."""
        detector = CrossRefDetector()
        xrefs = detector.detect(doc_with_xrefs)

        table_refs = [x for x in xrefs if x.target_anchor_key.startswith("table-")]
        assert len(table_refs) >= 1

    def test_detection_determinism(self, doc_with_xrefs: CanonicalDocument):
        """Same document always produces identical xrefs."""
        detector = CrossRefDetector()

        xrefs1 = detector.detect(doc_with_xrefs)
        xrefs2 = detector.detect(doc_with_xrefs)

        # Same count
        assert len(xrefs1) == len(xrefs2)

        # Same order and content
        for x1, x2 in zip(xrefs1, xrefs2):
            assert x1.target_anchor_key == x2.target_anchor_key
            assert x1.evidence_pointer.paragraph_index == x2.evidence_pointer.paragraph_index
            assert x1.validation_status == x2.validation_status

    def test_broken_ref_detection(self, doc_with_xrefs: CanonicalDocument):
        """Broken references are correctly identified."""
        extractor = AnchorExtractor()
        anchors = extractor.extract(doc_with_xrefs)

        detector = CrossRefDetector()
        xrefs = detector.detect(doc_with_xrefs, anchors)

        # Find the broken ref to section-99-99
        broken_refs = [x for x in xrefs if x.validation_status == "broken"]
        assert len(broken_refs) >= 1

        # At least one should be the 99.99 reference
        broken_targets = [x.target_anchor_key for x in broken_refs]
        assert any("99" in t for t in broken_targets)

    def test_ordering_stability(self, doc_with_xrefs: CanonicalDocument):
        """Cross-refs are deterministically sorted."""
        detector = CrossRefDetector()
        xrefs = detector.detect(doc_with_xrefs)

        # Check order is consistent with sort_key
        sort_keys = [x.sort_key() for x in xrefs]
        assert sort_keys == sorted(sort_keys)


# =============================================================================
# Graph Validation Tests
# =============================================================================

class TestGraphValidation:
    """Test graph validation and reporting."""

    def test_validation_result_structure(self, doc_with_xrefs: CanonicalDocument):
        """ValidationResult has all required fields."""
        validator = GraphValidator()
        result = validator.validate(doc_with_xrefs)

        assert result.doc_id == doc_with_xrefs.doc_id
        assert result.content_hash == doc_with_xrefs.content_hash
        assert result.anchor_count >= 0
        assert result.xref_count >= 0
        assert result.valid_count >= 0
        assert result.broken_count >= 0

    def test_validation_determinism(self, doc_with_xrefs: CanonicalDocument):
        """Same document always produces identical validation."""
        validator = GraphValidator()

        result1 = validator.validate(doc_with_xrefs)
        result2 = validator.validate(doc_with_xrefs)

        assert result1.anchor_count == result2.anchor_count
        assert result1.xref_count == result2.xref_count
        assert result1.broken_count == result2.broken_count
        assert len(result1.broken_refs) == len(result2.broken_refs)

    def test_broken_ref_in_result(self, doc_with_xrefs: CanonicalDocument):
        """Broken references appear in result."""
        validator = GraphValidator()
        result = validator.validate(doc_with_xrefs)

        # Should have at least one broken ref (section-99-99)
        assert result.broken_count >= 1
        assert len(result.broken_refs) >= 1

    def test_duplicate_anchors_in_result(self, doc_with_duplicate_anchors: CanonicalDocument):
        """Duplicate anchors are identified."""
        validator = GraphValidator()
        result = validator.validate(doc_with_duplicate_anchors)

        # Should have 2 duplicates (ordinals 1 and 2)
        assert result.duplicate_anchor_count == 2
        assert len(result.duplicate_anchors) == 2

    def test_to_dict_serialization(self, doc_with_xrefs: CanonicalDocument):
        """ValidationResult serializes to dict."""
        validator = GraphValidator()
        result = validator.validate(doc_with_xrefs)

        d = result.to_dict()
        assert "doc_id" in d
        assert "summary" in d
        assert "broken_refs" in d
        assert d["summary"]["anchors"] == result.anchor_count

    def test_to_markdown_output(self, doc_with_xrefs: CanonicalDocument):
        """ValidationResult generates markdown."""
        validator = GraphValidator()
        result = validator.validate(doc_with_xrefs)

        md = result.to_markdown()
        assert "# Graph Validation Report" in md
        assert "Broken" in md
        assert str(result.broken_count) in md


# =============================================================================
# Integration Tests
# =============================================================================

class TestGraphIntegration:
    """End-to-end integration tests."""

    def test_full_pipeline(self, doc_with_xrefs: CanonicalDocument):
        """Full pipeline: extract → detect → validate."""
        # Extract anchors
        extractor = AnchorExtractor()
        anchors = extractor.extract(doc_with_xrefs)

        # Detect cross-refs
        detector = CrossRefDetector()
        xrefs = detector.detect(doc_with_xrefs, anchors)

        # Validate
        validator = GraphValidator()
        result = validator.validate(doc_with_xrefs)

        # Counts should match
        assert result.anchor_count == len(anchors)
        assert result.xref_count == len(xrefs)

    def test_pipeline_determinism(self, doc_with_xrefs: CanonicalDocument):
        """Full pipeline is deterministic."""
        validator = GraphValidator()

        # Run twice
        result1 = validator.validate(doc_with_xrefs)
        md1 = result1.to_markdown()

        result2 = validator.validate(doc_with_xrefs)
        md2 = result2.to_markdown()

        # Outputs should be identical
        assert md1 == md2
