"""
Cross-Reference Model - Phase 2

Pydantic model for detected cross-references.
"""

from __future__ import annotations

from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict

from lumen_cortex.core.canonical import EvidencePointer


ValidationStatus = Literal["valid", "broken", "ambiguous", "external"]


class CrossRef(BaseModel):
    """
    Detected cross-reference with validation status.

    Represents a reference from one location to another anchor:
    - "See Section 5.3.2"
    - "Refer to Table 4"
    - Internal DOCX hyperlinks
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    # Document reference
    source_doc_id: UUID = Field(..., description="Document containing the reference")
    content_hash: str = Field(
        ...,
        min_length=64,
        max_length=64,
        pattern=r"^[a-f0-9]{64}$",
    )

    # Reference relationship
    source_anchor_key: Optional[str] = Field(
        default=None,
        description="Anchor key of source location (if from within an anchor)"
    )
    target_anchor_key: str = Field(
        ...,
        description="Normalized key of reference target"
    )

    # Location of reference
    evidence_pointer: EvidencePointer = Field(...)

    # Validation result
    validation_status: ValidationStatus = Field(
        default="broken",
        description="valid|broken|ambiguous|external"
    )
    confidence: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Confidence in reference detection"
    )

    # Original text
    reference_text: str = Field(
        default="",
        description="Original reference text (e.g., 'See Section 5.3.2')"
    )

    def sort_key(self) -> tuple:
        """Deterministic sort key for ordering cross-references."""
        ptr = self.evidence_pointer
        return (
            ptr.paragraph_index if ptr.paragraph_index is not None else -1,
            ptr.run_span[0] if ptr.run_span else -1,
            self.target_anchor_key,
            self.confidence,
        )
