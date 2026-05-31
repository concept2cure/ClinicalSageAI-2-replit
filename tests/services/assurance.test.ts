/**
 * Tests for Bayesian assurance (server/services/stats/assurance.ts).
 *
 * GA acceptance bars for this workstream:
 *  - correctness: power matches the closed-form normal design; assurance over a
 *    point-mass prior equals power; assurance falls below the naive design power
 *    for a high-powered design under a diffuse prior (the assurance insight).
 *  - "assurance matches simulation": quadrature assurance agrees with a seeded
 *    Monte Carlo estimate.
 *  - reproducibility: deterministic quadrature; seeded, reproducible MC.
 */

import { describe, it, expect } from 'vitest';
import {
  powerTwoSampleMeans,
  assurance,
  assuranceTwoSampleMeans,
  assuranceMonteCarloTwoSampleMeans,
  discretizeNormalPrior,
} from '../../server/services/stats/assurance';
import { normalQuantile } from '../../server/services/stats/normal';

const ALPHA = 0.025; // one-sided

describe('powerTwoSampleMeans — closed form', () => {
  it('hits the target power when n is set from the design formula', () => {
    // n per arm = 2 ((z_{1-α} + z_{1-β}) / δ)². Then power should equal 1-β.
    const delta = 0.5;
    const targetPower = 0.9;
    const z = normalQuantile(1 - ALPHA) + normalQuantile(targetPower);
    const nPerArm = 2 * Math.pow(z / delta, 2);
    expect(powerTwoSampleMeans(delta, nPerArm, ALPHA)).toBeCloseTo(targetPower, 4);
  });

  it('equals alpha when the effect is zero', () => {
    expect(powerTwoSampleMeans(0, 200, ALPHA)).toBeCloseTo(ALPHA, 6);
  });

  it('increases with the effect size', () => {
    const a = powerTwoSampleMeans(0.3, 100, ALPHA);
    const b = powerTwoSampleMeans(0.5, 100, ALPHA);
    expect(b).toBeGreaterThan(a);
  });
});

describe('assurance — averaging', () => {
  it('a point-mass prior gives assurance equal to the power at that point', () => {
    const nPerArm = 100;
    const delta = 0.4;
    const point = assuranceTwoSampleMeans({ priorMean: delta, priorSd: 0, nPerArm, alpha: ALPHA });
    expect(point.assurance).toBeCloseTo(powerTwoSampleMeans(delta, nPerArm, ALPHA), 6);
  });

  it('assurance equals the generic weighted average of the power function', () => {
    const prior = discretizeNormalPrior(0.4, 0.1, 21);
    const direct = assurance(d => powerTwoSampleMeans(d, 100, ALPHA), prior);
    const viaApi = assuranceTwoSampleMeans({ priorMean: 0.4, priorSd: 0.1, nPerArm: 100, alpha: ALPHA, nNodes: 21 });
    expect(viaApi.assurance).toBeCloseTo(direct, 12);
  });

  it('for a high-powered design, a diffuse prior pulls assurance below the design power', () => {
    // Design powered ~90% at the prior mean; uncertainty about the effect
    // reduces the unconditional probability of success.
    const delta = 0.5;
    const z = normalQuantile(1 - ALPHA) + normalQuantile(0.9);
    const nPerArm = 2 * Math.pow(z / delta, 2);
    const r = assuranceTwoSampleMeans({ priorMean: delta, priorSd: 0.2, nPerArm, alpha: ALPHA });
    expect(r.powerAtPriorMean).toBeCloseTo(0.9, 2);
    expect(r.assurance).toBeLessThan(r.powerAtPriorMean);
  });

  it('assurance increases with the prior mean effect', () => {
    const base = { priorSd: 0.15, nPerArm: 100, alpha: ALPHA };
    const lo = assuranceTwoSampleMeans({ ...base, priorMean: 0.2 }).assurance;
    const hi = assuranceTwoSampleMeans({ ...base, priorMean: 0.5 }).assurance;
    expect(hi).toBeGreaterThan(lo);
  });

  it('discretizeNormalPrior produces normalized weights', () => {
    const prior = discretizeNormalPrior(0.3, 0.1, 33);
    expect(prior.reduce((a, n) => a + n.weight, 0)).toBeCloseTo(1, 12);
    expect(prior).toHaveLength(33);
  });
});

describe('assurance — matches simulation (GA bar)', () => {
  it('quadrature assurance agrees with seeded Monte Carlo', () => {
    const args = { priorMean: 0.45, priorSd: 0.18, nPerArm: 90, alpha: ALPHA };
    const quad = assuranceTwoSampleMeans(args);
    const mc = assuranceMonteCarloTwoSampleMeans({ ...args, nSim: 300_000, seed: 42 });
    // MC standard error ≈ 0.001 at n=3e5; agreement well within 0.005.
    expect(mc.assurance).toBeCloseTo(quad.assurance, 2);
    expect(Math.abs(mc.assurance - quad.assurance)).toBeLessThan(0.005);
  });

  it('Monte Carlo assurance is reproducible for a fixed seed', () => {
    const args = { priorMean: 0.4, priorSd: 0.15, nPerArm: 80, alpha: ALPHA, nSim: 50_000, seed: 7 };
    const a = assuranceMonteCarloTwoSampleMeans(args);
    const b = assuranceMonteCarloTwoSampleMeans(args);
    expect(a.assurance).toBe(b.assurance);
    expect(a.seed).toBe(7);
  });
});

describe('assurance — reproducibility and provenance', () => {
  it('quadrature assurance is deterministic with stable provenance', () => {
    const args = { priorMean: 0.4, priorSd: 0.12, nPerArm: 100, alpha: ALPHA };
    const a = assuranceTwoSampleMeans(args);
    const b = assuranceTwoSampleMeans(args);
    expect(a.assurance).toBe(b.assurance);
    expect(a.provenance.method).toBe('assurance:twoSampleMeans');
    expect(a.provenance.inputsSha256).toBe(b.provenance.inputsSha256);
    expect(a.provenance.reproducible).toBe(true);
  });
});
