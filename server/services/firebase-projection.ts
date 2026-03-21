/**
 * Firebase Projection Service — Backend Orchestration Event Publisher
 *
 * Writes read-only projections of workflow state into Firestore for
 * real-time UI streaming. This is the ONLY server-side module allowed
 * to write to Firestore workflow collections.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  FIREBASE USAGE CONSTRAINT                                         ║
 * ║                                                                    ║
 * ║  This service writes PROJECTIONS ONLY.                             ║
 * ║  - Source of truth: PostgreSQL (workflow_runs, approval_checkpoints)║
 * ║  - Firestore data is a cache — clients must tolerate stale reads   ║
 * ║  - If Firestore is unavailable, the system continues normally      ║
 * ║  - Clients fall back to REST API polling when Firebase is down     ║
 * ║  - NEVER read Firestore data to make backend decisions             ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Integration point: OrchestrationEngine.addEventListener() emits events
 * that this service translates into Firestore document writes.
 */

import type { EngineEvent } from './orchestration-engine';
import type {
  WorkflowStepRecord,
  WorkflowBlocker,
  CreatedOutput,
  ReadinessSnapshot,
  IntelligenceBlocker,
  WorkflowOutcome,
  EvidencedRecommendation,
} from '../../shared/schema/orchestration';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Minimal Firestore admin interface — compatible with firebase-admin SDK */
interface FirestoreAdmin {
  collection(path: string): FirestoreCollection;
  doc(path: string): FirestoreDoc;
}

interface FirestoreCollection {
  doc(id: string): FirestoreDoc;
}

interface FirestoreDoc {
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void>;
  delete(): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class FirebaseProjectionService {
  private readonly db: FirestoreAdmin | null;

  constructor(firestoreAdmin: FirestoreAdmin | null) {
    this.db = firestoreAdmin;
  }

  /** Whether Firebase projections are enabled */
  get isEnabled(): boolean {
    return this.db !== null;
  }

  // ── Engine Event Handler ──────────────────────────────────────────────

  /**
   * Handle an orchestration engine event.
   * Wire this into OrchestrationEngine.addEventListener().
   */
  async handleEvent(event: EngineEvent): Promise<void> {
    if (!this.db) return;

    try {
      switch (event.type) {
        case 'run_started':
          await this.projectRunStatus(event.runId, {
            status: 'running',
            currentStepIndex: 0,
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          break;

        case 'step_started':
          await this.projectStepStatus(event.runId, event.stepIndex, {
            status: 'running',
            stepName: event.stepName,
          });
          break;

        case 'step_completed':
          await this.projectStepStatus(event.runId, event.stepIndex, {
            status: event.status,
          });
          await this.projectRunStatus(event.runId, {
            currentStepIndex: event.stepIndex + 1,
            updatedAt: new Date().toISOString(),
          });
          break;

        case 'approval_required':
          await this.projectRunStatus(event.runId, {
            status: 'awaiting_approval',
            updatedAt: new Date().toISOString(),
          });
          await this.projectApprovalGate(event.runId, event.stepIndex, {
            status: 'awaiting_review',
            gateType: event.gateType,
          });
          break;

        case 'approval_resolved':
          await this.projectApprovalGate(event.runId, event.stepIndex, {
            status: event.decision === 'approved' ? 'approved' : 'failed',
          });
          break;

        case 'run_paused':
          await this.projectRunStatus(event.runId, {
            status: 'paused',
            updatedAt: new Date().toISOString(),
          });
          break;

        case 'run_resumed':
          await this.projectRunStatus(event.runId, {
            status: 'running',
            currentStepIndex: event.fromStep,
            updatedAt: new Date().toISOString(),
          });
          break;

        case 'run_completed':
          await this.projectRunStatus(event.runId, {
            status: event.status,
            updatedAt: new Date().toISOString(),
          });
          break;

        case 'run_failed':
          await this.projectRunStatus(event.runId, {
            status: 'failed',
            errorMessage: event.error,
            updatedAt: new Date().toISOString(),
          });
          break;
      }
    } catch {
      // Firestore write failures are non-fatal.
      // The system continues normally; clients fall back to REST polling.
    }
  }

  // ── Full State Projections (called after run completes) ───────────────

  /**
   * Project the full workflow run state after completion.
   * Called by the orchestration service after persisting to PostgreSQL.
   */
  async projectFullRunState(params: {
    readonly runId: string;
    readonly workflowType: string;
    readonly displayName: string;
    readonly status: string;
    readonly triggeredBy: string;
    readonly startedAt: string | null;
    readonly steps: readonly WorkflowStepRecord[];
    readonly blockers: readonly WorkflowBlocker[];
    readonly outputs: readonly CreatedOutput[];
  }): Promise<void> {
    if (!this.db) return;

    try {
      // Project run document
      await this.db.doc(`workflow_runs/${params.runId}`).set({
        runId: params.runId,
        workflowType: params.workflowType,
        displayName: params.displayName,
        status: params.status,
        currentStepIndex: params.steps.length,
        totalSteps: params.steps.length,
        triggeredBy: params.triggeredBy,
        startedAt: params.startedAt,
        updatedAt: new Date().toISOString(),
        blockerCount: params.blockers.length,
        outputCount: params.outputs.length,
      });

      // Project individual steps
      for (const step of params.steps) {
        await this.db
          .doc(`workflow_runs/${params.runId}/steps/${step.stepIndex}`)
          .set({
            stepIndex: step.stepIndex,
            stepName: step.stepName,
            stepType: step.stepType,
            status: step.status,
            durationMs: step.durationMs,
            error: step.error,
          });
      }
    } catch {
      // Non-fatal — system continues
    }
  }

  /**
   * Project the latest readiness snapshot for a project.
   * Called after readiness evaluation completes.
   */
  async projectReadiness(projectId: number, snapshot: ReadinessSnapshot): Promise<void> {
    if (!this.db) return;

    try {
      await this.db
        .doc(`projects/${projectId}/readiness/latest`)
        .set(snapshot as unknown as Record<string, unknown>);
    } catch {
      // Non-fatal
    }
  }

  /**
   * Project the project intelligence summary.
   * Called after project intelligence is updated.
   */
  async projectIntelligence(projectId: number, params: {
    readonly blockerCount: number;
    readonly unresolvedRiskCount: number;
    readonly lastWorkflowStatus: string | null;
    readonly lastWorkflowAt: string | null;
    readonly nextActionCount: number;
    readonly version: number;
  }): Promise<void> {
    if (!this.db) return;

    try {
      await this.db
        .doc(`projects/${projectId}/intelligence/summary`)
        .set({
          ...params,
          updatedAt: new Date().toISOString(),
        });
    } catch {
      // Non-fatal
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────

  private async projectRunStatus(
    runId: string,
    fields: Record<string, unknown>,
  ): Promise<void> {
    if (!this.db) return;
    await this.db.doc(`workflow_runs/${runId}`).set(fields, { merge: true });
  }

  private async projectStepStatus(
    runId: string,
    stepIndex: number,
    fields: Record<string, unknown>,
  ): Promise<void> {
    if (!this.db) return;
    await this.db.doc(`workflow_runs/${runId}/steps/${stepIndex}`).set(fields, { merge: true });
  }

  private async projectApprovalGate(
    runId: string,
    stepIndex: number,
    fields: Record<string, unknown>,
  ): Promise<void> {
    if (!this.db) return;
    await this.db.doc(`workflow_runs/${runId}/approvals/${stepIndex}`).set(fields, { merge: true });
  }
}
