"""Pydantic models for Phase 6.6.D — Defense Packets.

First-class compliance artifact: versioned, signed, lifecycle-managed.
The "receipt" that links SE Matrix → Evidence Tasks → DOCX → eCTD → Truth Machine.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════════════════════════
# Status Lifecycle
# ═══════════════════════════════════════════════════════════════════════════════

DefensePacketStatus = Literal["CREATED", "RENDERING", "RENDERED", "FAILED", "STALE"]

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
# Defense Packet Model
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

    status: DefensePacketStatus = "CREATED"
    staleness_reason: Optional[str] = None

    render_job_id: Optional[str] = None

    error_code: Optional[str] = None
    error_detail: Optional[str] = None

    created_by_user_id: str = "system"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    previous_packet_id: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════════
# API Request / Response Models
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
    status: DefensePacketStatus = "CREATED"
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
