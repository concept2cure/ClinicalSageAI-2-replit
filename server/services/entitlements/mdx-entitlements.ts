/**
 * MDX / global-capabilities entitlements — pure entitlement logic.
 *
 * Maps the NEW MDX/global capabilities to the platform's REAL subscription
 * tiers (free / standard / professional / enterprise — see ./types and the
 * billing/usage-metering code). Pure, deterministic, and honest: it never
 * invents a tier and never returns a result for an unknown feature or tier.
 *
 * This module answers three questions a gating layer needs:
 *   - featureTier(feature)            → the minimum tier that unlocks it
 *   - isEntitled(feature, tier)       → is this tier allowed to use it?
 *   - entitlementsForTier(tier)       → everything this tier unlocks
 *
 * It is intentionally SEPARATE from the credit metering in usage-metering.ts:
 *   - entitlements answer "is this feature available at all on this plan?"
 *   - usage-metering answers "how many runs of an available feature remain
 *     this period?"
 * A gating UX consults entitlements first (show an honest upgrade path when a
 * feature is above the current tier), then consults usage-metering for quota.
 *
 * PURE + DETERMINISTIC: static data + pure functions. No DB, no network, no LLM.
 *
 * @module server/services/entitlements/mdx-entitlements
 */

import type { FeatureKey, FeatureEntitlement, Tier } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Tier ordering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ascending rank for each real tier. Mirrors the `tierLevel` map in
 * billing.ts (`provisionModulesForTier`): free=0, standard=1, professional=2,
 * enterprise=3. Higher rank includes everything a lower rank unlocks.
 */
const TIER_RANK: Record<Tier, number> = {
  free: 0,
  standard: 1,
  professional: 2,
  enterprise: 3,
};

/** All real tiers, ascending — the canonical order for iteration / display. */
export const TIERS: readonly Tier[] = ['free', 'standard', 'professional', 'enterprise'];

// ─────────────────────────────────────────────────────────────────────────────
// Feature → minimum-tier matrix
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The single source of truth for the entitlement matrix. Each NEW capability
 * is mapped to the minimum tier that unlocks it.
 *
 * Rationale (aligned to billing.ts credit shape + the specs):
 *   - report_families            → standard: governed reporting is the entry
 *                                  value of a paid plan (free is preview only).
 *   - device_assembly_readiness  → standard: readiness/advisory is the device
 *                                  GTM's entry hook (advisory, not transmission).
 *   - global_market_planner      → standard: per-market planning is core paid value.
 *   - ana_advisory               → standard: grounded advisory rides the paid AnA.
 *   - prediction_forecast_report → professional: prediction-backed reports are a
 *                                  premium moat (mirrors ctd_builder living at
 *                                  professional+ in TIER_CREDITS).
 *   - crl_rtf_premortem          → professional: same premium prediction tier.
 *   - scheduled_reports          → professional: recurring/drift automation is a
 *                                  scale feature, not an entry feature.
 *   - ana_live_drive             → professional: watching AnA drive the screens
 *                                  live is a premium subscriber experience above
 *                                  the standard advisory chat (and below the
 *                                  enterprise ana_autonomous_actions surface).
 *   - portfolio_rollup           → enterprise: cross-pathway/account portfolio
 *                                  rollup is the enterprise/CRO surface.
 */
const FEATURE_ENTITLEMENTS: readonly FeatureEntitlement[] = [
  {
    feature: 'report_families',
    minTier: 'standard',
    label: 'Governed report families (Exec/Board, RA Lead, QA/Audit)',
  },
  {
    feature: 'device_assembly_readiness',
    minTier: 'standard',
    label: 'Device & IVD submission-assembly readiness',
  },
  {
    feature: 'global_market_planner',
    minTier: 'standard',
    label: 'Global-market submission planner',
  },
  {
    feature: 'ana_advisory',
    minTier: 'standard',
    label: 'AnA device & global-market advisory',
  },
  {
    feature: 'prediction_forecast_report',
    minTier: 'professional',
    label: 'Regulatory Forecast (prediction-backed report)',
  },
  {
    feature: 'crl_rtf_premortem',
    minTier: 'professional',
    label: 'CRL/RTF Pre-Mortem (prediction-backed report)',
  },
  {
    feature: 'scheduled_reports',
    minTier: 'professional',
    label: 'Scheduled & drift-triggered reports',
  },
  {
    feature: 'ana_live_drive',
    minTier: 'professional',
    label: 'AnA Live Drive (watch AnA navigate & work on screen)',
  },
  {
    feature: 'portfolio_rollup',
    minTier: 'enterprise',
    label: 'Portfolio / cross-account rollup reporting',
  },
] as const;

/** Indexed view of the matrix for O(1) lookups. */
const FEATURE_TIER_INDEX: Readonly<Record<FeatureKey, Tier>> = Object.freeze(
  FEATURE_ENTITLEMENTS.reduce((acc, row) => {
    acc[row.feature] = row.minTier;
    return acc;
  }, {} as Record<FeatureKey, Tier>),
);

// ─────────────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────────────

/** Type guard: is `value` one of the real tiers? */
export function isTier(value: unknown): value is Tier {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TIER_RANK, value);
}

/** Type guard: is `value` a known MDX/global feature key? */
export function isFeatureKey(value: unknown): value is FeatureKey {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(FEATURE_TIER_INDEX, value)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Core API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The minimum tier that unlocks `feature`.
 *
 * @returns the minimum {@link Tier}, or `null` for an unknown feature (honest:
 *   never guesses a tier for a feature it does not know).
 */
export function featureTier(feature: FeatureKey | string): Tier | null {
  if (!isFeatureKey(feature)) return null;
  return FEATURE_TIER_INDEX[feature];
}

/**
 * Whether a subscription at `tier` is entitled to `feature`.
 *
 * Monotonic across tiers: if a lower tier is entitled, every higher tier is
 * too. Returns `false` (never throws) for unknown feature or unknown tier.
 */
export function isEntitled(feature: FeatureKey | string, tier: Tier | string): boolean {
  if (!isFeatureKey(feature) || !isTier(tier)) return false;
  const required = FEATURE_TIER_INDEX[feature];
  return TIER_RANK[tier] >= TIER_RANK[required];
}

/**
 * Every feature unlocked at `tier`, in the canonical matrix order.
 *
 * @returns the entitled {@link FeatureKey}s, or `[]` for an unknown tier.
 */
export function entitlementsForTier(tier: Tier | string): FeatureKey[] {
  if (!isTier(tier)) return [];
  return FEATURE_ENTITLEMENTS.filter((row) => isEntitled(row.feature, tier)).map(
    (row) => row.feature,
  );
}

/**
 * The full feature → minimum-tier matrix (immutable copy), in canonical order.
 * Useful for rendering an honest entitlement / upgrade table.
 */
export function entitlementMatrix(): FeatureEntitlement[] {
  return FEATURE_ENTITLEMENTS.map((row) => ({ ...row }));
}

/** All known MDX/global feature keys, in canonical matrix order. */
export function allFeatures(): FeatureKey[] {
  return FEATURE_ENTITLEMENTS.map((row) => row.feature);
}

export default {
  TIERS,
  isTier,
  isFeatureKey,
  featureTier,
  isEntitled,
  entitlementsForTier,
  entitlementMatrix,
  allFeatures,
};
