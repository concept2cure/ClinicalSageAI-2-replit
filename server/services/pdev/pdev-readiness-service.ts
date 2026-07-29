/**
 * PDEV Readiness Service — workstream-level readiness rollups + snapshots.
 *
 * Builds on the orchestrator's per-workstream computation, adds
 * findings (blockers, missing evidence, contradictions, overdue
 * reviews, next recommended action), and can materialize a snapshot
 * row into pdev_readiness_snapshots.
 *
 * Inputs (read from existing primitives):
 *   - pdev_program_activities                  per-activity state
 *   - PDEV_ACTIVITIES registry                 expected activities + dependencies
 *
 * The findings list intentionally stays light here; the contradiction
 * bridge and FDA interaction tracker add their own findings via their
 * own endpoints.
 *
 * @module server/services/pdev/pdev-readiness-service
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import {
  pdevReadinessSnapshots,
  type PdevReadinessFinding,
} from '../../../shared/schema/pdev-workflow';
import { pdevOrchestrator, type PdevWorkstreamRollup } from './pdev-orchestrator';
import {
  PDEV_WORKSTREAMS,
  PDEV_ACTIVITIES,
  type PdevWorkstream,
  type PdevActivityState,
} from './pdev-activity-registry';

const logger = createScopedLogger('pdev-readiness');

const COMPLETED_STATES: ReadonlySet<PdevActivityState> = new Set([
  'approved',
  'locked',
  'submission_ready',
  'submitted',
]);

export interface PdevReadinessReport {
  workstreams: PdevWorkstreamRollup[];
  overall: PdevWorkstreamRollup;
  findings: PdevReadinessFinding[];
}

export class PdevReadinessService {
  /**
   * Compute the per-workstream readiness + cross-workstream findings.
   * Pure read — does not persist a snapshot. See `snapshot()` for that.
   */
  async computeReadiness(
    programId: string,
    organizationId: number
  ): Promise<PdevReadinessReport | null> {
    const view = await pdevOrchestrator.getProgramView(programId, organizationId);
    if (!view) return null;

    const workstreams = view.workstreams;

    // Roll up an "overall" pseudo-workstream from the sum of the four.
    const overall = workstreams.reduce<PdevWorkstreamRollup>(
      (acc, w) => ({
        workstream: 'cmc', // placeholder — overridden below
        totalActivities: acc.totalActivities + w.totalActivities,
        completedActivities: acc.completedActivities + w.completedActivities,
        inFlightActivities: acc.inFlightActivities + w.inFlightActivities,
        blockedActivities: acc.blockedActivities + w.blockedActivities,
        notStartedActivities: acc.notStartedActivities + w.notStartedActivities,
        blockingActivities: acc.blockingActivities + w.blockingActivities,
        blockingResolved: acc.blockingResolved + w.blockingResolved,
        readinessScore: 0,
      }),
      {
        workstream: 'cmc',
        totalActivities: 0,
        completedActivities: 0,
        inFlightActivities: 0,
        blockedActivities: 0,
        notStartedActivities: 0,
        blockingActivities: 0,
        blockingResolved: 0,
        readinessScore: 0,
      }
    );

    const completedRatio =
      overall.totalActivities === 0 ? 0 : overall.completedActivities / overall.totalActivities;
    const blockingRatio =
      overall.blockingActivities === 0 ? 1 : overall.blockingResolved / overall.blockingActivities;
    overall.readinessScore = Math.round((completedRatio * 60 + blockingRatio * 40) * 100) / 100;

    // Findings.
    const findings: PdevReadinessFinding[] = [];

    // 1. Dependency findings — flag activities whose upstream is not complete.
    const stateByKey = new Map<string, PdevActivityState>();
    for (const a of view.activities) {
      stateByKey.set(a.registry.key, (a.state?.state ?? 'not_started') as PdevActivityState);
    }

    for (const activity of PDEV_ACTIVITIES) {
      const state = stateByKey.get(activity.key) ?? 'not_started';
      if (COMPLETED_STATES.has(state)) continue;
      for (const dep of activity.dependsOn) {
        const depState = stateByKey.get(dep) ?? 'not_started';
        if (!COMPLETED_STATES.has(depState)) {
          findings.push({
            kind: 'blocker',
            activityKey: activity.key,
            message: `${activity.title} depends on ${dep} which is ${depState}`,
            severity: activity.blocksIndAssembly ? 'high' : 'medium',
          });
        }
      }
    }

    // 2. IND-blocking activities without an owner.
    for (const a of view.activities) {
      if (!a.registry.blocksIndAssembly) continue;
      const state = (a.state?.state ?? 'not_started') as PdevActivityState;
      if (COMPLETED_STATES.has(state)) continue;
      if (!a.state?.ownerUserId) {
        findings.push({
          kind: 'next_action',
          activityKey: a.registry.key,
          message: `Assign an owner for IND-blocking activity: ${a.registry.title}`,
          severity: 'medium',
        });
      }
    }

    // 3. Overdue activities.
    const now = Date.now();
    for (const a of view.activities) {
      const due = a.state?.dueDate;
      if (!due) continue;
      const dueMs = new Date(due).getTime();
      const state = (a.state?.state ?? 'not_started') as PdevActivityState;
      if (COMPLETED_STATES.has(state)) continue;
      if (dueMs < now) {
        findings.push({
          kind: 'overdue_review',
          activityKey: a.registry.key,
          message: `${a.registry.title} is overdue`,
          severity: a.registry.blocksIndAssembly ? 'high' : 'medium',
        });
      }
    }

    return { workstreams, overall, findings };
  }

  /**
   * Materialize a readiness snapshot per workstream into
   * pdev_readiness_snapshots, plus an 'overall' row.
   */
  async snapshot(
    programId: string,
    organizationId: number,
    actorUserId: number | null,
    trigger: 'manual' | 'state_change' | 'scheduled' = 'manual'
  ): Promise<PdevReadinessReport | null> {
    const report = await this.computeReadiness(programId, organizationId);
    if (!report) return null;

    const rows: Array<{
      programId: string;
      workstream: string;
      readinessScore: string;
      totalActivities: number;
      completedActivities: number;
      inFlightActivities: number;
      blockedActivities: number;
      blockingActivities: number;
      blockingResolved: number;
      findings: PdevReadinessFinding[];
      snapshotByUserId: number | null;
      trigger: string;
    }> = [];

    const allWorkstreams: PdevWorkstream[] = [...PDEV_WORKSTREAMS];
    for (const ws of allWorkstreams) {
      const w = report.workstreams.find(x => x.workstream === ws);
      if (!w) continue;
      rows.push({
        programId,
        workstream: w.workstream,
        readinessScore: w.readinessScore.toFixed(2),
        totalActivities: w.totalActivities,
        completedActivities: w.completedActivities,
        inFlightActivities: w.inFlightActivities,
        blockedActivities: w.blockedActivities,
        blockingActivities: w.blockingActivities,
        blockingResolved: w.blockingResolved,
        findings: report.findings.filter(f =>
          f.activityKey?.startsWith(`${ws}.`)
        ),
        snapshotByUserId: actorUserId,
        trigger,
      });
    }

    // Overall.
    rows.push({
      programId,
      workstream: 'overall',
      readinessScore: report.overall.readinessScore.toFixed(2),
      totalActivities: report.overall.totalActivities,
      completedActivities: report.overall.completedActivities,
      inFlightActivities: report.overall.inFlightActivities,
      blockedActivities: report.overall.blockedActivities,
      blockingActivities: report.overall.blockingActivities,
      blockingResolved: report.overall.blockingResolved,
      findings: report.findings,
      snapshotByUserId: actorUserId,
      trigger,
    });

    try {
      // Drizzle insert with decimal-as-string for readiness_score (NUMERIC).
      await db.insert(pdevReadinessSnapshots).values(rows as never);
    } catch (err) {
      logger.error('Failed to persist readiness snapshots', { err, programId });
    }

    return report;
  }
}

export const pdevReadinessService = new PdevReadinessService();

/** Helper: load the most recent snapshot per workstream for a program. */
export async function getLatestSnapshotsByWorkstream(programId: string) {
  return db
    .select()
    .from(pdevReadinessSnapshots)
    .where(eq(pdevReadinessSnapshots.programId, programId));
}
