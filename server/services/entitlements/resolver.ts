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
 * degrades that layer to empty rather than failing the whole resolution.
 *
 * @module server/services/entitlements/resolver
 */

import { pool } from '../../db.js';
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
  /** Which layer decided: 'tier' when the plan unlocks it, 'toggle' when a flag granted it below tier. */
  source: 'tier' | 'toggle';
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
  /** True when the flag applies to this org (globally enabled or org-listed). */
  appliesToOrg: boolean;
}

export interface ResolvedCapabilities {
  organizationId: number;
  tier: Tier;
  features: ResolvedFeature[];
  modules: ResolvedModule[];
  toggles: ResolvedToggle[];
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
 * Exported for unit tests; resolveCapabilities feeds it live rows.
 */
export function composeFeatures(
  tier: Tier,
  orgGrantedToggleKeys: ReadonlySet<string>,
): ResolvedFeature[] {
  return entitlementMatrix().map(row => {
    const byTier = isEntitled(row.feature, tier);
    const byToggle = !byTier && orgGrantedToggleKeys.has(row.feature);
    return {
      feature: row.feature,
      label: row.label,
      minTier: row.minTier,
      enabled: byTier || byToggle,
      source: byToggle ? 'toggle' as const : 'tier' as const,
    };
  });
}

/** Resolve the org's effective capabilities across all three layers. */
export async function resolveCapabilities(organizationId: number): Promise<ResolvedCapabilities> {
  // Layer 0: plan tier.
  let tier: Tier = 'standard';
  try {
    const res = await pool.query<{ tier: string | null }>(
      `SELECT tier FROM organizations WHERE id = $1`,
      [organizationId],
    );
    if (res.rows.length && isTier(res.rows[0].tier)) tier = res.rows[0].tier as Tier;
  } catch (err) {
    logger.error('tier lookup failed; defaulting to standard', {
      organizationId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // Layer 1: feature toggles (global or org-granted).
  let toggles: ResolvedToggle[] = [];
  const granted = new Set<string>();
  try {
    const res = await pool.query(
      `SELECT feature_key, enabled, enabled_for_organization_ids FROM feature_toggles`,
    );
    toggles = res.rows.map((r: any) => {
      const applies = toggleAppliesToOrg(
        { enabled: r.enabled === true, enabledForOrganizationIds: r.enabled_for_organization_ids },
        organizationId,
      );
      if (applies) granted.add(String(r.feature_key));
      return { featureKey: String(r.feature_key), enabled: r.enabled === true, appliesToOrg: applies };
    });
  } catch (err) {
    logger.error('feature_toggles lookup failed; continuing without flags', {
      organizationId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // Layer 2: module subscriptions (the live client gating path).
  let modules: ResolvedModule[] = [];
  try {
    const res = await pool.query(
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
  } catch (err) {
    logger.error('module_subscriptions lookup failed; continuing without modules', {
      organizationId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    organizationId,
    tier,
    features: composeFeatures(tier, granted),
    modules,
    toggles,
  };
}
