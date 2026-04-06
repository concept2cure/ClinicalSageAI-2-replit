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

const router = express.Router();

// ── Section Labels ────────────────────────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  '3.1': 'Quality — Table of Contents',
  '3.2.S.1': 'General Information',
  '3.2.S.2': 'Manufacture (Drug Substance)',
  '3.2.S.3': 'Characterisation',
  '3.2.S.4': 'Control of Drug Substance',
  '3.2.S.5': 'Reference Standards (Drug Substance)',
  '3.2.S.6': 'Container Closure System (Drug Substance)',
  '3.2.S.7': 'Stability (Drug Substance)',
  '3.2.P.1': 'Description & Composition',
  '3.2.P.2': 'Pharmaceutical Development',
  '3.2.P.3': 'Manufacture (Drug Product)',
  '3.2.P.4': 'Control of Excipients',
  '3.2.P.5': 'Control of Drug Product',
  '3.2.P.6': 'Reference Standards (Drug Product)',
  '3.2.P.7': 'Container Closure System (Drug Product)',
  '3.2.P.8': 'Stability (Drug Product)',
  '3.3': 'Literature References',
};

const ALL_SECTION_KEYS = Object.keys(SECTION_LABELS);

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
    String(
      (req as any).tenantId ||
        (req as any).tenantContext?.organizationId ||
        req.headers['x-organization-id'] ||
        0
    ),
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
        pool.query(
          `SELECT id, artifact_id as "artifactId", ctd_section as "ctdSection",
                  status, title, updated_at as "updatedAt"
           FROM concept2cure_artifacts
           WHERE organization_id = $1 AND project_id = $2
                 AND (ctd_section LIKE '3.2.%' OR ctd_section IN ('3.1', '3.3'))`,
          [orgId, projectId]
        ),
        // 5. Uploaded source documents classified for Module 3
        pool.query(
          `SELECT id, artifact_id as "artifactId", ctd_section as "ctdSection",
                  metadata, title
           FROM concept2cure_artifacts
           WHERE organization_id = $1 AND project_id = $2
                 AND category = 'source'
                 AND (metadata->>'dossierClassification' IS NOT NULL)
                 AND (metadata->'dossierClassification'->>'feedsModule3')::text = 'true'`,
          [orgId, projectId]
        ),
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

    // Section-to-source-type mapping (must match the composer's rules)
    const SECTION_SOURCE_TYPES: Record<string, string[]> = {
      '3.2.S.1': ['drug_substance'],
      '3.2.S.2': ['drug_substance', 'manufacturing_process'],
      '3.2.S.3': ['drug_substance', 'characterization'],
      '3.2.S.4': ['specification', 'method'],
      '3.2.S.5': ['drug_substance', 'reference_standard'],
      '3.2.S.6': ['container_closure'],
      '3.2.S.7': ['stability'],
      '3.2.P.1': ['drug_product'],
      '3.2.P.2': ['drug_product', 'drug_substance', 'comparability'],
      '3.2.P.3': ['drug_product', 'batch', 'change_control'],
      '3.2.P.4': ['excipient'],
      '3.2.P.5': ['specification', 'method'],
      '3.2.P.6': ['drug_product', 'reference_standard'],
      '3.2.P.7': ['container_closure'],
      '3.2.P.8': ['stability', 'comparability'],
    };

    // Assemble build status for every section
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

    // Summary stats
    const totalSections = sections.length;
    const readySections = sections.filter(
      (s) => s.buildState === 'approved' || s.buildState === 'locked'
    ).length;
    const staleSections = sections.filter((s) => s.buildState === 'stale').length;
    const blockedSections = sections.filter(
      (s) => s.buildState === 'contradiction_flagged'
    ).length;
    const buildableSections = sections.filter(
      (s) =>
        s.sourceObjectCount > 0 &&
        s.buildState !== 'approved' &&
        s.buildState !== 'locked'
    ).length;

    return res.json({
      success: true,
      data: {
        sections,
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

    const { rows } = await pool.query(
      `SELECT id, artifact_id as "artifactId", title, ctd_section as "ctdSection",
              status, metadata, created_at as "createdAt"
       FROM concept2cure_artifacts
       WHERE organization_id = $1 AND project_id = $2
             AND category = 'source'
             AND (metadata->'dossierClassification'->>'feedsModule3')::text = 'true'
       ORDER BY created_at DESC`,
      [orgId, projectId]
    );

    return res.json({
      success: true,
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
