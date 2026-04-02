/**
 * Version Diff API Routes
 *
 * Endpoints for listing document versions and computing diffs between them.
 * All endpoints enforce tenant isolation via organizationId.
 */
import { Router } from 'express';
import { authMiddleware } from '../auth';
import { listVersions, compareVersions } from '../services/versionDiffService';

const router = Router();

/**
 * Resolve the caller's organization ID from headers / auth context.
 * Mirrors the pattern used in cerv2-versions.ts.
 */
const resolveOrganizationId = (req: any): number | null => {
  const headerOrg = null; // org from JWT only
  const tenantOrg = req.tenantContext?.organizationId;
  const userOrg = req.user?.organizationId || req.tenantId;
  const raw = headerOrg || tenantOrg || userOrg;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

// -----------------------------------------------------------------------
// GET /api/documents/:id/versions
// List all versions of a document (tenant-isolated)
// -----------------------------------------------------------------------
router.get('/:id/versions', authMiddleware, async (req: any, res) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const versions = await listVersions(documentId, organizationId);
    return res.json({ versions, count: versions.length });
  } catch (error: any) {
    console.error('[VersionDiff] List versions error:', error);
    return res.status(500).json({ error: 'Failed to list versions', message: error.message });
  }
});

// -----------------------------------------------------------------------
// GET /api/documents/:id/diff?from=<versionA>&to=<versionB>
// Compute diff between two versions of a document (tenant-isolated)
// -----------------------------------------------------------------------
router.get('/:id/diff', authMiddleware, async (req: any, res) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const from = req.query.from as string;
    const to = req.query.to as string;

    if (!from || !to) {
      return res.status(400).json({
        error: 'Both "from" and "to" query parameters are required (version numbers)',
      });
    }

    const result = await compareVersions(documentId, from, to, organizationId);

    return res.json({
      documentId,
      from,
      to,
      additions: result.flat.additions,
      deletions: result.flat.deletions,
      changes: result.flat.changes,
      sections: result.sections,
    });
  } catch (error: any) {
    console.error('[VersionDiff] Diff error:', error);

    if (error.message?.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to compute diff', message: error.message });
  }
});

export default router;
