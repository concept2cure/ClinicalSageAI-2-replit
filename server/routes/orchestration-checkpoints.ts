/**
 * /api/orchestration/checkpoints — read the PERSISTED approval-checkpoint
 * gates (shared/schema/orchestration.ts `approval_checkpoints`, written by
 * the PDEV workflow bridge and any future chain writers).
 *
 * The main orchestration router serves the in-memory execution engine; this
 * router is deliberately a separate, dependency-light module so the persisted
 * read stays mountable (and testable) without importing the whole Phase-3
 * service graph.
 *
 * Contract (consumed by the v2 Orchestration surface via useLive):
 *   GET /api/orchestration/checkpoints?limit=50
 *     → { data: [{ id, stepName, gateType, status, workflowRunId, runName,
 *          runStatus, requiredApproverRoles, requiredApproverCount,
 *          approvals, protectedAction, proposedAt, resolvedAt }],
 *         meta: { count } }
 *
 * Org-scoped through the owning workflow_runs row. Fails closed to an empty
 * envelope (42P01) when the store is not provisioned.
 *
 * @module server/routes/orchestration-checkpoints
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../db.js';

const router = Router();

/** Same resolution chain as routes/orchestration.ts, but null instead of throw. */
function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw =
    r.tenantContext?.organizationId ?? r.organizationId ?? r.user?.organizationId;
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

router.get('/checkpoints', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (orgId == null) {
    return res.status(403).json({ error: 'Organization context required' });
  }

  const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);

  try {
    const { rows } = await pool.query(
      `SELECT c.id,
              c.step_name               AS "stepName",
              c.gate_type               AS "gateType",
              c.status,
              c.workflow_run_id         AS "workflowRunId",
              r.display_name            AS "runName",
              r.status                  AS "runStatus",
              c.required_approver_roles AS "requiredApproverRoles",
              c.required_approver_count AS "requiredApproverCount",
              c.approvals,
              c.protected_action        AS "protectedAction",
              c.proposed_at             AS "proposedAt",
              c.resolved_at             AS "resolvedAt"
         FROM approval_checkpoints c
         JOIN workflow_runs r ON r.id = c.workflow_run_id
        WHERE r.organization_id = $1
        ORDER BY c.proposed_at DESC
        LIMIT $2`,
      [orgId, limit],
    );
    return res.json({ data: rows, meta: { count: rows.length } });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === '42P01') {
      // Store not provisioned — fail closed so the surface keeps its fixture.
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    console.error('[orchestration/checkpoints] GET /checkpoints', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
