/**
 * Regulatory-change intelligence — horizon-scan read.
 *
 * GET /api/reg-change → the org's tracked regulatory changes (FDA/ISO/IEC/EU),
 * each shaped to exactly the keys the v2 RegChange surface renders
 * ({ id, src, kind, when, sev, live, title, summary, affects[], action, doc,
 * owner, due }). The `when_label` column rehydrates as `when`; the nested
 * per-device impact list (affects) rehydrates straight from JSONB. Org scoped;
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

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, src, kind, when_label, sev, live, title, summary, affects, action, doc, owner, due
         FROM c2c_reg_changes
        WHERE organization_id = $1
        ORDER BY seq, id`,
      [orgId],
    );
    const data = rows.map((r) => ({
      id: r.id,
      src: r.src,
      kind: r.kind,
      when: r.when_label,
      sev: r.sev,
      live: r.live,
      title: r.title,
      summary: r.summary,
      affects: r.affects ?? [],
      action: r.action,
      doc: r.doc,
      owner: r.owner,
      due: r.due,
    }));
    return res.json({ data, meta: { count: data.length } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read regulatory changes.' } });
  }
});

export default router;
