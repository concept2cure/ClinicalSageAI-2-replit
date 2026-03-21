import { Router } from 'express';
import { db } from '../db';
import { organizations } from '@shared/schema';
import { eq } from 'drizzle-orm';

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
router.get('/', (req, res) => {
  try {
    // Mock data for organizations
    const organizations = [
      {
        id: '1',
        name: 'Acme Pharmaceuticals',
        logo: '/logos/acme.svg',
        subscriptionTier: 'Enterprise',
        maxUsers: 50,
        activeUsers: 27,
        createdAt: '2024-09-15T12:00:00Z',
      },
      {
        id: '2',
        name: 'Biotech Innovations',
        logo: '/logos/biotech.svg',
        subscriptionTier: 'Professional',
        maxUsers: 25,
        activeUsers: 18,
        createdAt: '2024-10-05T14:30:00Z',
      },
      {
        id: '3',
        name: 'MedDevice Corp',
        logo: '/logos/meddevice.svg',
        subscriptionTier: 'Standard',
        maxUsers: 10,
        activeUsers: 8,
        createdAt: '2024-11-20T09:15:00Z',
      },
    ];

    res.json({
      success: true,
      organizations,
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
router.get('/:id', validateOrgOwnership, (req, res) => {
  try {
    const { id } = req.params;

    // Mock data for organization details
    const organizationData = {
      id,
      name:
        id === '1'
          ? 'Acme Pharmaceuticals'
          : id === '2'
            ? 'Biotech Innovations'
            : id === '3'
              ? 'MedDevice Corp'
              : 'Unknown Organization',
      logo:
        id === '1'
          ? '/logos/acme.png'
          : id === '2'
            ? '/logos/biotech.png'
            : id === '3'
              ? '/logos/meddevice.png'
              : '/logos/default.png',
      subscriptionTier: id === '1' ? 'Enterprise' : id === '2' ? 'Professional' : 'Standard',
      maxUsers: id === '1' ? 50 : id === '2' ? 25 : 10,
      activeUsers: id === '1' ? 27 : id === '2' ? 18 : 8,
      createdAt: '2024-09-15T12:00:00Z',
      billingCycle: 'Monthly',
      domain:
        id === '1'
          ? 'acmepharma.com'
          : id === '2'
            ? 'biotechinnovations.org'
            : id === '3'
              ? 'meddevicecorp.net'
              : 'example.com',
    };

    res.json({
      success: true,
      organization: organizationData,
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
router.get('/:id/clients', validateOrgOwnership, (req, res) => {
  try {
    const { id } = req.params;

    // Mock data for clients based on organization ID
    const clients = [];

    if (id === '1') {
      clients.push(
        {
          id: '101',
          name: 'Acme Clinical Team',
          organizationId: '1',
          logo: '/logos/acme-clinical.png',
          activeProjects: 8,
          quotaProjects: 20,
          storageUsedGB: 14.5,
          quotaStorageGB: 100,
          lastActivity: '2025-05-09T18:22:43Z',
        },
        {
          id: '102',
          name: 'Acme Regulatory Affairs',
          organizationId: '1',
          logo: '/logos/acme-regulatory.png',
          activeProjects: 5,
          quotaProjects: 15,
          storageUsedGB: 32.8,
          quotaStorageGB: 100,
          lastActivity: '2025-05-10T09:15:30Z',
        }
      );
    } else if (id === '2') {
      clients.push({
        id: '201',
        name: 'Biotech Research Division',
        organizationId: '2',
        logo: '/logos/biotech-research.png',
        activeProjects: 3,
        quotaProjects: 10,
        storageUsedGB: 8.2,
        quotaStorageGB: 50,
        lastActivity: '2025-05-08T14:30:00Z',
      });
    } else if (id === '3') {
      clients.push(
        {
          id: '301',
          name: 'MedDevice Quality',
          organizationId: '3',
          logo: '/logos/meddevice-quality.png',
          activeProjects: 2,
          quotaProjects: 5,
          storageUsedGB: 3.7,
          quotaStorageGB: 20,
          lastActivity: '2025-05-07T11:45:22Z',
        },
        {
          id: '302',
          name: 'MedDevice Compliance',
          organizationId: '3',
          logo: '/logos/meddevice-compliance.png',
          activeProjects: 1,
          quotaProjects: 5,
          storageUsedGB: 1.9,
          quotaStorageGB: 20,
          lastActivity: '2025-05-05T16:20:18Z',
        }
      );
    }

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
