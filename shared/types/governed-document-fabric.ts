/**
 * Governed Document Decision Fabric — Shared Type Vocabulary
 *
 * This file defines the canonical shared types for the Governed Document
 * Decision Fabric: the evaluation layer that sits between mutation intent
 * and execution. Every document lifecycle action (create, promote, export,
 * publish, dispatch) passes through this fabric to produce an auditable
 * evaluation with placement decisions, gate checks, and downstream
 * operating consequences.
 *
 * Relationship to existing type files:
 *
 * - document-contract.ts: Defines ArtifactStatus, GovernedDocumentActionContract.
 *   This file extends lifecycle granularity beyond ArtifactStatus with
 *   LifecycleReadinessLevel (8 levels vs 5) and adds evaluation/gate types
 *   that the action contract does not cover.
 *
 * - decision-architecture.ts: Defines FormalDecisionRecord, DecisionReceipt,
 *   AuthorityLevel. This file's GovernedDecisionReference links back to
 *   formal decisions when one is created. The fabric produces lightweight
 *   decision summaries; formal records live in decision-architecture.
 *
 * - orchestration.ts: Defines ReadinessStatus, ReadinessAssessment,
 *   ReadinessBlocker. This file's LifecycleReadinessState is document-scoped
 *   (single artifact), whereas orchestration readiness is project/module-scoped.
 *   Both can coexist — document readiness feeds into project readiness.
 *
 * - communication-center.ts: Defines SubmissionCenterItemState,
 *   PublishOpsServiceState. This file's PublishGateDecision evaluates whether
 *   a document can enter the publish/dispatch pipeline that those states track.
 *
 * @module shared/types/governed-document-fabric
 */

// ─── Version ────────────────────────────────────────────────────────────────

export const GOVERNED_DOCUMENT_FABRIC_VERSION = '1.0.0';

// ─── Lifecycle Readiness ────────────────────────────────────────────────────

export type LifecycleReadinessLevel =
  | 'draft'
  | 'evidence_gap'
  | 'review_ready'
  | 'approval_ready'
  | 'export_ready'
  | 'publish_ready'
  | 'blocked'
  | 'degraded';

export interface LifecycleReadinessState {
  level: LifecycleReadinessLevel;
  /** Readiness score from 0 (not ready) to 100 (fully ready). */
  score: number;
  blockers: GovernedBlockingReason[];
  warnings: GovernedWarning[];
  /** ISO 8601 timestamp of when this readiness state was evaluated. */
  evaluatedAt: string;
  /** System identifier that performed the evaluation (e.g. 'rim', 'fabric-evaluator'). */
  evaluatedBy: string;
  confidence: 'high' | 'moderate' | 'low' | 'insufficient';
}

// ─── Blocking & Warnings ────────────────────────────────────────────────────

export type BlockingCategory =
  | 'missing_evidence'
  | 'unresolved_contradiction'
  | 'missing_placement'
  | 'missing_approval'
  | 'missing_review'
  | 'missing_context'
  | 'export_gate_failed'
  | 'publish_gate_failed'
  | 'dispatch_not_ready'
  | 'locked_document'
  | 'insufficient_metadata'
  | 'governance_boundary_violation';

export interface GovernedBlockingReason {
  id: string;
  category: BlockingCategory;
  severity: 'critical' | 'major' | 'minor';
  message: string;
  /** Which system or service produced this blocker (e.g. 'rim', 'placement-authority'). */
  source: string;
  remediationHint?: string;
  targetObjectType?: string;
  targetObjectId?: string;
  targetSectionCode?: string;
}

export interface GovernedWarning {
  id: string;
  category: string;
  severity: 'warning' | 'info';
  message: string;
  /** Which system or service produced this warning. */
  source: string;
  targetObjectType?: string;
  targetObjectId?: string;
}

// ─── Mutation Intent ────────────────────────────────────────────────────────

export type GovernedMutationIntent =
  | 'create'
  | 'update'
  | 'place'
  | 'relocate'
  | 'promote'
  | 'approve'
  | 'lock'
  | 'export'
  | 'publish'
  | 'dispatch'
  | 'archive'
  | 'rollback'
  | 'compile'
  | 'refresh';

// ─── Governed Document Context ──────────────────────────────────────────────

export interface GovernedDocumentContext {
  // Identity
  organizationId: string;
  projectId: string;
  artifactId?: string;
  artifactVersionId?: string;
  documentType?: string;

  // Regulatory context
  /** Regulatory body: FDA, EMA, PMDA, Health Canada, MHRA, etc. */
  regulatorBody?: string;
  /** Submission program type: NDA, BLA, 510k, PMA, CER, IVDR, etc. */
  submissionType?: string;
  /** CTD section code, e.g. m3.2.P.1 */
  ctdSection?: string;
  moduleCode?: string;
  sectionCode?: string;
  dossierId?: string;

  // Track / workspace
  clientTrack?: string;
  /** Workspace target: project, dossier, vault. */
  workspaceTarget?: string;
  /** Surface where the action was initiated (editor_panel, project_workspace_shell, etc.). */
  originSurface?: string;

  // Current state
  currentLifecycleStatus?: string;
  currentPlacement?: string;

  // Intent
  intendedAction: GovernedMutationIntent;
  intendedPlacementTarget?: string;

  // Actor
  actorId: string;
  actorRole?: string;

  // Provenance
  /** Unique request identifier for tracing. */
  requestId: string;
  /** ISO 8601 timestamp of the request. */
  timestamp: string;
}

// ─── Governed Document Evaluation ───────────────────────────────────────────

export interface GovernedDocumentEvaluation {
  context: GovernedDocumentContext;
  readiness: LifecycleReadinessState;
  placement: PlacementAuthorityDecision;
  exportGate: ExportGateDecision;
  publishGate: PublishGateDecision;
  consequences: DownstreamOperatingConsequence[];
  decision: GovernedDecisionSummary;
  /** RIM-facing context hints for signal enrichment */
  rimContextHints?: RIMContextHints;
  /** UI-facing presentation hints for workspace rendering */
  uiPresentationHints?: UIPresentationHints;
  /** ISO 8601 timestamp of when this evaluation was produced. */
  evaluatedAt: string;
}

// ─── RIM Context Hints ─────────────────────────────────────────────────────

/** Compact hints for RIM signal bridge — what the fabric wants RIM to know */
export interface RIMContextHints {
  readinessLevel: string;
  blockerCategories: string[];
  warningCategories: string[];
  exportGateOutcome: string;
  publishGateOutcome: string;
  consequenceTypes: string[];
  placementOutcome: string;
  documentClass?: string;
  regulatorScope?: string;
  submissionType?: string;
}

// ─── UI Presentation Hints ────────────────────────────────────────────────

/** Compact hints for workspace/hook rendering — what the UI needs to know */
export interface UIPresentationHints {
  readinessBadge: { label: string; tone: 'green' | 'amber' | 'red' | 'stone' };
  exportBadge: { label: string; tone: 'green' | 'amber' | 'red' | 'stone' };
  publishBadge: { label: string; tone: 'green' | 'amber' | 'red' | 'stone' };
  topBlockerMessages: string[];
  topWarningMessages: string[];
  nextRecommendedAction: string;
  placementLabel: string;
  decisionOutcomeLabel: string;
}

// ─── Placement Authority ────────────────────────────────────────────────────

export type PlacementDecisionOutcome =
  | 'allowed'
  | 'blocked'
  | 'fallback_allowed'
  | 'insufficient_context';

export interface PlacementAuthorityDecision {
  outcome: PlacementDecisionOutcome;
  /** Canonical CTD destination, e.g. m3.2.P.1 */
  canonicalDestination?: string;
  allowedDestinations?: string[];
  currentPlacement?: string;
  missingMetadata?: string[];
  blockingReasons?: GovernedBlockingReason[];
  fallbackAcceptable: boolean;
}

// ─── Gate Checks (shared between export and publish gates) ──────────────────

export type GateOutcome = 'eligible' | 'blocked' | 'insufficient_context';

export interface GateCheck {
  checkId: string;
  checkName: string;
  passed: boolean;
  detail?: string;
  required: boolean;
}

// ─── Export Gate ─────────────────────────────────────────────────────────────

export interface ExportGateDecision {
  outcome: GateOutcome;
  gateChecks: GateCheck[];
  blockingReasons: GovernedBlockingReason[];
  remediationSteps: string[];
}

// ─── Publish Gate ───────────────────────────────────────────────────────────

export interface PublishGateDecision {
  outcome: GateOutcome;
  gateChecks: GateCheck[];
  blockingReasons: GovernedBlockingReason[];
  remediationSteps: string[];
  dispatchReady: boolean;
  dispatchBlockers?: GovernedBlockingReason[];
}

// ─── Downstream Operating Consequences ──────────────────────────────────────

export type ConsequenceType =
  | 'open_blocker'
  | 'open_task'
  | 'create_review_requirement'
  | 'mark_response_package_impacted'
  | 'mark_submission_item_not_dispatch_ready'
  | 'flag_workspace_consequence_row'
  | 'create_audit_reference'
  | 'link_provenance'
  | 'mark_section_stale'
  | 'update_readiness_score'
  | 'notify_stakeholder';

export interface DownstreamOperatingConsequence {
  consequenceType: ConsequenceType;
  description: string;
  targetObjectType?: string;
  targetObjectId?: string;
  targetSectionCode?: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  actionRequired: boolean;
  autoExecutable: boolean;
  executed: boolean;
  executedAt?: string;
}

// ─── Decision Summary ───────────────────────────────────────────────────────

export type GovernedDecisionOutcome = 'allow' | 'block' | 'review' | 'degraded';

export interface GovernedDecisionSummary {
  decisionId: string;
  outcome: GovernedDecisionOutcome;
  intent: GovernedMutationIntent;
  rationale: string;
  blockerCount: number;
  warningCount: number;
  consequenceCount: number;
  decisionReference?: GovernedDecisionReference;
  /** ISO 8601 timestamp of the decision. */
  timestamp: string;
}

// ─── Decision Reference (for inspectability) ────────────────────────────────

export interface GovernedDecisionReference {
  decisionId: string;
  projectId: string;
  artifactId?: string;
  intent: GovernedMutationIntent;
  outcome: GovernedDecisionOutcome;
  actorId: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Link to a FormalDecisionRecord if one was created (see decision-architecture.ts). */
  formalDecisionId?: string;
  /** Link to a DecisionReceipt if one was created (see decision-architecture.ts). */
  formalReceiptId?: string;
}

// ─── Canonical Governed Convergence Contracts ───────────────────────────────

export interface CanonicalGovernedDerivedFlags {
  isBlocked: boolean;
  isReviewRequired: boolean;
  isExportReady: boolean;
  isPublishReady: boolean;
  hasUnresolvedGovernedDecisions: boolean;
  hasCriticalContradictions: boolean;
  hasPlacementGap: boolean;
  hasEvidenceGap: boolean;
  requiresHumanApproval: boolean;
  isDegraded: boolean;
}

export interface CanonicalGovernedState {
  context: GovernedDocumentContext;
  decision: GovernedDecisionSummary;
  readinessState: LifecycleReadinessState;
  blockers: GovernedBlockingReason[];
  warnings: GovernedWarning[];
  placementDecision: PlacementAuthorityDecision;
  exportDecision: ExportGateDecision;
  publishDecision: PublishGateDecision;
  nextRecommendedAction: string;
  downstreamConsequences: DownstreamOperatingConsequence[];
  decisionReference: GovernedDecisionReference;
  uiPresentationHints?: UIPresentationHints;
  rimContextHints?: RIMContextHints;
  decisionLifecycle: {
    hasUnresolved: boolean;
    unresolvedCount: number;
    escalatedCount: number;
    states: Record<string, number>;
  };
  artifactBinding: {
    artifactId?: string;
    artifactVersionId?: string;
    sectionCode?: string;
    placementTarget?: string;
  };
  stateFreshness: {
    evaluatedAt: string;
    generatedAt: string;
  };
  derivedFlags: CanonicalGovernedDerivedFlags;
}

export interface GovernedArtifactMutationContract {
  projectId: number;
  organizationId: number;
  artifactId?: number;
  documentType: string;
  artifactClass: string;
  sectionCode?: string;
  title: string;
  content: string;
  status: string;
  source: 'AnA';
  intentLens: string;
  originSurface: string;
  provenance: Record<string, unknown>;
  structureSections: string[];
  qualityGate: {
    grade: string;
    score?: number;
    pass: boolean;
    issues: string[];
    evidenceCompliant?: boolean;
    structureScore?: number;
  };
  versioningMode: 'create' | 'update' | 'append';
  placementTarget?: string;
  decisionReference?: string;
}

export interface GovernedLearningEvent {
  organizationId: number;
  projectId: number;
  artifactId?: string;
  decisionId: string;
  intent: string;
  outcome: string;
  readinessLevel: string;
  readinessScore: number;
  blockerCategories: string[];
  warningCategories: string[];
  placementOutcome: string;
  exportGateOutcome: string;
  publishGateOutcome: string;
  unresolvedDecisionCount: number;
  criticalContradictionCount: number;
  documentType?: string;
  submissionType?: string;
  regulatorBody?: string;
  originSurface?: string;
  qualityGateGrade?: string;
  artifactMutationType: string;
  executedAt: string;
}

// ─── Regulatory Context Binding ─────────────────────────────────────────────

export interface RegulatoryContextBinding {
  regulatorBody: string;
  submissionType: string;
  ctdModule?: string;
  ctdSection?: string;
  applicableStandards?: string[];
  jurisdictionRules?: string[];
}

// ─── Factory Functions ──────────────────────────────────────────────────────

/**
 * Generate a unique ID for governed document fabric objects.
 * Pattern: gdf_{timestamp}_{random6}
 */
function generateFabricId(): string {
  return `gdf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a GovernedBlockingReason with a generated ID.
 */
export function createBlockingReason(
  category: BlockingCategory,
  severity: 'critical' | 'major' | 'minor',
  message: string,
  source: string,
  options?: {
    remediationHint?: string;
    targetObjectType?: string;
    targetObjectId?: string;
    targetSectionCode?: string;
  }
): GovernedBlockingReason {
  return {
    id: generateFabricId(),
    category,
    severity,
    message,
    source,
    remediationHint: options?.remediationHint,
    targetObjectType: options?.targetObjectType,
    targetObjectId: options?.targetObjectId,
    targetSectionCode: options?.targetSectionCode,
  };
}

/**
 * Create a GovernedWarning with a generated ID.
 */
export function createWarning(
  category: string,
  message: string,
  source: string,
  options?: {
    severity?: 'warning' | 'info';
    targetObjectType?: string;
    targetObjectId?: string;
  }
): GovernedWarning {
  return {
    id: generateFabricId(),
    category,
    severity: options?.severity ?? 'warning',
    message,
    source,
    targetObjectType: options?.targetObjectType,
    targetObjectId: options?.targetObjectId,
  };
}

/**
 * Create a GovernedDecisionReference linking a fabric decision to the
 * formal decision architecture (decision-architecture.ts).
 */
export function createDecisionReference(
  decisionId: string,
  projectId: string,
  intent: GovernedMutationIntent,
  outcome: GovernedDecisionOutcome,
  actorId: string,
  options?: {
    artifactId?: string;
    formalDecisionId?: string;
    formalReceiptId?: string;
  }
): GovernedDecisionReference {
  return {
    decisionId,
    projectId,
    artifactId: options?.artifactId,
    intent,
    outcome,
    actorId,
    timestamp: new Date().toISOString(),
    formalDecisionId: options?.formalDecisionId,
    formalReceiptId: options?.formalReceiptId,
  };
}

/**
 * Create a GovernedDecisionSummary with a generated decision ID.
 */
export function createDecisionSummary(
  intent: GovernedMutationIntent,
  outcome: GovernedDecisionOutcome,
  rationale: string,
  counts: {
    blockerCount: number;
    warningCount: number;
    consequenceCount: number;
  },
  decisionReference?: GovernedDecisionReference
): GovernedDecisionSummary {
  return {
    decisionId: generateFabricId(),
    outcome,
    intent,
    rationale,
    blockerCount: counts.blockerCount,
    warningCount: counts.warningCount,
    consequenceCount: counts.consequenceCount,
    decisionReference,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an empty/default LifecycleReadinessState for initialization.
 */
export function createInitialReadinessState(
  evaluatedBy: string
): LifecycleReadinessState {
  return {
    level: 'draft',
    score: 0,
    blockers: [],
    warnings: [],
    evaluatedAt: new Date().toISOString(),
    evaluatedBy,
    confidence: 'insufficient',
  };
}

/**
 * Create a DownstreamOperatingConsequence.
 */
export function createConsequence(
  consequenceType: ConsequenceType,
  description: string,
  severity: 'critical' | 'major' | 'minor' | 'info',
  options?: {
    targetObjectType?: string;
    targetObjectId?: string;
    targetSectionCode?: string;
    actionRequired?: boolean;
    autoExecutable?: boolean;
  }
): DownstreamOperatingConsequence {
  return {
    consequenceType,
    description,
    severity,
    targetObjectType: options?.targetObjectType,
    targetObjectId: options?.targetObjectId,
    targetSectionCode: options?.targetSectionCode,
    actionRequired: options?.actionRequired ?? true,
    autoExecutable: options?.autoExecutable ?? false,
    executed: false,
  };
}
