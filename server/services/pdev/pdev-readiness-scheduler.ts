/**
 * PDEV readiness scheduler — materializes readiness snapshots for every
 * active PDEV program in one pass.
 *
 * The per-program snapshot already exists (`pdevReadinessService.snapshot`);
 * this service is the batch driver that the design brief's Overview surface
 * assumes ("last-snapshot timestamp", readiness-over-time). It can be invoked
 * by an admin route or an interval worker.
 *
 * A program is "active for PDEV" when it has at least one
 * `pdev_program_activities` row and its `regulatory_programs.status` is not
 * `archived`. Snapshots are written with `trigger='scheduled'`.
 *
 * Tenant scope: the batch can be scoped to one organization (admin-triggered
 * for the caller's org) or run org-wide (interval worker). Either way each
 * snapshot call re-derives readiness through the tenant-gated service.
 *
 * @module server/services/pdev/pdev-readiness-scheduler
 */

import { and, eq, ne, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import { regulatoryPrograms } from '../../../shared/schema/programs';
import { pdevProgramActivities } from '../../../shared/schema/pdev-workflow';
import { pdevReadinessService } from './pdev-readiness-service';

const logger = createScopedLogger('pdev-readiness-scheduler');

export interface PdevScheduledSnapshotResult {
  /** Programs considered (active + have PDEV activity). */
  programsConsidered: number;
  /**
   * Programs whose snapshot rows were actually WRITTEN. This used to count any
   * program whose readiness computed, because the service swallowed its own
   * insert failure — see the note at the counter.
   */
  snapshotted: number;
  /** Per-program outcome (id + overall score, or skip/error/not-persisted reason). */
  results: Array<{
    programId: string;
    organizationId: number;
    overallReadiness: number | null;
    /**
     * `not_persisted` is its own outcome: readiness computed from live rows, but
     * nothing reached pdev_readiness_snapshots. It is neither a skip (which
     * computed nothing) nor an error (which threw).
     */
    status: 'snapshotted' | 'skipped' | 'error' | 'not_persisted';
    detail?: string;
  }>;
}

export class PdevReadinessScheduler {
  /**
   * Snapshot readiness for every active PDEV program.
   *
   * @param organizationId  When provided, scope the batch to one org
   *                         (admin-triggered). When omitted, run org-wide
   *                         (interval worker).
   * @param actorUserId     Actor recorded on each snapshot ('scheduled'
   *                         trigger); null for the system worker.
   */
  async snapshotActivePrograms(
    organizationId?: number,
    actorUserId: number | null = null
  ): Promise<PdevScheduledSnapshotResult> {
    // 1. Find the distinct programs that actually use PDEV (have activity rows).
    const activityRows = await db
      .selectDistinct({ programId: pdevProgramActivities.programId })
      .from(pdevProgramActivities);
    const candidateIds = activityRows.map(r => r.programId);

    if (candidateIds.length === 0) {
      return { programsConsidered: 0, snapshotted: 0, results: [] };
    }

    // 2. Resolve those to active (non-archived) programs, tenant-scoped if asked.
    const conditions = [
      inArray(regulatoryPrograms.id, candidateIds),
      ne(regulatoryPrograms.status, 'archived'),
    ];
    if (organizationId != null) {
      conditions.push(eq(regulatoryPrograms.organizationId, organizationId));
    }
    const programs = await db
      .select({
        id: regulatoryPrograms.id,
        organizationId: regulatoryPrograms.organizationId,
      })
      .from(regulatoryPrograms)
      .where(and(...conditions));

    const results: PdevScheduledSnapshotResult['results'] = [];
    let snapshotted = 0;

    // 3. Snapshot each. One program failing must not abort the batch.
    for (const program of programs) {
      try {
        const snapshot = await pdevReadinessService.snapshot(
          program.id,
          program.organizationId,
          actorUserId,
          'scheduled'
        );
        if (!snapshot) {
          results.push({
            programId: program.id,
            organizationId: program.organizationId,
            overallReadiness: null,
            status: 'skipped',
            detail: 'readiness compute returned null',
          });
          continue;
        }
        /*
         * Found by the review of the WO-16C #133 conversion: `snapshot()` used
         * to swallow its own INSERT failure and return the computed report, so
         * this loop counted `snapshotted += 1` and reported
         * `status: 'snapshotted'` for programs whose rows never landed. The
         * batch total was therefore an upper bound presented as a count, and a
         * total outage would have reported every program snapshotted.
         *
         * The program is not re-tried here — the service has already logged the
         * store's reason against the program id, and one failing program must
         * not abort the batch, which is why its catch exists at all. What
         * changes is that the batch says so.
         */
        if (!snapshot.persisted) {
          results.push({
            programId: program.id,
            organizationId: program.organizationId,
            overallReadiness: snapshot.report.overall.readinessScore,
            status: 'not_persisted',
            detail: 'readiness computed, but the snapshot rows could not be stored',
          });
          continue;
        }
        snapshotted += 1;
        results.push({
          programId: program.id,
          organizationId: program.organizationId,
          overallReadiness: snapshot.report.overall.readinessScore,
          status: 'snapshotted',
        });
      } catch (err) {
        logger.error('Scheduled snapshot failed for program', {
          programId: program.id,
          err: err instanceof Error ? err.message : String(err),
        });
        results.push({
          programId: program.id,
          organizationId: program.organizationId,
          overallReadiness: null,
          status: 'error',
          detail: err instanceof Error ? err.message : 'unknown error',
        });
      }
    }

    logger.info('PDEV scheduled readiness snapshot batch complete', {
      organizationId: organizationId ?? 'all',
      programsConsidered: programs.length,
      snapshotted,
    });

    return {
      programsConsidered: programs.length,
      snapshotted,
      results,
    };
  }
}

export const pdevReadinessScheduler = new PdevReadinessScheduler();
