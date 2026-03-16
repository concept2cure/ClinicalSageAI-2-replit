/**
 * CERV2 Versions Routes
 * Version history & section change tracking backed by cerv2_section_versions table
 */
import { Router } from 'express';
import { desc, eq, and } from 'drizzle-orm';
import { cerv2SectionVersions, cerv2510kSections } from '../../shared/schema';
import { authMiddleware } from '../auth';
import { db } from '../db';

const router = Router();

const resolveOrganizationId = (req: any) => {
  const headerOrg = req.header('x-organization-id') || req.header('x-org-id');
  const tenantOrg = req.tenantContext?.organizationId;
  const userOrg = req.user?.organizationId || req.tenantId;
  const raw = headerOrg || tenantOrg || userOrg;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * GET / — List recent version entries across all sections for the organization
 */
router.get('/', authMiddleware, async (req: any, res) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const sectionId = req.query.sectionId ? Number(req.query.sectionId) : undefined;

    const conditions = [eq(cerv2SectionVersions.organizationId, organizationId)];
    if (sectionId) {
      conditions.push(eq(cerv2SectionVersions.sectionId, sectionId));
    }

    const versions = await db
      .select()
      .from(cerv2SectionVersions)
      .where(and(...conditions))
      .orderBy(desc(cerv2SectionVersions.createdAt))
      .limit(limit);

    return res.json({ versions, count: versions.length });
  } catch (error: any) {
    console.error('[CERV2 Versions] List error:', error);
    return res.status(500).json({ error: 'Failed to fetch versions', message: error.message });
  }
});

/**
 * GET /:versionId — Get a specific version entry
 */
router.get('/:versionId', authMiddleware, async (req: any, res) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const versionId = Number(req.params.versionId);
    if (!Number.isFinite(versionId)) {
      return res.status(400).json({ error: 'Invalid version ID' });
    }

    const [version] = await db
      .select()
      .from(cerv2SectionVersions)
      .where(
        and(
          eq(cerv2SectionVersions.id, versionId),
          eq(cerv2SectionVersions.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    return res.json({ version });
  } catch (error: any) {
    console.error('[CERV2 Versions] Get error:', error);
    return res.status(500).json({ error: 'Failed to fetch version', message: error.message });
  }
});

/**
 * GET /section/:sectionId/history — Full version history for a specific section
 */
router.get('/section/:sectionId/history', authMiddleware, async (req: any, res) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const sectionId = Number(req.params.sectionId);
    if (!Number.isFinite(sectionId)) {
      return res.status(400).json({ error: 'Invalid section ID' });
    }

    const versions = await db
      .select()
      .from(cerv2SectionVersions)
      .where(
        and(
          eq(cerv2SectionVersions.sectionId, sectionId),
          eq(cerv2SectionVersions.organizationId, organizationId)
        )
      )
      .orderBy(desc(cerv2SectionVersions.createdAt))
      .limit(100);

    return res.json({ versions, count: versions.length, sectionId });
  } catch (error: any) {
    console.error('[CERV2 Versions] Section history error:', error);
    return res.status(500).json({ error: 'Failed to fetch section history', message: error.message });
  }
});

export default router;
