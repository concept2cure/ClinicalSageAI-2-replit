import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import {
  organizations,
  organizationUsers,
  clientWorkspaces,
} from '@shared/schema';
import { eq, count, inArray } from 'drizzle-orm';
import { authMiddleware } from '../auth';
import auditService from '../services/auditService';

const router = Router();

router.use(authMiddleware);

/**
 * PLATFORM-STAFF roles only. Deliberately excludes the org-membership role
 * 'admin' (every tenant's own admin carries JWT role 'admin'), which must
 * NOT bypass tenant scoping — that would let any customer admin read and
 * write every other organization. Matches the posture of clients-routes.ts
 * / tenant-users.ts (super_admin only).
 */
function isPlatformStaff(role: unknown): boolean {
  return role === 'platform_admin' || role === 'superadmin' || role === 'super_admin';
}

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

  if (isPlatformStaff(userRole)) {
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
 * Org-admin gate for governed organization mutations. authMiddleware already
 * re-resolved the caller's role in their own org from organization_users, and
 * validateOrgOwnership pinned :id to that org for non-staff — so an org-role
 * check here is a check against the *target* org. Platform staff pass.
 */
function requireOrgAdmin(req: any, res: any, next: any) {
  const role = req.userRole ?? req.user?.role;
  if (isPlatformStaff(role) || role === 'admin' || role === 'owner') {
    return next();
  }
  return res.status(403).json({
    success: false,
    error: 'Organization admin role required for this action',
  });
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
    // Only platform staff may list ALL organizations; a tenant 'admin' sees
    // just their own memberships like any other user (no tenant enumeration).
    const isAdmin = isPlatformStaff(userRole);

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
        clientType: org.clientType,
        tier: org.tier,
      },
    });
  } catch (error) {
    console.error('Error fetching organization:', req.params.id, error);
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
    console.error('Error fetching clients for organization:', req.params.id, error);
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
/**
 * Governed organization-profile update (name / client type / industry mode).
 * API: PATCH /api/organizations/:id/profile
 *
 * This is the org-admin self-serve profile write behind the ui-v2 Setup and
 * Onboarding surfaces. It is intentionally narrow: identity fields only —
 * tier/status/billing stay owned by platform routes (/api/tenants,
 * /api/admin/master) and Stripe. Every call requires a reason-for-change and
 * lands in the audit trail (21 CFR Part 11 posture, same as
 * /api/admin/master mutations).
 */
const profilePatchSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    clientType: z
      .enum(['medtech', 'biotech', 'pharma', 'diagnostics', 'cro', 'health'])
      .optional(),
    industryMode: z.string().trim().min(2).max(64).optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .refine(
    d => d.name !== undefined || d.clientType !== undefined || d.industryMode !== undefined,
    { message: 'At least one of name, clientType, industryMode is required' }
  );

router.patch('/:id/profile', validateOrgOwnership, requireOrgAdmin, async (req, res) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    if (isNaN(orgId)) {
      return res.status(400).json({ success: false, error: 'Invalid organization ID' });
    }

    const parsed = profilePatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid profile update',
      });
    }
    const { name, clientType, industryMode, reason } = parsed.data;

    const [before] = await db
      .select({
        name: organizations.name,
        clientType: organizations.clientType,
        industryMode: organizations.industryMode,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    if (!before) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (clientType !== undefined) updates.clientType = clientType;
    if (industryMode !== undefined) updates.industryMode = industryMode;

    const [updated] = await db
      .update(organizations)
      .set(updates)
      .where(eq(organizations.id, orgId))
      .returning({
        id: organizations.id,
        name: organizations.name,
        clientType: organizations.clientType,
        industryMode: organizations.industryMode,
        updatedAt: organizations.updatedAt,
      });

    await auditService.logAction({
      tenantId: orgId,
      userId: req.userId ?? (req as any).user?.id,
      action: 'data_modify',
      resourceType: 'organization',
      resourceId: orgId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: {
        orgAdminAction: 'organization.profile_update',
        before,
        after: {
          name: updated.name,
          clientType: updated.clientType,
          industryMode: updated.industryMode,
        },
        reason,
      },
    });

    res.json({ success: true, organization: updated });
  } catch (error) {
    console.error('Error updating organization profile:', req.params.id, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update organization profile',
    });
  }
});

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
      // Translation-workspace policy (ui-v2 Setup surface / Document editor
      // Trans dock). Org-wide defaults; per-user prefs live on users.preferences.
      translation: {
        enabled: false,
        targets: [],
        defaultEngine: 'C2C-RIM-MT v2.4',
        requireBackTranslation: true,
        twoPersonRule: true,
        glossaryScope: 'org',
        blockMachineApproval: true,
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
router.patch('/:id/settings', validateOrgOwnership, requireOrgAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Governed body form: { settings: {...}, reason: '...' }. The bare
    // settings-partial body remains accepted (no shipped caller uses it, but
    // the contract predates this hardening); a governed call must carry a
    // reason of at least 3 chars. Both forms audit the changed section keys.
    const body = req.body ?? {};
    const isGoverned =
      typeof body === 'object' &&
      !Array.isArray(body) &&
      typeof body.settings === 'object' &&
      body.settings !== null &&
      Object.keys(body).every(k => k === 'settings' || k === 'reason');
    const settingsUpdate = isGoverned ? body.settings : body;
    const reason = isGoverned && typeof body.reason === 'string' ? body.reason.trim() : null;

    if (isGoverned && (!reason || reason.length < 3)) {
      return res.status(400).json({
        success: false,
        error: 'A reason (min 3 chars) is required for this action',
      });
    }
    if (
      typeof settingsUpdate !== 'object' ||
      settingsUpdate === null ||
      Array.isArray(settingsUpdate) ||
      Object.keys(settingsUpdate).length === 0
    ) {
      return res.status(400).json({
        success: false,
        error: 'Settings update must be a non-empty object',
      });
    }

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

    // Audit the changed section keys, not the values — settings sections can
    // carry integration credentials that must not be duplicated into the log.
    await auditService.logAction({
      tenantId: parseInt(id),
      userId: req.userId ?? (req as any).user?.id,
      action: 'data_modify',
      resourceType: 'organization_settings',
      resourceId: parseInt(id),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: {
        orgAdminAction: 'organization.settings_update',
        sections: Object.keys(settingsUpdate),
        reason,
      },
    });

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
