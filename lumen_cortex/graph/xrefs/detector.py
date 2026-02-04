"""
Cross-Reference Detector - Phase 2

Deterministic detection of cross-references in CanonicalDocument.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Set, Tuple

from lumen_cortex.core.canonical import (
    CanonicalDocument,
    CanonicalParagraph,
    EvidencePointer,
)
from lumen_cortex.graph.anchors.models import normalize_anchor_key, Anchor
from .models import CrossRef, ValidationStatus


# Regex patterns for cross-reference detection
XREF_PATTERNS = [
    # "See Section 5.3.2" or "see section 5.3.2"
    (r"\b[Ss]ee\s+[Ss]ection\s+(\d+(?:\.\d+)*)", 0.8, "section"),
    # "Section 5.3.2" at start or after punctuation
    (r"(?:^|[.;,])\s*[Ss]ection\s+(\d+(?:\.\d+)*)", 0.7, "section"),
    # "Refer to Section X.Y.Z"
    (r"\b[Rr]efer(?:s)?\s+to\s+[Ss]ection\s+(\d+(?:\.\d+)*)", 0.8, "section"),
    # "as described in Section X.Y.Z"
    (r"\bas\s+described\s+in\s+[Ss]ection\s+(\d+(?:\.\d+)*)", 0.75, "section"),
    # "Table N" references
    (r"\b[Tt]able\s+(\d+)", 0.6, "table"),
    # "See Table N"
    (r"\b[Ss]ee\s+[Tt]able\s+(\d+)", 0.75, "table"),
    # "Figure N" references
    (r"\b[Ff]igure\s+(\d+)", 0.6, "figure"),
    # "See Figure N"
    (r"\b[Ss]ee\s+[Ff]igure\s+(\d+)", 0.75, "figure"),
    # "Appendix X"
    (r"\b[Aa]ppendix\s+([A-Z])", 0.7, "appendix"),
    # Generic "as discussed above/below"
    (r"\bas\s+discussed\s+(above|below)", 0.3, "relative"),
]


class CrossRefDetector:
    """
    Detect cross-references in a CanonicalDocument.

    Detection sources:
    - Regex patterns in paragraph text
    - DOCX hyperlinks (from document.cross_references if present)

    Validation:
    - valid: exactly one anchor matches target key
    - broken: no anchor matches
    - ambiguous: multiple anchors match (duplicates)
    - external: target appears to be outside document (URL, other doc)
    """

    def __init__(self, anchor_index: Optional[Dict[str, List[Anchor]]] = None):
        """
        Initialize detector.

        Args:
            anchor_index: Pre-built index of anchor_key -> [Anchor] for validation
        """
        self._anchor_index = anchor_index or {}

    def detect(
        self,
        doc: CanonicalDocument,
        anchors: Optional[List[Anchor]] = None
    ) -> List[CrossRef]:
        """
        Detect all cross-references in document.

        Args:
            doc: CanonicalDocument to scan
            anchors: Optional list of anchors for validation

        Returns:
            List of CrossRef sorted deterministically
        """
        # Build anchor index if not provided
        if anchors:
            self._build_anchor_index(anchors)

        xrefs: List[CrossRef] = []

        # Detect from paragraph text
        for para in doc.paragraphs:
            para_xrefs = self._detect_in_paragraph(doc, para)
            xrefs.extend(para_xrefs)

        # Detect from document-level cross_references (DOCX hyperlinks)
        for docx_xref in doc.cross_references:
            hyperlink_xref = self._convert_docx_xref(doc, docx_xref)
            if hyperlink_xref:
                xrefs.append(hyperlink_xref)

        # Deduplicate by (paragraph, target, char_start)
        xrefs = self._deduplicate(xrefs)

        # Sort deterministically
        return sorted(xrefs, key=lambda x: x.sort_key())

    def _build_anchor_index(self, anchors: List[Anchor]) -> None:
        """Build index of anchor_key -> [Anchor] for validation."""
        self._anchor_index.clear()
        for anchor in anchors:
            if anchor.anchor_key not in self._anchor_index:
                self._anchor_index[anchor.anchor_key] = []
            self._anchor_index[anchor.anchor_key].append(anchor)

    def _detect_in_paragraph(
        self,
        doc: CanonicalDocument,
        para: CanonicalParagraph
    ) -> List[CrossRef]:
        """Detect cross-references in a single paragraph."""
        xrefs = []

        for pattern, base_confidence, ref_type in XREF_PATTERNS:
            for match in re.finditer(pattern, para.text):
                xref = self._create_xref_from_match(
                    doc, para, match, base_confidence, ref_type
                )
                if xref:
                    xrefs.append(xref)

        return xrefs

    def _create_xref_from_match(
        self,
        doc: CanonicalDocument,
        para: CanonicalParagraph,
        match: re.Match,
        base_confidence: float,
        ref_type: str
    ) -> Optional[CrossRef]:
        """Create CrossRef from regex match."""

        # Build target anchor key
        captured = match.group(1) if match.lastindex else match.group(0)
        target_key = self._build_target_key(captured, ref_type)

        if not target_key:
            return None

        # Build evidence pointer
        char_start = match.start()
        char_end = match.end()

        evidence = EvidencePointer(
            doc_id=doc.doc_id,
            content_hash=doc.content_hash,
            pointer_type="docx",
            paragraph_index=para.index,
            run_span=(char_start, char_end),
            table_index=para.table_index,
            cell_coords=(para.cell_row, para.cell_col) if para.is_in_table else None,
        )

        # Validate against anchor index
        status, adjusted_confidence = self._validate_target(
            target_key, base_confidence
        )

        return CrossRef(
            source_doc_id=doc.doc_id,
            content_hash=doc.content_hash,
            target_anchor_key=target_key,
            evidence_pointer=evidence,
            validation_status=status,
            confidence=round(adjusted_confidence, 6),
            reference_text=match.group(0)[:200],
        )

    def _build_target_key(self, captured: str, ref_type: str) -> str:
        """Build normalized target anchor key from captured text."""

        if ref_type == "section":
            # "5.3.2" -> "section-5-3-2"
            normalized = captured.replace(".", "-")
            return f"section-{normalized}"

        elif ref_type == "table":
            return f"table-{captured}"

        elif ref_type == "figure":
            return f"figure-{captured}"

        elif ref_type == "appendix":
            return f"appendix-{captured.lower()}"

        elif ref_type == "relative":
            # Can't resolve relative refs to specific anchor
            return ""

        return normalize_anchor_key(captured)

    def _validate_target(
        self,
        target_key: str,
        base_confidence: float
    ) -> Tuple[ValidationStatus, float]:
        """
        Validate target against anchor index.

        Returns (status, adjusted_confidence)
        """
        if not target_key:
            return "broken", base_confidence * 0.5

        # Check if target looks external (URL pattern)
        if target_key.startswith(("http://", "https://", "mailto:")):
            return "external", base_confidence

        # Look up in anchor index
        matches = self._anchor_index.get(target_key, [])

        if len(matches) == 0:
            return "broken", base_confidence
        elif len(matches) == 1:
            return "valid", min(base_confidence * 1.2, 1.0)
        else:
            # Multiple matches = ambiguous
            return "ambiguous", base_confidence * 0.8

    def _convert_docx_xref(self, doc: CanonicalDocument, docx_xref) -> Optional[CrossRef]:
        """Convert document-level CrossRef to our model."""

        target_key = normalize_anchor_key(docx_xref.target_anchor_key)
        if not target_key:
            return None

        # Build evidence pointer
        evidence = EvidencePointer(
            doc_id=doc.doc_id,
            content_hash=doc.content_hash,
            pointer_type="docx",
            paragraph_index=docx_xref.source_paragraph_index,
        )

        # Validate
        status, confidence = self._validate_target(target_key, 0.9)

        return CrossRef(
            source_doc_id=doc.doc_id,
            content_hash=doc.content_hash,
            target_anchor_key=target_key,
            evidence_pointer=evidence,
            validation_status=status,
            confidence=round(confidence, 6),
            reference_text=docx_xref.source_text[:200],
        )

    def _deduplicate(self, xrefs: List[CrossRef]) -> List[CrossRef]:
        """Remove duplicate cross-references."""
        seen: Set[Tuple] = set()
        unique = []

        for xref in xrefs:
            key = (
                xref.evidence_pointer.paragraph_index,
                xref.evidence_pointer.run_span,
                xref.target_anchor_key,
            )
            if key not in seen:
                seen.add(key)
                unique.append(xref)

        return unique


def detect_cross_refs(
    doc: CanonicalDocument,
    anchors: Optional[List[Anchor]] = None
) -> List[CrossRef]:
    """
    Convenience function for cross-reference detection.

    Usage:
        xrefs = detect_cross_refs(canonical_doc, anchors)
    """
    detector = CrossRefDetector()
    return detector.detect(doc, anchors)
