/**
 * Phase 3 — Orchestration, Cross-Object Reasoning, Predictive Guidance, and Readiness Types
 *
 * Canonical contracts for:
 * - Multi-step workflow orchestration
 * - Cross-object reasoning payloads
 * - Predictive recommendation engine
 * - Dossier/submission readiness model
 * - Project continuity/cross-session intelligence
 */

import type { AIActionType, AIActionSourceSurface, AIActionModuleType, ValidationFinding } from './ai-actions';

// ---------------------------------------------------------------------------
// Workflow Orchestration
// ---------------------------------------------------------------------------

/** Supported workflow template identifiers. */
export type WorkflowTemplateId =
  | 'submission_readiness_review'
  | 'draft_validate_route'
  | 'project_blocker_scan';

/** Execution status of an orchestrated workflow. */
export type WorkflowExecutionStatus =
  | 'pending'
  | 'running'
  | 'paused'           // Waiting for user input or permission gate
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Status of an individual step within a workflow. */
export type WorkflowStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

/** A single step definition within a workflow template. */
export interface WorkflowStepDefinition {
  stepId: string;
  name: string;
  description: string;
  /** AI action type to execute, or 'orchestrator_logic' for internal steps. */
  actionType: AIActionType | 'orchestrator_logic';
  /** Whether this step requires user confirmation before executing. */
  requiresApproval: boolean;
  /** Whether the workflow should stop if this step fails. */
  stopOnFailure: boolean;
  /** Conditions that must be true for this step to run (evaluated at runtime). */
  preconditions?: string[];
  /** Maximum time in ms before this step times out. */
  timeoutMs?: number;
}

/** A workflow template definition. */
export interface WorkflowTemplate {
  templateId: WorkflowTemplateId;
  name: string;
  description: string;
  /** Steps executed in sequence. */
  steps: WorkflowStepDefinition[];
  /** Module types this template applies to. */
  applicableModules?: AIActionModuleType[];
  /** Estimated duration in minutes. */
  estimatedDurationMinutes?: number;
}

/** Runtime state of a single workflow step. */
export interface WorkflowStepExecution {
  stepId: string;
  name: string;
  status: WorkflowStepStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  /** Result data from this step. */
  result?: Record<string, unknown>;
  /** Errors encountered during this step. */
  errors?: Array<{ code: string; message: string }>;
  /** Warnings from this step. */
  warnings?: string[];
  /** Action provenance ID (links to audit trail). */
  actionId?: string;
}

/** Request to start a workflow. */
export interface WorkflowExecutionRequest {
  templateId: WorkflowTemplateId;
  projectId: number;
  organizationId: number;
  /** Optional module scope. */
  module?: AIActionModuleType;
  /** Optional target entity. */
  targetType?: string;
  targetId?: string | number;
  /** Additional context for the workflow. */
  context?: Record<string, unknown>;
  /** User requesting the workflow. */
  requestedBy: {
    userId: number;
    userName: string;
    userRole?: string;
    organizationId: number;
  };
  /** Source surface where the workflow was triggered. */
  sourceSurface: AIActionSourceSurface;
}

/** Runtime state of a workflow execution. */
export interface WorkflowExecution {
  executionId: string;
  templateId: WorkflowTemplateId;
  status: WorkflowExecutionStatus;
  projectId: number;
  organizationId: number;
  module?: AIActionModuleType;
  /** All step executions. */
  steps: WorkflowStepExecution[];
  /** Current step index (0-based). */
  currentStepIndex: number;
  /** Overall progress 0-100. */
  progressPercent: number;
  /** When the workflow started. */
  startedAt: string;
  /** When the workflow completed/failed. */
  completedAt?: string;
  /** Total duration in ms. */
  totalDurationMs?: number;
  /** Aggregated result from all steps. */
  result?: WorkflowResult;
  /** User who started the workflow. */
  requestedBy: { userId: number; userName: string };
  /** Provenance chain. */
  auditTrail: WorkflowAuditEntry[];
}

/** Aggregated workflow result. */
export interface WorkflowResult {
  /** Human-readable summary of what happened. */
  summary: string;
  /** Top-level blockers found. */
  blockers: WorkflowBlocker[];
  /** Recommendations for next actions. */
  recommendations: Recommendation[];
  /** Readiness assessment if applicable. */
  readiness?: ReadinessAssessment;
  /** Objects created during the workflow. */
  createdObjects: Array<{ type: string; id: string | number; title?: string }>;
  /** Objects updated during the workflow. */
  updatedObjects: Array<{ type: string; id: string | number; title?: string }>;
}

export interface WorkflowBlocker {
  severity: 'critical' | 'major' | 'minor';
  category: string;
  message: string;
  targetType?: string;
  targetId?: string | number;
  suggestedAction?: string;
}

export interface WorkflowAuditEntry {
  timestamp: string;
  stepId?: string;
  action: string;
  detail: string;
  userId: number;
}

// ---------------------------------------------------------------------------
// Cross-Object Reasoning
// ---------------------------------------------------------------------------

/** Structured reasoning payload assembled from multiple project objects. */
export interface CrossObjectReasoningPayload {
  /** Project-level context. */
  project: ProjectSnapshot;
  /** Document inventory. */
  documents: DocumentSnapshot[];
  /** Artifact inventory. */
  artifacts: ArtifactSnapshot[];
  /** Validation findings aggregated. */
  validations: ValidationSnapshot[];
  /** Workflow/task state. */
  tasks: TaskSnapshot[];
  /** Module placement map. */
  moduleMap: ModulePlacementSnapshot[];
  /** Recent AI action history. */
  recentActions: ActionHistoryEntry[];
  /** Evidence objects. */
  evidence: EvidenceSnapshot[];
  /** CMC quality signals (Module 3 source objects, sections, contradictions). */
  cmcSignals: CmcSignalSnapshot;
  /** Assembled at timestamp. */
  assembledAt: string;
  /**
   * Timestamp of the most recent underlying-data change observed across
   * artifacts, CMC source objects, and CMC contradictions. Lets consumers
   * decide whether a cached score is stale without recomputing.
   */
  lastSignalAt: string | null;
  /** Scope metadata. */
  scope: {
    organizationId: number;
    projectId: number;
    module?: string;
  };
}

/**
 * Aggregate of the Module 3 / CMC operating-system tables, scoped to the
 * project. Empty arrays + zero counts when the project has no CMC data —
 * readiness scoring treats that as "CMC not in scope," not as "failing."
 */
export interface CmcSignalSnapshot {
  sourceObjectCount: number;
  sourceTypeBreakdown: Record<string, number>;
  sectionCount: number;
  staleSectionCount: number;
  contradictions: CmcContradictionSnapshot[];
  contradictionCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    open: number;
    resolved: number;
  };
}

export interface CmcContradictionSnapshot {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  contradictionType: string;
  details: string;
  impactedSections: string[];
  status: string;
}

export interface ProjectSnapshot {
  id: number;
  name: string;
  status: string;
  progress: number;
  riskLevel?: string;
  submissionType?: string;
  therapeuticArea?: string;
  targetDate?: string;
  totalDocuments: number;
  totalTasks: number;
  blockedTasks: number;
  overdueTasks: number;
}

export interface DocumentSnapshot {
  id: number;
  title: string;
  type: string;
  status: string;
  module?: string;
  lastModified?: string;
  version?: number;
  hasValidation: boolean;
  validationScore?: number;
  isRouted: boolean;
  routedTo?: string;
}

export interface ArtifactSnapshot {
  id: number;
  title: string;
  type: string;
  status: string;
  version: number;
  isPublished: boolean;
  isPromoted: boolean;
  ctdSection?: string;
  lastModified?: string;
}

export interface ValidationSnapshot {
  documentId: number;
  documentTitle: string;
  isValid: boolean;
  complianceScore: number;
  criticalCount: number;
  majorCount: number;
  minorCount: number;
  validatedAt: string;
  findings: ValidationFinding[];
}

export interface TaskSnapshot {
  id: number;
  title: string;
  status: string;
  priority: string;
  module?: string;
  assignee?: string;
  dueDate?: string;
  isBlocked: boolean;
  isOverdue: boolean;
  dependencies?: number[];
}

export interface ModulePlacementSnapshot {
  module: string;
  section?: string;
  documentCount: number;
  artifactCount: number;
  completenessPercent: number;
  hasValidation: boolean;
  validationScore?: number;
  missingItems: string[];
}

export interface ActionHistoryEntry {
  actionId: string;
  actionType: string;
  targetType: string;
  targetId: string | number;
  status: string;
  timestamp: string;
  userId: number;
}

export interface EvidenceSnapshot {
  id: number;
  type: string;
  category: string;
  status: string;
  qualityScore?: number;
  relevanceScore?: number;
  isVerified: boolean;
  linkedDocumentId?: number;
}

// ---------------------------------------------------------------------------
// Predictive Recommendations
// ---------------------------------------------------------------------------

/** Recommendation severity. */
export type RecommendationSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Types of recommendations the engine can produce. */
export type RecommendationType =
  | 'missing_content'
  | 'weak_content'
  | 'stale_content'
  | 'unvalidated_content'
  | 'unrouted_document'
  | 'blocked_workflow'
  | 'overdue_task'
  | 'validation_failure'
  | 'inconsistency'
  | 'readiness_gap'
  | 'next_best_action';

/** A single recommendation from the predictive engine. */
export interface Recommendation {
  /** Unique recommendation ID. */
  id: string;
  /** Type of recommendation. */
  recommendationType: RecommendationType;
  /** Severity / priority. */
  severity: RecommendationSeverity;
  /** What type of object this recommendation targets. */
  targetObjectType: string;
  /** ID of the target object. */
  targetObjectId: string | number;
  /** Target object title for display. */
  targetObjectTitle?: string;
  /** Why this recommendation exists. */
  reason: string;
  /** Evidence supporting this recommendation (grounded in system state). */
  evidence: string[];
  /** What action is recommended. */
  suggestedAction: string;
  /** Action payload that can be dispatched to the AI action system. */
  actionPayload?: {
    actionType: AIActionType | WorkflowTemplateId;
    payload: Record<string, unknown>;
  };
  /**
   * How this recommendation was produced. Every recommendation from
   * `server/services/orchestration/recommendation-engine.ts` is `rules_based`:
   * a deterministic filter over project state, which either matched or did not.
   * Mirrors the same field on the sibling engine
   * (`server/services/intelligence/recommendation-engine.ts`).
   */
  sourceType: 'rules_based' | 'ai_inferred';
  /**
   * Confidence in this recommendation (0-1), or `null` when nothing computed
   * one.
   *
   * `null` for every `rules_based` recommendation: a rule that fires on a
   * matched condition has no score to report, and a per-rule constant printed
   * as a percentage is a fabricated one. (WO-16C finding 124: the orchestration
   * engine used to stamp 0.95 / 0.9 / 0.85 / 0.8 / 0.7 literals here and the
   * AnA Command surface painted them as unlabeled confidence chips.) Only an
   * `ai_inferred` recommendation may carry a number — the same convention the
   * sibling engine documents as "0-100, null for rules_based".
   *
   * Consumers must handle `null` explicitly; `confidence || 0` renders "0%",
   * which is a fabricated score, not an absent one.
   */
  confidence: number | null;
  /** Module context. */
  module?: string;
  /** When this recommendation was generated. */
  generatedAt: string;
}

/** Output of the recommendation engine. */
export interface RecommendationSet {
  projectId: number;
  organizationId: number;
  recommendations: Recommendation[];
  /** Summary counts by severity. */
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    total: number;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Readiness Assessment
// ---------------------------------------------------------------------------

/** Readiness status for a module or project. */
export type ReadinessStatus =
  | 'not_started'
  | 'in_progress'
  | 'needs_attention'
  | 'at_risk'
  | 'on_track'
  | 'ready'
  | 'submitted';

/** A readiness dimension the engine could not assess, and why. */
export interface UnassessedReadinessDimension {
  /** Which subscore is `null`. */
  dimension: 'compliance' | 'consistency';
  /** Operator-facing reason, e.g. "no validations and no CMC signals on this project". */
  reason: string;
}

/** Readiness assessment for a project or module. */
export interface ReadinessAssessment {
  /** Scope of assessment. */
  projectId: number;
  organizationId: number;
  module?: string;
  /**
   * Overall readiness score 0-100 — the weighted average over the dimensions
   * that were actually assessed, with the weights renormalised across them.
   * A dimension listed in `unassessedDimensions` contributes nothing and
   * costs nothing; it is not folded in as a neutral 50 (WO-16C finding 58)
   * and it is not folded in as a 0 either. A project with nothing in it
   * therefore scores 0 / `not_started`.
   */
  overallScore: number;
  /** Status derived from score and blockers. */
  status: ReadinessStatus;
  /**
   * Subscores.
   *
   * `compliance` and `consistency` are `number | null`: each has an input
   * precondition, and when it is not met the engine measured nothing.
   * (WO-16C finding 58: both returned a bare `50` — "Unknown = neutral" —
   * which the pre-submission gate panel rendered as a labelled subscore
   * indistinguishable from a measured one, and which carried 20% and 10%
   * weight into `overallScore`.) `null` always comes with a reason in
   * `unassessedDimensions`.
   *
   * Consumers must handle `null` explicitly; `compliance ?? 0` prints "0%"
   * and `compliance || 50` reintroduces the defect. Both are fabricated
   * scores, not absent ones.
   */
  scores: {
    completeness: number;       // Document/artifact coverage
    quality: number;            // Validation scores
    consistency: number | null; // Cross-reference alignment; null when no check applied
    compliance: number | null;  // Regulatory compliance; null when nothing was validated
    routing: number;            // Module placement completeness
  };
  /**
   * The dimensions in `scores` that are `null`, each with the reason it could
   * not be assessed. Empty when everything was measured. Same rule as
   * `server/lib/verification-outcome.ts`: the third state always says why.
   */
  unassessedDimensions: UnassessedReadinessDimension[];
  /** Per-module breakdown. */
  moduleBreakdown: ModuleReadinessItem[];
  /** Document readiness inventory. */
  documentInventory: DocumentReadinessItem[];
  /** Top blockers. */
  blockers: ReadinessBlocker[];
  /** Recommended next actions. */
  recommendations: Recommendation[];
  /** Assessment timestamp. */
  assessedAt: string;
}

export interface ModuleReadinessItem {
  module: string;
  section?: string;
  label: string;
  score: number;
  status: ReadinessStatus;
  documentCount: number;
  /**
   * Heuristic default, NOT a submission-type requirement: the engine's own
   * per-module constant (3/5/4/3/4, 3 for anything else). Present so a reader
   * can see the denominator behind `score`; do not present it to a user as the
   * number of documents a submission requires.
   */
  expectedDocumentCount: number;
  validatedCount: number;
  routedCount: number;
  missingItems: string[];
  blockerCount: number;
}

export interface DocumentReadinessItem {
  documentId: number;
  title: string;
  type: string;
  status: string;
  module?: string;
  /** Current state flags. */
  isDrafted: boolean;
  isValidated: boolean;
  isRouted: boolean;
  isApproved: boolean;
  isExportReady: boolean;
  /** Validation state. */
  validationScore?: number;
  criticalFindings: number;
  /** Staleness. */
  lastModified?: string;
  isStale: boolean;
}

export interface ReadinessBlocker {
  severity: 'critical' | 'major' | 'minor';
  category: 'missing_document' | 'validation_failure' | 'unrouted_content' | 'stale_content' | 'blocked_task' | 'approval_pending';
  message: string;
  targetType: string;
  targetId: string | number;
  targetTitle?: string;
  module?: string;
  suggestedResolution: string;
}

// ---------------------------------------------------------------------------
// Project Continuity / Cross-Session Intelligence
// ---------------------------------------------------------------------------

/** A project continuity snapshot for cross-session intelligence. */
export interface ProjectContinuitySnapshot {
  projectId: number;
  organizationId: number;
  /** When this snapshot was taken. */
  snapshotAt: string;
  /** Summary of project state. */
  summary: string;
  /** What changed since last snapshot. */
  changes: ContinuityChange[];
  /** Active blockers. */
  activeBlockers: ReadinessBlocker[];
  /** What is newly ready. */
  newlyReady: Array<{ type: string; id: number; title: string }>;
  /** What still needs attention. */
  needsAttention: Array<{ type: string; id: number; title: string; reason: string }>;
  /** Recommended next actions. */
  nextActions: Recommendation[];
  /** Readiness trajectory (improving / declining / stable). */
  trajectory: 'improving' | 'declining' | 'stable';
  /** Previous snapshot ID for diff. */
  previousSnapshotId?: string;
  /** Key metrics for tracking. */
  metrics: {
    readinessScore: number;
    documentCount: number;
    validatedCount: number;
    blockerCount: number;
    taskCompletionPercent: number;
  };
}

export interface ContinuityChange {
  type: 'document_updated' | 'document_created' | 'validation_completed' | 'task_completed' | 'blocker_resolved' | 'blocker_new' | 'workflow_completed' | 'artifact_promoted';
  description: string;
  targetType: string;
  targetId: string | number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// API Request/Response Envelopes
// ---------------------------------------------------------------------------

/** Request to start a workflow via API. */
export interface OrchestrationStartRequest {
  templateId: WorkflowTemplateId;
  projectId: number;
  module?: AIActionModuleType;
  targetType?: string;
  targetId?: string | number;
  context?: Record<string, unknown>;
}

/** Request to get recommendations for a project. */
export interface RecommendationRequest {
  projectId: number;
  module?: AIActionModuleType;
  /** Filter by recommendation type. */
  types?: RecommendationType[];
  /** Minimum severity to include. */
  minSeverity?: RecommendationSeverity;
  /** Max results. */
  limit?: number;
}

/** Request for a readiness assessment. */
export interface ReadinessRequest {
  projectId: number;
  module?: AIActionModuleType;
}

/** Request for a project continuity briefing. */
export interface ContinuityRequest {
  projectId: number;
}
