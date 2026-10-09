/**
 * Enrollment projection — when the planned sample size is reached, from the
 * sponsor's site accrual plan.
 *
 * ## The industry need
 * Enrollment is where trials miss their timelines, and a feasibility forecast
 * with a prediction interval is standard in every sponsor's and CRO's
 * start-up package: how long to reach N at these sites, with this activation
 * schedule, and how uncertain that is. This repository has a correct
 * Poisson–Gamma accrual engine (Anisimov & Fedorov 2007;
 * `stats/enrollment-forecast.ts`: seeded Monte Carlo, exact closed-form
 * expectation) reachable only as a free-standing calculator. The design spine
 * could not carry a site plan, so a protocol's recruitment timeline was prose.
 * `trial-feasibility.ts` answers a different question — comparator base rates
 * from ClinicalTrials.gov — and is not duplicated here.
 *
 * ## The honesty contract
 *  - Every number is the engine's: `forecastCompletion` for the median and
 *    80% interval, `expectedTimeToEnroll` for the closed form. Nothing here
 *    re-derives an accrual formula. (The per-country rate is a display sum of
 *    recorded rates, rounded to 6 decimal places.)
 *  - Rates are sponsor inputs. No accrual plan → `missing`; the projection
 *    never assumes a rate, a site count or an activation schedule. The engine
 *    reads an absent rate variability as 0 and an absent activation time as
 *    study start — the narrowest interval and the earliest completion — so a
 *    site that records neither is a gap and nothing is forecast.
 *  - A target the sites cannot reach is reported as not reached (null times,
 *    the engine's probability), never as a very large number. When only some
 *    simulations reach it, the engine's quantiles are among those that did, so
 *    they are not reported either; the count that never reached it is a gap.
 *  - The seed says where it came from: the plan's, or derived from the inputs
 *    when none usable is recorded. A recorded seed that is not a whole number
 *    is a gap, never silently replaced.
 *  - Bounded work: one simulation costs targetN × sites steps. The projection
 *    runs at most `ENROLLMENT_WORK_BUDGET` steps in all — fewer simulations
 *    when the plan is large, stated in the output — and does not simulate at
 *    all when fewer than `ENROLLMENT_MIN_SIMULATIONS` would fit.
 *  - Pure and total: no model, no DB, no throw — a malformed persisted row is
 *    a gap. The engine's provenance carries a `generatedAt` clock reading; it
 *    is dropped here so the projection is a function of the design alone —
 *    the seed and the input hash, which reproduce the forecast, are kept.
 *
 * @module server/services/study-design/enrollment-projection
 */

import { expectedTimeToEnroll, forecastCompletion, type SiteConfig } from '../stats/enrollment-forecast';
import { reproducibleProvenance, type ReproducibleProvenance } from '../stats/computation-provenance';
import type { AccrualPlan, StudyDesign } from './study-design-types';

export const ENROLLMENT_PROJECTION_BASIS =
  'Anisimov VV, Fedorov VV. Modelling, prediction and adaptive adjustment of recruitment in multicentre trials. Stat Med 2007;26:4958–4975 (Poisson–Gamma accrual)';

/** Monte Carlo draws — the engine's own default, named so the output says it. */
export const ENROLLMENT_SIMULATIONS = 4000;

/**
 * Most site-arrival steps (simulations × targetN × sites) one projection runs.
 * The engine was measured at 2.5–4.5 ns a step, so this bounds a projection,
 * which runs synchronously on the request path, to roughly 1–2 seconds.
 */
export const ENROLLMENT_WORK_BUDGET = 400_000_000;

/** Fewest simulations whose 10th/90th percentiles the projection will report. */
export const ENROLLMENT_MIN_SIMULATIONS = 100;

export type EnrollmentStatus = 'rendered' | 'partial' | 'missing';

export interface EnrollmentForecastView {
  timeUnit: AccrualPlan['timeUnit'];
  targetN: number;
  /** Probability the target is reached at all, as the engine simulated it. */
  probReached: number;
  /** Over all simulations; null unless every simulation reached the target. */
  median: number | null;
  p10: number | null;
  p90: number | null;
  /** Exact time at which EXPECTED accrual reaches the target at the mean rates; null when the sites have no capacity. */
  closedFormExpectedTime: number | null;
  nSim: number;
  /** The count asked for when the work budget cut it; null when the full count ran. */
  nSimReducedFrom: number | null;
  seed: number;
  seedSource: 'recorded' | 'derived_from_inputs';
  provenance: ReproducibleProvenance;
}

export interface CountrySummary { country: string; sites: number; meanRatePerUnit: number }

export interface EnrollmentProjection {
  status: EnrollmentStatus;
  gaps: string[];
  /** byCountry is null when it is not computed (no forecast), never an empty list standing for "no countries". */
  sites: { total: number; byCountry: CountrySummary[] | null } | null;
  forecast: EnrollmentForecastView | null;
  /** The interval's meaning, stated. */
  note: string | null;
  basis: string;
}

type Site = AccrualPlan['sites'][number];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const finiteOrNull = (v: number): number | null => (Number.isFinite(v) ? v : null);

const nonNegative = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Every defect in one site row, in the order a reader would fix them. */
function siteGaps(row: unknown, index: number, seen: Set<string>): string[] {
  if (!isRecord(row)) return [`site #${index + 1} is not a site record`];
  const gaps: string[] = [];
  const id = typeof row.id === 'string' && row.id ? row.id : null;
  const name = id ? `site ${id}` : `site #${index + 1}`;
  if (!id) gaps.push(`${name} has no identifier`);
  else if (seen.has(id)) gaps.push(`${name} is listed twice`);
  if (id) seen.add(id);
  if (!nonNegative(row.meanRate)) gaps.push(`${name} has no valid recruitment rate`);
  if (row.rateCv === undefined) gaps.push(`${name} does not record its rate variability (rateCv): the interval depends on it, and a fixed rate is not assumed`);
  else if (!nonNegative(row.rateCv)) gaps.push(`${name} has an invalid rate variability`);
  if (row.activationTime === undefined) gaps.push(`${name} does not record its activation time: activation at study start is not assumed`);
  else if (!nonNegative(row.activationTime)) gaps.push(`${name} has an invalid activation time`);
  return gaps;
}

/** The defects that stop a forecast: the time unit and every site row. */
function planGaps(plan: AccrualPlan): string[] {
  const gaps: string[] = [];
  if (plan.timeUnit !== 'week' && plan.timeUnit !== 'month') gaps.push('the accrual plan does not state its time unit (week or month)');
  const seen = new Set<string>();
  (plan.sites as unknown[]).forEach((s, i) => gaps.push(...siteGaps(s, i, seen)));
  return gaps;
}

const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;

function byCountry(sites: Site[]): CountrySummary[] {
  const acc = new Map<string, { sites: number; meanRatePerUnit: number }>();
  for (const s of sites) {
    const key = (typeof s.country === 'string' && s.country.trim()) || 'country not recorded';
    const cur = acc.get(key) ?? { sites: 0, meanRatePerUnit: 0 };
    acc.set(key, { sites: cur.sites + 1, meanRatePerUnit: cur.meanRatePerUnit + s.meanRate });
  }
  return [...acc.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([country, v]) => ({ country, sites: v.sites, meanRatePerUnit: round6(v.meanRatePerUnit) }));
}

/** The plan's seed when it is a whole number; otherwise the engine derives one, and a recorded non-integer is a gap. */
function seedOf(plan: AccrualPlan): { seed: number | undefined; gaps: string[] } {
  const s: unknown = plan.seed;
  if (s === undefined || s === null) return { seed: undefined, gaps: [] };
  if (typeof s === 'number' && Number.isInteger(s)) return { seed: s, gaps: [] };
  const shown = typeof s === 'string' ? JSON.stringify(s) : String(s);
  return { seed: undefined, gaps: [`the recorded Monte Carlo seed (${shown}) is not a whole number: the forecast uses a seed derived from the inputs`] };
}

/** Simulations that fit the work budget, capped at the engine's default count. */
function simulationCount(targetN: number, siteCount: number): number {
  return Math.min(ENROLLMENT_SIMULATIONS, Math.floor(ENROLLMENT_WORK_BUDGET / (targetN * siteCount)));
}

function forecastOf(sites: SiteConfig[], plan: AccrualPlan, targetN: number, nSim: number, seed: number | undefined): EnrollmentForecastView {
  const f = forecastCompletion({ sites, targetN, nSim, seed });
  // Quantiles are the engine's over the simulations that reached the target;
  // they are the forecast's only when every simulation did.
  const all = f.probReached === 1;
  return {
    timeUnit: plan.timeUnit,
    targetN,
    probReached: f.probReached,
    median: all ? finiteOrNull(f.medianTime) : null,
    p10: all ? finiteOrNull(f.p10) : null,
    p90: all ? finiteOrNull(f.p90) : null,
    closedFormExpectedTime: finiteOrNull(expectedTimeToEnroll(sites, targetN)),
    nSim: f.nSim,
    nSimReducedFrom: f.nSim < ENROLLMENT_SIMULATIONS ? ENROLLMENT_SIMULATIONS : null,
    seed: f.seed,
    seedSource: seed === undefined ? 'derived_from_inputs' : 'recorded',
    provenance: reproducibleProvenance(f.provenance),
  };
}

function reachGaps(f: EnrollmentForecastView): string[] {
  if (f.probReached === 0) return ['the recorded sites cannot reach the planned sample size: no simulation reached it'];
  if (f.probReached === 1) return [];
  const never = Math.round((1 - f.probReached) * f.nSim);
  return [
    `in ${never} of the ${f.nSim} simulations the planned sample size was never reached; the median and 80% interval are not reported, ` +
      'because the engine\'s quantiles are among only the simulations that reached it',
  ];
}

function noteOf(f: EnrollmentForecastView): string {
  return [
    `Times are in ${f.timeUnit}s from study start. The median and the 80% interval (p10–p90) are over all ${f.nSim} simulations, and are ` +
      `reported only when every simulation reached ${f.targetN} patients; the probability of reaching it is reported beside them.`,
    f.seedSource === 'recorded' ? `Seed ${f.seed} is the accrual plan's.` : `Seed ${f.seed} was derived from the inputs; no usable seed is recorded.`,
    f.nSimReducedFrom === null ? '' :
      `${f.nSim} simulations were run rather than ${f.nSimReducedFrom}, to keep the projection within its work budget of ` +
      `${ENROLLMENT_WORK_BUDGET} site-arrival steps; the interval carries more Monte Carlo error accordingly.`,
  ].filter(Boolean).join(' ');
}

function missing(gaps: string[], sites: EnrollmentProjection['sites'] = null): EnrollmentProjection {
  return { status: 'missing', gaps, sites, forecast: null, note: null, basis: ENROLLMENT_PROJECTION_BASIS };
}

function partial(gaps: string[], sites: EnrollmentProjection['sites']): EnrollmentProjection {
  return { status: 'partial', gaps, sites, forecast: null, note: null, basis: ENROLLMENT_PROJECTION_BASIS };
}

/** Why the recorded planned N is not a forecast target, or null when it is one. */
function targetGap(targetN: unknown): string | null {
  if (typeof targetN === 'number' && Number.isInteger(targetN) && targetN > 0) return null;
  if (targetN === undefined || targetN === null) return 'the planned sample size is not recorded, so there is no enrollment target to forecast';
  return `the planned sample size (${String(targetN)}) is not a whole positive number, so there is no enrollment target to forecast`;
}

/** Project the time to reach the planned sample size from the design's accrual plan. */
export function projectEnrollment(design: StudyDesign): EnrollmentProjection {
  const plan: unknown = design.accrualPlan;
  if (!isRecord(plan) || !Array.isArray(plan.sites) || plan.sites.length === 0) {
    return missing(['no accrual plan: per-site recruitment rates and activation times are sponsor inputs from feasibility, and none is recorded']);
  }
  const accrual = plan as unknown as AccrualPlan;
  const siteView = { total: accrual.sites.length, byCountry: null };
  const targetN = design.statisticalPlan?.plannedSampleSize;
  const noTarget = targetGap(targetN);
  const gaps = planGaps(accrual);
  if (noTarget !== null) return missing([noTarget, ...gaps], siteView);
  if (gaps.length > 0) return partial(gaps, siteView);
  const n = targetN as number;
  const nSim = simulationCount(n, accrual.sites.length);
  if (nSim < ENROLLMENT_MIN_SIMULATIONS) {
    return partial([
      `the Monte Carlo forecast is not run: ${n} patients across ${accrual.sites.length} sites take ${n * accrual.sites.length} site-arrival steps per ` +
        `simulation, and fewer than ${ENROLLMENT_MIN_SIMULATIONS} simulations fit the projection's work budget of ${ENROLLMENT_WORK_BUDGET} steps`,
    ], siteView);
  }
  const sites: SiteConfig[] = accrual.sites.map((s) => ({ id: s.id, meanRate: s.meanRate, rateCv: s.rateCv, activationTime: s.activationTime }));
  const seed = seedOf(accrual);
  const forecast = forecastOf(sites, accrual, n, nSim, seed.seed);
  const sourced = typeof accrual.rateSource === 'string' && accrual.rateSource.trim() !== '';
  const extra = [...(sourced ? [] : ['the source of the site recruitment rates is not recorded']), ...seed.gaps, ...reachGaps(forecast)];
  return {
    status: extra.length ? 'partial' : 'rendered',
    gaps: extra,
    sites: { total: accrual.sites.length, byCountry: byCountry(accrual.sites) },
    forecast,
    note: noteOf(forecast),
    basis: ENROLLMENT_PROJECTION_BASIS,
  };
}
