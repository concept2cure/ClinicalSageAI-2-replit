/**
 * PDEV IND-clearance terminal transition.
 *
 * The CIRM PDEV → IND model has a single expected outcome: IND clearance.
 * The registry encodes this as the `regulatory.ind_clearance` activity in
 * the `post_ind` stage. This module closes the loop: when that activity
 * reaches a completed state, the parent `regulatory_programs` row is moved
 * to its terminal cleared state so the program-level status reflects the
 * outcome — not just the activity row.
 *
 * Effect when the clearance activity completes:
 *   - regulatory_programs.status      → 'approved'  (IND cleared = safe to proceed)
 *   - regulatory_programs.approvalDate → now
 *   - regulatory_programs.metadata     ← merge { indClearedAt, indClearedBy }
 *   - audit event 'pdev_ind_cleared' via the existing dual-write auditor,
 *     whose OUTCOME is returned (see `IndClearanceResult.audit`)
 *
 * Idempotent: re-running on an already-cleared program is a no-op (the
 * audit still records the attempt, but the columns don't churn).
 *
 * Callers: the activity state route, the AnA set_state command, and the
 * workflow-bridge chain-completion path all invoke this after writing the
 * activity state, so the terminal transition fires regardless of which
 * surface drove the final state change.
 *
 * @module server/services/pdev/pdev-clearance
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import { regulatoryPrograms } from '../../../shared/schema/programs';
import type { PdevActivityState } from './pdev-activity-registry';
import { recordAuditRow, type AuditRowOutcome } from '../audit/audit-write-outcome';

const logger = createScopedLogger('pdev-clearance');

/** The single activity whose completion clears the IND. */
export const IND_CLEARANCE_ACTIVITY_KEY = 'regulatory.ind_clearance';

/** States that count as "the clearance activity is done". */
const CLEARANCE_COMPLETING_STATES: ReadonlySet<PdevActivityState> = new Set([
  'approved',
  'locked',
  'submission_ready',
  'submitted',
]);

export interface IndClearanceResult {
  /** True when this call moved the program to its cleared terminal state. */
  cleared: boolean;
  /** True when the program was already cleared before this call. */
  alreadyCleared: boolean;
  programStatus?: string;
  /**
   * What happened to the 21 CFR Part 11 §11.10(e) audit row for this call —
   * `undefined` on the paths that attempt no row at all, so a caller cannot
   * read a persisted record off a call that never wrote one.
   *
   * WO-16C finding 133, follow-up review 2026-09-18. Both writes below were
   * `void auditService.logAction({…})`. `logAction` never rejects on a
   * persistence failure — by deliberate policy, an audit-trail outage must not
   * break the action it records — it RESOLVES an AuditWriteResult and says so
   * in `persisted`. Discarding that meant an IND clearance could be recorded
   * nowhere while `regulatory_programs` was already moved to 'approved' with an
   * `indClearedAt` stamp on it, and every caller got `cleared: true` either
   * way. This is the terminal transition of the whole PDEV → IND path; it is
   * the last place that should be silent about its own record.
   *
   * The outcome shape is the one pdev-workflow-bridge already carries, from the
   * shared ../audit/audit-write-outcome — not a second copy of it.
   */
  audit?: AuditRowOutcome;
}

/**
 * If `activityKey` is the IND-clearance activity and `newState` is a
 * completing state, move the parent program to its cleared terminal
 * state. Otherwise a no-op (`cleared: false`).
 *
 * Tenant gate is delegated to the caller — this only writes the program
 * row identified by (programId, organizationId).
 */
export async function applyIndClearanceIfTerminal(input: {
  programId: string;
  organizationId: number;
  userId: number | null;
  activityKey: string;
  newState: PdevActivityState;
}): Promise<IndClearanceResult> {
  if (input.activityKey !== IND_CLEARANCE_ACTIVITY_KEY) {
    return { cleared: false, alreadyCleared: false };
  }
  if (!CLEARANCE_COMPLETING_STATES.has(input.newState)) {
    return { cleared: false, alreadyCleared: false };
  }

  // Load the program, tenant-gated.
  const rows = await db
    .select({
      id: regulatoryPrograms.id,
      status: regulatoryPrograms.status,
      metadata: regulatoryPrograms.metadata,
    })
    .from(regulatoryPrograms)
    .where(
      and(
        eq(regulatoryPrograms.id, input.programId),
        eq(regulatoryPrograms.organizationId, input.organizationId)
      )
    )
    .limit(1);
  const program = rows[0];
  if (!program) {
    logger.warn('IND clearance: program not found in tenant', {
      programId: input.programId,
      organizationId: input.organizationId,
    });
    return { cleared: false, alreadyCleared: false };
  }

  const existingMeta = (program.metadata as Record<string, unknown> | null) ?? {};
  const alreadyCleared = program.status === 'approved' && Boolean(existingMeta.indClearedAt);

  if (alreadyCleared) {
    // Idempotent — record the attempt in audit but don't churn columns.
    const audit = await recordAuditRow({
      tenantId: input.organizationId,
      userId: input.userId ?? undefined,
      action: 'pdev_ind_cleared_noop',
      resourceType: 'regulatory_program',
      resourceId: input.programId,
      details: {
        reason: 'already_cleared',
        activityKey: input.activityKey,
        newState: input.newState,
      },
    });
    return {
      cleared: false,
      alreadyCleared: true,
      programStatus: program.status ?? undefined,
      audit,
    };
  }

  const now = new Date();
  await db
    .update(regulatoryPrograms)
    .set({
      status: 'approved',
      approvalDate: now,
      metadata: {
        ...existingMeta,
        indClearedAt: now.toISOString(),
        indClearedBy: input.userId,
      },
      updatedBy: input.userId != null ? String(input.userId) : undefined,
      updatedAt: now,
    })
    .where(eq(regulatoryPrograms.id, input.programId));

  const audit = await recordAuditRow({
    tenantId: input.organizationId,
    userId: input.userId ?? undefined,
    action: 'pdev_ind_cleared',
    resourceType: 'regulatory_program',
    resourceId: input.programId,
    details: {
      activityKey: input.activityKey,
      newState: input.newState,
      previousStatus: program.status,
      newStatus: 'approved',
      indClearedAt: now.toISOString(),
    },
  });

  logger.info('IND cleared — program moved to terminal state', {
    programId: input.programId,
    previousStatus: program.status,
    auditRowPersisted: audit.persisted,
  });

  // The program row is already committed, and reverting a cleared IND because
  // its audit row failed would be the worse lie. The clearance stands and the
  // caller is told what happened to the record — recordAuditRow has already
  // logged the store's own reason against this action and resource id.
  return { cleared: true, alreadyCleared: false, programStatus: 'approved', audit };
}
