/**
 * The three engine results that were verified BY HAND, pinned.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * The Biotech & Pharma work order (BP-W0-4) is explicit that the computational
 * engines are correct and must not be touched: three of them were checked
 * against hand calculation by the reviewer, and the remediation is on the FORMS
 * around them. Its standing verification checklist then carries the line
 *
 *     [ ] The three verified engine calculations still return identical results
 *
 * which, before this file, nothing could answer. The numbers lived in a Word
 * document. A future change to `normal.ts`, to the quadrature grid, to the Yates
 * correction, or to a rounding helper would have moved them silently, and the
 * only detector was a human re-reading a work order.
 *
 * These assertions are that checklist line, executable. They are deliberately
 * pinned to the reviewer's EXACT reported digits rather than to a tolerance
 * band: the claim being protected is "identical", and a test that accepts
 * 0.7712 for 0.771146 does not protect it.
 *
 * ── Not a substitute for the engines' own tests ──────────────────────────────
 * The per-engine suites next to this one test behaviour across their input
 * space. This file tests exactly four points and knows nothing about the maths.
 * Its whole job is to fail loudly if the specific results a human signed off on
 * ever change, so that change becomes a decision instead of an accident.
 *
 * Source: BIOPHARMA_WORK_ORDER.md — "Reference test values", and BP-W0-4.
 */
import { describe, it, expect } from 'vitest';
import { assuranceTwoSampleMeans } from '../assurance';
import { holmReject } from '../multiplicity';
import { computeDisproportionality, computeGammaPoissonEbgm } from '../signal-disproportionality';

describe('BP-W0-4 reference values — hand-verified, must not drift', () => {
  /*
   * ASSURANCE (Bayesian power)
   *   in:  prior mean δ=0.4, prior SD=0.15, n per arm=120, alpha=0.025 (one-sided)
   *   out: assurance 0.771146, power at prior mean 0.872528
   */
  it('assurance: δ=0.4, SD=0.15, n=120, α=0.025 one-sided', () => {
    const r = assuranceTwoSampleMeans({
      priorMean: 0.4,
      priorSd: 0.15,
      nPerArm: 120,
      alpha: 0.025,
      oneSided: true,
    });

    // Six decimal places is the precision the reviewer reported to, so it is the
    // precision the pin is held at. Rounding here rather than comparing raw
    // doubles keeps the assertion stable against last-bit floating-point noise
    // without widening it into a tolerance band.
    expect(Number(r.assurance.toFixed(6))).toBe(0.771146);
    expect(Number(r.powerAtPriorMean.toFixed(6))).toBe(0.872528);

    // The ordering is a property of the maths, not of this input: power is
    // concave around the design point, so averaging it over a prior can only
    // cost. If this inverts, the quadrature is wrong even if the digits above
    // somehow still matched.
    expect(r.assurance).toBeLessThan(r.powerAtPriorMean);
  });

  /*
   * MULTIPLICITY (Holm, step-down)
   *   in:  p-values 0.001, 0.013, 0.04; family-wise alpha 0.05
   *   out: all three hypotheses rejected
   */
  it('Holm step-down: p = 0.001, 0.013, 0.04 at FWER 0.05 rejects all three', () => {
    expect(holmReject([0.001, 0.013, 0.04], 0.05)).toEqual([true, true, true]);
  });

  /*
   * DISPROPORTIONALITY
   *   in:  a=50, b=100, c=200, d=10000
   *   out: PRR 17, ROR 25 (95% CI 17.32-36.09), chi-square 604.02 (Yates), EBGM 12.13, EB05 9.56
   */
  it('disproportionality: a=50 b=100 c=200 d=10000', () => {
    const cell = { a: 50, b: 100, c: 200, d: 10000 };
    const r = computeDisproportionality(cell);

    expect(r.prr).toBe(17);
    expect(r.ror).toBe(25);
    expect(Number(r.rorCi95[0].toFixed(2))).toBe(17.32);
    expect(Number(r.rorCi95[1].toFixed(2))).toBe(36.09);
    expect(Number(r.chiSquaredYates.toFixed(2))).toBe(604.02);

    // PRR ≥ 2, χ² ≥ 4 and a ≥ 3 — the EMA/MHRA criterion this table clears on
    // every one of its three legs.
    expect(r.signal).toBe(true);
  });

  it('disproportionality: EBGM shrinkage on the same table', () => {
    const e = computeGammaPoissonEbgm({ a: 50, b: 100, c: 200, d: 10000 });

    expect(Number(e.ebgm.toFixed(2))).toBe(12.13);
    expect(Number(e.eb05.toFixed(2))).toBe(9.56);

    // EBGM shrinks toward the null, so it must sit below the unshrunken PRR of
    // 17. A "correct" EBGM above its own PRR would mean the prior was applied
    // in the wrong direction — a failure the point values alone can hide.
    expect(e.ebgm).toBeLessThan(17);
  });
});
