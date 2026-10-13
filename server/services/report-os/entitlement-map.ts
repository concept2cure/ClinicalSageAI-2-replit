/**
 * @fileoverview Report type → entitlement feature-key mapping + tier gate.
 * @module server/services/report-os/entitlement-map
 *
 * The entitlement matrix (server/services/entitlements/mdx-entitlements.ts)
 * defines which subscription tier unlocks which monetized capability, but it
 * was enforced on no reporting route. This module is the single source of
 * truth that maps a Report-OS report type to its FeatureKey, and gates a
 * generation/export request on the requesting org's tier.
 *
 * Mapping is derived from the report's family / typeId, not per-type strings,
 * so new report types inherit the right gate automatically:
 *   - prediction forecast types      → prediction_forecast_report (professional)
 *   - CRL/RTF pre-mortem types        → crl_rtf_premortem          (professional)
 *   - portfolio / board-pack types    → portfolio_rollup           (enterprise)
 *   - everything else (governed families) → report_families        (standard)
 *
 * Scheduled reports are gated separately at the subscription layer with
 * `scheduled_reports` (professional) — a report TYPE is never "scheduled",
 * the SUBSCRIPTION is.
 *
 * The gate reuses resolveCapabilities() for the tier (never re-queries) and
 * the pure isEntitled(). Tier lookup failure defaults to `standard`, which
 * can never unlock a professional/enterprise feature — fail-closed on the
 * paid tiers, never a silent unlock.
 */

import { isEntitled, featureTier } from '../entitlements/mdx-entitlements';
import { resolveCapabilities } from '../entitlements/resolver';
import type { FeatureKey, Tier } from '../entitlements/types';
import { createScopedLogger } from '../../utils/logger.js';

const log = createScopedLogger('report-entitlement');

export interface ReportEntitlementDecision {
  entitled: boolean;
  feature: FeatureKey;
  /** The minimum tier that unlocks this report, for honest upgrade copy. */
  requiredTier: Tier;
  tier: Tier;
  /**
   * Whether `tier` was READ, or assumed after a failed read.
   *
   * `requireReportEntitlement` degrades to `standard` when `resolveCapabilities`
   * throws, which is the right call for the gate — it can never silently unlock
   * a paid feature. It was the wrong call for the sentence: the failure was
   * swallowed by a bare `catch` and passed on unflagged, so an enterprise
   * customer whose capability lookup threw was shown "Plan: Standard" and a
   * screen of locked tiles, with nothing to say their plan had not been read
   * (HS-1008-4, honest-state review 2026-10-08).
   *
   * False means: keep failing closed on the entitlement, and stop claiming to
   * know the plan.
   */
  tierResolved: boolean;
}

/**
 * PURE: map a report type to its entitlement feature key by typeId/family.
 * Prediction and portfolio families take precedence; the default for every
 * governed report family is `report_families`.
 */
export function reportTypeToFeatureKey(typeId: string, family?: string): FeatureKey {
  const hay = `${typeId} ${family ?? ''}`.toLowerCase();

  // Portfolio / board-pack / cross-account rollup → enterprise. Checked FIRST
  // so an "account rollup" is never mistaken for a pre-mortem or forecast.
  if (/(^|[._\s])portfolio|board[_\s-]?pack|rollup|roll[_\s-]up/.test(hay)) {
    return 'portfolio_rollup';
  }
  // CRL / RTF pre-mortem → professional. Word-ish boundaries so "control"
  // etc. can't false-match "crl".
  if (/premortem|pre[_\s-]?mortem|(^|[._\s])crl([._\s]|$)|(^|[._\s])rtf([._\s]|$)/.test(hay)) {
    return 'crl_rtf_premortem';
  }
  // Prediction-backed forecast → professional.
  if (/(^|[._\s])prediction|forecast|trajectory|probability[_\s-]?of[_\s-]?success/.test(hay)) {
    return 'prediction_forecast_report';
  }
  // Every governed report family → the base paid capability.
  return 'report_families';
}

/**
 * PURE: given a tier, decide whether a report type is entitled. Exported for
 * annotating taxonomy rows and for unit tests without a DB.
 */
export function decideReportEntitlement(
  typeId: string,
  family: string | undefined,
  tier: Tier,
  /* The caller handed us a tier, so by default it is one that was read. A
     caller that got its tier from a failed lookup passes false and the flag
     travels with every per-type decision it then makes — report-os.ts builds a
     whole catalog from one awaited gate, so without this the catalog would
     claim a plan the gate itself could not read. */
  tierResolved = true,
): ReportEntitlementDecision {
  const feature = reportTypeToFeatureKey(typeId, family);
  return {
    entitled: isEntitled(feature, tier),
    feature,
    requiredTier: (featureTier(feature) ?? 'standard') as Tier,
    tier,
    tierResolved,
  };
}

/**
 * Resolve the org's tier (via resolveCapabilities) and decide entitlement for
 * a report type. Never throws — a resolution failure degrades to `standard`,
 * which fails closed on professional/enterprise features, and sets
 * `tierResolved: false` so the surface says the plan could not be read rather
 * than presenting `standard` as the organisation's plan.
 */
export async function requireReportEntitlement(
  organizationId: number,
  typeId: string,
  family?: string,
): Promise<ReportEntitlementDecision> {
  let tier: Tier = 'standard';
  let tierResolved = true;
  try {
    const caps = await resolveCapabilities(organizationId);
    tier = caps.tier;
  } catch (err) {
    /* Still `standard`, so the gate still fails closed on every paid feature.
       But the failure is no longer silent in either direction: it is logged for
       the operator, and `tierResolved: false` travels to the surface so the
       screen can say the plan could not be read instead of naming one. The bare
       `catch { tier = 'standard' }` this replaces discarded the error entirely. */
    tier = 'standard';
    tierResolved = false;
    log.error('capability lookup failed; entitlement decided as standard', {
      organizationId,
      typeId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  return decideReportEntitlement(typeId, family, tier, tierResolved);
}
