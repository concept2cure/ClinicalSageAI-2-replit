/**
 * /api/c2c/governance/* — read-only projections of the permission model.
 *
 * Makes "permission is the source of truth, derived not connected" real for the
 * UI. Instead of the task/step carrying an assignee or approver list, the UI
 * asks the server *who holds the permission* — eligibility and approval authority
 * are derived from RBAC, never stored. Org-scoped (verified JWT org).
 *
 * @module server/routes/c2c/governance
 */
import { Router, type Request, type Response } from 'express';
import { getSecureOrgId } from '../../utils/tenantContext.js';
import { can, whoCan, type PermissionQuery } from '../../services/governance/permissions.js';
import { pool } from '../../db.js';

const router = Router();

function requireOrg(req: Request, res: Response): number | null {
  const raw = getSecureOrgId(req);
  const org = raw ? Number(raw) : NaN;
  if (!Number.isFinite(org) || org <= 0) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return null;
  }
  return org;
}

function queryFrom(req: Request): PermissionQuery {
  const q = req.query;
  return {
    action: String(q.action ?? ''),
    resourceType: q.resourceType ? String(q.resourceType) : null,
    ctdModule: q.ctdModule ? String(q.ctdModule) : null,
    classification: q.classification ? String(q.classification) : null,
  };
}

/**
 * GET /api/c2c/governance/eligible?action=sign&resourceType=document&ctdModule=&classification=
 * The org users who can perform the action — the derivation that drives the UI's
 * assignee / signer lists. Returns [{ userId, role }].
 */
router.get('/eligible', async (req: Request, res: Response) => {
  const org = requireOrg(req, res);
  if (org == null) return;
  const q = queryFrom(req);
  if (!q.action) return res.status(400).json({ error: 'ACTION_REQUIRED' });
  try {
    const ids = await whoCan(org, q);
    if (ids.length === 0) return res.json({ eligible: [] });
    const r = await pool.query(
      `SELECT user_id, role FROM organization_users
        WHERE organization_id = $1 AND user_id = ANY($2::int[])`,
      [org, ids],
    );
    return res.json({ eligible: r.rows });
  } catch (err: any) {
    console.error('[c2c/governance/eligible]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/c2c/governance/can?action=sign&resourceType=document
 * Whether the CALLER may perform the action (their role, evaluated server-side).
 * Lets the UI hide/disable an action it isn't authorized for — but enforcement
 * is always re-checked server-side at action time, never trusted from this.
 */
router.get('/can', async (req: Request, res: Response) => {
  const org = requireOrg(req, res);
  if (org == null) return;
  const role = String((req as any).userRole ?? (req as any).user?.role ?? '');
  const q = queryFrom(req);
  if (!q.action) return res.status(400).json({ error: 'ACTION_REQUIRED' });
  try {
    return res.json({ allowed: await can(org, role, q), role });
  } catch (err: any) {
    console.error('[c2c/governance/can]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
