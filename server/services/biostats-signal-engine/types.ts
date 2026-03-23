/**
 * Biostats Signal Engine — Type Definitions
 *
 * Structured, deterministic biostatistics signals that convert statistical
 * reality into governed contradictions, decisions, and execution paths.
 *
 * Non-negotiable design:
 * - All math is deterministic (no LLM-generated math)
 * - All signals are project-bound and artifact-aware
 * - All severity/action logic is visible in proof receipts
 * - Signals feed directly into contradiction engine and resolution orchestration
 *
 * @module server/services/biostats-signal-engine/types
 */

// ═══════════════════════════════════════════════════════════════════════════
// SIGNAL TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type BiostatSignalType =
  | 'power_inadequacy'              // Study underpowered for claimed endpoint
  | 'endpoint_document_misalignment' // Endpoint in protocol ≠ endpoint in CSR/SAP
  | 'sample_size_drift'             // Enrolled N diverges from planned N
  | 'effect_size_implausibility'    // Assumed effect size unrealistic for indication
  | 'multiplicity_gap'             // Multiple comparisons without FWER control
  | 'missing_data_risk'            // Dropout/missing data exceeds assumptions
  | 'analysis_method_mismatch'     // Statistical method inappropriate for endpoint type
  | 'interim_analysis_risk'        // Alpha spending concern in group sequential design
  | 'estimand_inconsistency'       // ICH E9(R1) estimand not aligned across documents
  | 'statistical_uncertainty';     // Low-confidence result with no clear resolution

export type SignalSeverity = 'critical' | 'high' | 'medium' | 'low';

export type SignalActionType =
  | 'block_submission'        // Cannot proceed without resolution
  | 'require_human_review'    // Human must evaluate before action
  | 'flag_for_amendment'      // Protocol/SAP amendment likely needed
  | 'generate_contradiction'  // Create a formal contradiction record
  | 'escalate_to_biostat'     // Route to biostatistician role
  | 'update_assumption'       // Modify assumption registry entry
  | 'no_auto_execute';        // Signal detected but no automated action taken

export type SignalEvidenceClass = 'deterministic' | 'rules_based' | 'computed' | 'cross_reference';

// ═══════════════════════════════════════════════════════════════════════════
// CORE SIGNAL STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════

export interface BiostatSignal {
  signalId: string;
  signalType: BiostatSignalType;
  severity: SignalSeverity;
  title: string;
  description: string;

  // Project binding (non-negotiable: every signal is project-scoped)
  organizationId: number;
  projectId: number;
  studyId?: number;

  // Artifact awareness
  sourceArtifacts: SignalArtifactRef[];
  affectedArtifacts: SignalArtifactRef[];

  // Deterministic computation proof
  computation: SignalComputation;

  // Actions this signal triggers
  actions: SignalAction[];

  // Contradiction linkage
  contradictionIds: string[];

  // Resolution linkage
  resolutionPlanId?: string;

  // Audit trail
  evidenceClass: SignalEvidenceClass;
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionNotes?: string;
  status: 'active' | 'acknowledged' | 'resolved' | 'superseded';
}

export interface SignalArtifactRef {
  artifactId: string | number;
  artifactType: 'protocol' | 'sap' | 'csr' | 'cer' | 'ectd_module' | 'knowledge_atom' | 'endpoint_definition';
  title: string;
  section?: string;        // e.g., 'Section 9.4 — Statistical Methods'
  ctdSection?: string;     // e.g., '2.7.4'
  relevantExcerpt?: string;
}

export interface SignalComputation {
  method: string;             // e.g., 'two_sample_t_test_power', 'endpoint_text_comparison'
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  formula?: string;           // Human-readable formula applied
  thresholdApplied: string;   // e.g., 'power < 0.80', 'endpoint_name_match < 1.0'
  thresholdMet: boolean;      // Did the threshold trigger the signal?
  deterministicProof: string; // Plain-English proof of the computation
}

export interface SignalAction {
  actionType: SignalActionType;
  reason: string;
  targetSystem: 'contradiction_engine' | 'assumption_registry' | 'resolution_orchestrator' | 'artifact_context' | 'human_review_queue';
  payload?: Record<string, unknown>;
  executed: boolean;
  executedAt?: Date;
  executionResult?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROOF RECEIPT (audit artifact for every signal evaluation)
// ═══════════════════════════════════════════════════════════════════════════

export interface SignalProofReceipt {
  receiptId: string;
  signalId: string;
  signalType: BiostatSignalType;
  severity: SignalSeverity;
  timestamp: Date;
  projectId: number;
  organizationId: number;

  // What was evaluated
  evaluationContext: {
    studyPhase?: string;
    indication?: string;
    therapeuticArea?: string;
    regulatoryPath?: string;
  };

  // Deterministic computation details
  computation: SignalComputation;

  // What actions were triggered
  actionsTriggered: SignalAction[];

  // Cross-system effects
  contradictionsCreated: string[];
  assumptionsUpdated: string[];
  resolutionPlansCreated: string[];

  // Artifact linkage
  sourceArtifacts: SignalArtifactRef[];
  affectedArtifacts: SignalArtifactRef[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SIGNAL EVALUATION REQUEST (input to the engine)
// ═══════════════════════════════════════════════════════════════════════════

export interface BiostatEvaluationRequest {
  organizationId: number;
  projectId: number;
  studyId?: number;

  // Study design parameters
  studyDesign?: {
    phase: string;
    indication: string;
    therapeuticArea: string;
    designType: string;          // 'parallel', 'crossover', 'single_arm', 'adaptive'
    regulatoryPath?: string;     // 'NDA', '510k', 'BLA', 'PMA'
  };

  // Endpoints from different sources (for misalignment detection)
  endpoints?: {
    protocol?: EndpointSpec[];
    sap?: EndpointSpec[];
    csr?: EndpointSpec[];
  };

  // Power/sample size parameters
  powerParams?: {
    plannedN: number;
    enrolledN?: number;
    effectSize: number;
    sigma?: number;                // Standard deviation
    alpha: number;
    targetPower: number;
    dropoutRate?: number;
    allocationRatio?: number;
    endpointType: 'continuous' | 'binary' | 'time_to_event' | 'ordinal';
    controlRate?: number;          // For binary endpoints
    treatmentRate?: number;        // For binary endpoints
    medianSurvivalControl?: number; // For time-to-event
    hazardRatio?: number;          // For time-to-event
  };

  // Multiplicity
  multiplicity?: {
    numberOfComparisons: number;
    adjustmentMethod?: string;
    familyStructure?: string;
  };

  // Missing data
  missingData?: {
    assumedDropoutRate: number;
    observedDropoutRate?: number;
    handlingMethod?: string;      // 'MMRM', 'MI', 'LOCF', 'complete_case'
  };

  // Statistical results (for uncertainty detection)
  results?: {
    primaryPValue?: number;
    confidenceInterval?: [number, number];
    pointEstimate?: number;
    clinicalThreshold?: number;    // MCID or non-inferiority margin
  };

  // Existing artifacts to cross-reference
  artifactRefs?: SignalArtifactRef[];
}

export interface EndpointSpec {
  name: string;
  category: 'primary' | 'secondary' | 'exploratory';
  type: 'continuous' | 'binary' | 'time_to_event' | 'ordinal' | 'count' | 'composite' | 'patient_reported';
  measurementVariable?: string;
  timepoint?: string;
  statisticalMethod?: string;
  source: string; // which document this came from
}

// ═══════════════════════════════════════════════════════════════════════════
// ENGINE RESULT
// ═══════════════════════════════════════════════════════════════════════════

export interface BiostatSignalResult {
  signals: BiostatSignal[];
  proofReceipts: SignalProofReceipt[];
  summary: {
    totalSignals: number;
    bySeverity: Record<SignalSeverity, number>;
    byType: Partial<Record<BiostatSignalType, number>>;
    contradictionsGenerated: number;
    assumptionsUpdated: number;
    resolutionPlansCreated: number;
    blockedActions: number;
    requiresHumanReview: boolean;
  };
  evaluatedAt: Date;
}
