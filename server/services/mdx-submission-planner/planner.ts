/**
 * MDX global submission planner.
 *
 * `planGlobalSubmission(profile, targetMarketIds)` produces a per-market
 * submission plan for a device/IVD profile and aggregates an overall readiness
 * summary, the markets the platform can vs cannot assemble for, and a
 * de-duplicated global blockers rollup.
 *
 * Composition only — it reuses (and never modifies):
 *   - global-markets/market-registry  (descriptors + capability flags)
 *   - global-markets/market-readiness (assessMarketReadiness)
 *
 * HONEST BY CONSTRUCTION: capability flags come straight from the registry;
 * `canTransmit` is false for every market, so every plan carries the standing
 * cannot-transmit blocker. The planner never asserts an assemble/transmit
 * capability the registry does not.
 *
 * PURE + DETERMINISTIC: same inputs ⇒ same output (apart from the ISO timestamp
 * in provenance). No DB, no network, no LLM. Results are sorted by canonical
 * market order so output is stable.
 *
 * @module server/services/mdx-submission-planner/planner
 */

import { getMarket, MARKET_IDS } from '../global-markets/market-registry';
import { assessMarketReadiness } from '../global-markets/market-readiness';
import type { MarketDescriptor, MarketId } from '../global-markets/types';
import type {
  DeviceProfile,
  GlobalSubmissionPlan,
  MarketPlan,
  NextAction,
  PathwayKind,
  ReadinessSummary,
  UnknownMarket,
} from './types';

const MODULES = [
  'global-markets/market-registry',
  'global-markets/market-readiness',
];

/** Canonical sort rank for a market id (unknowns sort last). */
function marketRank(id: MarketId): number {
  const idx = MARKET_IDS.indexOf(id);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

/**
 * Build the prioritized next-actions list: which missing dossier elements to
 * produce first. Missing elements are emitted in the market's canonical
 * required-element order so priority is deterministic.
 */
function buildNextActions(
  descriptor: MarketDescriptor,
  missingElements: string[],
): NextAction[] {
  const missing = new Set(missingElements);
  // Preserve the registry's required-element ordering for stable priorities.
  const ordered = descriptor.requiredDossierElements.filter((e) => missing.has(e));
  return ordered.map((element, i) => ({
    priority: i + 1,
    element,
    action: `Produce missing dossier element "${element}" for ${descriptor.authorityShort}.`,
  }));
}

/** Build a single market plan from a resolved descriptor + profile. */
function buildMarketPlan(
  descriptor: MarketDescriptor,
  profile: DeviceProfile,
): MarketPlan {
  const readiness = assessMarketReadiness(descriptor.id, profile.availableArtifacts);

  const pathwayKind: PathwayKind = profile.isIvd ? 'ivd' : 'device';
  const pathways = profile.isIvd ? descriptor.ivdPathways : descriptor.devicePathways;

  // Blockers: the readiness scorer already injects the honest cannot-transmit
  // (and cannot-assemble / local-rep / missing-element) blockers. De-duplicate
  // while preserving order, in the device-assembly contract's spirit.
  const blockers = Array.from(new Set(readiness.blockers));

  return {
    marketId: descriptor.id,
    marketName: descriptor.name,
    authority: descriptor.authority,
    authorityShort: descriptor.authorityShort,
    dossierStandard: descriptor.dossierStandard,
    dossierFormatName: descriptor.dossierFormatName,
    pathwayKind,
    pathways: [...pathways],
    classificationScheme: descriptor.classificationScheme,
    readiness,
    canAssemble: descriptor.canAssemble,
    assembleNote: descriptor.assembleNote,
    // Honest invariant — never assert transmission.
    canTransmit: descriptor.canTransmit,
    blockers,
    nextActions: buildNextActions(descriptor, readiness.missingElements),
  };
}

/** Aggregate per-market readiness into ready / partial / not-started counts. */
function summarizeReadiness(plans: MarketPlan[]): ReadinessSummary {
  let ready = 0;
  let partial = 0;
  let notStarted = 0;
  for (const plan of plans) {
    if (plan.readiness.complete) {
      ready += 1;
    } else if (plan.readiness.presentElements.length > 0) {
      partial += 1;
    } else {
      notStarted += 1;
    }
  }
  return { totalPlanned: plans.length, ready, partial, notStarted };
}

/**
 * Produce a global submission plan for a device/IVD profile across the target
 * markets. Unknown market ids are reported honestly under `unknownMarkets`
 * rather than throwing, so a single bad id never sinks the whole plan.
 *
 * @param profile         the device/IVD profile + available artifacts
 * @param targetMarketIds the markets to plan for (deduplicated, order-stable)
 */
export function planGlobalSubmission(
  profile: DeviceProfile,
  targetMarketIds: MarketId[],
): GlobalSubmissionPlan {
  const requested = Array.isArray(targetMarketIds) ? targetMarketIds : [];

  // Deduplicate requested ids while preserving first-seen order.
  const seen = new Set<string>();
  const uniqueRequested: string[] = [];
  for (const id of requested) {
    if (!seen.has(id)) {
      seen.add(id);
      uniqueRequested.push(id);
    }
  }

  const marketPlans: MarketPlan[] = [];
  const unknownMarkets: UnknownMarket[] = [];

  for (const id of uniqueRequested) {
    const descriptor = getMarket(id);
    if (!descriptor) {
      unknownMarkets.push({
        requestedId: id,
        reason: `Unknown market id "${id}" — not present in the global market registry.`,
      });
      continue;
    }
    marketPlans.push(buildMarketPlan(descriptor, profile));
  }

  // Deterministic ordering by canonical market rank.
  marketPlans.sort((a, b) => marketRank(a.marketId) - marketRank(b.marketId));
  unknownMarkets.sort((a, b) => a.requestedId.localeCompare(b.requestedId));

  const assembleCapableMarkets = marketPlans
    .filter((p) => p.canAssemble)
    .map((p) => p.marketId);
  const assembleIncapableMarkets = marketPlans
    .filter((p) => !p.canAssemble)
    .map((p) => p.marketId);
  // Honest invariant: nothing transmits, so this is always empty.
  const transmitCapableMarkets = marketPlans
    .filter((p) => p.canTransmit)
    .map((p) => p.marketId);

  // De-duplicated rollup of every blocker across all planned markets.
  const globalBlockers = Array.from(
    new Set(marketPlans.flatMap((p) => p.blockers)),
  );

  return {
    profile,
    marketPlans,
    unknownMarkets,
    readinessSummary: summarizeReadiness(marketPlans),
    assembleCapableMarkets,
    assembleIncapableMarkets,
    transmitCapableMarkets,
    globalBlockers,
    provenance: {
      generatedAt: new Date().toISOString(),
      modules: [...MODULES],
    },
  };
}

export default { planGlobalSubmission };
