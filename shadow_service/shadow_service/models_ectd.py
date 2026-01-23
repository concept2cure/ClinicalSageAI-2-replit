"""
Pydantic models for eCTD submission package operations.
"""
from datetime import datetime, date
from typing import Optional, List, Any, Dict
from uuid import UUID
from enum import Enum
from pydantic import BaseModel, Field


class PackageStatus(str, Enum):
    DRAFT = "DRAFT"
    ASSEMBLING = "ASSEMBLING"
    VALIDATING = "VALIDATING"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    READY = "READY"
    DELIVERED = "DELIVERED"
    ACKNOWLEDGED = "ACKNOWLEDGED"


class PackageType(str, Enum):
    ORIGINAL = "ORIGINAL"
    AMENDMENT = "AMENDMENT"
    SUPPLEMENT = "SUPPLEMENT"
    RESPONSE = "RESPONSE"


class DocumentStatus(str, Enum):
    PENDING = "PENDING"
    GENERATING = "GENERATING"
    VALIDATING = "VALIDATING"
    READY = "READY"
    FAILED = "FAILED"


class DeliveryStatus(str, Enum):
    INITIATED = "INITIATED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    RETRYING = "RETRYING"


class ECTDOperation(str, Enum):
    NEW = "new"
    REPLACE = "replace"
    APPEND = "append"
    DELETE = "delete"


class ValidationSeverity(str, Enum):
    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"


# --- Module Structure ---

class ModuleStructure(BaseModel):
    id: UUID
    module_code: str
    module_name: str
    parent_module_code: Optional[str] = None
    module_level: int
    is_regional: bool = False
    content_type: Optional[str] = None
    is_required: bool = False
    allowed_file_types: List[str] = []
    fda_specific: bool = False
    ema_specific: bool = False
    pmda_specific: bool = False
    description: Optional[str] = None
    guidance_reference: Optional[str] = None


# --- Submission Packages ---

class SubmissionPackage(BaseModel):
    id: UUID
    package_code: str
    package_name: str
    submission_id: Optional[UUID] = None
    submission_code: Optional[str] = None
    sequence_number: int
    agency_code: str
    package_type: PackageType
    status: PackageStatus
    is_validated: bool = False
    validated_at: Optional[datetime] = None
    validated_by: Optional[str] = None
    snapshot_id: Optional[UUID] = None
    export_id: Optional[UUID] = None
    manifest_sha256: Optional[str] = None
    delivered_at: Optional[datetime] = None
    delivered_by: Optional[str] = None
    delivery_method: Optional[str] = None
    delivery_confirmation: Optional[str] = None
    program_id: Optional[UUID] = None
    program_code: Optional[str] = None
    document_count: int = 0
    error_count: int = 0
    created_at: datetime
    created_by: str
    updated_at: Optional[datetime] = None


class SubmissionPackageCreate(BaseModel):
    package_code: str = Field(..., min_length=1, max_length=50)
    package_name: str = Field(..., min_length=1, max_length=300)
    submission_id: Optional[UUID] = None
    sequence_number: Optional[int] = None
    agency_code: str = Field(..., min_length=1, max_length=20)
    package_type: Optional[PackageType] = PackageType.ORIGINAL
    snapshot_id: Optional[UUID] = None
    program_id: Optional[UUID] = None


class PackageStatusUpdate(BaseModel):
    status: PackageStatus


class PackageDelivered(BaseModel):
    delivery_method: str = Field(..., min_length=1, max_length=50)
    delivery_confirmation: Optional[str] = None


# --- Package Documents ---

class PackageDocument(BaseModel):
    id: UUID
    package_id: UUID
    module_code: str
    module_name: Optional[str] = None
    module_level: Optional[int] = None
    document_title: str
    file_name: str
    file_type: str
    source_type: str
    source_fragment_id: Optional[UUID] = None
    source_snapshot_id: Optional[UUID] = None
    content_sha256: Optional[str] = None
    file_size_bytes: Optional[int] = None
    page_count: Optional[int] = None
    ectd_operation: ECTDOperation = ECTDOperation.NEW
    ectd_leaf_id: Optional[str] = None
    status: DocumentStatus
    sequence_order: int
    created_at: datetime
    created_by: str


class PackageDocumentCreate(BaseModel):
    package_id: UUID
    module_code: str = Field(..., min_length=1, max_length=20)
    document_title: str = Field(..., min_length=1, max_length=500)
    file_name: str = Field(..., min_length=1, max_length=255)
    file_type: str = Field(..., min_length=1, max_length=20)
    source_type: str = Field(..., min_length=1, max_length=50)
    source_fragment_id: Optional[UUID] = None
    source_version_id: Optional[UUID] = None
    source_snapshot_id: Optional[UUID] = None
    source_export_id: Optional[UUID] = None
    content_sha256: Optional[str] = None
    file_size_bytes: Optional[int] = None
    page_count: Optional[int] = None
    ectd_operation: Optional[ECTDOperation] = ECTDOperation.NEW
    ectd_leaf_id: Optional[str] = None
    status: Optional[DocumentStatus] = DocumentStatus.PENDING
    sequence_order: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None


class DocumentStatusUpdate(BaseModel):
    status: DocumentStatus


class ModuleCompletion(BaseModel):
    module_code: str
    module_name: str
    module_level: int
    is_required: bool
    document_count: int
    completion_status: str  # POPULATED, MISSING, OPTIONAL


# --- Validation ---

class ValidationRule(BaseModel):
    id: UUID
    rule_code: str
    rule_name: str
    agency_code: Optional[str] = None
    module_code: Optional[str] = None
    rule_type: str
    severity: ValidationSeverity
    rule_expression: Optional[str] = None
    error_message: str
    guidance_reference: Optional[str] = None
    is_active: bool = True


class ValidationResult(BaseModel):
    id: UUID
    package_id: UUID
    document_id: Optional[UUID] = None
    rule_id: UUID
    rule_code: Optional[str] = None
    rule_name: Optional[str] = None
    passed: bool
    severity: ValidationSeverity
    message: str
    details: Optional[Dict[str, Any]] = None
    validated_at: datetime
    document_title: Optional[str] = None
    module_code: Optional[str] = None


class ValidationResultCreate(BaseModel):
    package_id: UUID
    document_id: Optional[UUID] = None
    rule_id: UUID
    passed: bool
    severity: ValidationSeverity
    message: str
    details: Optional[Dict[str, Any]] = None


# --- Delivery ---

class DeliveryRecord(BaseModel):
    id: UUID
    package_id: UUID
    package_code: Optional[str] = None
    delivery_method: str
    delivery_destination: str
    status: DeliveryStatus
    initiated_at: datetime
    completed_at: Optional[datetime] = None
    confirmation_number: Optional[str] = None
    agency_receipt_number: Optional[str] = None
    acknowledgment_received: bool = False
    acknowledgment_at: Optional[datetime] = None
    error_message: Optional[str] = None
    retry_count: int = 0
    transfer_size_bytes: Optional[int] = None
    transfer_duration_seconds: Optional[int] = None
    delivered_by: str


class DeliveryRecordCreate(BaseModel):
    package_id: UUID
    delivery_method: str = Field(..., min_length=1, max_length=50)
    delivery_destination: str = Field(..., min_length=1, max_length=255)


class DeliveryStatusUpdate(BaseModel):
    status: DeliveryStatus
    confirmation_number: Optional[str] = None
    agency_receipt_number: Optional[str] = None
    error_message: Optional[str] = None
    transfer_size_bytes: Optional[int] = None
    transfer_duration_seconds: Optional[int] = None


# --- List Response Models ---

class ModuleStructureList(BaseModel):
    items: List[ModuleStructure]
    count: int


class SubmissionPackageList(BaseModel):
    items: List[SubmissionPackage]
    count: int


class PackageDocumentList(BaseModel):
    items: List[PackageDocument]
    count: int


class ModuleCompletionList(BaseModel):
    package_id: UUID
    items: List[ModuleCompletion]
    missing_required_count: int


class ValidationRuleList(BaseModel):
    items: List[ValidationRule]
    count: int


class ValidationResultList(BaseModel):
    package_id: UUID
    items: List[ValidationResult]
    error_count: int
    warning_count: int
    passed: bool


class DeliveryRecordList(BaseModel):
    items: List[DeliveryRecord]
    count: int
