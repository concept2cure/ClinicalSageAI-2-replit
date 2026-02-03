"""
═══════════════════════════════════════════════════════════════════════════════
                    CANONICAL DOCUMENT MODEL v1.0 (FROZEN)
═══════════════════════════════════════════════════════════════════════════════

Parser-agnostic document representation for deterministic extraction.

SPEC FREEZE v1.0: This schema is immutable. Changes require version bumps.

@module lumen_cortex.core.canonical.document
"""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


# ═══════════════════════════════════════════════════════════════════════════
#                          PARAGRAPH MODEL
# ═══════════════════════════════════════════════════════════════════════════

class CanonicalRun(BaseModel):
    """
    A run of text with consistent formatting.

    Represents a contiguous sequence of characters with the same style.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    text: str = Field(..., description="The actual text content")
    bold: bool = Field(default=False)
    italic: bool = Field(default=False)
    underline: bool = Field(default=False)
    strike: bool = Field(default=False)
    font_name: Optional[str] = Field(default=None)
    font_size: Optional[float] = Field(default=None, description="Font size in points")
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")


class CanonicalParagraph(BaseModel):
    """
    A normalized paragraph with resolved styles and numbering.

    Styles are flattened (no style inheritance chains).
    Numbering is resolved to actual text prefix.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    index: int = Field(..., ge=0, description="0-indexed position in document")
    text: str = Field(..., description="Full text content (runs concatenated)")
    runs: List[CanonicalRun] = Field(default_factory=list)

    # Style information (resolved, not style name)
    style_name: Optional[str] = Field(default=None, description="Original style name")
    heading_level: Optional[int] = Field(
        default=None,
        ge=1,
        le=9,
        description="Heading level 1-9, None if not a heading"
    )

    # List/numbering (resolved to actual prefix)
    list_level: Optional[int] = Field(default=None, ge=0)
    list_prefix: Optional[str] = Field(
        default=None,
        description="Resolved numbering like '5.3.2' or 'a)'"
    )

    # Location metadata
    is_in_table: bool = Field(default=False)
    table_index: Optional[int] = Field(default=None, ge=0)
    cell_row: Optional[int] = Field(default=None, ge=0)
    cell_col: Optional[int] = Field(default=None, ge=0)


# ═══════════════════════════════════════════════════════════════════════════
#                          TABLE MODEL
# ═══════════════════════════════════════════════════════════════════════════

class CanonicalCell(BaseModel):
    """
    A table cell with explicit merge semantics.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    row: int = Field(..., ge=0)
    col: int = Field(..., ge=0)
    row_span: int = Field(default=1, ge=1)
    col_span: int = Field(default=1, ge=1)
    paragraphs: List[CanonicalParagraph] = Field(default_factory=list)
    border_style: Optional[str] = Field(
        default=None,
        description="Border style for fidelity validation"
    )
    background_color: Optional[str] = Field(
        default=None,
        pattern=r"^#[0-9A-Fa-f]{6}$"
    )
    vertical_align: Optional[Literal["top", "center", "bottom"]] = Field(default=None)


class CanonicalTable(BaseModel):
    """
    A normalized table with explicit structure.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    index: int = Field(..., ge=0, description="0-indexed table position")
    rows: int = Field(..., ge=1)
    cols: int = Field(..., ge=1)
    cells: List[CanonicalCell] = Field(default_factory=list)
    header_rows: List[int] = Field(
        default_factory=list,
        description="Which row indices are headers"
    )
    caption: Optional[str] = Field(default=None)

    def get_cell(self, row: int, col: int) -> Optional[CanonicalCell]:
        """Get cell at position, accounting for spans."""
        for cell in self.cells:
            if (cell.row <= row < cell.row + cell.row_span and
                cell.col <= col < cell.col + cell.col_span):
                return cell
        return None


# ═══════════════════════════════════════════════════════════════════════════
#                          ANCHOR AND CROSS-REFERENCE
# ═══════════════════════════════════════════════════════════════════════════

class AnchorLocation(BaseModel):
    """
    Location of a document anchor (bookmark, heading, numbered paragraph).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    anchor_type: Literal["bookmark", "heading", "numbered_paragraph"] = Field(...)
    paragraph_index: int = Field(..., ge=0)
    heading_level: Optional[int] = Field(default=None, ge=1, le=9)
    text: str = Field(..., description="Anchor text content")


class CrossRef(BaseModel):
    """
    A cross-reference from source to target.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    source_paragraph_index: int = Field(..., ge=0)
    source_text: str = Field(..., description="The reference text (e.g., 'See Section 5.3.2')")
    target_anchor_key: str = Field(..., description="Normalized key to target anchor")
    reference_type: Literal["section", "table", "figure", "appendix", "other"] = Field(...)
    is_hyperlink: bool = Field(default=False, description="True if DOCX hyperlink relationship")


# ═══════════════════════════════════════════════════════════════════════════
#                          CANONICAL DOCUMENT
# ═══════════════════════════════════════════════════════════════════════════

class CanonicalDocument(BaseModel):
    """
    Parser-agnostic document representation.

    FROZEN v1.0 - Do not modify without version bump.

    This model ensures:
    - Same bytes → same canonical JSON (determinism)
    - Structure preservation (tables, headings, lists)
    - Cross-reference tracking (anchors and xrefs)
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    # Version control
    schema_version: Literal["1.0"] = Field(
        default="1.0",
        description="Canonical document schema version"
    )

    # Document identity
    doc_id: UUID = Field(..., description="Reference to documents.id")
    content_hash: str = Field(
        ...,
        min_length=64,
        max_length=64,
        pattern=r"^[a-f0-9]{64}$",
        description="SHA256 of source file (links to document_blobs)"
    )
    source_type: Literal["docx", "pdf"] = Field(...)

    # Normalized structure
    paragraphs: List[CanonicalParagraph] = Field(
        default_factory=list,
        description="All paragraphs in document order (styles resolved, numbering flattened)"
    )
    tables: List[CanonicalTable] = Field(
        default_factory=list,
        description="All tables with explicit merge semantics"
    )

    # Document graph
    anchors: Dict[str, AnchorLocation] = Field(
        default_factory=dict,
        description="anchor_key → location mapping"
    )
    cross_references: List[CrossRef] = Field(
        default_factory=list,
        description="All detected cross-references (validated or broken)"
    )

    # Extraction metadata
    extraction_timestamp: datetime = Field(
        ...,
        description="When extraction was performed"
    )
    extractor_version: str = Field(
        ...,
        description="Git SHA or package version of extractor"
    )

    # Document metadata
    title: Optional[str] = Field(default=None)
    author: Optional[str] = Field(default=None)
    created_date: Optional[datetime] = Field(default=None)
    modified_date: Optional[datetime] = Field(default=None)
    word_count: int = Field(default=0, ge=0)
    page_count: Optional[int] = Field(default=None, ge=1)

    def get_paragraph(self, index: int) -> Optional[CanonicalParagraph]:
        """Get paragraph by index."""
        if 0 <= index < len(self.paragraphs):
            return self.paragraphs[index]
        return None

    def get_table(self, index: int) -> Optional[CanonicalTable]:
        """Get table by index."""
        if 0 <= index < len(self.tables):
            return self.tables[index]
        return None

    def get_headings(self, level: Optional[int] = None) -> List[CanonicalParagraph]:
        """Get all heading paragraphs, optionally filtered by level."""
        return [
            p for p in self.paragraphs
            if p.heading_level is not None and
               (level is None or p.heading_level == level)
        ]

    def get_broken_references(self) -> List[CrossRef]:
        """Get cross-references that point to non-existent anchors."""
        return [
            xref for xref in self.cross_references
            if xref.target_anchor_key not in self.anchors
        ]
