"""
Pydantic models for Training Compliance - xAPI and Part 11 Records.

Implements:
- Experience API (xAPI) statements for granular training tracking
- Part 11 compliant training records
- Competency assessment tracking
- Learning Record Store (LRS) integration models

References:
- xAPI (Experience API) Specification v1.0.3
- 21 CFR Part 11 Electronic Records
- ICH E6(R2) GCP Training Requirements
"""
from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict


# =============================================================================
# xAPI Core Models
# =============================================================================

class xAPIVerbID(str, Enum):
    """Standard xAPI verb IDs for training activities."""
    # ADL Verbs
    ATTEMPTED = "http://adlnet.gov/expapi/verbs/attempted"
    COMPLETED = "http://adlnet.gov/expapi/verbs/completed"
    PASSED = "http://adlnet.gov/expapi/verbs/passed"
    FAILED = "http://adlnet.gov/expapi/verbs/failed"
    ANSWERED = "http://adlnet.gov/expapi/verbs/answered"
    EXPERIENCED = "http://adlnet.gov/expapi/verbs/experienced"
    LAUNCHED = "http://adlnet.gov/expapi/verbs/launched"
    PROGRESSED = "http://adlnet.gov/expapi/verbs/progressed"
    
    # GxP-specific verbs
    ACKNOWLEDGED = "https://trialsage.ai/xapi/verbs/acknowledged"  # SOP acknowledgment
    CERTIFIED = "https://trialsage.ai/xapi/verbs/certified"  # Certification earned
    RECERTIFIED = "https://trialsage.ai/xapi/verbs/recertified"  # Recertification
    DEMONSTRATED = "https://trialsage.ai/xapi/verbs/demonstrated"  # Competency demo
    SIGNED = "https://trialsage.ai/xapi/verbs/signed"  # E-signature applied


class xAPIActivityType(str, Enum):
    """Activity types for GxP training."""
    COURSE = "http://adlnet.gov/expapi/activities/course"
    MODULE = "http://adlnet.gov/expapi/activities/module"
    ASSESSMENT = "http://adlnet.gov/expapi/activities/assessment"
    LESSON = "http://adlnet.gov/expapi/activities/lesson"
    
    # GxP-specific
    SOP = "https://trialsage.ai/xapi/activities/sop"
    WORK_INSTRUCTION = "https://trialsage.ai/xapi/activities/work-instruction"
    QUALIFICATION = "https://trialsage.ai/xapi/activities/qualification"
    COMPETENCY_ASSESSMENT = "https://trialsage.ai/xapi/activities/competency-assessment"
    REGULATORY_TRAINING = "https://trialsage.ai/xapi/activities/regulatory-training"


class xAPIAgent(BaseModel):
    """xAPI Actor/Agent representing a learner or system."""
    objectType: str = Field(default="Agent")
    name: Optional[str] = None
    mbox: Optional[str] = Field(None, description="mailto:email format")
    mbox_sha1sum: Optional[str] = None
    account: Optional[Dict[str, str]] = Field(None, description="homePage + name")
    
    # Part 11 extensions
    employee_id: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None


class xAPIVerb(BaseModel):
    """xAPI Verb representing the action taken."""
    id: str = Field(..., description="IRI identifying the verb")
    display: Dict[str, str] = Field(..., description="Human-readable verb name by language")


class xAPIActivityDefinition(BaseModel):
    """Definition of an xAPI activity."""
    type: str = Field(..., description="IRI identifying the activity type")
    name: Dict[str, str] = Field(default_factory=dict)
    description: Dict[str, str] = Field(default_factory=dict)
    moreInfo: Optional[str] = None
    extensions: Dict[str, Any] = Field(default_factory=dict)


class xAPIActivity(BaseModel):
    """xAPI Activity (Object) representing what was learned."""
    objectType: str = Field(default="Activity")
    id: str = Field(..., description="IRI uniquely identifying the activity")
    definition: Optional[xAPIActivityDefinition] = None


class xAPIResult(BaseModel):
    """xAPI Result representing the outcome of the activity."""
    score: Optional[Dict[str, float]] = Field(None, description="scaled, raw, min, max")
    success: Optional[bool] = None
    completion: Optional[bool] = None
    response: Optional[str] = None
    duration: Optional[str] = Field(None, description="ISO 8601 duration")
    extensions: Dict[str, Any] = Field(default_factory=dict)


class xAPIContext(BaseModel):
    """xAPI Context providing additional information."""
    registration: Optional[str] = Field(None, description="UUID for the attempt")
    instructor: Optional[xAPIAgent] = None
    team: Optional[Dict[str, Any]] = None
    revision: Optional[str] = None
    platform: Optional[str] = None
    language: Optional[str] = None
    extensions: Dict[str, Any] = Field(default_factory=dict)


class xAPIStatement(BaseModel):
    """
    Complete xAPI Statement (Actor-Verb-Object).
    
    Part 11 Compliance:
    - Actor must be securely identified
    - Statements are immutable once stored
    - Timestamp provides audit trail
    """
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID = Field(..., description="UUID for the statement")
    actor: xAPIAgent
    verb: xAPIVerb
    object: xAPIActivity
    result: Optional[xAPIResult] = None
    context: Optional[xAPIContext] = None
    timestamp: datetime
    stored: Optional[datetime] = None
    authority: Optional[xAPIAgent] = None
    version: str = Field(default="1.0.3")
    
    # Part 11 extensions
    electronic_signature: Optional[str] = None
    signature_meaning: Optional[str] = None


class xAPIStatementCreate(BaseModel):
    """Request to create an xAPI statement."""
    actor: xAPIAgent
    verb_id: str
    activity_id: str
    activity_type: str
    activity_name: str
    result: Optional[xAPIResult] = None
    context_extensions: Optional[Dict[str, Any]] = None


# =============================================================================
# Part 11 Training Records
# =============================================================================

class TrainingStatus(str, Enum):
    """Status of training requirement."""
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    PASSED = "PASSED"
    FAILED = "FAILED"
    EXPIRED = "EXPIRED"
    WAIVED = "WAIVED"


class CompetencyLevel(str, Enum):
    """Competency assessment levels."""
    NOVICE = "NOVICE"
    BEGINNER = "BEGINNER"
    COMPETENT = "COMPETENT"
    PROFICIENT = "PROFICIENT"
    EXPERT = "EXPERT"


class TrainingType(str, Enum):
    """Types of training."""
    INITIAL = "INITIAL"
    REFRESHER = "REFRESHER"
    REMEDIAL = "REMEDIAL"
    JUST_IN_TIME = "JUST_IN_TIME"
    REGULATORY_REQUIRED = "REGULATORY_REQUIRED"
    ROLE_BASED = "ROLE_BASED"


class TrainingCurriculum(BaseModel):
    """Training curriculum definition."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    program_id: UUID
    
    # Identification
    code: str = Field(..., description="Curriculum code (e.g., CUR-GCP-001)")
    title: str
    description: str
    version: str
    
    # Requirements
    training_type: TrainingType
    required_for_roles: List[str] = Field(default_factory=list)
    prerequisite_curricula: List[UUID] = Field(default_factory=list)
    
    # Completion criteria
    passing_score: float = Field(80.0, ge=0, le=100)
    max_attempts: int = Field(3, ge=1)
    validity_months: int = Field(12, description="Months until recertification required")
    
    # Content
    modules: List[UUID] = Field(default_factory=list)
    estimated_duration_minutes: int
    
    # Regulatory
    regulatory_basis: List[str] = Field(default_factory=list, description="21 CFR, ICH, etc.")
    
    # Lifecycle
    effective_date: datetime
    sunset_date: Optional[datetime] = None
    created_at: datetime
    created_by: str
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None


class TrainingModule(BaseModel):
    """Individual training module."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    curriculum_id: UUID
    
    # Identification
    code: str
    title: str
    description: str
    version: str
    
    # Content
    activity_type: xAPIActivityType
    content_url: Optional[str] = None
    estimated_duration_minutes: int
    
    # Assessment
    has_assessment: bool = Field(False)
    passing_score: Optional[float] = None
    
    # Sequence
    sequence_order: int
    is_required: bool = Field(True)
    
    # Lifecycle
    created_at: datetime
    created_by: str


class TrainingRecord(BaseModel):
    """
    Part 11 compliant training record.
    
    Immutable record of training completion with
    electronic signature and audit trail.
    """
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    program_id: UUID
    
    # Trainee
    user_id: UUID
    user_email: str
    user_name: str
    department: Optional[str] = None
    role: Optional[str] = None
    
    # Training
    curriculum_id: UUID
    curriculum_code: str
    curriculum_title: str
    training_type: TrainingType
    
    # Status
    status: TrainingStatus
    
    # Completion
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    score: Optional[float] = None
    attempts: int = Field(0)
    
    # Expiration
    valid_until: Optional[datetime] = None
    is_expired: bool = Field(False)
    
    # xAPI tracking
    xapi_statements: List[UUID] = Field(default_factory=list)
    registration_id: Optional[UUID] = None
    
    # Part 11 Signature
    signed_at: Optional[datetime] = None
    signature_meaning: Optional[str] = Field(None, description="e.g., 'I have reviewed and understand'")
    electronic_signature_id: Optional[str] = None
    
    # Audit
    created_at: datetime
    created_by: str
    last_modified_at: Optional[datetime] = None
    last_modified_by: Optional[str] = None


class TrainingRecordCreate(BaseModel):
    """Request to create a training record."""
    program_id: UUID
    user_id: UUID
    user_email: str
    user_name: str
    curriculum_id: UUID
    training_type: TrainingType
    department: Optional[str] = None
    role: Optional[str] = None


class TrainingRecordUpdate(BaseModel):
    """Request to update training record status."""
    status: Optional[TrainingStatus] = None
    score: Optional[float] = None
    completed_at: Optional[datetime] = None


# =============================================================================
# Competency Assessment
# =============================================================================

class CompetencyAssessment(BaseModel):
    """Competency assessment record."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    program_id: UUID
    user_id: UUID
    
    # Assessment
    competency_area: str
    assessment_type: str = Field(..., description="Written, Practical, Observation, etc.")
    
    # Result
    level_achieved: CompetencyLevel
    score: Optional[float] = None
    
    # Assessor
    assessed_by: str
    assessed_at: datetime
    
    # Evidence
    evidence_references: List[str] = Field(default_factory=list)
    comments: Optional[str] = None
    
    # Validity
    valid_until: Optional[datetime] = None
    
    # xAPI link
    xapi_statement_id: Optional[UUID] = None


# =============================================================================
# SOP Acknowledgment
# =============================================================================

class SOPAcknowledgment(BaseModel):
    """
    SOP acknowledgment record with Part 11 signature.
    
    Records that a user has read and understood a
    Standard Operating Procedure.
    """
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    program_id: UUID
    user_id: UUID
    
    # SOP reference
    sop_id: str = Field(..., description="Document management system ID")
    sop_number: str
    sop_title: str
    sop_version: str
    sop_effective_date: datetime
    
    # Acknowledgment
    acknowledged_at: datetime
    
    # Part 11 Signature
    signature_meaning: str = Field(
        default="I have read and understand this SOP and agree to follow its requirements"
    )
    electronic_signature_id: str
    
    # xAPI link
    xapi_statement_id: Optional[UUID] = None


class SOPAcknowledgmentCreate(BaseModel):
    """Request to create an SOP acknowledgment."""
    program_id: UUID
    user_id: UUID
    sop_id: str
    sop_number: str
    sop_title: str
    sop_version: str
    sop_effective_date: datetime


# =============================================================================
# Dashboard Models
# =============================================================================

class TrainingDashboard(BaseModel):
    """Training compliance dashboard."""
    
    # Overall compliance
    total_users: int
    users_compliant: int
    users_non_compliant: int
    compliance_rate: float
    
    # Training status
    trainings_in_progress: int
    trainings_completed_30d: int
    trainings_overdue: int
    trainings_expiring_30d: int
    
    # By curriculum
    by_curriculum: List[Dict[str, Any]]
    
    # Competency summary
    competency_assessments_due: int
    
    # SOP acknowledgments
    sops_pending_acknowledgment: int
    
    # Alerts
    alerts: List[Dict[str, Any]]
    
    generated_at: datetime


class UserTrainingStatus(BaseModel):
    """Individual user's training status summary."""
    user_id: UUID
    user_name: str
    user_email: str
    department: Optional[str]
    role: Optional[str]
    
    # Status
    is_compliant: bool
    trainings_completed: int
    trainings_in_progress: int
    trainings_overdue: int
    trainings_expiring_soon: int
    
    # Last activity
    last_training_date: Optional[datetime]
    
    # Competency
    competency_level: Optional[CompetencyLevel]
    last_competency_assessment: Optional[datetime]


class TrainingRecordList(BaseModel):
    """Paginated list of training records."""
    items: List[TrainingRecord]
    count: int
    total: int


class CurriculumList(BaseModel):
    """Paginated list of curricula."""
    items: List[TrainingCurriculum]
    count: int
    total: int
