/**
 * CRO sponsor-portfolio — multi-sponsor client roster read.
 *
 * GET /api/cro-portfolio → the org's sponsor clients (one row per engagement),
 * shaped to exactly the keys the v2 CroPortfolio surface renders
 * ({ id, name, type, lead, sow, sowNote, studies, subs }, with the nested
 * studies (CroStudy[]) and subs (CroSub[]) rehydrated from JSONB). The surface
 * adopts this via liveGet and falls back to its codebase fixture (with a Sample
 * pill) when the store is empty or unreachable. Org scoped; 403 without org
 * context; fails closed to an empty list on 42P01 so an unprovisioned store
 * never 500s.
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
      `SELECT id, name, type, lead, sow, sow_note, studies, subs
         FROM c2c_cro_portfolio
        WHERE organization_id = $1
        ORDER BY ord, id`,
      [orgId],
    );
    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      lead: r.lead,
      sow: r.sow,
      sowNote: r.sow_note,
      studies: Array.isArray(r.studies) ? r.studies : [],
      subs: Array.isArray(r.subs) ? r.subs : [],
    }));
    return res.json({ data, meta: { count: data.length } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read CRO portfolio.' } });
  }
});

export default router;
