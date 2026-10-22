/**
 * The claim on a held approval (AnA detach DT3 review, finding 4.3): the
 * governed-action route takes it before it writes the sign-off and executes,
 * and the waiting turn reads it when its run is stopped mid-wait. Kept beside
 * run-control.ts, which re-exports it with the rest of the approval it holds
 * (requestApproval, readPendingApproval), so every caller still reads one
 * module.
 *
 * @module server/services/ana/run-approval-claim
 */
import type { RunControlQuery } from './run-control.js';

/**
 * Claim a held approval for execution, atomically, on a run still waiting on
 * it (AnA detach DT3 review, finding 4.3). The governed-action route claims
 * before it writes the sign-off and executes: a run that ended while the
 * person was signing — an administrator's stop, the session's end, a
 * shutdown, the 40-minute cap, the reaper — answers `not_waiting`, and nothing
 * runs, so the turn's "this action did not run" stays true. A second request
 * for the same step (a double submit) answers `already_claimed`. The asker's,
 * in the run's own organisation, for the step held — the same predicate as
 * readPendingApproval.
 */
export type ApprovalClaim = 'claimed' | 'already_claimed' | 'not_waiting';

export async function claimApproval(
  pool: RunControlQuery,
  runId: string,
  organizationId: number,
  userId: number,
  toolUseId: string,
): Promise<ApprovalClaim> {
  const { rowCount } = await pool.query(
    `UPDATE ana_runs
        SET pending_approval = pending_approval || jsonb_build_object('claimedAt', now()::text),
            updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND user_id = $3
        AND status = 'awaiting_approval'
        AND pending_approval ->> 'toolUseId' = $4
        AND pending_approval ->> 'claimedAt' IS NULL`,
    [runId, organizationId, userId, toolUseId],
  );
  if ((rowCount ?? 0) > 0) return 'claimed';
  const { rows } = await pool.query(
    `SELECT 1 FROM ana_runs
      WHERE id = $1 AND organization_id = $2 AND user_id = $3 AND status = 'awaiting_approval'
        AND pending_approval ->> 'toolUseId' = $4 AND pending_approval ->> 'claimedAt' IS NOT NULL`,
    [runId, organizationId, userId, toolUseId],
  );
  return rows.length > 0 ? 'already_claimed' : 'not_waiting';
}

/** Give a claim back when nothing was executed under it (the sign-off row was refused): the person may try again. */
export async function releaseApprovalClaim(
  pool: RunControlQuery,
  runId: string,
  organizationId: number,
  toolUseId: string,
): Promise<void> {
  await pool.query(
    `UPDATE ana_runs SET pending_approval = pending_approval - 'claimedAt', updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND status = 'awaiting_approval'
        AND pending_approval ->> 'toolUseId' = $3`,
    [runId, organizationId, toolUseId],
  );
}

/**
 * Whether the held approval for this step was claimed for execution: read by
 * the waiting turn when its run is stopped mid-wait, so a step a person
 * approved as the run stopped is never recorded as "nobody decided" (its own
 * audit record says whether it completed). The row keeps `pending_approval`
 * through every stop.
 */
export async function approvalClaimed(pool: RunControlQuery, runId: string, toolUseId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM ana_runs
      WHERE id = $1 AND pending_approval ->> 'toolUseId' = $2 AND pending_approval ->> 'claimedAt' IS NOT NULL`,
    [runId, toolUseId],
  );
  return rows.length > 0;
}
