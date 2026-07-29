/**
 * Document-journey read — the per-document lifecycle worklist.
 *
 * GET /api/doc-journey → the org's §2.5 Clinical Overview journey (BX-204 BLA)
 * as an ordered list of stage rows, shaped to exactly the keys the v2 DocJourney
 * surface renders: the DjStage rail fields ({ id, label, ic, when, who, ver,
 * done, active, sub, kind }) plus the per-stage content `snap` (JSONB rehydrated
 * into the surface's DjSnap shape). Org scoped; 403 without org context; fails
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
      `SELECT id, label, ic, when_label, who, ver, done, active, sub, kind, snap
         FROM c2c_doc_journeys
        WHERE organization_id = $1
        ORDER BY ord`,
      [orgId],
    );
    const data = rows.map((r) => ({
      id: r.id,
      label: r.label,
      ic: r.ic,
      when: r.when_label,
      who: r.who,
      ver: r.ver,
      done: Boolean(r.done),
      active: Boolean(r.active),
      sub: r.sub,
      kind: r.kind,
      snap: r.snap ?? null,
    }));
    return res.json({ data, meta: { count: data.length } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read document journey.' } });
  }
});

export default router;
