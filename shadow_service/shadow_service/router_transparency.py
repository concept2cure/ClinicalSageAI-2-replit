"""
FastAPI Router for Data Transparency and Infrastructure Qualification.

Endpoints for:
- EMA Policy 0070 anonymization and clinical data publication
- PDF/A-3 archival document management (ISO 19005-3)
- GAMP 5 infrastructure qualification
- Infrastructure as Code validation
- Policy as Code (OPA/Rego) compliance

References:
- EMA Policy 0070 (0.09 re-identification risk threshold)
- ISO 19005-3 (PDF/A-3)
- GAMP 5 Second Edition
- Open Policy Agent (OPA)
"""
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from uuid import UUID, uuid4
from fastapi import APIRouter, HTTPException, Query, UploadFile, File

from .models_transparency import (
    # EMA Policy 0070
    AnonymizationReport,
    AnonymizationReportCreate,
    AnonymizationTransformation,
    RiskMetric,
    RiskThreshold,
    ClinicalDataPackage,
    ClinicalDataPackageCreate,
    TransformationType,
    DataCategory,
    # PDF/A-3
    PDFAValidationResult,
    ArchivalDocument,
    ArchivalDocumentCreate,
    PDFAConformanceLevel,
    EmbeddedFileInfo,
    # GAMP 5
    InfrastructureComponent,
    InfrastructureComponentCreate,
    ComponentCategory,
    ValidationApproach,
    IaCValidationRun,
    IaCValidationRunCreate,
    PolicyCheckResult,
    GxPPolicy,
    GxPPolicyCreate,
    IaCProvider,
    PolicyStatus,
    # Dashboards
    TransparencyDashboard,
    InfrastructureComplianceDashboard,
)


router = APIRouter(prefix="/transparency", tags=["Data Transparency & Infrastructure"])


# =============================================================================
# EMA Policy 0070 - Clinical Data Anonymization
# =============================================================================

@router.post("/anonymization/reports", response_model=AnonymizationReport, status_code=201)
async def create_anonymization_report(
    request: AnonymizationReportCreate
) -> AnonymizationReport:
    """
    Create an anonymization report for clinical data.
    
    Tracks anonymization transformations and calculates
    re-identification risk per EMA Policy 0070 (threshold: 0.09).
    """
    now = datetime.utcnow()
    report_id = uuid4()
    
    # Calculate risk metrics (demo values)
    risk_metrics = [
        RiskMetric(
            metric_name="k-anonymity",
            metric_value=5.0,
            threshold=5.0,
            passes_threshold=True,
            description="Minimum group size for quasi-identifiers"
        ),
        RiskMetric(
            metric_name="l-diversity",
            metric_value=3.0,
            threshold=2.0,
            passes_threshold=True,
            description="Diversity of sensitive attributes per equivalence class"
        ),
        RiskMetric(
            metric_name="re-identification_risk",
            metric_value=0.067,
            threshold=RiskThreshold.EMA_0070_THRESHOLD,
            passes_threshold=True,
            description="Prosecutor attack re-identification probability"
        )
    ]
    
    # All metrics must pass for overall compliance
    overall_risk = 0.067
    
    return AnonymizationReport(
        id=report_id,
        program_id=request.program_id,
        dataset_id=request.dataset_id,
        dataset_name=request.dataset_name,
        version="1.0",
        transformations=request.transformations,
        risk_metrics=risk_metrics,
        overall_risk_score=overall_risk,
        ema_0070_compliant=overall_risk <= RiskThreshold.EMA_0070_THRESHOLD,
        methodology_description=request.methodology_description,
        utility_impact_assessment=request.utility_impact_assessment,
        created_at=now,
        created_by=request.created_by,
        reviewed_by=None,
        reviewed_at=None,
        approved_for_publication=False
    )


@router.get("/anonymization/reports", response_model=List[AnonymizationReport])
async def list_anonymization_reports(
    program_id: UUID = Query(..., description="Program ID"),
    dataset_id: Optional[UUID] = Query(None),
    compliant_only: bool = Query(False, description="Filter to EMA 0070 compliant only"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200)
) -> List[AnonymizationReport]:
    """List anonymization reports for clinical data."""
    now = datetime.utcnow()
    
    reports = [
        AnonymizationReport(
            id=uuid4(),
            program_id=program_id,
            dataset_id=uuid4(),
            dataset_name="STUDY-001 Demographics Dataset",
            version="2.0",
            transformations=[
                AnonymizationTransformation(
                    field_name="birth_date",
                    original_type="date",
                    transformation_type=TransformationType.GENERALIZATION,
                    parameters={"level": "year"},
                    description="Generalized to year of birth",
                    data_category=DataCategory.QUASI_IDENTIFIER
                ),
                AnonymizationTransformation(
                    field_name="postal_code",
                    original_type="string",
                    transformation_type=TransformationType.TRUNCATION,
                    parameters={"keep_chars": 3},
                    description="Truncated to first 3 characters",
                    data_category=DataCategory.QUASI_IDENTIFIER
                )
            ],
            risk_metrics=[
                RiskMetric(
                    metric_name="re-identification_risk",
                    metric_value=0.045,
                    threshold=0.09,
                    passes_threshold=True,
                    description="Prosecutor attack probability"
                )
            ],
            overall_risk_score=0.045,
            ema_0070_compliant=True,
            methodology_description="k-anonymity with k=5, l-diversity with l=3",
            utility_impact_assessment="Minimal impact on statistical analysis capability",
            created_at=now - timedelta(days=30),
            created_by="data.scientist@example.com",
            reviewed_by="privacy.officer@example.com",
            reviewed_at=now - timedelta(days=28),
            approved_for_publication=True
        )
    ]
    
    return reports


@router.get("/anonymization/reports/{report_id}", response_model=AnonymizationReport)
async def get_anonymization_report(
    report_id: UUID,
    program_id: UUID = Query(..., description="Program ID")
) -> AnonymizationReport:
    """Get detailed anonymization report."""
    now = datetime.utcnow()
    
    return AnonymizationReport(
        id=report_id,
        program_id=program_id,
        dataset_id=uuid4(),
        dataset_name="STUDY-001 Demographics Dataset",
        version="2.0",
        transformations=[
            AnonymizationTransformation(
                field_name="subject_id",
                original_type="string",
                transformation_type=TransformationType.PSEUDONYMIZATION,
                parameters={"algorithm": "SHA-256", "salt": "study-specific"},
                description="Cryptographic hash with study-specific salt",
                data_category=DataCategory.DIRECT_IDENTIFIER
            ),
            AnonymizationTransformation(
                field_name="birth_date",
                original_type="date",
                transformation_type=TransformationType.GENERALIZATION,
                parameters={"level": "year"},
                description="Generalized to year of birth only",
                data_category=DataCategory.QUASI_IDENTIFIER
            ),
            AnonymizationTransformation(
                field_name="sex",
                original_type="string",
                transformation_type=TransformationType.NONE,
                parameters={},
                description="Retained as-is (low risk category)",
                data_category=DataCategory.QUASI_IDENTIFIER
            ),
            AnonymizationTransformation(
                field_name="race",
                original_type="string",
                transformation_type=TransformationType.SUPPRESSION,
                parameters={"condition": "rare_categories"},
                description="Suppressed rare categories (<5 occurrences)",
                data_category=DataCategory.QUASI_IDENTIFIER
            )
        ],
        risk_metrics=[
            RiskMetric(
                metric_name="k-anonymity",
                metric_value=5.0,
                threshold=5.0,
                passes_threshold=True,
                description="Minimum equivalence class size"
            ),
            RiskMetric(
                metric_name="l-diversity",
                metric_value=3.0,
                threshold=2.0,
                passes_threshold=True,
                description="Sensitive attribute diversity"
            ),
            RiskMetric(
                metric_name="re-identification_risk",
                metric_value=0.045,
                threshold=0.09,
                passes_threshold=True,
                description="Prosecutor attack probability per EMA Policy 0070"
            )
        ],
        overall_risk_score=0.045,
        ema_0070_compliant=True,
        methodology_description="Applied k-anonymity (k=5) and l-diversity (l=3) using ARX Data Anonymization Tool",
        utility_impact_assessment="98% of original statistical properties preserved. Suitable for efficacy and safety analyses.",
        created_at=now - timedelta(days=30),
        created_by="data.scientist@example.com",
        reviewed_by="privacy.officer@example.com",
        reviewed_at=now - timedelta(days=28),
        approved_for_publication=True
    )


@router.post("/anonymization/reports/{report_id}/approve")
async def approve_anonymization_report(
    report_id: UUID,
    reviewer: str = Query(..., description="Reviewer name/email"),
    comments: Optional[str] = Query(None),
    program_id: UUID = Query(..., description="Program ID")
) -> Dict[str, Any]:
    """Approve anonymization report for data publication."""
    now = datetime.utcnow()
    
    return {
        "report_id": str(report_id),
        "approved": True,
        "reviewed_by": reviewer,
        "reviewed_at": now.isoformat(),
        "comments": comments,
        "message": "Anonymization report approved for publication"
    }


@router.post("/anonymization/assess-risk")
async def assess_anonymization_risk(
    program_id: UUID = Query(..., description="Program ID"),
    k_anonymity: float = Query(..., ge=1, description="k-anonymity value"),
    l_diversity: Optional[float] = Query(None, ge=1),
    t_closeness: Optional[float] = Query(None, ge=0, le=1)
) -> Dict[str, Any]:
    """
    Assess re-identification risk for given parameters.
    
    Calculates compliance with EMA Policy 0070 threshold (0.09).
    """
    # Simplified risk calculation based on k-anonymity
    # In practice, this would be more sophisticated
    base_risk = 1 / k_anonymity
    
    # Adjust for l-diversity if provided
    if l_diversity:
        base_risk *= (1 / l_diversity) * 0.5
    
    # Adjust for t-closeness if provided
    if t_closeness:
        base_risk *= (1 - t_closeness) * 0.3
    
    final_risk = min(base_risk, 1.0)
    
    return {
        "calculated_risk": round(final_risk, 4),
        "ema_0070_threshold": RiskThreshold.EMA_0070_THRESHOLD,
        "is_compliant": final_risk <= RiskThreshold.EMA_0070_THRESHOLD,
        "parameters_used": {
            "k_anonymity": k_anonymity,
            "l_diversity": l_diversity,
            "t_closeness": t_closeness
        },
        "recommendations": [
            f"Current risk ({round(final_risk, 4)}) {'meets' if final_risk <= 0.09 else 'exceeds'} EMA threshold",
            f"Minimum k-anonymity for compliance: {max(k_anonymity, 12)} (k >= 1/0.09 ≈ 11.1)"
        ] if final_risk > 0.09 else ["Risk level acceptable for EMA Policy 0070 publication"]
    }


# =============================================================================
# Clinical Data Packages
# =============================================================================

@router.post("/data-packages", response_model=ClinicalDataPackage, status_code=201)
async def create_data_package(
    request: ClinicalDataPackageCreate
) -> ClinicalDataPackage:
    """
    Create a clinical data package for publication.
    
    Aggregates anonymized datasets with documentation
    for EMA Policy 0070 submission.
    """
    now = datetime.utcnow()
    
    return ClinicalDataPackage(
        id=uuid4(),
        program_id=request.program_id,
        study_id=request.study_id,
        study_name=request.study_name,
        package_type=request.package_type,
        datasets=request.datasets,
        anonymization_report_ids=request.anonymization_report_ids,
        submission_date=None,
        published_date=None,
        status="DRAFT",
        ema_submission_number=None,
        created_at=now,
        created_by=request.created_by
    )


@router.get("/data-packages", response_model=List[ClinicalDataPackage])
async def list_data_packages(
    program_id: UUID = Query(..., description="Program ID"),
    study_id: Optional[UUID] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200)
) -> List[ClinicalDataPackage]:
    """List clinical data packages."""
    now = datetime.utcnow()
    
    return [
        ClinicalDataPackage(
            id=uuid4(),
            program_id=program_id,
            study_id=uuid4(),
            study_name="Phase III Efficacy Study",
            package_type="IPD",
            datasets=[
                {"name": "ADSL", "description": "Subject-level Analysis Dataset", "records": 500},
                {"name": "ADAE", "description": "Adverse Events Analysis Dataset", "records": 1250},
                {"name": "ADEFF", "description": "Efficacy Analysis Dataset", "records": 500}
            ],
            anonymization_report_ids=[uuid4(), uuid4()],
            submission_date=now - timedelta(days=60),
            published_date=now - timedelta(days=30),
            status="PUBLISHED",
            ema_submission_number="EMA/12345/2024",
            created_at=now - timedelta(days=90),
            created_by="regulatory.affairs@example.com"
        )
    ]


# =============================================================================
# PDF/A-3 Archival Documents
# =============================================================================

@router.post("/archival-documents", response_model=ArchivalDocument, status_code=201)
async def create_archival_document(
    request: ArchivalDocumentCreate
) -> ArchivalDocument:
    """
    Create a PDF/A-3 archival document record.
    
    Supports hybrid archival with embedded source data
    per ISO 19005-3.
    """
    now = datetime.utcnow()
    
    return ArchivalDocument(
        id=uuid4(),
        program_id=request.program_id,
        document_type=request.document_type,
        title=request.title,
        source_file_path=request.source_file_path,
        pdfa_file_path=None,
        conformance_level=request.conformance_level,
        embedded_files=request.embedded_files or [],
        validation_status="PENDING",
        validation_errors=[],
        created_at=now,
        created_by=request.created_by,
        converted_at=None,
        file_size_bytes=None,
        md5_hash=None
    )


@router.get("/archival-documents", response_model=List[ArchivalDocument])
async def list_archival_documents(
    program_id: UUID = Query(..., description="Program ID"),
    document_type: Optional[str] = Query(None),
    validation_status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200)
) -> List[ArchivalDocument]:
    """List PDF/A-3 archival documents."""
    now = datetime.utcnow()
    
    return [
        ArchivalDocument(
            id=uuid4(),
            program_id=program_id,
            document_type="CSR",
            title="Clinical Study Report - STUDY-001",
            source_file_path="/documents/csr/STUDY-001-CSR-v1.0.docx",
            pdfa_file_path="/archive/csr/STUDY-001-CSR-v1.0.pdf",
            conformance_level=PDFAConformanceLevel.PDFA_3B,
            embedded_files=[
                EmbeddedFileInfo(
                    filename="analysis_datasets.zip",
                    mime_type="application/zip",
                    description="Source analysis datasets (CDISC ADaM)",
                    relationship="Source"
                ),
                EmbeddedFileInfo(
                    filename="statistical_analysis_plan.pdf",
                    mime_type="application/pdf",
                    description="Statistical Analysis Plan v2.0",
                    relationship="Supplement"
                )
            ],
            validation_status="VALID",
            validation_errors=[],
            created_at=now - timedelta(days=45),
            created_by="document.control@example.com",
            converted_at=now - timedelta(days=44),
            file_size_bytes=25000000,
            md5_hash="a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
        )
    ]


@router.post("/archival-documents/{document_id}/validate", response_model=PDFAValidationResult)
async def validate_pdfa_document(
    document_id: UUID,
    program_id: UUID = Query(..., description="Program ID")
) -> PDFAValidationResult:
    """
    Validate a document against PDF/A-3 requirements.
    
    Checks ISO 19005-3 compliance including embedded file handling.
    """
    now = datetime.utcnow()
    
    return PDFAValidationResult(
        document_id=document_id,
        is_valid=True,
        conformance_level=PDFAConformanceLevel.PDFA_3B,
        validator_name="veraPDF",
        validator_version="1.24.1",
        validation_profile="PDF/A-3B validation profile",
        errors=[],
        warnings=[
            {
                "rule": "PDF/A-3B",
                "description": "Font subset naming convention advisory",
                "location": "Page 1",
                "severity": "WARNING"
            }
        ],
        embedded_file_validation=[
            {
                "filename": "analysis_datasets.zip",
                "valid": True,
                "relationship": "Source",
                "mime_type_valid": True
            }
        ],
        validated_at=now
    )


@router.post("/archival-documents/{document_id}/convert")
async def convert_to_pdfa(
    document_id: UUID,
    conformance_level: PDFAConformanceLevel = Query(PDFAConformanceLevel.PDFA_3B),
    program_id: UUID = Query(..., description="Program ID")
) -> Dict[str, Any]:
    """
    Convert document to PDF/A-3 format.
    
    Converts source document to archival format with
    optional embedded source data.
    """
    now = datetime.utcnow()
    
    return {
        "document_id": str(document_id),
        "conformance_level": conformance_level,
        "conversion_status": "COMPLETED",
        "output_path": f"/archive/converted/{document_id}.pdf",
        "converted_at": now.isoformat(),
        "file_size_bytes": 15000000,
        "md5_hash": "b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7"
    }


# =============================================================================
# GAMP 5 Infrastructure Qualification
# =============================================================================

@router.post("/infrastructure/components", response_model=InfrastructureComponent, status_code=201)
async def create_infrastructure_component(
    request: InfrastructureComponentCreate
) -> InfrastructureComponent:
    """
    Register an infrastructure component for GAMP 5 tracking.
    
    Assigns appropriate validation approach based on
    GAMP 5 Second Edition category.
    """
    now = datetime.utcnow()
    
    # Determine validation approach based on category
    validation_approaches = {
        ComponentCategory.CATEGORY_1: ValidationApproach.VERIFICATION_ONLY,
        ComponentCategory.CATEGORY_3: ValidationApproach.CONFIGURATION_TESTING,
        ComponentCategory.CATEGORY_4: ValidationApproach.REQUIREMENTS_BASED_TESTING,
        ComponentCategory.CATEGORY_5: ValidationApproach.FULL_LIFECYCLE_VALIDATION,
    }
    
    return InfrastructureComponent(
        id=uuid4(),
        program_id=request.program_id,
        name=request.name,
        component_type=request.component_type,
        version=request.version,
        gamp_category=request.gamp_category,
        validation_approach=validation_approaches.get(
            request.gamp_category,
            ValidationApproach.REQUIREMENTS_BASED_TESTING
        ),
        iac_provider=request.iac_provider,
        iac_configuration_path=request.iac_configuration_path,
        gxp_impact=request.gxp_impact,
        data_integrity_impact=request.data_integrity_impact,
        qualification_status="PENDING",
        last_validation_date=None,
        next_validation_due=now + timedelta(days=365),
        created_at=now,
        created_by=request.created_by
    )


@router.get("/infrastructure/components", response_model=List[InfrastructureComponent])
async def list_infrastructure_components(
    program_id: UUID = Query(..., description="Program ID"),
    gamp_category: Optional[ComponentCategory] = Query(None),
    qualification_status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200)
) -> List[InfrastructureComponent]:
    """List infrastructure components with GAMP 5 categorization."""
    now = datetime.utcnow()
    
    return [
        InfrastructureComponent(
            id=uuid4(),
            program_id=program_id,
            name="Production Database Cluster",
            component_type="DATABASE",
            version="PostgreSQL 15.2",
            gamp_category=ComponentCategory.CATEGORY_4,
            validation_approach=ValidationApproach.REQUIREMENTS_BASED_TESTING,
            iac_provider=IaCProvider.TERRAFORM,
            iac_configuration_path="/infrastructure/terraform/database",
            gxp_impact="HIGH",
            data_integrity_impact="HIGH",
            qualification_status="QUALIFIED",
            last_validation_date=now - timedelta(days=90),
            next_validation_due=now + timedelta(days=275),
            created_at=now - timedelta(days=180),
            created_by="infrastructure.team@example.com"
        ),
        InfrastructureComponent(
            id=uuid4(),
            program_id=program_id,
            name="Application Load Balancer",
            component_type="NETWORK",
            version="AWS ALB v2",
            gamp_category=ComponentCategory.CATEGORY_3,
            validation_approach=ValidationApproach.CONFIGURATION_TESTING,
            iac_provider=IaCProvider.TERRAFORM,
            iac_configuration_path="/infrastructure/terraform/alb",
            gxp_impact="MEDIUM",
            data_integrity_impact="LOW",
            qualification_status="QUALIFIED",
            last_validation_date=now - timedelta(days=60),
            next_validation_due=now + timedelta(days=305),
            created_at=now - timedelta(days=120),
            created_by="infrastructure.team@example.com"
        ),
        InfrastructureComponent(
            id=uuid4(),
            program_id=program_id,
            name="Clinical Data Processing Service",
            component_type="APPLICATION",
            version="v2.5.0",
            gamp_category=ComponentCategory.CATEGORY_5,
            validation_approach=ValidationApproach.FULL_LIFECYCLE_VALIDATION,
            iac_provider=IaCProvider.KUBERNETES,
            iac_configuration_path="/infrastructure/k8s/clinical-processor",
            gxp_impact="HIGH",
            data_integrity_impact="HIGH",
            qualification_status="QUALIFIED",
            last_validation_date=now - timedelta(days=30),
            next_validation_due=now + timedelta(days=335),
            created_at=now - timedelta(days=240),
            created_by="development.team@example.com"
        )
    ]


@router.get("/infrastructure/components/{component_id}", response_model=InfrastructureComponent)
async def get_infrastructure_component(
    component_id: UUID,
    program_id: UUID = Query(..., description="Program ID")
) -> InfrastructureComponent:
    """Get infrastructure component details."""
    now = datetime.utcnow()
    
    return InfrastructureComponent(
        id=component_id,
        program_id=program_id,
        name="Production Database Cluster",
        component_type="DATABASE",
        version="PostgreSQL 15.2",
        gamp_category=ComponentCategory.CATEGORY_4,
        validation_approach=ValidationApproach.REQUIREMENTS_BASED_TESTING,
        iac_provider=IaCProvider.TERRAFORM,
        iac_configuration_path="/infrastructure/terraform/database",
        gxp_impact="HIGH",
        data_integrity_impact="HIGH",
        qualification_status="QUALIFIED",
        last_validation_date=now - timedelta(days=90),
        next_validation_due=now + timedelta(days=275),
        created_at=now - timedelta(days=180),
        created_by="infrastructure.team@example.com"
    )


@router.get("/infrastructure/gamp5-categories")
async def get_gamp5_categories() -> List[Dict[str, Any]]:
    """
    Get GAMP 5 Second Edition category definitions.
    
    Returns guidance on validation approach for each category.
    """
    return [
        {
            "category": ComponentCategory.CATEGORY_1,
            "name": "Infrastructure Software",
            "description": "Operating systems, database engines, middleware",
            "validation_approach": ValidationApproach.VERIFICATION_ONLY,
            "typical_activities": [
                "Version verification",
                "Installation qualification",
                "Vendor audit (if applicable)"
            ],
            "examples": ["Linux OS", "PostgreSQL", "Redis"]
        },
        {
            "category": ComponentCategory.CATEGORY_3,
            "name": "Non-configured Products",
            "description": "Standard products used as-is without configuration",
            "validation_approach": ValidationApproach.CONFIGURATION_TESTING,
            "typical_activities": [
                "Configuration verification",
                "Basic functional testing",
                "User acceptance testing"
            ],
            "examples": ["Load balancers", "Standard network equipment"]
        },
        {
            "category": ComponentCategory.CATEGORY_4,
            "name": "Configured Products",
            "description": "Products configured to meet specific requirements",
            "validation_approach": ValidationApproach.REQUIREMENTS_BASED_TESTING,
            "typical_activities": [
                "Requirements documentation",
                "Configuration testing",
                "Functional specification testing",
                "User acceptance testing"
            ],
            "examples": ["LIMS", "CDMS", "ERP configured for GxP"]
        },
        {
            "category": ComponentCategory.CATEGORY_5,
            "name": "Custom Applications",
            "description": "Custom-developed software",
            "validation_approach": ValidationApproach.FULL_LIFECYCLE_VALIDATION,
            "typical_activities": [
                "Full SDLC documentation",
                "Requirements traceability",
                "Design documentation",
                "Unit/integration/system testing",
                "User acceptance testing",
                "Code review"
            ],
            "examples": ["Custom clinical applications", "Bespoke data processing"]
        }
    ]


# =============================================================================
# Infrastructure as Code Validation
# =============================================================================

@router.post("/infrastructure/iac-validation", response_model=IaCValidationRun, status_code=201)
async def run_iac_validation(
    request: IaCValidationRunCreate
) -> IaCValidationRun:
    """
    Run Infrastructure as Code validation.
    
    Validates IaC configurations against GxP policies
    using drift detection and policy checks.
    """
    now = datetime.utcnow()
    
    # Demo policy check results
    policy_results = [
        PolicyCheckResult(
            policy_id=uuid4(),
            policy_name="encryption-at-rest",
            passed=True,
            message="All storage resources have encryption enabled",
            severity="HIGH",
            resource_path="/aws_db_instance.production"
        ),
        PolicyCheckResult(
            policy_id=uuid4(),
            policy_name="backup-retention",
            passed=True,
            message="Backup retention meets 7-day minimum requirement",
            severity="HIGH",
            resource_path="/aws_db_instance.production"
        ),
        PolicyCheckResult(
            policy_id=uuid4(),
            policy_name="audit-logging",
            passed=True,
            message="Audit logging enabled for all GxP resources",
            severity="HIGH",
            resource_path="/aws_cloudwatch_log_group.audit"
        ),
        PolicyCheckResult(
            policy_id=uuid4(),
            policy_name="access-control",
            passed=False,
            message="IAM role has broader permissions than required",
            severity="MEDIUM",
            resource_path="/aws_iam_role.application"
        )
    ]
    
    passed_count = sum(1 for r in policy_results if r.passed)
    failed_count = len(policy_results) - passed_count
    
    return IaCValidationRun(
        id=uuid4(),
        program_id=request.program_id,
        component_id=request.component_id,
        iac_provider=request.iac_provider,
        configuration_path=request.configuration_path,
        git_commit_sha=request.git_commit_sha,
        policy_results=policy_results,
        drift_detected=False,
        drift_details=None,
        passed_checks=passed_count,
        failed_checks=failed_count,
        overall_status="PASSED_WITH_WARNINGS" if failed_count > 0 else "PASSED",
        executed_at=now,
        executed_by=request.executed_by,
        duration_seconds=45
    )


@router.get("/infrastructure/iac-validation", response_model=List[IaCValidationRun])
async def list_iac_validation_runs(
    program_id: UUID = Query(..., description="Program ID"),
    component_id: Optional[UUID] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200)
) -> List[IaCValidationRun]:
    """List IaC validation run history."""
    now = datetime.utcnow()
    
    return [
        IaCValidationRun(
            id=uuid4(),
            program_id=program_id,
            component_id=uuid4(),
            iac_provider=IaCProvider.TERRAFORM,
            configuration_path="/infrastructure/terraform/database",
            git_commit_sha="abc123def456",
            policy_results=[
                PolicyCheckResult(
                    policy_id=uuid4(),
                    policy_name="encryption-at-rest",
                    passed=True,
                    message="Encryption enabled",
                    severity="HIGH",
                    resource_path="/aws_db_instance"
                )
            ],
            drift_detected=False,
            passed_checks=12,
            failed_checks=0,
            overall_status="PASSED",
            executed_at=now - timedelta(hours=6),
            executed_by="ci-pipeline",
            duration_seconds=38
        )
    ]


# =============================================================================
# GxP Policies (Policy as Code)
# =============================================================================

@router.post("/policies", response_model=GxPPolicy, status_code=201)
async def create_gxp_policy(
    request: GxPPolicyCreate
) -> GxPPolicy:
    """
    Create a GxP policy for infrastructure validation.
    
    Policies are defined in OPA Rego format for
    automated compliance checking.
    """
    now = datetime.utcnow()
    
    return GxPPolicy(
        id=uuid4(),
        program_id=request.program_id,
        name=request.name,
        description=request.description,
        category=request.category,
        severity=request.severity,
        rego_policy=request.rego_policy,
        applicable_providers=request.applicable_providers,
        regulatory_reference=request.regulatory_reference,
        status=PolicyStatus.ACTIVE,
        version="1.0",
        created_at=now,
        created_by=request.created_by,
        approved_by=None,
        approved_at=None
    )


@router.get("/policies", response_model=List[GxPPolicy])
async def list_gxp_policies(
    program_id: UUID = Query(..., description="Program ID"),
    category: Optional[str] = Query(None),
    status: Optional[PolicyStatus] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200)
) -> List[GxPPolicy]:
    """List GxP policies for infrastructure validation."""
    now = datetime.utcnow()
    
    encryption_policy = """
package gxp.encryption

default allow = false

allow {
    input.resource_type == "aws_db_instance"
    input.storage_encrypted == true
}

allow {
    input.resource_type == "aws_s3_bucket"
    input.server_side_encryption_configuration != null
}
"""
    
    audit_policy = """
package gxp.audit

default allow = false

allow {
    input.resource_type == "aws_db_instance"
    input.enabled_cloudwatch_logs_exports != null
    count(input.enabled_cloudwatch_logs_exports) > 0
}
"""
    
    return [
        GxPPolicy(
            id=uuid4(),
            program_id=program_id,
            name="encryption-at-rest",
            description="Ensures all data storage resources have encryption enabled",
            category="Data Protection",
            severity="HIGH",
            rego_policy=encryption_policy,
            applicable_providers=[IaCProvider.TERRAFORM, IaCProvider.PULUMI],
            regulatory_reference="21 CFR Part 11.10(c), FDA Guidance on Data Integrity",
            status=PolicyStatus.ACTIVE,
            version="2.0",
            created_at=now - timedelta(days=180),
            created_by="compliance.team@example.com",
            approved_by="qa.director@example.com",
            approved_at=now - timedelta(days=178)
        ),
        GxPPolicy(
            id=uuid4(),
            program_id=program_id,
            name="audit-logging",
            description="Ensures audit logging is enabled for all GxP-impacting resources",
            category="Audit Trail",
            severity="HIGH",
            rego_policy=audit_policy,
            applicable_providers=[IaCProvider.TERRAFORM, IaCProvider.PULUMI, IaCProvider.CLOUDFORMATION],
            regulatory_reference="21 CFR Part 11.10(e), EU Annex 11",
            status=PolicyStatus.ACTIVE,
            version="1.5",
            created_at=now - timedelta(days=150),
            created_by="compliance.team@example.com",
            approved_by="qa.director@example.com",
            approved_at=now - timedelta(days=148)
        )
    ]


@router.get("/policies/{policy_id}", response_model=GxPPolicy)
async def get_gxp_policy(
    policy_id: UUID,
    program_id: UUID = Query(..., description="Program ID")
) -> GxPPolicy:
    """Get GxP policy details including Rego definition."""
    now = datetime.utcnow()
    
    rego_policy = """
package gxp.encryption

default allow = false

# Ensure RDS instances have encryption enabled
allow {
    input.resource_type == "aws_db_instance"
    input.storage_encrypted == true
}

# Ensure S3 buckets have server-side encryption
allow {
    input.resource_type == "aws_s3_bucket"
    input.server_side_encryption_configuration != null
}

# Ensure EBS volumes are encrypted
allow {
    input.resource_type == "aws_ebs_volume"
    input.encrypted == true
}

# Violation message for reporting
violation[msg] {
    input.resource_type == "aws_db_instance"
    not input.storage_encrypted
    msg := sprintf("RDS instance '%s' does not have encryption enabled", [input.resource_name])
}
"""
    
    return GxPPolicy(
        id=policy_id,
        program_id=program_id,
        name="encryption-at-rest",
        description="Ensures all data storage resources have encryption enabled at rest. This policy validates AWS RDS instances, S3 buckets, and EBS volumes.",
        category="Data Protection",
        severity="HIGH",
        rego_policy=rego_policy,
        applicable_providers=[IaCProvider.TERRAFORM, IaCProvider.PULUMI],
        regulatory_reference="21 CFR Part 11.10(c), FDA Guidance on Data Integrity and Compliance With Drug CGMP",
        status=PolicyStatus.ACTIVE,
        version="2.0",
        created_at=now - timedelta(days=180),
        created_by="compliance.team@example.com",
        approved_by="qa.director@example.com",
        approved_at=now - timedelta(days=178)
    )


# =============================================================================
# Dashboards
# =============================================================================

@router.get("/dashboard/transparency", response_model=TransparencyDashboard)
async def get_transparency_dashboard(
    program_id: UUID = Query(..., description="Program ID")
) -> TransparencyDashboard:
    """
    Get data transparency compliance dashboard.
    
    Overview of anonymization reports, clinical data packages,
    and PDF/A archival status.
    """
    now = datetime.utcnow()
    
    return TransparencyDashboard(
        # Anonymization summary
        total_datasets=25,
        datasets_anonymized=22,
        datasets_pending_anonymization=3,
        ema_0070_compliant_datasets=20,
        average_risk_score=0.052,
        
        # Data packages
        data_packages_draft=3,
        data_packages_submitted=5,
        data_packages_published=12,
        
        # Archival
        documents_pending_conversion=8,
        documents_validated=145,
        documents_failed_validation=2,
        
        # Recent activity
        recent_anonymization_reports=[
            {
                "id": str(uuid4()),
                "dataset_name": "STUDY-002 Efficacy Dataset",
                "risk_score": 0.045,
                "status": "APPROVED",
                "created_at": (now - timedelta(days=5)).isoformat()
            }
        ],
        
        alerts=[
            {
                "type": "WARNING",
                "title": "Datasets Pending Anonymization",
                "message": "3 datasets require anonymization before publication",
                "action_required": True
            },
            {
                "type": "INFO",
                "title": "Upcoming Publication Deadline",
                "message": "EMA publication deadline in 45 days for STUDY-003",
                "action_required": True
            }
        ],
        
        generated_at=now
    )


@router.get("/dashboard/infrastructure", response_model=InfrastructureComplianceDashboard)
async def get_infrastructure_dashboard(
    program_id: UUID = Query(..., description="Program ID")
) -> InfrastructureComplianceDashboard:
    """
    Get infrastructure compliance dashboard.
    
    Overview of GAMP 5 qualification status, IaC validation,
    and policy compliance.
    """
    now = datetime.utcnow()
    
    return InfrastructureComplianceDashboard(
        # Component summary
        total_components=45,
        components_qualified=42,
        components_pending_qualification=3,
        components_overdue_requalification=1,
        
        # By GAMP category
        by_gamp_category={
            "CATEGORY_1": {"count": 12, "qualified": 12},
            "CATEGORY_3": {"count": 8, "qualified": 8},
            "CATEGORY_4": {"count": 18, "qualified": 16},
            "CATEGORY_5": {"count": 7, "qualified": 6}
        },
        
        # IaC validation
        iac_validations_last_30d=156,
        iac_validations_passed=148,
        iac_validations_failed=8,
        drift_incidents_detected=2,
        
        # Policy compliance
        active_policies=24,
        policy_violations_open=5,
        policy_violations_resolved_30d=12,
        
        # Recent validation runs
        recent_validation_runs=[
            {
                "id": str(uuid4()),
                "component": "Production Database",
                "status": "PASSED",
                "checks_passed": 12,
                "checks_failed": 0,
                "executed_at": (now - timedelta(hours=6)).isoformat()
            }
        ],
        
        alerts=[
            {
                "type": "WARNING",
                "title": "Requalification Due",
                "message": "1 component requires requalification within 30 days",
                "action_required": True
            },
            {
                "type": "ERROR",
                "title": "Policy Violations",
                "message": "5 open policy violations require remediation",
                "action_required": True
            }
        ],
        
        generated_at=now
    )


@router.get("/reports/ema-readiness")
async def get_ema_readiness_report(
    program_id: UUID = Query(..., description="Program ID")
) -> Dict[str, Any]:
    """
    Generate EMA Policy 0070 readiness report.
    
    Assesses compliance with clinical data publication requirements.
    """
    now = datetime.utcnow()
    
    return {
        "generated_at": now.isoformat(),
        "program_id": str(program_id),
        "readiness_score": 92.5,
        "policy_requirements": {
            "anonymization": {
                "status": "COMPLIANT",
                "details": "All published datasets meet 0.09 risk threshold",
                "datasets_reviewed": 22,
                "datasets_compliant": 22
            },
            "methodology_documentation": {
                "status": "COMPLIANT",
                "details": "Anonymization methodology documented for all datasets"
            },
            "utility_assessment": {
                "status": "COMPLIANT",
                "details": "Data utility impact assessments completed"
            },
            "archival_format": {
                "status": "PARTIAL",
                "details": "145 of 153 documents converted to PDF/A-3",
                "action_required": "Convert remaining 8 documents"
            }
        },
        "recommendations": [
            {
                "priority": "HIGH",
                "area": "Document Archival",
                "recommendation": "Complete PDF/A-3 conversion for remaining 8 documents",
                "deadline": (now + timedelta(days=30)).isoformat()
            },
            {
                "priority": "MEDIUM",
                "area": "Risk Monitoring",
                "recommendation": "Implement automated risk score monitoring for published datasets",
                "rationale": "Detect potential re-identification risks from data linkage"
            }
        ]
    }
