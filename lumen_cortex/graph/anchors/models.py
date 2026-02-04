"""
Anchor Model - Phase 2

Pydantic model for extracted document anchors.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict

from lumen_cortex.core.canonical import EvidencePointer


class Anchor(BaseModel):
    """
    Extracted document anchor with deterministic key.

    Anchors represent navigable locations in a document:
    - Headings (Heading 1-9)
    - Bookmarks (DOCX bookmarks)
    - Numbered paragraphs (e.g., "5.3.2 Pharmacokinetics")
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    # Document reference
    doc_id: UUID = Field(..., description="Reference to documents.id")
    content_hash: str = Field(
        ...,
        min_length=64,
        max_length=64,
        pattern=r"^[a-f0-9]{64}$",
        description="SHA256 of source document"
    )

    # Anchor identity
    anchor_key: str = Field(
        ...,
        max_length=255,
        description="Normalized anchor key for matching"
    )
    anchor_type: Literal["bookmark", "heading", "numbered_paragraph"] = Field(...)
    anchor_ordinal: int = Field(
        default=0,
        ge=0,
        description="0-based ordinal for duplicate keys"
    )

    # Location
    evidence_pointer: EvidencePointer = Field(
        ...,
        description="Frozen v1.0 evidence pointer"
    )

    # Human-readable
    extracted_text: str = Field(
        default="",
        description="Original text of anchor"
    )

    def sort_key(self) -> tuple:
        """Deterministic sort key for ordering anchors."""
        ptr = self.evidence_pointer
        return (
            ptr.paragraph_index if ptr.paragraph_index is not None else -1,
            ptr.table_index if ptr.table_index is not None else -1,
            ptr.cell_coords or (-1, -1),
            self.anchor_ordinal,
        )


def normalize_anchor_key(text: str, numbering_prefix: Optional[str] = None) -> str:
    """
    Generate deterministic anchor key from text.

    Algorithm:
    1. Include numbering prefix if present (e.g., "5.3.2")
    2. Normalize to lowercase
    3. ASCII fold (remove accents)
    4. Replace non-alphanumeric with hyphens
    5. Collapse multiple hyphens
    6. Trim leading/trailing hyphens

    Examples:
        "5.3.2 Pharmacokinetics" → "section-5-3-2-pharmacokinetics"
        "Introduction" → "introduction"
        "Table 4: Demographics" → "table-4-demographics"
    """
    if not text:
        return ""

    # Build full text with numbering
    if numbering_prefix:
        full_text = f"section-{numbering_prefix} {text}"
    else:
        full_text = text

    # Normalize unicode
    normalized = unicodedata.normalize("NFKD", full_text)

    # ASCII fold (remove accents)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")

    # Lowercase
    lower = ascii_text.lower()

    # Replace non-alphanumeric with hyphens
    hyphenated = re.sub(r"[^a-z0-9]+", "-", lower)

    # Collapse multiple hyphens
    collapsed = re.sub(r"-+", "-", hyphenated)

    # Trim leading/trailing hyphens
    trimmed = collapsed.strip("-")

    # Limit length
    return trimmed[:255] if trimmed else "untitled"
