"""
R002: Duplicate Anchor Rule - Phase 3

Detects multiple anchors with identical keys within a document.

FDA Impact: Duplicate section headings create ambiguous cross-references.
When a document contains two "Section 5.3.2" headings, FDA reviewers
cannot determine which section is being referenced elsewhere in the
submission, leading to Information Requests.
"""

from __future__ import annotations

from collections import defaultdict
from typing import List, Dict
from uuid import uuid4

from lumen_cortex.core.canonical import CanonicalDocument, Finding
from lumen_cortex.graph import ValidationResult
from lumen_cortex.graph.anchors import Anchor

from .base import Rule


class R002DuplicateAnchor(Rule):
    """
    Rule R002: Duplicate Anchor Detection

    Fires when multiple anchors share the same normalized key,
    creating ambiguous reference targets.

    Severity: Minor (informational if ordinals are intentional)
    """

    @property
    def rule_id(self) -> str:
        return "R002"

    @property
    def rule_name(self) -> str:
        return "Duplicate Anchor Key"

    @property
    def cfr_citation(self) -> str | None:
        return "21 CFR 312.23(a)(1)"

    @property
    def ich_reference(self) -> str | None:
        return "ICH M4 (CTD Section Numbering)"

    @property
    def severity(self) -> str:
        return "Minor"

    def evaluate(
        self,
        doc: CanonicalDocument,
        validation_result: ValidationResult,
        extractor_version: str,
        ruleset_version: str,
    ) -> List[Finding]:
        """
        Evaluate R002 against document.

        Creates a Finding for each set of duplicate anchors.
        We report the duplicate (ordinal > 0), not the original.
        """
        findings: List[Finding] = []

        # Get duplicate anchors from validation result
        # These are anchors with ordinal > 0 (indicating they share a key)
        duplicate_anchors = sorted(
            validation_result.duplicate_anchors,
            key=lambda a: (
                a.anchor_key,
                a.anchor_ordinal,
                a.evidence_pointer.paragraph_index or 0,
            )
        )

        # Group by anchor_key to report each key once
        grouped: Dict[str, List[Anchor]] = defaultdict(list)
        for anchor in duplicate_anchors:
            grouped[anchor.anchor_key].append(anchor)

        # Create finding for each duplicate group
        for anchor_key in sorted(grouped.keys()):
            duplicates = grouped[anchor_key]

            # Use the first duplicate's location as the evidence pointer
            first_dup = duplicates[0]

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
                severity=self._determine_severity(anchor_key, len(duplicates)),
                confidence=0.90,
                evidence=first_dup.evidence_pointer,
                evidence_context=self._build_context(first_dup, duplicates),
                description=self._build_description(anchor_key, len(duplicates) + 1),
                remediation=self._build_remediation(anchor_key),
            )
            findings.append(finding)

        return findings

    def _determine_severity(self, anchor_key: str, dup_count: int) -> str:
        """
        Determine severity based on anchor type and count.

        Many duplicates or critical section duplicates elevate severity.
        """
        # Critical section patterns
        critical_patterns = ["module-2", "module-3", "module-4", "module-5"]

        key_lower = anchor_key.lower()
        for pattern in critical_patterns:
            if pattern in key_lower:
                return "Major"

        # Many duplicates indicates structural problem
        if dup_count >= 3:
            return "Major"

        return self.severity  # Default: Minor

    def _build_context(self, first_dup: Anchor, all_dups: List[Anchor]) -> str:
        """Build evidence context showing duplicate locations."""
        locations = [
            f"para {a.evidence_pointer.paragraph_index}"
            for a in [first_dup] + all_dups
            if a.evidence_pointer.paragraph_index is not None
        ]
        text = first_dup.extracted_text[:200] if first_dup.extracted_text else ""
        loc_str = ", ".join(locations[:5])  # Limit to 5 locations
        return f'"{text}" appears at: {loc_str}'[:500]

    def _build_description(self, anchor_key: str, total_count: int) -> str:
        """Build human-readable description."""
        return (
            f"Anchor key '{anchor_key}' appears {total_count} times in the document. "
            f"Cross-references to this anchor are ambiguous."
        )

    def _build_remediation(self, anchor_key: str) -> str:
        """Build specific remediation instructions."""
        return (
            f"Rename or renumber duplicate sections to ensure unique identifiers. "
            f"Each heading/section should have a unique key. "
            f"Consider adding sub-section numbers (e.g., '{anchor_key}.1', '{anchor_key}.2')."
        )
