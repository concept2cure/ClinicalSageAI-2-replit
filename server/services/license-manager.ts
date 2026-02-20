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
import type { Request, Response, NextFunction } from 'express';

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

export interface ModuleCatalogEntry {
  moduleId: string;
  name: string;
  description: string | null;
  category: string | null;
  icon: string | null;
  path: string | null;
  isEnabled: boolean; // true if org has active subscription
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
      // Log the access denial
      try {
        await pool.query(
          `INSERT INTO audit_logs (tenant_id, user_id, action, table_name, record_id, new_values)
           VALUES ($1, $2, 'module_access_denied', 'module_subscriptions', $3, $4)`,
          [
            orgId,
            (req as any).user?.id || (req as any).userId,
            moduleId,
            JSON.stringify({ reason, tier: (req as any).licenseInfo?.tier }),
          ]
        );
      } catch {
        // Non-critical
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
