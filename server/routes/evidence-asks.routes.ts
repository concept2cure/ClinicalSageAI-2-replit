/**
 * Evidence-ask read — saved corpus-retrieval answer.
 *
 * GET /api/evidence-asks → the org's single saved evidence ask, shaped to
 * exactly the keys the v2 Evidence surface renders
 * ({ pedigree, answer, cites, chunks, suggestions }, with the retrieved source
 * chunks carrying { n, doc, page, sim, snip }). A single ask is returned
 * (ORDER BY id LIMIT 1); JSONB columns rehydrate straight into the display
 * shape. Org scoped; 403 without org context; fails closed to `null` on 42P01
 * so an unprovisioned store never 500s and the surface keeps its honest
 * fixture.
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
      `SELECT id, question, pedigree, answer, cites, chunks, suggestions
         FROM c2c_evidence_asks
        WHERE organization_id = $1
        ORDER BY id
        LIMIT 1`,
      [orgId],
    );
    if (rows.length === 0) {
      return res.json({ data: null, meta: { count: 0 } });
    }
    const r = rows[0];
    const data = {
      pedigree: r.pedigree,
      answer: r.answer,
      cites: Array.isArray(r.cites) ? r.cites : [],
      chunks: Array.isArray(r.chunks) ? r.chunks : [],
      suggestions: Array.isArray(r.suggestions) ? r.suggestions : [],
    };
    return res.json({ data, meta: { count: 1 } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: null, meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read evidence ask.' } });
  }
});

export default router;
