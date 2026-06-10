/**
 * IVD program benchmarking.
 *
 * Compares a program's readiness, timeline, and cost against planning-grade
 * reference norms by regulatory pathway, returning percentiles, z-scores, and
 * qualitative bands. Norms are curated, transparent constants (industry
 * planning estimates), not claims about any specific dataset.
 *
 * Deterministic; no I/O.
 */

export type BenchmarkPathway = '510k' | 'de_novo' | 'pma' | 'eu_ivdr';

interface PathwayNorms {
  readiness: { mean: number; sd: number };
  /** Typical end-to-end evidence-to-decision calendar weeks. */
  weeks: { mean: number; sd: number };
  /** Typical total evidence + submission cost (USD). */
  costUsd: { mean: number; sd: number };
}

/** Planning-grade reference norms by pathway. */
export const PATHWAY_NORMS: Record<BenchmarkPathway, PathwayNorms> = {
  '510k': { readiness: { mean: 60, sd: 18 }, weeks: { mean: 40, sd: 14 }, costUsd: { mean: 600000, sd: 250000 } },
  de_novo: { readiness: { mean: 50, sd: 18 }, weeks: { mean: 70, sd: 22 }, costUsd: { mean: 1200000, sd: 500000 } },
  pma: { readiness: { mean: 45, sd: 20 }, weeks: { mean: 110, sd: 30 }, costUsd: { mean: 3000000, sd: 1200000 } },
  eu_ivdr: { readiness: { mean: 55, sd: 18 }, weeks: { mean: 80, sd: 24 }, costUsd: { mean: 1500000, sd: 600000 } },
};

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 erf approximation). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  p = z > 0 ? 1 - p : p;
  return p;
}

export interface MetricBenchmark {
  metric: 'readiness' | 'timeline' | 'cost';
  value: number;
  norm: number;
  zScore: number;
  /** Percentile where higher = more favorable (readiness ↑ good; time/cost ↓ good). */
  favorablePercentile: number;
  band: 'top_decile' | 'above_typical' | 'typical' | 'below_typical' | 'bottom_decile';
}

export interface BenchmarkResult {
  pathway: BenchmarkPathway;
  metrics: MetricBenchmark[];
  /** Mean favorable percentile across supplied metrics. */
  overallFavorablePercentile: number;
}

function band(pct: number): MetricBenchmark['band'] {
  if (pct >= 90) return 'top_decile';
  if (pct >= 65) return 'above_typical';
  if (pct >= 35) return 'typical';
  if (pct >= 10) return 'below_typical';
  return 'bottom_decile';
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface BenchmarkInput {
  pathway: BenchmarkPathway;
  readinessScore?: number;
  timelineWeeks?: number;
  costUsd?: number;
}

/** Benchmark a program's supplied metrics against pathway norms. */
export function benchmarkProgram(input: BenchmarkInput): BenchmarkResult {
  const norms = PATHWAY_NORMS[input.pathway];
  if (!norms) throw new Error(`Unknown pathway: ${input.pathway}`);
  const metrics: MetricBenchmark[] = [];

  if (typeof input.readinessScore === 'number') {
    const z = (input.readinessScore - norms.readiness.mean) / norms.readiness.sd;
    const pct = r2(normalCdf(z) * 100); // higher readiness ⇒ higher favorable percentile
    metrics.push({ metric: 'readiness', value: input.readinessScore, norm: norms.readiness.mean, zScore: r2(z), favorablePercentile: pct, band: band(pct) });
  }
  if (typeof input.timelineWeeks === 'number') {
    const z = (input.timelineWeeks - norms.weeks.mean) / norms.weeks.sd;
    const pct = r2((1 - normalCdf(z)) * 100); // shorter timeline ⇒ higher favorable percentile
    metrics.push({ metric: 'timeline', value: input.timelineWeeks, norm: norms.weeks.mean, zScore: r2(z), favorablePercentile: pct, band: band(pct) });
  }
  if (typeof input.costUsd === 'number') {
    const z = (input.costUsd - norms.costUsd.mean) / norms.costUsd.sd;
    const pct = r2((1 - normalCdf(z)) * 100); // lower cost ⇒ higher favorable percentile
    metrics.push({ metric: 'cost', value: input.costUsd, norm: norms.costUsd.mean, zScore: r2(z), favorablePercentile: pct, band: band(pct) });
  }

  const overallFavorablePercentile = metrics.length
    ? r2(metrics.reduce((s, m) => s + m.favorablePercentile, 0) / metrics.length)
    : 0;

  return { pathway: input.pathway, metrics, overallFavorablePercentile };
}
