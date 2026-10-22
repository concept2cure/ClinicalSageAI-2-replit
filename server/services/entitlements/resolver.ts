/**
 * Unified capability resolver — one answer to "what can this org use?".
 *
 * The platform previously had three disconnected entitlement layers:
 *   1. the tier matrix (mdx-entitlements.ts — pure, per-plan feature gates),
 *   2. module_subscriptions (per-org module on/off, the live client gating
 *      path via /api/module-subscriptions),
 *   3. feature_toggles (global/per-org capability flags, admin-editable).
 *
 * This resolver composes all three into a single effective-capabilities view
 * (the shape a settings "Capabilities" page renders, mirroring Anthropic's
 * per-capability toggles):
 *   - features: the tier matrix, with feature_toggles overrides applied — a
 *     toggle whose key matches a FeatureKey wins over the tier verdict when
 *     it is enabled globally or names this org. Toggles can only GRANT
 *     (pilot/beta access below tier); revoking a tier entitlement is a plan
 *     change, not a flag flip, so absence of a toggle never disables.
 *   - modules: enabled module subscriptions (the existing gating path).
 *   - toggles: the raw flags relevant to this org, for admin surfaces.
 *
 * Read-only and fail-soft per layer: a missing table (pre-migration deploy)
 * degrades that layer to empty rather than failing the whole resolution, and
 * the layer says so (`tierResolved` / `togglesResolved` / `modulesResolved`).
 * An unread plan is `tier: null` and grants nothing; it is never a fallback plan.
 *
 * @module server/services/entitlements/resolver
 */

import { pool } from '../../db.js';
import type { RequestSqlClient } from '../../db/requestDb.js';
import { createScopedLogger } from '../../utils/logger.js';
import { entitlementMatrix, isEntitled, isTier } from './mdx-entitlements.js';
import type { Tier } from './types';

const logger = createScopedLogger('entitlements-resolver');

export interface ResolvedFeature {
  feature: string;
  label: string;
  minTier: Tier;
  /** The composed verdict: tier entitlement OR toggle grant. */
  enabled: boolean;
  /** Which layer decided: 'tier' when the plan unlocks it, 'toggle' when a flag granted it below tier,
   *  'unresolved' when the plan was not read and no toggle granted it (not enabled, and not a plan verdict). */
  source: 'tier' | 'toggle' | 'unresolved';
}

export interface ResolvedModule {
  moduleId: string;
  name: string | null;
  category: string | null;
  enabled: boolean;
}

export interface ResolvedToggle {
  featureKey: string;
  enabled: boolean;
  /** Always true in resolver output — flags that do not apply to the org
   *  are dropped before returning, so one tenant never sees another
   *  tenant's pilot flags or the platform's global flag catalog. */
  appliesToOrg: boolean;
}

export interface ResolvedCapabilities {
  organizationId: number;
  /** The recorded plan, or null when it could not be read (failed query, no
   *  row, several rows, or an unrecognized value). Never a fallback plan. */
  tier: Tier | null;
  /** True only when exactly one organization row records a recognized tier
   *  (exactly when `tier` is not null). */
  tierResolved: boolean;
  features: ResolvedFeature[];
  modules: ResolvedModule[];
  /** False when module_subscriptions could not be read: `modules` is then
   *  empty because nothing was read, not because none is subscribed. */
  modulesResolved: boolean;
  toggles: ResolvedToggle[];
  /** False when feature_toggles could not be read: `toggles` is then empty
   *  because nothing was read, and no toggle grant is applied. */
  togglesResolved: boolean;
}

/**
 * PURE: does a feature_toggles row grant access for this org? A toggle
 * applies when it is enabled globally, or the org is in its allowlist.
 */
export function toggleAppliesToOrg(
  toggle: { enabled: boolean; enabledForOrganizationIds?: number[] | null },
  organizationId: number,
): boolean {
  if (toggle.enabled) return true;
  return Array.isArray(toggle.enabledForOrganizationIds)
    && toggle.enabledForOrganizationIds.includes(organizationId);
}

/**
 * PURE: compose the tier matrix with toggle grants into effective features.
 * A null tier (plan not read) unlocks nothing; a toggle grant still counts.
 * Exported for unit tests; resolveCapabilities feeds it live rows.
 */
export function composeFeatures(
  tier: Tier | null,
  orgGrantedToggleKeys: ReadonlySet<string>,
): ResolvedFeature[] {
  return entitlementMatrix().map(row => {
    const byTier = tier !== null && isEntitled(row.feature, tier);
    const byToggle = !byTier && orgGrantedToggleKeys.has(row.feature);
    return {
      feature: row.feature,
      label: row.label,
      minTier: row.minTier,
      enabled: byTier || byToggle,
      source: byToggle ? 'toggle' as const : tier === null ? 'unresolved' as const : 'tier' as const,
    };
  });
}

/** Resolve the org's effective capabilities across all three layers. */
export async function resolveCapabilities(
  organizationId: number,
  executor?: RequestSqlClient,
): Promise<ResolvedCapabilities> {
  const q: RequestSqlClient = executor ?? pool;
  // Layer 0: plan tier. 2026-10-15: an unread plan used to be returned as
  // 'standard' and unlocked the standard-tier features, though 'free' ranks
  // below it; an unread plan is now null and unlocks nothing.
  let tier: Tier | null = null;
  try {
    const res = await q.query(
      `SELECT tier FROM organizations WHERE id = $1`,
      [organizationId],
    );
    if (Array.isArray(res.rows) && res.rows.length === 1 && isTier(res.rows[0]?.tier)) {
      tier = res.rows[0].tier;
    }
  } catch (err) {
    logger.error('tier lookup failed; plan not read', {
      organizationId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // Layer 1: feature toggles (global or org-granted).
  const toggles: ResolvedToggle[] = [];
  const granted = new Set<string>();
  let togglesResolved = false;
  try {
    const res = await q.query(
      `SELECT feature_key, enabled, enabled_for_organization_ids FROM feature_toggles`,
    );
    // Tenant-scope the output: only flags that apply to THIS org are
    // returned. Returning the whole table would disclose unreleased pilot
    // flags and other tenants' rollout state to any authenticated user.
    for (const r of res.rows) {
      const applies = toggleAppliesToOrg(
        { enabled: r.enabled === true, enabledForOrganizationIds: Array.isArray(r.enabled_for_organization_ids)
          ? r.enabled_for_organization_ids : null },
        organizationId,
      );
      if (!applies) continue;
      granted.add(String(r.feature_key));
      toggles.push({ featureKey: String(r.feature_key), enabled: r.enabled === true, appliesToOrg: true });
    }
    togglesResolved = true;
  } catch (err) {
    logger.error('feature_toggles lookup failed; toggles not read', {
      organizationId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // Layer 2: module subscriptions (the live client gating path).
  let modules: ResolvedModule[] = [];
  let modulesResolved = false;
  try {
    const res = await q.query(
      `SELECT ms.module_id, ms.enabled, am.name, am.category
         FROM module_subscriptions ms
         LEFT JOIN available_modules am ON am.module_id = ms.module_id
        WHERE ms.organization_id = $1
        ORDER BY am.sort_order NULLS LAST, ms.module_id`,
      [organizationId],
    );
    modules = res.rows.map((r: any) => ({
      moduleId: String(r.module_id),
      name: r.name ?? null,
      category: r.category ?? null,
      enabled: r.enabled === true,
    }));
    modulesResolved = true;
  } catch (err) {
    logger.error('module_subscriptions lookup failed; modules not read', {
      organizationId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    organizationId,
    tier,
    tierResolved: tier !== null,
    features: composeFeatures(tier, granted),
    modules,
    modulesResolved,
    toggles,
    togglesResolved,
  };
}
