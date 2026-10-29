/**
 * Tenant Statistics API Routes
 *
 * Provides organization usage statistics and metrics
 */
import { Router } from 'express';
import { eq, and, count, desc, ne } from 'drizzle-orm';
import {
  organizations,
  organizationUsers,
  projects,
  projectDocuments,
} from '../../shared/schema';
import { authMiddleware } from '../auth';
import {
  validateTenantAccessMiddleware,
} from '../middleware/tenantContext';
import { createScopedLogger } from '../utils/logger';
import { db } from '../db';

const logger = createScopedLogger('tenant-stats-api');
const router = Router();

// Apply auth middleware to all tenant routes
router.use(authMiddleware);

/**
 * GET /api/tenant-stats/:id
 * Get usage statistics for a specific tenant
 */
router.get('/:id', validateTenantAccessMiddleware, async (req, res) => {
  const tenantId = parseInt(String(req.params.id));

  try {
    // Fetch tenant details to get plan limits
    const tenantDetails = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, tenantId))
      .limit(1);

    if (!tenantDetails.length) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const tenant = tenantDetails[0];

    // Count users in the tenant
    const userCountResult = await db
      .select({ count: count() })
      .from(organizationUsers)
      .where(eq(organizationUsers.organizationId, tenantId));

    const userCount = userCountResult[0]?.count || 0;

    // Count projects in the tenant. `projects` is the store the canonical
    // creator (POST /api/c2c/projects → program-project-anchor) writes, counted
    // as client-journey counts it: archived projects excluded. This read
    // `cer_projects` until 2026-10-29; fb73f05f8 retired the last writer there,
    // so it answered 0 projects for every tenant (ci:writerless-stores).
    const liveProjects = and(
      eq(projects.organizationId, tenantId),
      ne(projects.status, 'archived')
    );
    const projectCountResult = await db
      .select({ count: count() })
      .from(projects)
      .where(liveProjects);

    const projectCount = projectCountResult[0]?.count || 0;

    // Calculate storage used
    // This is a simplified calculation - in a real system, you would sum the file sizes
    const storageResult = await db
      .select({
        count: count(),
        // You would typically sum file sizes here
      })
      .from(projectDocuments)
      .where(eq(projectDocuments.organizationId, tenantId));

    // Assuming average file size of 5MB for this example
    const avgFileSizeMB = 5;
    const documentCount = storageResult[0]?.count || 0;
    const storageUsedMB = documentCount * avgFileSizeMB;

    // Get recent projects
    const recentProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(liveProjects)
      .orderBy(desc(projects.createdAt))
      .limit(5);

    // Calculate quota percentages
    const maxUsers = tenant.maxUsers || 5; // Default if not specified
    const maxProjects = tenant.maxProjects || 10; // Default if not specified
    const maxStorageGB = tenant.maxStorage || 5; // Default if not specified
    const storageUsedGB = storageUsedMB / 1024;

    const quotaInfo = {
      users: {
        used: userCount,
        total: maxUsers,
        percentage: Math.round((userCount / maxUsers) * 100),
      },
      projects: {
        used: projectCount,
        total: maxProjects,
        percentage: Math.round((projectCount / maxProjects) * 100),
      },
      storage: {
        used: Number(storageUsedGB.toFixed(2)),
        total: maxStorageGB,
        percentage: Math.round((storageUsedGB / maxStorageGB) * 100),
      },
    };

    // Format recent projects. No per-project document count: project_documents
    // .project_id references cer_projects, not projects, so matching it against
    // a project id would count another project's documents.
    const formattedProjects = recentProjects.map(project => ({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt?.toISOString(),
      lastActivity: project.updatedAt?.toISOString() ?? null,
    }));

    res.json({
      userCount,
      projectCount,
      storageUsed: storageUsedMB,
      activeUsers: userCount, // In a real system, you would count users active in last 30 days
      recentProjects: formattedProjects,
      quotaInfo,
    });
  } catch (error) {
    logger.error('Error retrieving tenant statistics', error);
    res.status(500).json({ error: 'Failed to retrieve tenant statistics' });
  }
});

export default router;
