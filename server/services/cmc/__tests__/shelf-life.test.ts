import { describe, it, expect } from 'vitest';
import { estimateShelfLife } from '../shelf-life.js';

describe('estimateShelfLife (ICH Q1E)', () => {
  // Potency declining ~0.5%/month from ~101%, lower spec 95%.
  const decay = [
    { time: 0, value: 101.0 },
    { time: 3, value: 100.2 },
    { time: 6, value: 99.0 },
    { time: 9, value: 98.1 },
    { time: 12, value: 97.0 },
    { time: 18, value: 95.6 },
  ];

  it('estimates a shelf life within the data range for a declining attribute', () => {
    const r = estimateShelfLife({ data: decay, specLimit: 95, direction: 'decreasing' });
    expect(r.regression.slope).toBeLessThan(0);
    expect(r.regression.r2).toBeGreaterThan(0.95);
    // The 95% lower CL crosses 95% somewhere in/just beyond the observed range.
    expect(r.shelfLife).toBeGreaterThan(12);
    expect(r.shelfLife).toBeLessThanOrEqual(24);
    expect(r.confidence.bound).toBe('lower');
  });

  it('uses the upper confidence limit for an increasing impurity', () => {
    const impurity = [
      { time: 0, value: 0.1 },
      { time: 6, value: 0.2 },
      { time: 12, value: 0.3 },
      { time: 18, value: 0.45 },
      { time: 24, value: 0.6 },
    ];
    const r = estimateShelfLife({ data: impurity, specLimit: 1.0, direction: 'increasing' });
    expect(r.regression.slope).toBeGreaterThan(0);
    expect(r.confidence.bound).toBe('upper');
    expect(r.shelfLife).toBeGreaterThan(0);
  });

  it('reports exceedsEvaluatedRange when the CL never crosses spec in range', () => {
    const flat = [
      { time: 0, value: 100 },
      { time: 6, value: 100.1 },
      { time: 12, value: 99.9 },
      { time: 24, value: 100 },
    ];
    const r = estimateShelfLife({ data: flat, specLimit: 90, direction: 'decreasing', maxTime: 36 });
    expect(r.exceedsEvaluatedRange).toBe(true);
    expect(r.shelfLife).toBe(36);
  });

  it('returns 0 shelf life when already failing at t=0', () => {
    const r = estimateShelfLife({ data: [
      { time: 0, value: 95.2 }, { time: 6, value: 94 }, { time: 12, value: 93 },
    ], specLimit: 95, direction: 'decreasing' });
    expect(r.shelfLife).toBe(0);
  });

  it('validates inputs', () => {
    expect(() => estimateShelfLife({ data: [{ time: 0, value: 1 }], specLimit: 0, direction: 'decreasing' })).toThrow(/at least 3/);
    expect(() => estimateShelfLife({ data: [{ time: 1, value: 1 }, { time: 1, value: 2 }, { time: 1, value: 3 }], specLimit: 0, direction: 'decreasing' })).toThrow(/distinct times|vary/);
    expect(() => estimateShelfLife({ data: decay, specLimit: 95, direction: 'sideways' as any })).toThrow(/direction/);
  });

  it('is deterministic', () => {
    const a = estimateShelfLife({ data: decay, specLimit: 95, direction: 'decreasing' });
    const b = estimateShelfLife({ data: decay, specLimit: 95, direction: 'decreasing' });
    expect(a).toEqual(b);
  });
});


/* ─────────────────────────────────────────────────────────────────────────────
 * The ICH Q1E extrapolation limit.
 *
 * Q1E §2.5 and Appendix A: where long-term data show little change and little
 * variability, a retest period or shelf life up to TWICE, but not more than
 * TWELVE MONTHS BEYOND, the period covered by long-term data may be proposed.
 * The regression crossing is a statistical result; what may be PROPOSED is
 * min(2 x observed, observed + 12). The engine reported the crossing alone —
 * a 6-month study returned 21.94 months with exceedsEvaluatedRange false, i.e.
 * presented as a settled number with no caveat at all.
 * ────────────────────────────────────────────────────────────────────────── */
describe('estimateShelfLife — the Q1E extrapolation limit', () => {
  const sixMonth = [
    { time: 0, value: 100.2 },
    { time: 3, value: 99.6 },
    { time: 6, value: 99.1 },
  ];

  it('never proposes a shelf life beyond what Q1E allows from the observed period', () => {
    const r = estimateShelfLife({ data: sixMonth, specLimit: 95, direction: 'decreasing' });
    expect(r.observedPeriod).toBe(6);
    expect(r.extrapolationLimit).toBe(12);          // min(2*6, 6+12)
    expect(r.statisticalCrossing).toBeGreaterThan(12);
    expect(r.shelfLife).toBe(12);                   // what may be PROPOSED
    expect(r.cappedByExtrapolationLimit).toBe(true);
    expect(r.notes.join(' ')).toContain('twice');
  });

  it('applies the 12-month ceiling once the study is longer than twelve months', () => {
    /* At 24 months observed, 2x is 48 but Q1E allows only 24+12 = 36. */
    const long = [
      { time: 0, value: 101.0 },
      { time: 6, value: 100.6 },
      { time: 12, value: 100.2 },
      { time: 18, value: 99.9 },
      { time: 24, value: 99.5 },
    ];
    const r = estimateShelfLife({ data: long, specLimit: 90, direction: 'decreasing' });
    expect(r.observedPeriod).toBe(24);
    expect(r.extrapolationLimit).toBe(36);
    expect(r.shelfLife).toBe(36);
    expect(r.cappedByExtrapolationLimit).toBe(true);
  });

  it('reports the crossing itself when it falls inside the allowance', () => {
    /* 18 months observed allows up to 30; the CL crosses well before that. */
    const decayFast = [
      { time: 0, value: 101.0 },
      { time: 3, value: 100.2 },
      { time: 6, value: 99.0 },
      { time: 9, value: 98.1 },
      { time: 12, value: 97.0 },
      { time: 18, value: 95.6 },
    ];
    const r = estimateShelfLife({ data: decayFast, specLimit: 95, direction: 'decreasing' });
    expect(r.extrapolationLimit).toBe(30);
    expect(r.cappedByExtrapolationLimit).toBe(false);
    expect(r.shelfLife).toBe(r.statisticalCrossing);
  });

  it('caps the exceeds-range case too, rather than reporting the search horizon', () => {
    /* A flat attribute never crosses; the old code returned maxTime (120). */
    const flat = [
      { time: 0, value: 99.9 },
      { time: 3, value: 100.0 },
      { time: 6, value: 99.95 },
      { time: 9, value: 100.05 },
    ];
    const r = estimateShelfLife({ data: flat, specLimit: 90, direction: 'decreasing' });
    expect(r.exceedsEvaluatedRange).toBe(true);
    expect(r.observedPeriod).toBe(9);
    expect(r.shelfLife).toBe(18);                   // min(2*9, 9+12)
    expect(r.cappedByExtrapolationLimit).toBe(true);
  });

  it('a shelf life of zero is not raised by the allowance', () => {
    /* Already out of spec at t=0 — the cap is a ceiling, never a floor. */
    const bad = [
      { time: 0, value: 94.0 },
      { time: 3, value: 93.0 },
      { time: 6, value: 92.0 },
    ];
    const r = estimateShelfLife({ data: bad, specLimit: 95, direction: 'decreasing' });
    expect(r.shelfLife).toBe(0);
    expect(r.cappedByExtrapolationLimit).toBe(false);
  });
});
