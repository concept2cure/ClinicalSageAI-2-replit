/**
 * Governed Decision Repository
 *
 * Single consolidated service for governed decision management.
 * Replaces three separate files:
 *   - governed-decision-service.ts (recording + queries)
 *   - governed-decision-lifecycle-service.ts (transitions)
 *   - governed-decision-transition-log-service.ts (event log)
 *
 * Design: DB-first. No in-memory arrays. All reads hit the database.
 * One synchronous recording path for the evaluator hot path,
 * everything else is async and durable.
 */

import { randomUUID } from 'crypto';
import { createScopedLogger } from '../utils/logger';
import { governanceMetrics } from './governance-observability';
import type {
  GovernedDocumentEvaluation,
  GovernedDecisionReference,
  GovernedDecisionOutcome,
  GovernedMutationIntent,
} from '../../shared/types/governed-document-fabric';

const log = createScopedLogger('governed-decision-repository');

export const GOVERNED_DECISION_REPOSITORY_VERSION = '2.0.0';

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

export interface GovernedDecisionRecord {
  decisionId: string;
  projectId: string;
  organizationId: string;
  artifactId?: string;
  intent: string;
  outcome: string;
  rationale: string;
  blockerCount: number;
  warningCount: number;
  consequenceCount: number;
  readinessLevel: string;
  readinessScore: number;
  placementOutcome: string;
  exportGateOutcome: string;
  publishGateOutcome: string;
  actorId: string;
  actorRole?: string;
  originSurface?: string;
  regulatorBody?: string;
  submissionType?: string;
  ctdSection?: string;
  timestamp: string;
  fabricVersion: string;
}

export interface GovernedDecisionSummaryReport {
  total: number;
  byOutcome: Record<GovernedDecisionOutcome, number>;
  byIntent: Record<string, number>;
  byReadinessLevel: Record<string, number>;
  averageReadinessScore: number;
  blockedCount: number;
  exportBlockedCount: number;
  publishBlockedCount: number;
  uniqueProjects: number;
  uniqueArtifacts: number;
  windowStart: string | null;
  windowEnd: string | null;
}

export type GovernedLifecycleState =
  | 'recommended_only'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'deferred'
  | 'escalated'
  | 'superseded';

export interface GovernedLifecycleTransition {
  decisionId: string;
  organizationId: number;
  projectId: number;
  targetState: GovernedLifecycleState;
  performedBy: string;
  performedByRole?: string;
  reason?: string;
  notes?: string;
  executedArtifactId?: number;
  executedArtifactVersion?: number;
  executedWorkflowRunId?: string;
  escalatedTo?: string;
  supersededByDecisionId?: string;
}

export interface GovernedLifecycleResult {
  success: boolean;
  decisionId: string;
  previousState: string;
  newState: string;
  transitionedAt: string;
  error?: string;
}

export interface GovernedDecisionTransitionEvent {
  id: string;
  decisionId: string;
  organizationId: number;
  projectId: number;
  fromState: string;
  toState: string;
  action: string;
  actorId: string;
  actorRole?: string;
  reason?: string;
  notes?: string;
  linkedArtifactId?: string;
  linkedPackageId?: string;
  linkedWorkflowRunId?: string;
  supersededByDecisionId?: string;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════
// Lifecycle State Machine
// ═══════════════════════════════════════════════════════════════════════

const VALID_TRANSITIONS: Record<string, GovernedLifecycleState[]> = {
  recommended_only: ['under_review', 'deferred', 'superseded'],
  under_review: ['approved', 'rejected', 'escalated', 'deferred', 'superseded'],
  approved: ['executed', 'superseded'],
  rejected: ['under_review', 'superseded'],
  executed: ['superseded'],
  deferred: ['under_review', 'superseded'],
  escalated: ['under_review', 'approved', 'rejected', 'superseded'],
  superseded: [],
};

export function isValidTransition(from: string, to: GovernedLifecycleState): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

// ═══════════════════════════════════════════════════════════════════════
// Recording — DB-first
// ═══════════════════════════════════════════════════════════════════════

/**
 * Record a governed decision durably. Async, DB-first.
 */
export async function recordGovernedDecision(
  evaluation: GovernedDocumentEvaluation
): Promise<GovernedDecisionReference> {
  const decisionId = randomUUID();
  const timestamp = new Date().toISOString();
  const ref: GovernedDecisionReference = {
    decisionId,
    projectId: evaluation.context.projectId,
    artifactId: evaluation.context.artifactId,
    intent: evaluation.context.intendedAction,
    outcome: evaluation.decision.outcome,
    actorId: evaluation.context.actorId,
    timestamp,
  };

  try {
    const { decisionRecordService } = await import('./decision-record-service.js');
    await decisionRecordService.create({
      organizationId: Number(evaluation.context.organizationId) || 1,
      projectId: Number(evaluation.context.projectId) || 0,
      decisionCode: `governed-fabric:${decisionId}`,
      title: `Governed ${evaluation.context.intendedAction}: ${evaluation.decision.outcome}`.slice(0, 200),
      domainTrack: 'governance',
      recommendationType: 'governed_fabric_decision',
      recommendationSummary: evaluation.decision.rationale.slice(0, 500),
      recommendationRationale: evaluation.decision.rationale,
      confidenceLevel: evaluation.readiness.score >= 75 ? 'high' : evaluation.readiness.score >= 40 ? 'moderate' : 'low',
      decidedBy: evaluation.context.actorId || 'system',
      notes: JSON.stringify({
        fabricVersion: GOVERNED_DECISION_REPOSITORY_VERSION,
        intent: evaluation.context.intendedAction,
        outcome: evaluation.decision.outcome,
        readinessLevel: evaluation.readiness.level,
        readinessScore: evaluation.readiness.score,
        blockerCount: evaluation.decision.blockerCount,
        warningCount: evaluation.decision.warningCount,
        consequenceCount: evaluation.decision.consequenceCount,
        placementOutcome: evaluation.placement.outcome,
        exportGateOutcome: evaluation.exportGate.outcome,
        publishGateOutcome: evaluation.publishGate.outcome,
        artifactId: evaluation.context.artifactId,
        originSurface: evaluation.context.originSurface,
        regulatorBody: evaluation.context.regulatorBody,
        submissionType: evaluation.context.submissionType,
        ctdSection: evaluation.context.ctdSection,
      }),
      decisionContext: {
        governedDecisionId: decisionId,
        kind: 'governed-fabric-decision',
        intent: evaluation.context.intendedAction,
        outcome: evaluation.decision.outcome,
        readinessLevel: evaluation.readiness.level,
        regulatorBody: evaluation.context.regulatorBody,
        submissionType: evaluation.context.submissionType,
      },
    });
    governanceMetrics.recordDecisionCreated(evaluation.decision.outcome);
    governanceMetrics.recordPersistenceWrite();
  } catch (err) {
    governanceMetrics.recordPersistenceFailure('recordGovernedDecision', err);
    log.warn('Governed decision durable write failed', {
      decisionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return ref;
}

/**
 * Synchronous recording for the evaluator hot path.
 * Returns reference immediately; fires DB write as non-blocking background task.
 */
export function recordGovernedDecisionSync(
  evaluation: GovernedDocumentEvaluation
): GovernedDecisionReference {
  const decisionId = randomUUID();
  const timestamp = new Date().toISOString();

  // Fire-and-forget DB write
  recordGovernedDecision(evaluation).catch(() => {
    // Already logged inside recordGovernedDecision
  });

  return {
    decisionId,
    projectId: evaluation.context.projectId,
    artifactId: evaluation.context.artifactId,
    intent: evaluation.context.intendedAction,
    outcome: evaluation.decision.outcome,
    actorId: evaluation.context.actorId,
    timestamp,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Querying — DB-first, no in-memory fallback
// ═══════════════════════════════════════════════════════════════════════

function mapRow(row: Record<string, unknown>): GovernedDecisionRecord {
  const rawNotes = row.notes ?? '';
  const notes: Record<string, unknown> = typeof rawNotes === 'string'
    ? (() => { try { return JSON.parse(rawNotes) as Record<string, unknown>; } catch { return {}; } })()
    : (rawNotes && typeof rawNotes === 'object' ? rawNotes as Record<string, unknown> : {});

  const rawCtx = row.decision_context ?? row.decisionContext ?? '';
  const ctx: Record<string, unknown> = typeof rawCtx === 'string'
    ? (() => { try { return JSON.parse(rawCtx) as Record<string, unknown>; } catch { return {}; } })()
    : (rawCtx && typeof rawCtx === 'object' ? rawCtx as Record<string, unknown> : {});

  return {
    decisionId: String(ctx.governedDecisionId ?? row.id ?? ''),
    projectId: String(row.project_id ?? row.projectId ?? ''),
    organizationId: String(row.organization_id ?? row.organizationId ?? ''),
    artifactId: notes.artifactId != null ? String(notes.artifactId) : undefined,
    intent: String(ctx.intent ?? notes.intent ?? 'unknown'),
    outcome: String(ctx.outcome ?? notes.outcome ?? 'degraded'),
    rationale: String(row.recommendation_summary ?? row.recommendationSummary ?? ''),
    blockerCount: Number(notes.blockerCount ?? 0),
    warningCount: Number(notes.warningCount ?? 0),
    consequenceCount: Number(notes.consequenceCount ?? 0),
    readinessLevel: String(ctx.readinessLevel ?? notes.readinessLevel ?? 'draft'),
    readinessScore: Number(notes.readinessScore ?? 0),
    placementOutcome: String(notes.placementOutcome ?? 'insufficient_context'),
    exportGateOutcome: String(notes.exportGateOutcome ?? 'insufficient_context'),
    publishGateOutcome: String(notes.publishGateOutcome ?? 'insufficient_context'),
    actorId: String(row.decided_by ?? row.decidedBy ?? 'system'),
    timestamp: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    fabricVersion: String(notes.fabricVersion ?? GOVERNED_DECISION_REPOSITORY_VERSION),
  };
}

export async function getRecentGovernedDecisions(options: {
  organizationId?: string;
  projectId?: string;
  limit?: number;
} = {}): Promise<GovernedDecisionRecord[]> {
  try {
    const { decisionRecordService } = await import('./decision-record-service.js');
    const limit = Math.max(1, Math.min(options.limit ?? 50, 500));
    const records = await decisionRecordService.search({
      organizationId: options.organizationId ? Number(options.organizationId) : undefined,
      projectId: options.projectId ? Number(options.projectId) : undefined,
      recommendationType: 'governed_fabric_decision',
      limit,
    });
    return records.map((r: Record<string, unknown>) => mapRow(r));
  } catch {
    return [];
  }
}

export async function getGovernedDecisionSummary(options: {
  organizationId?: string;
  projectId?: string;
} = {}): Promise<GovernedDecisionSummaryReport> {
  const records = await getRecentGovernedDecisions({ ...options, limit: 500 });
  const summary: GovernedDecisionSummaryReport = {
    total: records.length,
    byOutcome: { allow: 0, block: 0, review: 0, degraded: 0 },
    byIntent: {},
    byReadinessLevel: {},
    averageReadinessScore: 0,
    blockedCount: 0,
    exportBlockedCount: 0,
    publishBlockedCount: 0,
    uniqueProjects: new Set(records.map(d => d.projectId)).size,
    uniqueArtifacts: new Set(records.filter(d => d.artifactId).map(d => d.artifactId!)).size,
    windowStart: records[0]?.timestamp || null,
    windowEnd: records[records.length - 1]?.timestamp || null,
  };

  let totalScore = 0;
  for (const d of records) {
    summary.byOutcome[d.outcome as GovernedDecisionOutcome] = (summary.byOutcome[d.outcome as GovernedDecisionOutcome] || 0) + 1;
    summary.byIntent[d.intent] = (summary.byIntent[d.intent] || 0) + 1;
    summary.byReadinessLevel[d.readinessLevel] = (summary.byReadinessLevel[d.readinessLevel] || 0) + 1;
    totalScore += d.readinessScore;
    if (d.outcome === 'block') summary.blockedCount++;
    if (d.exportGateOutcome === 'blocked') summary.exportBlockedCount++;
    if (d.publishGateOutcome === 'blocked') summary.publishBlockedCount++;
  }
  summary.averageReadinessScore = records.length > 0 ? Math.round(totalScore / records.length) : 0;
  return summary;
}

export async function getArtifactDecisionTrace(
  projectId: string,
  artifactId: string
): Promise<GovernedDecisionRecord[]> {
  const records = await getRecentGovernedDecisions({ projectId, limit: 200 });
  return records.filter(d => d.artifactId === artifactId);
}

export async function getGovernedDecision(
  decisionId: string,
  organizationId: number
): Promise<GovernedDecisionRecord | null> {
  try {
    const { decisionRecordService } = await import('./decision-record-service.js');
    const record = await decisionRecordService.getById(decisionId, organizationId);
    return record ? mapRow(record as unknown as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Lifecycle Transitions
// ═══════════════════════════════════════════════════════════════════════

export async function transitionGovernedDecision(
  input: GovernedLifecycleTransition
): Promise<GovernedLifecycleResult> {
  const timestamp = new Date().toISOString();

  try {
    const { decisionRecordService } = await import('./decision-record-service.js');
    const current = await decisionRecordService.getById(input.decisionId, input.organizationId);
    if (!current) {
      return { success: false, decisionId: input.decisionId, previousState: 'unknown', newState: input.targetState, transitionedAt: timestamp, error: 'Decision not found' };
    }

    const currentState = current.actionState || 'recommended_only';
    if (!isValidTransition(currentState, input.targetState)) {
      return { success: false, decisionId: input.decisionId, previousState: currentState, newState: input.targetState, transitionedAt: timestamp, error: `Invalid transition: ${currentState} → ${input.targetState}` };
    }

    const transitioned = await decisionRecordService.transition(input.decisionId, {
      organizationId: input.organizationId,
      actionState: input.targetState as string,
      performedBy: input.performedBy,
      reason: input.reason,
      escalatedTo: input.escalatedTo,
      executedArtifactId: input.executedArtifactId,
      executedArtifactVersion: input.executedArtifactVersion,
      executedWorkflowRunId: input.executedWorkflowRunId,
    });

    if (!transitioned) {
      return { success: false, decisionId: input.decisionId, previousState: currentState, newState: input.targetState, transitionedAt: timestamp, error: 'Transition failed' };
    }

    // Record transition event durably
    await recordTransitionEvent({
      decisionId: input.decisionId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      fromState: currentState,
      toState: input.targetState,
      action: input.targetState,
      actorId: input.performedBy,
      actorRole: input.performedByRole,
      reason: input.reason,
      notes: input.notes,
      linkedArtifactId: input.executedArtifactId ? String(input.executedArtifactId) : undefined,
      linkedWorkflowRunId: input.executedWorkflowRunId,
      supersededByDecisionId: input.supersededByDecisionId,
    });

    log.info('Governed decision transitioned', { decisionId: input.decisionId, from: currentState, to: input.targetState, by: input.performedBy });
    return { success: true, decisionId: input.decisionId, previousState: currentState, newState: input.targetState, transitionedAt: timestamp };
  } catch (err) {
    return { success: false, decisionId: input.decisionId, previousState: 'unknown', newState: input.targetState, transitionedAt: timestamp, error: err instanceof Error ? err.message : String(err) };
  }
}

// Convenience wrappers
export const submitForReview = (id: string, org: number, proj: number, by: string, reason?: string) =>
  transitionGovernedDecision({ decisionId: id, organizationId: org, projectId: proj, targetState: 'under_review', performedBy: by, reason: reason || 'Submitted for review' });
export const approveDecision = (id: string, org: number, proj: number, by: string, reason?: string) =>
  transitionGovernedDecision({ decisionId: id, organizationId: org, projectId: proj, targetState: 'approved', performedBy: by, reason: reason || 'Approved' });
export const rejectDecision = (id: string, org: number, proj: number, by: string, reason: string) =>
  transitionGovernedDecision({ decisionId: id, organizationId: org, projectId: proj, targetState: 'rejected', performedBy: by, reason });
export const escalateDecision = (id: string, org: number, proj: number, by: string, to: string, reason: string) =>
  transitionGovernedDecision({ decisionId: id, organizationId: org, projectId: proj, targetState: 'escalated', performedBy: by, escalatedTo: to, reason });
export const deferDecision = (id: string, org: number, proj: number, by: string, reason: string) =>
  transitionGovernedDecision({ decisionId: id, organizationId: org, projectId: proj, targetState: 'deferred', performedBy: by, reason });
export const executeDecision = (id: string, org: number, proj: number, by: string, exec: { artifactId?: number; artifactVersion?: number; workflowRunId?: string }) =>
  transitionGovernedDecision({ decisionId: id, organizationId: org, projectId: proj, targetState: 'executed', performedBy: by, reason: 'Decision executed', executedArtifactId: exec.artifactId, executedArtifactVersion: exec.artifactVersion, executedWorkflowRunId: exec.workflowRunId });
export const supersedeDecision = (id: string, org: number, proj: number, by: string, replacedBy: string, reason: string) =>
  transitionGovernedDecision({ decisionId: id, organizationId: org, projectId: proj, targetState: 'superseded', performedBy: by, supersededByDecisionId: replacedBy, reason });

// ═══════════════════════════════════════════════════════════════════════
// Transition Event Log — DB-first
// ═══════════════════════════════════════════════════════════════════════

export async function recordTransitionEvent(
  event: Omit<GovernedDecisionTransitionEvent, 'id' | 'createdAt'>
): Promise<GovernedDecisionTransitionEvent> {
  const record: GovernedDecisionTransitionEvent = {
    ...event,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };

  try {
    const { pool } = await import('../db.js');
    await pool.query(
      `INSERT INTO governed_decision_transitions
       (id, decision_id, organization_id, project_id, from_state, to_state,
        action, actor_id, actor_role, reason, notes,
        linked_artifact_id, linked_package_id, linked_workflow_run_id,
        superseded_by_decision_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (id) DO NOTHING`,
      [record.id, record.decisionId, record.organizationId, record.projectId,
       record.fromState, record.toState, record.action, record.actorId,
       record.actorRole || null, record.reason || null, record.notes || null,
       record.linkedArtifactId || null, record.linkedPackageId || null,
       record.linkedWorkflowRunId || null, record.supersededByDecisionId || null,
       record.createdAt]
    );
  } catch (err) {
    log.warn('Transition event write failed', { eventId: record.id, error: err instanceof Error ? err.message : String(err) });
  }

  return record;
}

export async function getDecisionTimeline(
  decisionId: string,
  organizationId: number
): Promise<GovernedDecisionTransitionEvent[]> {
  try {
    const { pool } = await import('../db.js');
    const result = await pool.query(
      `SELECT * FROM governed_decision_transitions WHERE decision_id = $1 AND organization_id = $2 ORDER BY created_at ASC LIMIT 200`,
      [decisionId, organizationId]
    );
    return result.rows.map(mapTransitionRow);
  } catch {
    return [];
  }
}

export async function getProjectReviewQueue(
  projectId: number,
  organizationId: number
): Promise<{ pending: string[]; escalated: string[]; deferred: string[]; rejected: string[] }> {
  try {
    const { pool } = await import('../db.js');
    const result = await pool.query(
      `WITH latest AS (
        SELECT DISTINCT ON (decision_id) decision_id, to_state
        FROM governed_decision_transitions
        WHERE project_id = $1 AND organization_id = $2
        ORDER BY decision_id, created_at DESC
      )
      SELECT decision_id, to_state FROM latest
      WHERE to_state IN ('under_review', 'escalated', 'deferred', 'rejected')`,
      [projectId, organizationId]
    );
    const pending: string[] = [], escalated: string[] = [], deferred: string[] = [], rejected: string[] = [];
    for (const row of result.rows) {
      const id = String(row.decision_id);
      if (row.to_state === 'under_review') pending.push(id);
      else if (row.to_state === 'escalated') escalated.push(id);
      else if (row.to_state === 'deferred') deferred.push(id);
      else if (row.to_state === 'rejected') rejected.push(id);
    }
    return { pending, escalated, deferred, rejected };
  } catch {
    return { pending: [], escalated: [], deferred: [], rejected: [] };
  }
}

export async function hasUnresolvedGovernedDecisions(
  projectId: number,
  organizationId: number
): Promise<{ hasUnresolved: boolean; unresolvedCount: number; escalatedCount: number; states: Record<string, number> }> {
  const queue = await getProjectReviewQueue(projectId, organizationId);
  const unresolvedCount = queue.pending.length + queue.escalated.length;
  return {
    hasUnresolved: unresolvedCount > 0,
    unresolvedCount,
    escalatedCount: queue.escalated.length,
    states: { under_review: queue.pending.length, escalated: queue.escalated.length, deferred: queue.deferred.length, rejected: queue.rejected.length },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function mapTransitionRow(row: Record<string, unknown>): GovernedDecisionTransitionEvent {
  return {
    id: String(row.id),
    decisionId: String(row.decision_id),
    organizationId: Number(row.organization_id),
    projectId: Number(row.project_id),
    fromState: String(row.from_state),
    toState: String(row.to_state),
    action: String(row.action),
    actorId: String(row.actor_id),
    actorRole: row.actor_role ? String(row.actor_role) : undefined,
    reason: row.reason ? String(row.reason) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    linkedArtifactId: row.linked_artifact_id ? String(row.linked_artifact_id) : undefined,
    linkedPackageId: row.linked_package_id ? String(row.linked_package_id) : undefined,
    linkedWorkflowRunId: row.linked_workflow_run_id ? String(row.linked_workflow_run_id) : undefined,
    supersededByDecisionId: row.superseded_by_decision_id ? String(row.superseded_by_decision_id) : undefined,
    createdAt: String(row.created_at),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════

/** No-op — DB is authoritative. Provided for test backward compatibility. */
export function clearGovernedDecisionLog(): void {}

/** No-op — DB is authoritative. Provided for test backward compatibility. */
export function clearTransitionLog(): void {}
