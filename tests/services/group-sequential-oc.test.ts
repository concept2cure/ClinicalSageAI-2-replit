/**
 * Tests for the exact group-sequential operating-characteristics engine
 * (server/services/stats/group-sequential-oc.ts).
 *
 * Covers the GA acceptance bars for workstream #5:
 *  - reproducibility: deterministic (no RNG); identical output for identical input
 *  - correctness: matches the closed-form fixed-design result at a single look;
 *    solved alpha-spending boundaries control type I error at exactly alpha
 *    (accounting for between-look correlation); internal consistency of the
 *    stopping distribution
 *  - honesty: probabilities are genuine (sum to one; bounded), assurance equals
 *    power at a point-mass prior
 */

import { describe, it, expect } from 'vitest';
import {
  alphaSpent,
  solveSpendingBoundaries,
  computeOperatingCharacteristic,
  operatingCharacteristics,
  assurance,
  discretizeNormalPrior,
  driftForTwoSampleMeans,
  expectedSampleSize,
  type GroupSequentialBoundaries,
} from '../../server/services/stats/group-sequential-oc';
import { normalCdf, normalQuantile } from '../../server/services/stats/normal';

const ALPHA = 0.025; // one-sided

describe('group-sequential OC — closed-form fixed design (single look)', () => {
  const z = normalQuantile(1 - ALPHA); // ≈ 1.959964
  const fixed: GroupSequentialBoundaries = {
    informationFractions: [1],
    efficacyBoundaries: [z],
  };

  it('type I error equals alpha at drift 0', () => {
    const oc = computeOperatingCharacteristic(fixed, 0);
    expect(oc.rejectProbability).toBeCloseTo(ALPHA, 3);
  });

  it('power equals 1 - Phi(z - drift) for a range of drifts', () => {
    for (const drift of [0.5, 1, 1.96, 2.5, 3.24]) {
      const oc = computeOperatingCharacteristic(fixed, drift);
      const closedForm = 1 - normalCdf(z - drift);
      expect(oc.rejectProbability).toBeCloseTo(closedForm, 3);
    }
  });

  it('the design drift z_{1-alpha} + z_{power} yields the target power', () => {
    // drift = z_{1-alpha} + z_{1-beta} ⇒ power = 1 - beta. Classic fixed-design.
    const targetPower = 0.9;
    const drift = z + normalQuantile(targetPower);
    const oc = computeOperatingCharacteristic(fixed, drift);
    expect(oc.rejectProbability).toBeCloseTo(targetPower, 3);
  });
});

describe('group-sequential OC — exact spending-boundary solve', () => {
  const fractions = [0.33, 0.67, 1.0];

  for (const fn of ['obrien-fleming', 'pocock', 'linear'] as const) {
    it(`${fn}: solved boundaries control type I at exactly alpha`, () => {
      const b = solveSpendingBoundaries(fractions, ALPHA, fn);
      const oc = computeOperatingCharacteristic(b, 0);
      // Exact recursion on the same grid ⇒ type I matches alpha tightly.
      expect(oc.rejectProbability).toBeCloseTo(ALPHA, 3);
    });

    it(`${fn}: cumulative rejection under null tracks the spending function`, () => {
      const b = solveSpendingBoundaries(fractions, ALPHA, fn);
      const oc = computeOperatingCharacteristic(b, 0);
      oc.perLook.forEach((look, k) => {
        expect(look.cumulativeRejectProbability).toBeCloseTo(b.cumulativeAlpha[k], 3);
      });
    });
  }

  it('single-look spending boundary equals the fixed-design critical value', () => {
    const b = solveSpendingBoundaries([1], ALPHA, 'pocock');
    expect(b.efficacyBoundaries[0]).toBeCloseTo(normalQuantile(1 - ALPHA), 3);
  });

  it('O\'Brien-Fleming is more conservative at the first look than Pocock', () => {
    const obf = solveSpendingBoundaries(fractions, ALPHA, 'obrien-fleming');
    const poc = solveSpendingBoundaries(fractions, ALPHA, 'pocock');
    expect(obf.efficacyBoundaries[0]).toBeGreaterThan(poc.efficacyBoundaries[0]);
    // ...and less conservative at the final look (spends more there).
    expect(obf.efficacyBoundaries[2]).toBeLessThan(poc.efficacyBoundaries[2]);
  });

  it('alphaSpent reaches exactly alpha at t = 1 for each function', () => {
    for (const fn of ['obrien-fleming', 'pocock', 'linear'] as const) {
      expect(alphaSpent(1, ALPHA, fn)).toBeCloseTo(ALPHA, 10);
      expect(alphaSpent(0, ALPHA, fn)).toBe(0);
    }
  });
});

describe('group-sequential OC — internal consistency', () => {
  const b = solveSpendingBoundaries([0.5, 1.0], ALPHA, 'obrien-fleming');

  it('per-look stop probabilities sum to one', () => {
    for (const drift of [0, 1, 2.5]) {
      const oc = computeOperatingCharacteristic(b, drift);
      const total = oc.perLook.reduce((acc, l) => acc + l.stopProbability, 0);
      expect(total).toBeCloseTo(1, 3);
    }
  });

  it('reject + non-reject probabilities sum to one', () => {
    const oc = computeOperatingCharacteristic(b, 2.0);
    expect(oc.rejectProbability + oc.futilityStopProbability).toBeCloseTo(1, 3);
  });

  it('expected information fraction is within (0, 1] and below 1 under a strong effect', () => {
    const strong = computeOperatingCharacteristic(b, 3.5);
    expect(strong.expectedInformationFraction).toBeGreaterThan(0);
    expect(strong.expectedInformationFraction).toBeLessThan(1); // early stopping saves N
  });

  it('power increases monotonically with drift', () => {
    const drifts = [0, 0.5, 1, 1.5, 2, 2.5, 3];
    const powers = drifts.map(d => computeOperatingCharacteristic(b, d).rejectProbability);
    for (let i = 1; i < powers.length; i++) {
      expect(powers[i]).toBeGreaterThan(powers[i - 1]);
    }
  });

  it('with binding futility, expected information shrinks under the null', () => {
    const withFutility: GroupSequentialBoundaries = {
      informationFractions: b.informationFractions,
      efficacyBoundaries: b.efficacyBoundaries,
      futilityBoundaries: [0, null], // stop for futility at look 1 if Z < 0
    };
    const noFut = computeOperatingCharacteristic(b, 0);
    const fut = computeOperatingCharacteristic(withFutility, 0);
    // Under the null, a futility boundary causes frequent early stopping.
    expect(fut.expectedInformationFraction).toBeLessThan(noFut.expectedInformationFraction);
    expect(fut.futilityStopProbability).toBeGreaterThan(noFut.futilityStopProbability);
  });
});

describe('group-sequential OC — reproducibility and provenance', () => {
  const b = solveSpendingBoundaries([0.5, 1.0], ALPHA, 'pocock');

  it('is deterministic: identical input ⇒ identical output', () => {
    const a = operatingCharacteristics(b, [0, 1, 2]);
    const c = operatingCharacteristics(b, [0, 1, 2]);
    expect(a.characteristics).toEqual(c.characteristics);
    expect(a.typeIError).toBe(c.typeIError);
  });

  it('attaches a reproducible provenance record with a stable inputs hash', () => {
    const a = operatingCharacteristics(b, [0, 1, 2]);
    const c = operatingCharacteristics(b, [0, 1, 2]);
    expect(a.provenance.reproducible).toBe(true);
    expect(a.provenance.method).toBe('group-sequential-oc:operatingCharacteristics');
    expect(a.provenance.inputsSha256).toEqual(c.provenance.inputsSha256);
  });

  it('the OC table reports type I error at drift 0', () => {
    const table = operatingCharacteristics(b, [0, 1, 2, 3]);
    expect(table.typeIError).toBeCloseTo(ALPHA, 3);
    expect(table.characteristics).toHaveLength(4);
  });
});

describe('group-sequential OC — assurance over a prior', () => {
  const b = solveSpendingBoundaries([0.5, 1.0], ALPHA, 'obrien-fleming');

  it('a point-mass prior gives the same assurance as the power at that drift', () => {
    const drift = 2.2;
    const point = assurance(b, [{ drift, weight: 1 }]);
    const power = computeOperatingCharacteristic(b, drift).rejectProbability;
    expect(point.assurance).toBeCloseTo(power, 6);
  });

  it('assurance lies between the min and max power over the prior support', () => {
    const prior = discretizeNormalPrior(2.0, 0.6, 11);
    const a = assurance(b, prior, { step: 0.04 });
    const powers = prior.map(n => computeOperatingCharacteristic(b, n.drift, { step: 0.04 }).rejectProbability);
    expect(a.assurance).toBeGreaterThan(Math.min(...powers) - 1e-9);
    expect(a.assurance).toBeLessThan(Math.max(...powers) + 1e-9);
  });

  it('discretizeNormalPrior produces normalized weights', () => {
    const prior = discretizeNormalPrior(1.5, 0.5, 25);
    const sum = prior.reduce((acc, n) => acc + n.weight, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(prior).toHaveLength(25);
  });

  it('assurance is deterministic and carries provenance', () => {
    const prior = discretizeNormalPrior(2.0, 0.5, 9);
    const a = assurance(b, prior);
    const c = assurance(b, prior);
    expect(a.assurance).toBe(c.assurance);
    expect(a.provenance.method).toBe('group-sequential-oc:assurance');
    expect(a.provenance.inputsSha256).toEqual(c.provenance.inputsSha256);
  });
});

describe('group-sequential OC — design ⇄ drift mapping', () => {
  it('driftForTwoSampleMeans matches delta * sqrt(n/2)', () => {
    expect(driftForTwoSampleMeans(0.5, 64)).toBeCloseTo(0.5 * Math.sqrt(32), 10);
  });

  it('expectedSampleSize scales the information fraction by max N', () => {
    expect(expectedSampleSize(0.75, 400)).toBe(300);
  });

  it('a two-sample design powered at the fixed n reproduces ~90% power at a single look', () => {
    // n per arm for delta=0.5, 90% power, one-sided 0.025: drift = z_a + z_b.
    const z = normalQuantile(1 - ALPHA);
    const drift = z + normalQuantile(0.9);
    const nPerArm = 2 * Math.pow(drift / 0.5, 2); // invert driftForTwoSampleMeans
    const recoveredDrift = driftForTwoSampleMeans(0.5, nPerArm);
    const oc = computeOperatingCharacteristic(
      { informationFractions: [1], efficacyBoundaries: [z] },
      recoveredDrift,
    );
    expect(oc.rejectProbability).toBeCloseTo(0.9, 3);
  });
});
