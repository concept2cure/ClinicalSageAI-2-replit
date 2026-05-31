/**
 * Adaptive priority — learn which enrichment sources actually help.
 *
 * The context composer ranks enrichment blocks partly by a static per-source
 * priority (SOURCE_PRIORITY). But which sources genuinely help is an empirical
 * question: if AnA's responses that drew on `agency-tactics` are consistently
 * accepted while `tour-guide` ones are edited or regenerated, the composer
 * should learn to prioritize what works for this population.
 *
 * This module turns per-source outcome statistics into a bounded multiplier on
 * the static priority. It is a pure function over counts — the DB read that
 * produces those counts lives in the wisdom engine and is injected, so this is
 * fully unit-testable without any database or model call.
 *
 * Statistics, done carefully:
 *   - A reward score in [0, 1] per source: accepted = 1, edited = 0.5
 *     (partial value), rejected/regenerated = 0.
 *   - Bayesian shrinkage toward a neutral prior (0.5) using a pseudo-count, so
 *     a source with 2 samples barely moves while one with 200 moves fully.
 *     This is the Beta-Binomial posterior mean, the standard fix for
 *     small-sample noise in acceptance-rate ranking.
 *   - The smoothed reward maps to a multiplier in [minMultiplier, maxMultiplier]
 *     centered on 1.0, so learning can only modestly re-weight the deliberate
 *     static priorities — never invert or zero them.
 *
 * Design principle: this nudges PROMINENCE from evidence, never truth, and is
 * bounded so a noisy signal cannot silence a safety-critical source. It is
 * opt-in: the composer uses static priorities until adaptive weights are
 * explicitly supplied.
 *
 * @module server/services/ana-ri/adaptive-priority
 */

export type OutcomeFeedback = 'accepted' | 'edited' | 'rejected' | 'regenerated';

/** Raw outcome counts for a single enrichment source. */
export interface SourceOutcomeStats {
  source: string;
  accepted: number;
  edited: number;
  rejected: number;
  regenerated: number;
}

export interface AdaptivePriorityOptions {
  /**
   * Pseudo-count for Bayesian shrinkage toward the neutral prior. Higher =
   * more evidence required before the weight moves. Default 10.
   */
  priorStrength?: number;
  /** Neutral prior reward (acceptance-equivalent). Default 0.5. */
  priorReward?: number;
  /** Multiplier bounds. Defaults 0.75 … 1.25 (±25%). */
  minMultiplier?: number;
  maxMultiplier?: number;
}

/** Reward weight per feedback kind: accepted full, edited partial, else none. */
const REWARD: Record<OutcomeFeedback, number> = {
  accepted: 1,
  edited: 0.5,
  rejected: 0,
  regenerated: 0,
};

/**
 * Compute the smoothed reward (Beta-Binomial posterior mean) for one source.
 * Returns a value in [0, 1]; with zero samples it returns the prior exactly.
 */
export function smoothedReward(
  stats: SourceOutcomeStats,
  opts: AdaptivePriorityOptions = {},
): number {
  const priorStrength = opts.priorStrength ?? 10;
  const priorReward = opts.priorReward ?? 0.5;

  const n = stats.accepted + stats.edited + stats.rejected + stats.regenerated;
  // Total reward mass observed.
  const observed =
    stats.accepted * REWARD.accepted +
    stats.edited * REWARD.edited +
    stats.rejected * REWARD.rejected +
    stats.regenerated * REWARD.regenerated;

  // Posterior mean: (priorMass + observedMass) / (priorCount + n).
  return (priorReward * priorStrength + observed) / (priorStrength + n);
}

/**
 * Map a smoothed reward in [0, 1] to a bounded multiplier centered on 1.0.
 * reward = priorReward → 1.0 (no change); reward = 1 → maxMultiplier;
 * reward = 0 → minMultiplier. Linear on each side of the prior.
 */
export function rewardToMultiplier(reward: number, opts: AdaptivePriorityOptions = {}): number {
  const priorReward = opts.priorReward ?? 0.5;
  const minM = opts.minMultiplier ?? 0.75;
  const maxM = opts.maxMultiplier ?? 1.25;

  if (reward >= priorReward) {
    const frac = priorReward >= 1 ? 0 : (reward - priorReward) / (1 - priorReward);
    return 1 + frac * (maxM - 1);
  }
  const frac = priorReward <= 0 ? 0 : (priorReward - reward) / priorReward;
  return 1 - frac * (1 - minM);
}

/**
 * Build a map from source name to a bounded priority multiplier, learned from
 * outcome stats. Sources with no stats are absent from the map (the composer
 * then uses their static priority unchanged).
 */
export function buildAdaptiveMultipliers(
  stats: SourceOutcomeStats[],
  opts: AdaptivePriorityOptions = {},
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of stats) {
    const reward = smoothedReward(s, opts);
    out[s.source] = Number(rewardToMultiplier(reward, opts).toFixed(4));
  }
  return out;
}

/**
 * Apply a learned multiplier to a static base priority, clamped to [0, 1] so
 * the composer's downstream math stays well-defined.
 */
export function applyAdaptivePriority(
  basePriority: number,
  source: string,
  multipliers: Record<string, number> | undefined,
): number {
  if (!multipliers || !(source in multipliers)) return basePriority;
  const adjusted = basePriority * multipliers[source];
  return Math.max(0, Math.min(1, adjusted));
}
