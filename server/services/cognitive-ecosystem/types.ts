/**
 * =============================================================================
 * Cognitive Regulatory Ecosystem - Type Definitions
 * =============================================================================
 * TypeScript interfaces and enums for the cognitive ecosystem service layer.
 * Maps directly to PostgreSQL types from migrations 063-067.
 * =============================================================================
 */

// =============================================================================
// AGENT RUNTIME TYPES (Migration 063)
// =============================================================================

export enum AgentType {
  REGULATORY_COORDINATOR = 'regulatory_coordinator',
  SAFETY_ANALYST = 'safety_analyst',
  CMC_SPECIALIST = 'cmc_specialist',
  QUALITY_AUDITOR = 'quality_auditor',
  SUBMISSION_PLANNER = 'submission_planner',
  INTELLIGENCE_GATHERER = 'intelligence_gatherer',
  DOCUMENT_REVIEWER = 'document_reviewer',
  COMPLIANCE_CHECKER = 'compliance_checker'
}

export enum AgentStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  DEPRECATED = 'deprecated'
}

export enum ThreadStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  AWAITING_HUMAN = 'awaiting_human'
}

export enum BreakpointType {
  MANDATORY_REVIEW = 'mandatory_review',
  RISK_THRESHOLD = 'risk_threshold',
  REGULATORY_DECISION = 'regulatory_decision',
  QUALITY_GATE = 'quality_gate',
  HUMAN_JUDGMENT = 'human_judgment'
}

export enum ReviewOutcome {
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ESCALATED = 'escalated',
  NEEDS_REVISION = 'needs_revision'
}

export enum ReasoningType {
  PLANNING = 'planning',
  ANALYSIS = 'analysis',
  DECISION = 'decision',
  SYNTHESIS = 'synthesis',
  VERIFICATION = 'verification',
  CORRECTION = 'correction'
}

export enum ConstraintType {
  MAXIMUM_AUTONOMY = 'maximum_autonomy',
  APPROVAL_REQUIRED = 'approval_required',
  READ_ONLY = 'read_only',
  TIME_BOUNDED = 'time_bounded',
  REGION_SPECIFIC = 'region_specific'
}

export interface AgentDefinition {
  id: string;
  agentType: AgentType;
  displayName: string;
  description?: string;
  version: string;
  systemPrompt: string;
  capabilities: string[];
  modelConfig: ModelConfig;
  governanceRules: GovernanceRule[];
  status: AgentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelConfig {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  tools?: ToolConfig[];
}

export interface ToolConfig {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler?: string;
}

export interface GovernanceRule {
  ruleId: string;
  ruleType: string;
  condition: string;
  action: string;
  priority: number;
}

export interface AgentThread {
  id: string;
  agentDefinitionId: string;
  productId?: string;
  tenantId: string;
  parentThreadId?: string;
  contextData: Record<string, unknown>;
  status: ThreadStatus;
  hitlRequired: boolean;
  currentCheckpointId?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface Checkpoint {
  id: string;
  threadId: string;
  parentCheckpointId?: string;
  channel: string;
  checkpointType: string;
  checkpointData: Record<string, unknown>;
  metadata: CheckpointMetadata;
  createdAt: Date;
}

export interface CheckpointMetadata {
  source: string;
  step: number;
  writes?: number;
  score?: number;
  pendingWrites?: string[];
}

export interface CheckpointWrite {
  id: string;
  checkpointId: string;
  taskId: string;
  channel: string;
  writeType: string;
  blob: Buffer;
  createdAt: Date;
}

export interface ThreadBranch {
  id: string;
  sourceThreadId: string;
  branchName: string;
  branchPoint: string;
  hypothesis?: string;
  status: string;
  mergedAt?: Date;
  mergedBy?: string;
  createdAt: Date;
  createdBy: string;
}

export interface ReasoningTrace {
  id: string;
  threadId: string;
  checkpointId: string;
  stepNumber: number;
  reasoningType: ReasoningType;
  inputSummary: string;
  thoughtProcess: string;
  outputSummary: string;
  confidenceScore: number;
  referencedSources: SourceReference[];
  createdAt: Date;
}

export interface SourceReference {
  type: string;
  id: string;
  title?: string;
  url?: string;
  relevance?: number;
}

export interface GovernanceConstraint {
  id: string;
  constraintType: ConstraintType;
  scope: string;
  scopeId?: string;
  constraintDefinition: Record<string, unknown>;
  effectiveFrom: Date;
  effectiveUntil?: Date;
  createdBy: string;
  createdAt: Date;
}

export interface HITLBreakpoint {
  id: string;
  threadId: string;
  checkpointId: string;
  breakpointType: BreakpointType;
  triggerCondition: string;
  contextSnapshot: Record<string, unknown>;
  requiredRole?: string;
  dueDate?: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: string;
  createdAt: Date;
}

export interface AdversarialReview {
  id: string;
  threadId: string;
  checkpointId: string;
  reviewerAgentId?: string;
  reviewerUserId?: string;
  challengeType: string;
  challengePoints: ChallengePoint[];
  outcome: ReviewOutcome;
  resolutionNotes?: string;
  createdAt: Date;
  resolvedAt?: Date;
}

export interface ChallengePoint {
  aspect: string;
  concern: string;
  evidence?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// =============================================================================
// COGNITIVE AUDIT TYPES (Migration 064)
// =============================================================================

export enum AuditSeverity {
  DEBUG = 'debug',
  INFO = 'info',
  NOTICE = 'notice',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
  ALERT = 'alert',
  EMERGENCY = 'emergency'
}

export enum SemanticCategory {
  AGENT_DECISION = 'agent_decision',
  HUMAN_OVERRIDE = 'human_override',
  DATA_MUTATION = 'data_mutation',
  REGULATORY_EVENT = 'regulatory_event',
  SECURITY_EVENT = 'security_event',
  COMPLIANCE_CHECK = 'compliance_check',
  QUALITY_EVENT = 'quality_event',
  SUBMISSION_EVENT = 'submission_event'
}

export enum SignaturePurpose {
  AUTHORSHIP = 'authorship',
  REVIEW = 'review',
  APPROVAL = 'approval',
  ACKNOWLEDGMENT = 'acknowledgment',
  REJECTION = 'rejection',
  WITNESS = 'witness'
}

export enum SignatureStatus {
  PENDING = 'pending',
  VALID = 'valid',
  REVOKED = 'revoked',
  EXPIRED = 'expired'
}

export enum AttestationType {
  ANNUAL_REVIEW = 'annual_review',
  INCIDENT_RESPONSE = 'incident_response',
  AUDIT_COMPLETION = 'audit_completion',
  TRAINING_COMPLETION = 'training_completion',
  POLICY_ACKNOWLEDGMENT = 'policy_acknowledgment'
}

export interface SemanticAuditLog {
  id: string;
  eventId: string;
  tenantId: string;
  sessionId?: string;
  userId?: string;
  agentId?: string;
  severity: AuditSeverity;
  semanticCategory: SemanticCategory;
  eventType: string;
  eventSummary: string;
  eventDetails: Record<string, unknown>;
  affectedEntities: AffectedEntity[];
  causalChain: CausalLink[];
  recordHash: string;
  previousHash?: string;
  eventTimestamp: Date;
  createdAt: Date;
  eventEmbedding?: number[];
}

export interface AffectedEntity {
  entityType: string;
  entityId: string;
  changeType: 'created' | 'updated' | 'deleted' | 'accessed';
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
}

export interface CausalLink {
  precedingEventId: string;
  relationship: string;
  confidence: number;
}

export interface AuditReplaySession {
  id: string;
  tenantId: string;
  sessionName: string;
  startEventId: string;
  endEventId: string;
  filterCriteria: Record<string, unknown>;
  replayState: Record<string, unknown>;
  createdBy: string;
  createdAt: Date;
  lastAccessedAt: Date;
}

export interface ElectronicSignature {
  id: string;
  tenantId: string;
  signedEntityType: string;
  signedEntityId: string;
  signedContentHash: string;
  signerId: string;
  signerName: string;
  signerTitle?: string;
  purpose: SignaturePurpose;
  meaningStatement: string;
  signatureData: string;
  certificateId?: string;
  status: SignatureStatus;
  signedAt: Date;
  revokedAt?: Date;
  revokedReason?: string;
}

export interface ComplianceAttestation {
  id: string;
  tenantId: string;
  attestationType: AttestationType;
  regulationReference: string;
  attestationPeriodStart: Date;
  attestationPeriodEnd: Date;
  attestedBy: string;
  attestedAt: Date;
  evidenceReferences: EvidenceReference[];
  findingsSummary?: Record<string, unknown>;
  controlsVerified: ControlVerification[];
}

export interface EvidenceReference {
  type: string;
  id: string;
  description: string;
  collectedAt: Date;
}

export interface ControlVerification {
  controlId: string;
  controlName: string;
  status: 'passed' | 'failed' | 'not_applicable';
  evidence?: string;
  notes?: string;
}

// =============================================================================
// GLOBAL DOSSIER TYPES (Migration 065)
// =============================================================================

export enum DossierType {
  GLOBAL_COMMON = 'global_common',
  REGIONAL_SPECIFIC = 'regional_specific',
  PRODUCT_FAMILY = 'product_family'
}

export enum LifecycleStage {
  PLANNING = 'planning',
  DEVELOPMENT = 'development',
  REVIEW = 'review',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  MAINTAINED = 'maintained',
  WITHDRAWN = 'withdrawn'
}

export enum BranchType {
  FDA = 'fda',
  EMA = 'ema',
  PMDA = 'pmda',
  NMPA = 'nmpa',
  HEALTH_CANADA = 'health_canada',
  TGA = 'tga',
  MHRA = 'mhra',
  ANVISA = 'anvisa'
}

export enum SyncEventType {
  PUSH = 'push',
  PULL = 'pull',
  MERGE = 'merge',
  CONFLICT_RESOLUTION = 'conflict_resolution',
  VALIDATION_CHECK = 'validation_check'
}

export enum CommentResolution {
  PENDING = 'pending',
  ADDRESSED = 'addressed',
  REJECTED = 'rejected',
  DEFERRED = 'deferred',
  NOT_APPLICABLE = 'not_applicable'
}

export enum CommentType {
  DEFICIENCY = 'deficiency',
  CLARIFICATION = 'clarification',
  INFORMATION_REQUEST = 'information_request',
  ADVISORY = 'advisory',
  COMMITMENT_REQUEST = 'commitment_request'
}

export interface DossierInstance {
  id: string;
  productId: string;
  tenantId: string;
  dossierType: DossierType;
  dossierName: string;
  globalVersion: string;
  lifecycleStage: LifecycleStage;
  fhirDocumentReference?: string;
  contentGraph: ContentGraphNode[];
  harmonizedSections: HarmonizedSection[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentGraphNode {
  nodeId: string;
  nodeType: string;
  parentNodeId?: string;
  content?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface HarmonizedSection {
  sectionCode: string;
  sectionTitle: string;
  harmonizationLevel: 'full' | 'partial' | 'regional';
  globalContent?: string;
  regionalVariations?: Record<string, string>;
}

export interface DossierBranch {
  id: string;
  dossierInstanceId: string;
  branchType: BranchType;
  branchVersion: string;
  baseGlobalVersion: string;
  regionalAdaptations: RegionalAdaptation[];
  submissionDeadline?: Date;
  submittedAt?: Date;
  approvalStatus?: string;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegionalAdaptation {
  sectionCode: string;
  adaptationType: 'addition' | 'modification' | 'removal';
  originalContent?: string;
  adaptedContent?: string;
  justification: string;
}

export interface DossierSyncEvent {
  id: string;
  dossierId: string;
  sourceBranchId?: string;
  targetBranchId?: string;
  eventType: SyncEventType;
  changesetHash: string;
  changesSummary: ChangeSummary[];
  conflictsDetected: ConflictDetection[];
  resolvedBy?: string;
  resolvedAt?: Date;
  createdAt: Date;
}

export interface ChangeSummary {
  sectionCode: string;
  changeType: 'added' | 'modified' | 'deleted';
  description: string;
}

export interface ConflictDetection {
  sectionCode: string;
  conflictType: string;
  sourceContent: string;
  targetContent: string;
  resolution?: string;
}

export interface RegulatoryComment {
  id: string;
  dossierId: string;
  branchId: string;
  agencySource: BranchType;
  commentReference: string;
  commentType: CommentType;
  sectionReference: string;
  commentText: string;
  responseText?: string;
  resolution: CommentResolution;
  dueDate?: Date;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentVersion {
  id: string;
  dossierSectionId: string;
  versionNumber: string;
  contentHash: string;
  contentData: Buffer;
  changeDescription: string;
  authorId: string;
  approvedBy?: string;
  approvedAt?: Date;
  createdAt: Date;
}

// =============================================================================
// MANUFACTURING TYPES (Migration 066)
// =============================================================================

export enum EquipmentStatus {
  OPERATIONAL = 'operational',
  MAINTENANCE = 'maintenance',
  CALIBRATION = 'calibration',
  QUALIFICATION = 'qualification',
  OFFLINE = 'offline',
  DECOMMISSIONED = 'decommissioned'
}

export enum BatchStatus {
  PLANNED = 'planned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  ON_HOLD = 'on_hold',
  RELEASED = 'released',
  REJECTED = 'rejected'
}

export enum QualityDecision {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  UNDER_INVESTIGATION = 'under_investigation'
}

export enum TwinType {
  EQUIPMENT = 'equipment',
  PROCESS = 'process',
  FACILITY = 'facility',
  PRODUCT = 'product',
  SUPPLY_CHAIN = 'supply_chain'
}

export enum TwinOperationalState {
  ACTIVE = 'active',
  TRAINING = 'training',
  VALIDATION = 'validation',
  RETIRED = 'retired'
}

export enum ReleaseDecision {
  RTRT_APPROVED = 'rtrt_approved',
  TRADITIONAL_TESTING = 'traditional_testing',
  MANUAL_REVIEW = 'manual_review',
  REJECTED = 'rejected'
}

export interface ISA95FHIRMapping {
  id: string;
  tenantId: string;
  isa95Element: string;
  isa95Path: string;
  fhirResourceType: string;
  fhirPath: string;
  transformationRule: TransformationRule;
  bidirectional: boolean;
  validatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransformationRule {
  direction: 'isa95_to_fhir' | 'fhir_to_isa95' | 'bidirectional';
  mappingType: 'direct' | 'computed' | 'lookup';
  expression?: string;
  lookupTable?: Record<string, string>;
}

export interface EquipmentRegistry {
  id: string;
  tenantId: string;
  equipmentId: string;
  equipmentName: string;
  equipmentType: string;
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
  siteLocation: string;
  installationDate?: Date;
  status: EquipmentStatus;
  fhirDeviceReference?: string;
  isa95Hierarchy: ISA95Hierarchy;
  qualificationStatus: QualificationStatus;
  nextCalibrationDue?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISA95Hierarchy {
  enterprise?: string;
  site: string;
  area: string;
  processCell?: string;
  unit?: string;
}

export interface QualificationStatus {
  status: 'qualified' | 'pending' | 'expired';
  qualificationType?: string;
  qualifiedOn?: Date;
  expiresOn?: Date;
  protocols?: string[];
}

export interface BatchExecutionRecord {
  id: string;
  tenantId: string;
  batchId: string;
  productId: string;
  batchNumber: string;
  recipeName: string;
  recipeVersion: string;
  scheduledStart: Date;
  actualStart?: Date;
  actualEnd?: Date;
  status: BatchStatus;
  equipmentUsed: EquipmentUsage[];
  processParameters: ProcessParameter[];
  deviations: Deviation[];
  fhirMedicationBatchRef?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EquipmentUsage {
  equipmentId: string;
  usageType: string;
  startTime: Date;
  endTime?: Date;
  parameters?: Record<string, unknown>;
}

export interface ProcessParameter {
  parameterId: string;
  parameterName: string;
  targetValue: number;
  actualValue?: number;
  unit: string;
  inSpec: boolean;
  recordedAt: Date;
}

export interface Deviation {
  deviationId: string;
  deviationType: string;
  description: string;
  severity: 'minor' | 'major' | 'critical';
  detectedAt: Date;
  resolvedAt?: Date;
  resolution?: string;
}

export interface QualityTestResult {
  id: string;
  tenantId: string;
  batchId: string;
  testId: string;
  testName: string;
  testMethod: string;
  specification: Specification;
  result: TestResultValue;
  qualityDecision: QualityDecision;
  testedBy: string;
  reviewedBy?: string;
  testedAt: Date;
  reviewedAt?: Date;
  fhirObservationRef?: string;
}

export interface Specification {
  lowerLimit?: number;
  upperLimit?: number;
  targetValue?: number;
  unit: string;
  testType: 'numeric' | 'boolean' | 'text';
}

export interface TestResultValue {
  numericValue?: number;
  booleanValue?: boolean;
  textValue?: string;
  unit?: string;
}

export interface DigitalTwin {
  id: string;
  tenantId: string;
  twinType: TwinType;
  physicalAssetId?: string;
  twinName: string;
  modelDefinition: DigitalTwinModel;
  currentState: Record<string, unknown>;
  operationalState: TwinOperationalState;
  lastSyncAt?: Date;
  predictionHorizonHours: number;
  driftThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DigitalTwinModel {
  modelType: string;
  modelVersion: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  trainingMetadata?: TrainingMetadata;
}

export interface TrainingMetadata {
  trainedAt: Date;
  datasetSize: number;
  validationScore: number;
  features: string[];
}

export interface RTRTPrediction {
  id: string;
  digitalTwinId: string;
  batchId: string;
  predictionTimestamp: Date;
  predictedCqa: CQAPrediction[];
  confidenceScore: number;
  modelVersion: string;
  inputFeatures: Record<string, unknown>;
  releaseDecision: ReleaseDecision;
  actualOutcome?: Record<string, unknown>;
  driftDetected: boolean;
  createdAt: Date;
}

export interface CQAPrediction {
  attributeName: string;
  predictedValue: number;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  inSpecProbability: number;
}

// =============================================================================
// FEDERATED LEARNING TYPES (Migration 067)
// =============================================================================

export enum FederatedModelStatus {
  INITIALIZING = 'initializing',
  TRAINING = 'training',
  AGGREGATING = 'aggregating',
  VALIDATING = 'validating',
  DEPLOYED = 'deployed',
  DEPRECATED = 'deprecated'
}

export enum FederatedModelType {
  SAFETY_SIGNAL_DETECTION = 'safety_signal_detection',
  EFFICACY_PREDICTION = 'efficacy_prediction',
  DRUG_INTERACTION = 'drug_interaction',
  ADVERSE_EVENT_CLASSIFICATION = 'adverse_event_classification',
  POPULATION_STRATIFICATION = 'population_stratification'
}

export enum ParticipantRole {
  DATA_CONTRIBUTOR = 'data_contributor',
  AGGREGATOR = 'aggregator',
  VALIDATOR = 'validator',
  OBSERVER = 'observer'
}

export enum ParticipantStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  WITHDRAWN = 'withdrawn'
}

export enum GradientStatus {
  RECEIVED = 'received',
  VALIDATED = 'validated',
  AGGREGATED = 'aggregated',
  REJECTED = 'rejected'
}

export enum SignalClassification {
  POTENTIAL = 'potential',
  VALIDATED = 'validated',
  CONFIRMED = 'confirmed',
  REFUTED = 'refuted',
  UNDER_EVALUATION = 'under_evaluation'
}

export enum SignalSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum HorizonScanCategory {
  REGULATORY_GUIDANCE = 'regulatory_guidance',
  COMPETITIVE_INTELLIGENCE = 'competitive_intelligence',
  SAFETY_ALERT = 'safety_alert',
  MARKET_TREND = 'market_trend',
  TECHNOLOGY_ADVANCEMENT = 'technology_advancement',
  POLICY_CHANGE = 'policy_change'
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ValidationSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
  HINT = 'hint'
}

export interface FederatedModel {
  id: string;
  tenantId: string;
  modelName: string;
  modelType: FederatedModelType;
  modelVersion: string;
  globalModelWeights?: Buffer;
  aggregationRound: number;
  minParticipants: number;
  privacyBudgetEpsilon: number;
  privacyBudgetDelta: number;
  status: FederatedModelStatus;
  performanceMetrics: PerformanceMetrics;
  createdAt: Date;
  updatedAt: Date;
}

export interface PerformanceMetrics {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
  auc?: number;
  customMetrics?: Record<string, number>;
}

export interface FederationParticipant {
  id: string;
  federatedModelId: string;
  organizationId: string;
  organizationName: string;
  participantRole: ParticipantRole;
  dataContribution: DataContribution;
  privacyBudgetUsed: number;
  lastContributionAt?: Date;
  status: ParticipantStatus;
  joinedAt: Date;
  withdrawnAt?: Date;
}

export interface DataContribution {
  sampleCount: number;
  featureSet: string[];
  dataQualityScore: number;
  lastUpdated: Date;
}

export interface GradientUpdate {
  id: string;
  federatedModelId: string;
  participantId: string;
  roundNumber: number;
  encryptedGradient: Buffer;
  noiseAdded: number;
  clipNorm: number;
  sampleCount: number;
  localMetrics: PerformanceMetrics;
  status: GradientStatus;
  submittedAt: Date;
  processedAt?: Date;
}

export interface PrivacyBudgetLedger {
  id: string;
  participantId: string;
  operationType: string;
  epsilonConsumed: number;
  deltaConsumed: number;
  queryDescription: string;
  cumulativeEpsilon: number;
  cumulativeDelta: number;
  budgetRemainingEpsilon: number;
  recordedAt: Date;
}

export interface SafetySignal {
  id: string;
  tenantId: string;
  productIds: string[];
  signalSource: string;
  detectionMethod: string;
  signalDescription: string;
  affectedPopulation?: string;
  eventCount: number;
  backgroundRate?: number;
  signalStrength: number;
  classification: SignalClassification;
  severity: SignalSeverity;
  fhirAdverseEventRefs: string[];
  detectedAt: Date;
  validatedAt?: Date;
  resolvedAt?: Date;
  createdAt: Date;
}

export interface HorizonScan {
  id: string;
  tenantId: string;
  scanCategory: HorizonScanCategory;
  sourceType: string;
  sourceUrl?: string;
  title: string;
  summary: string;
  relevanceScore: number;
  impactAssessment: ImpactAssessment;
  affectedProducts: string[];
  affectedRegions: string[];
  actionRequired: boolean;
  actionDueDate?: Date;
  scanDate: Date;
  createdAt: Date;
}

export interface ImpactAssessment {
  businessImpact: 'low' | 'medium' | 'high';
  regulatoryImpact: 'low' | 'medium' | 'high';
  timeToImpact: 'immediate' | 'short_term' | 'medium_term' | 'long_term';
  confidenceLevel: number;
  details?: string;
}

export interface PredictiveRiskModel {
  id: string;
  tenantId: string;
  modelName: string;
  modelType: string;
  targetVariable: string;
  featureSet: FeatureDefinition[];
  modelArtifact?: Buffer;
  validationMetrics: PerformanceMetrics;
  deployedAt?: Date;
  lastRetrainedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeatureDefinition {
  featureName: string;
  featureType: 'numeric' | 'categorical' | 'boolean' | 'embedding';
  importance?: number;
  description?: string;
}

export interface RiskAssessment {
  id: string;
  riskModelId: string;
  entityType: string;
  entityId: string;
  assessmentDate: Date;
  riskScore: number;
  riskLevel: RiskLevel;
  riskFactors: RiskFactor[];
  recommendations: string[];
  validUntil: Date;
  createdAt: Date;
}

export interface RiskFactor {
  factorName: string;
  factorValue: unknown;
  contribution: number;
  direction: 'positive' | 'negative';
}

export enum FHIRValidationRuleType {
  REQUIRED = 'required',
  CARDINALITY = 'cardinality',
  PATTERN = 'pattern',
  VALUE_SET = 'value-set',
  VALUESET = 'valueset',
  INVARIANT = 'invariant',
  PROFILE = 'profile',
  REFERENCE = 'reference',
  STRUCTURE = 'structure',
  TERMINOLOGY = 'terminology',
  EXPRESSION = 'expression',
  EXTENSION = 'extension',
  SLICE = 'slice',
  CUSTOM = 'custom',
}

export enum FHIRSeverity {
  FATAL = 'fatal',
  ERROR = 'error',
  WARNING = 'warning',
  INFORMATION = 'information',
}

export enum FHIRValidationStatus {
  PASSED = 'passed',
  FAILED = 'failed',
  WARNING = 'warning',
  SKIPPED = 'skipped',
}

export interface FHIRValidationIssue {
  severity: FHIRSeverity;
  code: string;
  message?: string;
  diagnostics?: string;
  location?: string | string[];
  expression?: string;
  ruleId?: string;
}

export interface FHIRValidationResult {
  id: string;
  tenantId: string;
  resourceType: string;
  resourceId?: string;
  status?: FHIRValidationStatus;
  validationStatus?: FHIRValidationStatus;
  issues: FHIRValidationIssue[];
  ruleIds?: string[];
  validatedAt: Date;
  profileUrl?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface FHIRValidationRule {
  id: string;
  tenantId: string;
  ruleName: string;
  ruleDescription?: string;
  ruleType: FHIRValidationRuleType;
  resourceType: string;
  fhirResourceType?: string;
  fhirPath?: string;
  expression?: string;
  validationExpression?: string;
  severity: FHIRSeverity;
  errorMessage: string;
  profileUrl?: string;
  regulationReference?: string;
  isActive?: boolean;
  active?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// SERVICE RESPONSE TYPES
// =============================================================================

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: ServiceError;
  metadata?: ResultMetadata;
}

export interface ServiceError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

export interface ResultMetadata {
  executionTimeMs: number;
  affectedRows?: number;
  warnings?: string[];
  auditEventId?: string;
  cached?: boolean;
  rulesEvaluated?: number;
  processedCount?: number;
  [key: string]: unknown;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface SearchCriteria {
  filters?: Record<string, unknown>;
  sort?: SortCriteria[];
  page?: number;
  pageSize?: number;
}

export interface SortCriteria {
  field: string;
  direction: 'asc' | 'desc';
}
