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

import { generateUUID } from '../../utils/id-generator';
import { db } from '../../db';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { regulatoryAuditLogs } from '../../../shared/schema';
import { assembleCrossObjectPayload } from './cross-object-resolver';
import { computeReadinessAssessment } from './readiness-engine';
import { generateRecommendations } from './recommendation-engine';
import type {
  ProjectContinuitySnapshot,
  ContinuityChange,
  ReadinessBlocker,
  Recommendation,
} from '../../../shared/types/orchestration';

// ---------------------------------------------------------------------------
// Snapshot Store (in-memory — production: DB table)
// ---------------------------------------------------------------------------

const snapshots = new Map<string, ProjectContinuitySnapshot>();
const projectLatest = new Map<string, string>(); // "orgId:projectId" → snapshotId

function snapshotKey(orgId: number, projectId: number): string {
  return `${orgId}:${projectId}`;
}

/**
 * Get the latest continuity snapshot for a project.
 */
export function getLatestSnapshot(
  orgId: number,
  projectId: number
): ProjectContinuitySnapshot | undefined {
  const key = snapshotKey(orgId, projectId);
  const id = projectLatest.get(key);
  return id ? snapshots.get(id) : undefined;
}

// ---------------------------------------------------------------------------
// Snapshot Generation
// ---------------------------------------------------------------------------

/**
 * Generate a fresh continuity snapshot for a project.
 * Compares against the previous snapshot to detect changes.
 */
export async function generateContinuitySnapshot(
  orgId: number,
  projectId: number
): Promise<ProjectContinuitySnapshot> {
  const snapshotId = generateUUID();
  const key = snapshotKey(orgId, projectId);
  const previousSnapshotId = projectLatest.get(key);
  const previousSnapshot = previousSnapshotId ? snapshots.get(previousSnapshotId) : undefined;

  // Assemble current state
  const payload = await assembleCrossObjectPayload({
    organizationId: orgId,
    projectId,
  });

  // Compute readiness
  const readiness = computeReadinessAssessment(payload);

  // Generate recommendations
  const recSet = generateRecommendations(payload, { projectId, limit: 10 });

  // Detect changes since last snapshot
  const changes = await detectChanges(orgId, projectId, previousSnapshot);

  // Determine trajectory
  const trajectory = determineTrajectory(readiness.overallScore, previousSnapshot);

  // Identify newly ready items
  const newlyReady = identifyNewlyReady(payload, previousSnapshot);

  // Identify items needing attention
  const needsAttention = identifyNeedsAttention(readiness);

  // Build summary
  const summary = buildSummary(payload, readiness, changes, trajectory);

  const snapshot: ProjectContinuitySnapshot = {
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
    previousSnapshotId,
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

  // Store
  snapshots.set(snapshotId, snapshot);
  projectLatest.set(key, snapshotId);

  // Trim old snapshots (keep last 20 per project)
  trimSnapshots(key, 20);

  return snapshot;
}

// ---------------------------------------------------------------------------
// Change Detection
// ---------------------------------------------------------------------------

async function detectChanges(
  orgId: number,
  projectId: number,
  previousSnapshot?: ProjectContinuitySnapshot
): Promise<ContinuityChange[]> {
  const changes: ContinuityChange[] = [];

  // Look at recent audit logs since last snapshot
  const since = previousSnapshot
    ? new Date(previousSnapshot.snapshotAt)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default: 7 days

  try {
    const logs = await db
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
  } catch {
    // Fail silently — continuity is best-effort
  }

  return changes.slice(0, 20); // Cap at 20 changes
}

// ---------------------------------------------------------------------------
// Analysis Helpers
// ---------------------------------------------------------------------------

function determineTrajectory(
  currentScore: number,
  previousSnapshot?: ProjectContinuitySnapshot
): 'improving' | 'declining' | 'stable' {
  if (!previousSnapshot) return 'stable';
  const diff = currentScore - previousSnapshot.metrics.readinessScore;
  if (diff > 5) return 'improving';
  if (diff < -5) return 'declining';
  return 'stable';
}

function identifyNewlyReady(
  payload: any,
  previousSnapshot?: ProjectContinuitySnapshot
): Array<{ type: string; id: number; title: string }> {
  if (!previousSnapshot) return [];

  const prevBlockerIds = new Set(
    previousSnapshot.activeBlockers.map((b) => `${b.targetType}:${b.targetId}`)
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
  readiness: any
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
  payload: any,
  readiness: any,
  changes: ContinuityChange[],
  trajectory: string
): string {
  const parts: string[] = [];

  parts.push(`Project "${payload.project.name}" readiness: ${readiness.overallScore}% (${readiness.status}).`);

  if (changes.length > 0) {
    parts.push(`${changes.length} change(s) since last check.`);
  }

  if (readiness.blockers.length > 0) {
    const critical = readiness.blockers.filter((b: any) => b.severity === 'critical').length;
    parts.push(`${readiness.blockers.length} blocker(s)${critical > 0 ? ` (${critical} critical)` : ''}.`);
  }

  if (trajectory === 'improving') {
    parts.push('Readiness is improving.');
  } else if (trajectory === 'declining') {
    parts.push('Readiness has declined — review recent changes.');
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

function trimSnapshots(key: string, keep: number): void {
  // Collect all snapshots for this project
  const projectSnapshots: Array<{ id: string; time: string }> = [];
  for (const [id, snap] of snapshots) {
    const k = snapshotKey(snap.organizationId, snap.projectId);
    if (k === key) {
      projectSnapshots.push({ id, time: snap.snapshotAt });
    }
  }

  if (projectSnapshots.length <= keep) return;

  // Sort oldest first and delete excess
  projectSnapshots.sort((a, b) => a.time.localeCompare(b.time));
  const toDelete = projectSnapshots.slice(0, projectSnapshots.length - keep);
  for (const { id } of toDelete) {
    snapshots.delete(id);
  }
}
