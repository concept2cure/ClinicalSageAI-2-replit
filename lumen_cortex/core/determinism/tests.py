"""
═══════════════════════════════════════════════════════════════════════════════
                    DETERMINISM TEST SUITE
═══════════════════════════════════════════════════════════════════════════════

Ensures identical input → identical output for all canonical models.

CRITICAL: Run with PYTHONHASHSEED=0 to eliminate hash randomization.

@module lumen_cortex.core.determinism.tests
"""

from __future__ import annotations

import hashlib
import math
from datetime import datetime
from typing import List
from uuid import UUID, uuid4

import pytest

from lumen_cortex.core.canonical import (
    EvidencePointer,
    CanonicalDocument,
    CanonicalParagraph,
    CanonicalRun,
    CanonicalTable,
    CanonicalCell,
    AnchorLocation,
    CrossRef,
    Finding,
    SEVERITY_RANK,
    evidence_sort_tuple,
    finding_sort_key,
    sort_findings,
)


# ═══════════════════════════════════════════════════════════════════════════
#                          TEST CONSTANTS
# ═══════════════════════════════════════════════════════════════════════════

EPS = 1e-6  # Epsilon for float comparison

# Deterministic test UUIDs (same across runs)
TEST_DOC_ID = UUID("12345678-1234-5678-1234-567812345678")
TEST_FINDING_ID = UUID("abcdefab-cdef-abcd-efab-cdefabcdefab")

# Deterministic test hash
TEST_CONTENT_HASH = "a" * 64  # 64 'a' characters = valid SHA256 hex


# ═══════════════════════════════════════════════════════════════════════════
#                          EVIDENCE POINTER TESTS
# ═══════════════════════════════════════════════════════════════════════════

class TestEvidencePointer:
    """Tests for EvidencePointer determinism."""
    
    def test_evidence_pointer_frozen(self):
        """EvidencePointer should be immutable."""
        pointer = EvidencePointer(
            doc_id=TEST_DOC_ID,
            content_hash=TEST_CONTENT_HASH,
            pointer_type="docx",
            paragraph_index=5,
        )
        
        with pytest.raises(Exception):  # Pydantic ValidationError
            pointer.paragraph_index = 10
    
    def test_evidence_pointer_sort_stability(self):
        """Same coordinates → same sort key."""
        pointer1 = EvidencePointer(
            doc_id=TEST_DOC_ID,
            content_hash=TEST_CONTENT_HASH,
            pointer_type="docx",
            paragraph_index=5,
            table_index=2,
            cell_coords=(1, 3),
        )
        pointer2 = EvidencePointer(
            doc_id=TEST_DOC_ID,
            content_hash=TEST_CONTENT_HASH,
            pointer_type="docx",
            paragraph_index=5,
            table_index=2,
            cell_coords=(1, 3),
        )
        
        assert pointer1.sort_key() == pointer2.sort_key()
        assert evidence_sort_tuple(pointer1) == evidence_sort_tuple(pointer2)
    
    def test_evidence_pointer_ordering(self):
        """Pointers should sort in deterministic order."""
        pointers = [
            EvidencePointer(doc_id=TEST_DOC_ID, content_hash=TEST_CONTENT_HASH, 
                          pointer_type="docx", paragraph_index=10),
            EvidencePointer(doc_id=TEST_DOC_ID, content_hash=TEST_CONTENT_HASH, 
                          pointer_type="docx", paragraph_index=5),
            EvidencePointer(doc_id=TEST_DOC_ID, content_hash=TEST_CONTENT_HASH, 
                          pointer_type="pdf", page=0),
            EvidencePointer(doc_id=TEST_DOC_ID, content_hash=TEST_CONTENT_HASH, 
                          pointer_type="docx", paragraph_index=5, table_index=1),
        ]
        
        sorted_pointers = sorted(pointers, key=lambda p: p.sort_key())
        
        # Run twice - should be identical
        sorted_again = sorted(pointers, key=lambda p: p.sort_key())
        
        for p1, p2 in zip(sorted_pointers, sorted_again):
            assert p1.sort_key() == p2.sort_key()
    
    def test_human_readable_output(self):
        """Human-readable output should be deterministic."""
        pointer = EvidencePointer(
            doc_id=TEST_DOC_ID,
            content_hash=TEST_CONTENT_HASH,
            pointer_type="docx",
            table_index=3,
            cell_coords=(1, 2),
        )
        
        readable1 = pointer.to_human_readable()
        readable2 = pointer.to_human_readable()
        
        assert readable1 == readable2
        assert "Table 4" in readable1  # 0-indexed + 1
        assert "Cell (2, 3)" in readable1


# ═══════════════════════════════════════════════════════════════════════════
#                          CANONICAL DOCUMENT TESTS
# ═══════════════════════════════════════════════════════════════════════════

class TestCanonicalDocument:
    """Tests for CanonicalDocument determinism."""
    
    def test_document_frozen(self):
        """CanonicalDocument should be immutable."""
        doc = CanonicalDocument(
            doc_id=TEST_DOC_ID,
            content_hash=TEST_CONTENT_HASH,
            source_type="docx",
            extraction_timestamp=datetime(2026, 1, 1, 12, 0, 0),
            extractor_version="1.0.0",
        )
        
        with pytest.raises(Exception):
            doc.content_hash = "b" * 64
    
    def test_document_serialization_determinism(self):
        """Same document → same JSON representation."""
        timestamp = datetime(2026, 1, 1, 12, 0, 0)
        
        doc1 = CanonicalDocument(
            doc_id=TEST_DOC_ID,
            content_hash=TEST_CONTENT_HASH,
            source_type="docx",
            paragraphs=[
                CanonicalParagraph(index=0, text="Hello world"),
                CanonicalParagraph(index=1, text="Second paragraph"),
            ],
            extraction_timestamp=timestamp,
            extractor_version="1.0.0",
        )
        
        doc2 = CanonicalDocument(
            doc_id=TEST_DOC_ID,
            content_hash=TEST_CONTENT_HASH,
            source_type="docx",
            paragraphs=[
                CanonicalParagraph(index=0, text="Hello world"),
                CanonicalParagraph(index=1, text="Second paragraph"),
            ],
            extraction_timestamp=timestamp,
            extractor_version="1.0.0",
        )
        
        # model_dump() should be identical
        assert doc1.model_dump() == doc2.model_dump()
        
        # JSON should be identical
        json1 = doc1.model_dump_json(indent=None)
        json2 = doc2.model_dump_json(indent=None)
        assert json1 == json2
    
    def test_broken_references_detection(self):
        """get_broken_references() should work correctly."""
        doc = CanonicalDocument(
            doc_id=TEST_DOC_ID,
            content_hash=TEST_CONTENT_HASH,
            source_type="docx",
            anchors={
                "section-5-3-2": AnchorLocation(
                    anchor_type="heading",
                    paragraph_index=10,
                    heading_level=3,
                    text="5.3.2 Pharmacokinetics",
                ),
            },
            cross_references=[
                CrossRef(
                    source_paragraph_index=20,
                    source_text="See Section 5.3.2",
                    target_anchor_key="section-5-3-2",
                    reference_type="section",
                ),
                CrossRef(
                    source_paragraph_index=30,
                    source_text="See Section 5.3.3",
                    target_anchor_key="section-5-3-3",  # Does not exist!
                    reference_type="section",
                ),
            ],
            extraction_timestamp=datetime(2026, 1, 1, 12, 0, 0),
            extractor_version="1.0.0",
        )
        
        broken = doc.get_broken_references()
        assert len(broken) == 1
        assert broken[0].target_anchor_key == "section-5-3-3"


# ═══════════════════════════════════════════════════════════════════════════
#                          FINDING TESTS
# ═══════════════════════════════════════════════════════════════════════════

class TestFinding:
    """Tests for Finding determinism."""
    
    def _create_test_finding(
        self,
        rule_id: str = "R001",
        severity: str = "Major",
        confidence: float = 0.95,
        paragraph_index: int = 42,
    ) -> Finding:
        """Helper to create a test finding."""
        return Finding(
            finding_id=TEST_FINDING_ID,
            doc_id=TEST_DOC_ID,
            rule_id=rule_id,
            rule_name="Broken Internal Cross-Reference",
            cfr_citation="21 CFR 312.23(a)(7)",
            ich_reference="ICH CTD Module 2 (M4)",
            extractor_version="1.0.0",
            ruleset_version="0.1",
            content_hash=TEST_CONTENT_HASH,
            severity=severity,
            confidence=confidence,
            evidence=EvidencePointer(
                doc_id=TEST_DOC_ID,
                content_hash=TEST_CONTENT_HASH,
                pointer_type="docx",
                paragraph_index=paragraph_index,
            ),
            evidence_context="...the results showed that See Section 5.3.3 for details...",
            description="Cross-reference to 'Section 5.3.3' does not resolve to any anchor",
            remediation="Add the missing target section or update reference to correct anchor",
        )
    
    def test_finding_fingerprint_determinism(self):
        """Same finding → same fingerprint."""
        finding1 = self._create_test_finding()
        finding2 = self._create_test_finding()
        
        assert finding1.fingerprint == finding2.fingerprint
        assert finding1.compute_fingerprint() == finding2.compute_fingerprint()
    
    def test_finding_fingerprint_changes_with_content(self):
        """Different content → different fingerprint."""
        finding1 = self._create_test_finding(paragraph_index=42)
        finding2 = self._create_test_finding(paragraph_index=43)
        
        assert finding1.fingerprint != finding2.fingerprint
    
    def test_finding_fingerprint_changes_with_version(self):
        """Different version → different fingerprint."""
        finding1 = self._create_test_finding()
        
        # Create with different extractor version
        finding2 = Finding(
            finding_id=TEST_FINDING_ID,
            doc_id=TEST_DOC_ID,
            rule_id="R001",
            rule_name="Broken Internal Cross-Reference",
            extractor_version="2.0.0",  # Different!
            ruleset_version="0.1",
            content_hash=TEST_CONTENT_HASH,
            severity="Major",
            confidence=0.95,
            evidence=EvidencePointer(
                doc_id=TEST_DOC_ID,
                content_hash=TEST_CONTENT_HASH,
                pointer_type="docx",
                paragraph_index=42,
            ),
            evidence_context="...",
            description="...",
            remediation="...",
        )
        
        assert finding1.fingerprint != finding2.fingerprint
    
    def test_confidence_quantization(self):
        """Confidence should be quantized to 6 decimal places."""
        # These should produce the same fingerprint
        finding1 = self._create_test_finding(confidence=0.9500001)
        finding2 = self._create_test_finding(confidence=0.9500002)
        
        # Both round to 0.950000
        assert finding1.fingerprint == finding2.fingerprint
        
        # This should be different
        finding3 = self._create_test_finding(confidence=0.950001)
        assert finding1.fingerprint != finding3.fingerprint
    
    def test_finding_sort_order(self):
        """Findings should sort deterministically."""
        findings = [
            self._create_test_finding(rule_id="R002", severity="Minor"),
            self._create_test_finding(rule_id="R001", severity="Critical"),
            self._create_test_finding(rule_id="R001", severity="Major"),
            self._create_test_finding(rule_id="R003", severity="Critical"),
        ]
        
        sorted_findings = sort_findings(findings)
        
        # Critical first
        assert sorted_findings[0].severity == "Critical"
        assert sorted_findings[1].severity == "Critical"
        # Then Major
        assert sorted_findings[2].severity == "Major"
        # Then Minor
        assert sorted_findings[3].severity == "Minor"
        
        # Within same severity, sort by rule_id
        assert sorted_findings[0].rule_id == "R001"
        assert sorted_findings[1].rule_id == "R003"
    
    def test_finding_sort_stability(self):
        """Sorting should be stable across runs."""
        findings = [
            self._create_test_finding(rule_id="R002", severity="Minor", paragraph_index=10),
            self._create_test_finding(rule_id="R001", severity="Critical", paragraph_index=5),
            self._create_test_finding(rule_id="R001", severity="Major", paragraph_index=20),
        ]
        
        sorted1 = sort_findings(findings)
        sorted2 = sort_findings(findings)
        
        for f1, f2 in zip(sorted1, sorted2):
            assert f1.rule_id == f2.rule_id
            assert f1.severity == f2.severity
            assert f1.evidence.paragraph_index == f2.evidence.paragraph_index
            assert math.isclose(f1.confidence, f2.confidence, rel_tol=0.0, abs_tol=EPS)


# ═══════════════════════════════════════════════════════════════════════════
#                          INTEGRATION TESTS
# ═══════════════════════════════════════════════════════════════════════════

class TestDeterminismIntegration:
    """Integration tests for full pipeline determinism."""
    
    def test_full_pipeline_determinism(self):
        """
        Simulate: Same document → extract → review → same findings.
        
        This is the core determinism contract.
        """
        # Simulated document content hash
        content = b"This is a test document with See Section 5.3.3 reference"
        content_hash = hashlib.sha256(content).hexdigest()
        
        # Create canonical document (would come from extractor)
        timestamp = datetime(2026, 1, 1, 12, 0, 0)
        
        def create_canonical_doc():
            return CanonicalDocument(
                doc_id=TEST_DOC_ID,
                content_hash=content_hash,
                source_type="docx",
                paragraphs=[
                    CanonicalParagraph(index=0, text="Introduction"),
                    CanonicalParagraph(index=1, text="See Section 5.3.3 for details"),
                ],
                anchors={
                    "section-5-3-2": AnchorLocation(
                        anchor_type="heading",
                        paragraph_index=0,
                        text="Introduction",
                    ),
                },
                cross_references=[
                    CrossRef(
                        source_paragraph_index=1,
                        source_text="See Section 5.3.3",
                        target_anchor_key="section-5-3-3",  # Broken!
                        reference_type="section",
                    ),
                ],
                extraction_timestamp=timestamp,
                extractor_version="1.0.0",
            )
        
        def run_shadow_review(doc: CanonicalDocument) -> List[Finding]:
            """Simulated shadow review that finds broken refs."""
            findings = []
            
            for xref in doc.get_broken_references():
                finding = Finding(
                    finding_id=uuid4(),  # Would be deterministic in real impl
                    doc_id=doc.doc_id,
                    rule_id="R001",
                    rule_name="Broken Internal Cross-Reference",
                    cfr_citation="21 CFR 312.23(a)(7)",
                    ich_reference="ICH CTD Module 2 (M4)",
                    extractor_version=doc.extractor_version,
                    ruleset_version="0.1",
                    content_hash=doc.content_hash,
                    severity="Major",
                    confidence=1.0,  # Broken ref is certain
                    evidence=EvidencePointer(
                        doc_id=doc.doc_id,
                        content_hash=doc.content_hash,
                        pointer_type=doc.source_type,
                        paragraph_index=xref.source_paragraph_index,
                    ),
                    evidence_context=doc.paragraphs[xref.source_paragraph_index].text,
                    description=f"Cross-reference to '{xref.target_anchor_key}' does not resolve",
                    remediation="Add missing section or fix reference",
                )
                findings.append(finding)
            
            return sort_findings(findings)
        
        # Run twice
        doc1 = create_canonical_doc()
        doc2 = create_canonical_doc()
        
        findings1 = run_shadow_review(doc1)
        findings2 = run_shadow_review(doc2)
        
        # Must have same number of findings
        assert len(findings1) == len(findings2)
        
        # Each finding must match (excluding non-deterministic finding_id)
        for f1, f2 in zip(findings1, findings2):
            assert f1.rule_id == f2.rule_id
            assert f1.severity == f2.severity
            assert f1.evidence.pointer_type == f2.evidence.pointer_type
            assert f1.evidence.paragraph_index == f2.evidence.paragraph_index
            assert f1.content_hash == f2.content_hash
            
            # Fingerprint components match (excluding finding_id)
            # In real impl, finding_id would be derived from content hash
            assert f1.compute_fingerprint() == f2.compute_fingerprint()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
