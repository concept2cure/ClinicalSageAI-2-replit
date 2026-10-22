/**
 * The held run, on the governed-action route's side (AnA detach DT3 review,
 * finding 4.3): the claim taken before anything is signed off or executed,
 * the decision handed back to the turn waiting on it, and what is said and
 * recorded when the run ended first. utility.ts (the route) calls these.
 *
 * @module server/routes/ana-ri/held-run-release
 */
import type { Request } from 'express';
import {
  claimApproval,
  recordApprovalDecision,
  releaseApprovalClaim,
  type RunControlQuery,
} from '../../services/ana/run-control.js';
import { resolveOrgId } from '../../types/auth-request.js';
import { requestPgClient } from '../../db/requestDb';
import auditService from '../../services/auditService.js';
import { createScopedLogger } from '../../utils/logger.js';
import { clientIpOf } from '../../utils/client-ip';

// The route's scope: these lines logged under it before they moved here.
const log = createScopedLogger('ana-ri/utility');

/**
 * Hand a decided approval back to the turn that is waiting on it.
 *
 * Best-effort by design: the command has already run and been audited by the
 * time this is called, so a failure here costs AnA her continuation, not the
 * person's action or its record. Refusing the whole request at this point would
 * report a governed action as failed after it had already taken effect, which
 * is the worse of the two lies.
 */
export async function releaseWaitingRun(
  req: Request,
  held: { runId: string; toolUseId: string; userId: number },
  reasonForChange: string,
  outcome: { result?: unknown; error?: string; declined?: true },
): Promise<boolean> {
  const { runId, toolUseId, userId } = held;
  // Bound with the SAME resolver the lookup used (resolveAuthorisedAction), so
  // the decision is written against exactly the tenant whose run was proven to
  // be waiting. Only reached when that lookup found the run, which already
  // required a non-null org — the guard is for the type, not a live branch.
  const organizationId = resolveOrgId(req);
  if (organizationId === null) {
    log.error('Refusing to record an approval decision with no organization', { runId, toolUseId });
    return false;
  }
  try {
    // Whether a waiting run took the decision (DT3 review, finding 4.3): a run
    // that ended meanwhile matches nothing, and the caller says so.
    return await recordApprovalDecision(requestPgClient(req), runId, organizationId, {
      toolUseId,
      decided: outcome.error || outcome.declined ? 'denied' : 'approved',
      decidedAt: new Date().toISOString(),
      byUserId: userId,
      reasonForChange,
      ...outcome,
    });
  } catch (err: any) {
    log.error('Approved action ran but the waiting run could not be released', {
      runId,
      toolUseId,
      error: err?.message,
    });
    return false;
  }
}

/** The refusal when a held run ended before its person's approval arrived (DT3 review, finding 4.3). Fixed copy. */
export const RUN_ENDED_BEFORE_APPROVAL =
  'The run ended before your approval arrived, so the action did not run. Nothing was changed.';
/** …and when the same step is already being carried out (a second submit). Fixed copy. */
export const APPROVAL_ALREADY_IN_PROGRESS = 'This approval is already being carried out. It will not run twice.';

/**
 * A governed action that ran under a person's approval, on a run that ended
 * while it ran (DT3 review, finding 4.3): logged at error level and written to
 * the ledger beside the execution row, so whether it ran is never contradicted
 * between the turn's record and the trail. The row's outcome is checked.
 */
export async function recordRunEndedDuringAction(
  req: Request,
  ran: { organizationId: number; userId: number; command: string; runId: string; toolUseId: string },
): Promise<void> {
  log.error('A governed action ran after its run ended; the turn could not take its result', {
    runId: ran.runId,
    toolUseId: ran.toolUseId,
    command: ran.command,
  });
  const row = await auditService.logAction({
    tenantId: ran.organizationId,
    userId: ran.userId,
    action: 'ana.governed_action.run_ended',
    resourceType: 'ana_command',
    resourceId: ran.command,
    ipAddress: clientIpOf(req) ?? undefined,
    userAgent: req.headers['user-agent'] as string | undefined,
    details: { command: ran.command, runId: ran.runId, toolUseId: ran.toolUseId, executed: true, runEnded: true },
  });
  if (!row.persisted) log.error('The run-ended row for a governed action was not persisted', { runId: ran.runId, error: row.error });
}

/**
 * Hand an executed action's result to the turn waiting on it, and what to
 * answer the person with. When the run ended while the action ran (DT3
 * review, finding 4.3) the action stands and its rows say it ran; the turn
 * could not take its result, so the answer is marked, the line is logged and
 * the ledger links it (recordRunEndedDuringAction).
 */
export async function handBackResult(
  req: Request,
  held: { runId: string; toolUseId: string; userId: number; organizationId: number; command: string },
  reasonForChange: string,
  result: unknown,
): Promise<unknown> {
  if (await releaseWaitingRun(req, held, reasonForChange, { result })) return result;
  await recordRunEndedDuringAction(req, held);
  return withRunEnded(result);
}

/** The action's result, marked: its run ended while it ran. */
function withRunEnded(result: unknown): unknown {
  if (result && typeof result === 'object' && !Array.isArray(result)) return { ...result, runEnded: true };
  return { result, runEnded: true };
}

/** One held step, as the route claims and gives it back. */
interface HeldStep {
  runId: string;
  organizationId: number;
  toolUseId: string;
}

/**
 * Claim the held approval, atomically, on a run still waiting on it, before
 * anything is signed off or executed: the refusal to send when it cannot be
 * claimed — the run ended while the person signed (an administrator's stop,
 * the session's end, the 40-minute cap, a shutdown), or the same step is
 * already being carried out — or null when it was claimed.
 */
export async function claimRefusal(
  client: RunControlQuery,
  held: HeldStep & { userId: number },
): Promise<{ message: string; code: 'RUN_ENDED' | 'APPROVAL_IN_PROGRESS' } | null> {
  const claim = await claimApproval(client, held.runId, held.organizationId, held.userId, held.toolUseId);
  if (claim === 'not_waiting') return { message: RUN_ENDED_BEFORE_APPROVAL, code: 'RUN_ENDED' };
  if (claim === 'already_claimed') return { message: APPROVAL_ALREADY_IN_PROGRESS, code: 'APPROVAL_IN_PROGRESS' };
  return null;
}

/** Give a claim back when nothing ran under it (the sign-off row was refused), so the person can try again. */
export async function giveBackClaim(client: RunControlQuery, held: HeldStep): Promise<void> {
  await releaseApprovalClaim(client, held.runId, held.organizationId, held.toolUseId).catch((err: any) =>
    log.error('The approval claim could not be given back after a refused sign-off row', {
      runId: held.runId,
      toolUseId: held.toolUseId,
      error: err?.message,
    }),
  );
}
