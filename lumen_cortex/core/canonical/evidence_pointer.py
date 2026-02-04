"""
═══════════════════════════════════════════════════════════════════════════════
                    EVIDENCE POINTER STANDARD v1.0 (FROZEN)
═══════════════════════════════════════════════════════════════════════════════

Deterministic location reference for findings in DOCX and PDF documents.

SPEC FREEZE v1.0: This schema is immutable. Changes require version bumps.

@module lumen_cortex.core.canonical.evidence_pointer
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional, Tuple
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


class EvidencePointer(BaseModel):
    """
    Deterministic location reference for findings.

    Works across DOCX and PDF with unified semantics:
    - DOCX: paragraph/run/cell coordinates
    - PDF: page/bbox/hash coordinates

    FROZEN v1.0 - Do not modify without version bump.
    """

    model_config = ConfigDict(
        frozen=True,  # Immutable for determinism
        extra="forbid",  # No extra fields allowed
    )

    # Document reference
    doc_id: UUID = Field(
        ...,
        description="Reference to documents.id"
    )
    content_hash: str = Field(
        ...,
        min_length=64,
        max_length=64,
        pattern=r"^[a-f0-9]{64}$",
        description="SHA256 of source file (immutable anchor)"
    )
    pointer_type: Literal["docx", "pdf"] = Field(
        ...,
        description="Document format for coordinate interpretation"
    )

    # ─────────────────────────────────────────────────────────────────────────
    # DOCX Coordinates (paragraph-based)
    # ─────────────────────────────────────────────────────────────────────────

    paragraph_index: Optional[int] = Field(
        default=None,
        ge=0,
        description="0-indexed paragraph in document order"
    )
    run_span: Optional[Tuple[int, int]] = Field(
        default=None,
        description="(start, end) character offset in paragraph text"
    )
    table_index: Optional[int] = Field(
        default=None,
        ge=0,
        description="Which table (0-indexed) if location is in a table"
    )
    cell_coords: Optional[Tuple[int, int]] = Field(
        default=None,
        description="(row, col) 0-indexed cell coordinates"
    )
    ooxml_xpath: Optional[str] = Field(
        default=None,
        max_length=1000,
        description="Full OOXML XPath for edge cases"
    )

    # ─────────────────────────────────────────────────────────────────────────
    # PDF Coordinates (geometry-based)
    # ─────────────────────────────────────────────────────────────────────────

    page: Optional[int] = Field(
        default=None,
        ge=0,
        description="0-indexed page number"
    )
    bbox: Optional[Tuple[float, float, float, float]] = Field(
        default=None,
        description="Bounding box (x1, y1, x2, y2) in PDF coordinates"
    )
    text_hash: Optional[str] = Field(
        default=None,
        min_length=64,
        max_length=64,
        pattern=r"^[a-f0-9]{64}$",
        description="SHA256 of extracted text at location (for verification)"
    )

    def to_human_readable(self) -> str:
        """
        Convert to human-readable location string.

        Examples:
        - "Page 5, Section 5.3.2"
        - "Table 4, Cell (2, 3)"
        - "Paragraph 42"
        """
        parts = []

        if self.pointer_type == "pdf" and self.page is not None:
            parts.append(f"Page {self.page + 1}")

        if self.table_index is not None:
            parts.append(f"Table {self.table_index + 1}")
            if self.cell_coords is not None:
                row, col = self.cell_coords
                parts.append(f"Cell ({row + 1}, {col + 1})")
        elif self.paragraph_index is not None:
            parts.append(f"Paragraph {self.paragraph_index + 1}")
            if self.run_span is not None:
                start, end = self.run_span
                parts.append(f"chars {start}-{end}")

        return ", ".join(parts) if parts else "Document root"

    def sort_key(self) -> tuple:
        """
        Stable sort key for deterministic ordering.

        Order: pointer_type → page → paragraph → table → cell → text_hash
        """
        return (
            self.pointer_type,
            self.page if self.page is not None else -1,
            self.paragraph_index if self.paragraph_index is not None else -1,
            self.table_index if self.table_index is not None else -1,
            (self.cell_coords[0], self.cell_coords[1]) if self.cell_coords else (-1, -1),
            self.text_hash or "",
        )


def evidence_sort_tuple(ev: EvidencePointer) -> tuple:
    """
    Stable sort key for evidence pointers (module-level function).

    Used in Finding.compute_fingerprint() and test assertions.
    """
    return ev.sort_key()
