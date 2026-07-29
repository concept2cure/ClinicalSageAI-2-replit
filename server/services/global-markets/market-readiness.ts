/**
 * Global market readiness scoring.
 *
 * `assessMarketReadiness(marketId, availableArtifacts)` scores a manufacturer's
 * artifact set against a market's required dossier elements, returning present /
 * missing element ids, a 0..100 score, a readiness band, and HONEST blockers.
 *
 * In the spirit of regulatory/global-pathways.ts `assessPathwayReadiness`, but
 * (a) banded, (b) percentage-scored 0..100, and (c) honesty-first: results for
 * markets without a live gateway carry the standing cannot-transmit blocker;
 * markets requiring a local representative surface that too.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/global-markets/market-readiness
 */

import type { MarketReadinessResult, ReadinessBand } from './types';
import { getMarket } from './market-registry';

/** Map a 0..100 score to a readiness band. */
export function bandForScore(score: number): ReadinessBand {
  if (score >= 100) return 'ready';
  if (score >= 75) return 'substantial';
  if (score >= 40) return 'partial';
  if (score > 0) return 'minimal';
  return 'not-started';
}

/**
 * Score an artifact set against a market's required dossier elements.
 *
 * @param marketId           the market to assess
 * @param availableArtifacts artifact element ids the manufacturer has produced
 * @throws if `marketId` is unknown (callers should use `getMarket` to validate,
 *         or use `tryAssessMarketReadiness` for a non-throwing variant)
 */
export function assessMarketReadiness(
  marketId: string,
  availableArtifacts: string[] = [],
): MarketReadinessResult {
  const market = getMarket(marketId);
  if (!market) {
    throw new Error(`Unknown market: ${marketId}`);
  }

  const have = new Set(availableArtifacts);
  const required = market.requiredDossierElements;
  const presentElements = required.filter((e) => have.has(e));
  const missingElements = required.filter((e) => !have.has(e));

  const score = required.length === 0
    ? 100
    : Math.round((presentElements.length / required.length) * 100);

  const complete = missingElements.length === 0;

  // Honesty-first blockers — present when the capability is absent.
  const blockers: string[] = [];
  if (!market.canTransmit) {
    blockers.push(`platform cannot transmit to ${market.authorityShort}`);
  }
  if (!market.canAssemble) {
    blockers.push(`platform cannot assemble a ${market.dossierStandard} dossier for ${market.authorityShort}`);
  }
  if (market.localRepresentativeRequired) {
    blockers.push(`a local in-country representative is required for ${market.authorityShort}`);
  }
  for (const missing of missingElements) {
    blockers.push(`missing required dossier element: ${missing}`);
  }

  return {
    marketId: market.id,
    authority: market.authorityShort,
    score,
    band: bandForScore(score),
    presentElements,
    missingElements,
    complete,
    blockers,
  };
}

/**
 * Non-throwing variant: returns `null` for an unknown market instead of
 * throwing, for callers that prefer graceful degradation.
 */
export function tryAssessMarketReadiness(
  marketId: string,
  availableArtifacts: string[] = [],
): MarketReadinessResult | null {
  if (!getMarket(marketId)) return null;
  return assessMarketReadiness(marketId, availableArtifacts);
}

export default { assessMarketReadiness, tryAssessMarketReadiness, bandForScore };
