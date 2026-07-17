/**
 * Market-access & reimbursement — payer-coverage / value-dossier / coding read.
 *
 * GET /api/market-access → the org's market-access program records, each shaped
 * to exactly the keys the v2 MarketAccess surface renders. Every record carries
 * the three rendered lists rehydrated straight from JSONB:
 *   coverage[] → { region, payer, basis, code, status, note }   (CoverageRow)
 *   dossier[]  → { n, label, owner, st, pct, blocker? }          (DossierSection)
 *   coding[]   → { code, desc, kind, status, note }              (CodingRow)
 * Org scoped; 403 without org context; fails closed to an empty list on 42P01 so
 * an unprovisioned store never 500s.
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
      `SELECT program, coverage, dossier, coding
         FROM c2c_market_access
        WHERE organization_id = $1
        ORDER BY program`,
      [orgId],
    );
    const data = rows.map((r) => ({
      program: r.program,
      coverage: Array.isArray(r.coverage) ? r.coverage : [],
      dossier: Array.isArray(r.dossier) ? r.dossier : [],
      coding: Array.isArray(r.coding) ? r.coding : [],
    }));
    return res.json({ data, meta: { count: data.length } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read market access.' } });
  }
});

export default router;
