/**
 * Investigator's Brochure (IB) — ICH E6(R2) §7 section-structure read.
 *
 * GET /api/investigator-brochure → the org's IB section tree, each row shaped to
 * exactly the keys the v2 InvestigatorBrochure surface renders ({ number, title,
 * required, status, gaps, description, depth }), plus a { productName,
 * completeness, provisioned } meta.
 *
 * This route is a thin, honest surface over `server/services/authoring/ib-builder`:
 *   - When the org has a provisioned IB program (a stored IBBuildRequest), it runs
 *     `buildInvestigatorBrochure(..., { templateOnly: true })` — the DETERMINISTIC
 *     path that never needs the AI key — and returns each section's regulatory
 *     verdict ({ status: rendered | partial | missing, gaps }).
 *   - When there is no program (or the store is not provisioned / any error), it
 *     returns the deterministic ICH E6(R2) §7 SKELETON computed from the builder's
 *     exported gap engine (flattenSections + resolveAvailability + detectSectionGaps
 *     + sectionStatus): every data-bearing section is honestly marked `missing`
 *     with the inputs it needs, boilerplate sections `rendered`. No IB prose is
 *     ever fabricated here — only the (real) ICH section registry and honest
 *     per-section status/gap verdicts are exposed.
 *
 * Org scoped; 403 without org context; fails closed to the deterministic skeleton
 * on any error so an unprovisioned store never 500s and never invents content.
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import {
  flattenSections,
  resolveAvailability,
  detectSectionGaps,
  sectionStatus,
  buildInvestigatorBrochure,
  type IBBuildRequest,
  type IBSectionResult,
} from '../services/authoring/ib-builder';

const router = Router();

/** The per-section display contract the v2 InvestigatorBrochure surface renders. */
export interface IBSectionRow {
  number: string;
  title: string;
  required: boolean;
  status: 'rendered' | 'partial' | 'missing';
  gaps: string[];
  description: string;
  /** 0 = top-level IB chapter / front matter, 1 = sub-section (e.g. 4.1). */
  depth: number;
}

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

const depthOf = (number: string): number => (number.includes('.') ? 1 : 0);

/**
 * The honest ICH E6(R2) §7 skeleton: the real section registry with a
 * deterministic per-section verdict computed against an all-absent input set.
 * Boilerplate sections render; every data-bearing section is `missing` with the
 * inputs it needs. Uses only the builder's exported (AI-free) gap engine.
 */
function skeletonRows(): IBSectionRow[] {
  const available = resolveAvailability({ product: { productName: '' } });
  return flattenSections().map((s) => {
    const gaps = detectSectionGaps(s, available);
    return {
      number: s.number,
      title: s.title,
      required: s.required,
      status: sectionStatus(s, available, gaps),
      gaps,
      description: s.description,
      depth: depthOf(s.number),
    };
  });
}

/** Map a built IB job's section results to the display contract, enriching the
 *  section scope (`description`) + `depth` from the registry. */
function rowsFromJob(sections: IBSectionResult[]): IBSectionRow[] {
  const registry = new Map(flattenSections().map((s) => [s.number, s]));
  return sections.map((r) => ({
    number: r.number,
    title: r.title,
    required: r.required,
    status: r.status,
    gaps: r.gaps,
    description: registry.get(r.number)?.description ?? '',
    depth: depthOf(r.number),
  }));
}

/** Fraction of REQUIRED sections rendered (mirrors the builder's rollup). */
function completenessOf(rows: IBSectionRow[]): number {
  const required = rows.filter((r) => r.required);
  const rendered = required.filter((r) => r.status === 'rendered').length;
  return required.length ? Math.round((rendered / required.length) * 100) : 0;
}

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res
      .status(403)
      .json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const { rows } = await pool.query(
      `SELECT request
         FROM c2c_investigator_brochure
        WHERE organization_id = $1
        ORDER BY id DESC
        LIMIT 1`,
      [orgId],
    );
    const stored = rows[0]?.request as IBBuildRequest | undefined;

    if (stored && stored.product && stored.product.productName) {
      // Provisioned IB program — deterministic (template-only) build so the
      // verdicts are honest with or without the AI key.
      const job = await buildInvestigatorBrochure({ ...stored, templateOnly: true });
      const data = rowsFromJob(job.sections);
      return res.json({
        data,
        meta: {
          count: data.length,
          productName: job.productName,
          completeness: job.completeness,
          provisioned: true,
        },
      });
    }

    // No provisioned program → honest ICH E6(R2) §7 skeleton.
    const data = skeletonRows();
    return res.json({
      data,
      meta: {
        count: data.length,
        productName: null,
        completeness: completenessOf(data),
        provisioned: false,
      },
    });
  } catch (err) {
    // Fail closed to the deterministic skeleton — never 500, never fabricate IB
    // content. A missing store (42P01) is surfaced via meta.pendingStore.
    const data = skeletonRows();
    return res.json({
      data,
      meta: {
        count: data.length,
        productName: null,
        completeness: completenessOf(data),
        provisioned: false,
        pendingStore: (err as { code?: string })?.code === '42P01',
      },
    });
  }
});

export default router;
