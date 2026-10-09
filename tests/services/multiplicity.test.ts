/**
 * Tests for multiple-testing procedures (server/services/stats/multiplicity.ts).
 *
 * GA acceptance bars:
 *  - correctness: each procedure matches worked examples; the graphical procedure
 *    reproduces Bonferroni–Holm and fixed-sequence as special cases.
 *  - "FWER controlled in tests": estimated FWER under the global null is ≤ alpha
 *    for each procedure, while the unadjusted rule inflates it (showing the
 *    procedures actually correct).
 *  - reproducibility: deterministic decisions; seeded, reproducible FWER.
 */

import { describe, it, expect } from 'vitest';
import {
  bonferroniReject,
  holmReject,
  hochbergReject,
  fixedSequenceReject,
  graphicalReject,
  testMultiplicity,
  estimateFWER,
} from '../../server/services/stats/multiplicity';
import { hashInputs } from '../../server/services/stats/computation-provenance';

describe('multiplicity — worked examples', () => {
  it('Bonferroni rejects only p-values below alpha/m', () => {
    expect(bonferroniReject([0.01, 0.04, 0.2], 0.05)).toEqual([true, false, false]);
  });

  it('Holm rejects at least as much as Bonferroni (step-down)', () => {
    const p = [0.026, 0.001];
    expect(bonferroniReject(p, 0.05)).toEqual([false, true]); // 0.026 > 0.025
    expect(holmReject(p, 0.05)).toEqual([true, true]); // 0.001≤0.025, then 0.026≤0.05
  });

  it('Hochberg can reject where Holm does not (step-up vs step-down)', () => {
    const p = [0.026, 0.04];
    expect(holmReject(p, 0.05)).toEqual([false, false]); // 0.026 > 0.025 ⇒ stop
    expect(hochbergReject(p, 0.05)).toEqual([true, true]); // 0.04 ≤ 0.05 ⇒ reject all
  });

  it('fixed-sequence stops at the first non-rejection', () => {
    expect(fixedSequenceReject([0.04, 0.01, 0.2, 0.001], 0.05)).toEqual([
      true, true, false, false,
    ]);
  });
});

describe('multiplicity — graphical procedure subsumes the classics', () => {
  const alpha = 0.05;

  // Bonferroni–Holm graph: equal weights, complete graph with g_ij = 1/(m-1).
  function holmGraph(m: number): { weights: number[]; G: number[][] } {
    const weights = new Array(m).fill(1 / m);
    const G = Array.from({ length: m }, (_, i) =>
      Array.from({ length: m }, (_, j) => (i === j ? 0 : 1 / (m - 1))),
    );
    return { weights, G };
  }

  // Fixed-sequence graph: all weight on H1, a chain g_{i,i+1} = 1.
  function chainGraph(m: number): { weights: number[]; G: number[][] } {
    const weights = new Array(m).fill(0);
    weights[0] = 1;
    const G = Array.from({ length: m }, (_, i) =>
      Array.from({ length: m }, (_, j) => (j === i + 1 ? 1 : 0)),
    );
    return { weights, G };
  }

  it('graphical with the Holm graph equals Holm', () => {
    const m = 4;
    const { weights, G } = holmGraph(m);
    const cases = [
      [0.01, 0.02, 0.2, 0.5],
      [0.026, 0.001, 0.3, 0.9],
      [0.2, 0.3, 0.4, 0.5],
      [0.001, 0.002, 0.003, 0.004],
    ];
    for (const p of cases) {
      expect(graphicalReject(p, alpha, weights, G)).toEqual(holmReject(p, alpha));
    }
  });

  it('graphical with a chain graph equals fixed-sequence', () => {
    const m = 4;
    const { weights, G } = chainGraph(m);
    const cases = [
      [0.04, 0.01, 0.2, 0.001],
      [0.06, 0.0, 0.0, 0.0],
      [0.01, 0.02, 0.03, 0.2],
    ];
    for (const p of cases) {
      expect(graphicalReject(p, alpha, weights, G)).toEqual(fixedSequenceReject(p, alpha));
    }
  });
});

describe('multiplicity — testMultiplicity wrapper', () => {
  it('returns rejected ids and a stable provenance record', () => {
    const r = testMultiplicity({
      pValues: [0.01, 0.02, 0.2],
      alpha: 0.05,
      procedure: 'holm',
      ids: ['primary', 'key-secondary', 'exploratory'],
    });
    expect(r.rejectedIds).toEqual(['primary', 'key-secondary']);
    expect(r.rejectedIndices).toEqual([0, 1]);
    expect(r.provenance.method).toBe('multiplicity:holm');

    const again = testMultiplicity({
      pValues: [0.01, 0.02, 0.2],
      alpha: 0.05,
      procedure: 'holm',
      ids: ['primary', 'key-secondary', 'exploratory'],
    });
    expect(r.provenance.inputsSha256).toBe(again.provenance.inputsSha256);
  });

  it('graphical requires weights and a transition matrix', () => {
    expect(() =>
      testMultiplicity({ pValues: [0.01, 0.02], alpha: 0.05, procedure: 'graphical' }),
    ).toThrow(/requires weights and transitionMatrix/);
  });

  it('rejects invalid p-values', () => {
    expect(() =>
      testMultiplicity({ pValues: [0.5, 1.4], alpha: 0.05, procedure: 'bonferroni' }),
    ).toThrow(/must be a number in \[0, 1\]/);
  });
});

describe('multiplicity — FWER control under the global null (GA bar)', () => {
  const m = 4;
  const alpha = 0.05;
  const nSim = 40_000;
  const seed = 20260531;
  // Generous binomial allowance: SE ≈ √(0.05·0.95/40000) ≈ 0.0011.
  const tol = 0.006;

  it('Bonferroni controls FWER at or below alpha', () => {
    const r = estimateFWER(p => bonferroniReject(p, alpha), m, alpha, nSim, seed, 'bonferroni');
    expect(r.fwer).toBeLessThanOrEqual(alpha + tol);
  });

  it('Holm controls FWER at or below alpha', () => {
    const r = estimateFWER(p => holmReject(p, alpha), m, alpha, nSim, seed, 'holm');
    expect(r.fwer).toBeLessThanOrEqual(alpha + tol);
  });

  it('Hochberg controls FWER at or below alpha (independent p-values)', () => {
    const r = estimateFWER(p => hochbergReject(p, alpha), m, alpha, nSim, seed, 'hochberg');
    expect(r.fwer).toBeLessThanOrEqual(alpha + tol);
  });

  it('fixed-sequence controls FWER at or below alpha', () => {
    const r = estimateFWER(p => fixedSequenceReject(p, alpha), m, alpha, nSim, seed, 'fixed-sequence');
    expect(r.fwer).toBeLessThanOrEqual(alpha + tol);
  });

  it('graphical (Holm graph) controls FWER at or below alpha', () => {
    const weights = new Array(m).fill(1 / m);
    const G = Array.from({ length: m }, (_, i) =>
      Array.from({ length: m }, (_, j) => (i === j ? 0 : 1 / (m - 1))),
    );
    const r = estimateFWER(p => graphicalReject(p, alpha, weights, G), m, alpha, nSim, seed, 'graphical(holm graph)');
    expect(r.fwer).toBeLessThanOrEqual(alpha + tol);
  });

  it('the UNADJUSTED rule inflates FWER well above alpha (shows correction matters)', () => {
    // Reject any p ≤ alpha with no correction: FWER ≈ 1-(1-α)^m ≈ 0.185 for m=4.
    const unadjusted = (p: number[]) => p.map(pi => pi <= alpha);
    const r = estimateFWER(unadjusted, m, alpha, nSim, seed, 'unadjusted');
    expect(r.fwer).toBeGreaterThan(0.12);
  });

  it('estimateFWER is reproducible for a fixed seed', () => {
    const a = estimateFWER(p => holmReject(p, alpha), m, alpha, 10_000, 123, 'holm');
    const b = estimateFWER(p => holmReject(p, alpha), m, alpha, 10_000, 123, 'holm');
    expect(a.fwer).toBe(b.fwer);
    expect(a.provenance.inputsSha256).toBe(b.provenance.inputsSha256);
  });
});

describe('multiplicity — estimateFWER provenance identifies the rejection rule', () => {
  const m = 3;
  const alpha = 0.05;
  const nSim = 20_000;
  const seed = 20260928;
  const holm = (p: number[]) => holmReject(p, alpha);
  const unadjusted = (p: number[]) => p.map(pi => pi <= alpha);

  it('rates for different rules carry different input hashes (they shared one before)', () => {
    const h = estimateFWER(holm, m, alpha, nSim, seed, 'holm');
    const u = estimateFWER(unadjusted, m, alpha, nSim, seed, 'unadjusted');
    expect(h.fwer).not.toBe(u.fwer);
    expect(h.provenance.inputsSha256).not.toBe(u.provenance.inputsSha256);
    expect(h.rule).toBe('holm');
    expect(u.rule).toBe('unadjusted');
  });

  it('the hash is reproducible from the result alone: {m, alpha, nSim, seed, rule}', () => {
    const r = estimateFWER(holm, m, alpha, nSim, seed, 'holm');
    expect(r.provenance.inputsSha256).toBe(
      hashInputs({ m: r.m, alpha: r.alpha, nSim: r.nSim, seed: r.seed, rule: r.rule }),
    );
    expect(r.provenance.note).toMatch(/Rejection rule: holm\.$/);
  });

  it('naming the rule never changes the rate', () => {
    const named = estimateFWER(holm, m, alpha, nSim, seed, 'holm');
    const unnamed = estimateFWER(holm, m, alpha, nSim, seed);
    expect(named.fwer).toBe(unnamed.fwer);
    expect(named.fwer).toBe(0.048);
  });

  it('an omitted rule keeps the historical hash, and says the record cannot tell rules apart', () => {
    const r = estimateFWER(holm, m, alpha, nSim, seed);
    expect(r.rule).toBeNull();
    expect(r.provenance.inputsSha256).toBe(hashInputs({ m, alpha, nSim, seed }));
    expect(r.provenance.inputsSha256).toBe('1d8a2f2f1efb12a2a75ad3473fddc98619ab37adcaeac003310e832da00986cc');
    expect(r.provenance.note).toMatch(/rejection rule was not identified/);
  });

  it.each([[''], ['   '], [null], [42], [{ procedure: 'holm' }]])('refuses rule %j with a TypeError naming it', bad => {
    expect(() => estimateFWER(holm, m, alpha, 10, seed, bad as unknown as string)).toThrow(TypeError);
    expect(() => estimateFWER(holm, m, alpha, 10, seed, bad as unknown as string)).toThrow(/estimateFWER: rule must be a non-empty string/);
  });
});
