"""
R001: Broken Cross-Reference Rule - Phase 3

Detects cross-references that point to non-existent anchors.

FDA Impact: Broken references in IND submissions indicate incomplete
document assembly. Reviewers may place clinical hold for "incomplete
submission" if critical cross-references (e.g., "See Section 5.3.2")
point to missing sections.
"""

from __future__ import annotations

from typing import List
from uuid import uuid4

from lumen_cortex.core.canonical import CanonicalDocument, Finding, EvidencePointer
from lumen_cortex.graph import ValidationResult

from .base import Rule


class R001BrokenXref(Rule):
    """
    Rule R001: Broken Cross-Reference Detection

    Fires when a cross-reference (e.g., "See Section X") points to
    a target anchor that does not exist in the document.

    Severity: Major (can escalate to Critical if target is critical section)
    """

    @property
    def rule_id(self) -> str:
        return "R001"

    @property
    def rule_name(self) -> str:
        return "Broken Cross-Reference"

    @property
    def cfr_citation(self) -> str | None:
        return "21 CFR 312.23(a)"

    @property
    def ich_reference(self) -> str | None:
        return "ICH M4 (CTD Organization)"

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
        Evaluate R001 against document.

        Creates a Finding for each broken cross-reference detected
        during graph validation.
        """
        findings: List[Finding] = []

        # Process broken refs in deterministic order (sorted by evidence location)
        broken_refs = sorted(
            validation_result.broken_refs,
            key=lambda x: (
                x.evidence_pointer.paragraph_index or 0,
                x.target_anchor_key,
            )
        )

        for xref in broken_refs:
            # Determine severity based on target type
            severity = self._determine_severity(xref.target_anchor_key)

            # Create finding
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
                confidence=0.95,  # High confidence for structural issues
                evidence=xref.evidence_pointer,
                evidence_context=self._build_context(xref.reference_text),
                description=self._build_description(xref),
                remediation=self._build_remediation(xref),
            )
            findings.append(finding)

        return findings

    def _determine_severity(self, target_key: str) -> str:
        """
        Determine severity based on target anchor type.

        Critical sections (Module 2, safety data) elevate to Critical.
        """
        # Critical CTD sections (check both raw pattern and normalized key)
        critical_patterns = [
            "2.3",  # Quality Overall Summary
            "2.4",  # Nonclinical Overview
            "2.5",  # Clinical Overview
            "2.7",  # Clinical Summary
            "4.2",  # Study Reports
            "5.3.5", # Clinical Study Reports
            "section-2-3",
            "section-2-4",
            "section-2-5",
            "section-2-7",
            "section-4-2",
            "section-5-3-5",
        ]

        target_lower = target_key.lower()
        for pattern in critical_patterns:
            if pattern in target_lower:
                return "Critical"

        return self.severity  # Default: Major

    def _build_context(self, reference_text: str) -> str:
        """Build evidence context (truncated to 500 chars)."""
        text = reference_text.strip()
        if len(text) > 500:
            return text[:497] + "..."
        return text

    def _build_description(self, xref) -> str:
        """Build human-readable description."""
        return (
            f"Cross-reference to '{xref.target_anchor_key}' cannot be resolved. "
            f"The referenced section or anchor does not exist in this document."
        )

    def _build_remediation(self, xref) -> str:
        """Build specific remediation instructions."""
        return (
            f"Verify that section '{xref.target_anchor_key}' exists in the document. "
            f"If the section was renamed or moved, update the reference text. "
            f"If the section is in a different document, create an explicit cross-document reference."
        )
