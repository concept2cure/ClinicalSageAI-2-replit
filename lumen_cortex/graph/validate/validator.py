"""
Graph Validator - Phase 2

Validates document graph and produces deterministic report.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional
from uuid import UUID

from lumen_cortex.core.canonical import CanonicalDocument
from lumen_cortex.graph.anchors import AnchorExtractor, Anchor
from lumen_cortex.graph.xrefs import CrossRefDetector, CrossRef


@dataclass(frozen=True)
class ValidationResult:
    """
    Immutable result of graph validation.

    Contains summary statistics and lists of issues.
    """
    doc_id: UUID
    content_hash: str

    # Counts
    anchor_count: int = 0
    xref_count: int = 0
    valid_count: int = 0
    broken_count: int = 0
    ambiguous_count: int = 0
    external_count: int = 0
    duplicate_anchor_count: int = 0

    # Issue lists (frozen)
    broken_refs: tuple = field(default_factory=tuple)
    ambiguous_refs: tuple = field(default_factory=tuple)
    duplicate_anchors: tuple = field(default_factory=tuple)

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "doc_id": str(self.doc_id),
            "content_hash": self.content_hash,
            "summary": {
                "anchors": self.anchor_count,
                "cross_references": self.xref_count,
                "valid": self.valid_count,
                "broken": self.broken_count,
                "ambiguous": self.ambiguous_count,
                "external": self.external_count,
                "duplicate_anchors": self.duplicate_anchor_count,
            },
            "broken_refs": [
                {
                    "target": ref.target_anchor_key,
                    "text": ref.reference_text,
                    "paragraph": ref.evidence_pointer.paragraph_index,
                }
                for ref in self.broken_refs
            ],
            "ambiguous_refs": [
                {
                    "target": ref.target_anchor_key,
                    "text": ref.reference_text,
                    "paragraph": ref.evidence_pointer.paragraph_index,
                }
                for ref in self.ambiguous_refs
            ],
            "duplicate_anchors": [
                {
                    "key": anchor.anchor_key,
                    "ordinal": anchor.anchor_ordinal,
                    "text": anchor.extracted_text[:100],
                }
                for anchor in self.duplicate_anchors
            ],
        }

    def to_markdown(self) -> str:
        """Generate markdown report."""
        lines = [
            f"# Graph Validation Report",
            f"",
            f"**Document ID:** `{self.doc_id}`",
            f"**Content Hash:** `{self.content_hash[:16]}...`",
            f"",
            f"## Summary",
            f"",
            f"| Metric | Count |",
            f"|--------|-------|",
            f"| Anchors | {self.anchor_count} |",
            f"| Cross-References | {self.xref_count} |",
            f"| Valid | {self.valid_count} |",
            f"| **Broken** | **{self.broken_count}** |",
            f"| Ambiguous | {self.ambiguous_count} |",
            f"| External | {self.external_count} |",
            f"| Duplicate Anchors | {self.duplicate_anchor_count} |",
            f"",
        ]

        if self.broken_refs:
            lines.extend([
                f"## Broken References ({self.broken_count})",
                f"",
            ])
            for ref in self.broken_refs:
                lines.append(
                    f"- **{ref.target_anchor_key}** at paragraph {ref.evidence_pointer.paragraph_index}: "
                    f'"{ref.reference_text[:50]}..."'
                )
            lines.append("")

        if self.ambiguous_refs:
            lines.extend([
                f"## Ambiguous References ({self.ambiguous_count})",
                f"",
            ])
            for ref in self.ambiguous_refs:
                lines.append(
                    f"- **{ref.target_anchor_key}** at paragraph {ref.evidence_pointer.paragraph_index}"
                )
            lines.append("")

        if self.duplicate_anchors:
            lines.extend([
                f"## Duplicate Anchors ({self.duplicate_anchor_count})",
                f"",
            ])
            for anchor in self.duplicate_anchors:
                lines.append(
                    f"- **{anchor.anchor_key}** (ordinal {anchor.anchor_ordinal}): "
                    f'"{anchor.extracted_text[:50]}..."'
                )
            lines.append("")

        return "\n".join(lines)


class GraphValidator:
    """
    Validates document graph and produces deterministic report.

    Workflow:
    1. Extract anchors from CanonicalDocument
    2. Detect cross-references
    3. Validate references against anchor index
    4. Produce ValidationResult
    """

    def __init__(self):
        self._anchor_extractor = AnchorExtractor()
        self._xref_detector = CrossRefDetector()

    def validate(self, doc: CanonicalDocument) -> ValidationResult:
        """
        Validate document graph.

        Returns immutable ValidationResult.
        """
        # Extract anchors
        anchors = self._anchor_extractor.extract(doc)

        # Detect cross-references
        xrefs = self._xref_detector.detect(doc, anchors)

        # Categorize results
        valid_refs = [x for x in xrefs if x.validation_status == "valid"]
        broken_refs = [x for x in xrefs if x.validation_status == "broken"]
        ambiguous_refs = [x for x in xrefs if x.validation_status == "ambiguous"]
        external_refs = [x for x in xrefs if x.validation_status == "external"]

        # Find duplicate anchors (ordinal > 0)
        duplicate_anchors = [a for a in anchors if a.anchor_ordinal > 0]

        return ValidationResult(
            doc_id=doc.doc_id,
            content_hash=doc.content_hash,
            anchor_count=len(anchors),
            xref_count=len(xrefs),
            valid_count=len(valid_refs),
            broken_count=len(broken_refs),
            ambiguous_count=len(ambiguous_refs),
            external_count=len(external_refs),
            duplicate_anchor_count=len(duplicate_anchors),
            broken_refs=tuple(broken_refs),
            ambiguous_refs=tuple(ambiguous_refs),
            duplicate_anchors=tuple(duplicate_anchors),
        )

    def get_anchors(self, doc: CanonicalDocument) -> List[Anchor]:
        """Get extracted anchors (for persistence)."""
        return self._anchor_extractor.extract(doc)

    def get_xrefs(
        self,
        doc: CanonicalDocument,
        anchors: Optional[List[Anchor]] = None
    ) -> List[CrossRef]:
        """Get detected cross-references (for persistence)."""
        if anchors is None:
            anchors = self.get_anchors(doc)
        return self._xref_detector.detect(doc, anchors)


def validate_document_graph(doc: CanonicalDocument) -> ValidationResult:
    """
    Convenience function for graph validation.

    Usage:
        result = validate_document_graph(canonical_doc)
        print(result.to_markdown())
    """
    validator = GraphValidator()
    return validator.validate(doc)
