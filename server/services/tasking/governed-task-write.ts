/**
 * Governed task writes — the request-side answers every task router gives.
 *
 * Two routers write `unified_tasks`: /api/tasks (taskManagement.routes.ts) and
 * /api/regulatory/tasks + /api/unified-tasks (unifiedTasks.routes.ts). Both
 * gate each write with requireEditorAccess and run it with its ledger row on
 * ONE transaction (auditTaskActionInTx), so a refusal has to read the same
 * whichever URL the caller used. These were private to taskManagement.routes.ts
 * (commit a7955fc10); they live here so the second router does not carry a
 * copy that drifts.
 *
 * @module server/services/tasking/governed-task-write
 */
import type { Request, Response } from 'express';
import { governedActorId } from '../../middleware/orgMembership';

/** The canonical pair for a gated write — the organization requireEditorAccess
 *  resolved (req.resolvedOrganizationId) and the session's actor
 *  (governedActorId, integer ids only) — or null with the 401 already sent.
 *  Every write needs both: the ledger refuses an attributionless row. */
export function governedWriter(
  req: Request,
  res: Response
): { organizationId: number; actorUserId: number } | null {
  const organizationId = (req as Request & { resolvedOrganizationId?: number })
    .resolvedOrganizationId;
  const actorUserId = governedActorId(req);
  if (!organizationId || !actorUserId) {
    res.status(401).json({ success: false, error: 'Organization and user context required' });
    return null;
  }
  return { organizationId, actorUserId };
}

/** A task write and its ledger row are one fact: each runs on ONE transaction
 *  with auditTaskActionInTx, so a failed row rolls the write back — and this
 *  is the answer, never a 200 over an unrecorded change. */
export function auditWriteFailed(res: Response, what: string) {
  return res.status(500).json({
    success: false,
    error: 'AUDIT_WRITE_FAILED',
    message: `${what} could not be recorded in the audit trail, so nothing was changed. Try again.`,
  });
}

/** The transaction's COMMIT was lost: the change, its ledger row and anything
 *  it cascaded to may or may not have landed. Neither confirmed nor refuted —
 *  and nobody is notified of it. */
export function outcomeUnknown(res: Response) {
  return res.status(500).json({
    success: false,
    error: 'OUTCOME_UNKNOWN',
    message:
      'Whether this change was saved is unknown. Reload to see the task’s current state before trying again.',
  });
}
