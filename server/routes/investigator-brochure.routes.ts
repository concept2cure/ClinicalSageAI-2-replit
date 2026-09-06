/**
 * Investigator's Brochure (IB) — ICH E6(R2) §7 section-structure read.
 *
 * GET /api/investigator-brochure → the org's IB section tree, each row shaped to
 * exactly the keys the v2 InvestigatorBrochure surface renders ({ number, title,
 * required, status, gaps, description, depth }), plus a { productName, completeness,
 * provisioned, source, availability } meta.
 *
 * REAL-STORE ONLY (GA, 2026-08). The IB has no authored instance table — it is
 * *assembled* from the real upstream evidence the CTD composers already produce.
 * This route reads that evidence, org-scoped, through
 * `investigator-brochure-view-assembler.assembleOrgIBSections`, which derives each
 * IB input domain (product / nonclinical / clinical / safety) from the store where
 * the org's evidence actually lives — nonclinical_studies, clinical_ops.studies /
 * clinical_studies, adverse_events / risk_management_plans, cmc_module3_sections —
 * and runs the deterministic `ib-builder` gap engine for the per-section
 * rendered/partial/missing verdict.
 *
 * The seed-only `c2c_investigator_brochure` blob is RETIRED — this route no longer
 * reads it, and no fallback fabricates IB content. A domain the org has no real
 * evidence for is honestly ABSENT (its sections render `missing`); an org with no
 * upstream evidence at all yields the honest ICH E6(R2) §7 skeleton with
 * `provisioned=false`.
 *
 * Org scoped; 403 without org context. Fails CLOSED to the deterministic skeleton on
 * any store error (never 500, never fabricates IB content); a missing store (42P01)
 * is surfaced via `meta.pendingStore`.
 */
import { Router, type Request, type Response } from 'express';
import {
  flattenSections,
  resolveAvailability,
  detectSectionGaps,
  sectionStatus,
} from '../services/authoring/ib-builder';
import {
  assembleOrgIBSections,
  type IBSectionRow,
} from '../services/authoring/investigator-brochure-view-assembler';

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

const depthOf = (number: string): number => (number.includes('.') ? 1 : 0);

/**
 * The honest ICH E6(R2) §7 skeleton: the real section registry with a deterministic
 * per-section verdict computed against an all-absent input set. Boilerplate sections
 * render; every data-bearing section is `missing` with the inputs it needs. Uses only
 * the builder's exported (AI-free, DB-free) gap engine — so the route can always fail
 * closed to it WITHOUT touching the store or fabricating IB content.
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
    const view = await assembleOrgIBSections(orgId);
    return res.json({
      data: view.rows,
      meta: {
        count: view.rows.length,
        productName: view.productName,
        completeness: view.completeness,
        provisioned: view.provisioned,
        source: view.source,
        sources: view.sources,
        availability: view.availability,
      },
    });
  } catch (err) {
    // A missing store (42P01) fails closed to the deterministic skeleton — the
    // ICH E6 section outline with every section unrendered — and declares that
    // via meta.pendingStore. Never fabricated IB content.
    //
    // Every other error is now a 5xx. The skeleton carries a real completeness
    // percentage, and serving it after a failed assembly reported a computed IB
    // readiness figure that no query backed. A number an author trusts must
    // come from data that was actually read.
    if ((err as { code?: string })?.code === '42P01') {
      const data = skeletonRows();
      return res.json({
        data,
        meta: {
          count: data.length,
          productName: null,
          completeness: completenessOf(data),
          provisioned: false,
          // The failed read does not say which store was missing; naming one
          // here (it named nonclinical_studies) was a guess.
          source: 'none',
          pendingStore: true,
        },
      });
    }
    console.error(
      '[investigator-brochure] IB section assembly failed:',
      err instanceof Error ? err.message : String(err),
    );
    return res.status(500).json({
      error: { code: 'INTERNAL', message: 'Failed to assemble Investigator Brochure sections.' },
    });
  }
});

export default router;
