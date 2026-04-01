import { Router } from 'express';
import { db } from '../db';
import { clientWorkspaces, organizations, projects } from '@shared/schema';
import { count, eq } from 'drizzle-orm';
import { authMiddleware } from '../auth';

// Create a new router for organization endpoints
const router = Router();
router.use(authMiddleware);

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
router.get('/', async (req: any, res) => {
  try {
    const userRole = req.user?.role || req.userRole;
    const userOrgId = req.user?.organizationId ? Number(req.user.organizationId) : null;
    const rows =
      userRole === 'platform_admin' || userRole === 'superadmin'
        ? await db.select().from(organizations)
        : userOrgId
          ? await db.select().from(organizations).where(eq(organizations.id, userOrgId))
          : [];

    res.json({
      success: true,
      organizations: rows.map(org => ({
        id: String(org.id),
        name: org.name,
        logo: org.logo || '/logos/default.png',
        createdAt: org.createdAt,
      })),
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
    const { id } = req.params;
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, Number(id)));

    if (!organization) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }

    res.json({
      success: true,
      organization: {
        id: String(organization.id),
        name: organization.name,
        logo: organization.logo || '/logos/default.png',
        settings: organization.settings || {},
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt,
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
    const { id } = req.params;
    const orgId = Number(id);
    const workspaces = await db
      .select({
        id: clientWorkspaces.id,
        name: clientWorkspaces.name,
        organizationId: clientWorkspaces.organizationId,
        logo: clientWorkspaces.logo,
        quotaProjects: clientWorkspaces.quotaProjects,
        quotaStorageGB: clientWorkspaces.quotaStorage,
        updatedAt: clientWorkspaces.updatedAt,
      })
      .from(clientWorkspaces)
      .where(eq(clientWorkspaces.organizationId, orgId));

    const projectCounts = await db
      .select({
        workspaceId: projects.clientWorkspaceId,
        projectCount: count(projects.id),
      })
      .from(projects)
      .where(eq(projects.organizationId, orgId))
      .groupBy(projects.clientWorkspaceId);
    const projectCountByWorkspace = new Map(projectCounts.map(row => [row.workspaceId, row.projectCount]));

    res.json({
      success: true,
      clients: workspaces.map(ws => ({
        id: String(ws.id),
        name: ws.name,
        organizationId: String(ws.organizationId),
        logo: ws.logo || '/logos/default-client.png',
        activeProjects: projectCountByWorkspace.get(ws.id) ?? 0,
        quotaProjects: ws.quotaProjects || 0,
        quotaStorageGB: ws.quotaStorageGB || 0,
        lastActivity: ws.updatedAt,
      })),
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
