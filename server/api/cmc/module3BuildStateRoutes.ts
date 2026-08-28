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
import { getSectionLabels } from '../../services/module3-convergence-service';
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

export type Module3BuildState =
  | 'no_sources'
  | 'sources_uploaded'
  | 'extraction_pending'
  | 'extraction_complete'
  | 'compiled'
  | 'draft_artifact_created'
  | 'stale'
  | 'contradiction_flagged'
  | 'review'
  | 'approved'
  | 'locked';

function deriveBuildState(opts: {
  sourceObjectCount: number;
  uploadedSourceCount: number;
  hasCompiledSection: boolean;
  isStale: boolean;
  hasContradictions: boolean;
  approvalState: string | null;
  artifactStatus: string | null;
}): Module3BuildState {
  // Priority-ordered state derivation
  if (opts.artifactStatus === 'locked') return 'locked';
  if (opts.approvalState === 'approved' && !opts.isStale) return 'approved';
  if (opts.artifactStatus === 'review') return 'review';
  if (opts.isStale) return 'stale';
  if (opts.hasContradictions) return 'contradiction_flagged';
  if (opts.artifactStatus === 'draft' && opts.hasCompiledSection) return 'draft_artifact_created';
  if (opts.hasCompiledSection) return 'compiled';
  if (opts.sourceObjectCount > 0) return 'extraction_complete';
  if (opts.uploadedSourceCount > 0) return 'sources_uploaded';
  return 'no_sources';
}

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
    const pool = getPool();

    /* The CMC tables key project_id as TEXT (the shell passes the program
       uuid); concept2cure_artifacts keys the INTEGER projects.id. Querying the
       integer column with the raw uuid aborts the statement (22P02) and took
       this whole Promise.all — and the endpoint — down for every
       wizard-created program. Resolve the spine first; when it cannot be
       resolved, the artifact queries are skipped and the response says so. */
    const spine = await resolveCmcArtifactProject(orgId, projectId);
    const noArtifacts = Promise.resolve({ rows: [] as any[] });

    // Parallel queries for all data sources
    const [sourceObjectsRes, compiledSectionsRes, contradictionsRes, artifactsRes, uploadedSourcesRes] =
      await Promise.all([
        // 1. Source objects grouped by source type
        pool.query(
          `SELECT source_type as "sourceType", COUNT(*) as count
           FROM cmc_source_objects
           WHERE organization_id = $1 AND project_id = $2
           GROUP BY source_type`,
          [orgId, projectId]
        ),
        // 2. Compiled sections
        pool.query(
          `SELECT section_key as "sectionKey",
                  deterministic_json as "deterministicJson",
                  narrative_text as "narrativeText",
                  stale, stale_reason as "staleReason",
                  approval_state as "approvalState",
                  updated_at as "updatedAt"
           FROM cmc_module3_sections
           WHERE organization_id = $1 AND project_id = $2`,
          [orgId, projectId]
        ),
        // 3. Open contradictions
        pool.query(
          `SELECT impacted_sections as "impactedSections", severity, status
           FROM cmc_contradictions
           WHERE organization_id = $1 AND project_id = $2 AND status <> 'resolved'`,
          [orgId, projectId]
        ),
        // 4. Governed artifacts placed in Module 3 sections
        spine.state === 'linked'
          ? pool.query(
              `SELECT id, artifact_id as "artifactId", ctd_section as "ctdSection",
                      status, title, updated_at as "updatedAt"
               FROM concept2cure_artifacts
               WHERE organization_id = $1 AND project_id = $2
                     AND (ctd_section LIKE '3.2.%' OR ctd_section IN ('3.1', '3.3'))`,
              [orgId, spine.artifactProjectId]
            )
          : noArtifacts,
        // 5. Uploaded source documents classified for Module 3
        spine.state === 'linked'
          ? pool.query(
              `SELECT id, artifact_id as "artifactId", ctd_section as "ctdSection",
                      metadata, title
               FROM concept2cure_artifacts
               WHERE organization_id = $1 AND project_id = $2
                     AND category = 'source'
                     AND (metadata->>'dossierClassification' IS NOT NULL)
                     AND (metadata->'dossierClassification'->>'feedsModule3')::text = 'true'`,
              [orgId, spine.artifactProjectId]
            )
          : noArtifacts,
      ]);

    // Build lookup maps
    const sourceTypeCounts = new Map<string, number>();
    for (const row of sourceObjectsRes.rows) {
      sourceTypeCounts.set(row.sourceType, parseInt(row.count, 10));
    }

    const compiledMap = new Map<string, any>();
    for (const row of compiledSectionsRes.rows) {
      compiledMap.set(row.sectionKey, row);
    }

    // Count contradictions per section
    const contradictionCounts = new Map<string, number>();
    for (const row of contradictionsRes.rows) {
      const sections = Array.isArray(row.impactedSections) ? row.impactedSections : [];
      for (const s of sections) {
        contradictionCounts.set(s, (contradictionCounts.get(s) || 0) + 1);
      }
    }

    // Governed artifacts per section
    const artifactMap = new Map<string, any>();
    for (const row of artifactsRes.rows) {
      if (row.ctdSection) {
        artifactMap.set(row.ctdSection, row);
      }
    }

    // Uploaded sources per section
    const uploadedSourceMap = new Map<string, number>();
    for (const row of uploadedSourcesRes.rows) {
      const cls = row.metadata?.dossierClassification;
      const section = cls?.ctdSection || row.ctdSection;
      if (section) {
        uploadedSourceMap.set(section, (uploadedSourceMap.get(section) || 0) + 1);
      }
    }

    // Assemble build status for every section (SECTION_SOURCE_TYPES is the
    // composer's own rules, imported at module scope — see the note up top)
    const sections = ALL_SECTION_KEYS.map((sectionKey) => {
      const compiled = compiledMap.get(sectionKey);
      const artifact = artifactMap.get(sectionKey);
      const requiredSourceTypes = SECTION_SOURCE_TYPES[sectionKey] || [];
      const sourceObjectCount = requiredSourceTypes.reduce(
        (sum, st) => sum + (sourceTypeCounts.get(st) || 0),
        0
      );
      const uploadedSourceCount = uploadedSourceMap.get(sectionKey) || 0;
      const contradictionCount = contradictionCounts.get(sectionKey) || 0;
      const isStale = compiled?.stale === true;
      const approvalState = compiled?.approvalState || null;

      // Completeness from compiled deterministic JSON
      const deterministicJson = compiled?.deterministicJson;
      const completeness = deterministicJson?.completeness ?? (compiled ? 100 : 0);
      const missingInputs = deterministicJson?.missingInputs ?? [];

      const buildState = deriveBuildState({
        sourceObjectCount,
        uploadedSourceCount,
        hasCompiledSection: !!compiled,
        isStale,
        hasContradictions: contradictionCount > 0,
        approvalState,
        artifactStatus: artifact?.status || null,
      });

      return {
        sectionKey,
        sectionLabel: SECTION_LABELS[sectionKey],
        buildState,
        sourceObjectCount,
        uploadedSourceCount,
        sourceTypes: requiredSourceTypes,
        completeness,
        missingInputs,
        hasContradictions: contradictionCount > 0,
        contradictionCount,
        isStale,
        staleReason: compiled?.staleReason || null,
        approvalState: approvalState || 'not_started',
        hasNarrative: !!compiled?.narrativeText,
        artifactId: artifact?.artifactId || null,
        artifactStatus: artifact?.status || null,
        lastCompiled: compiled?.updatedAt || null,
        lastUpdated: artifact?.updatedAt || compiled?.updatedAt || null,
      };
    });

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
        artifactRegistry:
          spine.state === 'linked'
            ? { state: 'linked' }
            : { state: spine.state, detail: spine.detail },
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
