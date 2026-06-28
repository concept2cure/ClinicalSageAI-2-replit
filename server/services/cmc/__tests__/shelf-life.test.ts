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
