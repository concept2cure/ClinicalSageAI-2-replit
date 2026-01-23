"""
Pydantic models for Data Transparency and Long-Term Preservation.

Implements:
- EMA Policy 0070 compliance (Clinical Data Publication)
- Risk-based anonymization (0.09 threshold)
- PDF/A-3 validation and archiving
- GAMP 5 Infrastructure Qualification

References:
- EMA Policy 0070 (Clinical Data Publication)
- Health Canada PRCI (Public Release of Clinical Information)
- ISO 19005-3 (PDF/A-3)
- ISPE GAMP 5 Second Edition (2022)
"""
from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict


# =============================================================================
# Constants
# =============================================================================

class RiskThreshold:
    """Risk thresholds for various regulatory frameworks."""
    EMA_0070_THRESHOLD = 0.09  # EMA Policy 0070 re-identification threshold
    HEALTH_CANADA_THRESHOLD = 0.09  # Health Canada PRCI threshold
    K_ANONYMITY_MINIMUM = 5  # Minimum k for k-anonymity


# =============================================================================
# EMA Policy 0070 - Clinical Data Publication
# =============================================================================

class AnonymizationStatus(str, Enum):
    """Status of anonymization process."""
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED = "APPROVED"
    PUBLISHED = "PUBLISHED"
    REJECTED = "REJECTED"


class AnonymizationTechnique(str, Enum):
    """Techniques for data anonymization."""
    GENERALIZATION = "GENERALIZATION"  # Age 45 -> 40-50
    SUPPRESSION = "SUPPRESSION"  # Remove value entirely
    PSEUDONYMIZATION = "PSEUDONYMIZATION"  # Replace with consistent alias
    DATE_OFFSETTING = "DATE_OFFSETTING"  # Shift dates by random delta
    NOISE_ADDITION = "NOISE_ADDITION"  # Add statistical noise
    DATA_SWAPPING = "DATA_SWAPPING"  # Swap values between records
    AGGREGATION = "AGGREGATION"  # Combine into summary statistics
    REDACTION = "REDACTION"  # Black-box masking (discouraged)


class DataCategory(str, Enum):
    """Categories of clinical data for anonymization."""
    DIRECT_IDENTIFIER = "DIRECT_IDENTIFIER"  # Name, SSN, etc.
    QUASI_IDENTIFIER = "QUASI_IDENTIFIER"  # Age, ZIP, gender combinations
    SENSITIVE_ATTRIBUTE = "SENSITIVE_ATTRIBUTE"  # Medical conditions
    INSENSITIVE_ATTRIBUTE = "INSENSITIVE_ATTRIBUTE"  # Non-identifying data


class RiskMetric(BaseModel):
    """Re-identification risk metric per EMA Policy 0070."""
    metric_name: str = Field(..., description="Metric name (k-anonymity, l-diversity, etc.)")
    metric_value: float
    threshold: float = Field(0.09, description="Maximum acceptable risk")
    passes_threshold: bool
    description: str


class TransformationType(str, Enum):
    """Transformation types for anonymization."""
    GENERALIZATION = "GENERALIZATION"
    SUPPRESSION = "SUPPRESSION"
    TRUNCATION = "TRUNCATION"
    PSEUDONYMIZATION = "PSEUDONYMIZATION"
    MASKING = "MASKING"
    DATE_SHIFTING = "DATE_SHIFTING"
    NOISE_ADDITION = "NOISE_ADDITION"
    AGGREGATION = "AGGREGATION"


class AnonymizationTransformation(BaseModel):
    """Record of a specific anonymization transformation."""
    field_name: str
    original_type: str
    transformation_type: TransformationType
    parameters: Dict[str, Any] = Field(default_factory=dict)
    description: str
    data_category: DataCategory


class AnonymizationReport(BaseModel):
    """
    Anonymization report per EMA Policy 0070.
    
    Documents the methodology used to achieve the 0.09
    re-identification risk threshold.
    """
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    program_id: UUID
    dataset_id: UUID = Field(..., description="Dataset or clinical data ID")
    dataset_name: str
    version: str = "1.0"
    
    # Transformations applied
    transformations: List[AnonymizationTransformation]
    
    # Metrics
    risk_metrics: List[RiskMetric]
    
    # Risk assessment
    overall_risk_score: float = Field(..., ge=0, le=1)
    ema_0070_compliant: bool
    
    # Data utility impact
    methodology_description: str
    utility_impact_assessment: str
    
    # Audit
    created_at: datetime
    created_by: str
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    approved_for_publication: bool = False


class AnonymizationReportCreate(BaseModel):
    """Request to create an anonymization report."""
    program_id: UUID
    dataset_id: UUID
    dataset_name: str
    transformations: List[AnonymizationTransformation]
    methodology_description: str
    utility_impact_assessment: str
    created_by: str


class ClinicalDataPackage(BaseModel):
    """Clinical data package for transparency publication."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    program_id: UUID
    
    # Document identification
    document_type: str = Field(..., description="CSR, Protocol, etc.")
    document_title: str
    document_version: str
    
    # Regulatory context
    product_name: str
    marketing_authorization: Optional[str] = None
    agency: str = Field(..., description="EMA, Health Canada, etc.")
    
    # Anonymization
    anonymization_status: AnonymizationStatus
    anonymization_report_id: Optional[UUID] = None
    
    # Files
    original_file_hash: str
    anonymized_file_hash: Optional[str] = None
    
    # Lifecycle
    created_at: datetime
    created_by: str
    submitted_at: Optional[datetime] = None
    published_at: Optional[datetime] = None


# =============================================================================
# PDF/A-3 Archival Format
# =============================================================================

class PDFAConformanceLevel(str, Enum):
    """PDF/A conformance levels."""
    PDFA_1A = "PDF/A-1a"  # ISO 19005-1 Level A
    PDFA_1B = "PDF/A-1b"  # ISO 19005-1 Level B
    PDFA_2A = "PDF/A-2a"  # ISO 19005-2 Level A
    PDFA_2B = "PDF/A-2b"  # ISO 19005-2 Level B
    PDFA_2U = "PDF/A-2u"  # ISO 19005-2 Level U
    PDFA_3A = "PDF/A-3a"  # ISO 19005-3 Level A
    PDFA_3B = "PDF/A-3b"  # ISO 19005-3 Level B
    PDFA_3U = "PDF/A-3u"  # ISO 19005-3 Level U


class PDFAValidationStatus(str, Enum):
    """PDF/A validation status."""
    NOT_VALIDATED = "NOT_VALIDATED"
    VALID = "VALID"
    INVALID = "INVALID"
    VALIDATION_ERROR = "VALIDATION_ERROR"


class EmbeddedFileInfo(BaseModel):
    """Information about a file embedded in PDF/A-3."""
    filename: str
    mime_type: str
    description: str
    relationship: str = Field(..., description="e.g., 'Source', 'Data', 'Alternative'")
    size_bytes: Optional[int] = None
    hash_sha256: Optional[str] = None


class PDFAValidationResult(BaseModel):
    """Result of PDF/A validation."""
    model_config = ConfigDict(from_attributes=True)
    
    document_id: UUID
    
    # Validation
    is_valid: bool
    conformance_level: PDFAConformanceLevel
    validator_name: str
    validator_version: str
    validation_profile: str
    
    # Issues found
    errors: List[Dict[str, Any]] = Field(default_factory=list)
    warnings: List[Dict[str, Any]] = Field(default_factory=list)
    
    # Embedded files (PDF/A-3 only)
    embedded_file_validation: List[Dict[str, Any]] = Field(default_factory=list)
    
    # Metadata
    validated_at: datetime


class ArchivalDocument(BaseModel):
    """Long-term archival document with PDF/A compliance."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    program_id: UUID
    
    # Document info
    title: str
    document_type: str
    
    # File references
    source_file_path: Optional[str] = None
    pdfa_file_path: Optional[str] = None
    
    # PDF/A compliance
    conformance_level: PDFAConformanceLevel
    validation_status: str = "PENDING"
    validation_errors: List[str] = Field(default_factory=list)
    
    # Embedded data (PDF/A-3)
    embedded_files: List[EmbeddedFileInfo] = Field(default_factory=list)
    
    # Lifecycle
    created_at: datetime
    created_by: str
    converted_at: Optional[datetime] = None
    file_size_bytes: Optional[int] = None
    md5_hash: Optional[str] = None


# =============================================================================
# GAMP 5 Infrastructure Qualification
# =============================================================================

class GAMP5Category(str, Enum):
    """GAMP 5 software categories."""
    CAT_1 = "CATEGORY_1"  # Infrastructure Software (OS, DB)
    CAT_3 = "CATEGORY_3"  # Non-configurable COTS
    CAT_4 = "CATEGORY_4"  # Configurable COTS
    CAT_5 = "CATEGORY_5"  # Custom Applications


class ValidationApproach(str, Enum):
    """Validation approach based on GAMP category and risk."""
    VERIFICATION_ONLY = "VERIFICATION_ONLY"
    CONFIGURATION_TESTING = "CONFIGURATION_TESTING"
    REQUIREMENTS_BASED_TESTING = "REQUIREMENTS_BASED_TESTING"
    FULL_LIFECYCLE_VALIDATION = "FULL_LIFECYCLE_VALIDATION"


class InfrastructureType(str, Enum):
    """Types of infrastructure components."""
    COMPUTE = "COMPUTE"  # EC2, VMs
    DATABASE = "DATABASE"  # RDS, Cosmos
    STORAGE = "STORAGE"  # S3, Blob
    NETWORK = "NETWORK"  # VPC, Load Balancer
    CONTAINER = "CONTAINER"  # ECS, Kubernetes
    SERVERLESS = "SERVERLESS"  # Lambda, Functions
    IAM = "IAM"  # Identity and Access
    MONITORING = "MONITORING"  # CloudWatch, Prometheus


class IaCTool(str, Enum):
    """Infrastructure as Code tools."""
    TERRAFORM = "TERRAFORM"
    CLOUDFORMATION = "CLOUDFORMATION"
    PULUMI = "PULUMI"
    ARM = "ARM"  # Azure Resource Manager
    ANSIBLE = "ANSIBLE"


class ComponentCategory(str, Enum):
    """GAMP 5 component categories."""
    CATEGORY_1 = "CATEGORY_1"
    CATEGORY_3 = "CATEGORY_3"
    CATEGORY_4 = "CATEGORY_4"
    CATEGORY_5 = "CATEGORY_5"


class IaCProvider(str, Enum):
    """Infrastructure as Code providers."""
    TERRAFORM = "TERRAFORM"
    PULUMI = "PULUMI"
    CLOUDFORMATION = "CLOUDFORMATION"
    KUBERNETES = "KUBERNETES"
    ANSIBLE = "ANSIBLE"
    ARM = "ARM"


class PolicyStatus(str, Enum):
    """Status of a GxP policy."""
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    DEPRECATED = "DEPRECATED"
    RETIRED = "RETIRED"


class PolicyCheckResult(BaseModel):
    """Result of a Policy as Code check."""
    policy_id: Optional[UUID] = None
    policy_name: str
    passed: bool
    message: str
    severity: str = Field(..., description="HIGH, MEDIUM, LOW")
    resource_path: Optional[str] = None


class InfrastructureComponent(BaseModel):
    """Infrastructure component for GAMP 5 qualification."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    program_id: UUID
    
    # Identification
    name: str
    component_type: str
    version: str
    
    # GAMP 5 classification
    gamp_category: ComponentCategory
    validation_approach: ValidationApproach
    
    # IaC tracking
    iac_provider: Optional[IaCProvider] = None
    iac_configuration_path: Optional[str] = None
    
    # GxP impact
    gxp_impact: str
    data_integrity_impact: str
    
    # Qualification status
    qualification_status: str = "PENDING"
    last_validation_date: Optional[datetime] = None
    next_validation_due: Optional[datetime] = None
    
    # Lifecycle
    created_at: datetime
    created_by: str


class IaCValidationRun(BaseModel):
    """Record of an Infrastructure as Code validation run."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    program_id: UUID
    component_id: Optional[UUID] = None
    
    # IaC context
    iac_provider: IaCProvider
    configuration_path: Optional[str] = None
    git_commit_sha: Optional[str] = None
    
    # Policy as Code results
    policy_results: List[PolicyCheckResult]
    
    # Drift detection
    drift_detected: bool = False
    drift_details: Optional[str] = None
    
    # Results
    passed_checks: int
    failed_checks: int
    overall_status: str  # PASSED, PASSED_WITH_WARNINGS, FAILED
    
    # Execution
    executed_at: datetime
    executed_by: str
    duration_seconds: Optional[int] = None


class IaCValidationCreate(BaseModel):
    """Request to record an IaC validation run."""
    program_id: UUID
    iac_tool: IaCTool
    repository: str
    commit_hash: str
    branch: str
    policy_results: List[PolicyCheckResult]


# =============================================================================
# GxP Policy Definitions (for OPA)
# =============================================================================

class GxPPolicy(BaseModel):
    """GxP policy definition for Policy as Code."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    program_id: UUID
    name: str
    description: str
    category: str
    severity: str
    
    # Policy details
    rego_policy: str = Field(..., description="OPA Rego policy code")
    
    # Applicability
    applicable_providers: List[str] = Field(default_factory=list)
    
    # Regulatory reference
    regulatory_reference: Optional[str] = None
    
    # Status
    status: PolicyStatus
    version: str = "1.0"
    
    # Lifecycle
    created_at: datetime
    created_by: str
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None


class GxPPolicyCreate(BaseModel):
    """Request to create a GxP policy."""
    program_id: UUID
    name: str
    description: str
    category: str
    severity: str
    rego_policy: str
    applicable_providers: List[str] = Field(default_factory=list)
    regulatory_reference: Optional[str] = None
    created_by: str


# =============================================================================
# Additional Enums and Types for Router Compatibility
# =============================================================================

class TransformationType(str, Enum):
    """Types of anonymization transformations."""
    GENERALIZATION = "GENERALIZATION"
    SUPPRESSION = "SUPPRESSION"
    PSEUDONYMIZATION = "PSEUDONYMIZATION"
    TRUNCATION = "TRUNCATION"
    NOISE_ADDITION = "NOISE_ADDITION"
    DATE_OFFSETTING = "DATE_OFFSETTING"
    AGGREGATION = "AGGREGATION"
    NONE = "NONE"


class ClinicalDataPackageCreate(BaseModel):
    """Request to create a clinical data package."""
    program_id: UUID
    study_id: UUID
    study_name: str
    package_type: str
    datasets: List[Dict[str, Any]] = Field(default_factory=list)
    anonymization_report_ids: List[UUID] = Field(default_factory=list)
    created_by: str


class ArchivalDocumentCreate(BaseModel):
    """Request to create an archival document."""
    program_id: UUID
    document_type: str
    title: str
    source_file_path: Optional[str] = None
    conformance_level: PDFAConformanceLevel
    embedded_files: Optional[List[Dict[str, Any]]] = None
    created_by: str


class InfrastructureComponentCreate(BaseModel):
    """Request to create an infrastructure component."""
    program_id: UUID
    name: str
    component_type: str
    version: str
    gamp_category: ComponentCategory
    iac_provider: Optional[IaCProvider] = None
    iac_configuration_path: Optional[str] = None
    gxp_impact: str
    data_integrity_impact: str
    created_by: str


class IaCValidationRunCreate(BaseModel):
    """Request to create an IaC validation run."""
    program_id: UUID
    component_id: Optional[UUID] = None
    iac_provider: IaCProvider
    configuration_path: Optional[str] = None
    git_commit_sha: Optional[str] = None
    executed_by: str


# =============================================================================
# Dashboard Models
# =============================================================================

class TransparencyDashboard(BaseModel):
    """Data transparency compliance dashboard."""
    
    # Anonymization summary
    total_datasets: int
    datasets_anonymized: int
    datasets_pending_anonymization: int
    ema_0070_compliant_datasets: int
    average_risk_score: float
    
    # Data packages
    data_packages_draft: int
    data_packages_submitted: int
    data_packages_published: int
    
    # Archival
    documents_pending_conversion: int
    documents_validated: int
    documents_failed_validation: int
    
    # Recent activity
    recent_anonymization_reports: List[Dict[str, Any]]
    
    # Alerts
    alerts: List[Dict[str, Any]]
    
    generated_at: datetime


class InfrastructureComplianceDashboard(BaseModel):
    """Infrastructure compliance dashboard."""
    
    # Component summary
    total_components: int
    components_qualified: int
    components_pending_qualification: int
    components_overdue_requalification: int
    
    # By GAMP category
    by_gamp_category: Dict[str, Any]
    
    # IaC validation
    iac_validations_last_30d: int
    iac_validations_passed: int
    iac_validations_failed: int
    drift_incidents_detected: int
    
    # Policy compliance
    active_policies: int
    policy_violations_open: int
    policy_violations_resolved_30d: int
    
    # Recent validation runs
    recent_validation_runs: List[Dict[str, Any]]
    
    # Alerts
    alerts: List[Dict[str, Any]]
    
    generated_at: datetime
