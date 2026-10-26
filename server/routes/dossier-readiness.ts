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
 *         approvedCount, lockedCount, unknownCount, lastUpdated }
 *     ],
 *     summary: { totalSections, readySections, inProgressSections, draftSections }
 *   }
 *
 * Tenant-scoped. No body, no AI. The shared c2c artifact reader also serves
 * the project's core dossier; these stages never replace its governed-section
 * figure. Unknown stages are unassessed and approved+locked stays approved.
 *
 * @module server/routes/dossier-readiness
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../db.js';
import { parseIntegerProjectId } from '../lib/project-id.js';
import { readDossierArtifactReadiness } from '../services/c2c/dossier-artifact-read.js';

const router = Router();

function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.tenantContext?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

router.get('/:projectId', async (req: Request, res: Response) => {
  const projectIdRaw = req.params.projectId;
  // Fail closed on a non-integer id. parseInt('7abb…') would have returned 7 —
  // a valid but WRONG projects.id in the same org (ADR-0011). A regulatory_programs
  // UUID must 400 here, never resolve to a prefix-truncated integer.
  const projectId = parseIntegerProjectId(projectIdRaw);
  if (projectId === null) {
    return res.status(400).json({
      error: 'projectId must be an integer project id',
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
    const readiness = await readDossierArtifactReadiness(pool, orgId, projectId);
    if (readiness.state === 'unavailable') {
      return res.status(503).json({ error: readiness.reason, code: 'ARTIFACT_SCHEMA_MISSING' });
    }
    if (readiness.state === 'unanchored') {
      return res.status(409).json({ error: readiness.reason, code: 'ARTIFACT_PROJECT_UNANCHORED' });
    }
    return res.json({ projectId, organizationId: orgId, sections: readiness.sections, summary: readiness.summary });
  } catch (err: any) {
    console.error('[dossier-readiness] query failed:', err?.message);
    res.status(500).json({
      error: 'Failed to compute dossier readiness',
      code: 'READINESS_QUERY_FAILED',
    });
  }
});

export default router;
