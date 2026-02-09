"""Pydantic models for the FDA 510(k) Predicate Universe — Phase 6.6.A.

Covers: product codes, clearances, safety signals, embeddings metadata,
        lineage graph, and ingestion job status.
"""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────────────────────
# Enums
# ─────────────────────────────────────────────────────────────────────────────

class DecisionCode(str, Enum):
    SE = "SE"
    NSE = "NSE"
    SESE = "SESE"
    PANEL_TRACK = "PanelTrack"


class ClearanceType(str, Enum):
    TRADITIONAL = "Traditional"
    SPECIAL = "Special"
    ABBREVIATED = "Abbreviated"
    DE_NOVO = "De_Novo"


class SignalType(str, Enum):
    CLASS1_RECALL = "Class1Recall"
    CLASS2_RECALL = "Class2Recall"
    CLASS3_RECALL = "Class3Recall"
    MDR_REPORT = "MDRReport"
    SAFETY_COMMUNICATION = "SafetyCommunication"
    WARNING_483 = "483Warning"
    SEIZURE = "Seizure"
    WARNING_LETTER = "WarningLetter"


class RelationshipType(str, Enum):
    DIRECT_PREDICATE = "DirectPredicate"
    GRANDPARENT = "Grandparent"
    SIBLING = "Sibling"


class DeviceClass(str, Enum):
    CLASS_1 = "1"
    CLASS_2 = "2"
    CLASS_3 = "3"


class StrategyRecommendation(str, Enum):
    CONSERVATIVE = "CONSERVATIVE"
    AGGRESSIVE = "AGGRESSIVE"
    BALANCED = "BALANCED"
    RISKY = "RISKY"
    AVOID = "AVOID"


class LineageSafety(str, Enum):
    CLEAN = "CLEAN"
    COMPROMISED = "COMPROMISED"
    UNKNOWN = "UNKNOWN"


# ─────────────────────────────────────────────────────────────────────────────
# Product Codes
# ─────────────────────────────────────────────────────────────────────────────

class FDAProductCode(BaseModel):
    code: str
    device_class: Optional[str] = None
    regulation_number: Optional[str] = None
    review_panel: Optional[str] = None
    name: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ─────────────────────────────────────────────────────────────────────────────
# 510(k) Clearances
# ─────────────────────────────────────────────────────────────────────────────

class FDA510kClearance(BaseModel):
    k_number: str
    applicant: Optional[str] = None
    device_name: str
    product_code: Optional[str] = None
    decision_date: Optional[date] = None
    decision_code: Optional[str] = None
    summary_url: Optional[str] = None
    clearance_type: Optional[str] = None
    txt_content: Optional[str] = None
    statement_or_summary: Optional[str] = None
    third_party_review: bool = False
    expedited_review: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class FDA510kClearanceCreate(BaseModel):
    k_number: str = Field(..., pattern=r"^K\d{6}$")
    applicant: Optional[str] = None
    device_name: str
    product_code: Optional[str] = None
    decision_date: Optional[date] = None
    decision_code: Optional[str] = None
    summary_url: Optional[str] = None
    clearance_type: Optional[str] = None
    txt_content: Optional[str] = None
    statement_or_summary: Optional[str] = None
    third_party_review: bool = False
    expedited_review: bool = False


# ─────────────────────────────────────────────────────────────────────────────
# Safety Signals
# ─────────────────────────────────────────────────────────────────────────────

class SafetySignal(BaseModel):
    id: UUID
    k_number: str
    signal_type: str
    signal_date: Optional[date] = None
    description: Optional[str] = None
    severity_score: float = Field(..., ge=0.0, le=1.0)
    source_url: Optional[str] = None
    recall_number: Optional[str] = None
    event_id: Optional[str] = None
    created_at: Optional[datetime] = None


class SafetySignalCreate(BaseModel):
    k_number: str
    signal_type: SignalType
    signal_date: Optional[date] = None
    description: Optional[str] = None
    severity_score: float = Field(..., ge=0.0, le=1.0)
    source_url: Optional[str] = None
    recall_number: Optional[str] = None
    event_id: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Embeddings Metadata
# ─────────────────────────────────────────────────────────────────────────────

class EmbeddingRecord(BaseModel):
    k_number: str
    content_hash: Optional[str] = None
    model_version: str = "text-embedding-3-large"
    updated_at: Optional[datetime] = None


# ─────────────────────────────────────────────────────────────────────────────
# Lineage
# ─────────────────────────────────────────────────────────────────────────────

class PredicateLineage(BaseModel):
    child_k_number: str
    parent_k_number: str
    relationship_type: str
    lineage_distance: int = 1
    source: str = "summary_parse"
    created_at: Optional[datetime] = None


class PredicateLineageCreate(BaseModel):
    child_k_number: str
    parent_k_number: str
    relationship_type: RelationshipType
    lineage_distance: int = Field(default=1, ge=1, le=10)
    source: str = "summary_parse"


class LineageNode(BaseModel):
    """Node in the Golden Bridge lineage graph."""
    k_number: str
    device_name: Optional[str] = None
    applicant: Optional[str] = None
    product_code: Optional[str] = None
    decision_date: Optional[date] = None
    relationship_type: Optional[str] = None
    lineage_distance: int = 0
    depth: int = 0


# ─────────────────────────────────────────────────────────────────────────────
# Strategy Score (Phase 6.6.B integration)
# ─────────────────────────────────────────────────────────────────────────────

class StrategyScore(BaseModel):
    """The composite strategy score for a predicate candidate."""
    similarity_score: float = Field(default=0.0, ge=0.0, le=1.0)
    toxicity_score: float = Field(default=0.0, ge=0.0, le=1.0)
    lineage_safety: LineageSafety = LineageSafety.UNKNOWN
    strategy: StrategyRecommendation = StrategyRecommendation.BALANCED
    explanation: str = ""
    family_recall_count: int = 0
    age_years: float = 0.0


class PredicateSuggestion(BaseModel):
    """A ranked predicate suggestion returned by the strategy engine."""
    k_number: str
    device_name: str
    applicant: Optional[str] = None
    clearance_date: Optional[date] = None
    product_code: Optional[str] = None
    similarity_score: float = Field(default=0.0, ge=0.0, le=1.0)
    toxicity_score: float = Field(default=0.0, ge=0.0, le=1.0)
    lineage_safety: str = "UNKNOWN"
    strategy_recommendation: str = "BALANCED"
    reasoning: str = ""
    composite_score: float = 0.0
    semantic_distance: Optional[float] = None


class PredicateSuggestRequest(BaseModel):
    """Request payload for POST /device/predicate-suggest."""
    program_id: UUID
    product_code: str
    intended_use: str
    technology: Optional[str] = None
    materials: Optional[str] = None
    energy_source: Optional[str] = None
    tissue_contact: Optional[str] = None
    sterilization: Optional[str] = None
    max_results: int = Field(default=5, ge=1, le=20)


class PredicateSuggestResponse(BaseModel):
    """Response for POST /device/predicate-suggest."""
    suggestions: list[PredicateSuggestion]
    subject_device_hash: str
    total_candidates_evaluated: int = 0
    generated_at: str


# ─────────────────────────────────────────────────────────────────────────────
# Ingestion Job Status
# ─────────────────────────────────────────────────────────────────────────────

class IngestionStatus(BaseModel):
    """Status of an FDA data ingestion run."""
    job_name: str
    status: str  # "running", "completed", "failed"
    started_at: datetime
    completed_at: Optional[datetime] = None
    records_processed: int = 0
    records_inserted: int = 0
    records_updated: int = 0
    errors: list[str] = Field(default_factory=list)
    duration_seconds: Optional[float] = None


class ToxicPredicate(BaseModel):
    """Materialized view row for toxic predicates."""
    k_number: str
    device_name: str
    product_code: Optional[str] = None
    decision_date: Optional[date] = None
    max_severity: float
    signal_count: int
    signal_types: list[str] = Field(default_factory=list)
