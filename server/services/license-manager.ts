/**
 * @fileoverview License Manager & Module Gate Middleware
 * @module server/services/license-manager
 * @version 1.0.0
 *
 * @description
 * Server-side enforcement of module access based on organization
 * subscriptions. This is the single source of truth — the frontend
 * mirrors this via the /api/module-subscriptions endpoint.
 *
 * Tier hierarchy: free < standard < professional < enterprise
 * Each tier includes everything from the tier below.
 *
 * Industry modes gate which modules are relevant/visible,
 * but don't override tier restrictions.
 *
 * @compliance
 * - Audit logged: all access denials are recorded
 * - Fail-closed: unknown modules are denied by default
 */

import { pool } from '../db.js';
import auditService from './auditService.js';
import { createScopedLogger } from '../utils/logger.js';
import type { Request, Response, NextFunction } from 'express';

const logger = createScopedLogger('license-manager');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface LicenseInfo {
  organizationId: number;
  tier: string;
  industryMode: string;
  enabledModules: string[];
  maxUsers: number;
  maxProjects: number;
  maxStorageGB: number;
}

/**
 * Whether this organization has a `module_subscriptions` row for a module, and
 * what it says.
 *
 * `isEnabled` collapses 'disabled' and 'none' into one `false`, which is the
 * right answer for "may they use it" but the wrong answer for "why not": an
 * admin who deliberately switched a module OFF for their workspace is a
 * different fact from an organization that simply never had a row written.
 * The first is a workspace decision to explain; the second is the normal state
 * of every module the org's plan already includes. Anything that has to tell a
 * human WHY something is locked needs the two kept apart.
 */
export type ModuleSubscriptionState = 'enabled' | 'disabled' | 'none';

export interface ModuleCatalogEntry {
  moduleId: string;
  name: string;
  description: string | null;
  category: string | null;
  icon: string | null;
  path: string | null;
  isEnabled: boolean; // true if org has active subscription
  /** The subscription row's own state — see {@link ModuleSubscriptionState}. */
  subscriptionState: ModuleSubscriptionState;
  isAvailable: boolean; // true if tier + industry match
  requiredTier: string | null; // lowest tier that includes this module
  sortOrder: number;
}

// Tier hierarchy for comparison
const TIER_LEVELS: Record<string, number> = {
  free: 0,
  standard: 1,
  professional: 2,
  enterprise: 3,
};

// ═══════════════════════════════════════════════════════════════════════════════
// LICENSE QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load license info for an organization.
 * This is cached in-process per request (via req.licenseInfo).
 */
export async function getLicenseInfo(organizationId: number): Promise<LicenseInfo | null> {
  try {
    const [orgResult, modulesResult] = await Promise.all([
      pool.query(
        `SELECT id, tier, industry_mode, max_users, max_projects, max_storage
         FROM organizations WHERE id = $1`,
        [organizationId]
      ),
      pool.query(
        `SELECT module_id FROM module_subscriptions
         WHERE organization_id = $1 AND enabled = true`,
        [organizationId]
      ),
    ]);

    if (orgResult.rows.length === 0) return null;

    const org = orgResult.rows[0];
    return {
      organizationId: org.id,
      tier: org.tier || 'standard',
      industryMode: org.industry_mode || 'biotech',
      enabledModules: modulesResult.rows.map((r: any) => r.module_id),
      maxUsers: org.max_users || 5,
      maxProjects: org.max_projects || 10,
      maxStorageGB: org.max_storage || 5,
    };
  } catch (error) {
    console.warn('[LicenseManager] Failed to load license:', error);
    return null;
  }
}

/**
 * Get the full module catalog for an organization, showing which modules
 * are enabled, available, and at what tier.
 *
 * Retired modules are excluded. `available_modules` was originally seeded with
 * a module taxonomy the product no longer ships ('cmc-wizard', 'doc-canvas',
 * '510k-submission', ...); db/migrations/20260810_reconcile_module_catalog.sql
 * re-keys the catalog to real surface ids and marks those legacy rows
 * {"deprecated": true}. They are MARKED rather than deleted because
 * module_subscriptions.module_id references this table ON DELETE CASCADE, so
 * deleting them would destroy each organization's entitlement history. The rows
 * therefore stay (FK satisfied, history intact) and are filtered out here so the
 * catalog only ever advertises modules a user can actually open.
 */
export async function getModuleCatalog(organizationId: number): Promise<ModuleCatalogEntry[]> {
  try {
    const license = await getLicenseInfo(organizationId);
    if (!license) return [];

    const orgTierLevel = TIER_LEVELS[license.tier] ?? 1;

    const result = await pool.query(
      `SELECT am.module_id, am.name, am.description, am.category, am.icon,
              am.path, am.sort_order, am.metadata,
              ms.enabled as is_subscribed
       FROM available_modules am
       LEFT JOIN module_subscriptions ms
         ON ms.module_id = am.module_id AND ms.organization_id = $1
       WHERE COALESCE((am.metadata->>'deprecated')::boolean, false) = false
       ORDER BY am.sort_order`,
      [organizationId]
    );

    return result.rows.map((m: any) => {
      const meta = m.metadata || {};
      const requiredTiers: string[] = meta.tiers || [];
      const allowedIndustries: string[] = meta.industries || [];

      // Find the lowest tier that includes this module
      const lowestTier = requiredTiers.reduce<string | null>((lowest, t) => {
        if (!lowest) return t;
        return (TIER_LEVELS[t] ?? 99) < (TIER_LEVELS[lowest] ?? 99) ? t : lowest;
      }, null);

      // Is this module available for the org's tier + industry?
      const tierMatch =
        requiredTiers.length === 0 ||
        requiredTiers.some(t => orgTierLevel >= (TIER_LEVELS[t] ?? 99));
      const industryMatch =
        allowedIndustries.length === 0 || allowedIndustries.includes(license.industryMode);

      return {
        moduleId: m.module_id,
        name: m.name,
        description: m.description,
        category: m.category,
        icon: m.icon,
        path: m.path,
        isEnabled: m.is_subscribed === true,
        // LEFT JOIN: null means no subscription row at all, which is NOT the
        // same as a row that says false. See ModuleSubscriptionState.
        subscriptionState:
          m.is_subscribed === true ? 'enabled' : m.is_subscribed === false ? 'disabled' : 'none',
        isAvailable: tierMatch && industryMatch,
        requiredTier: lowestTier,
        sortOrder: m.sort_order || 0,
      };
    });
  } catch (error) {
    console.warn('[LicenseManager] Failed to load catalog:', error);
    return [];
  }
}

/**
 * Check if a specific module is accessible to an organization.
 */
export async function canAccessModule(
  organizationId: number,
  moduleId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const license = await getLicenseInfo(organizationId);
  if (!license) {
    return { allowed: false, reason: 'Organization not found' };
  }

  // Check if explicitly enabled
  if (license.enabledModules.includes(moduleId)) {
    return { allowed: true };
  }

  // Check tier availability
  const moduleResult = await pool.query(
    `SELECT metadata FROM available_modules WHERE module_id = $1`,
    [moduleId]
  );

  if (moduleResult.rows.length === 0) {
    return { allowed: false, reason: `Module '${moduleId}' does not exist` };
  }

  const meta = moduleResult.rows[0].metadata || {};
  const requiredTiers: string[] = meta.tiers || [];
  const allowedIndustries: string[] = meta.industries || [];
  const orgTierLevel = TIER_LEVELS[license.tier] ?? 1;

  if (
    requiredTiers.length > 0 &&
    !requiredTiers.some(t => orgTierLevel >= (TIER_LEVELS[t] ?? 99))
  ) {
    const minTier = requiredTiers.reduce((min, t) => {
      return (TIER_LEVELS[t] ?? 99) < (TIER_LEVELS[min] ?? 99) ? t : min;
    }, requiredTiers[0]);
    return {
      allowed: false,
      reason: `Module '${moduleId}' requires ${minTier} tier or higher (current: ${license.tier})`,
    };
  }

  if (allowedIndustries.length > 0 && !allowedIndustries.includes(license.industryMode)) {
    return {
      allowed: false,
      reason: `Module '${moduleId}' is not available for ${license.industryMode} industry`,
    };
  }

  // Available but not subscribed — auto-enable if within tier
  return { allowed: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE-LEVEL TIER GATING (DTC model)
// Maps individual features to minimum required tier.
// ═══════════════════════════════════════════════════════════════════════════════

export const FEATURE_TIER_MAP: Record<string, string> = {
  // Free tier features
  chat: 'free',
  csr_search: 'free',
  basic_intelligence: 'free',
  project_management: 'free',

  // Standard tier (Startup Biotech $499/mo)
  deep_research: 'standard',
  csr_builder: 'standard',
  ectd_authoring: 'standard',
  fda_connector: 'standard',
  ema_connector: 'standard',
  pubmed_connector: 'free',
  clinical_trials_gov: 'free',
  ana_platform_control: 'standard',       // Ana agentic platform control
  ana_settings_management: 'standard',     // Ana can manage org settings
  ana_project_management: 'standard',      // Ana can create/configure projects
  ana_module_control: 'standard',          // Ana can toggle feature modules
  ana_onboarding: 'standard',             // Ana can run org onboarding
  ana_compliance_config: 'standard',       // Ana can set compliance defaults
  ana_ai_config: 'standard',              // Ana can configure AI behavior
  ana_usage_analysis: 'standard',          // Ana can analyze usage & recommend
  safety_narrative: 'standard',
  intelligent_reports: 'standard',

  // Professional tier (Growth $1,499/mo)
  ctd_builder: 'professional',
  multi_agency_export: 'professional',
  veeva_connector: 'professional',
  medidata_connector: 'professional',
  pmda_connector: 'professional',
  nmpa_connector: 'professional',
  document_builder: 'professional',
  biostatistics: 'professional',
  statistical_defensibility: 'professional',
  cmc_blueprint: 'professional',
  ana_proactive_mode: 'professional',      // Ana proactive regulatory alerts
  ana_auto_remediate: 'professional',      // Ana auto-fix detected issues

  /**
   * Part 11 electronic signature. STANDARD, and it must not move up.
   *
   * This read 'enterprise' until 2026-08-23, which would have made the
   * standard plan unsellable the moment anything enforced it. Every governed
   * action in this product manifests an e-signature: approve a document,
   * accept an AnA draft, transmit a submission. A tier that cannot e-sign is a
   * tier that cannot approve anything, which in a GxP tool is not a reduced
   * product — it is not a product.
   *
   * The market boundary runs the other way from horizontal SaaS, and that
   * inversion is the whole point. In horizontal SaaS the enterprise wall is
   * built from audit logs, SSO/SCIM, residency and SLA — governance is the
   * upsell. In life sciences, audit trail, e-signature, Part 11 and immutable
   * versioned history are the ENTRY TICKET: a system of record without them
   * cannot be sold at any tier, so gating them buys nothing and costs the
   * plan. (The one vendor found gating an audit trail behind a paid tier is an
   * analysis tool, not a system of record. We are the system of record.)
   *
   * Nothing enforced this — no requireFeature('electronic_signatures') call
   * exists — so no customer was ever refused. That is exactly why it was worth
   * correcting now rather than when a route finally mounted the gate.
   *
   * What DOES belong at enterprise is below: identity (SSO/SCIM), the API, and
   * autonomous agency. Those are the transferable enterprise gates.
   */
  electronic_signatures: 'standard',

  // Enterprise tier
  unlimited_research: 'enterprise',
  api_access: 'enterprise',
  sso: 'enterprise',
  custom_integrations: 'enterprise',
  ana_autonomous_actions: 'enterprise',    // Full autonomous agentic control
};

/**
 * Check if a feature is available for a given tier.
 */
export function isFeatureAvailable(feature: string, orgTier: string): boolean {
  const requiredTier = FEATURE_TIER_MAP[feature];
  if (!requiredTier) return true; // Unknown features default to available
  const requiredLevel = TIER_LEVELS[requiredTier] ?? 99;
  const currentLevel = TIER_LEVELS[orgTier] ?? 0;
  return currentLevel >= requiredLevel;
}

/**
 * Get all features available for a tier.
 */
export function getAvailableFeatures(orgTier: string): string[] {
  return Object.entries(FEATURE_TIER_MAP)
    .filter(([, requiredTier]) => {
      const requiredLevel = TIER_LEVELS[requiredTier] ?? 99;
      const currentLevel = TIER_LEVELS[orgTier] ?? 0;
      return currentLevel >= requiredLevel;
    })
    .map(([feature]) => feature);
}

/**
 * Middleware that gates a route behind a specific feature.
 * Usage: router.get('/deep-research', requireFeature('deep_research'), handler)
 */
export function requireFeature(feature: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const license = (req as any).licenseInfo as LicenseInfo | undefined;
    const tier = license?.tier || 'free';

    if (!isFeatureAvailable(feature, tier)) {
      const requiredTier = FEATURE_TIER_MAP[feature] || 'professional';
      return res.status(403).json({
        error: 'Feature not available on your current plan',
        code: 'FEATURE_TIER_REQUIRED',
        feature,
        requiredTier,
        currentTier: tier,
        upgradeUrl: '/settings/subscription',
      });
    }

    next();
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPRESS MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Middleware that loads license info onto the request.
 * Must run after auth middleware.
 */
export function loadLicense() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).tenantContext?.organizationId || (req as any).user?.organizationId;

      if (orgId) {
        const license = await getLicenseInfo(Number(orgId));
        (req as any).licenseInfo = license;
      }
    } catch {
      // Non-blocking — proceed without license info
    }
    next();
  };
}

/**
 * Middleware factory that gates a route behind a module subscription.
 * Usage: router.get('/cmc-wizard', requireModule('cmc-wizard'), handler)
 */
export function requireModule(moduleId: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const orgId = (req as any).tenantContext?.organizationId || (req as any).user?.organizationId;

    if (!orgId) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const { allowed, reason } = await canAccessModule(Number(orgId), moduleId);

    if (!allowed) {
      // Log the access denial through auditService, not a raw INSERT: the raw
      // form wrote a row with NULL sha256_chain / payload_hash / hmac_seal —
      // a row that sits IN audit_logs but OUTSIDE the hash chain, invisible to
      // the chain verifier and so not tamper-evident. auditService computes
      // the chain link and seal (§11.10(e), §11.70).
      // Non-critical: an audit-trail outage must not change the access
      // decision itself, which has already been made above. But the catch that
      // used to say so could never run — `logAction` resolves normally on a
      // persistence failure and is documented never to reject — so a denied
      // module access that went unrecorded left no trace at all. The decision
      // still stands regardless; what changes is that losing its record is now
      // visible.
      const denialAudit = await auditService.logAction({
        organizationId: orgId,
        userId: (req as any).user?.id || (req as any).userId,
        action: 'module_access_denied',
        resourceType: 'module_subscriptions',
        resourceId: moduleId,
        details: { reason, tier: (req as any).licenseInfo?.tier },
      });
      if (!denialAudit.persisted) {
        logger.warn('Module access-denial audit row was not persisted', {
          organizationId: orgId,
          moduleId,
          reason,
          auditError: denialAudit.error ?? 'no durable store accepted the row',
        });
      }

      return res.status(403).json({
        error: 'Module access denied',
        code: 'MODULE_NOT_LICENSED',
        module: moduleId,
        reason,
        upgradeUrl: '/settings/subscription',
      });
    }

    next();
  };
}

/**
 * Middleware that gates a route behind a minimum tier level.
 * Usage: router.get('/advanced-analytics', requireTier('professional'), handler)
 */
export function requireTier(minimumTier: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const license = (req as any).licenseInfo as LicenseInfo | undefined;

    if (!license) {
      return res.status(401).json({ error: 'License information not available' });
    }

    const requiredLevel = TIER_LEVELS[minimumTier] ?? 99;
    const currentLevel = TIER_LEVELS[license.tier] ?? 0;

    if (currentLevel < requiredLevel) {
      return res.status(403).json({
        error: 'Insufficient subscription tier',
        code: 'TIER_REQUIRED',
        requiredTier: minimumTier,
        currentTier: license.tier,
        upgradeUrl: '/settings/subscription',
      });
    }

    next();
  };
}

/**
 * Check user quota (max projects).
 *
 * NOTE ON SCOPE: this counts the legacy integer-keyed `projects` table. The
 * shipped UI does not create rows there — the v2 wizard and the program
 * workbench create `regulatory_programs` — so for any org on the current UI
 * this returns currentCount 0 and never trips. It is kept unchanged because
 * entitlements-service.ts and the module-subscriptions route surface its
 * numbers in usage panels and their expectations are built on this shape.
 * For enforcement on a create path, call checkProgramQuota below, which counts
 * the live entity and fails closed.
 */
export async function checkProjectQuota(organizationId: number): Promise<{
  withinQuota: boolean;
  currentCount: number;
  maxAllowed: number;
}> {
  try {
    const [licenseResult, countResult] = await Promise.all([
      pool.query(`SELECT max_projects FROM organizations WHERE id = $1`, [organizationId]),
      pool.query(`SELECT COUNT(*) as cnt FROM projects WHERE organization_id = $1`, [
        organizationId,
      ]),
    ]);

    const maxAllowed = licenseResult.rows[0]?.max_projects || 10;
    const currentCount = parseInt(countResult.rows[0]?.cnt, 10) || 0;

    return {
      withinQuota: currentCount < maxAllowed,
      currentCount,
      maxAllowed,
    };
  } catch {
    return { withinQuota: true, currentCount: 0, maxAllowed: 10 }; // Fail-open on quota check
  }
}

/** Default seats when an organization has no explicit entitlement recorded. */
const DEFAULT_MAX_PROGRAMS = 10;

export interface ProgramQuota {
  withinQuota: boolean;
  currentCount: number;
  maxAllowed: number;
  /** True when the entitlement is the codebase's negative "unlimited" sentinel. */
  unlimited: boolean;
}

/**
 * Check the licensed program quota for an organization.
 *
 * The enforceable counterpart to checkProjectQuota: it counts
 * regulatory_programs, the entity the shipped UI actually creates, excluding
 * soft-deleted and archived rows so a closed-out program stops holding a seat.
 *
 * A quota check that fails open is not a control. checkProjectQuota returns
 * { withinQuota: true, ... } from its catch, so a dropped connection or an RLS
 * denial silently grants unlimited programs — the one moment the check matters
 * most is the moment it stops working. Here an unreadable count denies.
 *
 * Three cases this has to get right, because each one is a way to be badly
 * wrong in production rather than merely imprecise:
 *
 *   max_projects < 0   UNLIMITED. billing.ts:91 documents `-1 = unlimited` and
 *                      the enterprise tiers use it. Read naively, `-1` is a
 *                      truthy entitlement and `count < -1` is never true, so
 *                      the highest-paying tier would be the only one that could
 *                      never create a project again.
 *   max_projects = 0   ZERO seats — a suspended org or an expired trial. `|| `
 *                      treats it as absent and hands back the default 10, which
 *                      is the fail-open shape this function exists to remove.
 *                      Only NULL means "not recorded".
 *   42P01              NOT a quota decision. The store is not provisioned; the
 *                      caller owns that contract (503 PENDING_STORE). Swallowing
 *                      it as a denial makes that documented response unreachable
 *                      and reports a missing table as a billing problem.
 */
export async function checkProgramQuota(organizationId: number): Promise<ProgramQuota> {
  let licenseRows: Array<{ max_projects: number | null }>;
  let countRows: Array<{ cnt: number }>;

  try {
    const [licenseResult, countResult] = await Promise.all([
      pool.query(`SELECT max_projects FROM organizations WHERE id = $1`, [organizationId]),
      pool.query(
        // Archived and soft-deleted programs do not hold a seat. The refusal
        // this count produces tells the user to "archive a program or raise the
        // plan limit", so archiving has to actually release one — otherwise the
        // error names a remedy that does nothing.
        `SELECT COUNT(*)::int AS cnt FROM regulatory_programs
          WHERE organization_id = $1 AND deleted_at IS NULL AND status <> 'archived'`,
        [organizationId]
      ),
    ]);
    licenseRows = licenseResult.rows;
    countRows = countResult.rows;
  } catch (error) {
    if ((error as { code?: string })?.code === '42P01') throw error;
    logger.error('Program quota check failed — denying create (fail-closed)', {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { withinQuota: false, currentCount: 0, maxAllowed: 0, unlimited: false };
  }

  const orgRow = licenseRows[0];
  if (!orgRow) {
    logger.error('Program quota check found no organization row — denying create', {
      organizationId,
    });
    return { withinQuota: false, currentCount: 0, maxAllowed: 0, unlimited: false };
  }

  const currentCount = Number(countRows[0]?.cnt ?? 0);
  const raw = orgRow.max_projects;
  const maxAllowed = raw == null ? DEFAULT_MAX_PROGRAMS : Number(raw);
  const unlimited = maxAllowed < 0;

  return {
    withinQuota: unlimited || currentCount < maxAllowed,
    currentCount,
    maxAllowed,
    unlimited,
  };
}

/**
 * Check user quota (max users in org).
 */
export async function checkUserQuota(organizationId: number): Promise<{
  withinQuota: boolean;
  currentCount: number;
  maxAllowed: number;
}> {
  try {
    const [licenseResult, countResult] = await Promise.all([
      pool.query(`SELECT max_users FROM organizations WHERE id = $1`, [organizationId]),
      pool.query(`SELECT COUNT(*) as cnt FROM organization_users WHERE organization_id = $1`, [
        organizationId,
      ]),
    ]);

    const maxAllowed = licenseResult.rows[0]?.max_users || 5;
    const currentCount = parseInt(countResult.rows[0]?.cnt, 10) || 0;

    return {
      withinQuota: currentCount < maxAllowed,
      currentCount,
      maxAllowed,
    };
  } catch {
    return { withinQuota: true, currentCount: 0, maxAllowed: 5 };
  }
}
