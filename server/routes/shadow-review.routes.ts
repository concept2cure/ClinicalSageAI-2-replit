/**
 * Shadow-review — pre-file reviewer worklist read.
 *
 * GET /api/shadow-review → the org's simulated-reviewer findings, grouped by
 * reviewer lens (fda_filing, ema_d120, pmda, nb_mdr, nb_ivdr). Each row is
 * shaped to exactly the keys the v2 ShadowReview surface renders:
 * { lens, findings[] }, where every finding carries the ShadowFinding display
 * keys ({ dimension, severity, title, detail, basis, recommendation, leafRef }).
 * The nested per-lens findings list rehydrates straight from JSONB. Org scoped;
 * 403 without org context; fails closed to an empty list on 42P01 so an
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

interface ShadowFindingRow {
  dimension: string;
  severity: string;
  title: string;
  detail: string | null;
  basis: string | null;
  recommendation: string | null;
  leafRef: string | null;
}

function shapeFinding(f: Record<string, unknown>): ShadowFindingRow {
  return {
    dimension: (f.dimension as string) ?? '',
    severity: (f.severity as string) ?? '',
    title: (f.title as string) ?? '',
    detail: (f.detail as string) ?? null,
    basis: (f.basis as string) ?? null,
    recommendation: (f.recommendation as string) ?? null,
    leafRef: (f.leafRef as string) ?? null,
  };
}

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const { rows } = await pool.query(
      `SELECT lens, findings
         FROM c2c_shadow_review
        WHERE organization_id = $1
        ORDER BY seq, lens`,
      [orgId],
    );
    const data = rows.map((r) => ({
      lens: r.lens,
      findings: Array.isArray(r.findings) ? r.findings.map(shapeFinding) : [],
    }));
    return res.json({ data, meta: { count: data.length } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read shadow review.' } });
  }
});

export default router;
