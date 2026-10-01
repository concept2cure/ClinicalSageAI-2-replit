/**
 * Tenant Configuration API Routes
 *
 * Handles tenant-specific configuration settings.
 */
import { isDeepStrictEqual } from 'node:util';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { organizations } from '../../shared/schema';
import { authMiddleware } from '../auth';
import { requireOrganizationContext } from '../middleware/tenantContext';
import { governedActorId } from '../middleware/orgMembership';
import { createScopedLogger } from '../utils/logger';
import { clientIpOf } from '../utils/client-ip';
import { requestDb, requestPgClient } from '../db/requestDb';
import { staffCrossOrgScope } from '../middleware/staffCrossOrgScope';
import { writeChainedAuditRow } from '../services/auditService';

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
  isStaff: req => req.userRole === 'super_admin',
});

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

type Settings = Record<string, unknown>;

function asSettings(value: unknown): Settings {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Settings) : {};
}

/**
 * The settings whose values a write's audit row carries, before and after
 * (P1-41, DP-57): the organisation's access-control posture and its audit-trail
 * retention. Every other setting is recorded by section and field NAME only —
 * notifications carry webhook URLs, which are credentials, and a value recorded
 * in an append-only chain can never be removed.
 */
const VALUE_AUDITED: Readonly<Record<string, readonly string[]>> = {
  security: ['mfaRequired', 'passwordPolicy', 'sessionTimeoutMinutes', 'ipRestrictions'],
  qmp: ['auditTrailRetentionDays'],
};

function pick(section: Settings, keys: readonly string[]): Settings {
  return Object.fromEntries(keys.map(k => [k, section[k] ?? null]));
}

/** The names, never the values, of a section's fields whose stored value differs. */
function changedFieldNames(before: unknown, after: unknown): string[] {
  const b = asSettings(before);
  const a = asSettings(after);
  return [...new Set([...Object.keys(b), ...Object.keys(a)])]
    .filter(k => !isDeepStrictEqual(b[k], a[k]))
    .sort();
}

/** What a settings write's audit row records: the sections written, the changed field names, and the audited values. */
function settingsAuditDetails(before: Settings, after: Settings, sections: string[]) {
  const changedFields: Record<string, string[]> = {};
  const values: Record<string, { before: Settings; after: Settings }> = {};
  for (const section of sections) {
    const fields = changedFieldNames(before[section], after[section]);
    if (fields.length > 0) changedFields[section] = fields;
    const audited = VALUE_AUDITED[section];
    if (audited) {
      values[section] = {
        before: pick(asSettings(before[section]), audited),
        after: pick(asSettings(after[section]), audited),
      };
    }
  }
  return { sections, changedFields, values };
}

interface SettingsWrite {
  action: 'tenant_settings_changed' | 'tenant_settings_reset';
  /** The settings to store, from those stored now and the tenant's tier. */
  next: (current: Settings, tier: string) => Settings;
  /** The sections this write names, given what was stored and what will be. */
  sections: (current: Settings, next: Settings) => string[];
}

/**
 * One settings write: the stored settings read under a row lock, the new ones
 * written, and the write's chained audit row — one transaction on the request's
 * own connection (requestDb is Drizzle over that same client), so the change
 * and its record commit or roll back together. A refused audit row throws and
 * the write is rolled back. Null when there is no such tenant.
 */
async function writeTenantSettings(req: Request, tenantId: number, change: SettingsWrite): Promise<Settings | null> {
  const client = requestPgClient(req);
  const rdb = requestDb(req);
  await client.query('BEGIN');
  try {
    const [tenant] = await rdb
      .select()
      .from(organizations)
      .where(eq(organizations.id, tenantId))
      .limit(1)
      .for('update');
    if (!tenant) {
      await client.query('ROLLBACK');
      return null;
    }
    const current = asSettings(tenant.settings);
    const next = change.next(current, tenant.tier || 'standard');
    const [updated] = await rdb
      .update(organizations)
      .set({ settings: next })
      .where(eq(organizations.id, tenantId))
      .returning();
    if (!updated) {
      await client.query('ROLLBACK');
      return null;
    }
    const stored = asSettings(updated.settings);
    await writeChainedAuditRow(client, {
      tenantId,
      userId: governedActorId(req) ?? undefined,
      action: change.action,
      resourceType: 'organization_settings',
      resourceId: String(tenantId),
      ipAddress: clientIpOf(req) ?? undefined,
      userAgent: req.get('user-agent'),
      details: settingsAuditDetails(current, stored, change.sections(current, stored)),
    });
    await client.query('COMMIT');
    return stored;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

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
    if (req.userRole !== 'super_admin' && tenantId !== req.tenantId) {
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

      // Each section named in the body replaces the stored one.
      const stored = await writeTenantSettings(req, tenantId, {
        action: 'tenant_settings_changed',
        next: current => ({ ...current, ...newSettings }),
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

      // Every stored section is replaced by the tier's defaults.
      const stored = await writeTenantSettings(req, tenantId, {
        action: 'tenant_settings_reset',
        next: (_current, tier) => defaultSettingsFor(tier),
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

export default router;
