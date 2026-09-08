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
 */

import express from 'express';
import { getPool } from '../../db';
import { resolveCmcArtifactProject } from '../../services/cmc/resolve-cmc-artifact-project';
import { deriveBuildState, getModule3BuildStatus, getSectionLabels } from '../../services/module3-convergence-service';
import { MODULE3_SECTION_RULES } from '../../services/module3Composer';

const router = express.Router();

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

function getOrgId(req: express.Request): number {
  const orgId = parseInt(
    String((req as any).tenantId || (req as any).tenantContext?.organizationId || 0),
    10
  );
  if (!orgId || Number.isNaN(orgId)) throw new Error('Organization context required');
  return orgId;
}

// ── GET /build-state/:projectId ───────────────────────────────────────────────
// Returns the unified Module 3 build state for all 15 subsections.
// Used by: dossier tree, editor inspector, AnA context enrichment.

router.get('/build-state/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
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
    return res.status(500).json({
      success: false,
      error: ((error instanceof Error ? error.message : String(error)) || 'Failed to compute build state'),
    });
  }
});

// ── GET /section-labels ───────────────────────────────────────────────────────
// Returns the canonical section label map. Used by frontend for display.

router.get('/section-labels', (_req, res) => {
  return res.json({ success: true, data: SECTION_LABELS });
});

// ── GET /uploaded-sources/:projectId ──────────────────────────────────────────
// Returns all uploaded source documents classified for Module 3 feed.

router.get('/uploaded-sources/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { projectId } = req.params;
    const pool = getPool();

    // Same spine translation as build-state: the registry keys integer
    // projects.id; the raw TEXT id aborts the query for uuid programs.
    const spine = await resolveCmcArtifactProject(orgId, projectId);
    if (spine.state !== 'linked') {
      return res.json({
        success: true,
        data: [],
        artifactRegistry: { state: spine.state, detail: spine.detail },
      });
    }

    const { rows } = await pool.query(
      `SELECT id, artifact_id as "artifactId", title, ctd_section as "ctdSection",
              status, metadata, created_at as "createdAt"
       FROM concept2cure_artifacts
       WHERE organization_id = $1 AND project_id = $2
             AND category = 'source'
             AND (metadata->'dossierClassification'->>'feedsModule3')::text = 'true'
       ORDER BY created_at DESC`,
      [orgId, spine.artifactProjectId]
    );

    return res.json({
      success: true,
      artifactRegistry: { state: 'linked' },
      data: rows.map((r: any) => ({
        id: r.id,
        artifactId: r.artifactId,
        title: r.title,
        ctdSection: r.ctdSection,
        status: r.status,
        classification: r.metadata?.dossierClassification || null,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    if (String((error as Error)?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return res.status(500).json({
      success: false,
      error: ((error instanceof Error ? error.message : String(error)) || 'Failed to fetch uploaded sources'),
    });
  }
});

export default router;
export { SECTION_LABELS, ALL_SECTION_KEYS, deriveBuildState };
