/**
 * Resolution Orchestration Types — Sprint 4
 *
 * Type definitions for the Resolution Orchestration Layer.
 * These types are used by services, routes, and UI components.
 *
 * @module shared/types/resolution
 */

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLUTION PLAN TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ResolutionTriggerType =
  | 'contradiction'
  | 'assumption_change'
  | 'decision_update'
  | 'impact_propagation'
  | 'validation_failure'
  | 'stale_dependency'
  | 'manual';

export type ResolutionPath =
  | 'harmonize'
  | 'supersede'
  | 'rewrite'
  | 'review_only'
  | 'escalate'
  | 'mixed';

export type ResolutionConfidence =
  | 'strong'
  | 'moderate'
  | 'provisional'
  | 'uncertain';

export type ResolutionState =
  | 'unresolved'
  | 'proposed_resolution'
  | 'in_resolution'
  | 'resolved_pending_review'
  | 'resolved_approved'
  | 'superseded'
  | 'cancelled';

export type BundleState =
  | 'draft'
  | 'proposed'
  | 'in_progress'
  | 'pending_review'
  | 'approved'
  | 'applied'
  | 'rejected'
  | 'cancelled';

export type SupersessionState =
  | 'proposed'
  | 'confirmed'
  | 'reverted';

export type BundleItemStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'failed';

export type BundleItemActionType =
  | 'rewrite'
  | 'review'
  | 'supersede'
  | 'reapprove'
  | 'harmonize'
  | 'escalate';

export type ImpactState = 'direct' | 'indirect' | 'potential';

// ═══════════════════════════════════════════════════════════════════════════════
// AFFECTED OBJECT
// ═══════════════════════════════════════════════════════════════════════════════

export interface AffectedObject {
  objectType: string;
  objectId: string;
  objectTitle?: string;
  sectionCode?: string;
  impactState?: ImpactState;
  impactRationale?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLUTION CLUSTER
// ═══════════════════════════════════════════════════════════════════════════════

export interface ResolutionCluster {
  clusterId: string;
  triggerObjectType: string;
  triggerObjectId: string;
  triggerDescription: string;
  affectedObjects: AffectedObject[];
  clusterSize: number;
  maxDepth: number;
  confidence: ResolutionConfidence;
  generatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API REQUEST / RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreateResolutionPlanRequest {
  projectId: number;
  triggerType: ResolutionTriggerType;
  triggerId: string;
  triggerDescription: string;
  affectedObjects?: AffectedObject[];
  recommendedPath?: ResolutionPath;
  confidence?: ResolutionConfidence;
  rationale?: string;
  autoCluster?: boolean;
}

export interface CreateResolutionBundleRequest {
  projectId: number;
  planId?: string;
  title: string;
  description?: string;
  items: CreateBundleItemRequest[];
}

export interface CreateBundleItemRequest {
  objectType: string;
  objectId: string;
  objectTitle?: string;
  actionType: BundleItemActionType;
  actionDescription: string;
  sectionCode?: string;
  impactRationale?: string;
  preparedContent?: string;
  preparedContentConfidence?: ResolutionConfidence;
}

export interface TransitionResolutionStateRequest {
  planId: string;
  targetState: ResolutionState;
  reason?: string;
}

export interface TransitionBundleStateRequest {
  bundleId: string;
  targetState: BundleState;
  reason?: string;
}

export interface CreateSupersessionRequest {
  projectId: number;
  supersededObjectType: string;
  supersededObjectId: string;
  supersededObjectTitle?: string;
  successorObjectType: string;
  successorObjectId: string;
  successorObjectTitle?: string;
  rationale: string;
  resolutionPlanId?: string;
  bundleId?: string;
}

export interface ReapprovalDetermination {
  objectType: string;
  objectId: string;
  objectTitle?: string;
  requiresReview: boolean;
  requiresReapproval: boolean;
  requiresEscalation: boolean;
  reason: string;
  currentAuthorityState?: string;
  impactSeverity: 'critical' | 'major' | 'minor' | 'unknown';
}

export interface RewriteTarget {
  objectType: string;
  objectId: string;
  objectTitle?: string;
  sectionCode?: string;
  currentContent?: string;
  suggestedRevision?: string;
  revisionRationale: string;
  confidence: ResolutionConfidence;
  requiresReview: boolean;
}

export interface HarmonizationAction {
  targetObjectType: string;
  targetObjectId: string;
  targetObjectTitle?: string;
  actionType: BundleItemActionType;
  description: string;
  confidence: ResolutionConfidence;
  sourceObjectType: string;
  sourceObjectId: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUNDLE EXECUTION RECEIPT
// ═══════════════════════════════════════════════════════════════════════════════

export interface ExecutedStep {
  stepType: string;
  targetId: string;
  targetType: string;
  targetTitle?: string;
  result: 'success';
  priorState: string;
  newState: string;
  bundleId: string;
  resolutionPlanId?: string;
  timestamp: string;
}

export interface PreparedStep {
  stepType: string;
  targetId: string;
  targetType: string;
  targetTitle?: string;
  result: 'prepared';
  preparedAction: string;
  confidence: ResolutionConfidence;
}

export interface BlockedStep {
  stepType: string;
  targetId: string;
  targetType: string;
  targetTitle?: string;
  reason: string;
}

export interface BundleExecutionReceipt {
  bundleId: string;
  planId?: string;

  executedSteps: ExecutedStep[];
  preparedSteps: PreparedStep[];
  blockedSteps: BlockedStep[];

  supersededObjects: string[];
  updatedArtifacts: string[];
  requiresReview: string[];
  requiresReapproval: string[];

  contradictionState: string;

  summary: {
    totalItems: number;
    executed: number;
    prepared: number;
    blocked: number;
  };

  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANA RESOLUTION SUPPORT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface AnaResolutionExplanation {
  planId: string;
  summary: string;
  triggerExplanation: string;
  affectedObjectsSummary: string;
  recommendedPathExplanation: string;
  alternativePathsExplanation?: string;
  reviewRequirements: string;
  confidenceExplanation: string;
  nextSteps: string[];
}

export interface AnaResolutionBundleSummary {
  bundleId: string;
  summary: string;
  itemCount: number;
  itemBreakdown: { actionType: string; count: number }[];
  reviewStatus: string;
  confidenceLevel: ResolutionConfidence;
  nextSteps: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANA ORCHESTRATOR TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Orchestration decision — what AnA decided to do (or not do).
 */
export type OrchestratorDecision = 'execute' | 'prepare' | 'block';

/**
 * Input trigger for the AnA orchestrator.
 */
export interface OrchestratorTrigger {
  projectId: number;
  triggerType: ResolutionTriggerType;
  triggerId: string;
  triggerDescription: string;
  affectedObjects?: AffectedObject[];
  /** Override auto-detection of severity/confidence */
  forceConfidence?: ResolutionConfidence;
}

/**
 * Result returned by AnaResolutionOrchestrator.run().
 * Contains the full lifecycle: detection → decision → plan → execution → proof.
 */
export interface OrchestratorResult {
  /** What the orchestrator decided */
  decision: OrchestratorDecision;

  /** Why it made this decision */
  decisionRationale: string;

  /** The resolution plan created (always present) */
  plan: {
    id: string;
    state: string;
    triggerType: string;
    recommendedPath: string;
    confidence: string;
    affectedObjectCount: number;
    requiresReview: boolean;
    requiresReapproval: boolean;
    requiresEscalation: boolean;
  };

  /** The resolution bundle (present if decision is 'execute' or 'prepare') */
  bundle?: {
    id: string;
    state: string;
    itemCount: number;
    confidence: string;
  };

  /** The execution receipt (present only if decision is 'execute') */
  receipt?: BundleExecutionReceipt;

  /** Structured explanation for the user */
  explanation: AnaResolutionExplanation;

  /** Timestamp of orchestration */
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLUTION BUNDLE PLAN — Pass 9
//
// Canonical plan object for resolving contradictions.
// Maps contradiction findings → governed, authority-gated actions.
// Feeds real execution or real blocked-execution paths.
// ═══════════════════════════════════════════════════════════════════════════════

export type ContradictionBundleActionKind =
  | 'prepare-correction-draft'
  | 'apply-harmonization'
  | 'supersede-assumption'
  | 'create-review-thread'
  | 'attach-contradiction-memo'
  | 'mark-needs-reapproval'
  | 'escalate'
  | 'other';

/**
 * Maps bundle action kinds to existing BundleItemActionType for execution.
 */
export const ACTION_KIND_TO_BUNDLE_ACTION: Record<ContradictionBundleActionKind, BundleItemActionType> = {
  'prepare-correction-draft': 'rewrite',
  'apply-harmonization': 'harmonize',
  'supersede-assumption': 'supersede',
  'create-review-thread': 'review',
  'attach-contradiction-memo': 'review',
  'mark-needs-reapproval': 'reapprove',
  'escalate': 'escalate',
  'other': 'review',
};

export interface ResolutionBundlePlanAction {
  id: string;
  kind: ContradictionBundleActionKind;
  targetObjectType: string;
  targetObjectId: string;
  targetObjectTitle?: string;
  targetVersionId?: string;
  description: string;
  requiresConfirmation: boolean;
  requiresApproval: boolean;
  requiresEscalation: boolean;
  status: 'planned' | 'skipped' | 'executed' | 'failed';
}

export interface ResolutionBundlePlan {
  id: string;
  projectId: number;
  organizationId: number;

  contradictionIds: string[];
  regulatorBody?: string;
  submissionType?: string;
  workflowStage?: string;

  summary: string;
  rationale: string;

  actions: ResolutionBundlePlanAction[];

  authority: {
    requiresHumanConfirmation: boolean;
    requiresReviewerApproval: boolean;
    requiresEscalation: boolean;
    blockedReason?: string;
  };

  expectedConsequences: Array<{
    kind: string;
    summary: string;
  }>;

  /** Overlay context that shaped this plan */
  overlayContext?: {
    regulatorBody: string;
    appliedRuleIds: string[];
    severityOverrides: Record<string, string>;
    authorityOverrides: Record<string, string>;
    consequenceOverrides: Record<string, string>;
  };

  createdAt: string;
}

/**
 * Contradiction types that the bundle planner supports with typed action mapping.
 */
export type PlannerContradictionType =
  | 'assumption_drift'
  | 'summary_body_inconsistency'
  | 'protocol_sap_inconsistency'
  | 'decision_action_inconsistency'
  | 'regulator_overlay_conflict'
  | 'body_specific_expectation_conflict'
  | 'approved_vs_working_inconsistency'
  | 'status_conflict';

/**
 * Input trigger for contradiction-aware orchestration.
 */
export interface ContradictionOrchestrationTrigger {
  projectId: number;
  contradictionIds: string[];
  regulatorBody?: string;
  submissionType?: string;
  workflowStage?: string;
  /** If true, execute safe actions immediately */
  autoExecute?: boolean;
}

/**
 * Result of contradiction-aware orchestration.
 */
export interface ContradictionOrchestrationResult {
  plan: ResolutionBundlePlan;
  decision: OrchestratorDecision;
  decisionRationale: string;
  bundle?: {
    id: string;
    state: string;
    itemCount: number;
  };
  receipt?: BundleExecutionReceipt;
  readinessRefreshed: boolean;
  contradictionStatesUpdated: string[];
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE MACHINE VALID TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const VALID_RESOLUTION_STATE_TRANSITIONS: Record<ResolutionState, ResolutionState[]> = {
  unresolved: ['proposed_resolution', 'cancelled'],
  proposed_resolution: ['in_resolution', 'cancelled', 'unresolved'],
  in_resolution: ['resolved_pending_review', 'cancelled', 'proposed_resolution'],
  resolved_pending_review: ['resolved_approved', 'in_resolution', 'cancelled'],
  resolved_approved: ['superseded'],
  superseded: [],
  cancelled: ['unresolved'],
};

export const VALID_BUNDLE_STATE_TRANSITIONS: Record<BundleState, BundleState[]> = {
  draft: ['proposed', 'cancelled'],
  proposed: ['in_progress', 'rejected', 'cancelled'],
  in_progress: ['pending_review', 'cancelled'],
  pending_review: ['approved', 'in_progress', 'rejected'],
  approved: ['applied'],
  applied: [],
  rejected: ['draft'],
  cancelled: ['draft'],
};
