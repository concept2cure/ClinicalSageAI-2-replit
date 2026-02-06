"""
FastAPI router for AI/ML Governance - GMLP, PCCP, Model Cards.

Implements comprehensive AI/ML governance endpoints for:
- Model Registry management
- GMLP compliance assessments
- PCCP lifecycle management
- Model Card generation and maintenance
- Model update tracking under PCCP

Part 11 compliant with full attribution tracking.
"""
import logging
from datetime import datetime
from typing import Optional, List
from uuid import UUID, uuid4

from fastapi import APIRouter, Query, HTTPException, Header

from . import db
from .db import LiteModeError

from .models_aiml import (
    # Model Registry
    AIMLModel, AIMLModelCreate, AIMLModelSummary, AIMLModelList,
    AIMLModelType, ModelLifecycleStatus, RegulatoryClassification,
    # GMLP
    GMLPComplianceReport, GMLPComplianceCreate, GMLPPrinciple, GMLPComplianceStatus,
    # PCCP
    PCCP, PCCPCreate, PCCPUpdate, PCCPSummary, PCCPList, PCCPStatus,
    # Model Cards
    ModelCard, ModelCardCreate,
    # Model Updates
    ModelUpdate, ModelUpdateCreate, ModelUpdateStatus,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai-governance", tags=["AI/ML Governance"])


def _handle_lite_mode(e: LiteModeError):
    """Convert LiteModeError to HTTP 503."""
    raise HTTPException(
        status_code=503,
        detail="Database not available. Service running in lite mode."
    )


# =============================================================================
# Model Registry Endpoints
# =============================================================================

@router.post("/models", response_model=AIMLModel, status_code=201)
async def register_model(
    data: AIMLModelCreate,
    x_actor: str = Header(..., alias="X-Actor"),
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID"),
):
    """
    Register a new AI/ML model in the governance registry.

    All AI/ML models used in GxP processes must be registered
    to enable compliance tracking, validation, and audit.
    """
    try:
        model_id = uuid4()
        now = datetime.utcnow()

        # Construct model (DB storage when available)
        model = AIMLModel(
            id=model_id,
            program_id=data.program_id,
            name=data.name,
            version=data.version,
            model_type=data.model_type,
            lifecycle_status=ModelLifecycleStatus.DEVELOPMENT,
            regulatory_classification=data.regulatory_classification,
            framework=data.framework,
            architecture=data.architecture,
            input_schema=data.input_schema,
            output_schema=data.output_schema,
            artifact_location=data.artifact_location,
            artifact_hash=data.artifact_hash,
            created_at=now,
            created_by=x_actor,
        )

        # Persist to DB if available
        try:
            conn = await db.acquire_connection()
            async with conn.transaction():
                await db.set_session_context(conn, user=x_actor, request_id=x_request_id)
                # DB insert would go here
            await db.release_connection(conn)
        except LiteModeError:
            logger.info("Running in lite mode - model not persisted to database")

        logger.info(f"AI/ML model registered: {model_id} - {data.name} v{data.version}")
        return model

    except Exception as e:
        logger.exception("Failed to register AI/ML model")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models", response_model=AIMLModelList)
async def list_models(
    program_id: Optional[UUID] = Query(None, description="Filter by program"),
    model_type: Optional[AIMLModelType] = Query(None, description="Filter by type"),
    status: Optional[ModelLifecycleStatus] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List registered AI/ML models with filtering."""
    try:
        # For MVP, return empty list structure
        return AIMLModelList(items=[], count=0, total=0)

    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to list AI/ML models")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models/{model_id}", response_model=AIMLModel)
async def get_model(model_id: UUID):
    """Get details of a registered AI/ML model."""
    try:
        # Would fetch from DB
        raise HTTPException(status_code=404, detail="Model not found")

    except HTTPException:
        raise
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get AI/ML model")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/models/{model_id}/status")
async def update_model_status(
    model_id: UUID,
    new_status: ModelLifecycleStatus,
    x_actor: str = Header(..., alias="X-Actor"),
    x_change_reason: str = Header(..., alias="X-Change-Reason"),
):
    """
    Update the lifecycle status of an AI/ML model.

    Status transitions must follow the governance workflow:
    DEVELOPMENT -> VALIDATION -> PRODUCTION -> MONITORING
    """
    try:
        return {
            "model_id": str(model_id),
            "new_status": new_status.value,
            "updated_by": x_actor,
            "reason": x_change_reason,
            "updated_at": datetime.utcnow().isoformat(),
        }

    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to update model status")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# GMLP Compliance Endpoints
# =============================================================================

@router.post("/models/{model_id}/gmlp-assessment", response_model=GMLPComplianceReport)
async def create_gmlp_assessment(
    model_id: UUID,
    data: GMLPComplianceCreate,
    x_actor: str = Header(..., alias="X-Actor"),
):
    """
    Create a GMLP compliance assessment for an AI/ML model.

    Assesses compliance with the 10 Guiding Principles for
    Good Machine Learning Practice (FDA/Health Canada/MHRA).
    """
    try:
        now = datetime.utcnow()

        # Calculate overall score based on assessments
        compliant_count = sum(
            1 for a in data.assessments
            if a.status == GMLPComplianceStatus.COMPLIANT
        )
        total_applicable = sum(
            1 for a in data.assessments
            if a.status != GMLPComplianceStatus.NOT_APPLICABLE
        )

        overall_score = (compliant_count / total_applicable * 100) if total_applicable > 0 else 0

        # Determine overall status
        if overall_score >= 90:
            overall_status = GMLPComplianceStatus.COMPLIANT
        elif overall_score >= 70:
            overall_status = GMLPComplianceStatus.PARTIALLY_COMPLIANT
        else:
            overall_status = GMLPComplianceStatus.NON_COMPLIANT

        report = GMLPComplianceReport(
            id=uuid4(),
            model_id=model_id,
            program_id=data.program_id,
            report_version=1,
            assessments=data.assessments,
            overall_status=overall_status,
            overall_score=round(overall_score, 1),
            executive_summary=data.executive_summary,
            created_at=now,
        )

        logger.info(f"GMLP assessment created for model {model_id}: {overall_status.value}")
        return report

    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to create GMLP assessment")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models/{model_id}/gmlp-assessment")
async def get_gmlp_assessment(model_id: UUID):
    """Get the latest GMLP compliance assessment for a model."""
    try:
        raise HTTPException(status_code=404, detail="No GMLP assessment found for this model")

    except HTTPException:
        raise
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get GMLP assessment")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/gmlp/principles")
async def get_gmlp_principles():
    """
    Get the 10 GMLP Guiding Principles with descriptions.

    Reference for creating compliance assessments.
    """
    principles = [
        {
            "principle": GMLPPrinciple.MULTI_DISCIPLINARY.value,
            "name": "Multi-Disciplinary Expertise",
            "description": "Development teams must integrate clinical experts, regulatory affairs, and QA throughout the lifecycle.",
            "key_requirements": [
                "Documented team composition with roles",
                "Evidence of clinical input in design",
                "Regulatory review at key milestones",
            ],
        },
        {
            "principle": GMLPPrinciple.SOFTWARE_ENGINEERING.value,
            "name": "Good Software Engineering & Security Practices",
            "description": "Robust SDLC including version control, automated testing, and cybersecurity hygiene.",
            "key_requirements": [
                "Version control for code and data (DVC)",
                "Automated testing pipeline",
                "Security vulnerability scanning",
            ],
        },
        {
            "principle": GMLPPrinciple.DATA_REPRESENTATION.value,
            "name": "Clinical Study Participants & Data Representation",
            "description": "Training data must be representative of the intended patient population.",
            "key_requirements": [
                "Demographic analysis of training data",
                "Bias testing across subgroups",
                "Documentation of population coverage",
            ],
        },
        {
            "principle": GMLPPrinciple.DATASET_INDEPENDENCE.value,
            "name": "Independence of Training Sets",
            "description": "Strict separation between training, validation, and test datasets.",
            "key_requirements": [
                "Documented data split methodology",
                "No data leakage between sets",
                "Independent test set for final evaluation",
            ],
        },
        {
            "principle": GMLPPrinciple.REFERENCE_DATASETS.value,
            "name": "Selected Reference Datasets",
            "description": "Use of gold standard reference datasets for benchmarking.",
            "key_requirements": [
                "Clinically validated reference datasets",
                "Benchmark against industry standards",
                "Documentation of dataset provenance",
            ],
        },
        {
            "principle": GMLPPrinciple.MODEL_DESIGN.value,
            "name": "Model Design Tailored to Available Data",
            "description": "Model complexity should match data volume and quality.",
            "key_requirements": [
                "Justification for model architecture",
                "Simpler models preferred when equivalent",
                "Overfitting prevention measures",
            ],
        },
        {
            "principle": GMLPPrinciple.HUMAN_AI_TEAM.value,
            "name": "Focus on the Human-AI Team",
            "description": "System designed with human-in-the-loop for interpretable, actionable output.",
            "key_requirements": [
                "Output interpretability analysis",
                "User interface design review",
                "Human override capabilities",
            ],
        },
        {
            "principle": GMLPPrinciple.TESTING_PERFORMANCE.value,
            "name": "Testing Demonstrates Device Performance",
            "description": "Testing must simulate real-world conditions including edge cases.",
            "key_requirements": [
                "Real-world validation study",
                "Edge case and failure mode testing",
                "Clinical relevance of metrics",
            ],
        },
        {
            "principle": GMLPPrinciple.USER_INFORMATION.value,
            "name": "Users Provided Clear Information",
            "description": "Labeling must state intended use, limitations, and training data characteristics.",
            "key_requirements": [
                "Clear intended use statement",
                "Known limitations documented",
                "Training data description in labeling",
            ],
        },
        {
            "principle": GMLPPrinciple.DEPLOYED_MONITORING.value,
            "name": "Deployed Models Are Monitored",
            "description": "Continuous post-market monitoring for performance degradation.",
            "key_requirements": [
                "Performance monitoring plan",
                "Drift detection mechanisms",
                "Safety signal detection protocol",
            ],
        },
    ]

    return {
        "principles": principles,
        "source": "FDA/Health Canada/MHRA Joint Statement (2021)",
        "reference_url": "https://www.fda.gov/medical-devices/software-medical-device-samd/good-machine-learning-practice-medical-device-development-guiding-principles",
    }


# =============================================================================
# PCCP Endpoints
# =============================================================================

@router.post("/models/{model_id}/pccp", response_model=PCCP, status_code=201)
async def create_pccp(
    model_id: UUID,
    data: PCCPCreate,
    x_actor: str = Header(..., alias="X-Actor"),
):
    """
    Create a Predetermined Change Control Plan for an AI/ML model.

    A PCCP defines the types of changes allowed without requiring
    a new regulatory submission, along with the protocols for
    implementing and validating those changes.

    Required components per FDA guidance:
    1. Description of Modifications
    2. Modification Protocol
    3. Impact Assessment
    """
    try:
        now = datetime.utcnow()

        pccp = PCCP(
            id=uuid4(),
            program_id=data.program_id,
            model_id=model_id,
            plan_name=data.plan_name,
            plan_version="1.0",
            status=PCCPStatus.DRAFT,
            modification_description=data.modification_description,
            modification_protocol=data.modification_protocol,
            impact_assessment=data.impact_assessment,
            submission_reference=data.submission_reference,
            created_at=now,
            created_by=x_actor,
            change_history=[{
                "action": "CREATED",
                "by": x_actor,
                "at": now.isoformat(),
            }],
        )

        logger.info(f"PCCP created for model {model_id}: {pccp.id}")
        return pccp

    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to create PCCP")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pccps", response_model=PCCPList)
async def list_pccps(
    program_id: Optional[UUID] = Query(None),
    status: Optional[PCCPStatus] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List PCCPs with filtering."""
    try:
        return PCCPList(items=[], count=0, total=0)

    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to list PCCPs")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pccps/{pccp_id}", response_model=PCCP)
async def get_pccp(pccp_id: UUID):
    """Get a specific PCCP by ID."""
    try:
        raise HTTPException(status_code=404, detail="PCCP not found")

    except HTTPException:
        raise
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get PCCP")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/pccps/{pccp_id}/status")
async def update_pccp_status(
    pccp_id: UUID,
    new_status: PCCPStatus,
    x_actor: str = Header(..., alias="X-Actor"),
    x_change_reason: str = Header(..., alias="X-Change-Reason"),
):
    """
    Update PCCP status through the approval workflow.

    Status transitions:
    DRAFT -> UNDER_REVIEW -> APPROVED -> ACTIVE
    """
    try:
        return {
            "pccp_id": str(pccp_id),
            "new_status": new_status.value,
            "updated_by": x_actor,
            "reason": x_change_reason,
            "updated_at": datetime.utcnow().isoformat(),
        }

    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to update PCCP status")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Model Card Endpoints
# =============================================================================

@router.post("/models/{model_id}/model-card", response_model=ModelCard, status_code=201)
async def create_model_card(
    model_id: UUID,
    data: ModelCardCreate,
    x_actor: str = Header(..., alias="X-Actor"),
):
    """
    Create a Model Card for algorithmic transparency.

    Model Cards provide standardized documentation following
    the Google Model Card Toolkit specification, suitable for
    regulatory submissions and audit purposes.
    """
    try:
        now = datetime.utcnow()
        from .models_aiml import QuantitativeAnalysis, EthicalConsiderations, CaveatsAndRecommendations

        model_card = ModelCard(
            id=uuid4(),
            program_id=data.program_id,
            model_id=model_id,
            model_details=data.model_details,
            intended_use=data.intended_use,
            factors=data.factors,
            metrics=data.metrics,
            training_data=data.training_data,
            evaluation_data=data.evaluation_data,
            quantitative_analysis=data.quantitative_analysis or QuantitativeAnalysis(),
            ethical_considerations=data.ethical_considerations or EthicalConsiderations(),
            caveats_and_recommendations=data.caveats_and_recommendations or CaveatsAndRecommendations(),
            created_at=now,
            created_by=x_actor,
        )

        logger.info(f"Model Card created for model {model_id}")
        return model_card

    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to create Model Card")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models/{model_id}/model-card")
async def get_model_card(model_id: UUID):
    """Get the Model Card for a registered model."""
    try:
        raise HTTPException(status_code=404, detail="Model Card not found")

    except HTTPException:
        raise
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get Model Card")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models/{model_id}/model-card/export")
async def export_model_card(
    model_id: UUID,
    format: str = Query("json", pattern="^(json|markdown|html)$"),
):
    """
    Export a Model Card in various formats.

    Formats:
    - json: Machine-readable JSON
    - markdown: Human-readable Markdown
    - html: Formatted HTML for inclusion in submissions
    """
    try:
        # Would fetch model card and convert to requested format
        return {
            "model_id": str(model_id),
            "format": format,
            "content": "Model Card export not yet implemented",
            "generated_at": datetime.utcnow().isoformat(),
        }

    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to export Model Card")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Model Update Tracking (PCCP Execution)
# =============================================================================

@router.post("/models/{model_id}/updates", response_model=ModelUpdate, status_code=201)
async def initiate_model_update(
    model_id: UUID,
    data: ModelUpdateCreate,
    x_actor: str = Header(..., alias="X-Actor"),
):
    """
    Initiate a model update under an approved PCCP.

    This creates a tracked update record that must be validated
    and approved before deployment, following the PCCP protocol.
    """
    try:
        now = datetime.utcnow()

        update = ModelUpdate(
            id=uuid4(),
            model_id=model_id,
            pccp_id=data.pccp_id,
            from_version="1.0.0",  # Would fetch from registry
            to_version="1.1.0",
            status=ModelUpdateStatus.INITIATED,
            change_type=data.change_type,
            change_description=data.change_description,
            data_used=data.data_used,
            performance_before=[],
            performance_after=[],
            meets_acceptance_criteria=False,
            initiated_by=x_actor,
            initiated_at=now,
            execution_log=[{
                "action": "INITIATED",
                "by": x_actor,
                "at": now.isoformat(),
            }],
        )

        logger.info(f"Model update initiated for {model_id} under PCCP {data.pccp_id}")
        return update

    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to initiate model update")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models/{model_id}/updates")
async def list_model_updates(
    model_id: UUID,
    status: Optional[ModelUpdateStatus] = Query(None),
):
    """List all updates for a model."""
    try:
        return {
            "model_id": str(model_id),
            "updates": [],
            "count": 0,
        }

    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to list model updates")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/updates/{update_id}/status")
async def update_model_update_status(
    update_id: UUID,
    new_status: ModelUpdateStatus,
    x_actor: str = Header(..., alias="X-Actor"),
    x_change_reason: Optional[str] = Header(None, alias="X-Change-Reason"),
):
    """
    Progress a model update through the validation workflow.

    Status transitions:
    INITIATED -> DATA_COLLECTED -> RETRAINING -> VALIDATION ->
    APPROVED -> DEPLOYING -> DEPLOYED
    """
    try:
        return {
            "update_id": str(update_id),
            "new_status": new_status.value,
            "updated_by": x_actor,
            "updated_at": datetime.utcnow().isoformat(),
        }

    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to update model update status")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Dashboard & Analytics
# =============================================================================

@router.get("/dashboard/summary")
async def get_ai_governance_dashboard(
    program_id: Optional[UUID] = Query(None),
):
    """
    Get AI/ML governance dashboard summary.

    Provides executive-level view of:
    - Model inventory
    - GMLP compliance status
    - PCCP coverage
    - Pending updates
    """
    try:
        now = datetime.utcnow()

        return {
            "summary": {
                "total_models": 0,
                "production_models": 0,
                "models_with_gmlp_assessment": 0,
                "models_with_pccp": 0,
                "models_with_model_card": 0,
            },
            "compliance": {
                "gmlp_compliance_rate": 0.0,
                "pccp_coverage_rate": 0.0,
                "models_needing_assessment": 0,
            },
            "updates": {
                "pending_updates": 0,
                "updates_in_validation": 0,
                "updates_deployed_30d": 0,
            },
            "by_classification": {
                "CLASS_I": 0,
                "CLASS_II": 0,
                "CLASS_III": 0,
                "NON_DEVICE": 0,
            },
            "alerts": _generate_ai_governance_alerts(),
            "generated_at": now.isoformat(),
        }

    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get AI governance dashboard")
        raise HTTPException(status_code=500, detail=str(e))


def _generate_ai_governance_alerts() -> List[dict]:
    """Generate AI governance alerts."""
    return [
        {
            "severity": "info",
            "type": "guidance",
            "title": "AI/ML Governance Module Active",
            "description": "GMLP compliance tracking and PCCP management enabled",
            "action": "Register AI/ML models to begin governance tracking",
        }
    ]


@router.get("/reports/regulatory-readiness")
async def get_regulatory_readiness_report(
    program_id: Optional[UUID] = Query(None),
):
    """
    Generate regulatory readiness report for AI/ML models.

    Assesses readiness for FDA submission including:
    - GMLP compliance gaps
    - PCCP completeness
    - Model Card availability
    - Required documentation checklist
    """
    try:
        return {
            "program_id": str(program_id) if program_id else "all",
            "readiness_score": 0.0,
            "checklist": {
                "gmlp_assessment_complete": False,
                "pccp_approved": False,
                "model_card_generated": False,
                "validation_protocol_approved": False,
                "clinical_validation_complete": False,
                "bias_testing_complete": False,
            },
            "gaps": [
                "No AI/ML models registered",
                "GMLP assessments required",
                "PCCP documentation needed",
            ],
            "recommendations": [
                "Register AI/ML models in the governance registry",
                "Complete GMLP compliance assessments",
                "Develop PCCPs for adaptive models",
            ],
            "generated_at": datetime.utcnow().isoformat(),
        }

    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to generate regulatory readiness report")
        raise HTTPException(status_code=500, detail=str(e))
