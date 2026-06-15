/**
 * MDX / global-capabilities entitlements — shared types.
 *
 * A NEW, self-contained entitlements layer that maps the NEW MDX/global
 * capabilities (governed reports + prediction, device/IVD assembly readiness,
 * global-market planning, AnA advisory) to the platform's REAL subscription
 * tiers.
 *
 * TIER FIDELITY (honest by construction): the `Tier` union matches exactly the
 * tier ids the billing/usage code already defines — `free`, `standard`,
 * `professional`, `enterprise` — as found in:
 *   - server/services/usage-metering.ts   (TIER_CREDITS keys)
 *   - server/services/billing.ts          (DTC_PRICING[].tier, PRICING[].tier,
 *                                           provisionModulesForTier tierLevel)
 * No tier name is invented here.
 *
 * PURE + DETERMINISTIC: static data + pure functions. No DB, no network, no LLM.
 *
 * @module server/services/entitlements/types
 */

/**
 * The platform's real subscription tiers, in ascending order of capability.
 *
 * These are the canonical tier ids the billing + usage-metering code keys on:
 *   free        — DTC "Researcher" (free)
 *   standard    — DTC "Startup Biotech" / industry "Standard" / academic "Research"
 *   professional— DTC "Growth" / industry "Professional" / academic "Department"
 *   enterprise  — DTC / industry "Enterprise" (custom)
 */
export type Tier = 'free' | 'standard' | 'professional' | 'enterprise';

/**
 * Stable feature keys for the NEW MDX / global capabilities being monetized.
 *
 * Grouped by the capability families called out in the reporting/device/global
 * specs:
 *   - Governed reporting (Report OS) report families + scheduling.
 *   - Prediction-backed reporting (forecast / pre-mortem).
 *   - Device & IVD submission-assembly readiness.
 *   - Global-market planning.
 *   - AnA device & global-market advisory.
 */
export type FeatureKey =
  // ── Governed reporting (Report OS) ──
  /** Run the standard governed report families (Exec/Board, RA Lead, QA/Audit, etc.). */
  | 'report_families'
  /** Schedule / subscribe recurring + drift-triggered report runs. */
  | 'scheduled_reports'
  /** Account/program portfolio rollup reporting across pathways and devices. */
  | 'portfolio_rollup'
  // ── Prediction-backed reporting ──
  /** The flagship prediction-backed Regulatory Forecast report. */
  | 'prediction_forecast_report'
  /** The CRL/RTF pre-mortem prediction report. */
  | 'crl_rtf_premortem'
  // ── Device & IVD submission assembly readiness ──
  /** Device/IVD submission-assembly readiness (eSTAR section + market overlay). */
  | 'device_assembly_readiness'
  // ── Global-market planning ──
  /** Per-market global submission planner (dossier + pathway + readiness + actions). */
  | 'global_market_planner'
  // ── AnA advisory ──
  /** AnA device & global-market advisory (grounded, structured guidance). */
  | 'ana_advisory';

/**
 * One row of the feature → minimum-tier entitlement matrix.
 */
export interface FeatureEntitlement {
  /** The capability being gated. */
  feature: FeatureKey;
  /** The minimum tier that unlocks it. */
  minTier: Tier;
  /** Short, plain-language label for UI / docs. */
  label: string;
}
