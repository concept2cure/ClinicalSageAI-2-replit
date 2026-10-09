/**
 * Enrollment projection.
 *
 * What the suite holds: every number is the stats engine's (the projection's
 * median, interval and closed form equal `forecastCompletion` /
 * `expectedTimeToEnroll` called directly); no accrual plan or no sample size is
 * MISSING — no rate, variability or activation time is ever assumed; a target
 * the sites cannot reach, in every simulation or only in some, is null times,
 * never a very large number; invalid or malformed site rows are gaps with no
 * forecast and no throw; the seed says whether it was recorded or derived; the
 * work is bounded and the bound is stated; the forecast is a function of the
 * design alone (no clock in the output).
 */
import { describe, expect, it } from 'vitest';

import { expectedTimeToEnroll, forecastCompletion } from '../../stats/enrollment-forecast';
import type { AccrualPlan, StudyDesign } from '../study-design-types';
import {
  ENROLLMENT_MIN_SIMULATIONS, ENROLLMENT_SIMULATIONS, ENROLLMENT_WORK_BUDGET, projectEnrollment,
} from '../enrollment-projection';

function plan(): AccrualPlan {
  return {
    timeUnit: 'month',
    rateSource: 'site feasibility questionnaires, 2026-08',
    seed: 20260928,
    sites: [
      { id: 'US-01', country: 'US', meanRate: 1.5, rateCv: 0.5, activationTime: 0 },
      { id: 'US-02', country: 'US', meanRate: 1.0, rateCv: 0.5, activationTime: 2 },
      { id: 'DE-01', country: 'DE', meanRate: 0.8, rateCv: 0.5, activationTime: 3 },
    ],
  };
}

function design(): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in type 2 diabetes',
    phase: '3',
    indication: 'type 2 diabetes',
    objectives: [],
    estimands: [],
    endpoints: [{ name: 'HbA1c change', role: 'primary', type: 'continuous', definition: 'change from baseline in HbA1c at week 24' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: { targetDescription: 'adults', analysisPopulations: [], eligibility: [] },
    arms: [],
    statisticalPlan: { plannedAnalyses: [], plannedSampleSize: 60 },
    accrualPlan: plan(),
  } as StudyDesign;
}

const clone = (d: StudyDesign): StudyDesign => JSON.parse(JSON.stringify(d));
/** A persisted design is not validated: tests write malformed values through this. */
const loose = (o: object): Record<string, unknown> => o as Record<string, unknown>;
const engineSites = (p: AccrualPlan) => p.sites.map((s) => ({ id: s.id, meanRate: s.meanRate, rateCv: s.rateCv, activationTime: s.activationTime }));

describe('projectEnrollment — the engine\'s numbers', () => {
  it('equals forecastCompletion and expectedTimeToEnroll called directly', () => {
    const p = projectEnrollment(design());
    const sites = engineSites(plan());
    const f = forecastCompletion({ sites, targetN: 60, nSim: ENROLLMENT_SIMULATIONS, seed: 20260928 });
    expect(p.status).toBe('rendered');
    expect(p.gaps).toEqual([]);
    expect(p.forecast).toMatchObject({
      median: f.medianTime, p10: f.p10, p90: f.p90, probReached: 1, seed: 20260928, seedSource: 'recorded',
      nSim: 4000, nSimReducedFrom: null, targetN: 60, timeUnit: 'month',
    });
    expect(p.forecast!.closedFormExpectedTime).toBe(expectedTimeToEnroll(sites, 60));
    expect(p.forecast!.p10!).toBeLessThanOrEqual(p.forecast!.median!);
    expect(p.forecast!.median!).toBeLessThanOrEqual(p.forecast!.p90!);
  });

  it('summarises sites by country, sorted, rounded, without inventing a country', () => {
    const d = design();
    d.accrualPlan!.sites.push(
      { id: 'XX-01', meanRate: 0.5, rateCv: 0.5, activationTime: 1 },
      { id: 'FR-01', country: 'FR', meanRate: 0.1, rateCv: 0.5, activationTime: 1 },
      { id: 'FR-02', country: 'FR', meanRate: 0.2, rateCv: 0.5, activationTime: 1 },
    );
    loose(d.accrualPlan!.sites[1]).country = 5;
    expect(projectEnrollment(d).sites).toEqual({
      total: 6,
      byCountry: [
        { country: 'DE', sites: 1, meanRatePerUnit: 0.8 },
        { country: 'FR', sites: 2, meanRatePerUnit: 0.3 },
        { country: 'US', sites: 1, meanRatePerUnit: 1.5 },
        { country: 'country not recorded', sites: 2, meanRatePerUnit: 1.5 },
      ],
    });
  });

  it('is a function of the design alone: no clock reading in the output, identical across calls', () => {
    const a = projectEnrollment(design());
    expect(a.forecast!.provenance).not.toHaveProperty('generatedAt');
    expect(JSON.stringify(a)).toBe(JSON.stringify(projectEnrollment(clone(design()))));
  });
});

describe('projectEnrollment — no target, no plan: nothing assumed', () => {
  it('no accrual plan is missing, with no forecast and no site summary', () => {
    const d = design();
    delete d.accrualPlan;
    const p = projectEnrollment(d);
    expect(p).toMatchObject({ status: 'missing', forecast: null, sites: null });
    expect(p.gaps[0]).toMatch(/sponsor inputs from feasibility, and none is recorded/);
    d.accrualPlan = { timeUnit: 'month', sites: [] };
    expect(projectEnrollment(d).status).toBe('missing');
  });

  it('no planned sample size is missing — no target, no country summary, and the site defects still reported', () => {
    const d = design();
    delete d.statisticalPlan.plannedSampleSize;
    d.accrualPlan!.sites.push({ id: 'US-01', meanRate: -1, rateCv: 0.5, activationTime: 0 });
    const p = projectEnrollment(d);
    expect(p).toMatchObject({ status: 'missing', forecast: null, sites: { total: 4, byCountry: null } });
    expect(p.gaps).toEqual([
      'the planned sample size is not recorded, so there is no enrollment target to forecast',
      'site US-01 is listed twice',
      'site US-01 has no valid recruitment rate',
    ]);
  });

  it('a planned sample size that is not a whole number is missing, not a throw', () => {
    const d = design();
    d.statisticalPlan.plannedSampleSize = 60.5;
    const p = projectEnrollment(d);
    expect(p).toMatchObject({ status: 'missing', forecast: null });
    expect(p.gaps).toEqual(['the planned sample size (60.5) is not a whole positive number, so there is no enrollment target to forecast']);
  });

  it('a plan with no time unit, or one that is not week or month, is a gap with no forecast', () => {
    for (const unit of [undefined, 'day']) {
      const d = design();
      loose(d.accrualPlan!).timeUnit = unit;
      expect(projectEnrollment(d)).toMatchObject({
        status: 'partial', forecast: null, gaps: ['the accrual plan does not state its time unit (week or month)'],
      });
    }
  });

  it('an unrecorded rate source keeps the forecast but marks it partial', () => {
    const d = design();
    delete d.accrualPlan!.rateSource;
    const p = projectEnrollment(d);
    expect(p.status).toBe('partial');
    expect(p.forecast).not.toBeNull();
    expect(p.gaps).toEqual(['the source of the site recruitment rates is not recorded']);
  });
});

describe('projectEnrollment — site rows', () => {
  it('a site with no rate variability or activation time recorded is a gap: no fixed rate or start-of-study activation assumed', () => {
    const d = design();
    d.accrualPlan!.sites = d.accrualPlan!.sites.map((s) => ({ id: s.id, country: s.country, meanRate: s.meanRate }));
    const p = projectEnrollment(d);
    expect(p).toMatchObject({ status: 'partial', forecast: null, sites: { total: 3, byCountry: null } });
    expect(p.gaps).toEqual(['US-01', 'US-02', 'DE-01'].flatMap((id) => [
      `site ${id} does not record its rate variability (rateCv): the interval depends on it, and a fixed rate is not assumed`,
      `site ${id} does not record its activation time: activation at study start is not assumed`,
    ]));
  });

  it('invalid site rows are gaps with no forecast', () => {
    const d = design();
    d.accrualPlan!.sites = [
      { id: 'A', meanRate: -1, rateCv: 0.5, activationTime: 0 },
      { id: 'A', meanRate: 1, rateCv: -0.2, activationTime: 0 },
      { id: '', meanRate: 1, rateCv: 0.5, activationTime: -3 },
    ];
    const p = projectEnrollment(d);
    expect(p.status).toBe('partial');
    expect(p.forecast).toBeNull();
    expect(p.gaps).toEqual([
      'site A has no valid recruitment rate',
      'site A is listed twice',
      'site A has an invalid rate variability',
      'site #3 has no identifier',
      'site #3 has an invalid activation time',
    ]);
  });

  it('a row that is not a site record is a gap, not a throw', () => {
    const d = design();
    loose(d.accrualPlan!).sites = [null, 'US-09', ...plan().sites];
    const p = projectEnrollment(d);
    expect(p).toMatchObject({ status: 'partial', forecast: null });
    expect(p.gaps).toEqual(['site #1 is not a site record', 'site #2 is not a site record']);
  });
});

describe('projectEnrollment — reached or not', () => {
  it('sites with no capacity are "not reached": null times and a zero probability, never a large number', () => {
    const d = design();
    d.accrualPlan!.sites = [{ id: 'S1', country: 'US', meanRate: 0, rateCv: 0, activationTime: 0 }];
    const p = projectEnrollment(d);
    expect(p.status).toBe('partial');
    expect(p.forecast).toMatchObject({ probReached: 0, median: null, p10: null, p90: null, closedFormExpectedTime: null });
    expect(p.gaps).toContain('the recorded sites cannot reach the planned sample size: no simulation reached it');
  });

  it('a target reached in only some simulations reports no completion times, and says how many never reached it', () => {
    const d = design();
    d.accrualPlan!.sites = [{ id: 'A', meanRate: 1, rateCv: 20, activationTime: 0 }, { id: 'B', meanRate: 1, rateCv: 20, activationTime: 0 }];
    const f = forecastCompletion({ sites: engineSites(d.accrualPlan!), targetN: 60, nSim: ENROLLMENT_SIMULATIONS, seed: 20260928 });
    expect(f.probReached).toBeGreaterThan(0);
    expect(f.probReached).toBeLessThan(1);
    const p = projectEnrollment(d);
    expect(p.status).toBe('partial');
    expect(p.forecast).toMatchObject({ probReached: f.probReached, median: null, p10: null, p90: null });
    const never = Math.round((1 - f.probReached) * ENROLLMENT_SIMULATIONS);
    expect(p.gaps).toEqual([
      `in ${never} of the ${ENROLLMENT_SIMULATIONS} simulations the planned sample size was never reached; the median and 80% interval are not ` +
        'reported, because the engine\'s quantiles are among only the simulations that reached it',
    ]);
  });
});

describe('projectEnrollment — the seed', () => {
  it('no recorded seed: the engine derives one, and the output says so without calling it a gap', () => {
    const d = design();
    delete d.accrualPlan!.seed;
    const p = projectEnrollment(d);
    expect(p).toMatchObject({ status: 'rendered', gaps: [] });
    expect(p.forecast!.seedSource).toBe('derived_from_inputs');
    expect(p.note).toContain(`Seed ${p.forecast!.seed} was derived from the inputs; no usable seed is recorded.`);
  });

  it('a recorded seed that is not a whole number is a gap, and the derived seed is labelled as such', () => {
    for (const seed of ['abc', Number.NaN, 12.5]) {
      const d = design();
      loose(d.accrualPlan!).seed = seed;
      const p = projectEnrollment(d);
      expect(p.status).toBe('partial');
      expect(p.forecast!.seedSource).toBe('derived_from_inputs');
      expect(p.gaps).toEqual([`the recorded Monte Carlo seed (${typeof seed === 'string' ? JSON.stringify(seed) : String(seed)}) is not a whole number: the forecast uses a seed derived from the inputs`]);
    }
  });
});

describe('projectEnrollment — bounded work', () => {
  const bigPlan = (n: number): AccrualPlan => ({
    timeUnit: 'month', rateSource: 'feasibility', seed: 7,
    sites: Array.from({ length: n }, (_, i) => ({ id: `S${i}`, country: 'US', meanRate: 1, rateCv: 0.5, activationTime: i % 6 })),
  });

  it('a 20,000-patient, 150-site plan runs within the work budget, with the reduced count stated', () => {
    const d = design();
    d.statisticalPlan.plannedSampleSize = 20000;
    d.accrualPlan = bigPlan(150);
    const t0 = performance.now();
    const p = projectEnrollment(d);
    const ms = performance.now() - t0;
    const f = p.forecast!;
    expect(f.nSim * 20000 * 150).toBeLessThanOrEqual(ENROLLMENT_WORK_BUDGET);
    expect(f.nSim).toBeGreaterThanOrEqual(ENROLLMENT_MIN_SIMULATIONS);
    expect(f).toMatchObject({ nSimReducedFrom: ENROLLMENT_SIMULATIONS, probReached: 1 });
    expect(p.note).toContain(`${f.nSim} simulations were run rather than ${ENROLLMENT_SIMULATIONS}`);
    expect(ms).toBeLessThan(8000);
  }, 30_000);

  it('a plan too large to simulate within the budget is not simulated: a gap, never an unbounded run', () => {
    const d = design();
    d.statisticalPlan.plannedSampleSize = 40000;
    d.accrualPlan = bigPlan(1000);
    const p = projectEnrollment(d);
    expect(p).toMatchObject({ status: 'partial', forecast: null });
    expect(p.gaps).toEqual([
      `the Monte Carlo forecast is not run: 40000 patients across 1000 sites take 40000000 site-arrival steps per simulation, and fewer than ` +
        `${ENROLLMENT_MIN_SIMULATIONS} simulations fit the projection's work budget of ${ENROLLMENT_WORK_BUDGET} steps`,
    ]);
  });
});
