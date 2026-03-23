/**
 * AnA Biostats — Shared Types
 *
 * Typed contracts for the entire biostatistics operating function.
 * All layers reference these types for consistency.
 */

// ════════════════════════════════════════════════════════════════
// Domain & Regulatory Enums
// ════════════════════════════════════════════════════════════════

export type ClientTrack = 'biotech_pharma' | 'medical_device' | 'diagnostics_ivd';

export type RegulatoryBody = 'FDA' | 'EMA' | 'MHRA' | 'PMDA' | 'NMPA' | 'TGA' | 'Health_Canada';

export type StudyType =
  | 'superiority'
  | 'non_inferiority'
  | 'equivalence'
  | 'single_arm'
  | 'dose_response'
  | 'adaptive'
  | 'basket'
  | 'platform'
  | 'diagnostic_accuracy'
  | 'agreement'
  | 'usability'
  | 'performance';

export type EndpointType =
  | 'continuous'
  | 'binary'
  | 'time_to_event'
  | 'ordinal'
  | 'count'
  | 'composite'
  | 'sensitivity_specificity'
  | 'agreement'
  | 'auc_roc';

export type ObjectiveType =
  | 'efficacy'
  | 'safety'
  | 'performance'
  | 'diagnostic_accuracy'
  | 'usability'
  | 'bioequivalence'
  | 'dose_finding';

// ════════════════════════════════════════════════════════════════
// Layer 1 — Structured Input
// ════════════════════════════════════════════════════════════════

export interface StatisticalInput {
  projectId?: number;
  clientTrack: ClientTrack;
  regulatoryBody?: RegulatoryBody;
  studyType: StudyType;
  objectiveType: ObjectiveType;
  endpointType: EndpointType;
  alpha: number;
  powerTarget: number;
  effectSize: number;
  variance?: number;
  eventRate?: number;
  controlRate?: number;
  treatmentRate?: number;
  sensitivity?: number;
  specificity?: number;
  prevalence?: number;
  nonInferiorityMargin?: number;
  equivalenceMargin?: number;
  attritionRate: number;
  allocationRatio: number;
  comparatorType?: 'placebo' | 'active' | 'historical' | 'performance_goal';
  methodPreference?: string;
  contextArtifactId?: number;
  contextDocumentId?: number;
  contextSectionRef?: string;
  indication?: string;
  phase?: string;
  numberOfGroups?: number;
  followUpDuration?: number;
  interimAnalyses?: number;
}

// ════════════════════════════════════════════════════════════════
// Layer 1 — Input Validation
// ════════════════════════════════════════════════════════════════

export interface InputValidationResult {
  valid: boolean;
  normalizedInput: StatisticalInput;
  warnings: InputWarning[];
  errors: InputError[];
  prefilled: string[];
}

export interface InputWarning {
  field: string;
  message: string;
  suggestion?: string;
}

export interface InputError {
  field: string;
  message: string;
  required: boolean;
}

// ════════════════════════════════════════════════════════════════
// Layer 2 — Computation Results
// ════════════════════════════════════════════════════════════════

export interface ComputationResult {
  method: string;
  sampleSize: { perGroup: number; total: number; groups: number };
  power: number;
  effectSize: number;
  alpha: number;
  adjustedSampleSize?: number;
  adjustedTotal?: number;
  attritionAdjusted: boolean;
  confidenceInterval?: { lower: number; upper: number };
  criticalValue?: number;
  testStatistic?: string;
  formula: string;
  assumptions: ComputationAssumption[];
  scenarios?: ScenarioResult[];
  diagnosticMetrics?: DiagnosticComputationResult;
}

export interface ComputationAssumption {
  parameter: string;
  value: number | string;
  source: 'user_provided' | 'default' | 'derived' | 'literature';
  sensitivity: 'high' | 'moderate' | 'low';
}

export interface ScenarioResult {
  label: string;
  sampleSize: { perGroup: number; total: number };
  power: number;
  delta: string;
  recommendation?: string;
}

export interface DiagnosticComputationResult {
  sensitivity: number;
  specificity: number;
  ppv?: number;
  npv?: number;
  auc?: number;
  agreementKappa?: number;
  sampleSizeForSensitivity?: number;
  sampleSizeForSpecificity?: number;
  prevalenceAdjustedN?: number;
}

// ════════════════════════════════════════════════════════════════
// Layer 3 — Judgment Results
// ════════════════════════════════════════════════════════════════

export type JudgmentVerdict = 'adequate' | 'marginal' | 'inadequate' | 'insufficient_information';
export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';
export type ActionRecommendation = 'proceed' | 'proceed_with_conditions' | 'revise' | 'escalate';

export interface JudgmentResult {
  overallVerdict: JudgmentVerdict;
  overallRisk: RiskLevel;
  actionRecommendation: ActionRecommendation;
  confidence: ConfidenceLevel;
  dimensions: JudgmentDimension[];
  fragility: FragilityAssessment;
  endpointMethodFit: EndpointMethodFit;
  escalationReasons: string[];
  roleExplanations: RoleExplanations;
}

export interface ConfidenceLevel {
  level: 'high' | 'moderate' | 'low' | 'very_low';
  score: number; // 0-100
  factors: string[];
  limitations: string[];
}

export interface JudgmentDimension {
  name: string;
  verdict: JudgmentVerdict;
  score: number; // 0-100
  rationale: string;
  flags: string[];
}

export interface FragilityAssessment {
  fragilityIndex: number; // 0-100, higher = more fragile
  category: 'robust' | 'moderate' | 'fragile' | 'very_fragile';
  sensitiveParameters: Array<{
    parameter: string;
    currentValue: number;
    breakpointValue: number;
    percentMargin: number;
  }>;
  narrative: string;
}

export interface EndpointMethodFit {
  fit: 'strong' | 'acceptable' | 'weak' | 'mismatch';
  suggestedMethod: string;
  currentMethod: string;
  rationale: string;
  alternatives: string[];
}

export interface RoleExplanations {
  technical: string;
  clinical: string;
  regulatory: string;
  executive: string;
}

// ════════════════════════════════════════════════════════════════
// Layer 4 — Domain Adaptation
// ════════════════════════════════════════════════════════════════

export interface DomainAdaptation {
  track: ClientTrack;
  methodSuggestions: string[];
  designConsiderations: string[];
  endpointGuidance: string[];
  regulatoryNotes: string[];
  riskFactors: string[];
  templateModifiers: Record<string, string>;
  trackSpecificFields: Record<string, unknown>;
}

// ════════════════════════════════════════════════════════════════
// Layer 5 — Regulatory Customization
// ════════════════════════════════════════════════════════════════

export interface RegulatoryCustomization {
  body: RegulatoryBody;
  statisticalExpectations: string[];
  documentRequirements: string[];
  riskFramingNotes: string[];
  guidanceReferences: string[];
  specificConstraints: string[];
  templateVariations: Record<string, string>;
}

// ════════════════════════════════════════════════════════════════
// Layer 6 — Governed Document Types
// ════════════════════════════════════════════════════════════════

export type StatisticalDocumentType =
  | 'sample_size_rationale'
  | 'statistical_risk_memo'
  | 'design_assumption_note'
  | 'sap_section_draft'
  | 'scenario_comparison_brief'
  | 'statistical_reviewer_response'
  | 'protocol_statistical_section'
  | 'submission_statistical_note';

export interface GovernedStatisticalDocument {
  id?: number;
  type: StatisticalDocumentType;
  title: string;
  content: string;
  projectId: number;
  organizationId: number;
  createdBy: number;
  version: number;
  status: 'draft' | 'review' | 'approved' | 'locked';
  provenance: DocumentProvenance;
  metadata: DocumentMetadata;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DocumentProvenance {
  computationInputs: StatisticalInput;
  computationResults: ComputationResult;
  judgmentResults: JudgmentResult;
  domainAdaptation: DomainAdaptation;
  regulatoryCustomization?: RegulatoryCustomization;
  generatedAt: string;
  engineVersion: string;
}

export interface DocumentMetadata {
  clientTrack: ClientTrack;
  regulatoryBody?: RegulatoryBody;
  studyType: StudyType;
  indication?: string;
  phase?: string;
  artifactId?: number;
  dossierSectionId?: number;
  submissionPackageId?: number;
  tags: string[];
}

// ════════════════════════════════════════════════════════════════
// Layer 7 — Workflow Integration
// ════════════════════════════════════════════════════════════════

export type WorkflowAction =
  | 'create_artifact'
  | 'create_review_thread'
  | 'attach_to_dossier'
  | 'escalate'
  | 'open_in_editor'
  | 'create_follow_up_task';

export interface WorkflowActionResult {
  action: WorkflowAction;
  success: boolean;
  artifactId?: number;
  reviewThreadId?: number;
  dossierSectionId?: number;
  editorUrl?: string;
  message: string;
}

// ════════════════════════════════════════════════════════════════
// Layer 8-9 — Orchestrator / AnA Integration
// ════════════════════════════════════════════════════════════════

export interface BiostatsWorkflowRequest {
  workflowType: 'sample_size_rationale' | 'statistical_risk_review' | 'scenario_comparison' | 'track_aware_drafting';
  input: StatisticalInput;
  userId: number;
  organizationId: number;
  generateDocument?: boolean;
  documentType?: StatisticalDocumentType;
  autoAttachToDossier?: boolean;
  reviewRequired?: boolean;
}

export interface BiostatsWorkflowResponse {
  workflowId: string;
  input: StatisticalInput;
  computation: ComputationResult;
  judgment: JudgmentResult;
  domainAdaptation: DomainAdaptation;
  regulatoryCustomization?: RegulatoryCustomization;
  confidence: ConfidenceLevel;
  document?: GovernedStatisticalDocument;
  workflowActions: WorkflowActionResult[];
  anaInterpretation: AnaInterpretation;
  escalation?: EscalationInfo;
}

export interface AnaInterpretation {
  summary: string;
  roleSpecific: RoleExplanations;
  suggestedNextSteps: string[];
  confidenceStatement: string;
  limitations: string[];
}

export interface EscalationInfo {
  required: boolean;
  reasons: string[];
  severity: RiskLevel;
  suggestedAction: string;
  handoffArtifactType?: StatisticalDocumentType;
}
