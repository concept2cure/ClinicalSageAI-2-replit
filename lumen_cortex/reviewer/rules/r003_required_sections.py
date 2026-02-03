"""
R003: Required CTD Sections Rule - Phase 3

Detects missing required CTD sections based on document type.

FDA Impact: IND submissions must contain specific CTD Module sections.
Missing required sections (e.g., Module 2.5 Clinical Overview) result
in Refuse-to-File or Information Requests, delaying review by months.

This rule is document-type aware:
- IND: Modules 1, 2.5, 2.7, 3.2.S, 3.2.P required
- BLA: Additional CMC detail (Module 3) required
- 510(k): Substantial equivalence, performance data required

Note: Document type is inferred from title/content since CanonicalDocument
v1.0 does not have a document_type field.
"""

from __future__ import annotations

from typing import Dict, List, Set, Tuple
from uuid import uuid4

from lumen_cortex.core.canonical import CanonicalDocument, Finding, EvidencePointer
from lumen_cortex.graph import ValidationResult
from lumen_cortex.graph.anchors import Anchor

from .base import Rule


# Required sections by document type
# Key: document_type, Value: list of (section_pattern, section_name, severity)
REQUIRED_SECTIONS: Dict[str, List[Tuple[str, str, str]]] = {
    "IND": [
        ("1.1", "Form FDA 1571", "Critical"),
        ("1.2", "Cover Letter", "Major"),
        ("2.5", "Clinical Overview", "Critical"),
        ("2.7", "Clinical Summary", "Critical"),
        ("3.2.s", "Drug Substance", "Major"),
        ("3.2.p", "Drug Product", "Major"),
    ],
    "BLA": [
        ("1.1", "Form FDA 1571", "Critical"),
        ("2.3", "Quality Overall Summary", "Critical"),
        ("2.4", "Nonclinical Overview", "Critical"),
        ("2.5", "Clinical Overview", "Critical"),
        ("2.7", "Clinical Summary", "Critical"),
        ("3.2.s", "Drug Substance", "Critical"),
        ("3.2.p", "Drug Product", "Critical"),
        ("3.2.a", "Appendices", "Major"),
    ],
    "510K": [
        ("predicate", "Predicate Device Comparison", "Critical"),
        ("substantial-equivalence", "Substantial Equivalence", "Critical"),
        ("performance", "Performance Data", "Major"),
        ("labeling", "Proposed Labeling", "Major"),
    ],
    "PMA": [
        ("summary", "PMA Summary", "Critical"),
        ("device-description", "Device Description", "Critical"),
        ("clinical", "Clinical Data", "Critical"),
        ("manufacturing", "Manufacturing Information", "Major"),
    ],
    # Default for unrecognized types - minimal requirements
    "DEFAULT": [
        ("1", "Module 1 Administrative", "Major"),
        ("2", "Module 2 Summaries", "Major"),
    ],
}


class R003RequiredSections(Rule):
    """
    Rule R003: Required CTD Section Detection

    Fires when required sections (based on document_type) are not
    present as anchors in the document.

    Severity: Varies by section criticality
    """

    @property
    def rule_id(self) -> str:
        return "R003"

    @property
    def rule_name(self) -> str:
        return "Required Section Missing"

    @property
    def cfr_citation(self) -> str | None:
        return "21 CFR 312.23"

    @property
    def ich_reference(self) -> str | None:
        return "ICH M4 (CTD Format and Content)"

    @property
    def severity(self) -> str:
        return "Major"

    def evaluate(
        self,
        doc: CanonicalDocument,
        validation_result: ValidationResult,
        extractor_version: str,
        ruleset_version: str,
    ) -> List[Finding]:
        """
        Evaluate R003 against document.

        Checks for presence of required sections based on inferred document type.
        Creates a Finding for each missing required section.
        """
        findings: List[Finding] = []

        # Infer document type from title/content
        doc_type = self._infer_doc_type(doc)
        required = REQUIRED_SECTIONS.get(doc_type, REQUIRED_SECTIONS["DEFAULT"])

        # Get all anchor keys from document's anchors dict
        anchor_keys = set(doc.anchors.keys()) if doc.anchors else set()

        # Also check headings that might not be in anchors
        for para in doc.paragraphs:
            if para.heading_level is not None:
                # Normalize heading text to anchor-like key
                key = para.text.lower().strip()
                # Extract section number if present
                if para.list_prefix:
                    key = para.list_prefix.lower()
                anchor_keys.add(key)

        # Check each required section
        for section_pattern, section_name, severity in required:
            if not self._section_present(section_pattern, anchor_keys):
                finding = Finding(
                    finding_id=uuid4(),
                    doc_id=doc.doc_id,
                    rule_id=self.rule_id,
                    rule_name=self.rule_name,
                    cfr_citation=self.cfr_citation,
                    ich_reference=self.ich_reference,
                    extractor_version=extractor_version,
                    ruleset_version=ruleset_version,
                    content_hash=doc.content_hash,
                    severity=severity,
                    confidence=0.85,  # Lower confidence - could be named differently
                    evidence=self._create_document_level_pointer(doc),
                    evidence_context=f"Document type: {doc_type}",
                    description=self._build_description(section_pattern, section_name, doc_type),
                    remediation=self._build_remediation(section_pattern, section_name),
                )
                findings.append(finding)

        return findings

    def _infer_doc_type(self, doc: CanonicalDocument) -> str:
        """
        Infer document type from title and content.

        Since CanonicalDocument v1.0 doesn't have document_type field,
        we infer from title patterns.
        """
        title = (doc.title or "").upper()

        # Check for document type indicators in title
        if "IND" in title or "INVESTIGATIONAL" in title:
            return "IND"
        if "BLA" in title or "BIOLOGICS LICENSE" in title:
            return "BLA"
        if "510(K)" in title or "510K" in title or "PREMARKET NOTIFICATION" in title:
            return "510K"
        if "PMA" in title or "PREMARKET APPROVAL" in title:
            return "PMA"
        if "NDA" in title or "NEW DRUG APPLICATION" in title:
            return "BLA"  # Similar requirements

        return "DEFAULT"

    def _normalize_doc_type(self, doc_type: str | None) -> str:
        """Normalize document type to match REQUIRED_SECTIONS keys."""
        if not doc_type:
            return "DEFAULT"

        doc_type_upper = doc_type.upper().strip()

        # Map common variations
        mappings = {
            "IND": "IND",
            "INVESTIGATIONAL NEW DRUG": "IND",
            "BLA": "BLA",
            "BIOLOGICS LICENSE APPLICATION": "BLA",
            "510K": "510K",
            "510(K)": "510K",
            "PREMARKET NOTIFICATION": "510K",
            "PMA": "PMA",
            "PREMARKET APPROVAL": "PMA",
            "NDA": "BLA",  # Similar requirements
            "NEW DRUG APPLICATION": "BLA",
        }

        return mappings.get(doc_type_upper, "DEFAULT")

    def _section_present(self, pattern: str, anchor_keys: Set[str]) -> bool:
        """
        Check if a section pattern is present in anchor keys.

        Uses flexible matching:
        - "2.5" matches "section-2-5", "module-2.5", "2-5-clinical-overview"
        - Handles various normalization schemes
        """
        pattern_lower = pattern.lower()

        # Direct match
        if pattern_lower in anchor_keys:
            return True

        # Normalized pattern (dots to dashes)
        pattern_dashed = pattern_lower.replace(".", "-")

        for key in anchor_keys:
            key_lower = key.lower()
            # Check if pattern appears in key
            if pattern_lower in key_lower or pattern_dashed in key_lower:
                return True

            # Check section prefix patterns
            if key_lower.startswith(f"section-{pattern_dashed}"):
                return True
            if key_lower.startswith(f"module-{pattern_dashed}"):
                return True
            if key_lower.startswith(f"{pattern_dashed}-"):
                return True
            if key_lower.startswith(f"{pattern_lower} "):
                return True

        return False

    def _create_document_level_pointer(self, doc: CanonicalDocument) -> EvidencePointer:
        """Create a document-level evidence pointer for missing sections."""
        return EvidencePointer(
            pointer_type=doc.source_type,  # "docx" or "pdf"
            doc_id=doc.doc_id,
            content_hash=doc.content_hash,
            paragraph_index=0,  # Document-level
        )

    def _build_description(self, pattern: str, name: str, doc_type: str) -> str:
        """Build human-readable description."""
        return (
            f"Required CTD section '{name}' (Section {pattern}) not found. "
            f"This section is required for {doc_type} submissions per ICH CTD format."
        )

    def _build_remediation(self, pattern: str, name: str) -> str:
        """Build specific remediation instructions."""
        return (
            f"Add section '{pattern} {name}' to the document. "
            f"Ensure the section heading matches CTD naming conventions. "
            f"If this content exists under a different heading, rename to align with CTD structure."
        )
