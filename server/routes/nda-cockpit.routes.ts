/**
 * NDA/BLA cockpit — CTD module readiness read.
 *
 * GET /api/nda-cockpit/modules → the org's per-module (M1–M5) completeness
 * roll-up, shaped to exactly the keys the v2 NdaCockpit "CTD readiness" panel
 * renders ({ m, label, pct, docs, open, gate }). The panel derives the overall
 * "% ready" from these rows; the Module 1 worklist, PDUFA clock, and
 * Refuse-to-File log stay the surface's local-first interactive lists. Org
 * scoped; 403 without org context; fails closed to an empty list on 42P01 so an
 * unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../db';

const router = Router();

function getOrgId(req: Request): number | null {
  const r = req as {
    tenantId?: unknown;
    organizationId?: unknown;
    tenantContext?: { organizationId?: unknown };
    user?: { organizationId?: unknown };
  };
  const raw =
    r.tenantId ?? r.organizationId ?? r.tenantContext?.organizationId ?? r.user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

router.get('/modules', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const { rows } = await pool.query(
      `SELECT m, label, pct, docs, open_count, gate
         FROM c2c_nda_modules
        WHERE organization_id = $1
        ORDER BY m`,
      [orgId],
    );
    const data = rows.map((r) => ({
      m: r.m,
      label: r.label,
      pct: r.pct,
      docs: r.docs,
      open: r.open_count,
      gate: r.gate ?? null,
    }));
    return res.json({ data, meta: { count: data.length } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read NDA module readiness.' } });
  }
});

export default router;
