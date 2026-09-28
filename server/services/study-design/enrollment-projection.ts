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
 *    re-derives an accrual formula.
 *  - Rates are sponsor inputs. No accrual plan → `missing`; the projection
 *    never assumes a rate, a site count or an activation schedule.
 *  - A target the sites cannot reach is reported as not reached (null times,
 *    the engine's probability), never as a very large number.
 *  - The interval is labelled for what it is: among simulations that reached
 *    the target.
 *  - Pure and total: no model, no DB, no throw. The engine's provenance carries
 *    a `generatedAt` clock reading; it is dropped here so the projection is a
 *    function of the design alone — the seed and the input hash, which are
 *    what reproduce the forecast, are kept.
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

export type EnrollmentStatus = 'rendered' | 'partial' | 'missing';

export interface EnrollmentForecastView {
  timeUnit: AccrualPlan['timeUnit'];
  targetN: number;
  /** Probability the target is reached at all, as the engine simulated it. */
  probReached: number;
  /** Among simulations that reached the target; null when none did. */
  median: number | null;
  p10: number | null;
  p90: number | null;
  /** Exact time at which EXPECTED accrual reaches the target at the mean rates; null when the sites have no capacity. */
  closedFormExpectedTime: number | null;
  nSim: number;
  seed: number;
  provenance: ReproducibleProvenance;
}

export interface EnrollmentProjection {
  status: EnrollmentStatus;
  gaps: string[];
  sites: { total: number; byCountry: Array<{ country: string; sites: number; meanRatePerUnit: number }> } | null;
  forecast: EnrollmentForecastView | null;
  /** The interval's meaning, stated. */
  note: string | null;
  basis: string;
}

const finiteOrNull = (v: number): number | null => (Number.isFinite(v) ? v : null);

const nonNegative = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Every defect in one site row, in the order a reader would fix them. */
function siteGaps(site: AccrualPlan['sites'][number], index: number, seen: Set<string>): string[] {
  const gaps: string[] = [];
  const name = site.id ? `site ${site.id}` : `site #${index + 1}`;
  if (!site.id) gaps.push(`${name} has no identifier`);
  else if (seen.has(site.id)) gaps.push(`${name} is listed twice`);
  seen.add(site.id);
  if (!nonNegative(site.meanRate)) gaps.push(`${name} has no valid recruitment rate`);
  if (site.rateCv !== undefined && !nonNegative(site.rateCv)) gaps.push(`${name} has an invalid rate variability`);
  if (site.activationTime !== undefined && !nonNegative(site.activationTime)) gaps.push(`${name} has an invalid activation time`);
  return gaps;
}

function planGaps(plan: AccrualPlan): string[] {
  const gaps: string[] = [];
  if (plan.timeUnit !== 'week' && plan.timeUnit !== 'month') gaps.push('the accrual plan does not state its time unit (week or month)');
  const seen = new Set<string>();
  plan.sites.forEach((s, i) => gaps.push(...siteGaps(s, i, seen)));
  return gaps;
}

function byCountry(plan: AccrualPlan): Array<{ country: string; sites: number; meanRatePerUnit: number }> {
  const acc = new Map<string, { sites: number; meanRatePerUnit: number }>();
  for (const s of plan.sites) {
    const key = s.country?.trim() || 'country not recorded';
    const cur = acc.get(key) ?? { sites: 0, meanRatePerUnit: 0 };
    acc.set(key, { sites: cur.sites + 1, meanRatePerUnit: cur.meanRatePerUnit + s.meanRate });
  }
  return [...acc.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([country, v]) => ({ country, ...v }));
}

function forecastOf(plan: AccrualPlan, targetN: number): EnrollmentForecastView {
  const sites: SiteConfig[] = plan.sites.map((s) => ({ id: s.id, meanRate: s.meanRate, rateCv: s.rateCv, activationTime: s.activationTime }));
  const f = forecastCompletion({ sites, targetN, nSim: ENROLLMENT_SIMULATIONS, seed: plan.seed });
  const provenance = reproducibleProvenance(f.provenance);
  const reachedAny = f.probReached > 0;
  return {
    timeUnit: plan.timeUnit,
    targetN,
    probReached: f.probReached,
    median: reachedAny ? finiteOrNull(f.medianTime) : null,
    p10: reachedAny ? finiteOrNull(f.p10) : null,
    p90: reachedAny ? finiteOrNull(f.p90) : null,
    closedFormExpectedTime: finiteOrNull(expectedTimeToEnroll(sites, targetN)),
    nSim: f.nSim,
    seed: f.seed,
    provenance,
  };
}

function missing(gap: string): EnrollmentProjection {
  return { status: 'missing', gaps: [gap], sites: null, forecast: null, note: null, basis: ENROLLMENT_PROJECTION_BASIS };
}

/** Project the time to reach the planned sample size from the design's accrual plan. */
export function projectEnrollment(design: StudyDesign): EnrollmentProjection {
  const targetN = design.statisticalPlan?.plannedSampleSize;
  const plan = design.accrualPlan;
  if (!plan || !Array.isArray(plan.sites) || plan.sites.length === 0) {
    return missing('no accrual plan: per-site recruitment rates and activation times are sponsor inputs from feasibility, and none is recorded');
  }
  const siteView = { total: plan.sites.length, byCountry: [] as Array<{ country: string; sites: number; meanRatePerUnit: number }> };
  if (!(typeof targetN === 'number' && Number.isInteger(targetN) && targetN > 0)) {
    return { ...missing('the planned sample size is not recorded, so there is no enrollment target to forecast'), sites: siteView };
  }
  const gaps = planGaps(plan);
  if (gaps.length > 0) return { status: 'partial', gaps, sites: siteView, forecast: null, note: null, basis: ENROLLMENT_PROJECTION_BASIS };
  siteView.byCountry = byCountry(plan);
  const forecast = forecastOf(plan, targetN);
  const extra: string[] = [];
  if (!plan.rateSource?.trim()) extra.push('the source of the site recruitment rates is not recorded');
  if (forecast.probReached === 0) extra.push('the recorded sites cannot reach the planned sample size: no simulation reached it');
  return {
    status: extra.length ? 'partial' : 'rendered',
    gaps: extra,
    sites: siteView,
    forecast,
    note:
      `Times are in ${plan.timeUnit}s from study start. The median and the 80% interval (p10–p90) are among the simulations that reached ` +
      `${targetN} patients; the probability of reaching it at all is reported beside them.`,
    basis: ENROLLMENT_PROJECTION_BASIS,
  };
}
