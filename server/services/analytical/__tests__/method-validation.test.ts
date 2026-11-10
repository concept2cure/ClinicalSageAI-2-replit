import { describe, it, expect } from 'vitest';
import { assessMethodValidation } from '../method-validation.js';

describe('assessMethodValidation', () => {
  it('computes a perfect linear fit (R²=1) and passes', () => {
    const r = assessMethodValidation({
      linearity: [
        { nominal: 0, response: 0 },
        { nominal: 50, response: 100 },
        { nominal: 100, response: 200 },
      ],
    });
    expect(r.linearity!.slope).toBe(2);
    expect(r.linearity!.intercept).toBe(0);
    expect(r.linearity!.r2).toBe(1);
    expect(r.linearity!.pass).toBe(true);
    expect(r.overallPass).toBe(true);
  });

  it('computes precision %RSD and judges against the threshold', () => {
    const r = assessMethodValidation({ precision: [100, 101, 99, 100, 100], acceptance: { rsdMax: 2 } });
    expect(r.precision!.n).toBe(5);
    expect(r.precision!.rsdPercent).toBeLessThan(1);
    expect(r.precision!.pass).toBe(true);
  });

  it('fails precision when RSD exceeds the threshold', () => {
    const r = assessMethodValidation({ precision: [100, 130, 70, 110, 90], acceptance: { rsdMax: 2 } });
    expect(r.precision!.pass).toBe(false);
    expect(r.overallPass).toBe(false);
  });

  it('evaluates accuracy recovery per level against bounds', () => {
    const r = assessMethodValidation({ accuracy: { LOW: 99, MID: 100.5, HIGH: 103 }, acceptance: { accuracyLow: 98, accuracyHigh: 102 } });
    const high = r.accuracy!.levels.find((l) => l.level === 'HIGH')!;
    expect(high.pass).toBe(false); // 103 > 102
    expect(r.accuracy!.pass).toBe(false);
  });

  it('overallPass requires every assessed characteristic to pass', () => {
    const r = assessMethodValidation({
      linearity: [{ nominal: 0, response: 1 }, { nominal: 10, response: 21 }, { nominal: 20, response: 39 }],
      precision: [100, 100.5, 99.5],
      accuracy: { MID: 100 },
    });
    expect(r.assessed).toEqual(['linearity', 'precision', 'accuracy']);
    expect(typeof r.overallPass).toBe('boolean');
  });

  it('validates inputs', () => {
    expect(() => assessMethodValidation({})).toThrow(/at least one/i);
    expect(() => assessMethodValidation({ linearity: [{ nominal: 0, response: 0 }] })).toThrow(/at least 3/);
    expect(() => assessMethodValidation({ precision: [1] })).toThrow(/at least 2/);
    expect(() => assessMethodValidation({ accuracy: {} })).toThrow(/LOW\/MID\/HIGH/);
    expect(() => assessMethodValidation({ precision: [1, 2], acceptance: { r2Min: 2 } })).toThrow(/r2Min/);
  });

  it('is deterministic', () => {
    const input = { precision: [10, 11, 9] };
    expect(assessMethodValidation(input)).toEqual(assessMethodValidation(input));
  });
});

describe('precision preserves the meaning of percent RSD', () => {
  it.each([
    [-1, 1], [0, 0], [3, -1, -2], [-0, -0], [Number.MIN_VALUE, 0],
  ])('refuses zero or unrepresentable mean for %j', (...precision) => {
    expect(() => assessMethodValidation({ precision }))
      .toThrow(/precision.*mean.*non-zero.*RSD/i);
  });

  it.each([
    [Number.MAX_VALUE, Number.MAX_VALUE], [1e307, 1e307],
    [1e200, 2e200], [1e-200, 2e-200], [1, -1, Number.MIN_VALUE * 3],
  ])('refuses unrepresentable precision arithmetic for %j', (...precision) => {
    expect(() => assessMethodValidation({ precision })).toThrow(/precision.*must be/i);
  });

  it('does not let passing linearity, accuracy or a permissive criterion hide undefined precision', () => {
    expect(() => assessMethodValidation({
      linearity: [{ nominal: 0, response: 0 }, { nominal: 1, response: 2 }, { nominal: 2, response: 4 }],
      accuracy: { LOW: 99, MID: 100, HIGH: 101 }, precision: [-1, 1], acceptance: { rsdMax: 100 },
    })).toThrow(/precision.*mean.*non-zero.*RSD/i);
  });

  it('retains zero spread for identical nonzero replicates', () => {
    const r = assessMethodValidation({ precision: [4, 4, 4], acceptance: { rsdMax: 0 } });
    expect(r.precision).toEqual({ n: 3, mean: 4, sd: 0, rsdPercent: 0, pass: true });
    expect(r.overallPass).toBe(true);
  });

  it('uses the absolute negative mean', () => {
    const r = assessMethodValidation({ precision: [-100, -101, -99] });
    expect(r.precision).toEqual({ n: 3, mean: -100, sd: 1, rsdPercent: 1, pass: true });
    expect(r.overallPass).toBe(true);
  });

  it('preserves valid small finite measurements', () => {
    const r = assessMethodValidation({ precision: [.0001, .000101, .000099] });
    expect(r.precision).toMatchObject({ rsdPercent: 1, pass: true });
  });

  it('judges the unrounded mean even when its displayed value rounds to zero', () => {
    const r = assessMethodValidation({ precision: [1e-8, 2e-8] });
    expect(r.precision).toMatchObject({ mean: 0, rsdPercent: 47.1405, pass: false });
    expect(r.overallPass).toBe(false);
  });
});
