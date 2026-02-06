"""Pydantic models for the Evidence Fabric API."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# =============================================================================
# Claims
# =============================================================================

class CreateClaimRequest(BaseModel):
    """POST /evidence/claims"""
    program_id: UUID
    claim_type: str = Field(..., description="efficacy, safety, endpoint, regulatory, procedural")
    claim_text: str = Field(..., min_length=1, max_length=10000)
    structured: dict[str, Any] = Field(default_factory=dict)
    section_ref: Optional[str] = None
    supersedes_id: Optional[UUID] = None
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)


class ClaimResponse(BaseModel):
    id: UUID
    program_id: UUID
    claim_type: str
    claim_text: str
    structured: dict[str, Any] = {}
    section_ref: Optional[str] = None
    version: int = 1
    supersedes_id: Optional[UUID] = None
    status: str = "active"
    confidence: Optional[float] = None
    created_by: str = "system"
    created_at: datetime
    updated_at: datetime


class ClaimListResponse(BaseModel):
    claims: list[ClaimResponse]
    total: int


# =============================================================================
# Sources
# =============================================================================

class CreateSourceRequest(BaseModel):
    """POST /evidence/sources"""
    program_id: UUID
    source_type: str = Field(..., description="csr_section, guideline, dataset_row, model_output, literature, sap")
    source_ref: str = Field(..., min_length=1)
    source_uri: Optional[str] = None
    content: Optional[str] = Field(None, description="Raw content — hash is auto-computed")
    content_hash: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SourceResponse(BaseModel):
    id: UUID
    program_id: UUID
    source_type: str
    source_ref: str
    source_uri: Optional[str] = None
    content_hash: Optional[str] = None
    metadata: dict[str, Any] = {}
    captured_at: datetime
    created_at: datetime
    updated_at: datetime


class SourceListResponse(BaseModel):
    sources: list[SourceResponse]
    total: int


# =============================================================================
# Support links
# =============================================================================

class CreateSupportRequest(BaseModel):
    """POST /evidence/support"""
    claim_id: UUID
    source_id: UUID
    program_id: UUID
    support_type: str = Field(default="supports", description="supports, contradicts, qualifies, neutral")
    strength: float = Field(default=0.5, ge=0.0, le=1.0)
    span_start: Optional[int] = None
    span_end: Optional[int] = None
    annotation: Optional[str] = None


class SupportResponse(BaseModel):
    id: UUID
    claim_id: UUID
    source_id: UUID
    program_id: UUID
    support_type: str = "supports"
    strength: float = 0.5
    span_start: Optional[int] = None
    span_end: Optional[int] = None
    annotation: Optional[str] = None
    created_by: str = "system"
    created_at: datetime
    # Joined source fields (optional, from denormalized queries)
    source_type: Optional[str] = None
    source_ref: Optional[str] = None
    source_hash: Optional[str] = None


class SupportListResponse(BaseModel):
    supports: list[SupportResponse]
    total: int


# =============================================================================
# Derivations
# =============================================================================

class CreateDerivationRequest(BaseModel):
    """POST /evidence/derivations"""
    program_id: UUID
    derived_claim_id: UUID
    source_claim_id: UUID
    derivation_type: str = Field(default="inference", description="inference, aggregation, correction, contradiction, synthesis")
    reasoning: Optional[str] = None
    model_id: Optional[str] = None


class DerivationResponse(BaseModel):
    id: UUID
    program_id: UUID
    derived_claim_id: UUID
    source_claim_id: UUID
    derivation_type: str = "inference"
    reasoning: Optional[str] = None
    model_id: Optional[str] = None
    created_by: str = "system"
    created_at: datetime
    # Joined source claim fields (optional)
    source_claim_text: Optional[str] = None
    source_claim_type: Optional[str] = None
    source_confidence: Optional[float] = None


class DerivationChainItem(BaseModel):
    id: UUID
    derived_claim_id: UUID
    source_claim_id: UUID
    derivation_type: str
    reasoning: Optional[str] = None
    depth: int
    claim_text: Optional[str] = None
    claim_type: Optional[str] = None
    confidence: Optional[float] = None


# =============================================================================
# Provenance
# =============================================================================

class CreateProvenanceRequest(BaseModel):
    """POST /evidence/provenance"""
    program_id: UUID
    claim_id: Optional[UUID] = None
    source_id: Optional[UUID] = None
    workflow_run_id: Optional[UUID] = None
    step_run_id: Optional[UUID] = None
    batch_id: Optional[UUID] = None
    event_type: str = Field(..., description="claim_extracted, source_captured, claim_generated, claim_scored")
    actor: str = "system"
    request_id: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProvenanceResponse(BaseModel):
    id: UUID
    program_id: UUID
    claim_id: Optional[UUID] = None
    source_id: Optional[UUID] = None
    workflow_run_id: Optional[UUID] = None
    step_run_id: Optional[UUID] = None
    batch_id: Optional[UUID] = None
    event_type: str
    actor: str = "system"
    request_id: Optional[str] = None
    metadata: dict[str, Any] = {}
    created_at: datetime


class ProvenanceListResponse(BaseModel):
    provenance: list[ProvenanceResponse]
    total: int


# =============================================================================
# Hash Ledger
# =============================================================================

class HashEntryResponse(BaseModel):
    id: UUID
    program_id: UUID
    entity_type: str
    entity_id: UUID
    content_hash: str
    prev_hash: Optional[str] = None
    algorithm: str = "sha256"
    created_at: datetime


# =============================================================================
# Claim scoring (Phase 5.3 output)
# =============================================================================

class ClaimScoreBreakdown(BaseModel):
    """Detailed scoring breakdown for a claim."""
    claim_id: UUID
    source_count: int = 0
    contradiction_count: int = 0
    avg_source_strength: float = 0.0
    has_guideline_source: bool = False
    has_csr_source: bool = False
    has_dataset_source: bool = False
    recency_factor: float = 1.0
    computed_confidence: float = 0.0
    flags: list[str] = Field(default_factory=list)
