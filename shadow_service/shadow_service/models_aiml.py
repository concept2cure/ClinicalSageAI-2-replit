"""
Pydantic models for AI/ML Governance - GMLP, PCCP, and Model Cards.

Implements:
- Good Machine Learning Practice (GMLP) - 10 Guiding Principles
- Predetermined Change Control Plans (PCCP) per FDA guidance
- Model Cards (JSON schema) for algorithmic transparency

References:
- FDA/Health Canada/MHRA Joint Statement on GMLP (2021)
- FDA Guidance: Marketing Submission Recommendations for PCCP (2023)
- Google Model Card Toolkit specification
"""
from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict


# =============================================================================
# GMLP - Good Machine Learning Practice (10 Principles)
# =============================================================================

class GMLPPrinciple(str, Enum):
    """The 10 Guiding Principles for Good Machine Learning Practice."""
    MULTI_DISCIPLINARY = "MULTI_DISCIPLINARY_EXPERTISE"
    SOFTWARE_ENGINEERING = "GOOD_SOFTWARE_ENGINEERING"
    DATA_REPRESENTATION = "DATA_REPRESENTATION"
    DATASET_INDEPENDENCE = "DATASET_INDEPENDENCE"
    REFERENCE_DATASETS = "REFERENCE_DATASETS"
    MODEL_DESIGN = "MODEL_DESIGN_TAILORED"
    HUMAN_AI_TEAM = "HUMAN_AI_TEAM"
    TESTING_PERFORMANCE = "TESTING_PERFORMANCE"
    USER_INFORMATION = "USER_INFORMATION"
    DEPLOYED_MONITORING = "DEPLOYED_MONITORING"


class GMLPComplianceStatus(str, Enum):
    """Compliance status for each GMLP principle."""
    COMPLIANT = "COMPLIANT"
    PARTIALLY_COMPLIANT = "PARTIALLY_COMPLIANT"
    NON_COMPLIANT = "NON_COMPLIANT"
    NOT_APPLICABLE = "NOT_APPLICABLE"
    UNDER_REVIEW = "UNDER_REVIEW"


class GMLPAssessment(BaseModel):
    """Assessment of compliance with a single GMLP principle."""
    model_config = ConfigDict(from_attributes=True)
    
    principle: GMLPPrinciple
    status: GMLPComplianceStatus
    evidence_summary: str = Field(..., description="Summary of compliance evidence")
    evidence_documents: List[str] = Field(default_factory=list, description="Document references")
    gaps_identified: Optional[str] = Field(None, description="Identified compliance gaps")
    remediation_plan: Optional[str] = Field(None, description="Plan to address gaps")
    assessed_by: str
    assessed_at: datetime
    next_review_date: Optional[datetime] = None


class GMLPComplianceReport(BaseModel):
    """Complete GMLP compliance report for an AI/ML system."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    model_id: UUID = Field(..., description="Reference to the AI/ML model")
    program_id: UUID
    report_version: int = Field(default=1)
    assessments: List[GMLPAssessment]
    overall_status: GMLPComplianceStatus
    overall_score: float = Field(..., ge=0, le=100, description="Compliance score 0-100")
    executive_summary: str
    regulatory_reviewer: Optional[str] = None
    created_at: datetime
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None


class GMLPComplianceCreate(BaseModel):
    """Request to create a GMLP compliance assessment."""
    model_id: UUID
    program_id: UUID
    assessments: List[GMLPAssessment]
    executive_summary: str


# =============================================================================
# PCCP - Predetermined Change Control Plan
# =============================================================================

class PCCPStatus(str, Enum):
    """Status of a PCCP."""
    DRAFT = "DRAFT"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED = "APPROVED"
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    RETIRED = "RETIRED"


class ChangeType(str, Enum):
    """Types of changes covered by PCCP."""
    RETRAINING = "RETRAINING"  # Model weight updates
    HYPERPARAMETER = "HYPERPARAMETER"  # Tuning adjustments
    ARCHITECTURE = "ARCHITECTURE"  # Structural changes
    DATA_AUGMENTATION = "DATA_AUGMENTATION"  # New training data
    FEATURE_ENGINEERING = "FEATURE_ENGINEERING"  # Input transformations
    OUTPUT_CALIBRATION = "OUTPUT_CALIBRATION"  # Threshold adjustments
    BUG_FIX = "BUG_FIX"  # Defect corrections


class ChangeScope(str, Enum):
    """Scope of change application."""
    GLOBAL = "GLOBAL"  # Applied to all instances
    LOCAL = "LOCAL"  # Device-specific learning
    COHORT = "COHORT"  # Applied to a subset


class DeploymentMethod(str, Enum):
    """How changes are deployed."""
    AUTOMATIC = "AUTOMATIC"  # No human review required
    MANUAL_REVIEW = "MANUAL_REVIEW"  # Human approval before deployment
    STAGED_ROLLOUT = "STAGED_ROLLOUT"  # Gradual deployment with monitoring


class ModificationDescription(BaseModel):
    """Component 1: Description of Modifications (per FDA guidance)."""
    change_types: List[ChangeType] = Field(..., description="Types of changes planned")
    scope: ChangeScope
    deployment_method: DeploymentMethod
    
    # Boundaries
    intended_use_unchanged: bool = Field(True, description="Intended use remains the same")
    inputs_unchanged: bool = Field(True, description="Input types remain the same")
    outputs_unchanged: bool = Field(True, description="Output types remain the same")
    population_unchanged: bool = Field(True, description="Target population unchanged")
    
    # Detailed description
    narrative: str = Field(..., description="Detailed narrative of planned modifications")
    exclusions: List[str] = Field(default_factory=list, description="Explicitly excluded changes")


class DataManagementPractices(BaseModel):
    """Data management requirements for model updates."""
    collection_protocol: str = Field(..., description="How new data will be collected")
    annotation_protocol: str = Field(..., description="Data labeling procedures")
    quality_control_measures: List[str] = Field(..., description="QC steps for new data")
    data_sequestration: str = Field(..., description="How data is separated for testing")
    comparability_assessment: str = Field(..., description="How new data is compared to original")


class RetrainingPractices(BaseModel):
    """Retraining protocol for model updates."""
    retraining_trigger: str = Field(..., description="What triggers retraining")
    hyperparameter_constraints: Dict[str, Any] = Field(..., description="Allowed HP ranges")
    objective_function: str = Field(..., description="Optimization objective")
    early_stopping_criteria: Optional[str] = None
    compute_environment: str = Field(..., description="Training infrastructure specs")


class PerformanceMetric(BaseModel):
    """Individual performance metric with acceptance criteria."""
    name: str = Field(..., description="Metric name (e.g., sensitivity, specificity)")
    current_value: float
    acceptance_threshold: float = Field(..., description="Minimum acceptable value")
    comparison_method: str = Field(..., description="e.g., non-inferiority, superiority")
    clinical_relevance: str = Field(..., description="Why this metric matters clinically")


class PerformanceEvaluationProtocol(BaseModel):
    """Performance evaluation requirements for updates."""
    metrics: List[PerformanceMetric]
    test_dataset_requirements: str = Field(..., description="Dataset requirements for testing")
    statistical_analysis_plan: str = Field(..., description="SAP for performance verification")
    bias_assessment_protocol: str = Field(..., description="How bias will be assessed")
    clinical_validation_requirements: Optional[str] = None


class UpdateProcedures(BaseModel):
    """Procedures for deploying updates."""
    version_control_system: str = Field(..., description="e.g., Git, DVC")
    deployment_pipeline: str = Field(..., description="CI/CD description")
    rollback_mechanism: str = Field(..., description="How to revert failed updates")
    user_notification_plan: str = Field(..., description="How users are informed")
    post_deployment_monitoring: str = Field(..., description="Monitoring after update")


class ModificationProtocol(BaseModel):
    """Component 2: Modification Protocol (per FDA guidance)."""
    data_management: DataManagementPractices
    retraining: RetrainingPractices
    performance_evaluation: PerformanceEvaluationProtocol
    update_procedures: UpdateProcedures


class RiskCategory(str, Enum):
    """Risk categories for impact assessment."""
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"


class ImpactAssessment(BaseModel):
    """Component 3: Impact Assessment (per FDA guidance)."""
    benefit_risk_ratio: str = Field(..., description="Analysis of benefits vs risks")
    cumulative_drift_assessment: str = Field(..., description="How cumulative changes are tracked")
    
    # Risk categorization
    safety_risk: RiskCategory
    effectiveness_risk: RiskCategory
    cybersecurity_risk: RiskCategory
    
    # Mitigations
    mitigation_strategies: List[str] = Field(..., description="Controls to manage risks")
    human_oversight_requirements: str = Field(..., description="Required human review points")
    fail_safe_mechanisms: List[str] = Field(..., description="Automatic safety controls")
    
    # Monitoring
    performance_drift_indicators: List[str] = Field(..., description="What triggers investigation")
    safety_signal_detection: str = Field(..., description="How safety issues are detected")


class PCCP(BaseModel):
    """Complete Predetermined Change Control Plan."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    program_id: UUID
    model_id: UUID
    plan_name: str
    plan_version: str
    status: PCCPStatus
    
    # The three required components
    modification_description: ModificationDescription
    modification_protocol: ModificationProtocol
    impact_assessment: ImpactAssessment
    
    # Regulatory tracking
    regulatory_basis: str = Field(default="21 CFR 820, FDA PCCP Guidance 2023")
    submission_reference: Optional[str] = Field(None, description="510(k) or PMA number")
    
    # Lifecycle
    effective_date: Optional[datetime] = None
    expiration_date: Optional[datetime] = None
    created_at: datetime
    created_by: str
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    
    # Audit trail
    change_history: List[Dict[str, Any]] = Field(default_factory=list)


class PCCPCreate(BaseModel):
    """Request to create a new PCCP."""
    program_id: UUID
    model_id: UUID
    plan_name: str
    modification_description: ModificationDescription
    modification_protocol: ModificationProtocol
    impact_assessment: ImpactAssessment
    submission_reference: Optional[str] = None


class PCCPUpdate(BaseModel):
    """Request to update a PCCP."""
    plan_version: Optional[str] = None
    modification_description: Optional[ModificationDescription] = None
    modification_protocol: Optional[ModificationProtocol] = None
    impact_assessment: Optional[ImpactAssessment] = None
    status: Optional[PCCPStatus] = None


# =============================================================================
# Model Cards - Algorithmic Transparency
# =============================================================================

class ModelDetails(BaseModel):
    """Basic model identification and ownership."""
    name: str
    version: str
    type: str = Field(..., description="e.g., CNN, Transformer, Random Forest")
    owner: str
    contact: str
    license: str
    date_created: datetime
    citation: Optional[str] = None


class IntendedUse(BaseModel):
    """Intended use and limitations."""
    primary_uses: List[str] = Field(..., description="Primary intended use cases")
    primary_users: List[str] = Field(..., description="Primary intended users")
    out_of_scope_uses: List[str] = Field(..., description="Uses the model is not intended for")


class FactorGroup(BaseModel):
    """Demographic or phenotypic factor group for bias assessment."""
    name: str = Field(..., description="e.g., age, gender, ethnicity")
    values: List[str] = Field(..., description="Specific values/categories")
    performance_variation: Optional[str] = Field(None, description="Known performance differences")


class Factors(BaseModel):
    """Factors relevant to model performance and bias."""
    relevant_factors: List[FactorGroup]
    evaluation_factors: List[str] = Field(..., description="Factors evaluated during testing")


class MetricResult(BaseModel):
    """Individual metric measurement."""
    name: str
    value: float
    confidence_interval: Optional[str] = None
    threshold: Optional[float] = None
    slice_name: Optional[str] = Field(None, description="Data slice this applies to")


class Metrics(BaseModel):
    """Performance metrics and evaluation results."""
    model_performance: List[MetricResult]
    decision_thresholds: Dict[str, float] = Field(default_factory=dict)
    variation_approaches: Optional[str] = Field(None, description="How variation was measured")


class DatasetInfo(BaseModel):
    """Information about a dataset used for training or evaluation."""
    name: str
    link: Optional[str] = None
    size: int = Field(..., description="Number of samples")
    preprocessing: List[str] = Field(default_factory=list, description="Preprocessing steps")
    sensitive_data: bool = Field(False, description="Contains PHI or sensitive data")
    representativeness: str = Field(..., description="How representative of target population")


class QuantitativeAnalysis(BaseModel):
    """Quantitative performance analysis."""
    unitary_results: List[MetricResult] = Field(default_factory=list)
    intersectional_results: List[MetricResult] = Field(default_factory=list)


class EthicalConsiderations(BaseModel):
    """Ethical considerations and limitations."""
    ethical_considerations: List[str] = Field(default_factory=list)
    risks_and_harms: List[str] = Field(default_factory=list)
    use_cases_to_avoid: List[str] = Field(default_factory=list)


class CaveatsAndRecommendations(BaseModel):
    """Caveats, recommendations, and known limitations."""
    caveats: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    additional_info: Optional[str] = None


class ModelCard(BaseModel):
    """
    Complete Model Card following Google Model Card Toolkit specification.
    
    Provides standardized algorithmic transparency documentation
    for regulatory submissions and audit purposes.
    """
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    program_id: UUID
    model_id: UUID
    
    # Core sections
    model_details: ModelDetails
    intended_use: IntendedUse
    factors: Factors
    metrics: Metrics
    training_data: List[DatasetInfo]
    evaluation_data: List[DatasetInfo]
    quantitative_analysis: QuantitativeAnalysis
    ethical_considerations: EthicalConsiderations
    caveats_and_recommendations: CaveatsAndRecommendations
    
    # Regulatory compliance
    gmlp_compliance_id: Optional[UUID] = Field(None, description="Link to GMLP assessment")
    pccp_id: Optional[UUID] = Field(None, description="Link to PCCP if applicable")
    
    # Lifecycle
    schema_version: str = Field(default="1.0.0")
    created_at: datetime
    created_by: str
    last_updated_at: Optional[datetime] = None
    last_updated_by: Optional[str] = None


class ModelCardCreate(BaseModel):
    """Request to create a new Model Card."""
    program_id: UUID
    model_id: UUID
    model_details: ModelDetails
    intended_use: IntendedUse
    factors: Factors
    metrics: Metrics
    training_data: List[DatasetInfo]
    evaluation_data: List[DatasetInfo]
    quantitative_analysis: Optional[QuantitativeAnalysis] = None
    ethical_considerations: Optional[EthicalConsiderations] = None
    caveats_and_recommendations: Optional[CaveatsAndRecommendations] = None


# =============================================================================
# AI/ML Model Registry
# =============================================================================

class AIMLModelType(str, Enum):
    """Types of AI/ML models."""
    CLASSIFICATION = "CLASSIFICATION"
    REGRESSION = "REGRESSION"
    OBJECT_DETECTION = "OBJECT_DETECTION"
    SEGMENTATION = "SEGMENTATION"
    NLP = "NLP"
    TIME_SERIES = "TIME_SERIES"
    GENERATIVE = "GENERATIVE"
    RECOMMENDATION = "RECOMMENDATION"


class ModelLifecycleStatus(str, Enum):
    """Lifecycle status of AI/ML model."""
    DEVELOPMENT = "DEVELOPMENT"
    VALIDATION = "VALIDATION"
    PRODUCTION = "PRODUCTION"
    MONITORING = "MONITORING"
    DEPRECATED = "DEPRECATED"
    RETIRED = "RETIRED"


class RegulatoryClassification(str, Enum):
    """Regulatory classification for medical AI."""
    CLASS_I = "CLASS_I"
    CLASS_II = "CLASS_II"  # Most SaMD
    CLASS_III = "CLASS_III"
    NON_DEVICE = "NON_DEVICE"  # Clinical decision support exempt


class AIMLModel(BaseModel):
    """AI/ML Model registry entry."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    program_id: UUID
    name: str
    version: str
    model_type: AIMLModelType
    lifecycle_status: ModelLifecycleStatus
    regulatory_classification: RegulatoryClassification
    
    # Technical details
    framework: str = Field(..., description="e.g., TensorFlow, PyTorch, scikit-learn")
    architecture: str = Field(..., description="Model architecture description")
    input_schema: Dict[str, Any] = Field(..., description="Input data schema")
    output_schema: Dict[str, Any] = Field(..., description="Output data schema")
    
    # Artifact references
    artifact_location: str = Field(..., description="S3/GCS path to model artifacts")
    artifact_hash: str = Field(..., description="SHA-256 hash of model file")
    
    # Compliance references
    model_card_id: Optional[UUID] = None
    gmlp_report_id: Optional[UUID] = None
    pccp_id: Optional[UUID] = None
    
    # Metadata
    created_at: datetime
    created_by: str
    deployed_at: Optional[datetime] = None
    deployed_by: Optional[str] = None


class AIMLModelCreate(BaseModel):
    """Request to register a new AI/ML model."""
    program_id: UUID
    name: str
    version: str
    model_type: AIMLModelType
    regulatory_classification: RegulatoryClassification
    framework: str
    architecture: str
    input_schema: Dict[str, Any]
    output_schema: Dict[str, Any]
    artifact_location: str
    artifact_hash: str


# =============================================================================
# Model Update Tracking (PCCP Execution)
# =============================================================================

class ModelUpdateStatus(str, Enum):
    """Status of a model update under PCCP."""
    INITIATED = "INITIATED"
    DATA_COLLECTED = "DATA_COLLECTED"
    RETRAINING = "RETRAINING"
    VALIDATION = "VALIDATION"
    APPROVED = "APPROVED"
    DEPLOYING = "DEPLOYING"
    DEPLOYED = "DEPLOYED"
    ROLLED_BACK = "ROLLED_BACK"
    FAILED = "FAILED"


class ModelUpdate(BaseModel):
    """Record of a model update executed under a PCCP."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    model_id: UUID
    pccp_id: UUID
    
    # Version tracking
    from_version: str
    to_version: str
    status: ModelUpdateStatus
    
    # Change details
    change_type: ChangeType
    change_description: str
    data_used: DatasetInfo
    
    # Performance comparison
    performance_before: List[MetricResult]
    performance_after: List[MetricResult]
    meets_acceptance_criteria: bool
    
    # Approval chain
    initiated_by: str
    initiated_at: datetime
    validated_by: Optional[str] = None
    validated_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    deployed_by: Optional[str] = None
    deployed_at: Optional[datetime] = None
    
    # Audit
    execution_log: List[Dict[str, Any]] = Field(default_factory=list)


class ModelUpdateCreate(BaseModel):
    """Request to initiate a model update under PCCP."""
    model_id: UUID
    pccp_id: UUID
    change_type: ChangeType
    change_description: str
    data_used: DatasetInfo


# =============================================================================
# List/Summary Models
# =============================================================================

class AIMLModelSummary(BaseModel):
    """Summary view of AI/ML model for listings."""
    id: UUID
    name: str
    version: str
    model_type: AIMLModelType
    lifecycle_status: ModelLifecycleStatus
    regulatory_classification: RegulatoryClassification
    has_model_card: bool
    has_gmlp_assessment: bool
    has_pccp: bool
    created_at: datetime


class AIMLModelList(BaseModel):
    """Paginated list of AI/ML models."""
    items: List[AIMLModelSummary]
    count: int
    total: int


class PCCPSummary(BaseModel):
    """Summary view of PCCP for listings."""
    id: UUID
    plan_name: str
    plan_version: str
    model_id: UUID
    status: PCCPStatus
    effective_date: Optional[datetime]
    created_at: datetime


class PCCPList(BaseModel):
    """Paginated list of PCCPs."""
    items: List[PCCPSummary]
    count: int
    total: int
