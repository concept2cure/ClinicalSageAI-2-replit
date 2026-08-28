/**
 * Navigation entitlements — what the left rail is allowed to claim.
 *
 * THE DEFECT THIS CLOSES. The v2 shell's rail shipped with a hard-coded
 * fixture:
 *
 *     export const LICENSE_UNLICENSED: string[] = ['labeling', 'risk', 'pdev'];
 *     export const isLicensed = (id: string) => !LICENSE_UNLICENSED.includes(id);
 *
 * — three module ids named in client source, identical for every tenant, with a
 * comment promising real wiring "in Phase 6". Nothing ever called `isLicensed`,
 * so the rail showed every destination to every organization regardless of what
 * they had bought, and the admin toggle that already exists
 * (`PUT /api/module-subscriptions/:moduleId/toggle`, and Master Admin's
 * `tenant.module_toggle`) changed nothing a user could see. This module is the
 * real answer, resolved per organization from persisted state.
 *
 * WHAT DECIDES. Four inputs, in this order:
 *
 *   1. MASTER ADMIN — the platform owner (./master-admin) is not a customer of
 *      the platform, so no packaging applies and every module resolves
 *      entitled. This widens the entitlement verdict only; it never changes
 *      which organization the request is scoped to.
 *   2. THE SUBSCRIPTION ROW — `module_subscriptions` for this org. `enabled`
 *      is an explicit grant; `false` is an explicit workspace decision to turn
 *      the module off, which locks it with a different explanation than an
 *      upsell (nobody needs to buy anything — an admin switched it off).
 *   3. TIER + INDUSTRY — `available_modules.metadata` (`tiers`, `industries`)
 *      against the org's plan. A module the plan includes is entitled with or
 *      without a subscription row: a customer's rail must not go dark because
 *      provisioning has not written rows yet.
 *   4. NOT LICENSABLE — a destination with no catalog row is unconditionally
 *      available. That is deliberate and load-bearing: `audit-trail` and
 *      `part11-console` are excluded from the catalog on purpose (21 CFR
 *      §11.10(e) — the audit record may not be something an organization can
 *      be sold or an admin can switch off), and so are shell destinations that
 *      are not modules at all (AnA Command, the Apps catalog itself).
 *
 * HONESTY UNDER FAILURE. A lock badge is a claim about a customer's contract.
 * If the catalog cannot be read, this returns `resolved: false` and NO
 * verdicts, so the client renders no locks rather than inventing them — a
 * paying customer told they do not own what they paid for is a worse failure
 * than an unlocked rail. Note also that nav visibility is presentation, not
 * enforcement: route-level gating (`requireModule`, `requireEntitlement`,
 * `requireFeature`) is the security boundary and is unaffected by this module.
 *
 * @module server/services/entitlements/navigation-entitlements
 */

import {
  getLicenseInfo,
  getModuleCatalog,
  type ModuleCatalogEntry,
} from '../license-manager.js';
import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('navigation-entitlements');

/**
 * Ascending tier rank. Mirrors `TIER_LEVELS` in license-manager.ts and
 * `TIER_RANK` in mdx-entitlements.ts — the one canonical ordering the billing
 * code keys on (free 0 · standard 1 · professional 2 · enterprise 3).
 */
const TIER_RANK: Record<string, number> = {
  free: 0,
  standard: 1,
  professional: 2,
  enterprise: 3,
};

/**
 * Why a destination resolved the way it did. Every value is something a human
 * can be told without inventing anything:
 *
 *   master_admin — the platform owner; packaging does not apply
 *   subscribed   — an explicit enabled subscription row
 *   included     — the organization's plan covers it (no row needed)
 *   disabled     — an admin switched it off for this workspace
 *   tier         — the plan does not reach the module's minimum tier
 *   industry     — the module is not offered for this org's industry mode
 */
export type NavEntitlementSource =
  | 'master_admin'
  | 'subscribed'
  | 'included'
  | 'disabled'
  | 'tier'
  | 'industry';

export interface NavSurfaceEntitlement {
  /** Module id — the SAME id space as the shell's surfaces (see
   *  db/migrations/20260810_reconcile_module_catalog.sql). */
  id: string;
  /** The module's catalog name, so a locked-state panel names the real thing. */
  label: string;
  entitled: boolean;
  source: NavEntitlementSource;
  /** Lowest tier that includes this module; null when unrestricted. */
  requiredTier: string | null;
}

export interface NavEntitlements {
  organizationId: number;
  /** The org's plan tier, or null when it could not be read. */
  tier: string | null;
  /** The org's industry mode, or null when it could not be read. */
  industryMode: string | null;
  /** True when this request holds the platform-owner grant. */
  masterAdmin: boolean;
  /**
   * False when the catalog could not be read. The client MUST NOT render any
   * lock state on a false — there is no verdict to render, and a fabricated
   * one is worse than none.
   */
  resolved: boolean;
  /** One verdict per licensable module. Ids absent here are not licensable. */
  surfaces: NavSurfaceEntitlement[];
}

/**
 * PURE: decide one module's verdict.
 *
 * Exported for its own tests — the branch that matters most (a plan-included
 * module with no subscription row staying UNLOCKED) is invisible in an
 * integration test against a fully-provisioned org, which is exactly the shape
 * of deployment where a fail-closed mistake here would go unnoticed until a
 * customer's rail went dark.
 */
export function decideNavEntitlement(
  entry: ModuleCatalogEntry,
  opts: { masterAdmin: boolean; tier: string | null },
): NavSurfaceEntitlement {
  const base = {
    id: entry.moduleId,
    label: entry.name,
    requiredTier: entry.requiredTier,
  };

  if (opts.masterAdmin) {
    return { ...base, entitled: true, source: 'master_admin' };
  }
  if (entry.subscriptionState === 'enabled') {
    return { ...base, entitled: true, source: 'subscribed' };
  }
  if (entry.subscriptionState === 'disabled') {
    return { ...base, entitled: false, source: 'disabled' };
  }
  if (entry.isAvailable) {
    return { ...base, entitled: true, source: 'included' };
  }

  // Not available, and no row explains it. `isAvailable` is tier AND industry,
  // so name whichever one actually failed rather than reporting a generic
  // "not available": an org told to upgrade when the real reason is that the
  // module is not offered for their industry would buy a plan that changes
  // nothing.
  const tierRank = opts.tier != null ? TIER_RANK[opts.tier] : undefined;
  const requiredRank = entry.requiredTier != null ? TIER_RANK[entry.requiredTier] : undefined;
  const belowTier =
    tierRank !== undefined && requiredRank !== undefined && tierRank < requiredRank;

  return { ...base, entitled: false, source: belowTier ? 'tier' : 'industry' };
}

/**
 * Resolve every licensable destination for one organization.
 *
 * Read-only. Never throws: a failure degrades to `resolved: false` with no
 * verdicts, which the client renders as "no lock claims" (see the module note).
 */
export async function resolveNavEntitlements(
  organizationId: number,
  opts: { masterAdmin: boolean },
): Promise<NavEntitlements> {
  const unresolved: NavEntitlements = {
    organizationId,
    tier: null,
    industryMode: null,
    masterAdmin: opts.masterAdmin,
    resolved: false,
    surfaces: [],
  };

  let license: Awaited<ReturnType<typeof getLicenseInfo>> = null;
  let catalog: ModuleCatalogEntry[] = [];
  try {
    [license, catalog] = await Promise.all([
      getLicenseInfo(organizationId),
      getModuleCatalog(organizationId),
    ]);
  } catch (err) {
    logger.error('catalog read failed — reporting no verdict', {
      organizationId,
      err: err instanceof Error ? err.message : String(err),
    });
    return unresolved;
  }

  // Both helpers swallow their own errors and return null / [] — so an empty
  // catalog is indistinguishable from a failed read here, and a deployment
  // whose catalog migration has not run yet lands in the same place. Either
  // way there is nothing to base a lock on, so say so instead of reporting a
  // clean sheet of verdicts nobody computed.
  if (catalog.length === 0) {
    logger.warn('module catalog empty — reporting no verdict', { organizationId });
    return unresolved;
  }

  const tier = license?.tier ?? null;
  return {
    organizationId,
    tier,
    industryMode: license?.industryMode ?? null,
    masterAdmin: opts.masterAdmin,
    resolved: true,
    surfaces: catalog.map((entry) =>
      decideNavEntitlement(entry, { masterAdmin: opts.masterAdmin, tier }),
    ),
  };
}
