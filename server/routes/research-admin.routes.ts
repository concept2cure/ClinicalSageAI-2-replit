/**
 * Research administration — CITI training-matrix read.
 *
 * GET /api/research-admin → the org's study personnel training matrix, each row
 * shaped to exactly the keys the v2 ResearchAdmin surface's Training section
 * renders ({ id, name, role, cells[] }). The per-module CITI status vector
 * (cells) rehydrates straight from JSONB, aligned to the surface's training-
 * column order. Org scoped; 403 without org context; fails closed to an empty
 * list on 42P01 so an unprovisioned store never 500s.
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

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, name, role, cells
         FROM c2c_research_admin
        WHERE organization_id = $1
        ORDER BY seq, id`,
      [orgId],
    );
    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      cells: r.cells ?? [],
    }));
    return res.json({ data, meta: { count: data.length } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read research administration training matrix.' } });
  }
});

export default router;
