"""
Pydantic models for Cybersecurity Compliance - SBOM, VEX, and Section 524B.

Implements:
- Software Bill of Materials (SBOM) per NTIA minimum elements
- Vulnerability Exploitability Exchange (VEX) for vulnerability management
- FDA Section 524B "Cyber Device" compliance tracking

References:
- FD&C Act Section 524B (Consolidated Appropriations Act, 2023)
- NTIA SBOM Minimum Elements
- SPDX (ISO/IEC 5962) and CycloneDX (OWASP) specifications
- CISA VEX specification
"""
from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict


# =============================================================================
# SBOM - Software Bill of Materials
# =============================================================================

class SBOMFormat(str, Enum):
    """Supported SBOM formats."""
    SPDX_JSON = "SPDX_JSON"  # ISO/IEC 5962
    SPDX_RDF = "SPDX_RDF"
    SPDX_TAG_VALUE = "SPDX_TAG_VALUE"
    CYCLONEDX_JSON = "CYCLONEDX_JSON"  # OWASP
    CYCLONEDX_XML = "CYCLONEDX_XML"


class ComponentType(str, Enum):
    """Types of software components."""
    APPLICATION = "APPLICATION"
    FRAMEWORK = "FRAMEWORK"
    LIBRARY = "LIBRARY"
    CONTAINER = "CONTAINER"
    OPERATING_SYSTEM = "OPERATING_SYSTEM"
    DEVICE = "DEVICE"
    FIRMWARE = "FIRMWARE"
    FILE = "FILE"


class DependencyRelationship(str, Enum):
    """How components relate to each other."""
    DYNAMIC_LINK = "DYNAMIC_LINK"
    STATIC_LINK = "STATIC_LINK"
    CONTAINS = "CONTAINS"
    BUILD_DEPENDENCY = "BUILD_DEPENDENCY"
    DEV_DEPENDENCY = "DEV_DEPENDENCY"
    OPTIONAL_DEPENDENCY = "OPTIONAL_DEPENDENCY"
    PROVIDED_DEPENDENCY = "PROVIDED_DEPENDENCY"
    TEST_DEPENDENCY = "TEST_DEPENDENCY"
    RUNTIME_DEPENDENCY = "RUNTIME_DEPENDENCY"
    DEPENDS_ON = "DEPENDS_ON"


class SBOMComponent(BaseModel):
    """
    Individual software component in SBOM.
    
    Meets NTIA Minimum Elements:
    - Supplier Name
    - Component Name  
    - Version
    - Other Unique Identifiers (CPE, PURL)
    - Dependency Relationship
    """
    # NTIA Required Fields
    supplier_name: str = Field(..., description="Organization that created/maintains component")
    component_name: str = Field(..., description="Name of the component")
    version: str = Field(..., description="Version identifier")
    
    # Unique Identifiers
    cpe: Optional[str] = Field(None, description="Common Platform Enumeration")
    purl: Optional[str] = Field(None, description="Package URL")
    swid: Optional[str] = Field(None, description="Software Identification Tag")
    
    # Additional metadata
    component_type: ComponentType = Field(default=ComponentType.LIBRARY)
    license_id: Optional[str] = Field(None, description="SPDX License ID")
    license_name: Optional[str] = Field(None, description="License name if not in SPDX list")
    
    # Hashes for integrity
    sha256: Optional[str] = None
    sha1: Optional[str] = None
    md5: Optional[str] = None
    
    # Source information
    download_location: Optional[str] = None
    homepage: Optional[str] = None
    source_repo: Optional[str] = None
    
    # Flags
    is_modified: bool = Field(False, description="Whether component was modified from original")
    is_proprietary: bool = Field(False, description="Proprietary/closed-source component")


class SBOMDependency(BaseModel):
    """Dependency relationship between components."""
    from_component: str = Field(..., description="Component name (source)")
    to_component: str = Field(..., description="Component name (target)")
    relationship: DependencyRelationship
    scope: Optional[str] = Field(None, description="e.g., 'compile', 'runtime', 'test'")


class SBOMValidationResult(BaseModel):
    """Result of SBOM validation."""
    is_valid: bool
    format_compliant: bool = Field(..., description="Meets format spec (SPDX/CycloneDX)")
    ntia_compliant: bool = Field(..., description="Meets NTIA minimum elements")
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    validated_at: datetime


class SBOM(BaseModel):
    """
    Complete Software Bill of Materials.
    
    Compliant with:
    - NTIA Minimum Elements
    - SPDX 2.3 / CycloneDX 1.4+
    - FDA Section 524B requirements
    """
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    program_id: UUID
    device_id: Optional[UUID] = Field(None, description="Associated medical device/SaMD")
    
    # SBOM metadata
    sbom_format: SBOMFormat
    spec_version: str = Field(..., description="e.g., 'SPDX-2.3' or 'CycloneDX-1.5'")
    serial_number: str = Field(..., description="Unique SBOM identifier")
    name: str = Field(..., description="Name of the software being described")
    version: str = Field(..., description="Version of the software")
    
    # NTIA Required: Author of SBOM Data
    sbom_author: str = Field(..., description="Organization/person who created this SBOM")
    sbom_author_email: Optional[str] = None
    
    # NTIA Required: Timestamp
    created_at: datetime
    
    # Components
    components: List[SBOMComponent]
    dependencies: List[SBOMDependency] = Field(default_factory=list)
    
    # Validation
    validation_result: Optional[SBOMValidationResult] = None
    
    # Lifecycle
    generation_tool: str = Field(..., description="Tool used to generate SBOM")
    generation_tool_version: str
    is_machine_generated: bool = Field(True)
    
    # FDA compliance tracking
    fda_submission_ready: bool = Field(False)
    last_vulnerability_scan: Optional[datetime] = None
    critical_vulnerabilities: int = Field(0)
    high_vulnerabilities: int = Field(0)


class SBOMCreate(BaseModel):
    """Request to create/upload an SBOM."""
    program_id: UUID
    device_id: Optional[UUID] = None
    sbom_format: SBOMFormat
    spec_version: str
    name: str
    version: str
    sbom_author: str
    sbom_author_email: Optional[str] = None
    components: List[SBOMComponent]
    dependencies: List[SBOMDependency] = Field(default_factory=list)
    generation_tool: str
    generation_tool_version: str


class SBOMSummary(BaseModel):
    """Summary view for SBOM listings."""
    id: UUID
    name: str
    version: str
    sbom_format: SBOMFormat
    component_count: int
    is_valid: bool
    critical_vulnerabilities: int
    high_vulnerabilities: int
    created_at: datetime


class SBOMList(BaseModel):
    """Paginated list of SBOMs."""
    items: List[SBOMSummary]
    count: int
    total: int


# =============================================================================
# VEX - Vulnerability Exploitability Exchange
# =============================================================================

class VulnerabilityStatus(str, Enum):
    """
    VEX status values per CISA specification.
    
    - NOT_AFFECTED: Vulnerability present but not exploitable
    - AFFECTED: Vulnerability is exploitable, action required
    - FIXED: Vulnerability has been patched
    - UNDER_INVESTIGATION: Analysis in progress
    """
    NOT_AFFECTED = "NOT_AFFECTED"
    AFFECTED = "AFFECTED"
    FIXED = "FIXED"
    UNDER_INVESTIGATION = "UNDER_INVESTIGATION"


class NotAffectedJustification(str, Enum):
    """Justifications for NOT_AFFECTED status."""
    COMPONENT_NOT_PRESENT = "COMPONENT_NOT_PRESENT"
    VULNERABLE_CODE_NOT_PRESENT = "VULNERABLE_CODE_NOT_PRESENT"
    VULNERABLE_CODE_NOT_IN_EXECUTE_PATH = "VULNERABLE_CODE_NOT_IN_EXECUTE_PATH"
    VULNERABLE_CODE_CANNOT_BE_CONTROLLED_BY_ADVERSARY = "VULNERABLE_CODE_CANNOT_BE_CONTROLLED_BY_ADVERSARY"
    INLINE_MITIGATIONS_ALREADY_EXIST = "INLINE_MITIGATIONS_ALREADY_EXIST"


class VulnerabilitySeverity(str, Enum):
    """CVSS-based severity levels."""
    NONE = "NONE"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class VEXStatement(BaseModel):
    """
    Individual VEX statement about a vulnerability.
    
    Allows manufacturers to communicate whether a vulnerability
    in a component is actually exploitable in their specific product.
    """
    id: UUID
    
    # Vulnerability identification
    vulnerability_id: str = Field(..., description="CVE ID (e.g., CVE-2023-12345)")
    vulnerability_name: Optional[str] = Field(None, description="Common name")
    vulnerability_description: str
    
    # Affected component
    component_name: str
    component_version: str
    component_purl: Optional[str] = None
    
    # VEX status
    status: VulnerabilityStatus
    status_justification: Optional[NotAffectedJustification] = None
    justification_detail: Optional[str] = Field(None, description="Detailed explanation")
    
    # Impact assessment
    severity: VulnerabilitySeverity
    cvss_score: Optional[float] = Field(None, ge=0, le=10)
    cvss_vector: Optional[str] = None
    
    # Actions
    action_required: Optional[str] = Field(None, description="Required action if AFFECTED")
    action_statement_timestamp: Optional[datetime] = None
    
    # Remediation
    remediation_available: bool = Field(False)
    remediation_version: Optional[str] = Field(None, description="Version that fixes issue")
    remediation_date: Optional[datetime] = None
    
    # Lifecycle
    first_issued: datetime
    last_updated: datetime
    issued_by: str


class VEXDocument(BaseModel):
    """
    Complete VEX document accompanying an SBOM.
    
    Provides exploitability context for all known vulnerabilities
    in the software components listed in the SBOM.
    """
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    sbom_id: UUID = Field(..., description="Associated SBOM")
    program_id: UUID
    
    # Document metadata
    document_id: str = Field(..., description="Unique document identifier")
    document_version: str
    
    # Author
    author: str
    author_email: Optional[str] = None
    role: str = Field(default="Manufacturer")
    
    # Statements
    statements: List[VEXStatement]
    
    # Summary stats
    total_vulnerabilities: int
    not_affected_count: int
    affected_count: int
    fixed_count: int
    under_investigation_count: int
    
    # Lifecycle
    created_at: datetime
    last_updated: datetime


class VEXCreate(BaseModel):
    """Request to create a VEX document."""
    sbom_id: UUID
    program_id: UUID
    author: str
    author_email: Optional[str] = None
    statements: List[VEXStatement]


class VEXStatementCreate(BaseModel):
    """Request to add a VEX statement to an existing document."""
    vex_document_id: UUID
    vulnerability_id: str
    vulnerability_description: str
    component_name: str
    component_version: str
    status: VulnerabilityStatus
    status_justification: Optional[NotAffectedJustification] = None
    justification_detail: Optional[str] = None
    severity: VulnerabilitySeverity
    cvss_score: Optional[float] = None
    action_required: Optional[str] = None


# =============================================================================
# Cyber Device Tracking (Section 524B)
# =============================================================================

class CyberDeviceStatus(str, Enum):
    """Compliance status for cyber device requirements."""
    NOT_ASSESSED = "NOT_ASSESSED"
    NON_COMPLIANT = "NON_COMPLIANT"
    PARTIALLY_COMPLIANT = "PARTIALLY_COMPLIANT"
    COMPLIANT = "COMPLIANT"
    EXEMPT = "EXEMPT"


class CyberDeviceType(str, Enum):
    """Types of cyber devices."""
    SAMD = "SAMD"  # Software as Medical Device
    DEVICE_WITH_SOFTWARE = "DEVICE_WITH_SOFTWARE"
    COMBINATION_PRODUCT = "COMBINATION_PRODUCT"
    CONNECTED_DIAGNOSTIC = "CONNECTED_DIAGNOSTIC"
    CONNECTED_THERAPEUTIC = "CONNECTED_THERAPEUTIC"


class CyberDevice(BaseModel):
    """
    Cyber Device registration per Section 524B.
    
    A "cyber device" is defined as a device that:
    1. Includes software validated, installed, or authorized by the sponsor
    2. Has the ability to connect to the internet
    3. Contains technological characteristics vulnerable to cybersecurity threats
    """
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    program_id: UUID
    
    # Device identification
    device_name: str
    device_version: str
    device_type: CyberDeviceType
    manufacturer: str
    
    # Connectivity
    connects_to_internet: bool = Field(True)
    connectivity_type: List[str] = Field(..., description="e.g., ['WiFi', 'Bluetooth', 'Cellular']")
    
    # Regulatory
    regulatory_submission: Optional[str] = Field(None, description="510(k), PMA, De Novo number")
    fda_product_code: Optional[str] = None
    
    # Section 524B Compliance
    compliance_status: CyberDeviceStatus = Field(default=CyberDeviceStatus.NOT_ASSESSED)
    
    # Required artifacts
    sbom_id: Optional[UUID] = Field(None, description="Associated SBOM")
    vex_document_id: Optional[UUID] = Field(None, description="Associated VEX")
    
    # Security processes
    has_vulnerability_management: bool = Field(False)
    has_coordinated_disclosure: bool = Field(False)
    has_security_patch_process: bool = Field(False)
    has_secure_development_lifecycle: bool = Field(False)
    
    # Security contact
    security_contact_email: Optional[str] = None
    vulnerability_disclosure_url: Optional[str] = None
    
    # Lifecycle
    created_at: datetime
    created_by: str
    last_assessed_at: Optional[datetime] = None
    last_assessed_by: Optional[str] = None


class CyberDeviceCreate(BaseModel):
    """Request to register a cyber device."""
    program_id: UUID
    device_name: str
    device_version: str
    device_type: CyberDeviceType
    manufacturer: str
    connectivity_type: List[str]
    regulatory_submission: Optional[str] = None
    fda_product_code: Optional[str] = None
    security_contact_email: Optional[str] = None
    vulnerability_disclosure_url: Optional[str] = None


class CyberDeviceSummary(BaseModel):
    """Summary view for cyber device listings."""
    id: UUID
    device_name: str
    device_version: str
    device_type: CyberDeviceType
    compliance_status: CyberDeviceStatus
    has_sbom: bool
    has_vex: bool
    created_at: datetime


class CyberDeviceList(BaseModel):
    """Paginated list of cyber devices."""
    items: List[CyberDeviceSummary]
    count: int
    total: int


# =============================================================================
# Vulnerability Scanning and Tracking
# =============================================================================

class VulnerabilityScan(BaseModel):
    """Record of a vulnerability scan against an SBOM."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    sbom_id: UUID
    
    # Scan metadata
    scan_tool: str = Field(..., description="e.g., Trivy, Grype, Snyk")
    scan_tool_version: str
    scanned_at: datetime
    scanned_by: str
    
    # Results
    total_vulnerabilities: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    
    # Details
    vulnerabilities: List[Dict[str, Any]] = Field(default_factory=list)
    
    # Compliance
    passes_threshold: bool = Field(..., description="Meets org's vulnerability threshold")
    threshold_definition: str = Field(..., description="e.g., 'No critical, <=3 high'")


class VulnerabilityScanCreate(BaseModel):
    """Request to record a vulnerability scan."""
    sbom_id: UUID
    scan_tool: str
    scan_tool_version: str
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    vulnerabilities: List[Dict[str, Any]] = Field(default_factory=list)
    threshold_definition: str


# =============================================================================
# Cybersecurity Dashboard Models
# =============================================================================

class CybersecurityDashboard(BaseModel):
    """Executive cybersecurity dashboard data."""
    
    # Device inventory
    total_cyber_devices: int
    compliant_devices: int
    non_compliant_devices: int
    
    # SBOM coverage
    devices_with_sbom: int
    sbom_coverage_pct: float
    
    # VEX coverage
    devices_with_vex: int
    vex_coverage_pct: float
    
    # Vulnerability summary
    total_vulnerabilities: int
    critical_vulnerabilities: int
    high_vulnerabilities: int
    vulnerabilities_not_affected: int
    vulnerabilities_under_investigation: int
    
    # Compliance score
    overall_compliance_score: float = Field(..., ge=0, le=100)
    
    # Alerts
    alerts: List[Dict[str, Any]] = Field(default_factory=list)
    
    generated_at: datetime


class SBOMComplianceReport(BaseModel):
    """SBOM compliance report for regulatory submission."""
    
    sbom_id: UUID
    device_name: str
    device_version: str
    
    # NTIA compliance
    ntia_compliant: bool
    ntia_missing_elements: List[str] = Field(default_factory=list)
    
    # Format compliance
    format_valid: bool
    format_errors: List[str] = Field(default_factory=list)
    
    # Component analysis
    total_components: int
    components_with_known_vulnerabilities: int
    components_with_valid_licenses: int
    proprietary_components: int
    
    # Recommendations
    recommendations: List[str] = Field(default_factory=list)
    
    generated_at: datetime
    generated_by: str
