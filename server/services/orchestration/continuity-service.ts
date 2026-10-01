/**
 * Project Continuity Service — Phase 3
 *
 * Provides cross-session intelligence so the platform remembers
 * project state across sessions. When a user returns to a project,
 * the system can report:
 * - What changed
 * - What remains blocked
 * - What is newly ready
 * - What still needs attention
 * - What it recommends next
 *
 * Project-centric, useful, and inspectable. Not noisy memory behavior.
 */

import { db } from '../../db';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { regulatoryAuditLogs } from '../../../shared/schema';
import { assembleCrossObjectPayload } from './cross-object-resolver';
import { computeReadinessAssessment } from './readiness-engine';
import { generateRecommendations } from './recommendation-engine';
import type {
  ProjectContinuitySnapshot,
  ContinuityChange,
  CrossObjectReasoningPayload,
  ReadinessBlocker,
  ReadinessAssessment,
  Recommendation,
} from '../../../shared/types/orchestration';

// ---------------------------------------------------------------------------
// Snapshot Store — project_continuity_snapshots (shared, durable)
//
// WHAT THIS USED TO BE. Two module-level Maps held "the previous snapshot".
// Production runs two API tasks behind an ALB with no stickiness (plus a worker
// on the same image), so each task kept its own baseline per project: the
// trajectory verdict, the start of the "what changed" window and the "newly
// ready" set depended on which task had served the previous page view, and
// every deploy reset them to "stable". Audit docs/evidence/W2/2026-09-24-
// multi-task/ fix unit U14.
//
// WHAT IT IS NOW. Snapshots live in project_continuity_snapshots
// (migrations/20261001_project_continuity_snapshots.sql), read and written by
// every task through the tenant-scoped pool. The verdict compares against a
// STABLE baseline — the latest snapshot at least 24 h old — not against
// whoever loaded the page last, which drifted with every view even on one
// process. Decided 2026-10-01 (U14 founder_decision: "a per-project daily
// baseline"). With no such snapshot the briefing says so: trajectory
// 'no_baseline', no newly-ready claims. A store failure throws — the route
// answers 500 and the surface says the briefing is unavailable, rather than
// rendering a verdict computed against nothing.
// ---------------------------------------------------------------------------

/** A trend is measured against the latest snapshot at least this old. */
export const CONTINUITY_BASELINE_MIN_AGE_HOURS = 24;
/** At most one snapshot is recorded per project per this many minutes. */
export const CONTINUITY_RECORD_INTERVAL_MINUTES = 60;
/** A readiness move larger than this many points is a trend. */
const TREND_THRESHOLD_POINTS = 5;
/** The "what changed" window when there is no baseline to start it from. */
const DEFAULT_CHANGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type ContinuityTrajectory = ProjectContinuitySnapshot['trajectory'] | 'no_baseline';

/** The snapshot a trend is measured against. */
export interface ContinuityBaseline {
  snapshotId: string;
  snapshotAt: string;
  readinessScore: number;
  activeBlockers: ReadinessBlocker[];
}

/**
 * The briefing as served. ProjectContinuitySnapshot plus what the verdict was
 * measured against, so a reader can reproduce it.
 */
export interface ContinuityBriefing extends Omit<ProjectContinuitySnapshot, 'trajectory'> {
  /** 'no_baseline' until a snapshot at least 24 h old exists for the project. */
  trajectory: ContinuityTrajectory;
  /** The baseline the verdict and "newly ready" were measured against, or null. */
  baseline: { snapshotAt: string; readinessScore: number } | null;
  /** Start of the "what changed" window: the baseline's time, else 7 days ago. */
  changesSince: string;
}

interface SnapshotRow {
  id: string | number;
  readiness_score: number | string;
  snapshot: unknown;
  created_at: Date | string;
}

const iso = (v: Date | string): string => (v instanceof Date ? v : new Date(v)).toISOString();

function rowsOf(result: unknown): SnapshotRow[] {
  return ((result as { rows?: SnapshotRow[] }).rows ?? []) as SnapshotRow[];
}

/** The latest snapshot at least CONTINUITY_BASELINE_MIN_AGE_HOURS old, or null. */
async function readBaseline(orgId: number, projectId: number): Promise<ContinuityBaseline | null> {
  const result = await db.execute(sql`
    SELECT id, readiness_score, snapshot, created_at
      FROM project_continuity_snapshots
     WHERE organization_id = ${orgId}
       AND project_id = ${projectId}
       AND created_at <= NOW() - make_interval(hours => ${CONTINUITY_BASELINE_MIN_AGE_HOURS})
     ORDER BY created_at DESC, id DESC
     LIMIT 1`);
  const row = rowsOf(result)[0];
  if (!row) return null;
  const snap = (row.snapshot ?? {}) as Partial<ProjectContinuitySnapshot>;
  return {
    snapshotId: String(row.id),
    snapshotAt: iso(row.created_at),
    readinessScore: Number(row.readiness_score),
    activeBlockers: Array.isArray(snap.activeBlockers) ? snap.activeBlockers : [],
  };
}

/**
 * Record a snapshot unless one was recorded for the project within the last
 * CONTINUITY_RECORD_INTERVAL_MINUTES (one statement, so two tasks racing write
 * at most one row each, never a burst per page view). When a row is written,
 * rows older than the current baseline are deleted: the baseline only moves
 * forward in time, so they can never be a baseline again.
 */
async function recordSnapshot(orgId: number, projectId: number, briefing: ContinuityBriefing): Promise<void> {
  const inserted = await db.execute(sql`
    INSERT INTO project_continuity_snapshots (organization_id, project_id, readiness_score, snapshot)
    SELECT ${orgId}, ${projectId}, ${briefing.metrics.readinessScore}, ${JSON.stringify(briefing)}::jsonb
     WHERE NOT EXISTS (
       SELECT 1 FROM project_continuity_snapshots
        WHERE organization_id = ${orgId}
          AND project_id = ${projectId}
          AND created_at > NOW() - make_interval(mins => ${CONTINUITY_RECORD_INTERVAL_MINUTES}))
    RETURNING id`);
  if (rowsOf(inserted).length === 0) return;
  await db.execute(sql`
    DELETE FROM project_continuity_snapshots
     WHERE organization_id = ${orgId}
       AND project_id = ${projectId}
       AND created_at < (
         SELECT max(created_at) FROM project_continuity_snapshots
          WHERE organization_id = ${orgId}
            AND project_id = ${projectId}
            AND created_at <= NOW() - make_interval(hours => ${CONTINUITY_BASELINE_MIN_AGE_HOURS}))`);
}

/**
 * The latest recorded continuity snapshot for a project, from any task.
 */
export async function getLatestSnapshot(
  orgId: number,
  projectId: number
): Promise<ContinuityBriefing | undefined> {
  const result = await db.execute(sql`
    SELECT id, readiness_score, snapshot, created_at
      FROM project_continuity_snapshots
     WHERE organization_id = ${orgId} AND project_id = ${projectId}
     ORDER BY created_at DESC, id DESC
     LIMIT 1`);
  const row = rowsOf(result)[0];
  return row ? (row.snapshot as ContinuityBriefing) : undefined;
}

// ---------------------------------------------------------------------------
// Snapshot Generation
// ---------------------------------------------------------------------------

/**
 * Generate a fresh continuity briefing for a project, measured against the
 * shared baseline, and record it.
 */
export async function generateContinuitySnapshot(
  orgId: number,
  projectId: number
): Promise<ContinuityBriefing> {
  const baseline = await readBaseline(orgId, projectId);

  // Assemble current state
  const payload = await assembleCrossObjectPayload({
    organizationId: orgId,
    projectId,
  });

  // Compute readiness
  const readiness = computeReadinessAssessment(payload);

  // Generate recommendations
  const recSet = generateRecommendations(payload, { projectId, limit: 10 });

  // Detect changes since the baseline (or over the default window)
  const changesSince = baseline
    ? new Date(baseline.snapshotAt)
    : new Date(Date.now() - DEFAULT_CHANGE_WINDOW_MS);
  const changes = await detectChanges(orgId, projectId, changesSince);

  // Determine trajectory
  const trajectory = determineTrajectory(readiness.overallScore, baseline);

  // Identify newly ready items
  const newlyReady = identifyNewlyReady(payload, baseline);

  // Identify items needing attention
  const needsAttention = identifyNeedsAttention(readiness);

  // Build summary
  const summary = buildSummary(payload, readiness, changes, trajectory);

  const briefing: ContinuityBriefing = {
    projectId,
    organizationId: orgId,
    snapshotAt: new Date().toISOString(),
    summary,
    changes,
    activeBlockers: readiness.blockers,
    newlyReady,
    needsAttention,
    nextActions: recSet.recommendations.slice(0, 5),
    trajectory,
    previousSnapshotId: baseline?.snapshotId,
    baseline: baseline ? { snapshotAt: baseline.snapshotAt, readinessScore: baseline.readinessScore } : null,
    changesSince: changesSince.toISOString(),
    metrics: {
      readinessScore: readiness.overallScore,
      documentCount: payload.documents.length,
      validatedCount: payload.validations.length,
      blockerCount: readiness.blockers.length,
      taskCompletionPercent: payload.project.totalTasks > 0
        ? Math.round(((payload.project.totalTasks - payload.project.blockedTasks) / payload.project.totalTasks) * 100)
        : 100,
    },
  };

  await recordSnapshot(orgId, projectId, briefing);

  return briefing;
}

// ---------------------------------------------------------------------------
// Change Detection
// ---------------------------------------------------------------------------

async function detectChanges(
  orgId: number,
  projectId: number,
  since: Date
): Promise<ContinuityChange[]> {
  const changes: ContinuityChange[] = [];

  // Look at audit logs since the baseline (or over the default window).
  // A failed read is not "nothing changed": that briefing would be served and
  // recorded, and later measured against as a baseline. It throws; the route
  // answers 500 and AnA Command says the briefing could not be loaded.
  let logs: Array<typeof regulatoryAuditLogs.$inferSelect>;
  try {
    logs = await db
      .select()
      .from(regulatoryAuditLogs)
      .where(
        and(
          eq(regulatoryAuditLogs.organizationId, orgId),
          gte(regulatoryAuditLogs.createdAt, since)
        )
      )
      .orderBy(desc(regulatoryAuditLogs.createdAt))
      .limit(100);
  } catch (err) {
    throw new Error(
      `Continuity: could not read the audit trail for what changed since ${since.toISOString()}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  for (const log of logs) {
    const nv = log.newValue as any;
    if (nv?.projectId && nv.projectId !== projectId) continue;

    const action = log.action || '';
    const entityType = log.entityType || '';

    if (action === 'run_validation' && nv?.success) {
      changes.push({
        type: 'validation_completed',
        description: `Validation completed on ${nv.targetType}:${nv.targetId}`,
        targetType: nv.targetType || entityType,
        targetId: nv.targetId || log.entityId || '',
        timestamp: log.createdAt?.toISOString() || '',
      });
    } else if (action === 'promote_artifact') {
      changes.push({
        type: 'artifact_promoted',
        description: `Artifact promoted: ${nv.targetId}`,
        targetType: 'artifact',
        targetId: nv.targetId || log.entityId || '',
        timestamp: log.createdAt?.toISOString() || '',
      });
    } else if (action === 'save_document_version') {
      changes.push({
        type: 'document_updated',
        description: `Document version saved: ${nv.targetId}`,
        targetType: 'document',
        targetId: nv.targetId || log.entityId || '',
        timestamp: log.createdAt?.toISOString() || '',
      });
    } else if (action === 'route_document_to_module') {
      changes.push({
        type: 'document_updated',
        description: `Document routed to module: ${nv.targetId}`,
        targetType: 'document',
        targetId: nv.targetId || log.entityId || '',
        timestamp: log.createdAt?.toISOString() || '',
      });
    }
  }

  return changes.slice(0, 20); // Cap at 20 changes
}

// ---------------------------------------------------------------------------
// Analysis Helpers
// ---------------------------------------------------------------------------

function determineTrajectory(
  currentScore: number,
  baseline: ContinuityBaseline | null
): ContinuityTrajectory {
  // No baseline is reported as such. It used to read 'stable' — a verdict
  // nothing had measured.
  if (!baseline) return 'no_baseline';
  const diff = currentScore - baseline.readinessScore;
  if (diff > TREND_THRESHOLD_POINTS) return 'improving';
  if (diff < -TREND_THRESHOLD_POINTS) return 'declining';
  return 'stable';
}

function identifyNewlyReady(
  payload: CrossObjectReasoningPayload,
  baseline: ContinuityBaseline | null
): Array<{ type: string; id: number; title: string }> {
  if (!baseline) return [];

  const prevBlockerIds = new Set(
    baseline.activeBlockers.map((b) => `${b.targetType}:${b.targetId}`)
  );

  // Documents that were in blockers before but now seem OK
  const newlyReady: Array<{ type: string; id: number; title: string }> = [];

  for (const doc of payload.documents) {
    if (
      prevBlockerIds.has(`document:${doc.id}`) &&
      (doc.status === 'approved' || doc.status === 'published')
    ) {
      newlyReady.push({ type: 'document', id: doc.id, title: doc.title });
    }
  }

  return newlyReady;
}

function identifyNeedsAttention(
  readiness: ReadinessAssessment
): Array<{ type: string; id: number; title: string; reason: string }> {
  const items: Array<{ type: string; id: number; title: string; reason: string }> = [];

  for (const blocker of readiness.blockers) {
    items.push({
      type: blocker.targetType,
      id: typeof blocker.targetId === 'number' ? blocker.targetId : 0,
      title: blocker.targetTitle || blocker.message,
      reason: blocker.suggestedResolution || blocker.message,
    });
  }

  return items.slice(0, 10);
}

function buildSummary(
  payload: CrossObjectReasoningPayload,
  readiness: ReadinessAssessment,
  changes: ContinuityChange[],
  trajectory: ContinuityTrajectory
): string {
  const parts: string[] = [];

  parts.push(`Project "${payload.project.name}" readiness: ${readiness.overallScore}% (${readiness.status}).`);

  if (changes.length > 0) {
    parts.push(
      trajectory === 'no_baseline'
        ? `${changes.length} change(s) in the last 7 days.`
        : `${changes.length} change(s) since the baseline.`
    );
  }

  if (readiness.blockers.length > 0) {
    const critical = readiness.blockers.filter((b: any) => b.severity === 'critical').length;
    parts.push(`${readiness.blockers.length} blocker(s)${critical > 0 ? ` (${critical} critical)` : ''}.`);
  }

  if (trajectory === 'improving') {
    parts.push('Readiness is improving.');
  } else if (trajectory === 'declining') {
    parts.push('Readiness has declined — review recent changes.');
  } else if (trajectory === 'no_baseline') {
    parts.push('No baseline yet: a trend is reported once a snapshot at least 24 hours old exists.');
  }

  return parts.join(' ');
}
