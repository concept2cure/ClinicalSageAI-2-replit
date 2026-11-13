/**
 * Investigator's Brochure (IB) — ICH E6(R3) Appendix A section-structure read, for one project.
 *
 * GET /api/investigator-brochure?programId=<project> → that project's IB section
 * tree, each row shaped to exactly the keys the v2 InvestigatorBrochure surface
 * renders ({ number, title, required, status, gaps, description, depth, needsData }),
 * plus a { programId, productName, completeness, provisioned, source, availability,
 * storesWithoutProject } meta.
 *
 * ONE PROJECT (2026-11-12, S12 sweep finding 92). The readiness was the
 * organisation's: with no project named the route answered a percentage, and a
 * project read "ready" on another project's Module 3 sections. A readiness figure
 * with no project behind it is a number nobody computed for anything. So the
 * project is required (400 PROJECT_REQUIRED without it, and no figure), the reader
 * is admitted to it through the Projects routes' own check
 * (`requireProjectRouteAccess`: a project of another organisation, or one the
 * reader cannot open, answers 404), and every store is read for that project only.
 *
 * REAL-STORE ONLY (GA, 2026-08). The IB has no authored instance table — it is
 * *assembled* from the real upstream evidence the CTD composers already produce.
 * This route reads that evidence through
 * `investigator-brochure-view-assembler.assembleProjectIBSections`, which derives each
 * IB input domain (product / nonclinical / clinical / safety) from the store where
 * the project's evidence actually lives — nonclinical_studies, clinical_studies,
 * adverse_events / risk_management_plans, cmc_module3_sections — and runs the
 * deterministic `ib-builder` gap engine for the per-section
 * rendered/partial/missing verdict.
 *
 * The seed-only `c2c_investigator_brochure` blob is RETIRED — this route no longer
 * reads it, and no fallback fabricates IB content. A domain the project has no real
 * evidence for is honestly ABSENT (its sections render `missing`); a project with no
 * upstream evidence at all yields the honest ICH E6(R3) Appendix A skeleton with
 * `provisioned=false` and a completeness of 0.
 *
 * Fails CLOSED to the deterministic skeleton when a store is missing (42P01),
 * declared via `meta.pendingStore`; every other store error is a 500, never a
 * figure no query backed.
 */
import { Router, type Request, type Response } from 'express';
import { ibCompleteness, ibSectionRows } from '../services/authoring/ib-builder';
import { assembleProjectIBSections } from '../services/authoring/investigator-brochure-view-assembler';
import { resolveOrgId } from '../types/auth-request';
import { requireProjectRouteAccess, sendProjectAccessFailure } from './c2c/project-route-access';

const router = Router();

/**
 * The honest ICH E6(R3) Appendix A skeleton: the real section registry with a deterministic
 * per-section verdict computed against an all-absent input set. Boilerplate sections
 * render; every data-bearing section is `missing` with the inputs it needs. Uses only
 * the builder's exported (AI-free, DB-free) gap engine — so the route can always fail
 * closed to it WITHOUT touching the store or fabricating IB content.
 */
function skeletonRows() {
  return ibSectionRows({ product: false, nonclinical: false, clinical: false, safety: false, none: true });
}

router.get('/', async (req: Request, res: Response) => {
  const programId = typeof req.query.programId === 'string' ? req.query.programId.trim() : '';
  if (!programId) {
    return res.status(400).json({
      error: {
        code: 'PROJECT_REQUIRED',
        message: 'Readiness of an Investigator\'s Brochure is read for one project. Open a project and try again.',
      },
    });
  }
  let organizationId: number;
  try {
    await requireProjectRouteAccess(req, res, { kind: 'projects', programId });
    const resolved = resolveOrgId(req);
    if (!resolved) throw new Error('The admitted request carries no organization.');
    organizationId = resolved;
  } catch (error) {
    return sendProjectAccessFailure(res, error, true);
  }
  try {
    const view = await assembleProjectIBSections(organizationId, programId);
    return res.json({
      data: view.rows,
      meta: {
        count: view.rows.length,
        programId,
        productName: view.productName,
        completeness: view.completeness,
        provisioned: view.provisioned,
        source: view.source,
        sources: view.sources,
        storesWithoutProject: view.storesWithoutProject,
        availability: view.availability,
      },
    });
  } catch (err) {
    // A missing store (42P01) fails closed to the deterministic skeleton — the
    // ICH E6 section outline with every section unrendered — and declares that
    // via meta.pendingStore. Never fabricated IB content.
    //
    // Every other error is a 5xx. Serving the skeleton after a failed assembly
    // reported a computed IB readiness figure that no query backed. A number an
    // author trusts must come from data that was actually read.
    if ((err as { code?: string })?.code === '42P01') {
      const data = skeletonRows();
      return res.json({
        data,
        meta: {
          count: data.length,
          programId,
          productName: null,
          completeness: ibCompleteness(data),
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
