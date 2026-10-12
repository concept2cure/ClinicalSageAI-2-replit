/**
 * The ONE question "may this organization have scheduled reports?", asked by
 * both the create route and the sweep.
 *
 * ── WHY ONE PREDICATE (coverage review C-26a) ───────────────────────────────
 * The sweep already re-checked `scheduled_reports` at FIRE time and skipped a
 * subscription whose org was not entitled (`worker.ts` planSweep). `POST
 * /api/insights/subscriptions` checked nothing at CREATE time. So a
 * standard-plan organisation could create a schedule the screen showed as
 * Active, which the sweep then skipped on every tick, for ever, silently — the
 * product selling a thing it declines to do.
 *
 * Two inlined `isEntitled('scheduled_reports', tier)` calls would close that and
 * leave the two verdicts free to drift, which is how the create path and the
 * fire path came to disagree in the first place. So the question is asked in one
 * place and both callers read the answer.
 *
 * FAIL CLOSED on a tier that could not be read: `resolveCapabilities` throwing
 * means the entitlement store did not answer, not that the org is enterprise.
 * 'standard' is the floor the rest of Report-OS uses for the same case
 * (`entitlement-map.ts` requireReportEntitlement), and `tierResolved: false`
 * travels with the verdict so a caller can say the plan could not be read rather
 * than naming a plan.
 *
 * @module server/services/report-os/scheduling/entitlement
 */

import { isEntitled, featureTier } from '../../entitlements/mdx-entitlements';
import { resolveCapabilities } from '../../entitlements/resolver';
import type { Tier } from '../../entitlements/types';

/** The feature key the sweep and the route both gate on. */
export const SCHEDULED_REPORTS_FEATURE = 'scheduled_reports';

export interface ScheduledReportsVerdict {
  entitled: boolean;
  /** The org's tier, or the fail-closed floor when it could not be read. */
  tier: Tier;
  requiredTier: Tier;
  feature: string;
  /** False when the tier is the fail-closed floor rather than a read value. */
  tierResolved: boolean;
}

/** The verdict for a tier already in hand (the sweep resolves tiers itself). PURE. */
export function scheduledReportsVerdict(tier: Tier, tierResolved = true): ScheduledReportsVerdict {
  return {
    entitled: isEntitled(SCHEDULED_REPORTS_FEATURE, tier),
    tier,
    requiredTier: (featureTier(SCHEDULED_REPORTS_FEATURE) ?? 'professional') as Tier,
    feature: SCHEDULED_REPORTS_FEATURE,
    tierResolved,
  };
}

/** The verdict for an organization, reading its tier. Fails closed to 'standard'. */
export async function scheduledReportsEntitled(organizationId: number): Promise<ScheduledReportsVerdict> {
  try {
    const { tier } = await resolveCapabilities(organizationId);
    return scheduledReportsVerdict(tier);
  } catch {
    return scheduledReportsVerdict('standard', false);
  }
}

/** The refusal a client gets, in the wording the rest of Report-OS uses. */
export function scheduledReportsRefusal(v: ScheduledReportsVerdict): {
  error: string;
  feature: string;
  requiredTier: Tier;
  tier: Tier;
} {
  return {
    error: v.tierResolved
      ? `Scheduled reports require the ${v.requiredTier} plan.`
      : 'Your plan could not be read, so a scheduled report was not created.',
    feature: v.feature,
    requiredTier: v.requiredTier,
    tier: v.tier,
  };
}
