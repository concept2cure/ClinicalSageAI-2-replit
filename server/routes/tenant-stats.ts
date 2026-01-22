/**
 * Tenant Statistics API Routes
 *
 * Provides organization usage statistics and metrics
 */
import { Router } from 'express';
import { eq, and, count } from 'drizzle-orm';
import {
  organizations,
  organizationUsers,
  users,
  cerProjects,
  projectDocuments,
} from '../../shared/schema';
import { checkAuth } from '../controllers/auth.js';
import { createScopedLogger } from '../utils/logger';
import { db } from '../db';

const logger = createScopedLogger('tenant-stats-api');
const router = Router();

const hasOrganizationAccess = (req: any, organizationId: number) => {
  const tokenOrgId = Number(req.organizationId || req.user?.organizationId);
  if (tokenOrgId && tokenOrgId === organizationId) {
    return true;
  }

  const orgs = req.user?.organizations;
  return Array.isArray(orgs) && orgs.some((org: any) => Number(org.id) === organizationId);
};

const requireOrganizationAccess = (req: any, res: any, next: any) => {
  const organizationId = parseInt(req.params.id, 10);
  if (Number.isNaN(organizationId)) {
    return res.status(400).json({ error: 'Invalid tenant ID' });
  }

  if (!hasOrganizationAccess(req, organizationId)) {
    return res.status(403).json({ error: 'Access denied to this tenant' });
  }

  return next();
};

// Apply auth middleware to all tenant routes
router.use(checkAuth);

/**
 * GET /api/tenant-stats/:id
 * Get usage statistics for a specific tenant
 */
router.get('/:id', requireOrganizationAccess, async (req, res) => {
  const tenantId = parseInt(req.params.id);

  try {
    // For development, return mock data
    if (process.env.NODE_ENV === 'development') {

    const handleTenantStats = async (tenantId: number, req: any, res: any) => {
      try {
        // For development, return mock data
        if (process.env.NODE_ENV === 'development') {
          return res.json({
            userCount: 4,
            projectCount: 8,
            storageUsed: 3548, // in MB
            activeUsers: 3,
            recentProjects: [
              {
                id: 101,
                name: 'FDA 510(k) Device Submission',
                createdAt: '2025-04-18T10:30:00Z',
                lastActivity: '2025-05-08T14:25:10Z',
                docsCount: 12,
              },
              {
                id: 102,
                name: 'CE Mark Technical Documentation',
                createdAt: '2025-04-22T09:15:00Z',
                lastActivity: '2025-05-09T11:10:22Z',
                docsCount: 8,
              },
              {
                id: 103,
                name: 'Post-Market Surveillance Report',
                createdAt: '2025-05-01T13:45:00Z',
                lastActivity: '2025-05-07T16:30:05Z',
                docsCount: 5,
              },
            ],
            quotaInfo: {
              users: { used: 4, total: 10, percentage: 40 },
              projects: { used: 8, total: 20, percentage: 40 },
              storage: { used: 3.5, total: 50, percentage: 7 }, // GB
            },
          });
        }

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

        // Count projects in the tenant
        const projectCountResult = await db
          .select({ count: count() })
          .from(cerProjects)
          .where(eq(cerProjects.organizationId, tenantId));

        const projectCount = projectCountResult[0]?.count || 0;

        // Count document storage
        const storageResult = await db
          .select({ count: count() })
          .from(projectDocuments)
          .where(eq(projectDocuments.organizationId, tenantId));

        const storageUsed = storageResult[0]?.count || 0;

        res.json({
          userCount,
          projectCount,
          storageUsed,
          activeUsers: userCount,
          recentProjects: [],
          quotaInfo: {
            users: { used: userCount, total: tenant.maxUsers || 0, percentage: 0 },
            projects: { used: projectCount, total: tenant.maxProjects || 0, percentage: 0 },
            storage: { used: storageUsed, total: tenant.maxStorage || 0, percentage: 0 },
          },
        });
      } catch (error) {
        logger.error('Error retrieving tenant stats', error);
        return res.status(500).json({ error: 'Failed to retrieve tenant statistics' });
      }
    };

    /**
     * GET /api/tenant-stats?organizationId=1
     * Compatibility endpoint for query-based organization ID
     */
    router.get('/', async (req, res) => {
      const organizationIdParam = req.query.organizationId || req.headers['x-organization-id'];
      if (!organizationIdParam) {
        return res.status(400).json({
          success: false,
          error: 'Missing organizationId',
        });
      }

      const tenantId = parseInt(organizationIdParam as string, 10);
      if (Number.isNaN(tenantId)) {
        return res.status(400).json({ error: 'Invalid tenant ID' });
      }

      if (!hasOrganizationAccess(req, tenantId)) {
        return res.status(403).json({ error: 'Access denied to this tenant' });
      }

      return handleTenantStats(tenantId, req, res);
    });
      return res.json({
        userCount: 4,
        projectCount: 8,
        storageUsed: 3548, // in MB
        activeUsers: 3,
        recentProjects: [
      const tenantId = parseInt(req.params.id, 10);
      return handleTenantStats(tenantId, req, res);
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

    // Format recent projects
    const formattedProjects = await Promise.all(
      recentProjects.map(async project => {
        // Count documents for this project
        const docsCountResult = await db
          .select({ count: count() })
          .from(projectDocuments)
          .where(
            and(
              eq(projectDocuments.organizationId, tenantId),
              eq(projectDocuments.projectId, project.id)
            )
          );

        return {
          id: project.id,
          name: project.name,
          createdAt: project.createdAt?.toISOString(),
          // In a real system, you would track and return lastActivity date
          lastActivity: project.createdAt?.toISOString(), // Using createdAt as placeholder
          docsCount: docsCountResult[0]?.count || 0,
        };
      })
    );

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
