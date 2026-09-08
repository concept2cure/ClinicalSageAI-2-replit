/**
 * Out-of-trend (OOT) assessment over a stability series — the PhRMA CMC
 * Statistics and Stability Expert Teams' regression-control-chart method:
 * each successive result is compared to the prediction interval of the line
 * fitted to the results BEFORE it. A point outside that interval is out of
 * trend, whether or not it is out of specification.
 *
 * Every expectation below is either hand-computed or a property the method
 * must have (a clean line raises nothing; an excursion is named; too little
 * data or no criterion is refused, never guessed at).
 */
import { describe, it, expect } from 'vitest';
import { assessTrend } from '../stability-trending';
import type { ParsedAcceptanceCriterion } from '../recorded-stability';

const nlt95: ParsedAcceptanceCriterion = { limit: 95, direction: 'decreasing', upperLimit: null, twoSided: false };
const nmt2: ParsedAcceptanceCriterion = { limit: 2.0, direction: 'increasing', upperLimit: null, twoSided: false };
const range95to105: ParsedAcceptanceCriterion = { limit: 95, direction: 'decreasing', upperLimit: 105, twoSided: true };

/* An assay losing 0.2 %/month with small, deterministic scatter. */
const times = [0, 3, 6, 9, 12, 18, 24];
const noise = [0.05, -0.04, 0.02, -0.03, 0.04, -0.02, 0.03];
const clean = times.map((t, i) => ({ time: t, value: 100 - 0.2 * t + noise[i] }));

describe('assessTrend — PhRMA regression control chart', () => {
  it('raises no out-of-trend point on a clean linear series, and establishes the slope', () => {
    const r = assessTrend(clean, nlt95);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outOfTrend).toEqual([]);
    expect(r.pointsUsed).toBe(7);
    expect(r.evaluated).toBe(3); // 12, 18 and 24 months each have ≥ 4 prior points
    expect(r.slope.estimate).toBeCloseTo(-0.2, 2);
    expect(r.slope.ci[0]).toBeLessThan(r.slope.estimate);
    expect(r.slope.ci[1]).toBeGreaterThan(r.slope.estimate);
    expect(r.slope.ci[1]).toBeLessThan(0);
    expect(r.slope.significant).toBe(true);
  });

  it('projects the time the fitted trend meets the limit it is heading toward', () => {
    const r = assessTrend(clean, nlt95);
    if (!r.ok) throw new Error(r.reason);
    expect(r.projection).not.toBeNull();
    expect(r.projection!.bound).toBe('lower');
    expect(r.projection!.limit).toBe(95);
    // (95 − intercept) / slope with intercept ≈ 100.03, slope ≈ −0.2 → ≈ 25 months
    expect(r.projection!.time).toBeGreaterThan(24);
    expect(r.projection!.time).toBeLessThan(27);
  });

  it('names the injected excursion, and only it', () => {
    const excursion = clean.map(p => (p.time === 18 ? { ...p, value: p.value - 1.0 } : p));
    const r = assessTrend(excursion, nlt95);
    if (!r.ok) throw new Error(r.reason);
    expect(r.outOfTrend.map(p => p.time)).toEqual([18]);
    const oot = r.outOfTrend[0];
    expect(oot.priorPoints).toBe(5);
    expect(oot.value).toBeLessThan(oot.interval.lower);
    expect(oot.predicted).toBeGreaterThan(oot.interval.lower);
    expect(oot.predicted).toBeLessThan(oot.interval.upper);
  });

  it('computes the prediction interval as the textbook formula does', () => {
    /* Prior: x 0..3, y 1,2,2,4 → slope 0.9, intercept 0.9, s = √0.35.
       At x = 4: ŷ = 4.5, se = s·√(1 + 1/4 + 2.5²/5) = 0.9354,
       t(0.975, 2) = 4.303 → PI = 4.5 ± 4.025 = [0.475, 8.525]. */
    const prior = [
      { time: 0, value: 1 },
      { time: 1, value: 2 },
      { time: 2, value: 2 },
      { time: 3, value: 4 },
    ];
    const inside = assessTrend([...prior, { time: 4, value: 8 }], nmt2);
    const outside = assessTrend([...prior, { time: 4, value: 9 }], nmt2);
    if (!inside.ok || !outside.ok) throw new Error('refused');
    expect(inside.outOfTrend).toEqual([]);
    expect(outside.outOfTrend).toHaveLength(1);
    expect(outside.outOfTrend[0].predicted).toBeCloseTo(4.5, 6);
    expect(outside.outOfTrend[0].interval.lower).toBeCloseTo(0.475, 2);
    expect(outside.outOfTrend[0].interval.upper).toBeCloseTo(8.525, 2);
  });

  it('does not flag a point that sits exactly on a perfectly linear prior (floating point is not an excursion)', () => {
    const exact = [0, 3, 6, 9, 12, 18].map(t => ({ time: t, value: 100 - 0.1 * t }));
    const r = assessTrend(exact, nlt95);
    if (!r.ok) throw new Error(r.reason);
    expect(r.outOfTrend).toEqual([]);
  });

  it('refuses a series with fewer than 4 prior points to fit, with the reason', () => {
    const four = clean.slice(0, 4);
    const r = assessTrend(four, nlt95);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('INSUFFICIENT_POINTS');
    expect(r.detail).toMatch(/4 prior/);
    expect(r.pointsUsable).toBe(4);
    // Exactly five is the minimum: four to fit, one to judge.
    const five = assessTrend(clean.slice(0, 5), nlt95);
    expect(five.ok).toBe(true);
    if (five.ok) expect(five.evaluated).toBe(1);
  });

  it('refuses without an acceptance criterion rather than assessing against nothing', () => {
    const r = assessTrend(clean, null);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('CRITERION_NOT_RECORDED');
  });

  it('refuses when the time points do not vary', () => {
    const r = assessTrend(times.map(() => ({ time: 6, value: 99 })), nlt95);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('TIME_POINTS_DO_NOT_VARY');
  });

  it('projects nothing when the slope has the safe sign for the recorded limit', () => {
    // An impurity limited above (≤ 2.0 %) that is FALLING never reaches its limit.
    const falling = times.map((t, i) => ({ time: t, value: 1.5 - 0.02 * t + noise[i] / 10 }));
    const r = assessTrend(falling, nmt2);
    if (!r.ok) throw new Error(r.reason);
    expect(r.slope.estimate).toBeLessThan(0);
    expect(r.projection).toBeNull();
    // And an assay limited below (≥ 95 %) that is RISING never reaches its limit.
    const rising = times.map((t, i) => ({ time: t, value: 98 + 0.1 * t + noise[i] }));
    const up = assessTrend(rising, nlt95);
    if (!up.ok) throw new Error(up.reason);
    expect(up.projection).toBeNull();
  });

  it('on a two-sided range, projects toward whichever bound the trend is heading for', () => {
    const rising = times.map((t, i) => ({ time: t, value: 100 + 0.2 * t + noise[i] }));
    const r = assessTrend(rising, range95to105);
    if (!r.ok) throw new Error(r.reason);
    expect(r.projection).not.toBeNull();
    expect(r.projection!.bound).toBe('upper');
    expect(r.projection!.limit).toBe(105);
    expect(r.projection!.time).toBeCloseTo(25, 0);
  });

  it('reports a non-significant slope as such rather than projecting from it', () => {
    const flat = times.map((t, i) => ({ time: t, value: 99.5 + noise[i] * 4 }));
    const r = assessTrend(flat, nlt95);
    if (!r.ok) throw new Error(r.reason);
    expect(r.slope.ci[0]).toBeLessThan(0);
    expect(r.slope.ci[1]).toBeGreaterThan(0);
    expect(r.slope.significant).toBe(false);
  });

  it('ignores non-finite values and refuses an alpha outside (0, 0.5)', () => {
    const withGap = [...clean, { time: 30, value: Number.NaN }];
    const r = assessTrend(withGap, nlt95);
    if (!r.ok) throw new Error(r.reason);
    expect(r.pointsUsed).toBe(7);
    expect(() => assessTrend(clean, nlt95, { alpha: 0.6 })).toThrow(/alpha/);
  });
});
