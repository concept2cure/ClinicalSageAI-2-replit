"""
Anchor Extractor - Phase 2

Deterministic extraction of anchors from CanonicalDocument.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Dict, List
from uuid import UUID

from lumen_cortex.core.canonical import (
    CanonicalDocument,
    CanonicalParagraph,
    EvidencePointer,
)
from .models import Anchor, normalize_anchor_key


class AnchorExtractor:
    """
    Extract anchors from a CanonicalDocument deterministically.

    Anchors are extracted from:
    - Headings (paragraph.heading_level is not None)
    - Numbered paragraphs (paragraph.list_prefix matches section pattern)
    - Bookmarks (from document.anchors dict if present)

    Duplicate handling:
    - Same anchor_key can appear multiple times
    - Each duplicate gets incrementing anchor_ordinal (0, 1, 2...)
    - Ordinal is assigned in encounter order (paragraph_index)
    """

    def __init__(self):
        self._key_counts: Dict[str, int] = defaultdict(int)

    def extract(self, doc: CanonicalDocument) -> List[Anchor]:
        """
        Extract all anchors from document.

        Returns anchors sorted by (paragraph_index, ordinal).
        """
        self._key_counts.clear()
        anchors: List[Anchor] = []

        # Extract from paragraphs (headings and numbered)
        for para in doc.paragraphs:
            anchor = self._extract_from_paragraph(doc, para)
            if anchor:
                anchors.append(anchor)

        # Extract from document-level anchors (bookmarks)
        for anchor_key, location in doc.anchors.items():
            bookmark_anchor = self._create_bookmark_anchor(
                doc, anchor_key, location
            )
            if bookmark_anchor:
                anchors.append(bookmark_anchor)

        # Sort deterministically
        return sorted(anchors, key=lambda a: a.sort_key())

    def _extract_from_paragraph(
        self,
        doc: CanonicalDocument,
        para: CanonicalParagraph
    ) -> Anchor | None:
        """Extract anchor from a single paragraph if applicable."""

        # Determine anchor type and build key
        anchor_type = None
        numbering_prefix = None

        if para.heading_level is not None:
            anchor_type = "heading"
        elif para.list_prefix and self._is_section_numbering(para.list_prefix):
            anchor_type = "numbered_paragraph"
            numbering_prefix = para.list_prefix
        else:
            return None

        # Generate deterministic key
        anchor_key = normalize_anchor_key(para.text, numbering_prefix)
        if not anchor_key:
            return None

        # Get ordinal for this key
        ordinal = self._key_counts[anchor_key]
        self._key_counts[anchor_key] += 1

        # Build evidence pointer
        evidence = EvidencePointer(
            doc_id=doc.doc_id,
            content_hash=doc.content_hash,
            pointer_type="docx",
            paragraph_index=para.index,
            table_index=para.table_index,
            cell_coords=(para.cell_row, para.cell_col) if para.is_in_table else None,
        )

        return Anchor(
            doc_id=doc.doc_id,
            content_hash=doc.content_hash,
            anchor_key=anchor_key,
            anchor_type=anchor_type,
            anchor_ordinal=ordinal,
            evidence_pointer=evidence,
            extracted_text=para.text[:500],  # Truncate for storage
        )

    def _create_bookmark_anchor(
        self,
        doc: CanonicalDocument,
        anchor_key: str,
        location,  # AnchorLocation from canonical model
    ) -> Anchor | None:
        """Create anchor from document-level bookmark."""

        # Normalize the bookmark key
        normalized_key = normalize_anchor_key(anchor_key)
        if not normalized_key:
            return None

        # Get ordinal
        ordinal = self._key_counts[normalized_key]
        self._key_counts[normalized_key] += 1

        # Build evidence pointer
        evidence = EvidencePointer(
            doc_id=doc.doc_id,
            content_hash=doc.content_hash,
            pointer_type="docx",
            paragraph_index=location.paragraph_index,
        )

        return Anchor(
            doc_id=doc.doc_id,
            content_hash=doc.content_hash,
            anchor_key=normalized_key,
            anchor_type="bookmark",
            anchor_ordinal=ordinal,
            evidence_pointer=evidence,
            extracted_text=location.text[:500] if location.text else "",
        )

    @staticmethod
    def _is_section_numbering(prefix: str) -> bool:
        """
        Check if list_prefix looks like section numbering.

        Examples that match: "5.3.2", "1.2", "A.1.2"
        Examples that don't: "a)", "•", "1."
        """
        import re
        # Match patterns like "5.3.2" or "A.1.2"
        return bool(re.match(r"^[A-Za-z0-9]+(\.[A-Za-z0-9]+)+$", prefix.strip()))


def extract_anchors(doc: CanonicalDocument) -> List[Anchor]:
    """
    Convenience function for anchor extraction.

    Usage:
        anchors = extract_anchors(canonical_doc)
    """
    extractor = AnchorExtractor()
    return extractor.extract(doc)
