import { Router } from 'express';
import { db } from '../db';
import { organizations, clientWorkspaces, cerProjects, projectDocuments } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

// Create a new router for organization endpoints
const router = Router();

/**
 * Validate that the requesting user belongs to the organization in :id param.
 * Returns 403 if the user's org doesn't match.
 */
function validateOrgOwnership(req: any, res: any, next: any) {
  const paramId = parseInt(req.params.id, 10);
  const userOrgId = req.user?.organizationId;
  const userRole = req.user?.role || req.userRole;

  // Platform admins can access any org
  if (userRole === 'platform_admin' || userRole === 'superadmin') {
    return next();
  }

  if (!userOrgId || userOrgId !== paramId) {
    return res.status(403).json({
      success: false,
      error: 'Not authorized to access this organization',
    });
  }
  next();
}

/**
 * Get all organizations
 * API: GET /api/organizations
 */
router.get('/', async (req, res) => {
  try {
    const userRole = req.user?.role || req.userRole;
    const userOrgId = req.user?.organizationId;

    const rows =
      userRole === 'platform_admin' || userRole === 'superadmin'
        ? await db.select().from(organizations)
        : userOrgId
          ? await db.select().from(organizations).where(eq(organizations.id, Number(userOrgId)))
          : [];

    const organizationsPayload = rows.map(org => ({
      id: String(org.id),
      name: org.name,
      logo: org.logo,
      subscriptionTier: org.tier,
      maxUsers: org.maxUsers,
      activeUsers: null, // active user count is provided by tenant stats endpoint
      createdAt: org.createdAt?.toISOString() ?? null,
    }));

    res.json({
      success: true,
      organizations: organizationsPayload,
    });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch organizations',
    });
  }
});

/**
 * Get organization details
 * API: GET /api/organizations/:id
 */
router.get('/:id', validateOrgOwnership, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [organizationData] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);

    if (!organizationData) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found',
      });
    }

    res.json({
      success: true,
      organization: {
        id: String(organizationData.id),
        name: organizationData.name,
        logo: organizationData.logo,
        subscriptionTier: organizationData.tier,
        maxUsers: organizationData.maxUsers,
        activeUsers: null,
        createdAt: organizationData.createdAt?.toISOString() ?? null,
        billingCycle: organizationData.billingCycle,
        domain: organizationData.domain,
        status: organizationData.status,
      },
    });
  } catch (error) {
    console.error(`Error fetching organization ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch organization details',
    });
  }
});

/**
 * Get clients for an organization
 * API: GET /api/organizations/:id/clients
 */
router.get('/:id/clients', validateOrgOwnership, async (req, res) => {
  try {
    const organizationId = parseInt(req.params.id, 10);

    const workspaces = await db
      .select()
      .from(clientWorkspaces)
      .where(eq(clientWorkspaces.organizationId, organizationId));

    const clients = await Promise.all(
      workspaces.map(async workspace => {
        const [projectsAgg] = await db
          .select({
            count: sql<number>`count(*)`,
            lastActivity: sql<Date | null>`max(${cerProjects.updatedAt})`,
          })
          .from(cerProjects)
          .where(
            and(
              eq(cerProjects.organizationId, organizationId),
              eq(cerProjects.clientWorkspaceId, workspace.id)
            )
          );

        const [docsAgg] = await db
          .select({
            bytes: sql<number>`coalesce(sum(${projectDocuments.fileSize}), 0)`,
          })
          .from(projectDocuments)
          .innerJoin(cerProjects, eq(projectDocuments.projectId, cerProjects.id))
          .where(
            and(
              eq(projectDocuments.organizationId, organizationId),
              eq(cerProjects.clientWorkspaceId, workspace.id)
            )
          );

        const bytes = Number(docsAgg?.bytes ?? 0);
        const storageUsedGB = Number((bytes / (1024 * 1024 * 1024)).toFixed(2));

        return {
          id: String(workspace.id),
          name: workspace.name,
          organizationId: String(workspace.organizationId),
          logo: workspace.logo,
          activeProjects: Number(projectsAgg?.count ?? 0),
          quotaProjects: workspace.quotaProjects ?? 0,
          storageUsedGB,
          quotaStorageGB: workspace.quotaStorage ?? 0,
          lastActivity:
            projectsAgg?.lastActivity instanceof Date
              ? projectsAgg.lastActivity.toISOString()
              : workspace.updatedAt?.toISOString() ?? workspace.createdAt?.toISOString() ?? null,
        };
      })
    );

    res.json({
      success: true,
      clients,
    });
  } catch (error) {
    console.error(`Error fetching clients for organization ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch client workspaces',
    });
  }
});

/**
 * Get organization settings
 * API: GET /api/organizations/:id/settings
 */
router.get('/:id/settings', validateOrgOwnership, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Fetching settings for organization ${id}`);

    // Fetch organization from database
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, parseInt(id)));

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found',
      });
    }

    // Default settings if none exist
    const defaultSettings = {
      general: {
        organizationName: organization.name,
        timezone: 'UTC',
        dateFormat: 'MM/DD/YYYY',
        language: 'en',
      },
      security: {
        mfaEnabled: true,
        passwordPolicy: {
          minLength: 12,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: true,
          historyCount: 5,
        },
        sessionTimeout: 30,
        ipWhitelist: [],
      },
      notifications: {
        emailEnabled: true,
        smsEnabled: false,
        documentApprovals: true,
        systemMaintenance: true,
        securityAlerts: true,
        weeklyReports: false,
      },
      integrations: {
        microsoftOffice: {
          enabled: false,
          tenantId: '',
          clientId: '',
        },
        docusign: {
          enabled: false,
          apiKey: '',
        },
        slack: {
          enabled: false,
          webhookUrl: '',
        },
      },
      appearance: {
        theme: 'light',
        primaryColor: '#c15f3c',
        logoUrl: '',
        customCss: '',
      },
      advanced: {
        auditLogging: true,
        backupFrequency: 'daily',
        dataRetention: 365,
        apiRateLimit: 1000,
      },
    };

    // Merge saved settings with defaults
    const settings = organization.settings
      ? { ...defaultSettings, ...organization.settings }
      : defaultSettings;

    res.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error('Error fetching organization settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch organization settings',
    });
  }
});

/**
 * Update organization settings
 * API: PATCH /api/organizations/:id/settings
 */
router.patch('/:id/settings', validateOrgOwnership, async (req, res) => {
  try {
    const { id } = req.params;
    const settingsUpdate = req.body;

    console.log(`Updating settings for organization ${id}:`, settingsUpdate);

    // Fetch current organization
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, parseInt(id)));

    if (!organization) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found',
      });
    }

    // Merge new settings with existing settings
    const currentSettings = organization.settings || {};
    const updatedSettings = { ...currentSettings, ...settingsUpdate };

    // Update organization settings in database
    await db
      .update(organizations)
      .set({
        settings: updatedSettings,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, parseInt(id)));

    res.json({
      success: true,
      message: 'Organization settings updated successfully',
      settings: settingsUpdate,
    });
  } catch (error) {
    console.error('Error updating organization settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update organization settings',
    });
  }
});

export default router;
