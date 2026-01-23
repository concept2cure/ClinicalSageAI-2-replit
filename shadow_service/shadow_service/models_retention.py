"""
Pydantic models for retention, legal hold, and archive operations.
"""
from datetime import datetime, date
from typing import Optional, List, Any
from uuid import UUID
from enum import Enum
from pydantic import BaseModel, Field


class RetentionBasis(str, Enum):
    RECORD_DATE = "record_date"
    STUDY_COMPLETION = "study_completion"
    APPROVAL_DATE = "approval_date"
    LAST_SALE = "last_sale"
    CUSTOM = "custom"


class RetentionPolicy(BaseModel):
    id: UUID
    policy_code: str
    policy_name: str
    description: Optional[str] = None
    target_schema: str
    target_table: str
    retention_years: int
    retention_basis: RetentionBasis
    archive_eligible: bool = True
    archive_destination: Optional[str] = None
    destruction_allowed: bool = False
    destruction_approval_required: bool = True
    is_active: bool = True
    created_at: datetime
    created_by: str
    updated_at: Optional[datetime] = None


class RetentionPolicyCreate(BaseModel):
    policy_code: str = Field(..., min_length=1, max_length=50)
    policy_name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    target_schema: str = Field(..., min_length=1, max_length=50)
    target_table: str = Field(..., min_length=1, max_length=100)
    retention_years: int = Field(..., ge=1, le=100)
    retention_basis: RetentionBasis = RetentionBasis.RECORD_DATE
    archive_eligible: bool = True
    archive_destination: Optional[str] = None
    destruction_allowed: bool = False
    destruction_approval_required: bool = True


class LegalHold(BaseModel):
    id: UUID
    hold_code: str
    hold_name: str
    description: Optional[str] = None
    legal_matter_reference: Optional[str] = None
    custodian: str
    scope_schema: Optional[str] = None
    scope_table: Optional[str] = None
    scope_filter: Optional[str] = None
    program_id: Optional[UUID] = None
    program_code: Optional[str] = None
    hold_start: datetime
    hold_end: Optional[datetime] = None
    is_active: bool
    release_reason: Optional[str] = None
    created_at: datetime
    created_by: str


class LegalHoldCreate(BaseModel):
    hold_code: str = Field(..., min_length=1, max_length=50)
    hold_name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    legal_matter_reference: Optional[str] = None
    custodian: str = Field(..., min_length=1, max_length=200)
    scope_schema: Optional[str] = None
    scope_table: Optional[str] = None
    scope_filter: Optional[str] = None
    program_id: Optional[UUID] = None
    hold_start: Optional[datetime] = None
    hold_end: Optional[datetime] = None


class LegalHoldRelease(BaseModel):
    release_reason: str = Field(..., min_length=1, max_length=500)


class ArchiveManifest(BaseModel):
    id: UUID
    sequence_number: int
    entity_type: str
    entity_id: UUID
    entity_label: Optional[str] = None
    archive_reason: str
    content_sha256: str
    manifest_sha256: str
    archive_location: str
    program_id: Optional[UUID] = None
    program_code: Optional[str] = None
    archived_at: datetime
    archived_by: str
    previous_manifest_id: Optional[UUID] = None
    previous_manifest_hash: Optional[str] = None


class ChainVerificationResult(BaseModel):
    sequence_number: int
    manifest_id: UUID
    manifest_sha256: str
    previous_manifest_hash: Optional[str] = None
    actual_prev_hash: Optional[str] = None
    chain_valid: bool


class ArchiveEligible(BaseModel):
    entity_type: str
    entity_id: UUID
    entity_label: Optional[str] = None
    program_id: Optional[UUID] = None
    created_at: datetime
    retention_until: Optional[date] = None
    is_eligible: bool
    hold_blocked: bool


class HoldCheckResult(BaseModel):
    schema_name: str
    table_name: str
    program_id: Optional[UUID] = None
    is_under_hold: bool


# --- List Response Models ---

class RetentionPolicyList(BaseModel):
    items: List[RetentionPolicy]
    count: int


class LegalHoldList(BaseModel):
    items: List[LegalHold]
    count: int


class ArchiveManifestList(BaseModel):
    items: List[ArchiveManifest]
    count: int


class ChainVerificationList(BaseModel):
    items: List[ChainVerificationResult]
    all_valid: bool
