/**
 * IND Sections API Routes
 *
 * Serves the canonical IND CTD section map from ind-ectd-sections.ts,
 * enriched with live document status from concept2cure_artifacts.
 *
 * Endpoints:
 *   GET  /api/ind-sections               — Full section tree with live status
 *   GET  /api/ind-sections/flat           — Flat list of all sections
 *   GET  /api/ind-sections/:code          — Single section by eCTD code
 *   GET  /api/ind-sections/ai-draftable   — AI-draftable sections only
 *   GET  /api/ind-sections/progress       — Per-module progress summary
 *
 * @module server/routes/ind-sections
 */

import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { requireAuthedOrgId } from '../utils/authedOrgId.js';
import {
  buildINDPackageDefinition,
  getAllINDSections,
  getAIDraftableSections,
  getRequiredSections,
  getSectionByCode,
  getModuleProgress,
  type INDSection,
  type SectionStatus,
} from '../../services/regulatory/ind-ectd-sections.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

interface ArtifactRow {
  ctd_section: string;
  status: string;
  title: string;
  updated_at: string;
  artifact_id: string;
}

/**
 * Load live document statuses from concept2cure_artifacts for a project.
 * Returns a Map<sectionCode, { status, title, artifactId, updatedAt }[]>
 */
async function loadLiveStatuses(
  projectId: number,
  organizationId: number
): Promise<Map<string, ArtifactRow[]>> {
  const result = await pool.query(
    `SELECT ctd_section, status, title, updated_at, artifact_id
     FROM concept2cure_artifacts
     WHERE project_id = $1 AND organization_id = $2 AND ctd_section IS NOT NULL
     ORDER BY updated_at DESC`,
    [projectId, organizationId]
  );

  const map = new Map<string, ArtifactRow[]>();
  for (const row of result.rows) {
    const code = row.ctd_section;
    if (!map.has(code)) map.set(code, []);
    map.get(code)!.push(row);
  }
  return map;
}

/**
 * Map artifact status to SectionStatus for progress calculation.
 */
function artifactStatusToSectionStatus(artifactStatus: string): SectionStatus {
  const mapping: Record<string, SectionStatus> = {
    draft: 'drafting',
    in_progress: 'drafting',
    review: 'internal_review',
    approved: 'approved',
    locked: 'locked',
    published: 'approved',
    signed: 'signed',
  };
  return mapping[artifactStatus] || 'not_started';
}

/**
 * Enrich a section tree node with live document data.
 */
function enrichSection(
  section: INDSection,
  liveData: Map<string, ArtifactRow[]>
): INDSection & { liveStatus?: SectionStatus; documents?: ArtifactRow[] } {
  const docs = liveData.get(section.code);
  const enriched: any = { ...section };

  if (docs && docs.length > 0) {
    enriched.liveStatus = artifactStatusToSectionStatus(docs[0].status);
    enriched.documents = docs.map(d => ({
      artifactId: d.artifact_id,
      title: d.title,
      status: d.status,
      updatedAt: d.updated_at,
    }));
  } else {
    enriched.liveStatus = 'not_started';
    enriched.documents = [];
  }

  // Recurse into children
  if (section.children && section.children.length > 0) {
    enriched.children = section.children.map((child: INDSection) => enrichSection(child, liveData));
  }

  return enriched;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/ind-sections
 * Returns the full IND package definition with live document status.
 * Query params: ?project_id= (organization scope comes from the authed JWT).
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.query.project_id as string, 10) || 0;
    // Tenant scope from the authenticated JWT only. Sourcing it from
    // req.query.organization_id (which previously took precedence) let an
    // authed user read another org's IND section statuses via ?organization_id=.
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const organizationId = guard.orgId;

    const packageDef = buildINDPackageDefinition();

    if (projectId > 0) {
      const liveData = await loadLiveStatuses(projectId, organizationId);
      const enrichedModules = packageDef.modules.map(m => enrichSection(m, liveData));

      // Build status map for progress
      const statusMap = new Map<string, SectionStatus>();
      for (const [code, docs] of liveData.entries()) {
        if (docs.length > 0) {
          statusMap.set(code, artifactStatusToSectionStatus(docs[0].status));
        }
      }

      return res.json({
        ...packageDef,
        modules: enrichedModules,
        progress: getModuleProgress(statusMap),
        projectId,
        enriched: true,
      });
    }

    // No project — return static definition
    res.json({
      ...packageDef,
      progress: getModuleProgress(new Map()),
      enriched: false,
    });
  } catch (error: any) {
    console.error('[IND Sections] Error loading sections:', error.message);
    res.status(500).json({ error: 'Failed to load IND sections' });
  }
});

/**
 * GET /api/ind-sections/flat
 * Returns a flat array of all sections (no nesting).
 */
router.get('/flat', (_req: Request, res: Response) => {
  res.json({ sections: getAllINDSections() });
});

/**
 * GET /api/ind-sections/ai-draftable
 * Returns only sections that can be AI-drafted.
 */
router.get('/ai-draftable', (_req: Request, res: Response) => {
  res.json({ sections: getAIDraftableSections() });
});

/**
 * GET /api/ind-sections/required
 * Returns only sections required for initial IND filing.
 */
router.get('/required', (_req: Request, res: Response) => {
  res.json({ sections: getRequiredSections() });
});

/**
 * GET /api/ind-sections/progress
 * Returns per-module progress based on live artifact data.
 */
router.get('/progress', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.query.project_id as string, 10) || 0;
    // Tenant scope from the authenticated JWT only. Sourcing it from
    // req.query.organization_id (which previously took precedence) let an
    // authed user read another org's IND section statuses via ?organization_id=.
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const organizationId = guard.orgId;

    const statusMap = new Map<string, SectionStatus>();

    if (projectId > 0) {
      const liveData = await loadLiveStatuses(projectId, organizationId);
      for (const [code, docs] of liveData.entries()) {
        if (docs.length > 0) {
          statusMap.set(code, artifactStatusToSectionStatus(docs[0].status));
        }
      }
    }

    res.json({
      modules: getModuleProgress(statusMap),
      projectId,
    });
  } catch (error: any) {
    console.error('[IND Sections] Error loading progress:', error.message);
    res.status(500).json({ error: 'Failed to load progress' });
  }
});

/**
 * GET /api/ind-sections/:code
 * Returns a single section by its eCTD code (e.g., "m2.3.S.1").
 */
router.get('/:code', (req: Request, res: Response) => {
  const code = String(req.params.code);
  const section = getSectionByCode(code);
  if (!section) {
    return res.status(404).json({ error: `Section not found: ${code}` });
  }
  res.json({ section });
});

export default router;
