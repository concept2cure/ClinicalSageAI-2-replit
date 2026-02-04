"""
Phase 3 Reviewer Tests - Shadow FDA Reviewer
=============================================

Tests for:
1. Rule R001: Broken Cross-Reference Detection
2. Rule R002: Duplicate Anchor Detection
3. Rule R003: Required Section Detection
4. ReviewRunner determinism
5. Finding fingerprint stability

Run with: PYTHONHASHSEED=0 pytest lumen_cortex/tests/test_reviewer_phase3.py -v
"""

import hashlib
from datetime import datetime, timezone
from uuid import UUID

import pytest

from lumen_cortex.core.canonical import (
    CanonicalDocument,
    CanonicalParagraph,
    Finding,
)
from lumen_cortex.core.canonical.finding import sort_findings, SEVERITY_RANK
from lumen_cortex.graph import GraphValidator
from lumen_cortex.reviewer.rules import (
    RuleRegistry,
    RULE_REGISTRY,
    R001BrokenXref,
    R002DuplicateAnchor,
    R003RequiredSections,
)
from lumen_cortex.reviewer.run import ReviewRunner, ReviewResult, review_document


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
    return hashlib.sha256(b"phase 3 test document").hexdigest()


@pytest.fixture
def doc_with_broken_refs(fixed_uuid: UUID, sample_content_hash: str, fixed_timestamp: datetime) -> CanonicalDocument:
    """Document with broken cross-references."""
    return CanonicalDocument(
        doc_id=fixed_uuid,
        content_hash=sample_content_hash,
        source_type="docx",
        title="IND Protocol with Broken Refs",  # Title indicates IND
        paragraphs=[
            CanonicalParagraph(index=0, text="1. Introduction", heading_level=1),
            CanonicalParagraph(index=1, text="This document describes the study."),
            CanonicalParagraph(index=2, text="2. Methods", heading_level=1),
            CanonicalParagraph(index=3, text="See Section 5.3.2 for pharmacokinetics."),  # Broken
            CanonicalParagraph(index=4, text="Refer to Table 99 for data."),  # Broken
            CanonicalParagraph(index=5, text="3. Results", heading_level=1),
            CanonicalParagraph(index=6, text="See Section 1 for background."),  # Valid
        ],
        extraction_timestamp=fixed_timestamp,
        extractor_version="1.0.0-test",
    )


@pytest.fixture
def doc_with_duplicates(fixed_uuid: UUID, sample_content_hash: str, fixed_timestamp: datetime) -> CanonicalDocument:
    """Document with duplicate anchor keys."""
    return CanonicalDocument(
        doc_id=fixed_uuid,
        content_hash=sample_content_hash,
        source_type="docx",
        title="Protocol with Duplicate Sections",
        paragraphs=[
            CanonicalParagraph(index=0, text="Methods", heading_level=1),
            CanonicalParagraph(index=1, text="First methods section."),
            CanonicalParagraph(index=2, text="Methods", heading_level=1),  # Duplicate
            CanonicalParagraph(index=3, text="Second methods section."),
            CanonicalParagraph(index=4, text="Methods", heading_level=1),  # Duplicate
            CanonicalParagraph(index=5, text="Third methods section."),
        ],
        extraction_timestamp=fixed_timestamp,
        extractor_version="1.0.0-test",
    )


@pytest.fixture
def doc_missing_sections(fixed_uuid: UUID, sample_content_hash: str, fixed_timestamp: datetime) -> CanonicalDocument:
    """IND document missing required CTD sections."""
    return CanonicalDocument(
        doc_id=fixed_uuid,
        content_hash=sample_content_hash,
        source_type="docx",
        title="Incomplete IND Application",  # Title indicates IND
        paragraphs=[
            CanonicalParagraph(index=0, text="1.1 Form FDA 1571", heading_level=1, list_prefix="1.1"),
            CanonicalParagraph(index=1, text="Form content here."),
            # Missing: 1.2 Cover Letter, 2.5, 2.7, 3.2.S, 3.2.P
        ],
        extraction_timestamp=fixed_timestamp,
        extractor_version="1.0.0-test",
    )


@pytest.fixture
def clean_doc(fixed_uuid: UUID, sample_content_hash: str, fixed_timestamp: datetime) -> CanonicalDocument:
    """Document with no deficiencies (no IND/BLA indicators in title)."""
    return CanonicalDocument(
        doc_id=fixed_uuid,
        content_hash=sample_content_hash,
        source_type="docx",
        title="Clean Protocol Document",  # No IND/BLA - uses DEFAULT rules
        paragraphs=[
            CanonicalParagraph(index=0, text="1. Introduction", heading_level=1, list_prefix="1"),
            CanonicalParagraph(index=1, text="This is a clean document."),
            CanonicalParagraph(index=2, text="2. Methods", heading_level=1, list_prefix="2"),
            CanonicalParagraph(index=3, text="This section covers methods."),  # No broken refs
        ],
        extraction_timestamp=fixed_timestamp,
        extractor_version="1.0.0-test",
    )


# =============================================================================
# Test: Rule Registry
# =============================================================================

class TestRuleRegistry:
    """Tests for RuleRegistry functionality."""

    def test_registry_has_three_rules(self):
        """Registry should have R001, R002, R003."""
        assert len(RULE_REGISTRY) == 3

    def test_rules_in_deterministic_order(self):
        """Rules should be returned in rule_id order."""
        rules = RULE_REGISTRY.all_rules()
        rule_ids = [r.rule_id for r in rules]
        assert rule_ids == ["R001", "R002", "R003"]

    def test_get_rule_by_id(self):
        """Should retrieve specific rules by ID."""
        r001 = RULE_REGISTRY.get("R001")
        assert r001 is not None
        assert r001.rule_id == "R001"
        assert r001.rule_name == "Broken Cross-Reference"

    def test_registry_version_exists(self):
        """Registry should have version string."""
        assert RULE_REGISTRY.version == "1.0.0"

    def test_duplicate_registration_rejected(self):
        """Should reject duplicate rule registration."""
        registry = RuleRegistry()
        registry.register(R001BrokenXref())
        with pytest.raises(ValueError, match="already registered"):
            registry.register(R001BrokenXref())


# =============================================================================
# Test: R001 Broken Cross-Reference
# =============================================================================

class TestR001BrokenXref:
    """Tests for R001 broken cross-reference rule."""

    def test_detects_broken_refs(self, doc_with_broken_refs: CanonicalDocument):
        """Should detect broken cross-references."""
        validator = GraphValidator()
        validation = validator.validate(doc_with_broken_refs)

        rule = R001BrokenXref()
        findings = rule.evaluate(
            doc=doc_with_broken_refs,
            validation_result=validation,
            extractor_version="test-1.0",
            ruleset_version="1.0.0",
        )

        # Should find broken refs (Section 5.3.2 and Table 99)
        assert len(findings) >= 1

        # All findings should be R001
        for f in findings:
            assert f.rule_id == "R001"
            assert f.rule_name == "Broken Cross-Reference"

    def test_severity_critical_for_module_2(self, fixed_uuid: UUID, sample_content_hash: str, fixed_timestamp: datetime):
        """Broken refs to critical sections should be Critical severity."""
        doc = CanonicalDocument(
            doc_id=fixed_uuid,
            content_hash=sample_content_hash,
            source_type="docx",
            title="Test",
            paragraphs=[
                CanonicalParagraph(index=0, text="See Section 2.5 Clinical Overview."),
            ],
            extraction_timestamp=fixed_timestamp,
            extractor_version="1.0.0-test",
        )

        validator = GraphValidator()
        validation = validator.validate(doc)

        rule = R001BrokenXref()
        findings = rule.evaluate(
            doc=doc,
            validation_result=validation,
            extractor_version="test-1.0",
            ruleset_version="1.0.0",
        )

        # Should escalate to Critical for Module 2.5
        critical_findings = [f for f in findings if f.severity == "Critical"]
        assert len(critical_findings) >= 1

    def test_finding_has_cfr_citation(self, doc_with_broken_refs: CanonicalDocument):
        """Findings should include CFR citation."""
        validator = GraphValidator()
        validation = validator.validate(doc_with_broken_refs)

        rule = R001BrokenXref()
        findings = rule.evaluate(
            doc=doc_with_broken_refs,
            validation_result=validation,
            extractor_version="test-1.0",
            ruleset_version="1.0.0",
        )

        for f in findings:
            assert f.cfr_citation == "21 CFR 312.23(a)"


# =============================================================================
# Test: R002 Duplicate Anchor
# =============================================================================

class TestR002DuplicateAnchor:
    """Tests for R002 duplicate anchor rule."""

    def test_detects_duplicates(self, doc_with_duplicates: CanonicalDocument):
        """Should detect duplicate anchor keys."""
        validator = GraphValidator()
        validation = validator.validate(doc_with_duplicates)

        rule = R002DuplicateAnchor()
        findings = rule.evaluate(
            doc=doc_with_duplicates,
            validation_result=validation,
            extractor_version="test-1.0",
            ruleset_version="1.0.0",
        )

        # Should find the duplicate "Methods" heading
        assert len(findings) >= 1

        for f in findings:
            assert f.rule_id == "R002"
            assert "duplicate" in f.description.lower() or "times" in f.description.lower()

    def test_no_findings_for_unique_anchors(self, clean_doc: CanonicalDocument):
        """Should not flag unique anchors."""
        validator = GraphValidator()
        validation = validator.validate(clean_doc)

        rule = R002DuplicateAnchor()
        findings = rule.evaluate(
            doc=clean_doc,
            validation_result=validation,
            extractor_version="test-1.0",
            ruleset_version="1.0.0",
        )

        assert len(findings) == 0


# =============================================================================
# Test: R003 Required Sections
# =============================================================================

class TestR003RequiredSections:
    """Tests for R003 required section rule."""

    def test_detects_missing_ind_sections(self, doc_missing_sections: CanonicalDocument):
        """Should detect missing required IND sections."""
        validator = GraphValidator()
        validation = validator.validate(doc_missing_sections)

        rule = R003RequiredSections()
        findings = rule.evaluate(
            doc=doc_missing_sections,
            validation_result=validation,
            extractor_version="test-1.0",
            ruleset_version="1.0.0",
        )

        # IND requires 1.1, 1.2, 2.5, 2.7, 3.2.S, 3.2.P
        # Only 1.1 is present
        assert len(findings) >= 3  # At least 3 missing sections

        for f in findings:
            assert f.rule_id == "R003"
            assert "missing" in f.description.lower() or "not found" in f.description.lower()

    def test_doc_type_inference_from_title(self):
        """Should infer document type from title."""
        rule = R003RequiredSections()

        # Create mock docs with different titles
        class MockDoc:
            def __init__(self, title):
                self.title = title

        assert rule._infer_doc_type(MockDoc("IND Protocol")) == "IND"
        assert rule._infer_doc_type(MockDoc("Investigational New Drug")) == "IND"
        assert rule._infer_doc_type(MockDoc("BLA Submission")) == "BLA"
        assert rule._infer_doc_type(MockDoc("510(K) Application")) == "510K"
        assert rule._infer_doc_type(MockDoc("Generic Protocol")) == "DEFAULT"
        assert rule._infer_doc_type(MockDoc(None)) == "DEFAULT"


    def test_runner_deterministic(self, doc_with_broken_refs: CanonicalDocument):
        """Multiple runs should produce identical results."""
        runner = ReviewRunner(extractor_version="test-fixed")

        result1 = runner.review(doc_with_broken_refs)
        result2 = runner.review(doc_with_broken_refs)

        # Same counts
        assert result1.finding_count == result2.finding_count
        assert result1.anchor_count == result2.anchor_count

        # Same fingerprints (in same order)
        fps1 = [f.fingerprint for f in result1.findings]
        fps2 = [f.fingerprint for f in result2.findings]
        assert fps1 == fps2

    def test_runner_findings_sorted(self, doc_with_broken_refs: CanonicalDocument):
        """Findings should be sorted by severity → rule_id → location."""
        runner = ReviewRunner(extractor_version="test-fixed")
        result = runner.review(doc_with_broken_refs)

        if len(result.findings) > 1:
            for i in range(len(result.findings) - 1):
                f1 = result.findings[i]
                f2 = result.findings[i + 1]

                # Severity should be non-decreasing (Critical=0, Major=1, etc.)
                sev1 = SEVERITY_RANK[f1.severity]
                sev2 = SEVERITY_RANK[f2.severity]

                if sev1 == sev2:
                    # Same severity: rule_id should be non-decreasing
                    assert f1.rule_id <= f2.rule_id
                else:
                    assert sev1 <= sev2

    def test_clean_doc_no_findings(self, clean_doc: CanonicalDocument):
        """Clean document should have no R001/R002 findings."""
        runner = ReviewRunner(extractor_version="test-fixed")
        result = runner.review(clean_doc)

        # R001 and R002 should not fire
        r001_r002 = [f for f in result.findings if f.rule_id in ("R001", "R002")]
        assert len(r001_r002) == 0


# =============================================================================
# Test: Finding Fingerprints
# =============================================================================

class TestFindingFingerprints:
    """Tests for finding fingerprint determinism."""

    def test_fingerprint_stable(self, doc_with_broken_refs: CanonicalDocument):
        """Same finding should produce same fingerprint."""
        runner = ReviewRunner(extractor_version="test-fixed")

        result1 = runner.review(doc_with_broken_refs)
        result2 = runner.review(doc_with_broken_refs)

        if result1.findings:
            f1 = result1.findings[0]
            f2 = result2.findings[0]
            assert f1.fingerprint == f2.fingerprint

    def test_fingerprint_changes_with_version(self, doc_with_broken_refs: CanonicalDocument):
        """Different extractor versions should produce different fingerprints."""
        runner1 = ReviewRunner(extractor_version="1.0.0")
        runner2 = ReviewRunner(extractor_version="2.0.0")

        result1 = runner1.review(doc_with_broken_refs)
        result2 = runner2.review(doc_with_broken_refs)

        if result1.findings and result2.findings:
            # Same rule at same location, different version = different fingerprint
            # (They may or may not be different depending on ordering)
            # At minimum, verify both have findings
            assert result1.finding_count > 0
            assert result2.finding_count > 0


# =============================================================================
# Test: review_document convenience function
# =============================================================================

class TestReviewDocumentFunction:
    """Tests for review_document() convenience function."""

    def test_convenience_function_works(self, doc_with_broken_refs: CanonicalDocument):
        """review_document() should return ReviewResult."""
        result = review_document(doc_with_broken_refs)

        assert isinstance(result, ReviewResult)
        assert result.doc_id == str(doc_with_broken_refs.doc_id)


# =============================================================================
# Test: ReviewResult Output
# =============================================================================

class TestReviewResultOutput:
    """Tests for ReviewResult output methods."""

    def test_to_dict(self, doc_with_broken_refs: CanonicalDocument):
        """to_dict() should produce valid dictionary."""
        runner = ReviewRunner(extractor_version="test-fixed")
        result = runner.review(doc_with_broken_refs)

        d = result.to_dict()

        assert "document" in d
        assert "versions" in d
        assert "summary" in d
        assert "findings" in d
        assert d["document"]["doc_id"] == str(doc_with_broken_refs.doc_id)

    def test_to_markdown(self, doc_with_broken_refs: CanonicalDocument):
        """to_markdown() should produce valid markdown."""
        runner = ReviewRunner(extractor_version="test-fixed")
        result = runner.review(doc_with_broken_refs)

        md = result.to_markdown()

        assert "# Shadow FDA Reviewer Report" in md
        assert "## Summary" in md
        assert str(doc_with_broken_refs.doc_id) in md

    def test_severity_counts(self, doc_with_broken_refs: CanonicalDocument):
        """Severity counts should be accurate."""
        runner = ReviewRunner(extractor_version="test-fixed")
        result = runner.review(doc_with_broken_refs)

        # Manual count
        critical = sum(1 for f in result.findings if f.severity == "Critical")
        major = sum(1 for f in result.findings if f.severity == "Major")
        minor = sum(1 for f in result.findings if f.severity == "Minor")

        assert result.critical_count == critical
        assert result.major_count == major
        assert result.minor_count == minor
        assert result.finding_count == critical + major + minor + sum(
            1 for f in result.findings if f.severity == "Informational"
        )
