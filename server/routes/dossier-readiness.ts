/**
 * Dossier Section Readiness — Doc System Convergence Phase 5.
 *
 * The legacy dossier rail used hardcoded section-status values. This endpoint
 * derives readiness from live `concept2cure_artifacts` rows so the dossier
 * pane reflects what the user has actually built.
 *
 * Surface:
 *   GET /api/dossier-readiness/:projectId
 *
 * Response:
 *   {
 *     projectId, organizationId,
 *     sections: [
 *       { ctdSection, status, artifactCount, draftCount, reviewCount,
 *         approvedCount, lockedCount, lastUpdated }
 *     ],
 *     summary: { totalSections, readySections, inProgressSections, draftSections }
 *   }
 *
 * Tenant-scoped. No body, no AI. Pure read.
 *
 * @module server/routes/dossier-readiness
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../db.js';

const router = Router();

function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.tenantContext?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

type ArtifactStatus = 'draft' | 'review' | 'approved' | 'locked';

const STATUS_RANK: Record<ArtifactStatus, number> = {
  draft: 0,
  review: 1,
  approved: 2,
  locked: 3,
};

/**
 * Section roll-up rule: a section is as ready as its weakest artifact.
 * If any artifact is still in `draft`, the section is `draft`. Only when
 * every artifact has been promoted does the section advance.
 */
function rollupSectionStatus(counts: {
  draft: number;
  review: number;
  approved: number;
  locked: number;
}): ArtifactStatus {
  if (counts.draft > 0) return 'draft';
  if (counts.review > 0) return 'review';
  if (counts.approved > 0 && counts.locked === 0) return 'approved';
  return 'locked';
}

router.get('/:projectId', async (req: Request, res: Response) => {
  const projectIdRaw = req.params.projectId;
  const projectId = parseInt(String(projectIdRaw).replace(/^proj_/, ''), 10);
  if (!Number.isFinite(projectId)) {
    return res.status(400).json({
      error: 'projectId must be numeric',
      code: 'INVALID_PROJECT_ID',
    });
  }
  const orgId = resolveOrgId(req);
  if (!orgId) {
    return res.status(401).json({
      error: 'Organization context required',
      code: 'ORG_CONTEXT_REQUIRED',
    });
  }

  try {
    // Aggregate by ctd_section. Artifacts without a ctd_section are excluded
    // from per-section rollups (they can't be assigned a dossier slot).
    const result = await pool.query(
      `SELECT
         COALESCE(ctd_section, '') AS ctd_section,
         status,
         COUNT(*)::int AS count,
         MAX(updated_at) AS last_updated
       FROM concept2cure_artifacts
       WHERE project_id = $1
         AND organization_id = $2
         AND ctd_section IS NOT NULL
         AND ctd_section <> ''
       GROUP BY ctd_section, status`,
      [projectId, orgId]
    );

    const bySection = new Map<
      string,
      {
        ctdSection: string;
        counts: { draft: number; review: number; approved: number; locked: number };
        artifactCount: number;
        lastUpdated: Date | null;
      }
    >();

    for (const row of result.rows) {
      const section = row.ctd_section as string;
      if (!bySection.has(section)) {
        bySection.set(section, {
          ctdSection: section,
          counts: { draft: 0, review: 0, approved: 0, locked: 0 },
          artifactCount: 0,
          lastUpdated: null,
        });
      }
      const entry = bySection.get(section)!;
      const statusKey = (row.status as string) as ArtifactStatus;
      if (statusKey in entry.counts) {
        entry.counts[statusKey] += row.count;
      }
      entry.artifactCount += row.count;
      if (row.last_updated && (!entry.lastUpdated || row.last_updated > entry.lastUpdated)) {
        entry.lastUpdated = row.last_updated;
      }
    }

    const sections = Array.from(bySection.values())
      .map(entry => ({
        ctdSection: entry.ctdSection,
        status: rollupSectionStatus(entry.counts),
        artifactCount: entry.artifactCount,
        draftCount: entry.counts.draft,
        reviewCount: entry.counts.review,
        approvedCount: entry.counts.approved,
        lockedCount: entry.counts.locked,
        lastUpdated: entry.lastUpdated?.toISOString?.() ?? null,
      }))
      .sort((a, b) => a.ctdSection.localeCompare(b.ctdSection));

    const summary = {
      totalSections: sections.length,
      readySections: sections.filter(s => STATUS_RANK[s.status] >= STATUS_RANK.approved).length,
      inProgressSections: sections.filter(s => s.status === 'review').length,
      draftSections: sections.filter(s => s.status === 'draft').length,
    };

    res.json({ projectId, organizationId: orgId, sections, summary });
  } catch (err: any) {
    if (err?.code === '42P01') {
      // concept2cure_artifacts table missing — caller should know it's a
      // schema state, not a real failure.
      return res.status(503).json({
        error: 'Artifact schema not present',
        code: 'ARTIFACT_SCHEMA_MISSING',
      });
    }
    console.error('[dossier-readiness] query failed:', err?.message);
    res.status(500).json({
      error: 'Failed to compute dossier readiness',
      code: 'READINESS_QUERY_FAILED',
    });
  }
});

export default router;
