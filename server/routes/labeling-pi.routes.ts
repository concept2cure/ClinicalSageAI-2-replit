/**
 * Labeling / prescribing-information — per-product label worklist read.
 *
 * GET /api/labeling-pi → the org's structured product-label sections (USPI /
 * PLLR — 21 CFR 201.57), each shaped to exactly the keys the v2 LabelingPi
 * surface renders ({ n, label, st, flag, content, negotiation }). The rendered
 * label text (`content`) and the sponsor-vs-agency redline (`negotiation`)
 * rehydrate straight from JSONB. Org scoped; 403 without org context; fails
 * closed to an empty list on 42P01 so an unprovisioned store never 500s.
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
      `SELECT n, label, st, flag, content, negotiation
         FROM c2c_labeling_pi
        WHERE organization_id = $1
        ORDER BY seq, n`,
      [orgId],
    );
    const data = rows.map((r) => ({
      n: r.n,
      label: r.label,
      st: r.st,
      flag: r.flag ?? null,
      content: r.content ?? null,
      negotiation: r.negotiation ?? null,
    }));
    return res.json({ data, meta: { count: data.length } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read labeling sections.' } });
  }
});

export default router;
