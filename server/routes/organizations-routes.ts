import { Router } from 'express';
import { db } from '../db';
import {
  organizations,
  organizationUsers,
  clientWorkspaces,
} from '@shared/schema';
import { eq, count, inArray } from 'drizzle-orm';
import { authMiddleware } from '../auth';

const router = Router();

router.use(authMiddleware);

/**
 * Validate that the requesting user belongs to the organization in :id param.
 * Platform admins / superadmins bypass the check.
 */
function validateOrgOwnership(req: any, res: any, next: any) {
  const paramId = parseInt(req.params.id, 10);
  const userOrgId = req.user?.organizationId
    ? parseInt(String(req.user.organizationId))
    : null;
  const userRole = req.user?.role || req.userRole;

  if (userRole === 'platform_admin' || userRole === 'superadmin' || userRole === 'admin') {
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
 *
 * Admins / platform_admins see every org.
 * Regular users see only orgs they belong to via organization_users.
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id ? parseInt(String(req.user.id)) : null;
    const userRole = req.user?.role || req.userRole;
    const isAdmin =
      userRole === 'platform_admin' ||
      userRole === 'superadmin' ||
      userRole === 'admin';

    let orgRows;

    if (isAdmin) {
      orgRows = await db.select().from(organizations);
    } else if (userId) {
      const memberships = await db
        .select({ organizationId: organizationUsers.organizationId })
        .from(organizationUsers)
        .where(eq(organizationUsers.userId, userId));

      const orgIds = memberships.map(m => m.organizationId);
      if (orgIds.length === 0) {
        return res.json({ success: true, organizations: [] });
      }

      orgRows = await db
        .select()
        .from(organizations)
        .where(inArray(organizations.id, orgIds));
    } else {
      return res.json({ success: true, organizations: [] });
    }

    const result = await Promise.all(
      orgRows.map(async org => {
        const [activeCount] = await db
          .select({ count: count() })
          .from(organizationUsers)
          .where(eq(organizationUsers.organizationId, org.id));

        return {
          id: String(org.id),
          name: org.name,
          logo: org.logo,
          subscriptionTier: org.tier,
          maxUsers: org.maxUsers,
          activeUsers: activeCount?.count ?? 0,
          createdAt: org.createdAt?.toISOString() ?? null,
        };
      }),
    );

    res.json({ success: true, organizations: result });
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
    const orgId = parseInt(req.params.id, 10);
    if (isNaN(orgId)) {
      return res.status(400).json({ success: false, error: 'Invalid organization ID' });
    }

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId));

    if (!org) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }

    const [activeCount] = await db
      .select({ count: count() })
      .from(organizationUsers)
      .where(eq(organizationUsers.organizationId, orgId));

    res.json({
      success: true,
      organization: {
        id: String(org.id),
        name: org.name,
        logo: org.logo,
        subscriptionTier: org.tier,
        maxUsers: org.maxUsers,
        activeUsers: activeCount?.count ?? 0,
        createdAt: org.createdAt?.toISOString() ?? null,
        billingCycle: org.billingCycle,
        domain: org.domain,
        slug: org.slug,
        status: org.status,
        maxProjects: org.maxProjects,
        maxStorage: org.maxStorage,
        seatsPurchased: org.seatsPurchased,
        paymentStatus: org.paymentStatus,
        industryMode: org.industryMode,
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
 * Get clients (workspaces) for an organization
 * API: GET /api/organizations/:id/clients
 */
router.get('/:id/clients', validateOrgOwnership, async (req, res) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    if (isNaN(orgId)) {
      return res.status(400).json({ success: false, error: 'Invalid organization ID' });
    }

    const workspaces = await db
      .select()
      .from(clientWorkspaces)
      .where(eq(clientWorkspaces.organizationId, orgId));

    const clients = workspaces.map(ws => ({
      id: String(ws.id),
      name: ws.name,
      organizationId: String(ws.organizationId),
      logo: ws.logo,
      status: ws.status,
      quotaProjects: ws.quotaProjects,
      quotaStorage: ws.quotaStorage,
      contactName: ws.contactName,
      contactEmail: ws.contactEmail,
      industry: ws.industry,
      description: ws.description,
      slug: ws.slug,
      createdAt: ws.createdAt?.toISOString() ?? null,
      updatedAt: ws.updatedAt?.toISOString() ?? null,
    }));

    res.json({ success: true, clients });
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
        primaryColor: '#292524',
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

    const settings = organization.settings
      ? { ...defaultSettings, ...organization.settings }
      : defaultSettings;

    res.json({ success: true, settings });
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

    const currentSettings = organization.settings || {};
    const updatedSettings = { ...currentSettings, ...settingsUpdate };

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
