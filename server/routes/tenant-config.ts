/**
 * Tenant Configuration API Routes
 *
 * Handles tenant-specific configuration settings.
 */
import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { organizations } from '../../shared/schema';
import { authMiddleware } from '../auth';
import { requireOrganizationContext } from '../middleware/tenantContext';
import { createScopedLogger } from '../utils/logger';
import { requestDb } from '../db/requestDb';
import { staffCrossOrgScope } from '../middleware/staffCrossOrgScope';
import { holdsPlatformRole } from '../middleware/requirePlatformAdmin';
// The one settings writer and its record, shared with the AnA platform
// controller (P1-49, DP-58): services/tenant/tenant-settings-writer.ts.
import {
  asSettings,
  overlaySettings,
  writeTenantSettings,
  type Settings,
} from '../services/tenant/tenant-settings-writer';
import {
  CLAUDE_CONNECTOR_SETTING,
  CONNECTOR_NOT_A_GENERAL_SETTING,
  CONNECTOR_OPENER_ONLY,
  claudeConnectorEnabled,
  mayChangeClaudeConnector,
  namesClaudeConnector,
} from '../mcp/auth/connector-enablement';

const logger = createScopedLogger('tenant-config-api');
const router = Router();

// This router previously read the Drizzle handle off `req.db`, which
// authMiddleware attached globally to every authenticated request. That
// side-channel is gone (it undercut the fail-closed request-scoped DB
// policy); queries now run through requestDb(req) — the request-scoped,
// RLS-aware Drizzle bound to the connection the auth boundary configured
// (fail-closed: it throws rather than falling back to the shared pool).
// `organizations` itself carries no RLS tenant policy (no tenant column),
// so the super_admin cross-tenant read below behaves as before; the
// handler-level org checks remain the authorization boundary.

// Schema for tenant settings
/**
 * super_admin may act on any tenant here (the handlers' own rule). That write must
 * run in the system scope, not the staff member's own tenant scope: under
 * public.organizations' own-org write policy it otherwise writes nothing (D3,
 * docs/evidence/D3/2026-09-26-organizations-writes/).
 */
const staffAcrossOrgs = staffCrossOrgScope({
  param: 'tenantId',
  isStaff: req => isTenantStaff(req),
});

/**
 * Platform staff for this router: platform standing for super_admin
 * (holdsPlatformRole), never the request role. Behind server/auth.ts the
 * request role is the tenant membership role, so a membership row naming
 * super_admin used to read and write any tenant's settings (D6, 2026-10-05,
 * docs/evidence/D6/2026-10-05-cross-tenant-staff/).
 */
function isTenantStaff(req: Parameters<typeof holdsPlatformRole>[0]): Promise<boolean> {
  return holdsPlatformRole(req, ['super_admin']);
}

/** An administrator of THIS tenant, or platform staff. The handlers' write rule. */
async function mayWriteTenant(req: Parameters<typeof holdsPlatformRole>[0], tenantId: number): Promise<boolean> {
  if (req.userRole === 'admin' && tenantId === req.tenantId) return true;
  return isTenantStaff(req);
}

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

/** The defaults a reset restores, by tier. */
function defaultSettingsFor(tier: string): Settings {
  return {
    branding: {
      primaryColor: '#292524', // Stone-800
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
}

/** The connector's own door takes exactly `{ enabled: boolean }`. */
const connectorBodySchema = z.object({ enabled: z.boolean() }).strict();

/**
 * Get tenant settings
 * Organization admins can view their own settings, super admins can view any tenant's settings
 */
router.get('/:tenantId/settings', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const tenantId = parseInt(String(req.params.tenantId));
    if (isNaN(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant ID' });
    }

    // Check permissions
    if (tenantId !== req.tenantId && !(await isTenantStaff(req))) {
      return res
        .status(403)
        .json({ error: 'You can only view settings for your own organization' });
    }

    // Get tenant settings
    const tenant = await requestDb(req)
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
  staffAcrossOrgs,
  async (req, res) => {
    try {
      const tenantId = parseInt(String(req.params.tenantId));
      if (isNaN(tenantId)) {
        return res.status(400).json({ error: 'Invalid tenant ID' });
      }

      // The connector for Claude has its own door (P1-47): named here it is
      // refused, whoever asks, not silently dropped by the schema below.
      if (namesClaudeConnector(req.body)) {
        return res.status(403).json({ error: CONNECTOR_NOT_A_GENERAL_SETTING });
      }

      // Check permissions: this tenant's administrator, or platform staff.
      if (!(await mayWriteTenant(req, tenantId))) {
        return res.status(403).json({
          error: req.userRole === 'admin'
            ? 'You can only update settings for your own organization'
            : 'Only organization admins can update settings',
        });
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

      // Each section named in the body is merged field by field over the stored
      // one (DP-62): a field the body does not send is kept, never dropped.
      const stored = await writeTenantSettings(req, tenantId, {
        action: 'tenant_settings_changed',
        next: current => overlaySettings(current, newSettings),
        sections: () => Object.keys(newSettings).sort(),
      });
      if (!stored) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      // Return the updated settings
      return res.json(stored);
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
  staffAcrossOrgs,
  async (req, res) => {
    try {
      const tenantId = parseInt(String(req.params.tenantId));
      if (isNaN(tenantId)) {
        return res.status(400).json({ error: 'Invalid tenant ID' });
      }

      // Check permissions: this tenant's administrator, or platform staff.
      if (!(await mayWriteTenant(req, tenantId))) {
        return res.status(403).json({
          error: req.userRole === 'admin'
            ? 'You can only reset settings for your own organization'
            : 'Only organization admins can reset settings',
        });
      }

      // Every setting the tier's defaults define is restored; what they do not
      // define is kept (DP-62): the organisation's AnA tool policy and the
      // server-enforced security keys are not this reset's to erase.
      const stored = await writeTenantSettings(req, tenantId, {
        action: 'tenant_settings_reset',
        next: (current, tier) => overlaySettings(current, defaultSettingsFor(tier)),
        sections: (current, next) => [...new Set([...Object.keys(current), ...Object.keys(next)])].sort(),
      });
      if (!stored) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      // Return the default settings
      return res.json(stored);
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
  staffAcrossOrgs,
  async (req, res) => {
    try {
      const tenantId = parseInt(String(req.params.tenantId));
      if (isNaN(tenantId)) {
        return res.status(400).json({ error: 'Invalid tenant ID' });
      }

      const section = String(req.params.section);
      const validSections = [
        'branding',
        'security',
        'notifications',
        'workflow',
        'cer',
        'qmp',
        'integration',
      ] as const;

      if (!validSections.includes(section as (typeof validSections)[number])) {
        return res.status(400).json({
          error: 'Invalid section',
          validSections,
        });
      }

      // Check permissions: this tenant's administrator, or platform staff.
      if (!(await mayWriteTenant(req, tenantId))) {
        return res.status(403).json({
          error: req.userRole === 'admin'
            ? 'You can only update settings for your own organization'
            : 'Only organization admins can update settings',
        });
      }

      // Get schema for just this section
      const sectionKey = section as keyof typeof tenantSettingsSchema.shape;
      const sectionSchema = tenantSettingsSchema.shape[sectionKey];
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

      // The named section, merged field by field over the stored one.
      const stored = await writeTenantSettings(req, tenantId, {
        action: 'tenant_settings_changed',
        next: current => ({
          ...current,
          [section]: { ...asSettings(current[section]), ...sectionData },
        }),
        sections: () => [section],
      });
      if (!stored) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      // Return just the updated section
      return res.json(stored[section]);
    } catch (error) {
      logger.error(
        `Error updating ${req.params.section} settings for tenant ${req.params.tenantId}`,
        error
      );
      return res.status(500).json({ error: `Failed to update ${req.params.section} settings` });
    }
  }
);

/**
 * The connector for Claude, per organisation (ADR-0014 §10, plan P1-47;
 * mcp/auth/connector-enablement.ts). Off until the organisation's owner or
 * administrator turns it on; the connector reads it live on every request.
 *
 *   GET /:tenantId/claude-connector  any member of the organisation:
 *       { connector: { enabled, canChange } }, canChange true for its owner or administrator
 *   PUT /:tenantId/claude-connector  { enabled: boolean }, its owner or administrator only
 *
 * Who changes it is mayChangeClaudeConnector's list, owner and admin (IAM-25,
 * decided by the product owner 2026-10-01): no product path writes `owner` to
 * organization_users.role, and the administrator is the customer's highest
 * in-product role, so the customer still decides. Refused: a manager, member
 * or viewer, platform staff (super_admin), and the administrator or owner of
 * another organisation. The general doors above refuse it by name (PATCH
 * /settings), whoever asks, or do not know it (PATCH /settings/:section; a
 * reset keeps it, since tier defaults do not define it), and the one settings
 * writer refuses any write but this door's that would change it (connectorDoor;
 * IAM-24 fix round). The change goes through that writer, so the setting and
 * its chained audit row, with the value before and after, commit or roll back
 * together.
 */
router.get('/:tenantId/claude-connector', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const tenantId = parseInt(String(req.params.tenantId));
    if (isNaN(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant ID' });
    }
    if (Number(req.tenantId) !== tenantId) {
      return res.status(403).json({ error: 'You can only view settings for your own organization' });
    }
    const [tenant] = await requestDb(req)
      .select()
      .from(organizations)
      .where(eq(organizations.id, tenantId))
      .limit(1);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    return res.json({
      connector: { enabled: claudeConnectorEnabled(tenant.settings), canChange: mayChangeClaudeConnector(req.userRole) },
    });
  } catch (error) {
    logger.error(`Error reading the connector setting for tenant ${req.params.tenantId}`, error);
    return res.status(500).json({ error: 'The connector setting could not be read.' });
  }
});

router.put('/:tenantId/claude-connector', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const tenantId = parseInt(String(req.params.tenantId));
    if (isNaN(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant ID' });
    }
    if (!mayChangeClaudeConnector(req.userRole) || Number(req.tenantId) !== tenantId) {
      return res.status(403).json({ error: CONNECTOR_OPENER_ONLY });
    }
    const body = connectorBodySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Send { "enabled": true } or { "enabled": false }.' });
    }
    const { enabled } = body.data;
    const stored = await writeTenantSettings(req, tenantId, {
      action: 'tenant_settings_changed',
      next: current => ({ ...current, [CLAUDE_CONNECTOR_SETTING]: { enabled } }),
      sections: () => [CLAUDE_CONNECTOR_SETTING],
      // The one door the writer lets change it (IAM-24 fix round).
      connectorDoor: true,
    });
    if (!stored) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    return res.json({ connector: { enabled: claudeConnectorEnabled(stored), canChange: true } });
  } catch (error) {
    logger.error(`Error changing the connector setting for tenant ${req.params.tenantId}`, error);
    return res.status(500).json({ error: 'The connector setting was not changed.' });
  }
});

export default router;
