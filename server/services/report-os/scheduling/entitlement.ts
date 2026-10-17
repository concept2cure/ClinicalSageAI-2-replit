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
 * FAIL CLOSED on a tier that could not be read: the resolver's unread plan
 * (`tier: null`, `tierResolved: false`) or the resolver throwing means the
 * entitlement store did not answer, not that the org is on any plan. Nothing is
 * entitled, the verdict's `tier` is null, and `tierResolved: false` travels with
 * it so a caller says the plan could not be read rather than naming a plan.
 *
 * @module server/services/report-os/scheduling/entitlement
 */

import { isEntitled, featureTier } from '../../entitlements/mdx-entitlements';
import { resolveCapabilities } from '../../entitlements/resolver';
import type { Tier } from '../../entitlements/types';

/** The feature key the sweep and the route both gate on. */
export const SCHEDULED_REPORTS_FEATURE = 'scheduled_reports';

/** A read plan carries its verdict; an unread plan entitles nothing and names no plan. */
export type ScheduledReportsVerdict =
  | { entitled: true; tier: Tier; requiredTier: Tier; feature: string; tierResolved: true }
  | { entitled: false; tier: Tier; requiredTier: Tier; feature: string; tierResolved: true }
  | { entitled: false; tier: null; requiredTier: Tier; feature: string; tierResolved: false };

/** The verdict for a tier already in hand (the sweep resolves tiers itself). PURE. */
export function scheduledReportsVerdict(tier: Tier | null, tierResolved = true): ScheduledReportsVerdict {
  const requiredTier = (featureTier(SCHEDULED_REPORTS_FEATURE) ?? 'professional') as Tier;
  const feature = SCHEDULED_REPORTS_FEATURE;
  // 2026-10-15: `entitled` used to ignore `tierResolved` and an unread verdict
  // carried 'standard' as its tier; an unread tier now entitles nothing.
  if (tier === null || !tierResolved) return { entitled: false, tier: null, requiredTier, feature, tierResolved: false };
  return isEntitled(SCHEDULED_REPORTS_FEATURE, tier)
    ? { entitled: true, tier, requiredTier, feature, tierResolved: true }
    : { entitled: false, tier, requiredTier, feature, tierResolved: true };
}

/** The verdict for an organization, reading its tier. An unread plan entitles nothing. */
export async function scheduledReportsEntitled(organizationId: number): Promise<ScheduledReportsVerdict> {
  try {
    // 2026-10-15: only `tier` was read here, so the resolver's unread plan
    // reached this gate as a read 'standard' plan and the catch never fired.
    const caps = await resolveCapabilities(organizationId);
    return scheduledReportsVerdict(caps.tier, caps.tierResolved !== false);
  } catch {
    return scheduledReportsVerdict(null, false);
  }
}

/** The refusal a client gets, in the wording the rest of Report-OS uses. */
export function scheduledReportsRefusal(v: ScheduledReportsVerdict): {
  error: string;
  feature: string;
  requiredTier: Tier;
  tier: Tier | null;
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
