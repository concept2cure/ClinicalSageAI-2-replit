/**
 * Governed Decision Transition Log Service
 *
 * Durably records every lifecycle transition as an event.
 * This replaces the stub in getDecisionLifecycleHistory() with
 * real event storage and queries.
 *
 * Uses the existing `governance_boundary_transitions` table pattern
 * but stores decision lifecycle events (review/approve/reject/escalate/
 * defer/execute/supersede) rather than boundary transitions.
 */

import { createScopedLogger } from '../utils/logger';
import { randomUUID } from 'crypto';

const log = createScopedLogger('governed-decision-transition-log');

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

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

// In-memory log (hot cache) + durable write-through
const transitionLog: GovernedDecisionTransitionEvent[] = [];
const MAX_LOG_SIZE = 5000;

// ═══════════════════════════════════════════════════════════════════════
// Write
// ═══════════════════════════════════════════════════════════════════════

/**
 * Record a governed decision lifecycle transition event.
 * Writes to both in-memory cache and durable storage.
 */
export function recordTransitionEvent(event: Omit<GovernedDecisionTransitionEvent, 'id' | 'createdAt'>): GovernedDecisionTransitionEvent {
  const record: GovernedDecisionTransitionEvent = {
    ...event,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };

  // In-memory cache
  transitionLog.push(record);
  if (transitionLog.length > MAX_LOG_SIZE) {
    transitionLog.splice(0, transitionLog.length - MAX_LOG_SIZE);
  }

  // Durable write (non-blocking)
  persistTransitionEventDurably(record).catch(() => {
    // Durable write failed — in-memory still has the event
  });

  return record;
}

// ═══════════════════════════════════════════════════════════════════════
// Queries
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get full transition timeline for a decision — all events in order.
 */
export function getDecisionTimeline(
  decisionId: string
): GovernedDecisionTransitionEvent[] {
  return transitionLog
    .filter(e => e.decisionId === decisionId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Get durable transition timeline (queries DB, falls back to memory).
 */
export async function getDecisionTimelineDurable(
  decisionId: string,
  organizationId: number
): Promise<GovernedDecisionTransitionEvent[]> {
  try {
    const { pool } = await import('../db.js');
    const result = await pool.query(
      `SELECT * FROM governed_decision_transitions
       WHERE decision_id = $1 AND organization_id = $2
       ORDER BY created_at ASC
       LIMIT 200`,
      [decisionId, organizationId]
    );
    if (result.rows.length > 0) {
      return result.rows.map(mapRow);
    }
  } catch {
    // DB unavailable or table doesn't exist yet
  }
  return getDecisionTimeline(decisionId);
}

/**
 * Get project-scoped review queue — decisions requiring action.
 */
export function getProjectReviewQueue(
  projectId: number,
  organizationId: number
): { pending: string[]; escalated: string[]; deferred: string[]; rejected: string[] } {
  const projectEvents = transitionLog.filter(
    e => e.projectId === projectId && e.organizationId === organizationId
  );

  // Build current state map from latest event per decision
  const latestState = new Map<string, string>();
  for (const event of projectEvents) {
    latestState.set(event.decisionId, event.toState);
  }

  const pending: string[] = [];
  const escalated: string[] = [];
  const deferred: string[] = [];
  const rejected: string[] = [];

  for (const [decisionId, state] of latestState) {
    if (state === 'under_review') pending.push(decisionId);
    if (state === 'escalated') escalated.push(decisionId);
    if (state === 'deferred') deferred.push(decisionId);
    if (state === 'rejected') rejected.push(decisionId);
  }

  return { pending, escalated, deferred, rejected };
}

/**
 * Check if a project has unresolved governed decisions that should
 * block readiness/export/dispatch.
 */
export function hasUnresolvedGovernedDecisions(
  projectId: number,
  organizationId: number
): { hasUnresolved: boolean; unresolvedCount: number; escalatedCount: number; states: Record<string, number> } {
  const queue = getProjectReviewQueue(projectId, organizationId);
  const unresolvedCount = queue.pending.length + queue.escalated.length;
  const states: Record<string, number> = {
    under_review: queue.pending.length,
    escalated: queue.escalated.length,
    deferred: queue.deferred.length,
    rejected: queue.rejected.length,
  };

  return {
    hasUnresolved: unresolvedCount > 0,
    unresolvedCount,
    escalatedCount: queue.escalated.length,
    states,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Durable-first queue queries (survive restart)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Durable-first review queue. Queries governed_decision_transitions table,
 * falls back to in-memory if DB unavailable.
 */
export async function getProjectReviewQueueDurable(
  projectId: number,
  organizationId: number
): Promise<{ pending: string[]; escalated: string[]; deferred: string[]; rejected: string[] }> {
  try {
    const { pool } = await import('../db.js');
    // Get latest state per decision using window function
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

    const pending: string[] = [];
    const escalated: string[] = [];
    const deferred: string[] = [];
    const rejected: string[] = [];

    for (const row of result.rows) {
      const id = String(row.decision_id);
      if (row.to_state === 'under_review') pending.push(id);
      else if (row.to_state === 'escalated') escalated.push(id);
      else if (row.to_state === 'deferred') deferred.push(id);
      else if (row.to_state === 'rejected') rejected.push(id);
    }

    return { pending, escalated, deferred, rejected };
  } catch {
    // DB unavailable — fall back to memory
    return getProjectReviewQueue(projectId, organizationId);
  }
}

/**
 * Durable-first unresolved check. Survives restart.
 */
export async function hasUnresolvedGovernedDecisionsDurable(
  projectId: number,
  organizationId: number
): Promise<{ hasUnresolved: boolean; unresolvedCount: number; escalatedCount: number; states: Record<string, number> }> {
  const queue = await getProjectReviewQueueDurable(projectId, organizationId);
  const unresolvedCount = queue.pending.length + queue.escalated.length;
  return {
    hasUnresolved: unresolvedCount > 0,
    unresolvedCount,
    escalatedCount: queue.escalated.length,
    states: {
      under_review: queue.pending.length,
      escalated: queue.escalated.length,
      deferred: queue.deferred.length,
      rejected: queue.rejected.length,
    },
  };
}

/**
 * Clear transition log (for testing).
 */
export function clearTransitionLog(): void {
  transitionLog.length = 0;
}

// ═══════════════════════════════════════════════════════════════════════
// Durable Persistence
// ═══════════════════════════════════════════════════════════════════════

async function persistTransitionEventDurably(event: GovernedDecisionTransitionEvent): Promise<boolean> {
  try {
    const { pool } = await import('../db.js');
    await pool.query(
      `INSERT INTO governed_decision_transitions
       (id, decision_id, organization_id, project_id, from_state, to_state,
        action, actor_id, actor_role, reason, notes,
        linked_artifact_id, linked_package_id, linked_workflow_run_id,
        superseded_by_decision_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (id) DO NOTHING`,
      [
        event.id,
        event.decisionId,
        event.organizationId,
        event.projectId,
        event.fromState,
        event.toState,
        event.action,
        event.actorId,
        event.actorRole || null,
        event.reason || null,
        event.notes || null,
        event.linkedArtifactId || null,
        event.linkedPackageId || null,
        event.linkedWorkflowRunId || null,
        event.supersededByDecisionId || null,
        event.createdAt,
      ]
    );
    return true;
  } catch (err) {
    log.warn('Transition event durable write failed (non-blocking)', {
      eventId: event.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

function mapRow(row: Record<string, unknown>): GovernedDecisionTransitionEvent {
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
