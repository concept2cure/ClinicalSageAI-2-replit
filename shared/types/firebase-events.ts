/**
 * Firebase Event Envelope & Event Types — Shared Contract
 *
 * Defines the canonical event envelope structure and all supported event types
 * for the Firebase real-time projection layer.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  These types are SHARED between server and client.                 ║
 * ║  Server writes events. Client reads projections.                   ║
 * ║  Firebase is NEVER the source of truth.                            ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * @module shared/types/firebase-events
 */

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT ENVELOPE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The canonical event envelope. Every event published to Firestore
 * uses this shape. Version is explicit for forward compatibility.
 */
export interface FirebaseEventEnvelope<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Unique event identifier (UUID v4) */
  readonly eventId: string;
  /** Dot-namespaced event type (e.g., 'workflow.run.started') */
  readonly eventType: FirebaseEventType;
  /** Envelope schema version */
  readonly eventVersion: 'v1';
  /** ISO 8601 timestamp when the backend event occurred */
  readonly occurredAt: string;

  // ── Scope ───────────────────────────────────────────────────────────
  /** Tenant (organization) this event belongs to */
  readonly tenantId: number;
  /** Project scope (null for tenant-level events) */
  readonly projectId: number | null;
  /** Module scope (null for cross-module events) */
  readonly module: string | null;

  // ── Object reference ────────────────────────────────────────────────
  /** The type of object this event concerns */
  readonly objectType: FirebaseObjectType;
  /** The ID of the affected object */
  readonly objectId: string;

  // ── Workflow context ────────────────────────────────────────────────
  /** Associated workflow run ID (null if not workflow-related) */
  readonly workflowRunId: string | null;

  // ── Actor ──────────────────────────────────────────────────────────
  /** Who/what caused this event */
  readonly actorType: 'user' | 'ai_deterministic' | 'ai_reasoning' | 'system';
  /** Actor identifier (userId, handlerName, or 'system') */
  readonly actorId: string;

  // ── Correlation ────────────────────────────────────────────────────
  /** Links related events together across a logical operation */
  readonly correlationId: string;

  // ── Payload ────────────────────────────────────────────────────────
  /** Event-specific data. Shape varies by eventType. */
  readonly payload: T;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** All supported event types for Phase 3 */
export type FirebaseEventType =
  // Workflow lifecycle
  | 'workflow.run.created'
  | 'workflow.run.started'
  | 'workflow.step.started'
  | 'workflow.step.completed'
  | 'workflow.step.failed'
  | 'workflow.step.awaiting_approval'
  | 'workflow.run.completed'
  | 'workflow.run.failed'
  | 'workflow.run.cancelled'
  | 'workflow.run.resumed'
  // AI action lifecycle
  | 'ai.action.requested'
  | 'ai.action.started'
  | 'ai.action.completed'
  | 'ai.action.failed'
  // Validation lifecycle
  | 'validation.started'
  | 'validation.completed'
  | 'validation.failed'
  | 'validation.findings.generated'
  | 'validation.finding.resolved'
  // Document/artifact lifecycle
  | 'artifact.created'
  | 'artifact.promoted'
  | 'document.created'
  | 'document.version.created'
  | 'document.routed'
  | 'document.exported'
  | 'document.status.changed'
  // Readiness lifecycle
  | 'readiness.updated'
  | 'readiness.blocker.added'
  | 'readiness.blocker.resolved'
  | 'readiness.score.changed'
  // Recommendation lifecycle
  | 'recommendation.generated'
  | 'recommendation.accepted'
  | 'recommendation.dismissed'
  | 'recommendation.resolved';

/** Object types that events can reference */
export type FirebaseObjectType =
  | 'workflow_run'
  | 'workflow_step'
  | 'approval_checkpoint'
  | 'ai_action'
  | 'validation_run'
  | 'validation_finding'
  | 'document'
  | 'document_version'
  | 'artifact'
  | 'readiness_evaluation'
  | 'readiness_rule'
  | 'recommendation'
  | 'project'
  | 'notification';

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT PAYLOADS — typed per event category
// ═══════════════════════════════════════════════════════════════════════════════

/** Workflow run event payloads */
export interface WorkflowRunEventPayload {
  readonly workflowType: string;
  readonly displayName: string;
  readonly status: string;
  readonly triggerSource: string;
  readonly currentStepIndex?: number;
  readonly totalSteps?: number;
  readonly errorMessage?: string;
  readonly errorStepIndex?: number;
  readonly blockerCount?: number;
  readonly outputCount?: number;
}

/** Workflow step event payloads */
export interface WorkflowStepEventPayload {
  readonly stepIndex: number;
  readonly stepName: string;
  readonly stepType: 'deterministic' | 'ai_reasoning';
  readonly status: string;
  readonly durationMs?: number;
  readonly error?: string;
}

/** AI action event payloads */
export interface AIActionEventPayload {
  readonly actionType: string;
  readonly actionId: string;
  readonly status: string;
  readonly provider?: string;
  readonly model?: string;
  readonly tokensUsed?: number;
  readonly latencyMs?: number;
  readonly error?: string;
}

/** Validation event payloads */
export interface ValidationEventPayload {
  readonly validationRunId: string;
  readonly validationType: string;
  readonly status: string;
  readonly findingsCount?: number;
  readonly blockerCount?: number;
  readonly warningCount?: number;
  readonly passedCount?: number;
  readonly error?: string;
}

/** Document/artifact event payloads */
export interface DocumentEventPayload {
  readonly documentId: string;
  readonly documentTitle: string;
  readonly documentType?: string;
  readonly version?: number;
  readonly previousStatus?: string;
  readonly newStatus?: string;
  readonly routedTo?: string;
  readonly exportFormat?: string;
}

/** Readiness event payloads */
export interface ReadinessEventPayload {
  readonly evaluationId?: string;
  readonly overallScore?: number;
  readonly isReady?: boolean;
  readonly blockerCount?: number;
  readonly warningCount?: number;
  readonly blockerId?: string;
  readonly blockerDescription?: string;
  readonly blockerSeverity?: string;
  readonly previousScore?: number;
  readonly newScore?: number;
}

/** Recommendation event payloads */
export interface RecommendationEventPayload {
  readonly recommendationId: string;
  readonly title: string;
  readonly evidenceClass: 'rules_based' | 'validation_based' | 'ai_inferred';
  readonly confidenceLevel: 'definitive' | 'high' | 'moderate' | 'low' | 'speculative';
  readonly priority: 'critical' | 'high' | 'medium' | 'low';
  readonly suggestedAction?: string;
  readonly status?: string;
  readonly resolvedBy?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECTION TYPES — materialized current-state docs
// ═══════════════════════════════════════════════════════════════════════════════

/** Workflow run projection — fast UI reads of current run state */
export interface WorkflowRunProjection {
  readonly runId: string;
  readonly workflowType: string;
  readonly displayName: string;
  readonly status: string;
  readonly triggerSource: string;
  readonly triggeredBy: string;
  readonly currentStepIndex: number;
  readonly totalSteps: number;
  readonly progressPercent: number;
  readonly completedSteps: number;
  readonly failedSteps: number;
  readonly blockerCount: number;
  readonly outputCount: number;
  readonly awaitingApproval: boolean;
  readonly awaitingApprovalStepName?: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly errorMessage?: string;
  readonly updatedAt: string;
}

/** Readiness projection — fast UI reads of current readiness state */
export interface ReadinessProjection {
  readonly projectId: number;
  readonly programId: string | null;
  readonly readinessScope: string;
  readonly overallScore: number;
  readonly isReady: boolean;
  readonly blockerSummary: readonly ReadinessBlockerSummary[];
  readonly missingItemSummary: readonly ReadinessMissingSummary[];
  readonly nextRecommendedActions: readonly ReadinessActionSummary[];
  readonly evaluationId: string;
  readonly evaluatedAt: string;
  readonly updatedAt: string;
}

export interface ReadinessBlockerSummary {
  readonly blockerId: string;
  readonly description: string;
  readonly severity: 'blocker' | 'warning';
  readonly source: 'rules_based' | 'validation_based' | 'ai_inferred';
}

export interface ReadinessMissingSummary {
  readonly ruleCode: string;
  readonly expectedItem: string;
  readonly severity: string;
}

export interface ReadinessActionSummary {
  readonly actionId: string;
  readonly title: string;
  readonly priority: string;
  readonly evidenceClass: string;
}

/** Recommendations projection — fast UI reads of active recommendations */
export interface RecommendationsProjection {
  readonly projectId: number;
  readonly activeRecommendations: readonly RecommendationEntry[];
  readonly totalActive: number;
  readonly totalResolved: number;
  readonly updatedAt: string;
}

export interface RecommendationEntry {
  readonly recommendationId: string;
  readonly title: string;
  readonly recommendationType: string;
  readonly severity: string;
  readonly targetObjectType: string;
  readonly targetObjectId: string;
  readonly reason: string;
  readonly evidenceClass: 'rules_based' | 'validation_based' | 'ai_inferred';
  readonly confidenceLevel: string;
  readonly suggestedAction: string;
  readonly status: 'active' | 'accepted' | 'dismissed' | 'resolved';
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIRESTORE PATHS — canonical path builders
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Canonical Firestore path builders. Used by both the publisher (server)
 * and the subscription hooks (client) to ensure path consistency.
 */
export const FirestorePaths = {
  // ── Event streams (append-only) ────────────────────────────────────
  projectEvent: (tenantId: number, projectId: number, eventId: string) =>
    `tenants/${tenantId}/projects/${projectId}/events/${eventId}`,

  workflowRunEvent: (tenantId: number, projectId: number, runId: string, eventId: string) =>
    `tenants/${tenantId}/projects/${projectId}/workflowRuns/${runId}/events/${eventId}`,

  userNotification: (tenantId: number, userId: string, eventId: string) =>
    `tenants/${tenantId}/users/${userId}/notifications/${eventId}`,

  // ── Projection docs (current state) ────────────────────────────────
  workflowRunCurrent: (tenantId: number, projectId: number, runId: string) =>
    `tenants/${tenantId}/projects/${projectId}/workflowRuns/${runId}/current`,

  readinessCurrent: (tenantId: number, projectId: number) =>
    `tenants/${tenantId}/projects/${projectId}/readiness/current`,

  recommendationsCurrent: (tenantId: number, projectId: number) =>
    `tenants/${tenantId}/projects/${projectId}/recommendations/current`,

  intelligenceCurrent: (tenantId: number, projectId: number) =>
    `tenants/${tenantId}/projects/${projectId}/intelligence/summary`,

  // ── Collections (for queries) ──────────────────────────────────────
  projectEventsCollection: (tenantId: number, projectId: number) =>
    `tenants/${tenantId}/projects/${projectId}/events`,

  workflowRunEventsCollection: (tenantId: number, projectId: number, runId: string) =>
    `tenants/${tenantId}/projects/${projectId}/workflowRuns/${runId}/events`,

  userNotificationsCollection: (tenantId: number, userId: string) =>
    `tenants/${tenantId}/users/${userId}/notifications`,
} as const;
