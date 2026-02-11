"""Pydantic models for Phase 6.6.D+ — Defense Packets + Evidence Ops.

First-class compliance artifact: versioned, signed, lifecycle-managed.
The "receipt" that links SE Matrix → Evidence Tasks → DOCX → eCTD → Truth Machine.

Two model tiers:
  1. DB-persistence (DefensePacketRecord) — thin, matches predicate.defense_packets DDL
  2. Domain-level (DefensePacket, EvidenceTask) — rich, deterministic, ops-complete
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator


# ═══════════════════════════════════════════════════════════════════════════════
# DB Render Status Lifecycle (persisted — tracks rendering pipeline)
# ═══════════════════════════════════════════════════════════════════════════════

DefensePacketRenderStatus = Literal["CREATED", "RENDERING", "RENDERED", "FAILED", "STALE"]

# Legacy alias kept so existing code doesn't break
DefensePacketStatus = DefensePacketRenderStatus

VALID_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "CREATED": {"RENDERING", "FAILED"},
    "RENDERING": {"RENDERED", "FAILED"},
    "RENDERED": {"STALE"},
    "FAILED": set(),       # terminal
    "STALE": {"CREATED"},  # re-generation creates a new packet, but allows re-activation
}


def is_valid_transition(current: str, target: str) -> bool:
    """Check if a status transition is valid."""
    return target in VALID_STATUS_TRANSITIONS.get(current, set())


# ═══════════════════════════════════════════════════════════════════════════════
# Evidence Ops Enums (domain-level — tracks evidence completion lifecycle)
# ═══════════════════════════════════════════════════════════════════════════════

class EvidenceSeverity(str, Enum):
    """Severity levels for evidence tasks — matches spec exactly."""
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class EvidenceTaskState(str, Enum):
    """Completion lifecycle for individual evidence tasks."""
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    DONE = "DONE"
    WAIVED = "WAIVED"


class PacketOpsStatus(str, Enum):
    """Evidence-ops lifecycle status for the Defense Packet (domain-level).

    Distinct from DefensePacketRenderStatus (DB render pipeline).
    """
    CREATED = "CREATED"
    IN_PROGRESS = "IN_PROGRESS"
    READY = "READY"
    BLOCKED = "BLOCKED"
    STALE = "STALE"
    FAILED = "FAILED"


class EvidenceCategory(str, Enum):
    """10 canonical evidence categories — mirrors models_predicate.EvidenceCategory."""
    BenchTesting = "BenchTesting"
    Biocompatibility = "Biocompatibility"
    RiskManagement = "RiskManagement"
    SoftwareLifecycle = "SoftwareLifecycle"
    Cybersecurity = "Cybersecurity"
    SterilizationValidation = "SterilizationValidation"
    ClinicalEvidence = "ClinicalEvidence"
    LabelingIFU = "LabelingIFU"
    StandardsConformance = "StandardsConformance"
    PostMarketSurveillance = "PostMarketSurveillance"


# ═══════════════════════════════════════════════════════════════════════════════
# Evidence Ops Domain Models (rich, operationally complete)
# ═══════════════════════════════════════════════════════════════════════════════

class EvidenceRef(BaseModel):
    """Points to real evidence (Truth Machine, uploaded doc, render output, leaf path)."""
    ref_type: Literal["TRUTH_PLACEHOLDER", "PROGRAM_DOC", "DOCX_RENDER", "PDF_RENDER", "ECTD_LEAF", "URL"]
    ref_id: str
    label: Optional[str] = None


class EvidenceTaskCompletion(BaseModel):
    """Tracks completion state of an evidence task — enterprise ops fields."""
    state: EvidenceTaskState = EvidenceTaskState.OPEN
    waiver_reason: Optional[str] = None
    completed_by: Optional[str] = None
    completed_at: Optional[datetime] = None
    evidence_refs: list[EvidenceRef] = Field(default_factory=list)

    @field_validator("waiver_reason")
    @classmethod
    def waiver_reason_required_if_waived(cls, v: Optional[str], info: Any) -> Optional[str]:
        data = info.data or {}
        if data.get("state") == EvidenceTaskState.WAIVED and not v:
            raise ValueError("waiver_reason is required when completion.state == WAIVED")
        return v


class ReviewerQuestionSeed(BaseModel):
    """Non-LLM anticipated reviewer question — deterministic, canned."""
    question: str
    recommended_sections: list[str] = Field(default_factory=list)
    recommended_artifacts: list[str] = Field(default_factory=list)


class EvidenceTaskFull(BaseModel):
    """Operationally complete evidence task in the Defense Packet.

    Deterministic: stable task_id, sorted lists, canned content.
    """
    task_id: str = Field(..., min_length=8, max_length=64)
    severity: EvidenceSeverity
    category: EvidenceCategory

    # What triggered it
    triggered_risk_codes: list[str] = Field(default_factory=list)
    se_matrix_rows: list[str] = Field(default_factory=list)

    # Human-readable but deterministic / canned
    title: str
    why_it_matters: str
    acceptance_criteria: list[str] = Field(default_factory=list)

    # Artifact guidance
    recommended_artifacts: list[str] = Field(default_factory=list)

    # Downstream linkage
    artifact_targets: list[str] = Field(default_factory=list)
    truth_machine_placeholder_id: Optional[str] = None

    # Reviewer questions (non-LLM, deterministic)
    anticipated_questions: list[ReviewerQuestionSeed] = Field(default_factory=list)

    # Evidence ops
    completion: EvidenceTaskCompletion = Field(default_factory=EvidenceTaskCompletion)

    @field_validator("triggered_risk_codes", "se_matrix_rows", "recommended_artifacts", "artifact_targets")
    @classmethod
    def stable_sort_lists(cls, v: list[str]) -> list[str]:
        """Determinism: dedup + sort lists so JSON comparisons are stable."""
        return sorted(list(dict.fromkeys(v or [])))


class DefensePacketFull(BaseModel):
    """Response-level Defense Packet — deterministic, auditable, enterprise-grade.

    Key invariant: packet_id == manifest_hash.
    Deterministic ordering for tasks, risk codes, artifact targets.
    """
    packet_version: str = "6.6.D+"
    packet_id: str  # stable == manifest_hash
    manifest_hash: str
    subject_hash: str
    program_id: str
    product_code: str

    generated_at: datetime
    risk_code_map_version: str
    risk_vocab_hash: str

    readiness_score: float = Field(..., ge=0, le=100)
    status: PacketOpsStatus = PacketOpsStatus.CREATED
    stale_reasons: list[str] = Field(default_factory=list)

    top_risks: list[str] = Field(default_factory=list)
    tasks: list[EvidenceTaskFull] = Field(default_factory=list)

    @field_validator("stale_reasons", "top_risks")
    @classmethod
    def stable_sort_simple_lists(cls, v: list[str]) -> list[str]:
        return sorted(list(dict.fromkeys(v or [])))


class SubmissionGateResult(BaseModel):
    """Result of submission gating check against a Defense Packet."""
    allowed: bool
    blocking_task_ids: list[str] = Field(default_factory=list)
    blocking_risk_codes: list[str] = Field(default_factory=list)
    missing_evidence_refs: list[str] = Field(default_factory=list)
    recommended_next_actions: list[str] = Field(default_factory=list)
    override_available: bool = False
    reason: str = ""


# ═══════════════════════════════════════════════════════════════════════════════
# DB Persistence Model (thin — matches predicate.defense_packets DDL)
# ═══════════════════════════════════════════════════════════════════════════════

class DefensePacketRecord(BaseModel):
    """Full defense packet row — matches predicate.defense_packets DDL."""

    id: str
    program_id: str
    subject_hash: str
    predicate_k_number: str

    risk_code_map_version: str
    risk_vocab_hash: str
    generator_version: str

    defense_readiness_score: int = Field(ge=0, le=100)
    top_risks: list[str] = Field(default_factory=list)

    tasks: list[dict[str, Any]] = Field(default_factory=list)
    se_payload: dict[str, Any] = Field(default_factory=dict)
    subject_device: dict[str, Any] = Field(default_factory=dict)
    risk_codes_used: list[str] = Field(default_factory=list)

    manifest_hash: str
    product_code: str = ""

    status: DefensePacketRenderStatus = "CREATED"
    staleness_reason: Optional[str] = None

    render_job_id: Optional[str] = None

    error_code: Optional[str] = None
    error_detail: Optional[str] = None

    created_by_user_id: str = "system"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    previous_packet_id: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════════
# API Request / Response Models (DB-backed endpoints)
# ═══════════════════════════════════════════════════════════════════════════════

class CreateDefensePacketRequest(BaseModel):
    """Request to create a defense packet."""
    program_id: str
    product_code: str = ""
    subject_device: dict[str, Any] = Field(default_factory=dict)
    selected_predicate_k_number: str
    selected_predicate: dict[str, Any] = Field(default_factory=dict)
    design_control_ids: dict[str, str] = Field(default_factory=dict)
    render: bool = True  # kick off render immediately
    created_by_user_id: str = "system"


class CreateDefensePacketResponse(BaseModel):
    """Response from creating a defense packet."""
    defense_packet_id: str
    manifest_hash: str
    defense_readiness_score: int = Field(ge=0, le=100)
    top_risks: list[str] = Field(default_factory=list)
    risk_codes_used: list[str] = Field(default_factory=list)
    tasks: list[dict[str, Any]] = Field(default_factory=list)
    render_job_id: Optional[str] = None
    status: DefensePacketRenderStatus = "CREATED"
    subject_hash: str = ""
    previous_packet_id: Optional[str] = None
    diff_summary: Optional[dict[str, Any]] = None  # populated when previous exists


class DefensePacketDiffSummary(BaseModel):
    """Diff between two defense packets."""
    previous_manifest_hash: str
    current_manifest_hash: str
    readiness_score_delta: int  # positive = improved
    risk_codes_added: list[str] = Field(default_factory=list)
    risk_codes_removed: list[str] = Field(default_factory=list)
    evidence_tasks_added: int = 0
    evidence_tasks_removed: int = 0
    top_risks_changed: bool = False


class StalenessCheckResult(BaseModel):
    """Result of a staleness check for a defense packet."""
    is_stale: bool
    reasons: list[str] = Field(default_factory=list)
    current_risk_vocab_hash: str = ""
    current_risk_code_map_version: str = ""
    packet_risk_vocab_hash: str = ""
    packet_risk_code_map_version: str = ""
