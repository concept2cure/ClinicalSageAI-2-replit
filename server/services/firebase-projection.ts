/**
 * Firebase Projection Publisher — Backend Event Delivery & Projection Layer
 *
 * The ONLY server-side module that writes to Firestore.
 * All Firestore writes are centralized here. Business logic files
 * call this publisher — they never touch Firestore directly.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  FIREBASE USAGE CONSTRAINT                                         ║
 * ║                                                                    ║
 * ║  This service writes PROJECTIONS and EVENTS only.                  ║
 * ║  Source of truth: PostgreSQL.                                      ║
 * ║  All publishes happen AFTER backend state is committed.            ║
 * ║  Firestore failures are non-fatal — canonical execution continues. ║
 * ║  NEVER read Firestore data to make backend decisions.              ║
 * ║  NEVER store governed document content in Firestore.               ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Architecture:
 *   1. Append-only event stream writes → history
 *   2. Projection/materialized doc writes → fast UI reads
 *   3. OrchestrationEngine events → workflow visibility
 *   4. Domain lifecycle hooks → validation, readiness, recommendations
 *
 * @module server/services/firebase-projection
 */

import { v4 as uuidv4 } from 'uuid';
import type { FirestoreAdminDb } from './firebase-admin';
import type { EngineEvent, RunResult } from './orchestration-engine';
import type {
  WorkflowStepRecord,
  WorkflowBlocker,
  CreatedOutput,
  EvidencedRecommendation,
  ReadinessSnapshot,
  ReadinessFinding,
} from '../../shared/schema/orchestration';
import type {
  FirebaseEventEnvelope,
  FirebaseEventType,
  FirebaseObjectType,
  WorkflowRunProjection,
  ReadinessProjection,
  ReadinessBlockerSummary,
  ReadinessMissingSummary,
  ReadinessActionSummary,
  RecommendationsProjection,
  RecommendationEntry,
  WorkflowRunEventPayload,
  WorkflowStepEventPayload,
  AIActionEventPayload,
  ValidationEventPayload,
  DocumentEventPayload,
  ReadinessEventPayload,
  RecommendationEventPayload,
} from '../../shared/types/firebase-events';
import { FirestorePaths } from '../../shared/types/firebase-events';

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLISHER SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class FirebaseProjectionPublisher {
  private readonly db: FirestoreAdminDb | null;

  constructor(firestoreAdmin: FirestoreAdminDb | null) {
    this.db = firestoreAdmin;

    if (this.db) {
      console.info('[firebase-projection] Publisher initialized — projections enabled');
    } else {
      console.info('[firebase-projection] Publisher initialized in no-op mode — Firestore unavailable');
    }
  }

  /** Whether Firebase projections are enabled */
  get isEnabled(): boolean {
    return this.db !== null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE: Event Publishing
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Publish a typed event envelope to the append-only event stream.
   * This is the single entry point for all event writes.
   *
   * Writes to:
   *   - tenants/{tenantId}/projects/{projectId}/events/{eventId}
   *   - tenants/{tenantId}/projects/{projectId}/workflowRuns/{runId}/events/{eventId} (if workflow-scoped)
   */
  async publishEvent<T extends Record<string, unknown>>(
    envelope: FirebaseEventEnvelope<T>,
  ): Promise<void> {
    if (!this.db) return;

    try {
      const data = envelope as unknown as Record<string, unknown>;

      // Write to project event stream
      if (envelope.projectId !== null) {
        const path = FirestorePaths.projectEvent(
          envelope.tenantId,
          envelope.projectId,
          envelope.eventId,
        );
        await this.db.doc(path).set(data);
      }

      // Also write to workflow-scoped stream if applicable
      if (envelope.workflowRunId && envelope.projectId !== null) {
        const path = FirestorePaths.workflowRunEvent(
          envelope.tenantId,
          envelope.projectId,
          envelope.workflowRunId,
          envelope.eventId,
        );
        await this.db.doc(path).set(data);
      }
    } catch (err) {
      this.logPublishError('publishEvent', envelope.eventType, err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WORKFLOW EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  async publishWorkflowEvent(params: {
    readonly tenantId: number;
    readonly projectId: number;
    readonly workflowRunId: string;
    readonly eventType: Extract<FirebaseEventType, `workflow.${string}`>;
    readonly actorType: FirebaseEventEnvelope['actorType'];
    readonly actorId: string;
    readonly correlationId: string;
    readonly payload: WorkflowRunEventPayload | WorkflowStepEventPayload;
  }): Promise<void> {
    const objectType: FirebaseObjectType = params.eventType.includes('.step.')
      ? 'workflow_step'
      : 'workflow_run';

    await this.publishEvent({
      eventId: uuidv4(),
      eventType: params.eventType,
      eventVersion: 'v1',
      occurredAt: new Date().toISOString(),
      tenantId: params.tenantId,
      projectId: params.projectId,
      module: null,
      objectType,
      objectId: params.workflowRunId,
      workflowRunId: params.workflowRunId,
      actorType: params.actorType,
      actorId: params.actorId,
      correlationId: params.correlationId,
      payload: params.payload as Record<string, unknown>,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI ACTION EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  async publishAIActionEvent(params: {
    readonly tenantId: number;
    readonly projectId: number;
    readonly workflowRunId: string | null;
    readonly eventType: Extract<FirebaseEventType, `ai.${string}`>;
    readonly actorId: string;
    readonly correlationId: string;
    readonly payload: AIActionEventPayload;
  }): Promise<void> {
    await this.publishEvent({
      eventId: uuidv4(),
      eventType: params.eventType,
      eventVersion: 'v1',
      occurredAt: new Date().toISOString(),
      tenantId: params.tenantId,
      projectId: params.projectId,
      module: null,
      objectType: 'ai_action',
      objectId: params.payload.actionId,
      workflowRunId: params.workflowRunId,
      actorType: 'ai_reasoning',
      actorId: params.actorId,
      correlationId: params.correlationId,
      payload: params.payload as Record<string, unknown>,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  async publishValidationEvent(params: {
    readonly tenantId: number;
    readonly projectId: number;
    readonly workflowRunId: string | null;
    readonly eventType: Extract<FirebaseEventType, `validation.${string}`>;
    readonly actorId: string;
    readonly correlationId: string;
    readonly payload: ValidationEventPayload;
  }): Promise<void> {
    await this.publishEvent({
      eventId: uuidv4(),
      eventType: params.eventType,
      eventVersion: 'v1',
      occurredAt: new Date().toISOString(),
      tenantId: params.tenantId,
      projectId: params.projectId,
      module: null,
      objectType: params.eventType.includes('.finding.') ? 'validation_finding' : 'validation_run',
      objectId: params.payload.validationRunId,
      workflowRunId: params.workflowRunId,
      actorType: 'ai_deterministic',
      actorId: params.actorId,
      correlationId: params.correlationId,
      payload: params.payload as Record<string, unknown>,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENT / ARTIFACT EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  async publishDocumentEvent(params: {
    readonly tenantId: number;
    readonly projectId: number;
    readonly workflowRunId: string | null;
    readonly eventType: Extract<FirebaseEventType, `document.${string}` | `artifact.${string}`>;
    readonly actorType: FirebaseEventEnvelope['actorType'];
    readonly actorId: string;
    readonly correlationId: string;
    readonly payload: DocumentEventPayload;
  }): Promise<void> {
    const objectType: FirebaseObjectType = params.eventType.startsWith('artifact.')
      ? 'artifact'
      : params.eventType.includes('.version.')
        ? 'document_version'
        : 'document';

    await this.publishEvent({
      eventId: uuidv4(),
      eventType: params.eventType,
      eventVersion: 'v1',
      occurredAt: new Date().toISOString(),
      tenantId: params.tenantId,
      projectId: params.projectId,
      module: null,
      objectType,
      objectId: params.payload.documentId,
      workflowRunId: params.workflowRunId,
      actorType: params.actorType,
      actorId: params.actorId,
      correlationId: params.correlationId,
      payload: params.payload as Record<string, unknown>,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // READINESS EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  async publishReadinessEvent(params: {
    readonly tenantId: number;
    readonly projectId: number;
    readonly workflowRunId: string | null;
    readonly eventType: Extract<FirebaseEventType, `readiness.${string}`>;
    readonly actorId: string;
    readonly correlationId: string;
    readonly payload: ReadinessEventPayload;
  }): Promise<void> {
    const objectType: FirebaseObjectType = params.eventType.includes('.blocker.')
      ? 'readiness_rule'
      : 'readiness_evaluation';

    await this.publishEvent({
      eventId: uuidv4(),
      eventType: params.eventType,
      eventVersion: 'v1',
      occurredAt: new Date().toISOString(),
      tenantId: params.tenantId,
      projectId: params.projectId,
      module: null,
      objectType,
      objectId: params.payload.evaluationId ?? params.payload.blockerId ?? 'project',
      workflowRunId: params.workflowRunId,
      actorType: 'system',
      actorId: params.actorId,
      correlationId: params.correlationId,
      payload: params.payload as Record<string, unknown>,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECOMMENDATION EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  async publishRecommendationEvent(params: {
    readonly tenantId: number;
    readonly projectId: number;
    readonly workflowRunId: string | null;
    readonly eventType: Extract<FirebaseEventType, `recommendation.${string}`>;
    readonly actorType: FirebaseEventEnvelope['actorType'];
    readonly actorId: string;
    readonly correlationId: string;
    readonly payload: RecommendationEventPayload;
  }): Promise<void> {
    await this.publishEvent({
      eventId: uuidv4(),
      eventType: params.eventType,
      eventVersion: 'v1',
      occurredAt: new Date().toISOString(),
      tenantId: params.tenantId,
      projectId: params.projectId,
      module: null,
      objectType: 'recommendation',
      objectId: params.payload.recommendationId,
      workflowRunId: params.workflowRunId,
      actorType: params.actorType,
      actorId: params.actorId,
      correlationId: params.correlationId,
      payload: params.payload as Record<string, unknown>,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTIFICATION EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  async publishNotificationEvent(params: {
    readonly tenantId: number;
    readonly userId: string;
    readonly title: string;
    readonly body: string;
    readonly eventType: FirebaseEventType;
    readonly relatedObjectType: FirebaseObjectType;
    readonly relatedObjectId: string;
    readonly projectId?: number;
    readonly correlationId: string;
  }): Promise<void> {
    if (!this.db) return;

    try {
      const eventId = uuidv4();
      const path = FirestorePaths.userNotification(
        params.tenantId,
        params.userId,
        eventId,
      );
      await this.db.doc(path).set({
        eventId,
        title: params.title,
        body: params.body,
        eventType: params.eventType,
        relatedObjectType: params.relatedObjectType,
        relatedObjectId: params.relatedObjectId,
        projectId: params.projectId ?? null,
        correlationId: params.correlationId,
        read: false,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      this.logPublishError('publishNotificationEvent', params.eventType, err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROJECTION UPDATES — Materialized current-state docs
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Update the workflow run projection doc.
   * Called after each workflow lifecycle state change is committed to PostgreSQL.
   */
  async updateWorkflowProjection(
    tenantId: number,
    projectId: number,
    projection: WorkflowRunProjection,
  ): Promise<void> {
    if (!this.db) return;

    try {
      const path = FirestorePaths.workflowRunCurrent(tenantId, projectId, projection.runId);
      await this.db.doc(path).set(projection as unknown as Record<string, unknown>);
    } catch (err) {
      this.logPublishError('updateWorkflowProjection', 'projection', err);
    }
  }

  /**
   * Update the readiness projection doc.
   * Called after a readiness evaluation is committed to PostgreSQL.
   */
  async updateReadinessProjection(
    tenantId: number,
    projectId: number,
    projection: ReadinessProjection,
  ): Promise<void> {
    if (!this.db) return;

    try {
      const path = FirestorePaths.readinessCurrent(tenantId, projectId);
      await this.db.doc(path).set(projection as unknown as Record<string, unknown>);
    } catch (err) {
      this.logPublishError('updateReadinessProjection', 'projection', err);
    }
  }

  /**
   * Update the recommendations projection doc.
   * Called after recommendations are generated or resolved.
   */
  async updateRecommendationsProjection(
    tenantId: number,
    projectId: number,
    projection: RecommendationsProjection,
  ): Promise<void> {
    if (!this.db) return;

    try {
      const path = FirestorePaths.recommendationsCurrent(tenantId, projectId);
      await this.db.doc(path).set(projection as unknown as Record<string, unknown>);
    } catch (err) {
      this.logPublishError('updateRecommendationsProjection', 'projection', err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ORCHESTRATION ENGINE INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle an OrchestrationEngine event.
   * Wire this into engine.addEventListener(publisher.handleEngineEvent).
   *
   * This translates engine-internal events into:
   *   1. Append-only Firestore events
   *   2. Projection doc updates
   */
  createEngineEventHandler(params: {
    readonly tenantId: number;
    readonly projectId: number;
    readonly correlationId: string;
  }): (event: EngineEvent) => void {
    return (event: EngineEvent) => {
      // Fire-and-forget — never block the engine
      void this.handleEngineEvent(event, params).catch((err) => {
        this.logPublishError('handleEngineEvent', event.type, err);
      });
    };
  }

  private async handleEngineEvent(
    event: EngineEvent,
    params: { readonly tenantId: number; readonly projectId: number; readonly correlationId: string },
  ): Promise<void> {
    const { tenantId, projectId, correlationId } = params;

    switch (event.type) {
      case 'run_started':
        await this.publishWorkflowEvent({
          tenantId,
          projectId,
          workflowRunId: event.runId,
          eventType: 'workflow.run.started',
          actorType: 'system',
          actorId: 'orchestration_engine',
          correlationId,
          payload: {
            workflowType: event.workflowType,
            displayName: event.workflowType,
            status: 'running',
            triggerSource: 'system',
          },
        });
        break;

      case 'step_started':
        await this.publishWorkflowEvent({
          tenantId,
          projectId,
          workflowRunId: event.runId,
          eventType: 'workflow.step.started',
          actorType: 'system',
          actorId: 'orchestration_engine',
          correlationId,
          payload: {
            stepIndex: event.stepIndex,
            stepName: event.stepName,
            stepType: 'deterministic', // Engine event doesn't carry this; safe default
            status: 'running',
          },
        });
        break;

      case 'step_completed':
        await this.publishWorkflowEvent({
          tenantId,
          projectId,
          workflowRunId: event.runId,
          eventType: 'workflow.step.completed',
          actorType: 'system',
          actorId: 'orchestration_engine',
          correlationId,
          payload: {
            stepIndex: event.stepIndex,
            stepName: '',
            stepType: 'deterministic',
            status: event.status,
          },
        });
        break;

      case 'approval_required':
        await this.publishWorkflowEvent({
          tenantId,
          projectId,
          workflowRunId: event.runId,
          eventType: 'workflow.step.awaiting_approval',
          actorType: 'system',
          actorId: 'orchestration_engine',
          correlationId,
          payload: {
            stepIndex: event.stepIndex,
            stepName: '',
            stepType: 'deterministic',
            status: 'awaiting_review',
          },
        });
        break;

      case 'run_completed':
        await this.publishWorkflowEvent({
          tenantId,
          projectId,
          workflowRunId: event.runId,
          eventType: 'workflow.run.completed',
          actorType: 'system',
          actorId: 'orchestration_engine',
          correlationId,
          payload: {
            workflowType: '',
            displayName: '',
            status: event.status,
            triggerSource: 'system',
          },
        });
        break;

      case 'run_failed':
        await this.publishWorkflowEvent({
          tenantId,
          projectId,
          workflowRunId: event.runId,
          eventType: 'workflow.run.failed',
          actorType: 'system',
          actorId: 'orchestration_engine',
          correlationId,
          payload: {
            workflowType: '',
            displayName: '',
            status: 'failed',
            triggerSource: 'system',
            errorMessage: event.error,
            errorStepIndex: event.stepIndex,
          },
        });
        break;

      case 'run_paused':
        await this.publishWorkflowEvent({
          tenantId,
          projectId,
          workflowRunId: event.runId,
          eventType: 'workflow.run.cancelled', // Closest match for pause
          actorType: 'system',
          actorId: 'orchestration_engine',
          correlationId,
          payload: {
            workflowType: '',
            displayName: '',
            status: 'paused',
            triggerSource: 'system',
          },
        });
        break;

      case 'run_resumed':
        await this.publishWorkflowEvent({
          tenantId,
          projectId,
          workflowRunId: event.runId,
          eventType: 'workflow.run.resumed',
          actorType: 'system',
          actorId: 'orchestration_engine',
          correlationId,
          payload: {
            workflowType: '',
            displayName: '',
            status: 'running',
            triggerSource: 'system',
            currentStepIndex: event.fromStep,
          },
        });
        break;

      case 'approval_resolved':
        // Handled via direct publishWorkflowEvent calls from approval service
        break;
    }
  }

  /**
   * Build a WorkflowRunProjection from a completed RunResult.
   * Called after the run is persisted to PostgreSQL.
   */
  buildWorkflowProjection(
    result: RunResult,
    params: {
      readonly workflowType: string;
      readonly displayName: string;
      readonly triggerSource: string;
      readonly triggeredBy: string;
      readonly totalSteps: number;
    },
  ): WorkflowRunProjection {
    const completedSteps = result.stepsExecuted.filter(s => s.status === 'executed').length;
    const failedSteps = result.stepsExecuted.filter(s => s.status === 'failed').length;

    return {
      runId: result.runId,
      workflowType: params.workflowType,
      displayName: params.displayName,
      status: result.status,
      triggerSource: params.triggerSource,
      triggeredBy: params.triggeredBy,
      currentStepIndex: result.stepsExecuted.length,
      totalSteps: params.totalSteps,
      progressPercent: params.totalSteps > 0
        ? Math.round((completedSteps / params.totalSteps) * 100)
        : 0,
      completedSteps,
      failedSteps,
      blockerCount: result.context.blockers.length,
      outputCount: result.context.outputsCreated.length,
      awaitingApproval: result.status === 'awaiting_approval',
      awaitingApprovalStepName: result.awaitingApprovalAtStep !== undefined
        ? result.stepsExecuted[result.awaitingApprovalAtStep]?.stepName
        : undefined,
      startedAt: result.stepsExecuted[0]?.startedAt ?? null,
      completedAt: result.status === 'completed'
        ? result.stepsExecuted[result.stepsExecuted.length - 1]?.completedAt ?? null
        : null,
      errorMessage: result.errorMessage,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Build a ReadinessProjection from evaluation data.
   * Called after readiness evaluation is committed to PostgreSQL.
   */
  buildReadinessProjection(params: {
    readonly projectId: number;
    readonly programId: string | null;
    readonly scope: string;
    readonly overallScore: number;
    readonly isReady: boolean;
    readonly blockers: readonly ReadinessBlockerSummary[];
    readonly missingItems: readonly ReadinessMissingSummary[];
    readonly nextActions: readonly ReadinessActionSummary[];
    readonly evaluationId: string;
  }): ReadinessProjection {
    return {
      projectId: params.projectId,
      programId: params.programId,
      readinessScope: params.scope,
      overallScore: params.overallScore,
      isReady: params.isReady,
      blockerSummary: params.blockers,
      missingItemSummary: params.missingItems,
      nextRecommendedActions: params.nextActions,
      evaluationId: params.evaluationId,
      evaluatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Structured error logging for publish failures.
   * All errors are logged but NEVER propagated to break canonical execution.
   */
  private logPublishError(method: string, context: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[firebase-projection] ${method} failed for "${context}": ${message}`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

let _instance: FirebaseProjectionPublisher | null = null;

/**
 * Get the singleton publisher instance.
 * Must be initialized via initFirebasePublisher() at server startup.
 */
export function getFirebasePublisher(): FirebaseProjectionPublisher {
  if (!_instance) {
    // Return a no-op publisher if not yet initialized
    _instance = new FirebaseProjectionPublisher(null);
  }
  return _instance;
}

/**
 * Initialize the singleton publisher with a Firestore Admin instance.
 * Call once at server startup, after Firebase Admin is initialized.
 */
export function initFirebasePublisher(db: FirestoreAdminDb | null): FirebaseProjectionPublisher {
  _instance = new FirebaseProjectionPublisher(db);
  return _instance;
}
