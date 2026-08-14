/**
 * External-control borrowing and post-market signal detection — pinned, and
 * three defects fixed.
 *
 * ── Why these two together ───────────────────────────────────────────────────
 * They bracket the product lifecycle: external-control borrowing is how a
 * single-arm trial defends its comparison at submission, and disproportionality
 * screening is how a safety signal is found after approval. Both are also
 * exactly checkable, which is why they can be pinned rather than merely
 * exercised:
 *
 *   external-control  — normal power/commensurate priors are precision-weighted
 *                       averages. Every quantity is a closed form in 1/se², so
 *                       the expectation is arithmetic, not a table lookup.
 *   disproportionality — PRR, ROR and Yates χ² are functions of a 2×2 table and
 *                       can be computed by hand to the last digit.
 *
 * ── Three defects found, all in the same direction ───────────────────────────
 * Unlike rounds 1–3 this file did not confirm correct code. Each finding
 * overstated the strength of the sponsor's position, which is the direction that
 * matters:
 *
 *   1. **A perfectly separating covariate was reported as perfectly balanced.**
 *      `covariateBalance` computed SMD = (x̄_t − x̄_c) / pooled SD and returned 0
 *      when the pooled SD was zero. A covariate present in 100% of treated
 *      subjects and 0% of the external control has a pooled SD of exactly zero —
 *      so it came back `standardizedMeanDifference: 0, balanced: true`. The
 *      single worst balance failure, the case where there is no overlap to
 *      adjust for at all, was indistinguishable from perfect agreement.
 *
 *   2. **`tippingPointBias` reported the range endpoint, not the tipping point.**
 *      It returned the first grid point differing from the unbiased conclusion,
 *      scanning left to right. The sweep is two-sided and centred on zero, so
 *      when the extremes differ from the base that rule returns `biasMin` — a
 *      number that moves when the default range moves and is unrelated to the
 *      data. In the fixture below it reported a tolerable bias of **15 when the
 *      conclusion actually flips at 7.8**: a reviewer would read the result as
 *      roughly twice as robust to unmeasured confounding as it is. The sibling
 *      `tippingPointBorrow` in the same file used the correct rule, which is what
 *      made the discrepancy visible.
 *
 *   3. **Two more non-finite wire values**, the class rounds 4–5 established:
 *      `varianceRatio` was `NaN` whenever the control variance is zero (ordinary
 *      in a registry cohort where a covariate is constant), and
 *      `relativeReportRatio` was `Infinity` when the product has no reports at
 *      all — where the honest answer is the indeterminate 0/0, not infinity.
 *
 * Everything else was correct, including all of the disproportionality
 * mathematics and both borrowing posteriors.
 */

import { describe, it, expect } from 'vitest';
import {
  covariateBalance,
  powerPriorBorrow,
  commensurateBorrow,
  treatmentEffect,
  tippingPointBias,
  tippingPointBorrow,
  renderExternalControlMemo,
} from '../../server/services/stats/external-control';
import {
  computeDisproportionality,
  computeBcpnnIc,
  computeGammaPoissonEbgm,
  screenSignalPanel,
} from '../../server/services/stats/signal-disproportionality';

describe('covariate balance distinguishes agreement from no overlap', () => {
  it('a binary covariate in 100% of treated and 0% of controls is NOT balanced', () => {
    // The defect this file was written to catch. Every treated subject had prior
    // therapy; no external control did. Both arms are constant, so the pooled SD
    // is exactly zero — and dividing a real mean difference by it does not give
    // zero, it gives an unbounded SMD. The old code returned 0 and `balanced:
    // true`, which is the reassuring answer in the one case where the comparison
    // cannot be made at all.
    const r = covariateBalance([
      { name: 'priorTherapy', type: 'binary', treatment: [1, 1, 1, 1], control: [0, 0, 0, 0] },
    ]);
    const e = r.covariates[0];
    expect(e.treatmentMean).toBe(1);
    expect(e.controlMean).toBe(0);
    expect(e.standardizedMeanDifference).toBeNull();
    expect(e.perfectlySeparating).toBe(true);
    expect(e.balanced).toBe(false);
    expect(r.allBalanced).toBe(false);
    expect(r.separatingCovariates).toEqual(['priorTherapy']);
  });

  it('the same holds for a continuous covariate constant in each arm', () => {
    const r = covariateBalance([
      { name: 'age', type: 'continuous', treatment: [50, 50, 50], control: [70, 70, 70] },
    ]);
    expect(r.covariates[0].standardizedMeanDifference).toBeNull();
    expect(r.covariates[0].balanced).toBe(false);
    expect(r.allBalanced).toBe(false);
  });

  it('but a covariate constant at the SAME value in both arms IS balanced', () => {
    // The control for the two tests above, and the reason the fix keys on the
    // MEANS rather than on the pooled SD alone. Zero variance is not the problem;
    // zero variance with different centres is. Treating every zero-SD covariate
    // as separating would fail every study that carries a constant eligibility
    // criterion as a covariate.
    const r = covariateBalance([
      { name: 'ecog0', type: 'binary', treatment: [1, 1, 1], control: [1, 1, 1] },
    ]);
    expect(r.covariates[0].standardizedMeanDifference).toBe(0);
    expect(r.covariates[0].perfectlySeparating).toBe(false);
    expect(r.covariates[0].balanced).toBe(true);
    expect(r.allBalanced).toBe(true);
    expect(r.separatingCovariates).toEqual([]);
  });

  it('computes the ordinary SMD exactly: (x̄_t − x̄_c) / √((s²_t + s²_c)/2)', () => {
    const treatment = [10, 12, 14];
    const control = [7, 9, 11];
    const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
    const variance = (v: number[]) => {
      const m = mean(v);
      return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1);
    };
    const expected =
      (mean(treatment) - mean(control)) /
      Math.sqrt((variance(treatment) + variance(control)) / 2);
    const r = covariateBalance([{ name: 'ldh', type: 'continuous', treatment, control }]);
    expect(r.covariates[0].standardizedMeanDifference).toBeCloseTo(expected, 12);
    expect(r.covariates[0].varianceRatio).toBeCloseTo(variance(treatment) / variance(control), 12);
    expect(r.maxAbsStandardizedMeanDifference).toBeCloseTo(Math.abs(expected), 12);
  });

  it('varianceRatio is null, not NaN, when the control variance is zero', () => {
    // Ordinary in a registry-derived cohort: the covariate is constant in the
    // external control but varies in the trial. The SMD is still well defined and
    // must still be reported — only the ratio is undefined.
    const r = covariateBalance([
      { name: 'age', type: 'continuous', treatment: [50, 52, 54], control: [70, 70, 70] },
    ]);
    expect(r.covariates[0].varianceRatio).toBeNull();
    expect(r.covariates[0].standardizedMeanDifference).not.toBeNull();
    expect(r.covariates[0].balanced).toBe(false);
    expect(JSON.parse(JSON.stringify(r)).covariates[0].varianceRatio).toBeNull();
  });

  it('a separating covariate does not hide the SMDs of the others', () => {
    // The maximum is taken over the covariates that HAVE an SMD. Propagating null
    // through the maximum would erase real, actionable imbalance information the
    // moment one covariate separates.
    const r = covariateBalance([
      { name: 'priorTherapy', type: 'binary', treatment: [1, 1], control: [0, 0] },
      { name: 'ldh', type: 'continuous', treatment: [10, 12, 14], control: [7, 9, 11] },
    ]);
    expect(r.separatingCovariates).toEqual(['priorTherapy']);
    expect(r.maxAbsStandardizedMeanDifference).not.toBeNull();
    expect(r.maxAbsStandardizedMeanDifference!).toBeGreaterThan(0);
    expect(r.allBalanced).toBe(false);
  });

  it('the memo names the separating covariates instead of burying them in a maximum', () => {
    const balance = covariateBalance([
      { name: 'priorTherapy', type: 'binary', treatment: [1, 1], control: [0, 0] },
    ]);
    const control = powerPriorBorrow({
      meanC: 10, seC: 1, nC: 50, meanH: 10, seH: 1, nH: 200, a0: 0.5,
    });
    const memo = renderExternalControlMemo({
      endpoint: 'ORR',
      borrowingMethod: 'power-prior',
      borrowingParam: 0.5,
      control,
      effect: treatmentEffect(12, 1, control),
      balance,
    });
    expect(memo).toContain('priorTherapy');
    expect(memo).toContain('No overlap');
    // …and it must not print a numeric maximum that does not exist.
    expect(memo).not.toContain('NaN');
    expect(memo).not.toContain('null');
  });
});

describe('borrowing posteriors are precision-weighted averages, exactly', () => {
  const design = { meanC: 10, seC: 1, nC: 50, meanH: 20, seH: 1, nH: 200 };

  it('a0 = 0 borrows nothing: the posterior IS the concurrent control', () => {
    const r = powerPriorBorrow({ ...design, a0: 0 });
    expect(r.posteriorMean).toBe(10);
    expect(r.posteriorSe).toBe(1);
    expect(r.effectiveHistoricalN).toBe(0);
    expect(r.borrowedPrecisionFraction).toBe(0);
  });

  it('a0 = 1 with equal precision gives the midpoint and se/√2', () => {
    // Full pooling of two equally precise sources: mean (10+20)/2 = 15, precision
    // doubles so se falls by √2, and exactly half the posterior precision is
    // borrowed. Every number here is forced by the model.
    const r = powerPriorBorrow({ ...design, a0: 1 });
    expect(r.posteriorMean).toBe(15);
    expect(r.posteriorSe).toBeCloseTo(1 / Math.SQRT2, 15);
    expect(r.effectiveHistoricalN).toBe(200);
    expect(r.borrowedPrecisionFraction).toBeCloseTo(0.5, 15);
  });

  it('a partial discount lands on the closed form', () => {
    // seH = 2 ⇒ precH = 0.5·(1/4) = 0.125; precC = 1; posterior mean
    // (10·1 + 20·0.125)/1.125 = 11.111…, fraction 0.125/1.125 = 1/9.
    const r = powerPriorBorrow({ ...design, seH: 2, a0: 0.5 });
    expect(r.posteriorMean).toBeCloseTo(100 / 9, 12);
    expect(r.borrowedPrecisionFraction).toBeCloseTo(1 / 9, 12);
    expect(r.effectiveHistoricalN).toBe(100);
    expect(r.posteriorSe).toBeCloseTo(Math.sqrt(1 / 1.125), 15);
  });

  it('the posterior mean is monotone in a0 and always between the two sources', () => {
    // A borrowed control that fell outside [meanC, meanH] would be an arithmetic
    // impossibility for a weighted average, and would move the effect estimate
    // in a direction neither data source supports.
    let prev = -Infinity;
    for (const a0 of [0, 0.25, 0.5, 0.75, 1]) {
      const r = powerPriorBorrow({ ...design, a0 });
      expect(r.posteriorMean).toBeGreaterThanOrEqual(10);
      expect(r.posteriorMean).toBeLessThanOrEqual(20);
      expect(r.posteriorMean).toBeGreaterThan(prev);
      prev = r.posteriorMean;
    }
  });

  it('commensurate τ² = 0 reproduces the power prior at a0 = 1, exactly', () => {
    // A cross-implementation check, and the strongest test in this block: the two
    // borrowing methods are written independently and parameterized differently,
    // so agreement at their common limit is real evidence rather than a
    // restatement. Zero commensurability variance means the historical control is
    // the same parameter — which is what full pooling asserts.
    const power = powerPriorBorrow({ ...design, a0: 1 });
    const comm = commensurateBorrow({ ...design, tau2: 0 });
    expect(comm.posteriorMean).toBe(power.posteriorMean);
    expect(comm.posteriorSe).toBe(power.posteriorSe);
    expect(comm.borrowedPrecisionFraction).toBeCloseTo(power.borrowedPrecisionFraction, 15);
    expect(comm.effectiveHistoricalN).toBe(power.effectiveHistoricalN);
  });

  it('commensurability variance attenuates borrowing without a manual a0', () => {
    // τ² = 3 with seH = 1 ⇒ precH = 1/4, shrinkage seH²/(seH²+τ²) = 1/4.
    // Posterior mean (10·1 + 20·0.25)/1.25 = 12; 50 of 200 historical subjects
    // are effectively borrowed; the historical share of precision is 0.2.
    const r = commensurateBorrow({ ...design, tau2: 3 });
    expect(r.posteriorMean).toBeCloseTo(12, 12);
    expect(r.posteriorSe).toBeCloseTo(Math.sqrt(1 / 1.25), 15);
    expect(r.effectiveHistoricalN).toBeCloseTo(50, 12);
    expect(r.borrowedPrecisionFraction).toBeCloseTo(0.2, 12);
  });

  it('more commensurability variance always borrows less', () => {
    // The defining property: prior-data conflict must attenuate borrowing on its
    // own. A τ² that increased borrowing would let a discrepant historical
    // control pull the estimate harder the more it disagreed.
    let prevFraction = Infinity;
    let prevN = Infinity;
    for (const tau2 of [0, 0.5, 2, 10, 100]) {
      const r = commensurateBorrow({ ...design, tau2 });
      expect(r.borrowedPrecisionFraction, `τ²=${tau2}`).toBeLessThan(prevFraction);
      expect(r.effectiveHistoricalN, `τ²=${tau2}`).toBeLessThan(prevN);
      prevFraction = r.borrowedPrecisionFraction;
      prevN = r.effectiveHistoricalN;
    }
    expect(commensurateBorrow({ ...design, tau2: 1e9 }).borrowedPrecisionFraction).toBeCloseTo(0, 8);
  });

  it('rejects out-of-range borrowing parameters rather than extrapolating', () => {
    expect(() => powerPriorBorrow({ ...design, a0: -0.1 })).toThrow();
    expect(() => powerPriorBorrow({ ...design, a0: 1.5 })).toThrow();
    expect(() => powerPriorBorrow({ ...design, seC: 0, a0: 0.5 })).toThrow();
    expect(() => commensurateBorrow({ ...design, tau2: -1 })).toThrow();
  });
});

describe('the bias tipping point is the SMALLEST bias that overturns the conclusion', () => {
  // Treatment mean equals the borrowed control mean, so the unbiased conclusion
  // is "not significant". A large enough hypothetical bias in EITHER direction
  // moves the borrowed control far enough to make the effect significant, so the
  // grid runs [significant … not significant … significant] with the base in the
  // middle. That is the ordinary shape of a two-sided sensitivity sweep, and it
  // is exactly the shape the old rule got wrong.
  const design = {
    meanT: 10, seT: 1, meanC: 10, seC: 1, nC: 50, meanH: 10, seH: 1, nH: 200,
    a0: 0.5, steps: 101,
  };

  it('reports 7.8, not the −15 range endpoint', () => {
    const t = tippingPointBias(design);
    expect(t.grid[0].bias).toBe(-15);
    expect(t.grid[100].bias).toBe(15);
    // The base conclusion (bias = 0) is not significant; both extremes are.
    expect(t.grid[50].significant).toBe(false);
    expect(t.grid[0].significant).toBe(true);
    expect(t.grid[100].significant).toBe(true);

    expect(t.flips).toBe(true);
    expect(Math.abs(t.tippingValue!)).toBeCloseTo(7.8, 6);
    // The number the old rule returned. Pinned explicitly because it is not an
    // arbitrary wrong value — it is the range endpoint, so it scaled with the
    // default sweep width and reported the conclusion as ~2× more robust to
    // unmeasured confounding than it is.
    expect(Math.abs(t.tippingValue!)).toBeLessThan(15);
  });

  it('no grid point closer to zero overturns the conclusion', () => {
    // The property, independent of the fixture: everything strictly inside the
    // reported magnitude must agree with the base conclusion. This is what
    // "smallest" means, and it fails for any rule that returns a range endpoint.
    const t = tippingPointBias(design);
    const base = treatmentEffect(design.meanT, design.seT, powerPriorBorrow(design)).significant;
    const magnitude = Math.abs(t.tippingValue!);
    for (const point of t.grid) {
      if (Math.abs(point.bias) < magnitude - 1e-9) {
        expect(point.significant, `bias=${point.bias}`).toBe(base);
      }
    }
  });

  it('is unchanged where the old rule already agreed with it', () => {
    // A one-sided sweep: a clearly significant effect that only a positive bias
    // can erase. Here the leftmost grid point already agrees with the base, so
    // scanning left-to-right and scanning by magnitude give the same answer — and
    // the fix must not have moved it.
    const t = tippingPointBias({
      meanT: 15, seT: 1, meanC: 10, seC: 1, nC: 50, meanH: 10, seH: 1, nH: 200,
      a0: 0.5, steps: 101,
    });
    expect(t.grid[0].significant).toBe(true);
    expect(t.tippingValue).toBeCloseTo(7.5, 6);
  });

  it('stays null when the conclusion holds across the whole range', () => {
    const t = tippingPointBias({
      meanT: 40, seT: 0.2, meanC: 10, seC: 0.2, nC: 500, meanH: 10, seH: 0.2, nH: 500,
      a0: 0.5, steps: 51, biasMin: -1, biasMax: 1,
    });
    expect(t.flips).toBe(false);
    expect(t.tippingValue).toBeNull();
  });

  it('is deterministic and carries reproducible provenance', () => {
    const a = tippingPointBias(design);
    const b = tippingPointBias(design);
    expect(a.tippingValue).toBe(b.tippingValue);
    expect(a.provenance.inputsSha256).toBe(b.provenance.inputsSha256);
  });

  it('the borrowing sweep scans down from full borrowing and was already right', () => {
    // tippingPointBorrow answers a different, one-directional question — "how far
    // can I reduce borrowing before the conclusion changes?" — so first-transition
    // scanning from a0 = 1 is the correct rule there, and it is left alone. Its
    // disagreement with the bias sweep's rule is what surfaced the defect above.
    const t = tippingPointBorrow({
      meanT: 15, seT: 1, meanC: 13, seC: 1, nC: 50, meanH: 8, seH: 1, nH: 200, steps: 101,
    });
    expect(t.grid[0].a0).toBeCloseTo(1, 12);
    expect(t.grid[0].significant).toBe(true);
    expect(t.grid[100].significant).toBe(false);
    expect(t.flips).toBe(true);
    expect(t.tippingValue).toBeCloseTo(0.15, 6);
    // Every a0 above the tipping value keeps the conclusion; that is what makes
    // it the point at which the result stops depending on borrowed information.
    for (const point of t.grid) {
      if (point.a0 > t.tippingValue! + 1e-9) expect(point.significant, `a0=${point.a0}`).toBe(true);
    }
  });
});

describe('disproportionality reproduces the 2×2 measures by hand', () => {
  // a = 20 reports of the event for the product, b = 80 other events for it,
  // c = 10 for all other products, d = 890. N = 1000.
  const cell = { a: 20, b: 80, c: 10, d: 890 };

  it('PRR = [a/(a+b)] / [c/(c+d)] = 18 exactly', () => {
    // (20/100) / (10/900) = 0.2 / 0.011111… = 18.
    expect(computeDisproportionality(cell).prr).toBe(18);
  });

  it('ROR = ad/bc = 22.25 exactly', () => {
    // 20·890 / (80·10) = 17800 / 800 = 22.25.
    expect(computeDisproportionality(cell).ror).toBe(22.25);
  });

  it('the Yates-corrected χ² matches its definition, derived here', () => {
    const { a, b, c, d } = cell;
    const n = a + b + c + d;
    const expected =
      (n * (Math.abs(a * d - b * c) - n / 2) ** 2) /
      ((a + b) * (c + d) * (a + c) * (b + d));
    expect(expected).toBeCloseTo(103.9519, 4);
    expect(computeDisproportionality(cell).chiSquaredYates).toBeCloseTo(expected, 3);
  });

  it('the CIs bracket the point estimate and exclude 1 for a real signal', () => {
    const r = computeDisproportionality(cell);
    expect(r.prrCi95[0]).toBeLessThan(r.prr);
    expect(r.prrCi95[1]).toBeGreaterThan(r.prr);
    expect(r.prrCi95[0]).toBeGreaterThan(1);
    expect(r.rorCi95[0]).toBeLessThan(r.ror);
    expect(r.rorCi95[1]).toBeGreaterThan(r.ror);
    expect(r.signal).toBe(true);
  });

  it('the EMA criterion needs all three conditions, and the count gate bites', () => {
    // PRR ≥ 2 AND χ² ≥ 4 AND a ≥ 3. Two co-reports at an enormous ratio must NOT
    // signal — that gate is the whole defence against firing on coincidences.
    const tiny = computeDisproportionality({ a: 2, b: 1, c: 1, d: 9996 });
    expect(tiny.prr).toBeGreaterThan(2);
    expect(tiny.counts.a).toBeLessThan(3);
    expect(tiny.signal).toBe(false);
    // …and a large PRR with a weak χ² must not signal either.
    const weak = computeDisproportionality({ a: 3, b: 1, c: 3, d: 5 });
    expect(weak.signal).toBe(false);
  });

  it('rejects non-integer or negative cells rather than computing on them', () => {
    expect(() => computeDisproportionality({ a: 1.5, b: 10, c: 10, d: 10 })).toThrow();
    expect(() => computeDisproportionality({ a: -1, b: 10, c: 10, d: 10 })).toThrow();
  });
});

describe('the Bayesian methods shrink small counts — which is the point of them', () => {
  const strong = { a: 20, b: 80, c: 10, d: 890 };
  /** E = (a+b)(a+c)/N under independence. */
  const expectedCount = (x: typeof strong) =>
    ((x.a + x.b) * (x.a + x.c)) / (x.a + x.b + x.c + x.d);

  it('BCPNN IC = log₂[(a+α)/(E+α)], derived not quoted', () => {
    const e = expectedCount(strong); // 100·30/1000 = 3
    expect(e).toBe(3);
    const ic = Math.log2((strong.a + 0.5) / (e + 0.5)); // log₂(20.5/3.5)
    const r = computeBcpnnIc(strong);
    expect(r.expectedCount).toBe(3);
    expect(r.ic).toBeCloseTo(ic, 4);
    expect(r.ic).toBeCloseTo(2.5502, 4);
    // IC025 = IC − z·(1/ln2)·√(1/(a+α)); signal when it clears zero.
    const sd = (1 / Math.LN2) * Math.sqrt(1 / (strong.a + 0.5));
    expect(r.ic025).toBeCloseTo(ic - 1.959964 * sd, 4);
    expect(r.ic025).toBeGreaterThan(0);
    expect(r.signal).toBe(true);
  });

  it('EBGM sits below the raw report ratio, and the interval brackets it', () => {
    // Shrinkage toward the null: the posterior geometric mean of Gamma(α+a, β+E)
    // is strictly below the raw a/E for a weak prior centred at 1. EBGM ≥ RR
    // would mean the shrinkage ran the wrong way and inflated small-count signals
    // rather than suppressing them.
    const r = computeGammaPoissonEbgm(strong);
    expect(r.relativeReportRatio).toBeCloseTo(20 / 3, 3);
    expect(r.ebgm).toBeLessThan(r.relativeReportRatio!);
    expect(r.eb05).toBeLessThan(r.ebgm);
    expect(r.eb95).toBeGreaterThan(r.ebgm);
    expect(r.signal).toBe(true);
  });

  it('EBGM is below the posterior MEAN as well — a geometric mean must be', () => {
    // AM–GM on the posterior Gamma(k, r): exp(ψ(k))/r < k/r, always. This pins
    // the digamma path rather than the arithmetic one, and would catch a
    // "geometric mean" that had quietly become the posterior mean.
    for (const cell of [strong, { a: 3, b: 97, c: 30, d: 8970 }, { a: 1, b: 9, c: 5, d: 985 }]) {
      const r = computeGammaPoissonEbgm(cell);
      const posteriorMean = (0.5 + cell.a) / (0.5 + expectedCount(cell));
      expect(r.ebgm, JSON.stringify(cell)).toBeLessThan(posteriorMean);
    }
  });

  it('a PRR of 9 on three reports clears the frequentist bar but not the MGPS one', () => {
    // The divergence the panel exists to surface, and the reason a pharmacovigilance
    // unit runs more than one method. Three co-reports give PRR = 9 and a
    // significant χ², so the EMA criterion fires — but the shrunken EB05 is 1.25,
    // below the MGPS threshold of 2. Acting on the frequentist flag alone is how
    // a signal-detection programme drowns in coincidences.
    const sparse = { a: 3, b: 97, c: 30, d: 8970 };
    const freq = computeDisproportionality(sparse);
    const ebgm = computeGammaPoissonEbgm(sparse);
    expect(freq.prr).toBe(9);
    expect(freq.signal).toBe(true);
    expect(ebgm.eb05).toBeLessThan(2);
    expect(ebgm.signal).toBe(false);
    // …and the same table at 6.7× the counts, where the evidence is real, does
    // clear it. Same ratio, more data — the shrinkage is about COUNT, not ratio.
    const dense = { a: 20, b: 80, c: 10, d: 890 };
    expect(computeGammaPoissonEbgm(dense).eb05).toBeGreaterThanOrEqual(2);
  });

  it('the panel reports the divergence rather than a single verdict', () => {
    const sparse = screenSignalPanel({ a: 3, b: 97, c: 30, d: 8970 });
    expect(sparse.concordance).toBe(2); // frequentist + BCPNN, not EBGM
    expect(sparse.tier).toBe('moderate');
    expect(sparse.divergenceNotes.join(' ')).toContain('EBGM');

    const concordant = screenSignalPanel({ a: 20, b: 80, c: 10, d: 890 });
    expect(concordant.concordance).toBe(3);
    expect(concordant.tier).toBe('strong');
  });

  it('relativeReportRatio is null, not Infinity, when the product has no reports', () => {
    // E = (a+b)(a+c)/N is zero when the product has no reports at all, so a/E is
    // 0/0 — indeterminate, not infinite. The old code returned Infinity, which
    // JSON turns into null anyway; returning null says the same thing while
    // telling the truth about the type. The shrunken estimates remain defined,
    // because the prior carries them.
    const r = computeGammaPoissonEbgm({ a: 0, b: 0, c: 10, d: 100 });
    expect(r.expectedCount).toBe(0);
    expect(r.relativeReportRatio).toBeNull();
    expect(Number.isFinite(r.ebgm)).toBe(true);
    expect(r.signal).toBe(false);
    expect(JSON.parse(JSON.stringify(r)).relativeReportRatio).toBeNull();
  });

  it('rejects an empty table and non-positive prior parameters', () => {
    expect(() => computeGammaPoissonEbgm({ a: 0, b: 0, c: 0, d: 0 })).toThrow();
    expect(() => computeGammaPoissonEbgm({ a: 1, b: 1, c: 1, d: 1 }, { alpha: 0, beta: 1 })).toThrow();
    expect(() => computeBcpnnIc({ a: 1, b: 1, c: 1, d: 1 }, 0)).toThrow();
  });
});
