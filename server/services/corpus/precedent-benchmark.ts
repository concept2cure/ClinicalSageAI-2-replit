/**
 * Precedent benchmarking — turn the trial corpus into honest, evidence-grounded
 * design benchmarks for a given indication + phase.
 *
 * This is the "learn from past studies" core: given the comparable trials in the
 * corpus, it reports the distribution of sample sizes and durations (median +
 * quartiles + p10/p90), the most common study designs and endpoints, and an
 * empirical success rate with a Wilson confidence interval.
 *
 * Design principles:
 *   - Pure and deterministic. The computation takes an array of precedent rows
 *     and returns a benchmark; it does no IO, so it is fully unit-testable. The
 *     DB-backed reader is injected separately.
 *   - Honest about evidence strength. Below a minimum sample of comparable
 *     trials, distributions and the success rate are reported as "not
 *     assessable" rather than as a confident-looking number computed from two
 *     data points. The success rate is only assessable when enough trials have a
 *     usable (success / failure) outcome — ongoing/unknown trials are excluded
 *     from the denominator, not counted as failures.
 *   - Every number is accompanied by the N it came from, so a reader can judge
 *     it. Numbers over adjectives.
 */

/** Minimum comparable trials before a distribution is considered assessable. */
export const MIN_TRIALS_FOR_DISTRIBUTION = 5;
/** Minimum trials with a known outcome before a success rate is assessable. */
export const MIN_TRIALS_FOR_SUCCESS_RATE = 8;

export interface PrecedentTrial {
  /** Number of subjects, when known. */
  sampleSize: number | null;
  /** Study duration in weeks, when known. */
  durationWeeks: number | null;
  /** Normalized study-design string, when known. */
  studyDesign: string | null;
  /** Primary/secondary endpoint measures, when known. */
  endpoints: string[];
  /**
   * Known outcome for the success-rate denominator: true = succeeded/completed,
   * false = failed/terminated, null = ongoing/unknown (excluded from the rate).
   */
  outcome: boolean | null;
}

export interface Distribution {
  n: number;
  min: number;
  p10: number;
  q1: number;
  median: number;
  q3: number;
  p90: number;
  max: number;
  mean: number;
}

export interface FrequencyItem {
  value: string;
  count: number;
  fraction: number;
}

export interface SuccessRate {
  assessable: boolean;
  /** Trials with a known outcome (the denominator). */
  knownOutcomeN: number;
  successes: number;
  /** Point estimate, null when not assessable. */
  rate: number | null;
  /** Wilson 95% interval, null when not assessable. */
  ci95: [number, number] | null;
  note: string;
}

export interface PrecedentBenchmark {
  indication: string;
  phase: string;
  totalTrials: number;
  sampleSize: Distribution | { assessable: false; n: number; note: string };
  duration: Distribution | { assessable: false; n: number; note: string };
  commonDesigns: FrequencyItem[];
  commonEndpoints: FrequencyItem[];
  successRate: SuccessRate;
  note: string;
}

/** Linear-interpolated percentile (0..1) over a numeric array. */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = p * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const frac = idx - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}

function describe(values: number[]): Distribution {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((s, x) => s + x, 0) / sorted.length;
  return {
    n: sorted.length,
    min: sorted[0],
    p10: percentile(sorted, 0.1),
    q1: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    q3: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    max: sorted[sorted.length - 1],
    mean,
  };
}

/**
 * Wilson score interval for a binomial proportion — the right choice for the
 * small samples typical of trial precedents (the normal approximation behaves
 * badly near 0/1 and for small n).
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0];
  const phat = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n));
  const lo = (center - margin) / denom;
  const hi = (center + margin) / denom;
  return [Math.max(0, lo), Math.min(1, hi)];
}

function frequencies(values: string[], total: number, topN: number): FrequencyItem[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count, fraction: total > 0 ? count / total : 0 }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, topN);
}

/**
 * Compute an evidence-grounded benchmark from a set of comparable trials. Pure
 * and deterministic. Honest about low-N: distributions and the success rate
 * report `assessable: false` below their thresholds rather than fabricating a
 * confident value.
 */
export function computeBenchmark(
  indication: string,
  phase: string,
  trials: PrecedentTrial[],
  opts: { topN?: number } = {}
): PrecedentBenchmark {
  const topN = opts.topN ?? 5;
  const total = trials.length;

  const sampleSizes = trials
    .map(t => t.sampleSize)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  const durations = trials
    .map(t => t.durationWeeks)
    .filter((v): v is number => typeof v === 'number' && v > 0);

  const sampleSize =
    sampleSizes.length >= MIN_TRIALS_FOR_DISTRIBUTION
      ? describe(sampleSizes)
      : {
          assessable: false as const,
          n: sampleSizes.length,
          note: `Only ${sampleSizes.length} comparable trial(s) report a sample size; need ${MIN_TRIALS_FOR_DISTRIBUTION} to summarize a distribution.`,
        };

  const duration =
    durations.length >= MIN_TRIALS_FOR_DISTRIBUTION
      ? describe(durations)
      : {
          assessable: false as const,
          n: durations.length,
          note: `Only ${durations.length} comparable trial(s) report a duration; need ${MIN_TRIALS_FOR_DISTRIBUTION} to summarize a distribution.`,
        };

  const designs = trials
    .map(t => t.studyDesign)
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  const endpoints = trials.flatMap(t => t.endpoints).filter(e => e && e.trim().length > 0);

  const known = trials.filter(t => t.outcome !== null);
  const successes = known.filter(t => t.outcome === true).length;
  const successRate: SuccessRate =
    known.length >= MIN_TRIALS_FOR_SUCCESS_RATE
      ? {
          assessable: true,
          knownOutcomeN: known.length,
          successes,
          rate: successes / known.length,
          ci95: wilsonInterval(successes, known.length),
          note: `Empirical completion rate across ${known.length} comparable trials with a known registry outcome. This reflects registry status (completed vs terminated/withdrawn), not regulatory approval.`,
        }
      : {
          assessable: false,
          knownOutcomeN: known.length,
          successes,
          rate: null,
          ci95: null,
          note: `Only ${known.length} comparable trial(s) have a known outcome; need ${MIN_TRIALS_FOR_SUCCESS_RATE} for a defensible rate.`,
        };

  return {
    indication,
    phase,
    totalTrials: total,
    sampleSize,
    duration,
    commonDesigns: frequencies(designs, total, topN),
    commonEndpoints: frequencies(endpoints, total, topN),
    successRate,
    note:
      total === 0
        ? 'No comparable trials in the corpus for this indication and phase.'
        : `Benchmarks computed from ${total} comparable trial(s) in the corpus.`,
  };
}
