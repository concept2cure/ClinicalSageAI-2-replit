/**
 * Tests for MRMC reader-study sizing (server/services/stats/mrmc.ts).
 *
 * Validates the OR variance-of-difference expression numerically, the wiring of
 * λ and power through the (separately reference-validated) noncentral F, the
 * expected monotonicities, the null (Δ=0 ⇒ power≈α), and the reader-count solver.
 */

import { describe, it, expect } from 'vitest';
import {
  mrmcPower,
  mrmcReadersForPower,
  varianceOfModalityDifference,
} from '../../server/services/stats/mrmc';
import { noncentralFPower } from '../../server/services/stats/f-distribution';

const base = {
  aucDifference: 0.05,
  nReaders: 6,
  varTR: 0.0005,
  varError: 0.001,
  cov1: 0.0003,
  cov2: 0.0002,
  cov3: 0.0001,
  alpha: 0.05,
};

describe('variance of the modality difference', () => {
  it('matches the hand-computed OR expression', () => {
    // Den = varTR + varError - cov1 + (J-1)(cov2-cov3)
    //     = 0.0005 + 0.001 - 0.0003 + 5·(0.0001) = 0.0017
    // Var = (2/6)·0.0017 = 0.000566667
    expect(varianceOfModalityDifference(base)).toBeCloseTo(0.000566667, 9);
  });

  it('shrinks as readers are added', () => {
    const few = varianceOfModalityDifference({ ...base, nReaders: 4 });
    const many = varianceOfModalityDifference({ ...base, nReaders: 12 });
    expect(many).toBeLessThan(few);
  });
});

describe('mrmcPower', () => {
  it('wires λ and power consistently through the noncentral F', () => {
    const r = mrmcPower(base);
    const expectedLambda = base.aucDifference ** 2 / varianceOfModalityDifference(base);
    expect(r.lambda).toBeCloseTo(expectedLambda, 9);
    expect(r.denominatorDf).toBe(base.nReaders - 1);
    expect(r.power).toBeCloseTo(noncentralFPower(1, base.nReaders - 1, expectedLambda, 0.05), 10);
  });

  it('power is ~alpha when there is no true difference', () => {
    expect(mrmcPower({ ...base, aucDifference: 0 }).power).toBeCloseTo(0.05, 6);
  });

  it('power increases with the effect size and with readers', () => {
    expect(mrmcPower({ ...base, aucDifference: 0.08 }).power)
      .toBeGreaterThan(mrmcPower({ ...base, aucDifference: 0.03 }).power);
    expect(mrmcPower({ ...base, nReaders: 15 }).power)
      .toBeGreaterThan(mrmcPower({ ...base, nReaders: 4 }).power);
  });

  it('power decreases as reader/case variability grows', () => {
    const high = mrmcPower({ ...base, varTR: 0.003 }).power;
    expect(high).toBeLessThan(mrmcPower(base).power);
  });

  it('rejects an invalid covariance ordering and too few readers', () => {
    expect(() => mrmcPower({ ...base, cov3: 0.5 })).toThrow(/cov1 ≥ cov2 ≥ cov3/);
    expect(() => mrmcPower({ ...base, nReaders: 1 })).toThrow(/≥ 2/);
  });

  it('is deterministic with stable provenance', () => {
    const a = mrmcPower(base);
    const b = mrmcPower(base);
    expect(a.power).toBe(b.power);
    expect(a.provenance.inputsSha256).toBe(b.provenance.inputsSha256);
    expect(a.provenance.method).toBe('mrmc:power');
  });
});

describe('mrmcReadersForPower', () => {
  it('finds the smallest reader count meeting the target power', () => {
    const target = 0.8;
    const r = mrmcReadersForPower({ ...base, targetPower: target });
    expect(r.nReaders).not.toBeNull();
    // The chosen J meets the target and J−1 does not (minimality).
    expect(mrmcPower({ ...base, nReaders: r.nReaders! }).power).toBeGreaterThanOrEqual(target);
    if (r.nReaders! > 2) {
      expect(mrmcPower({ ...base, nReaders: r.nReaders! - 1 }).power).toBeLessThan(target);
    }
  });

  it('returns null when the target is unreachable within the reader cap', () => {
    // Tiny effect, large variability ⇒ not reachable with few readers.
    const r = mrmcReadersForPower({
      ...base, aucDifference: 0.001, varError: 0.05, cov1: 0.01, cov2: 0.005, cov3: 0.001,
      targetPower: 0.9, maxReaders: 8,
    });
    expect(r.nReaders).toBeNull();
  });
});
