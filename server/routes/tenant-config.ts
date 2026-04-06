/**
 * Tenant Configuration API Routes
 *
 * Handles tenant-specific configuration settings.
 */
import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { organizations } from '../../shared/schema';
import { authMiddleware, requireAdminRole } from '../auth';
import { requireOrganizationContext } from '../middleware/tenantContext';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('tenant-config-api');
const router = Router();

// Schema for tenant settings
const tenantSettingsSchema = z.object({
  branding: z
    .object({
      primaryColor: z.string().optional(),
      logoUrl: z.string().optional(),
      favicon: z.string().optional(),
      customCss: z.string().optional(),
    })
    .optional(),

  security: z
    .object({
      mfaRequired: z.boolean().optional(),
      passwordPolicy: z
        .object({
          minLength: z.number().int().min(8).max(64).optional(),
          requireUppercase: z.boolean().optional(),
          requireLowercase: z.boolean().optional(),
          requireNumbers: z.boolean().optional(),
          requireSpecialChars: z.boolean().optional(),
          passwordExpiryDays: z.number().int().optional(),
        })
        .optional(),
      sessionTimeoutMinutes: z.number().int().positive().optional(),
      ipRestrictions: z.array(z.string()).optional(),
    })
    .optional(),

  notifications: z
    .object({
      emailEnabled: z.boolean().optional(),
      slackEnabled: z.boolean().optional(),
      slackWebhook: z.string().optional(),
      teamsEnabled: z.boolean().optional(),
      teamsWebhook: z.string().optional(),
      smsEnabled: z.boolean().optional(),
      smsProvider: z.enum(['twilio', 'aws-sns']).optional(),
    })
    .optional(),

  workflow: z
    .object({
      defaultApprovalWorkflow: z.enum(['single', 'sequential', 'parallel']).optional(),
      requiredApprovers: z.number().int().min(1).max(10).optional(),
      enableAutoReminders: z.boolean().optional(),
      reminderFrequencyDays: z.number().int().positive().optional(),
    })
    .optional(),

  cer: z
    .object({
      defaultTemplateId: z.number().optional(),
      autoSaveIntervalMinutes: z.number().int().positive().optional(),
      trackChangesEnabled: z.boolean().optional(),
      enableAiAssistant: z.boolean().optional(),
      requireCtqGatingOnGeneration: z.boolean().optional(),
    })
    .optional(),

  qmp: z
    .object({
      defaultQmpId: z.number().optional(),
      requireQmpForAllProjects: z.boolean().optional(),
      enforceStrictCompliance: z.boolean().optional(),
      auditTrailRetentionDays: z.number().int().positive().optional(),
    })
    .optional(),

  integration: z
    .object({
      vaultEnabled: z.boolean().optional(),
      vaultConnectionId: z.string().optional(),
      vaultBasePath: z.string().optional(),
      jiraEnabled: z.boolean().optional(),
      jiraConnectionId: z.string().optional(),
      gitEnabled: z.boolean().optional(),
      gitProvider: z.enum(['github', 'gitlab', 'bitbucket']).optional(),
      gitConnectionId: z.string().optional(),
    })
    .optional(),
});

/**
 * Get tenant settings
 * Organization admins can view their own settings, super admins can view any tenant's settings
 */
router.get('/:tenantId/settings', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    if (isNaN(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant ID' });
    }

    // Check permissions
    if (req.userRole !== 'super_admin' && tenantId !== req.tenantId) {
      return res
        .status(403)
        .json({ error: 'You can only view settings for your own organization' });
    }

    // Get tenant settings
    const tenant = await req.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, tenantId))
      .limit(1);

    if (tenant.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Return settings (or empty object if none exist)
    return res.json(tenant[0].settings || {});
  } catch (error) {
    logger.error(`Error fetching settings for tenant ${req.params.tenantId}`, error);
    return res.status(500).json({ error: 'Failed to fetch tenant settings' });
  }
});

/**
 * Update tenant settings
 * Only organization admins and super admins can update settings
 */
router.patch(
  '/:tenantId/settings',
  authMiddleware,
  requireOrganizationContext,
  async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      if (isNaN(tenantId)) {
        return res.status(400).json({ error: 'Invalid tenant ID' });
      }

      // Check permissions
      if (req.userRole !== 'super_admin' && req.userRole !== 'admin') {
        return res.status(403).json({ error: 'Only organization admins can update settings' });
      }

      // For regular admins, ensure they're updating their own organization
      if (req.userRole === 'admin' && tenantId !== req.tenantId) {
        return res
          .status(403)
          .json({ error: 'You can only update settings for your own organization' });
      }

      // Validate request body
      const validationResult = tenantSettingsSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: 'Invalid settings data',
          details: validationResult.error.format(),
        });
      }

      const newSettings = validationResult.data;

      // Get current settings
      const tenant = await req.db
        .select()
        .from(organizations)
        .where(eq(organizations.id, tenantId))
        .limit(1);

      if (tenant.length === 0) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      // Merge current settings with new settings
      const currentSettings = tenant[0].settings || {};
      const mergedSettings = { ...currentSettings, ...newSettings };

      // Update the tenant settings
      const updatedTenant = await req.db
        .update(organizations)
        .set({ settings: mergedSettings })
        .where(eq(organizations.id, tenantId))
        .returning();

      // Return the updated settings
      return res.json(updatedTenant[0].settings);
    } catch (error) {
      logger.error(`Error updating settings for tenant ${req.params.tenantId}`, error);
      return res.status(500).json({ error: 'Failed to update tenant settings' });
    }
  }
);

/**
 * Reset tenant settings to defaults
 * Only organization admins and super admins can reset settings
 */
router.post(
  '/:tenantId/settings/reset',
  authMiddleware,
  requireOrganizationContext,
  async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      if (isNaN(tenantId)) {
        return res.status(400).json({ error: 'Invalid tenant ID' });
      }

      // Check permissions
      if (req.userRole !== 'super_admin' && req.userRole !== 'admin') {
        return res.status(403).json({ error: 'Only organization admins can reset settings' });
      }

      // For regular admins, ensure they're updating their own organization
      if (req.userRole === 'admin' && tenantId !== req.tenantId) {
        return res
          .status(403)
          .json({ error: 'You can only reset settings for your own organization' });
      }

      // Define default settings based on tenant tier
      const tenant = await req.db
        .select()
        .from(organizations)
        .where(eq(organizations.id, tenantId))
        .limit(1);

      if (tenant.length === 0) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const tier = tenant[0].tier || 'standard';

      // Define default settings based on tier
      const defaultSettings = {
        branding: {
          primaryColor: '#5585b3', // Anthropic blue
        },
        security: {
          mfaRequired: tier === 'enterprise',
          passwordPolicy: {
            minLength: 8,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: tier !== 'standard',
            passwordExpiryDays: tier === 'enterprise' ? 90 : 0,
          },
          sessionTimeoutMinutes: tier === 'enterprise' ? 30 : 60,
        },
        notifications: {
          emailEnabled: true,
          slackEnabled: false,
          teamsEnabled: false,
          smsEnabled: tier === 'enterprise',
        },
        workflow: {
          defaultApprovalWorkflow: tier === 'enterprise' ? 'sequential' : 'single',
          requiredApprovers: tier === 'enterprise' ? 2 : 1,
          enableAutoReminders: tier !== 'standard',
        },
        cer: {
          autoSaveIntervalMinutes: 5,
          trackChangesEnabled: tier !== 'standard',
          enableAiAssistant: tier === 'enterprise',
          requireCtqGatingOnGeneration: tier === 'enterprise',
        },
        qmp: {
          requireQmpForAllProjects: tier === 'enterprise',
          enforceStrictCompliance: tier === 'enterprise',
          auditTrailRetentionDays: tier === 'enterprise' ? 3650 : 365,
        },
        integration: {
          vaultEnabled: true,
        },
      };

      // Update with default settings
      const updatedTenant = await req.db
        .update(organizations)
        .set({ settings: defaultSettings })
        .where(eq(organizations.id, tenantId))
        .returning();

      // Return the default settings
      return res.json(updatedTenant[0].settings);
    } catch (error) {
      logger.error(`Error resetting settings for tenant ${req.params.tenantId}`, error);
      return res.status(500).json({ error: 'Failed to reset tenant settings' });
    }
  }
);

/**
 * Update a specific setting section
 * Only organization admins and super admins can update settings
 */
router.patch(
  '/:tenantId/settings/:section',
  authMiddleware,
  requireOrganizationContext,
  async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      if (isNaN(tenantId)) {
        return res.status(400).json({ error: 'Invalid tenant ID' });
      }

      const section = req.params.section;
      const validSections = [
        'branding',
        'security',
        'notifications',
        'workflow',
        'cer',
        'qmp',
        'integration',
      ];

      if (!validSections.includes(section)) {
        return res.status(400).json({
          error: 'Invalid section',
          validSections,
        });
      }

      // Check permissions
      if (req.userRole !== 'super_admin' && req.userRole !== 'admin') {
        return res.status(403).json({ error: 'Only organization admins can update settings' });
      }

      // For regular admins, ensure they're updating their own organization
      if (req.userRole === 'admin' && tenantId !== req.tenantId) {
        return res
          .status(403)
          .json({ error: 'You can only update settings for your own organization' });
      }

      // Get schema for just this section
      const sectionSchema = tenantSettingsSchema.shape[section];
      if (!sectionSchema) {
        return res.status(400).json({ error: 'Invalid section schema' });
      }

      // Validate just this section
      const validationResult = sectionSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: `Invalid ${section} settings`,
          details: validationResult.error.format(),
        });
      }

      const sectionData = validationResult.data;

      // Get current settings
      const tenant = await req.db
        .select()
        .from(organizations)
        .where(eq(organizations.id, tenantId))
        .limit(1);

      if (tenant.length === 0) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      // Merge current settings with new section settings
      const currentSettings = tenant[0].settings || {};
      const mergedSettings = {
        ...currentSettings,
        [section]: {
          ...(currentSettings[section] || {}),
          ...sectionData,
        },
      };

      // Update the tenant settings
      const updatedTenant = await req.db
        .update(organizations)
        .set({ settings: mergedSettings })
        .where(eq(organizations.id, tenantId))
        .returning();

      // Return just the updated section
      return res.json(updatedTenant[0].settings[section]);
    } catch (error) {
      logger.error(
        `Error updating ${req.params.section} settings for tenant ${req.params.tenantId}`,
        error
      );
      return res.status(500).json({ error: `Failed to update ${req.params.section} settings` });
    }
  }
);

export default router;
