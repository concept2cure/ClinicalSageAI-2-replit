/**
 * Enrollment projection.
 *
 * What the suite holds: every number is the stats engine's (the projection's
 * median, interval and closed form equal `forecastCompletion` /
 * `expectedTimeToEnroll` called directly); no accrual plan or no sample size is
 * MISSING — no rate is ever assumed; a target the sites cannot reach is null
 * times, not a large number; invalid site rows are gaps with no forecast; the
 * forecast is a function of the design alone (no clock in the output).
 */
import { describe, expect, it } from 'vitest';

import { expectedTimeToEnroll, forecastCompletion } from '../../stats/enrollment-forecast';
import type { AccrualPlan, StudyDesign } from '../study-design-types';
import { ENROLLMENT_SIMULATIONS, projectEnrollment } from '../enrollment-projection';

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

describe('projectEnrollment — the engine\'s numbers', () => {
  it('equals forecastCompletion and expectedTimeToEnroll called directly', () => {
    const p = projectEnrollment(design());
    const sites = plan().sites.map((s) => ({ id: s.id, meanRate: s.meanRate, rateCv: s.rateCv, activationTime: s.activationTime }));
    const f = forecastCompletion({ sites, targetN: 60, nSim: ENROLLMENT_SIMULATIONS, seed: 20260928 });
    expect(p.status).toBe('rendered');
    expect(p.forecast).toMatchObject({ median: f.medianTime, p10: f.p10, p90: f.p90, probReached: f.probReached, seed: 20260928, nSim: 4000, targetN: 60, timeUnit: 'month' });
    expect(p.forecast!.closedFormExpectedTime).toBe(expectedTimeToEnroll(sites, 60));
    expect(p.forecast!.p10!).toBeLessThanOrEqual(p.forecast!.median!);
    expect(p.forecast!.median!).toBeLessThanOrEqual(p.forecast!.p90!);
  });

  it('summarises sites by country, sorted, without inventing a country', () => {
    const d = design();
    d.accrualPlan!.sites.push({ id: 'XX-01', meanRate: 0.5 });
    expect(projectEnrollment(d).sites).toEqual({
      total: 4,
      byCountry: [
        { country: 'DE', sites: 1, meanRatePerUnit: 0.8 },
        { country: 'US', sites: 2, meanRatePerUnit: 2.5 },
        { country: 'country not recorded', sites: 1, meanRatePerUnit: 0.5 },
      ],
    });
  });

  it('is a function of the design alone: no clock reading in the output, identical across calls', () => {
    const a = projectEnrollment(design());
    expect(a.forecast!.provenance).not.toHaveProperty('generatedAt');
    expect(JSON.stringify(a)).toBe(JSON.stringify(projectEnrollment(clone(design()))));
  });
});

describe('projectEnrollment — nothing assumed', () => {
  it('no accrual plan is missing, with no forecast and no site summary', () => {
    const d = design();
    delete d.accrualPlan;
    const p = projectEnrollment(d);
    expect(p).toMatchObject({ status: 'missing', forecast: null, sites: null });
    expect(p.gaps[0]).toMatch(/sponsor inputs from feasibility, and none is recorded/);
    d.accrualPlan = { timeUnit: 'month', sites: [] };
    expect(projectEnrollment(d).status).toBe('missing');
  });

  it('no planned sample size is missing — there is no target to forecast', () => {
    const d = design();
    delete d.statisticalPlan.plannedSampleSize;
    const p = projectEnrollment(d);
    expect(p.status).toBe('missing');
    expect(p.forecast).toBeNull();
    expect(p.gaps[0]).toMatch(/planned sample size is not recorded/);
  });

  it('sites with no capacity are "not reached": null times and a zero probability, never a large number', () => {
    const d = design();
    d.accrualPlan!.sites = [{ id: 'S1', country: 'US', meanRate: 0 }];
    const p = projectEnrollment(d);
    expect(p.status).toBe('partial');
    expect(p.forecast).toMatchObject({ probReached: 0, median: null, p10: null, p90: null, closedFormExpectedTime: null });
    expect(p.gaps).toContain('the recorded sites cannot reach the planned sample size: no simulation reached it');
  });

  it('invalid site rows are gaps with no forecast', () => {
    const d = design();
    d.accrualPlan!.sites = [
      { id: 'A', meanRate: -1 },
      { id: 'A', meanRate: 1, rateCv: -0.2 },
      { id: '', meanRate: 1, activationTime: -3 },
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

  it('an unrecorded rate source keeps the forecast but marks it partial', () => {
    const d = design();
    delete d.accrualPlan!.rateSource;
    const p = projectEnrollment(d);
    expect(p.status).toBe('partial');
    expect(p.forecast).not.toBeNull();
    expect(p.gaps).toEqual(['the source of the site recruitment rates is not recorded']);
  });
});
