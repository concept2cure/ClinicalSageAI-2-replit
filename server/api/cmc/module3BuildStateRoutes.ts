/**
 * Module 3 Build-State API Routes
 *
 * Provides a unified view of Module 3 section build state by combining:
 * - CMC source objects (what data exists)
 * - Compiled sections (what has been built)
 * - Contradictions (what is blocked)
 * - Governed artifacts (what is in the editor)
 * - Uploaded source documents (what files feed Module 3)
 *
 * This is the single API the dossier tree, editor, and AnA use to understand
 * Module 3 build readiness. No separate dashboard needed.
 *
 * GET /section-labels and GET /uploaded-sources/:projectId were deleted on
 * 2026-10-05 with no caller in client/src or server (decision P-28;
 * docs/evidence/CMC-M3-GA/2026-10-05/20-cmc-api-allowlist/; kept gone by
 * server/api/cmc/__tests__/cmc-retired-routers.contract.test.ts). Each section
 * GET /build-state/:projectId returns carries its sectionLabel and its
 * uploadedSourceCount; the Vault documents evidencing a record are
 * /source-evidence/:projectId (sourceEvidenceRoutes.ts).
 */

import express from 'express';
import { deriveBuildState, getModule3BuildStatus, getSectionLabels } from '../../services/module3-convergence-service';
import { MODULE3_SECTION_RULES } from '../../services/module3Composer';
import { serverError } from '../../lib/api-response';
import { createScopedLogger } from '../../utils/logger';
import { guardModule3Project, module3OrgId } from './module3-project-guard';
import { compositionRefusalBody, compositionRefusalStatus, isCompositionOutOfScope } from '../../services/cmc/composition-scope';

const router = express.Router();
const log = createScopedLogger('module3-build-state');
/* Every route here that names a project reads or builds only in a project of
   the caller's organization (PF-15); another organization's project is 404,
   not an empty build state. */
guardModule3Project(router, log);

// ── Canonical section constants — imported, never copied ──────────────────────
//
// This file used to carry its OWN copies of the section-label map and the
// section→source-type rules, and the copies drifted: '3.2.S.4' and '3.2.P.5'
// here lacked `qc_result`, which the composer counts — so the build screen
// undercounted a section's sources relative to the compile that consumes them.
// A build board that disagrees with its own compiler about what feeds a
// section is the duplication Rule "zero duplication" exists to prevent. The
// labels come from the convergence service and the rules from the composer;
// there is nothing left here to drift.

const SECTION_LABELS = getSectionLabels();
const ALL_SECTION_KEYS = Object.keys(SECTION_LABELS);

/** section → the source types that feed it, straight from the composer. */
const SECTION_SOURCE_TYPES: Record<string, string[]> = Object.fromEntries(
  MODULE3_SECTION_RULES.map((r) => [r.sectionKey, [...r.requiredSourceTypes]]),
);

// ── Build state derivation ────────────────────────────────────────────────────

/* The build-state vocabulary and its ONE derivation live in the convergence
   service (deriveBuildState); this route re-exports them for its callers. */
export type { Module3BuildState } from '../../services/module3-convergence-service';

// ── Helpers ───────────────────────────────────────────────────────────────────


// ── GET /build-state/:projectId ───────────────────────────────────────────────
// Returns the unified Module 3 build state for all 15 subsections.
// Used by: dossier tree, editor inspector, AnA context enrichment.

router.get('/build-state/:projectId', async (req, res) => {
  try {
    const orgId = module3OrgId(req);
    const { projectId } = req.params;

    /* ONE reader. getModule3BuildStatus resolves the artifact spine, reads the
       sources, compiled sections, contradictions, governed artifacts and the
       uploaded source documents, composes the sources the way compile does,
       and derives each section's build state — the same figures AnA reads and
       the export gate refuses on. This route used to run its own copies of
       four of those reads and a second, disagreeing state derivation. */
    const canonicalStatus = await getModule3BuildStatus(orgId, projectId);

    const sections = canonicalStatus.sections.map((canonical) => ({
      sectionKey: canonical.sectionKey,
      sectionLabel: SECTION_LABELS[canonical.sectionKey] ?? canonical.sectionLabel,
      buildState: canonical.buildState,
      sourceObjectCount: canonical.sourceObjectCount,
      uploadedSourceCount: canonical.uploadedSourceCount,
      /* The source types the section's rule takes — what the board lists as
         feeding it — rather than the types that happened to compose. */
      sourceTypes: SECTION_SOURCE_TYPES[canonical.sectionKey] || canonical.sourceTypes || [],
      completeness: canonical.completeness,
      missingInputs: canonical.missingInputs,
      hasContradictions: canonical.hasContradictions,
      contradictionCount: canonical.contradictionCount,
      isStale: canonical.isStale,
      staleReason: canonical.staleReason,
      /* The board's vocabulary for "never compiled". */
      approvalState: canonical.approvalState === 'none' ? 'not_started' : canonical.approvalState,
      hasNarrative: canonical.hasNarrative,
      artifactId: canonical.artifactId,
      artifactStatus: canonical.artifactStatus,
      lastCompiled: canonical.lastCompiled,
      lastUpdated: canonical.lastUpdated,
    }));
    const spine = canonicalStatus.artifactRegistry;

    /* ── Summary stats ──
       "Ready" is counted from the UNDERLYING FACTS, not from the display state.

       `buildState` is a presentation value with a priority order, and its
       `locked` branch reads `artifactStatus`, which is the DOCUMENT lifecycle in
       the editor — not §3.2 section approval. Counting it as ready meant a
       section whose artifact happened to be locked was reported ready while its
       `approval_state` was still `draft`. The final-export gate counts
       `approval_state === 'approved'` and refuses on any section that went stale
       after approval, so this readiness figure could read 10/10 on the build
       screen while the gate refused the very same project with "10 section(s)
       not approved".

       A readiness percentage that disagrees with the gate governing release is
       worse than no percentage. The two conditions below are exactly the gate's,
       so the number on screen and the verdict at the gate cannot diverge. */
    const isReady = (s: { approvalState: string; isStale: boolean }) =>
      s.approvalState === 'approved' && !s.isStale;

    const totalSections = sections.length;
    const readySections = sections.filter(isReady).length;
    const staleSections = sections.filter((s) => s.buildState === 'stale').length;
    const blockedSections = sections.filter(
      (s) => s.buildState === 'contradiction_flagged'
    ).length;
    // Anything with sources that is not already ready still has work to do —
    // including a section that was approved and then went stale.
    const buildableSections = sections.filter(
      (s) => s.sourceObjectCount > 0 && !isReady(s)
    ).length;

    return res.json({
      success: true,
      data: {
        sections,
        /* Honest-state contract: when the registry could not be addressed,
           every artifactId above is null BECAUSE of that — not because the
           project has no artifacts. The client must render the distinction. */
        artifactRegistry: spine,
        summary: {
          totalSections,
          readySections,
          staleSections,
          blockedSections,
          buildableSections,
          readinessPercent:
            totalSections > 0 ? Math.round((readySections / totalSections) * 100) : 0,
        },
      },
    });
  } catch (error) {
    if (String((error as Error)?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    /* A program outside the composition boundary (decision P-28) has no
       small-molecule board to show: the boundary's own 409, as compile and
       build-section answer, instead of completeness scored by rules that are
       not its product's. */
    if (isCompositionOutOfScope(error)) return res.status(compositionRefusalStatus(error.refusal)).json(compositionRefusalBody(error.refusal));
    return serverError(res, log, 'computing the build state', error);
  }
});

export default router;
export { SECTION_LABELS, ALL_SECTION_KEYS, deriveBuildState };
