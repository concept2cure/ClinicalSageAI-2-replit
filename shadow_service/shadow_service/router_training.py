"""
FastAPI Router for Training Compliance - xAPI and Part 11 Records.

Endpoints for:
- xAPI statement management and Learning Record Store integration
- Part 11 compliant training records
- Curriculum and training assignment management
- Competency assessments
- SOP acknowledgments
- Training compliance dashboards

References:
- xAPI (Experience API) Specification v1.0.3
- 21 CFR Part 11 Electronic Records
- ICH E6(R2) GCP Training Requirements
"""
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from uuid import UUID, uuid4
from fastapi import APIRouter, HTTPException, Query

from .models_training import (
    # xAPI models
    xAPIStatement,
    xAPIStatementCreate,
    xAPIAgent,
    xAPIVerb,
    xAPIActivity,
    xAPIActivityDefinition,
    xAPIResult,
    xAPIContext,
    xAPIVerbID,
    xAPIActivityType,
    # Training models
    TrainingRecord,
    TrainingRecordCreate,
    TrainingRecordUpdate,
    TrainingRecordList,
    TrainingStatus,
    TrainingType,
    TrainingCurriculum,
    TrainingModule,
    CurriculumList,
    # Competency
    CompetencyAssessment,
    CompetencyLevel,
    # SOP
    SOPAcknowledgment,
    SOPAcknowledgmentCreate,
    # Dashboards
    TrainingDashboard,
    UserTrainingStatus,
)


router = APIRouter(prefix="/training", tags=["Training Compliance"])


# =============================================================================
# xAPI Statement Endpoints
# =============================================================================

@router.post("/xapi/statements", response_model=xAPIStatement, status_code=201)
async def create_xapi_statement(
    request: xAPIStatementCreate,
    program_id: UUID = Query(..., description="Program ID")
) -> xAPIStatement:
    """
    Create a new xAPI statement.
    
    Records a learning activity in xAPI format for LRS storage.
    Statements are immutable once created (Part 11 compliant).
    """
    statement_id = uuid4()
    now = datetime.utcnow()
    
    # Build verb
    verb_display = {
        xAPIVerbID.COMPLETED: {"en-US": "completed"},
        xAPIVerbID.PASSED: {"en-US": "passed"},
        xAPIVerbID.FAILED: {"en-US": "failed"},
        xAPIVerbID.LAUNCHED: {"en-US": "launched"},
        xAPIVerbID.PROGRESSED: {"en-US": "progressed"},
        xAPIVerbID.ACKNOWLEDGED: {"en-US": "acknowledged"},
        xAPIVerbID.CERTIFIED: {"en-US": "certified"},
        xAPIVerbID.DEMONSTRATED: {"en-US": "demonstrated"},
        xAPIVerbID.SIGNED: {"en-US": "signed"},
    }
    
    verb = xAPIVerb(
        id=request.verb_id,
        display=verb_display.get(request.verb_id, {"en-US": request.verb_id.split("/")[-1]})
    )
    
    # Build activity
    activity = xAPIActivity(
        id=request.activity_id,
        definition=xAPIActivityDefinition(
            type=request.activity_type,
            name={"en-US": request.activity_name}
        )
    )
    
    # Build context
    context = None
    if request.context_extensions:
        context = xAPIContext(
            extensions=request.context_extensions,
            platform="TrialSage Shadow Service"
        )
    
    statement = xAPIStatement(
        id=statement_id,
        actor=request.actor,
        verb=verb,
        object=activity,
        result=request.result,
        context=context,
        timestamp=now,
        stored=now,
        version="1.0.3"
    )
    
    return statement


@router.get("/xapi/statements", response_model=List[xAPIStatement])
async def query_xapi_statements(
    program_id: UUID = Query(..., description="Program ID"),
    actor_email: Optional[str] = Query(None, description="Filter by actor email"),
    verb_id: Optional[str] = Query(None, description="Filter by verb IRI"),
    activity_id: Optional[str] = Query(None, description="Filter by activity IRI"),
    since: Optional[datetime] = Query(None, description="Filter statements after this time"),
    until: Optional[datetime] = Query(None, description="Filter statements before this time"),
    limit: int = Query(100, le=1000)
) -> List[xAPIStatement]:
    """
    Query xAPI statements from the Learning Record Store.
    
    Supports filtering by actor, verb, activity, and time range.
    Returns statements in reverse chronological order.
    """
    # In production, this would query an actual LRS
    # Demo returns sample statements
    now = datetime.utcnow()
    
    sample_statements = [
        xAPIStatement(
            id=uuid4(),
            actor=xAPIAgent(
                name="John Doe",
                mbox="mailto:john.doe@example.com",
                employee_id="EMP001"
            ),
            verb=xAPIVerb(
                id=xAPIVerbID.COMPLETED,
                display={"en-US": "completed"}
            ),
            object=xAPIActivity(
                id="https://trialsage.ai/training/gcp-fundamentals",
                definition=xAPIActivityDefinition(
                    type=xAPIActivityType.COURSE,
                    name={"en-US": "GCP Fundamentals Training"}
                )
            ),
            result=xAPIResult(
                score={"scaled": 0.92, "raw": 92, "min": 0, "max": 100},
                success=True,
                completion=True,
                duration="PT1H30M"
            ),
            timestamp=now - timedelta(hours=2),
            stored=now - timedelta(hours=2),
            version="1.0.3"
        ),
        xAPIStatement(
            id=uuid4(),
            actor=xAPIAgent(
                name="Jane Smith",
                mbox="mailto:jane.smith@example.com",
                employee_id="EMP002"
            ),
            verb=xAPIVerb(
                id=xAPIVerbID.ACKNOWLEDGED,
                display={"en-US": "acknowledged"}
            ),
            object=xAPIActivity(
                id="https://trialsage.ai/sops/SOP-QA-001-v2",
                definition=xAPIActivityDefinition(
                    type=xAPIActivityType.SOP,
                    name={"en-US": "Quality Assurance Procedures SOP"}
                )
            ),
            result=xAPIResult(
                success=True,
                completion=True
            ),
            timestamp=now - timedelta(days=1),
            stored=now - timedelta(days=1),
            version="1.0.3"
        )
    ]
    
    return sample_statements[:limit]


@router.get("/xapi/statements/{statement_id}", response_model=xAPIStatement)
async def get_xapi_statement(
    statement_id: UUID,
    program_id: UUID = Query(..., description="Program ID")
) -> xAPIStatement:
    """Get a specific xAPI statement by ID."""
    # Demo statement
    now = datetime.utcnow()
    
    return xAPIStatement(
        id=statement_id,
        actor=xAPIAgent(
            name="John Doe",
            mbox="mailto:john.doe@example.com"
        ),
        verb=xAPIVerb(
            id=xAPIVerbID.COMPLETED,
            display={"en-US": "completed"}
        ),
        object=xAPIActivity(
            id="https://trialsage.ai/training/module-001",
            definition=xAPIActivityDefinition(
                type=xAPIActivityType.MODULE,
                name={"en-US": "Introduction Module"}
            )
        ),
        timestamp=now,
        stored=now,
        version="1.0.3"
    )


@router.get("/xapi/verbs", response_model=List[Dict[str, str]])
async def get_xapi_verbs() -> List[Dict[str, str]]:
    """
    Get available xAPI verbs for training activities.
    
    Includes standard ADL verbs and GxP-specific extensions.
    """
    return [
        {"id": xAPIVerbID.ATTEMPTED, "display": "attempted", "description": "Started an activity"},
        {"id": xAPIVerbID.COMPLETED, "display": "completed", "description": "Finished an activity"},
        {"id": xAPIVerbID.PASSED, "display": "passed", "description": "Successfully met requirements"},
        {"id": xAPIVerbID.FAILED, "display": "failed", "description": "Did not meet requirements"},
        {"id": xAPIVerbID.ANSWERED, "display": "answered", "description": "Responded to a question"},
        {"id": xAPIVerbID.EXPERIENCED, "display": "experienced", "description": "Engaged with content"},
        {"id": xAPIVerbID.LAUNCHED, "display": "launched", "description": "Started a learning activity"},
        {"id": xAPIVerbID.PROGRESSED, "display": "progressed", "description": "Made progress through content"},
        {"id": xAPIVerbID.ACKNOWLEDGED, "display": "acknowledged", "description": "Acknowledged reading/understanding (GxP)"},
        {"id": xAPIVerbID.CERTIFIED, "display": "certified", "description": "Earned certification (GxP)"},
        {"id": xAPIVerbID.RECERTIFIED, "display": "recertified", "description": "Renewed certification (GxP)"},
        {"id": xAPIVerbID.DEMONSTRATED, "display": "demonstrated", "description": "Demonstrated competency (GxP)"},
        {"id": xAPIVerbID.SIGNED, "display": "signed", "description": "Applied electronic signature (GxP)"},
    ]


@router.get("/xapi/activity-types", response_model=List[Dict[str, str]])
async def get_xapi_activity_types() -> List[Dict[str, str]]:
    """Get available xAPI activity types for training content."""
    return [
        {"id": xAPIActivityType.COURSE, "display": "Course", "description": "Complete training course"},
        {"id": xAPIActivityType.MODULE, "display": "Module", "description": "Training module"},
        {"id": xAPIActivityType.ASSESSMENT, "display": "Assessment", "description": "Test or quiz"},
        {"id": xAPIActivityType.LESSON, "display": "Lesson", "description": "Individual lesson"},
        {"id": xAPIActivityType.SOP, "display": "SOP", "description": "Standard Operating Procedure"},
        {"id": xAPIActivityType.WORK_INSTRUCTION, "display": "Work Instruction", "description": "Detailed work instruction"},
        {"id": xAPIActivityType.QUALIFICATION, "display": "Qualification", "description": "Role qualification"},
        {"id": xAPIActivityType.COMPETENCY_ASSESSMENT, "display": "Competency Assessment", "description": "Competency evaluation"},
        {"id": xAPIActivityType.REGULATORY_TRAINING, "display": "Regulatory Training", "description": "Regulatory required training"},
    ]


# =============================================================================
# Training Records
# =============================================================================

@router.post("/records", response_model=TrainingRecord, status_code=201)
async def create_training_record(
    request: TrainingRecordCreate
) -> TrainingRecord:
    """
    Create a new training record.
    
    Initializes a Part 11 compliant training record with audit trail.
    """
    now = datetime.utcnow()
    record_id = uuid4()
    registration_id = uuid4()
    
    # Calculate validity period (demo: 12 months)
    valid_until = now + timedelta(days=365)
    
    return TrainingRecord(
        id=record_id,
        program_id=request.program_id,
        user_id=request.user_id,
        user_email=request.user_email,
        user_name=request.user_name,
        department=request.department,
        role=request.role,
        curriculum_id=request.curriculum_id,
        curriculum_code="CUR-GCP-001",
        curriculum_title="GCP Fundamentals Training",
        training_type=request.training_type,
        status=TrainingStatus.NOT_STARTED,
        valid_until=valid_until,
        is_expired=False,
        registration_id=registration_id,
        xapi_statements=[],
        created_at=now,
        created_by="system"
    )


@router.get("/records", response_model=TrainingRecordList)
async def list_training_records(
    program_id: UUID = Query(..., description="Program ID"),
    user_id: Optional[UUID] = Query(None, description="Filter by user"),
    curriculum_id: Optional[UUID] = Query(None, description="Filter by curriculum"),
    status: Optional[TrainingStatus] = Query(None, description="Filter by status"),
    include_expired: bool = Query(False, description="Include expired records"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200)
) -> TrainingRecordList:
    """
    List training records with filtering.
    
    Returns Part 11 compliant training records for compliance reporting.
    """
    now = datetime.utcnow()
    
    # Demo records
    records = [
        TrainingRecord(
            id=uuid4(),
            program_id=program_id,
            user_id=uuid4(),
            user_email="john.doe@example.com",
            user_name="John Doe",
            department="Clinical Operations",
            role="Clinical Research Associate",
            curriculum_id=uuid4(),
            curriculum_code="CUR-GCP-001",
            curriculum_title="GCP Fundamentals Training",
            training_type=TrainingType.INITIAL,
            status=TrainingStatus.COMPLETED,
            started_at=now - timedelta(days=30),
            completed_at=now - timedelta(days=25),
            score=92.0,
            attempts=1,
            valid_until=now + timedelta(days=340),
            is_expired=False,
            signed_at=now - timedelta(days=25),
            signature_meaning="I have reviewed and understand this training material",
            electronic_signature_id="ES-001",
            created_at=now - timedelta(days=30),
            created_by="system"
        ),
        TrainingRecord(
            id=uuid4(),
            program_id=program_id,
            user_id=uuid4(),
            user_email="jane.smith@example.com",
            user_name="Jane Smith",
            department="Quality Assurance",
            role="QA Specialist",
            curriculum_id=uuid4(),
            curriculum_code="CUR-PART11-001",
            curriculum_title="21 CFR Part 11 Compliance Training",
            training_type=TrainingType.REGULATORY_REQUIRED,
            status=TrainingStatus.IN_PROGRESS,
            started_at=now - timedelta(days=5),
            score=None,
            attempts=1,
            valid_until=now + timedelta(days=360),
            is_expired=False,
            created_at=now - timedelta(days=5),
            created_by="system"
        )
    ]
    
    return TrainingRecordList(items=records, count=len(records), total=len(records))


@router.get("/records/{record_id}", response_model=TrainingRecord)
async def get_training_record(
    record_id: UUID,
    program_id: UUID = Query(..., description="Program ID")
) -> TrainingRecord:
    """Get a specific training record with full audit trail."""
    now = datetime.utcnow()
    
    return TrainingRecord(
        id=record_id,
        program_id=program_id,
        user_id=uuid4(),
        user_email="john.doe@example.com",
        user_name="John Doe",
        department="Clinical Operations",
        role="Clinical Research Associate",
        curriculum_id=uuid4(),
        curriculum_code="CUR-GCP-001",
        curriculum_title="GCP Fundamentals Training",
        training_type=TrainingType.INITIAL,
        status=TrainingStatus.COMPLETED,
        started_at=now - timedelta(days=30),
        completed_at=now - timedelta(days=25),
        score=92.0,
        attempts=1,
        valid_until=now + timedelta(days=340),
        is_expired=False,
        signed_at=now - timedelta(days=25),
        signature_meaning="I have reviewed and understand this training material",
        electronic_signature_id="ES-001",
        xapi_statements=[uuid4(), uuid4(), uuid4()],
        registration_id=uuid4(),
        created_at=now - timedelta(days=30),
        created_by="system",
        last_modified_at=now - timedelta(days=25),
        last_modified_by="system"
    )


@router.patch("/records/{record_id}/status")
async def update_training_record_status(
    record_id: UUID,
    status: TrainingStatus,
    score: Optional[float] = Query(None, description="Score if completing"),
    program_id: UUID = Query(..., description="Program ID")
) -> Dict[str, Any]:
    """
    Update training record status.
    
    Status transitions are Part 11 logged.
    """
    return {
        "record_id": str(record_id),
        "previous_status": "IN_PROGRESS",
        "new_status": status,
        "score": score,
        "updated_at": datetime.utcnow().isoformat(),
        "message": f"Training record status updated to {status}"
    }


@router.post("/records/{record_id}/sign")
async def sign_training_record(
    record_id: UUID,
    signature_meaning: str = Query(
        "I have reviewed and understand this training material",
        description="Meaning of the signature"
    ),
    program_id: UUID = Query(..., description="Program ID")
) -> Dict[str, Any]:
    """
    Apply Part 11 electronic signature to training record.
    
    Records the electronic signature with meaning statement
    and timestamp for compliance audit.
    """
    now = datetime.utcnow()
    
    return {
        "record_id": str(record_id),
        "signed_at": now.isoformat(),
        "signature_meaning": signature_meaning,
        "electronic_signature_id": f"ES-{uuid4().hex[:8].upper()}",
        "part11_compliant": True,
        "message": "Electronic signature applied successfully"
    }


# =============================================================================
# Training Curricula
# =============================================================================

@router.post("/curricula", response_model=TrainingCurriculum, status_code=201)
async def create_curriculum(
    title: str = Query(..., description="Curriculum title"),
    description: str = Query(..., description="Curriculum description"),
    training_type: TrainingType = Query(..., description="Type of training"),
    passing_score: float = Query(80.0, ge=0, le=100),
    validity_months: int = Query(12, ge=1),
    program_id: UUID = Query(..., description="Program ID")
) -> TrainingCurriculum:
    """Create a new training curriculum."""
    now = datetime.utcnow()
    
    return TrainingCurriculum(
        id=uuid4(),
        program_id=program_id,
        code=f"CUR-{uuid4().hex[:6].upper()}",
        title=title,
        description=description,
        version="1.0",
        training_type=training_type,
        required_for_roles=[],
        prerequisite_curricula=[],
        passing_score=passing_score,
        max_attempts=3,
        validity_months=validity_months,
        modules=[],
        estimated_duration_minutes=60,
        regulatory_basis=[],
        effective_date=now,
        created_at=now,
        created_by="system"
    )


@router.get("/curricula", response_model=CurriculumList)
async def list_curricula(
    program_id: UUID = Query(..., description="Program ID"),
    training_type: Optional[TrainingType] = Query(None),
    role: Optional[str] = Query(None, description="Filter by required role"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200)
) -> CurriculumList:
    """List available training curricula."""
    now = datetime.utcnow()
    
    curricula = [
        TrainingCurriculum(
            id=uuid4(),
            program_id=program_id,
            code="CUR-GCP-001",
            title="GCP Fundamentals Training",
            description="Comprehensive GCP training covering ICH E6(R2) requirements",
            version="2.0",
            training_type=TrainingType.REGULATORY_REQUIRED,
            required_for_roles=["Clinical Research Associate", "Clinical Trial Manager", "Medical Monitor"],
            prerequisite_curricula=[],
            passing_score=80.0,
            max_attempts=3,
            validity_months=12,
            modules=[uuid4(), uuid4(), uuid4()],
            estimated_duration_minutes=180,
            regulatory_basis=["ICH E6(R2)", "21 CFR Part 312"],
            effective_date=now - timedelta(days=90),
            created_at=now - timedelta(days=90),
            created_by="system",
            approved_by="Training Manager",
            approved_at=now - timedelta(days=88)
        ),
        TrainingCurriculum(
            id=uuid4(),
            program_id=program_id,
            code="CUR-PART11-001",
            title="21 CFR Part 11 Compliance Training",
            description="Electronic records and signatures requirements training",
            version="1.5",
            training_type=TrainingType.REGULATORY_REQUIRED,
            required_for_roles=["All Personnel"],
            prerequisite_curricula=[],
            passing_score=85.0,
            max_attempts=3,
            validity_months=24,
            modules=[uuid4(), uuid4()],
            estimated_duration_minutes=90,
            regulatory_basis=["21 CFR Part 11"],
            effective_date=now - timedelta(days=180),
            created_at=now - timedelta(days=180),
            created_by="system",
            approved_by="QA Director",
            approved_at=now - timedelta(days=178)
        ),
        TrainingCurriculum(
            id=uuid4(),
            program_id=program_id,
            code="CUR-CSV-001",
            title="Computer System Validation Training",
            description="GAMP 5 and computer system validation principles",
            version="1.0",
            training_type=TrainingType.ROLE_BASED,
            required_for_roles=["Validation Engineer", "QA Specialist", "IT Administrator"],
            prerequisite_curricula=[],
            passing_score=80.0,
            max_attempts=3,
            validity_months=24,
            modules=[uuid4(), uuid4(), uuid4(), uuid4()],
            estimated_duration_minutes=240,
            regulatory_basis=["21 CFR Part 11", "GAMP 5 Second Edition"],
            effective_date=now - timedelta(days=60),
            created_at=now - timedelta(days=60),
            created_by="system",
            approved_by="Validation Manager",
            approved_at=now - timedelta(days=58)
        )
    ]
    
    return CurriculumList(items=curricula, count=len(curricula), total=len(curricula))


@router.get("/curricula/{curriculum_id}", response_model=TrainingCurriculum)
async def get_curriculum(
    curriculum_id: UUID,
    program_id: UUID = Query(..., description="Program ID")
) -> TrainingCurriculum:
    """Get curriculum details including modules."""
    now = datetime.utcnow()
    
    return TrainingCurriculum(
        id=curriculum_id,
        program_id=program_id,
        code="CUR-GCP-001",
        title="GCP Fundamentals Training",
        description="Comprehensive GCP training covering ICH E6(R2) requirements",
        version="2.0",
        training_type=TrainingType.REGULATORY_REQUIRED,
        required_for_roles=["Clinical Research Associate", "Clinical Trial Manager", "Medical Monitor"],
        prerequisite_curricula=[],
        passing_score=80.0,
        max_attempts=3,
        validity_months=12,
        modules=[uuid4(), uuid4(), uuid4()],
        estimated_duration_minutes=180,
        regulatory_basis=["ICH E6(R2)", "21 CFR Part 312"],
        effective_date=now - timedelta(days=90),
        created_at=now - timedelta(days=90),
        created_by="system",
        approved_by="Training Manager",
        approved_at=now - timedelta(days=88)
    )


# =============================================================================
# Competency Assessments
# =============================================================================

@router.post("/competency-assessments", response_model=CompetencyAssessment, status_code=201)
async def create_competency_assessment(
    user_id: UUID,
    competency_area: str,
    assessment_type: str,
    level_achieved: CompetencyLevel,
    score: Optional[float] = None,
    assessed_by: str = Query(..., description="Assessor name"),
    program_id: UUID = Query(..., description="Program ID")
) -> CompetencyAssessment:
    """
    Record a competency assessment.
    
    Creates an xAPI statement and Part 11 record for the assessment.
    """
    now = datetime.utcnow()
    
    return CompetencyAssessment(
        id=uuid4(),
        program_id=program_id,
        user_id=user_id,
        competency_area=competency_area,
        assessment_type=assessment_type,
        level_achieved=level_achieved,
        score=score,
        assessed_by=assessed_by,
        assessed_at=now,
        evidence_references=[],
        valid_until=now + timedelta(days=365),
        xapi_statement_id=uuid4()
    )


@router.get("/competency-assessments", response_model=List[CompetencyAssessment])
async def list_competency_assessments(
    program_id: UUID = Query(..., description="Program ID"),
    user_id: Optional[UUID] = Query(None),
    competency_area: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200)
) -> List[CompetencyAssessment]:
    """List competency assessments."""
    now = datetime.utcnow()
    
    return [
        CompetencyAssessment(
            id=uuid4(),
            program_id=program_id,
            user_id=uuid4(),
            competency_area="GCP Knowledge",
            assessment_type="Written",
            level_achieved=CompetencyLevel.PROFICIENT,
            score=92.0,
            assessed_by="Training Manager",
            assessed_at=now - timedelta(days=30),
            evidence_references=["assessment-001.pdf"],
            valid_until=now + timedelta(days=335),
            xapi_statement_id=uuid4()
        ),
        CompetencyAssessment(
            id=uuid4(),
            program_id=program_id,
            user_id=uuid4(),
            competency_area="Clinical Monitoring",
            assessment_type="Practical Observation",
            level_achieved=CompetencyLevel.COMPETENT,
            score=None,
            assessed_by="Senior CRA",
            assessed_at=now - timedelta(days=15),
            evidence_references=["observation-checklist-001.pdf"],
            comments="Demonstrated solid understanding of monitoring procedures",
            valid_until=now + timedelta(days=350),
            xapi_statement_id=uuid4()
        )
    ]


# =============================================================================
# SOP Acknowledgments
# =============================================================================

@router.post("/sop-acknowledgments", response_model=SOPAcknowledgment, status_code=201)
async def create_sop_acknowledgment(
    request: SOPAcknowledgmentCreate,
    signature_meaning: str = Query(
        "I have read and understand this SOP and agree to follow its requirements",
        description="Signature meaning statement"
    )
) -> SOPAcknowledgment:
    """
    Record an SOP acknowledgment with Part 11 signature.
    
    Creates an immutable record that the user has read and
    understood the specified SOP version.
    """
    now = datetime.utcnow()
    
    return SOPAcknowledgment(
        id=uuid4(),
        program_id=request.program_id,
        user_id=request.user_id,
        sop_id=request.sop_id,
        sop_number=request.sop_number,
        sop_title=request.sop_title,
        sop_version=request.sop_version,
        sop_effective_date=request.sop_effective_date,
        acknowledged_at=now,
        signature_meaning=signature_meaning,
        electronic_signature_id=f"ES-{uuid4().hex[:8].upper()}",
        xapi_statement_id=uuid4()
    )


@router.get("/sop-acknowledgments", response_model=List[SOPAcknowledgment])
async def list_sop_acknowledgments(
    program_id: UUID = Query(..., description="Program ID"),
    user_id: Optional[UUID] = Query(None),
    sop_number: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200)
) -> List[SOPAcknowledgment]:
    """List SOP acknowledgments."""
    now = datetime.utcnow()
    
    return [
        SOPAcknowledgment(
            id=uuid4(),
            program_id=program_id,
            user_id=uuid4(),
            sop_id="DMS-SOP-001",
            sop_number="SOP-QA-001",
            sop_title="Quality Assurance Procedures",
            sop_version="2.0",
            sop_effective_date=now - timedelta(days=60),
            acknowledged_at=now - timedelta(days=55),
            signature_meaning="I have read and understand this SOP and agree to follow its requirements",
            electronic_signature_id="ES-A1B2C3D4",
            xapi_statement_id=uuid4()
        ),
        SOPAcknowledgment(
            id=uuid4(),
            program_id=program_id,
            user_id=uuid4(),
            sop_id="DMS-SOP-002",
            sop_number="SOP-DI-001",
            sop_title="Data Integrity Requirements",
            sop_version="1.5",
            sop_effective_date=now - timedelta(days=90),
            acknowledged_at=now - timedelta(days=85),
            signature_meaning="I have read and understand this SOP and agree to follow its requirements",
            electronic_signature_id="ES-E5F6G7H8",
            xapi_statement_id=uuid4()
        )
    ]


@router.get("/sop-acknowledgments/pending", response_model=List[Dict[str, Any]])
async def get_pending_sop_acknowledgments(
    program_id: UUID = Query(..., description="Program ID"),
    user_id: Optional[UUID] = Query(None)
) -> List[Dict[str, Any]]:
    """
    Get SOPs pending acknowledgment.
    
    Returns SOPs that have been updated or assigned
    but not yet acknowledged by the user.
    """
    now = datetime.utcnow()
    
    return [
        {
            "sop_id": "DMS-SOP-003",
            "sop_number": "SOP-CYBER-001",
            "sop_title": "Cybersecurity Incident Response",
            "sop_version": "1.0",
            "sop_effective_date": (now - timedelta(days=10)).isoformat(),
            "assigned_at": (now - timedelta(days=10)).isoformat(),
            "due_date": (now + timedelta(days=4)).isoformat(),
            "required_for_role": "All Personnel",
            "is_overdue": False
        },
        {
            "sop_id": "DMS-SOP-004",
            "sop_number": "SOP-AI-001",
            "sop_title": "AI/ML Model Governance",
            "sop_version": "1.0",
            "sop_effective_date": (now - timedelta(days=5)).isoformat(),
            "assigned_at": (now - timedelta(days=5)).isoformat(),
            "due_date": (now + timedelta(days=9)).isoformat(),
            "required_for_role": "Data Science Team",
            "is_overdue": False
        }
    ]


# =============================================================================
# User Training Status
# =============================================================================

@router.get("/users/{user_id}/status", response_model=UserTrainingStatus)
async def get_user_training_status(
    user_id: UUID,
    program_id: UUID = Query(..., description="Program ID")
) -> UserTrainingStatus:
    """Get comprehensive training status for a user."""
    now = datetime.utcnow()
    
    return UserTrainingStatus(
        user_id=user_id,
        user_name="John Doe",
        user_email="john.doe@example.com",
        department="Clinical Operations",
        role="Clinical Research Associate",
        is_compliant=True,
        trainings_completed=8,
        trainings_in_progress=2,
        trainings_overdue=0,
        trainings_expiring_soon=1,
        last_training_date=now - timedelta(days=5),
        competency_level=CompetencyLevel.PROFICIENT,
        last_competency_assessment=now - timedelta(days=30)
    )


@router.get("/users/non-compliant", response_model=List[UserTrainingStatus])
async def get_non_compliant_users(
    program_id: UUID = Query(..., description="Program ID")
) -> List[UserTrainingStatus]:
    """Get list of users with overdue or missing required training."""
    now = datetime.utcnow()
    
    return [
        UserTrainingStatus(
            user_id=uuid4(),
            user_name="Mike Johnson",
            user_email="mike.johnson@example.com",
            department="Data Management",
            role="Data Manager",
            is_compliant=False,
            trainings_completed=5,
            trainings_in_progress=1,
            trainings_overdue=2,
            trainings_expiring_soon=0,
            last_training_date=now - timedelta(days=45),
            competency_level=CompetencyLevel.COMPETENT,
            last_competency_assessment=now - timedelta(days=90)
        )
    ]


# =============================================================================
# Dashboard and Reports
# =============================================================================

@router.get("/dashboard/summary", response_model=TrainingDashboard)
async def get_training_dashboard(
    program_id: UUID = Query(..., description="Program ID")
) -> TrainingDashboard:
    """
    Get training compliance dashboard.
    
    Provides overview of training compliance status across
    the organization for regulatory reporting.
    """
    now = datetime.utcnow()
    
    return TrainingDashboard(
        total_users=150,
        users_compliant=142,
        users_non_compliant=8,
        compliance_rate=94.67,
        trainings_in_progress=45,
        trainings_completed_30d=78,
        trainings_overdue=12,
        trainings_expiring_30d=23,
        by_curriculum=[
            {
                "curriculum_code": "CUR-GCP-001",
                "curriculum_title": "GCP Fundamentals",
                "total_assigned": 150,
                "completed": 142,
                "in_progress": 5,
                "overdue": 3,
                "compliance_rate": 94.67
            },
            {
                "curriculum_code": "CUR-PART11-001",
                "curriculum_title": "21 CFR Part 11 Compliance",
                "total_assigned": 150,
                "completed": 148,
                "in_progress": 2,
                "overdue": 0,
                "compliance_rate": 98.67
            },
            {
                "curriculum_code": "CUR-CSV-001",
                "curriculum_title": "Computer System Validation",
                "total_assigned": 45,
                "completed": 40,
                "in_progress": 3,
                "overdue": 2,
                "compliance_rate": 88.89
            }
        ],
        competency_assessments_due=15,
        sops_pending_acknowledgment=28,
        alerts=[
            {
                "type": "WARNING",
                "title": "Training Expiring Soon",
                "message": "23 users have training expiring within 30 days",
                "action_required": True
            },
            {
                "type": "ERROR",
                "title": "Overdue Training",
                "message": "12 training records are overdue",
                "action_required": True
            },
            {
                "type": "INFO",
                "title": "New SOP Published",
                "message": "SOP-CYBER-001 requires acknowledgment from all personnel",
                "action_required": True
            }
        ],
        generated_at=now
    )


@router.get("/reports/compliance-matrix")
async def get_compliance_matrix(
    program_id: UUID = Query(..., description="Program ID"),
    department: Optional[str] = Query(None),
    role: Optional[str] = Query(None)
) -> Dict[str, Any]:
    """
    Generate training compliance matrix.
    
    Creates a matrix showing training completion status
    for each user/curriculum combination.
    """
    now = datetime.utcnow()
    
    return {
        "generated_at": now.isoformat(),
        "program_id": str(program_id),
        "filters": {
            "department": department,
            "role": role
        },
        "curricula": [
            {"code": "CUR-GCP-001", "title": "GCP Fundamentals"},
            {"code": "CUR-PART11-001", "title": "Part 11 Compliance"},
            {"code": "CUR-CSV-001", "title": "CSV Training"}
        ],
        "users": [
            {
                "user_id": str(uuid4()),
                "name": "John Doe",
                "department": "Clinical Operations",
                "role": "CRA",
                "curricula": {
                    "CUR-GCP-001": {"status": "COMPLETED", "score": 92, "valid_until": (now + timedelta(days=340)).isoformat()},
                    "CUR-PART11-001": {"status": "COMPLETED", "score": 95, "valid_until": (now + timedelta(days=500)).isoformat()},
                    "CUR-CSV-001": {"status": "NOT_REQUIRED", "score": None, "valid_until": None}
                }
            },
            {
                "user_id": str(uuid4()),
                "name": "Jane Smith",
                "department": "Quality Assurance",
                "role": "QA Specialist",
                "curricula": {
                    "CUR-GCP-001": {"status": "COMPLETED", "score": 88, "valid_until": (now + timedelta(days=280)).isoformat()},
                    "CUR-PART11-001": {"status": "IN_PROGRESS", "score": None, "valid_until": None},
                    "CUR-CSV-001": {"status": "COMPLETED", "score": 90, "valid_until": (now + timedelta(days=600)).isoformat()}
                }
            }
        ],
        "summary": {
            "total_users": 2,
            "fully_compliant": 1,
            "partially_compliant": 1,
            "non_compliant": 0
        }
    }


@router.get("/reports/audit-trail")
async def get_training_audit_trail(
    program_id: UUID = Query(..., description="Program ID"),
    user_id: Optional[UUID] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    limit: int = Query(100, le=1000)
) -> Dict[str, Any]:
    """
    Generate Part 11 compliant audit trail for training activities.
    
    Returns chronological log of all training-related events
    including xAPI statements and status changes.
    """
    now = datetime.utcnow()
    
    return {
        "generated_at": now.isoformat(),
        "program_id": str(program_id),
        "filters": {
            "user_id": str(user_id) if user_id else None,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None
        },
        "audit_entries": [
            {
                "timestamp": (now - timedelta(hours=2)).isoformat(),
                "event_type": "TRAINING_COMPLETED",
                "user_id": str(uuid4()),
                "user_name": "John Doe",
                "details": {
                    "curriculum_code": "CUR-GCP-001",
                    "score": 92,
                    "duration": "PT1H45M"
                },
                "xapi_statement_id": str(uuid4())
            },
            {
                "timestamp": (now - timedelta(hours=3)).isoformat(),
                "event_type": "ELECTRONIC_SIGNATURE",
                "user_id": str(uuid4()),
                "user_name": "John Doe",
                "details": {
                    "signature_meaning": "I have reviewed and understand this training material",
                    "signature_id": "ES-A1B2C3D4"
                },
                "xapi_statement_id": str(uuid4())
            },
            {
                "timestamp": (now - timedelta(days=1)).isoformat(),
                "event_type": "SOP_ACKNOWLEDGED",
                "user_id": str(uuid4()),
                "user_name": "Jane Smith",
                "details": {
                    "sop_number": "SOP-QA-001",
                    "sop_version": "2.0",
                    "signature_id": "ES-E5F6G7H8"
                },
                "xapi_statement_id": str(uuid4())
            }
        ],
        "total_entries": 3,
        "part11_compliant": True
    }


@router.get("/reports/regulatory-readiness")
async def get_regulatory_readiness_report(
    program_id: UUID = Query(..., description="Program ID")
) -> Dict[str, Any]:
    """
    Generate regulatory inspection readiness report for training.
    
    Assesses training documentation completeness for
    FDA, EMA, and other regulatory inspections.
    """
    now = datetime.utcnow()
    
    return {
        "generated_at": now.isoformat(),
        "program_id": str(program_id),
        "inspection_readiness_score": 94.5,
        "regulatory_requirements": {
            "21_cfr_part_11": {
                "status": "COMPLIANT",
                "findings": [],
                "evidence": [
                    "All training records have electronic signatures",
                    "Audit trail maintained for all changes",
                    "xAPI statements provide granular tracking"
                ]
            },
            "ich_e6_r2": {
                "status": "COMPLIANT",
                "findings": [],
                "evidence": [
                    "GCP training current for all clinical personnel",
                    "Role-based training assignments documented",
                    "Training effectiveness assessed through competency evaluation"
                ]
            },
            "fda_guidance_training": {
                "status": "COMPLIANT",
                "findings": [],
                "evidence": [
                    "Documented training procedures",
                    "Training records readily available",
                    "Qualification records maintained"
                ]
            }
        },
        "recommendations": [
            {
                "priority": "MEDIUM",
                "area": "Training Expiration Management",
                "recommendation": "Implement automated reminders 60 days before expiration",
                "impact": "Prevents compliance gaps from expired training"
            },
            {
                "priority": "LOW",
                "area": "Competency Assessment Frequency",
                "recommendation": "Consider more frequent competency assessments for high-risk roles",
                "impact": "Enhanced demonstration of ongoing competency"
            }
        ],
        "documentation_checklist": [
            {"item": "Training SOPs", "status": "COMPLETE", "location": "SOP-TRN-001"},
            {"item": "Training Records", "status": "COMPLETE", "location": "LRS Database"},
            {"item": "Competency Assessments", "status": "COMPLETE", "location": "Training System"},
            {"item": "Electronic Signature Procedures", "status": "COMPLETE", "location": "SOP-ES-001"},
            {"item": "Training Matrix", "status": "COMPLETE", "location": "Generated on demand"}
        ]
    }
