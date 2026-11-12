/**
 * The Q1E fit, drawn: the engine returns the line and the confidence bound it
 * computed, so a chart draws them and computes nothing (P-122, RULE 2).
 *
 * The Stability register had no chart (P-122 inventory, B1): no plot, no
 * regression line, no confidence band. The fit existed — `estimateShelfLife`
 * computes the mean line and the one-sided 95% bound and solves where the bound
 * meets the specification — but it returned only the slope, intercept and
 * residual SD. A browser that wanted to draw the band would have had to
 * re-derive the t-quantile and the leverage term itself: the same statistics in
 * a second place, which is exactly what RULE 2 forbids.
 *
 * What must be true:
 *   • `band` runs from t = 0 past the reported shelf life and the observed
 *     period, in time order, sampling the observed times too;
 *   • each `fitted` is the regression line and each `bound` the one-sided
 *     confidence limit, on the side the direction says;
 *   • where the data decided the shelf life, the bound meets the specification
 *     there;
 *   • the recorded estimate carries the band and the observations it fitted.
 */
import { describe, it, expect } from 'vitest';
import { estimateShelfLife } from '../shelf-life.js';

const decay = [
  { time: 0, value: 101.0 },
  { time: 3, value: 100.2 },
  { time: 6, value: 99.0 },
  { time: 9, value: 98.1 },
  { time: 12, value: 97.0 },
  { time: 18, value: 95.6 },
];

describe('estimateShelfLife returns the line and bound it computed', () => {
  it('samples the fit from t = 0 past the shelf life and the observed period, in order', () => {
    const r = estimateShelfLife({ data: decay, specLimit: 95, direction: 'decreasing' });
    expect(Array.isArray(r.band)).toBe(true);
    const times = r.band.map((p) => p.time);
    expect(times[0]).toBe(0);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(times[times.length - 1]).toBeGreaterThanOrEqual(Math.max(r.shelfLife, r.observedPeriod));
    for (const t of decay.map((p) => p.time)) expect(times).toContain(t);
  });

  it('is the regression line and the one-sided lower bound for a decreasing attribute', () => {
    const r = estimateShelfLife({ data: decay, specLimit: 95, direction: 'decreasing' });
    for (const p of r.band) {
      expect(p.fitted).toBeCloseTo(r.regression.intercept + r.regression.slope * p.time, 2);
      expect(p.bound).toBeLessThan(p.fitted);
    }
    /* The bound widens away from the centre of the data (the leverage term). */
    const gap = (t: number) => { const p = r.band.find((b) => b.time === t)!; return p.fitted - p.bound; };
    expect(gap(0)).toBeGreaterThan(gap(9));
  });

  it('meets the specification where the data decided the shelf life', () => {
    const r = estimateShelfLife({ data: decay, specLimit: 95, direction: 'decreasing' });
    expect(r.cappedByExtrapolationLimit).toBe(false);
    const at = r.band.find((p) => p.time === r.shelfLife);
    expect(at, 'the band samples the shelf life itself').toBeDefined();
    expect(at!.bound).toBeCloseTo(95, 2);
  });

  it('is the upper bound for an increasing impurity', () => {
    const impurity = [{ time: 0, value: 0.1 }, { time: 6, value: 0.2 }, { time: 12, value: 0.3 }, { time: 18, value: 0.45 }, { time: 24, value: 0.6 }];
    const r = estimateShelfLife({ data: impurity, specLimit: 1.0, direction: 'increasing' });
    for (const p of r.band) expect(p.bound).toBeGreaterThan(p.fitted);
  });

  it('stops at a bounded horizon when the bound never crosses, not the 120-month search limit', () => {
    const flat = [{ time: 0, value: 100 }, { time: 3, value: 100.1 }, { time: 6, value: 99.9 }, { time: 9, value: 100 }];
    const r = estimateShelfLife({ data: flat, specLimit: 90, direction: 'decreasing' });
    expect(r.exceedsEvaluatedRange).toBe(true);
    expect(r.band[r.band.length - 1].time).toBeLessThanOrEqual(r.extrapolationLimit * 2);
  });
});
