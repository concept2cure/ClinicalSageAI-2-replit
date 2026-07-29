/**
 * Protocol-development authoring hub — protocol document read.
 *
 * GET /api/protocol-dev → the org's in-development clinical protocol(s), each
 * shaped to exactly the keys the v2 ProtocolDev surface renders (the PdevDoc
 * shape: { id, title, shortTitle, kind, version, status, sponsor, pi, updated,
 * completeness, openSection, sections[], content{}, objectives[], eligibility{},
 * soa{}, risks[], milestones[], budget{}, amendments[], deviations[], reviews[],
 * consent[], completenessFindings[] }). Header scalars come straight from
 * columns (short_title → shortTitle, open_section → openSection,
 * completeness_findings → completenessFindings); every nested structure
 * rehydrates straight from JSONB. Org scoped; 403 without org context; fails
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
      `SELECT id, title, short_title, kind, version, status, sponsor, pi, updated,
              completeness, open_section, sections, content, objectives, eligibility,
              soa, risks, milestones, budget, amendments, deviations, reviews, consent,
              completeness_findings
         FROM c2c_protocol_dev
        WHERE organization_id = $1
        ORDER BY seq, id`,
      [orgId],
    );
    const data = rows.map((r) => ({
      id: r.id,
      title: r.title,
      shortTitle: r.short_title,
      kind: r.kind,
      version: r.version,
      status: r.status,
      sponsor: r.sponsor,
      pi: r.pi,
      updated: r.updated,
      completeness: r.completeness,
      openSection: r.open_section,
      sections: r.sections ?? [],
      content: r.content ?? {},
      objectives: r.objectives ?? [],
      eligibility: r.eligibility ?? { inclusion: [], exclusion: [] },
      soa: r.soa ?? { visits: [], assessments: [], cells: {}, issues: [] },
      risks: r.risks ?? [],
      milestones: r.milestones ?? [],
      budget: r.budget ?? { params: {}, items: [] },
      amendments: r.amendments ?? [],
      deviations: r.deviations ?? [],
      reviews: r.reviews ?? [],
      consent: r.consent ?? [],
      completenessFindings: r.completeness_findings ?? [],
    }));
    return res.json({ data, meta: { count: data.length } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read protocol.' } });
  }
});

export default router;
