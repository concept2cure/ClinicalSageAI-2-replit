"""Pydantic models for Phase 6.6.C/C2 — Evidence-Linked SE Matrix + Manifest.

Enhanced SE matrix payload models with risk_code mapping, evidence_task_ids,
defense readiness scoring, and regulatory intelligence manifest.

These models are the output contract between
the SE Matrix Generator and downstream consumers (DOCX Factory, BFF, UI).

Complements (does not replace) models_predicate.py SE row models — those are
the DB-backed CRUD models; these are the generator output models.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════════════════════════
# Diff Flag (canonical literals)
# ═══════════════════════════════════════════════════════════════════════════════

DiffFlag = Literal["EQUIVALENT", "DISCUSSION_REQUIRED", "SIGNIFICANT"]


# ═══════════════════════════════════════════════════════════════════════════════
# SE Matrix Row (generator output — evidence-linked)
# ═══════════════════════════════════════════════════════════════════════════════

class SEMatrixRowV2(BaseModel):
    """A single row in the SE comparison matrix with risk_code linkage.

    This is the generator output format — richer than the DB-backed SEMatrixRow
    in models_predicate.py.  Maps directly to DOCX Factory template repeaters.
    """
    sort_order: int = 0
    characteristic: str
    category: str  # SECategory value
    subject_value: str
    predicate_value: str
    diff_flag: DiffFlag
    discussion_text: str
    risk_code: Optional[str] = None
    triggered_risk_codes: list[str] = Field(default_factory=list)
    evidence_task_ids: list[str] = Field(default_factory=list)
    requires_citation: bool = False
    suggested_tests: list[str] = Field(default_factory=list)
    diff_severity: str = "none"

    # Evidence cell metadata (for rendering)
    subject_evidence_ids: list[str] = Field(default_factory=list)
    predicate_evidence_ids: list[str] = Field(default_factory=list)
    subject_confidence: float = 0.5
    predicate_confidence: float = 0.9


# ═══════════════════════════════════════════════════════════════════════════════
# Evidence Task (linked from rows)
# ═══════════════════════════════════════════════════════════════════════════════

class EvidenceTaskV2(BaseModel):
    """An evidence task produced by the SE matrix generator.

    task_id is stable: sha256(category + risk_code)[:12].
    """
    task_id: str
    category: str  # EvidenceCategory value
    risk_code: str
    severity: str = "MEDIUM"
    label: str = ""
    rationale: str = ""
    recommended_artifacts: list[str] = Field(default_factory=list)
    mapping: dict[str, Any] = Field(
        default_factory=lambda: {
            "truth_machine_placeholder": True,
            "se_matrix_linkable": True,
            "ectd_section": "",
        },
    )


# ═══════════════════════════════════════════════════════════════════════════════
# SE Matrix Payload (full generator output)
# ═══════════════════════════════════════════════════════════════════════════════

class SEMatrixPayloadV2(BaseModel):
    """Full SE matrix payload with evidence-linked rows and defense scoring.

    This is the contract between the generator and DOCX Factory / BFF.
    """
    template_id: str = "510k_se_matrix_v2"
    version: str = "6.6.0"
    device_name: str
    predicate_k_number: str
    predicate_device_name: str
    comparison_rows: list[SEMatrixRowV2]
    evidence_tasks: list[EvidenceTaskV2] = Field(default_factory=list)
    defense_readiness_score: int = Field(ge=0, le=100)
    generated_at: str  # ISO 8601
    risk_code_map_version: str = "2.0.0"

    # Downstream compatibility
    evidence_linkage: bool = True
    regulatory_standard: str = "FDA_510k_SE"


# ═══════════════════════════════════════════════════════════════════════════════
# SE Matrix Generate Request (enhanced for 6.6.C)
# ═══════════════════════════════════════════════════════════════════════════════

class SEMatrixGenerateRequest(BaseModel):
    """Request model for the enhanced SE matrix generation endpoint."""
    program_id: str
    subject_device: dict[str, Any] = Field(default_factory=dict)
    selected_predicate_k_number: str
    product_code: Optional[str] = None
    design_control_ids: dict[str, str] = Field(default_factory=dict)
    defense_packet_seed: Optional[dict[str, Any]] = None


# ═══════════════════════════════════════════════════════════════════════════════
# SE Matrix Generate Response (enhanced for 6.6.C)
# ═══════════════════════════════════════════════════════════════════════════════

class SEMatrixGenerateResponse(BaseModel):
    """Response model for the enhanced SE matrix generation endpoint."""
    se_matrix_payload: SEMatrixPayloadV2
    defense_readiness_score: int
    row_count: int
    discussion_required_count: int
    significant_count: int = 0
    evidence_tasks: list[EvidenceTaskV2] = Field(default_factory=list)
    generation_timestamp: str


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 6.6.C2 — Regulatory Intelligence Manifest
# ═══════════════════════════════════════════════════════════════════════════════

class RegulatoryIntelManifest(BaseModel):
    """Deterministic manifest for SE Matrix payload — Part 11 audit ready.

    Every field is either input-derived or computed via deterministic hash.
    manifest_hash excludes generated_at for stability.
    """
    subject_hash: str
    program_id: str
    product_code: str
    predicate_k_number: str

    generator_version: str          # app version or commit SHA
    risk_code_map_version: str      # "2.0.0"
    risk_vocab_hash: str            # sha256[:12] of risk_vocab.yml bytes
    manifest_hash: str              # sha256 of canonicalized manifest JSON

    generated_at: str               # ISO UTC

    risk_codes_used: list[str] = Field(default_factory=list)
    evidence_task_ids: list[str] = Field(default_factory=list)
    defense_readiness_score: int = Field(ge=0, le=100)
    top_risks: list[str] = Field(default_factory=list)  # max 5


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 6.6.C2 — SE Matrix Payload Request / Response (manifest-bearing)
# ═══════════════════════════════════════════════════════════════════════════════

class SEMatrixPayloadRequest(BaseModel):
    """Request for the SE Matrix payload endpoint with manifest generation."""
    program_id: str
    product_code: str = ""
    subject_device: dict[str, Any] = Field(default_factory=dict)
    selected_predicate_k_number: str
    selected_predicate: dict[str, Any] = Field(default_factory=dict)
    design_control_ids: dict[str, str] = Field(default_factory=dict)
    include_explainability: bool = True


class SEMatrixPayloadResponse(BaseModel):
    """Response from SE Matrix payload endpoint — manifest + payload + tasks."""
    manifest: RegulatoryIntelManifest
    payload: SEMatrixPayloadV2
    evidence_tasks: list[EvidenceTaskV2] = Field(default_factory=list)
