/**
 * Program-journey spine — concept-to-submission read.
 *
 * GET /api/program-journey → the org's program-journey instances (segment
 * scoped: pharma BX-204 · NDA, biotech BX-301 · BLA), each shaped to exactly
 * the keys the v2 BiopharmaJourney surface renders per program
 * ({ seg, code, name, app, modality, indication, pathway, sponsor, agency,
 * readiness, current, target, overlay, modules, clock, haqs, contra,
 * blockers }). The `current_stage` column rehydrates as `current`; the nested
 * arrays/objects (target, overlay, modules, clock, haqs, contra, blockers)
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
      `SELECT seg, code, name, app, modality, indication, pathway, sponsor, agency,
              readiness, current_stage, target, overlay, modules, clock, haqs, contra, blockers
         FROM c2c_program_journey
        WHERE organization_id = $1
        ORDER BY seq, seg`,
      [orgId],
    );
    const data = rows.map((r) => ({
      seg: r.seg,
      code: r.code,
      name: r.name,
      app: r.app,
      modality: r.modality,
      indication: r.indication,
      pathway: r.pathway,
      sponsor: r.sponsor,
      agency: r.agency,
      readiness: r.readiness,
      current: r.current_stage,
      target: r.target ?? {},
      overlay: r.overlay ?? {},
      modules: r.modules ?? [],
      clock: r.clock ?? [],
      haqs: r.haqs ?? [],
      contra: r.contra ?? {},
      blockers: r.blockers ?? [],
    }));
    return res.json({ data, meta: { count: data.length } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read program journey.' } });
  }
});

export default router;
