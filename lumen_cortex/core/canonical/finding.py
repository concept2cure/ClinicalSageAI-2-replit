"""
═══════════════════════════════════════════════════════════════════════════════
                    FINDING MODEL v1.0 (FROZEN)
═══════════════════════════════════════════════════════════════════════════════

Structured deficiency report with versioned metadata for audit trails.

SPEC FREEZE v1.0: This schema is immutable. Changes require version bumps.

@module lumen_cortex.core.canonical.finding
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Literal, Optional, Dict, Any, List
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict, computed_field

from .evidence_pointer import EvidencePointer, evidence_sort_tuple


# Severity ranking for deterministic ordering
SEVERITY_RANK: Dict[str, int] = {
    "Critical": 0,
    "Major": 1,
    "Minor": 2,
    "Informational": 3,
}


class Finding(BaseModel):
    """
    A structured deficiency finding with deterministic fingerprint.

    FROZEN v1.0 - Do not modify without version bump.

    Every finding includes:
    - Rule identification (rule_id, rule_name)
    - Regulatory basis (cfr_citation, ich_reference)
    - Versioning for reproducibility (schema, extractor, ruleset versions)
    - Deterministic fingerprint for audit trails
    - Evidence pointer with location coordinates
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    # ─────────────────────────────────────────────────────────────────────────
    # Finding Identity
    # ─────────────────────────────────────────────────────────────────────────

    finding_id: UUID = Field(..., description="Unique identifier for this finding")
    doc_id: UUID = Field(..., description="Document that was analyzed")

    # ─────────────────────────────────────────────────────────────────────────
    # Rule Information
    # ─────────────────────────────────────────────────────────────────────────

    rule_id: str = Field(
        ...,
        pattern=r"^R\d{3}$",
        description="Rule identifier (e.g., 'R001', 'R002')"
    )
    rule_name: str = Field(..., description="Human-readable rule name")

    # Regulatory basis (at least one should be provided)
    cfr_citation: Optional[str] = Field(
        default=None,
        description="FDA CFR citation (e.g., '21 CFR 312.23(a)(7)')"
    )
    ich_reference: Optional[str] = Field(
        default=None,
        description="ICH guidance reference (e.g., 'ICH CTD Module 2 (M4)')"
    )

    # ─────────────────────────────────────────────────────────────────────────
    # Versioning (for reproducibility)
    # ─────────────────────────────────────────────────────────────────────────

    canonical_schema_version: Literal["1.0"] = Field(
        default="1.0",
        description="CanonicalDocument schema version used"
    )
    extractor_version: str = Field(
        ...,
        description="Git SHA or package version of extractor"
    )
    ruleset_version: str = Field(
        ...,
        description="Version of the rule registry"
    )
    content_hash: str = Field(
        ...,
        min_length=64,
        max_length=64,
        pattern=r"^[a-f0-9]{64}$",
        description="SHA256 of analyzed document"
    )

    # ─────────────────────────────────────────────────────────────────────────
    # Finding Details
    # ─────────────────────────────────────────────────────────────────────────

    severity: Literal["Critical", "Major", "Minor", "Informational"] = Field(...)
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Confidence score (quantized to 6 decimal places)"
    )

    # Evidence
    evidence: EvidencePointer = Field(..., description="Location of the finding")
    evidence_context: str = Field(
        ...,
        max_length=500,
        description="Surrounding text (±200 chars)"
    )

    # Human-readable output
    description: str = Field(..., description="What was found")
    remediation: str = Field(..., description="Specific fix instructions")

    # ─────────────────────────────────────────────────────────────────────────
    # Audit Trail
    # ─────────────────────────────────────────────────────────────────────────

    created_at: datetime = Field(default_factory=datetime.utcnow)
    reviewed_by: Optional[str] = Field(
        default=None,
        description="Human reviewer (null until approved)"
    )
    reviewed_at: Optional[datetime] = Field(default=None)

    @computed_field
    @property
    def fingerprint(self) -> str:
        """
        Deterministic hash for audit purposes.

        Includes all versioned coordinates to ensure identical findings
        produce identical fingerprints.
        """
        return self.compute_fingerprint()

    def compute_fingerprint(self) -> str:
        """
        Compute deterministic fingerprint.

        Uses versioned coordinates:
        - content_hash (document identity)
        - schema/extractor/ruleset versions
        - rule_id + severity
        - evidence pointer coordinates
        - quantized confidence
        """
        # Quantize confidence to 6 decimal places
        confidence_q = round(self.confidence, 6)

        parts = [
            self.content_hash,
            self.canonical_schema_version,
            self.extractor_version,
            self.ruleset_version,
            self.rule_id,
            str(SEVERITY_RANK[self.severity]),
            self.evidence.pointer_type,
            str(self.evidence.paragraph_index if self.evidence.paragraph_index is not None else -1),
            str(self.evidence.table_index if self.evidence.table_index is not None else -1),
            str(self.evidence.cell_coords or (-1, -1)),
            str(self.evidence.page if self.evidence.page is not None else -1),
            str(self.evidence.bbox or (-1, -1, -1, -1)),
            self.evidence.text_hash or "",
            str(confidence_q),
        ]

        canonical = "|".join(parts)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def sort_key(self) -> tuple:
        """
        Stable sort key for deterministic finding order.

        Order: severity → rule_id → evidence location
        """
        return (
            SEVERITY_RANK[self.severity],
            self.rule_id,
            evidence_sort_tuple(self.evidence),
        )


def finding_sort_key(f: Finding) -> tuple:
    """
    Module-level sort key function for findings.

    Use with: sorted(findings, key=finding_sort_key)
    """
    return f.sort_key()


def sort_findings(findings: List[Finding]) -> List[Finding]:
    """
    Sort findings in deterministic order.

    Always call this before returning or storing findings.
    """
    return sorted(findings, key=finding_sort_key)
