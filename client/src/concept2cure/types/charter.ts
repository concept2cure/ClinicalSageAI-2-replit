/**
 * Project Charter — Frontend Type Definitions
 *
 * Clean TypeScript interfaces for the charter system.
 * No Drizzle dependencies — these mirror the shared schema types
 * for use in React components and hooks.
 *
 * @module concept2cure/types/charter
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SUBMISSION TYPE
// ═══════════════════════════════════════════════════════════════════════════════

export type SubmissionType =
  | 'IND'
  | 'NDA'
  | 'BLA'
  | '510K'
  | 'PMA'
  | 'MAA'
  | 'DE_NOVO'
  | 'EUA'
  | 'IVDR';

// ═══════════════════════════════════════════════════════════════════════════════
// COMMITMENT CATEGORIES (20+ regulatory-specific categories)
// ═══════════════════════════════════════════════════════════════════════════════

export type CommitmentCategory =
  | 'regulatory_submission'
  | 'agency_engagement'
  | 'agency_meeting'
  | 'regulatory_approval'
  | 'clinical_hold_response'
  | 'fda_deficiency_response'
  | 'document_delivery'
  | 'quality_assurance'
  | 'team_deliverable'
  | 'evidence_gathering'
  | 'manufacturing_commitment'
  | 'nonclinical_commitment'
  | 'clinical_commitment'
  | 'data_integrity'
  | 'ectd_assembly'
  | 'safety_report'
  | 'pediatric_commitment'
  | 'rems_commitment'
  | 'post_market_commitment';

// ═══════════════════════════════════════════════════════════════════════════════
// PATHWAY-SPECIFIC CONFIGURATION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface INDConfig {
  indSerialNumber?: string;
  preIndMeeting?: {
    meetingType: 'type_b' | 'type_c' | 'pre_ind_advice';
    plannedDate?: string;
    actualDate?: string;
    fdaFeedback?: string;
    keyQuestions?: string[];
    responseDeadline?: string;
  };
  thirtyDayClock?: {
    startDate?: string;
    dueDate?: string;
    status: 'not_started' | 'in_review' | 'cleared' | 'clinical_hold';
    clinicalHoldReason?: string;
    clinicalHoldStartDate?: string;
    clinicalHoldEndDate?: string;
  };
  clinicalHoldRisk?: {
    safetySignalsIdentified: boolean;
    previousHoldHistory: boolean;
    riskScore: number;
    mitigation?: string;
  };
  annualReportDue?: string;
}

export interface NDAConfig {
  ndaType: '505b1' | '505b2' | '505j_anda';
  referenceProductId?: string;
  rollingSubmission?: {
    enabled: boolean;
    moduleSubmissionDates?: Record<string, string>;
  };
  pdufa?: {
    reviewPriority: 'standard' | 'priority' | 'breakthrough' | 'accelerated';
    submissionDate?: string;
    pdufaDate?: string;
    expectedReviewMonths?: number;
  };
  pediatricPlan?: {
    required: boolean;
    planSubmitted?: string;
    fdaApproval?: string;
    deferralBasis?: string;
  };
  remsStrategy?: {
    required: boolean;
    elements?: {
      medicationGuide: boolean;
      restrictedDistribution: boolean;
      professionalTraining: boolean;
    };
  };
  advisoryCommittee?: {
    scheduledDate?: string;
    committee?: string;
    briefingDocumentDue?: string;
  };
}

export interface BLAConfig {
  biologicType: 'novel_biologic' | 'biosimilar' | 'interchangeable';
  referenceProduct?: {
    tradeName: string;
    activeIngredient: string;
    blaNumber?: string;
  };
  comparabilityProtocol?: {
    submitted: boolean;
    analyticalComplete: boolean;
    animalStudiesComplete: boolean;
    clinicalPKComplete: boolean;
    immunogenicityComplete: boolean;
  };
  cellLineManagement?: {
    masterCellBankQualified?: string;
    workingCellBankQualified?: string;
    processChanges?: { description: string; comparabilityRequired: boolean }[];
  };
  interchangeability?: {
    sought: boolean;
    switchStudyPlanned: boolean;
  };
}

export interface K510Config {
  submissionSubtype: 'traditional' | 'special' | 'abbreviated';
  predicateStrategy?: {
    singlePredicate: boolean;
    predicateRationale?: string;
    adequacy: 'high' | 'moderate' | 'risky';
  };
  substantialEquivalence?: {
    designComparison?: string;
    materialComparison?: string;
    performanceComparison?: string;
    intendedUseComparison?: string;
    areasOfDifference?: string[];
  };
  estarCompliance?: {
    fileNamingFollowed: boolean;
    requiredModulesIncluded: boolean;
    validationStatus: 'not_checked' | 'passed' | 'failed';
  };
  devicePanel?: string;
  performanceStandards?: { standard: string; testingCompleted: boolean; passed: boolean }[];
}

export interface PMAConfig {
  ideRequirements?: {
    ideNumber?: string;
    ideApprovalStatus: 'pending' | 'approved' | 'conditional' | 'denied';
    ideApprovalDate?: string;
    ideAmendments?: { type: string; submittedDate: string }[];
  };
  clinicalTrialDesign?: {
    designType: 'randomized' | 'single_arm' | 'comparative' | 'case_series';
    primaryEndpoint?: string;
    endpointType: 'superiority' | 'non_inferiority' | 'equivalence';
    statisticalPower?: number;
    sampleSize?: number;
    controlArm?: 'active_control' | 'placebo' | 'sham' | 'none';
    blinding?: 'open_label' | 'single_blind' | 'double_blind';
  };
  reviewTrack?: {
    panelTrack: boolean;
    expectedReviewMonths?: number;
  };
}

export interface DeNovoConfig {
  proposedClassification: 'Class_I' | 'Class_II';
  riskBasisForClassification?: string;
  lackOfPredicateJustification?: string;
  predicateSearch?: {
    searchPerformed: boolean;
    searchDate?: string;
    devicesEvaluated?: { name: string; whyNotValid: string }[];
  };
  specialControls?: {
    performanceStandards?: string[];
    labelingRequirements?: string[];
    clinicalDataRequirements?: string;
    postMarketSurveillance?: { required: boolean; durationMonths?: number };
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED / EMBEDDED TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface TeamAssignment {
  role:
    | 'ra_lead'
    | 'medical_director'
    | 'cmc_lead'
    | 'nonclinical_lead'
    | 'biostatistician'
    | 'medical_writer'
    | 'qa_director'
    | 'project_manager';
  userId?: number;
  userName?: string;
  email?: string;
  startDate?: string;
}

export interface PhaseDeliverable {
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'not_applicable';
  owner?: string;
  artifactId?: number;
  completedAt?: string;
}

export interface PhaseBlocker {
  description: string;
  functionalTeam: string;
  deliverable: string;
  currentStatus: 'pending' | 'in_progress' | 'completed';
  estimatedCompletionDate?: string;
}

export interface GateRequirement {
  requirement: string;
  type: 'document' | 'study' | 'approval' | 'milestone' | 'data';
  completed: boolean;
  completedDate?: string;
  owner?: string;
}

export interface MeetingActionItem {
  action: string;
  owner: string;
  dueDate?: string;
  status: 'pending' | 'completed';
  completedDate?: string;
}

export interface StatusTransition {
  from: string;
  to: string;
  at: string;
  by: string;
  byRole?: string;
  reason?: string;
}

export interface PredicateDeviceRef {
  name: string;
  kNumber?: string;
  manufacturer?: string;
  clearanceDate?: string;
  intendedUse?: string;
  equivalenceRationale?: string;
  status?: 'active' | 'withdrawn' | 'superseded';
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY INTERFACES (mirror DB select types, no Drizzle dependency)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProjectCharter {
  id: number;
  organizationId: number;
  projectId: number;

  // Submission classification
  submissionType: string;
  regulatoryRegion: string;
  fdaDivision: string | null;
  fdaBranch: string | null;
  productName: string;
  productType: string | null;
  indication: string | null;
  targetPopulation: string | null;
  therapeuticArea: string | null;

  // Development stage
  developmentStage: string | null;

  // Device-specific
  predicateDevices: PredicateDeviceRef[] | null;
  deviceClass: string | null;
  productCode: string | null;
  secondaryProductCodes: string[] | null;

  // Pathway-specific intelligence
  indConfig: INDConfig | null;
  ndaConfig: NDAConfig | null;
  blaConfig: BLAConfig | null;
  k510Config: K510Config | null;
  pmaConfig: PMAConfig | null;
  deNovoConfig: DeNovoConfig | null;

  // Strategy
  regulatoryStrategy: string | null;
  criticalSuccessFactors: string[] | null;
  riskMitigationPlan: string | null;
  communicationPlan: string | null;
  qualityTargets: Record<string, number> | null;

  // Team
  teamAssignments: TeamAssignment[] | null;

  // Dates
  targetSubmissionDate: string | null;
  targetApprovalDate: string | null;

  // Custom instructions
  customInstructions: string | null;

  // Content integrity
  contentHash: string | null;
  version: number;

  // Approval workflow
  approvalStatus: string | null;
  reviewRequestedBy: number | null;
  reviewRequestedAt: string | null;
  approvedBy: number | null;
  approvedByRole: string | null;
  approvedAt: string | null;
  approvalComment: string | null;
  lockedAt: string | null;
  lockedBy: number | null;
  lockedReason: string | null;

  // Audit
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CharterSection {
  id: number;
  charterId: number;
  parentSectionId: number | null;
  sectionKey: string;
  sectionLabel: string;
  content: string | null;

  // Version control
  version: number;
  contentHash: string | null;
  previousVersionHash: string | null;

  // Status
  status: string | null;
  statusTransitionLog: StatusTransition[];

  // Approval
  approvedBy: number | null;
  approvedByRole: string | null;
  approvedAt: string | null;

  // Lock
  readOnly: boolean;
  lockedAt: string | null;

  // Ownership
  sortOrder: number | null;
  ownerRole: string | null;

  // Audit
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimelinePhase {
  id: number;
  charterId: number;
  phaseName: string;
  phaseNumber: number;
  description: string | null;

  // Functional track
  functionalTeam: string | null;
  developmentStage: string | null;

  // Dates
  startDate: string | null;
  targetEndDate: string | null;
  actualEndDate: string | null;

  // Progress
  status: string | null;
  progress: number | null;

  // Dependencies
  predecessors: number[] | null;
  blockedBy: PhaseBlocker[] | null;
  isCriticalPath: boolean | null;
  slackDays: number | null;

  // Phase gate
  gateRequirements: GateRequirement[] | null;

  // Deliverables
  deliverables: PhaseDeliverable[] | null;
  ownerRole: string | null;

  // Duration estimates
  estimatedWeeks: number | null;
  actualWeeks: number | null;
  benchmarkMinWeeks: number | null;
  benchmarkMaxWeeks: number | null;

  // Rendering
  color: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface ProjectCommitment {
  id: number;
  organizationId: number;
  projectId: number;
  charterId: number | null;
  phaseId: number | null;

  // Details
  title: string;
  description: string | null;
  category: string;
  functionalTeam: string | null;

  // Source tracking
  source: string;
  sourceDocumentId: number | null;
  extractionConfidence: number | null;

  // Dependencies
  blockedByCommitments: number[] | null;
  isCriticalPath: boolean | null;

  // Timeline
  dueDate: string | null;
  completedAt: string | null;

  // Status
  status: string | null;
  priority: string | null;
  urgency: string | null;

  // Assignment
  ownerUserId: number | null;
  ownerRole: string | null;

  // Fulfillment
  fulfillmentProof: string | null;
  fulfillmentArtifactId: number | null;
  fulfillmentArtifactHash: string | null;
  fulfillmentSubmittedBy: number | null;
  fulfillmentSubmittedAt: string | null;
  fulfillmentApprovedBy: number | null;
  fulfillmentApprovedAt: string | null;

  // Signature (21 CFR Part 11)
  requiresSignature: boolean | null;
  signedBy: number | null;
  signedByUsername: string | null;
  signedByRole: string | null;
  signedAt: string | null;
  signatureIntent: string | null;
  signatureMeaning: string | null;
  passwordChallengeUsed: boolean | null;

  // Waiver
  waiverJustification: string | null;
  waiverApprovedBy: number | null;
  waiverApprovedAt: string | null;

  // Extension
  extensionReason: string | null;
  extensionNewDueDate: string | null;
  extensionApprovedBy: number | null;

  // Audit
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegulatoryMeeting {
  id: number;
  organizationId: number;
  charterId: number;

  // Meeting type
  meetingType: string;
  agency: string;
  division: string | null;

  // Schedule
  requestedDate: string | null;
  confirmedDate: string | null;
  actualDate: string | null;
  status: string | null;

  // Content
  agenda: string | null;
  keyQuestions: string[] | null;
  sponsorAttendees: { name: string; role: string }[] | null;
  agencyAttendees: { name: string; title?: string }[] | null;

  // Outcomes
  meetingMinutes: string | null;
  keyDecisions: string[] | null;
  actionItems: MeetingActionItem[] | null;
  fdaFeedback: string | null;
  majorConcerns: string[] | null;

  // Documents
  briefingDocumentId: number | null;
  minutesDocumentId: number | null;

  // Audit
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CharterAuditEvent {
  id: number;
  organizationId: number;
  charterId: number;

  // What changed
  entityType: string;
  entityId: number;
  eventType: string;

  // Who
  performedBy: number;
  performedByUsername: string | null;
  performedByRole: string | null;

  // Change details
  previousValues: unknown;
  newValues: unknown;
  contentHashBefore: string | null;
  contentHashAfter: string | null;
  changeDescription: string | null;

  // Context
  ipAddress: string | null;
  reason: string | null;

  // Timestamp
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROACTIVE ENGINE / HEALTH TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProactiveCheckResult {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  entityType: string;
  entityId: number;
  suggestedAction?: string;
  detectedAt: string;
}

export interface AtRiskCommitment {
  commitmentId: number;
  title: string;
  category: string;
  dueDate: string;
  daysUntilDue: number;
  status: string;
  ownerRole: string | null;
  riskReason: string;
}

export interface OverdueCommitment {
  commitmentId: number;
  title: string;
  category: string;
  dueDate: string;
  daysOverdue: number;
  status: string;
  ownerRole: string | null;
  priority: string | null;
}

export interface PhaseGateAlert {
  phaseId: number;
  phaseName: string;
  phaseNumber: number;
  gateRequirements: GateRequirement[];
  unmetRequirements: number;
  totalRequirements: number;
  startDate: string | null;
  status: string | null;
}

export interface CriticalPathWarning {
  phaseId: number;
  phaseName: string;
  status: string | null;
  slackDays: number | null;
  targetEndDate: string | null;
  blockedBy: PhaseBlocker[] | null;
  warningType: 'behind_schedule' | 'blocked' | 'no_slack' | 'dependency_at_risk';
  message: string;
}

export interface ProjectHealthSummary {
  projectId: number;
  charterId: number;
  overallHealth: 'healthy' | 'at_risk' | 'critical' | 'unknown';
  score: number; // 0-100

  // Commitment summary
  commitments: {
    total: number;
    completed: number;
    pending: number;
    inProgress: number;
    overdue: number;
    atRisk: number;
    waived: number;
  };

  // Phase summary
  phases: {
    total: number;
    completed: number;
    inProgress: number;
    atRisk: number;
    blocked: number;
    notStarted: number;
  };

  // Alerts
  overdueCommitments: OverdueCommitment[];
  atRiskCommitments: AtRiskCommitment[];
  phaseGateAlerts: PhaseGateAlert[];
  criticalPathWarnings: CriticalPathWarning[];
  proactiveChecks: ProactiveCheckResult[];

  // Timeline
  targetSubmissionDate: string | null;
  daysUntilSubmission: number | null;

  generatedAt: string;
}
