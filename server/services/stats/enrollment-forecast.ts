/**
 * Enrollment and dropout forecasting.
 *
 * Accrual is modeled with the Poisson–Gamma (Anisimov–Fedorov 2007) framework:
 * each site recruits as a Poisson process whose rate is itself Gamma-distributed
 * across sites, so the count by a given time is over-dispersed relative to a
 * plain Poisson (negative-binomial marginal). Sites may activate at staggered
 * times. Dropout is modeled as an exponential time-to-discontinuation.
 *
 * Closed forms are used for the expectations (which are exact); predictive
 * intervals come from a seeded Monte Carlo simulation of the same model, so the
 * intervals are calibrated by construction and the whole forecast is
 * reproducible and carries provenance.
 *
 * No fabrication: a site with a zero mean rate never recruits, and a target that
 * cannot be reached within the simulated horizon is reported as not reached
 * rather than invented.
 */

import { createRng, seedFromObject, type Rng } from './rng';
import { buildProvenance, type StatsProvenance } from './computation-provenance';

export interface SiteConfig {
  id?: string;
  /** Mean recruitment rate (patients per unit time) once active. */
  meanRate: number;
  /**
   * Coefficient of variation of the site rate across the Gamma prior. 0 ⇒ a
   * deterministic site rate (pure Poisson, no between-site over-dispersion).
   */
  rateCv?: number;
  /** Calendar time at which the site begins recruiting. Default 0. */
  activationTime?: number;
}

interface ResolvedSite {
  meanRate: number;
  activationTime: number;
  /** Gamma shape; Infinity ⇒ deterministic rate. */
  shape: number;
  /** Gamma scale (mean = shape·scale = meanRate). */
  scale: number;
}

function resolveSite(s: SiteConfig): ResolvedSite {
  if (s.meanRate < 0) throw new Error('meanRate must be non-negative');
  const cv = s.rateCv ?? 0;
  if (cv < 0) throw new Error('rateCv must be non-negative');
  const activationTime = s.activationTime ?? 0;
  if (activationTime < 0) throw new Error('activationTime must be non-negative');
  if (cv === 0 || s.meanRate === 0) {
    return { meanRate: s.meanRate, activationTime, shape: Infinity, scale: s.meanRate };
  }
  // Var(rate) = (cv·mean)² with a Gamma(shape, scale): shape = 1/cv², scale = mean·cv².
  const shape = 1 / (cv * cv);
  const scale = s.meanRate * cv * cv;
  return { meanRate: s.meanRate, activationTime, shape, scale };
}

/** Draw a site's realized rate (deterministic when shape is Infinity). */
function drawRate(site: ResolvedSite, rng: Rng): number {
  if (!Number.isFinite(site.shape)) return site.meanRate;
  return rng.gamma(site.shape, site.scale);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

// ── Closed-form expectations ───────────────────────────────────────────────────

/** Expected cumulative enrollment by calendar time t (exact). */
export function expectedEnrollmentByTime(sites: SiteConfig[], t: number): number {
  return sites.reduce((sum, s) => {
    const active = Math.max(t - (s.activationTime ?? 0), 0);
    return sum + s.meanRate * active;
  }, 0);
}

/**
 * Expected calendar time to reach `targetN` enrollments (exact, from the
 * piecewise-linear expected-accrual curve). Returns Infinity if the sites have
 * no recruitment capacity.
 */
export function expectedTimeToEnroll(sites: SiteConfig[], targetN: number): number {
  if (targetN <= 0) return 0;
  const totalRate = sites.reduce((s, c) => s + c.meanRate, 0);
  if (totalRate <= 0) return Infinity;
  // Walk activation epochs, accumulating expected patients until targetN is met.
  const epochs = Array.from(new Set(sites.map(s => s.activationTime ?? 0))).sort((a, b) => a - b);
  let accrued = 0;
  for (let e = 0; e < epochs.length; e++) {
    const tStart = epochs[e];
    const rateNow = sites.reduce(
      (s, c) => s + ((c.activationTime ?? 0) <= tStart ? c.meanRate : 0), 0,
    );
    // Expected accrued from tStart up to the next epoch (or infinity).
    const tEnd = e + 1 < epochs.length ? epochs[e + 1] : Infinity;
    if (rateNow > 0) {
      const need = targetN - accrued;
      const dtToTarget = need / rateNow;
      if (tStart + dtToTarget <= tEnd) return tStart + dtToTarget;
      accrued += rateNow * (tEnd - tStart);
    }
  }
  return Infinity; // unreachable in practice (totalRate > 0 guarantees a finite answer)
}

// ── Monte Carlo forecasts (seeded, reproducible) ───────────────────────────────

export interface CompletionForecast {
  expectedTime: number;
  medianTime: number;
  p10: number;
  p90: number;
  /** Fraction of simulations that reached the target within the horizon. */
  probReached: number;
  targetN: number;
  nSim: number;
  seed: number;
  provenance: StatsProvenance;
}

/** Exact simulation of superposed, staggered Poisson processes to the N-th arrival. */
function simulateCompletionTime(sites: ResolvedSite[], targetN: number, rng: Rng): number {
  const rates = sites.map(s => drawRate(s, rng));
  const next = sites.map((s, i) =>
    rates[i] > 0 ? s.activationTime + rng.exponential(rates[i]) : Infinity,
  );
  let count = 0;
  let last = 0;
  while (count < targetN) {
    let mi = -1;
    let mt = Infinity;
    for (let i = 0; i < next.length; i++) {
      if (next[i] < mt) { mt = next[i]; mi = i; }
    }
    if (mi < 0 || !Number.isFinite(mt)) return Infinity;
    last = mt;
    count++;
    next[mi] = mt + rng.exponential(rates[mi]);
  }
  return last;
}

/** Forecast the time to enroll `targetN` patients with an 80% prediction interval. */
export function forecastCompletion(args: {
  sites: SiteConfig[];
  targetN: number;
  nSim?: number;
  seed?: number;
}): CompletionForecast {
  if (args.targetN <= 0) throw new Error('targetN must be positive');
  if (!Number.isInteger(args.targetN)) throw new Error('targetN must be an integer');
  const resolved = args.sites.map(resolveSite);
  const nSim = args.nSim ?? 4000;
  const inputs = { sites: args.sites, targetN: args.targetN, nSim };
  const seed = args.seed !== undefined && Number.isFinite(args.seed)
    ? Math.trunc(args.seed) : seedFromObject(inputs);
  const rng = createRng(seed);

  const times: number[] = [];
  let reached = 0;
  let sumFinite = 0;
  for (let i = 0; i < nSim; i++) {
    const t = simulateCompletionTime(resolved, args.targetN, rng);
    if (Number.isFinite(t)) { reached++; sumFinite += t; times.push(t); }
  }
  times.sort((a, b) => a - b);

  return {
    expectedTime: reached > 0 ? sumFinite / reached : Infinity,
    medianTime: percentile(times, 0.5),
    p10: percentile(times, 0.1),
    p90: percentile(times, 0.9),
    probReached: reached / nSim,
    targetN: args.targetN,
    nSim,
    seed,
    provenance: buildProvenance({
      method: 'enrollment:forecastCompletion',
      seed,
      inputs,
      note: 'Poisson–Gamma accrual; seeded Monte Carlo completion time, reproducible for this seed.',
    }),
  };
}

export interface EnrollmentByTimeForecast {
  expected: number;
  median: number;
  p10: number;
  p90: number;
  time: number;
  nSim: number;
  seed: number;
  provenance: StatsProvenance;
}

/** Forecast cumulative enrollment by calendar time `t` with an 80% interval. */
export function forecastEnrollmentByTime(args: {
  sites: SiteConfig[];
  time: number;
  nSim?: number;
  seed?: number;
}): EnrollmentByTimeForecast {
  if (args.time < 0) throw new Error('time must be non-negative');
  const resolved = args.sites.map(resolveSite);
  const nSim = args.nSim ?? 4000;
  const inputs = { sites: args.sites, time: args.time, nSim };
  const seed = args.seed !== undefined && Number.isFinite(args.seed)
    ? Math.trunc(args.seed) : seedFromObject(inputs);
  const rng = createRng(seed);

  const counts: number[] = [];
  for (let i = 0; i < nSim; i++) {
    let total = 0;
    for (const s of resolved) {
      const elapsed = args.time - s.activationTime;
      if (elapsed <= 0) continue;
      const rate = drawRate(s, rng);
      if (rate > 0) total += rng.poisson(rate * elapsed);
    }
    counts.push(total);
  }
  counts.sort((a, b) => a - b);

  return {
    expected: expectedEnrollmentByTime(args.sites, args.time),
    median: percentile(counts, 0.5),
    p10: percentile(counts, 0.1),
    p90: percentile(counts, 0.9),
    time: args.time,
    nSim,
    seed,
    provenance: buildProvenance({
      method: 'enrollment:forecastByTime',
      seed,
      inputs,
      note: 'Poisson–Gamma accrual; seeded Monte Carlo count by time, reproducible for this seed.',
    }),
  };
}

// ── Dropout / retention ────────────────────────────────────────────────────────

export interface RetentionForecast {
  retentionProbability: number;
  expectedRetained: number;
  lower: number;
  upper: number;
  conf: number;
}

/**
 * Expected retention at follow-up time `atTime` under exponential dropout with
 * hazard `dropoutRatePerUnit`. Retained count is Binomial(n, e^{-ρt}); the
 * interval is the Wald interval on that binomial, clamped to [0, n].
 */
export function forecastRetention(args: {
  nEnrolled: number;
  dropoutRatePerUnit: number;
  atTime: number;
  conf?: number;
}): RetentionForecast {
  if (args.nEnrolled < 0) throw new Error('nEnrolled must be non-negative');
  if (args.dropoutRatePerUnit < 0) throw new Error('dropoutRatePerUnit must be non-negative');
  if (args.atTime < 0) throw new Error('atTime must be non-negative');
  const conf = args.conf ?? 0.95;
  const p = Math.exp(-args.dropoutRatePerUnit * args.atTime);
  const mean = args.nEnrolled * p;
  // z for the two-sided interval; 1.959964 at 95%, scaled for other levels.
  const z = conf === 0.95 ? 1.959964 : Math.SQRT2 * inverseErf(conf);
  const sd = Math.sqrt(args.nEnrolled * p * (1 - p));
  return {
    retentionProbability: p,
    expectedRetained: mean,
    lower: Math.max(0, mean - z * sd),
    upper: Math.min(args.nEnrolled, mean + z * sd),
    conf,
  };
}

/** Inverse error function (Winitzki approximation) — only used for non-95% CIs. */
function inverseErf(x: number): number {
  const a = 0.147;
  const ln = Math.log(1 - x * x);
  const t = 2 / (Math.PI * a) + ln / 2;
  return Math.sign(x) * Math.sqrt(Math.sqrt(t * t - ln / a) - t);
}

// ── Holdout error (for model evaluation against observed accrual) ───────────────

export interface AccrualHoldoutError {
  meanAbsoluteError: number;
  rootMeanSquaredError: number;
  points: Array<{ time: number; observed: number; expected: number; error: number }>;
}

/**
 * Report holdout error of the closed-form expected-accrual curve against an
 * observed cumulative-enrollment series. The mechanism for "holdout error
 * reported"; evaluation against a real corpus is gated on the corpus workstream.
 */
export function accrualHoldoutError(
  sites: SiteConfig[],
  observed: Array<{ time: number; cumulative: number }>,
): AccrualHoldoutError {
  if (observed.length === 0) throw new Error('observed series must be non-empty');
  const points = observed.map(o => {
    const expected = expectedEnrollmentByTime(sites, o.time);
    return { time: o.time, observed: o.cumulative, expected, error: o.cumulative - expected };
  });
  const mae = points.reduce((s, p) => s + Math.abs(p.error), 0) / points.length;
  const rmse = Math.sqrt(points.reduce((s, p) => s + p.error * p.error, 0) / points.length);
  return { meanAbsoluteError: mae, rootMeanSquaredError: rmse, points };
}
