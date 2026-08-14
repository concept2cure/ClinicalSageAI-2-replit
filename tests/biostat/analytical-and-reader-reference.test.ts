/**
 * Analytical (CLSI EP) performance and MRMC reader sizing — pinned to hand
 * computation and to closed-form structure.
 *
 * ── Why this round exists ────────────────────────────────────────────────────
 * Rounds 1–4 pinned the trial-design side: group-sequential boundaries, the
 * foundation layer, power/sizing, win ratio and event projection. This one
 * covers the IVD/device side — the numbers that go into an FDA 510(k) or PMA
 * analytical-performance section and an EU IVDR performance evaluation report.
 *
 * These endpoints were shape-tested (does it return an object with the right
 * keys) but not value-tested. A shape test cannot tell a correct ANOVA from an
 * incorrect one, and every number below is a claim a sponsor submits.
 *
 * ── The three things worth checking, and how ─────────────────────────────────
 *   EP05 imprecision  — one-way random-effects ANOVA. Small balanced fixtures
 *                       are computable BY HAND to the last digit, so these are
 *                       exact equalities, not tolerances.
 *   EP17 / EP09       — LoB/LoD and method-comparison bias are closed forms in
 *                       z-quantiles and OLS, so the expected value is derived in
 *                       the test rather than quoted.
 *   MRMC              — Obuchowski–Rockette. The variance expression is written
 *                       out independently here and checked against the
 *                       implementation, and then the STRUCTURAL consequence is
 *                       pinned: reader covariance puts a floor under the
 *                       variance that no number of readers can beat.
 *
 * ── One defect class found and fixed while writing this ──────────────────────
 * The same non-finite-on-the-wire class as round 4, in three more places:
 *
 *   • `estimateImprecision` returned `NaN` for both CV fields when the grand
 *     mean is zero — reachable whenever the measurand is a signed quantity
 *     (bias, drift, a difference score) rather than a concentration.
 *   • `assessRealTimeStability` returned `Infinity` for `shelfLife` when the
 *     fitted degradation slope is zero.
 *   • `assessAcceleratedStability` returned `Infinity` for `predictedShelfLife`
 *     when the extrapolated storage-temperature rate constant underflows.
 *
 * All three serialize to `null` silently, so a stability claim arrived at the
 * client as `"shelfLife": null` beside `"success": true` — indistinguishable
 * from a failed computation. All three now return `null` explicitly, with a
 * sibling field (`slopePerUnitTime`, `predictedRateAtStorage`, `grandMean`) from
 * which the caller can tell WHY. That is the convention rounds 4 established.
 *
 * Everything else below required no code change: the mathematics was already
 * right. What was missing was anything that would notice if it stopped being.
 */

import { describe, it, expect } from 'vitest';
import {
  estimateImprecision,
  estimateDetectionCapability,
  compareMethods,
} from '../../server/services/stats/analytical-performance';
import {
  assessRealTimeStability,
  assessAcceleratedStability,
} from '../../server/services/stats/analytical-performance-extensions';
import {
  mrmcPower,
  mrmcReadersForPower,
  varianceOfModalityDifference,
  type MrmcInput,
} from '../../server/services/stats/mrmc';
import { normalQuantile } from '../../server/services/stats/normal';

describe('EP05 imprecision reproduces the ANOVA exactly', () => {
  it('two identical runs: all variability is within-run', () => {
    // runs [[9,11],[9,11]] — computable by hand end to end:
    //   grand mean = 10; run means = 10, 10
    //   SS_within  = 1+1+1+1 = 4, df = 2      → MS_within  = 2
    //   SS_between = 0,           df = 1      → MS_between = 0
    //   σ²_repeatability = MS_within = 2      → SD = √2
    //   σ²_between = (0 − 2)/2 = −1 → clamped → SD = 0
    //   σ²_withinLab = 2 + 0 = 2              → SD = √2, CV = 14.142%
    const r = estimateImprecision({ runs: [[9, 11], [9, 11]] });
    expect(r.grandMean).toBe(10);
    expect(r.n).toBe(4);
    expect(r.anova).toEqual({ msWithin: 2, msBetween: 0, dfWithin: 2, dfBetween: 1 });
    expect(r.repeatabilitySd).toBeCloseTo(Math.SQRT2, 12);
    expect(r.withinLabSd).toBeCloseTo(Math.SQRT2, 12);
    expect(r.withinLabCvPct).toBeCloseTo(14.142135623, 8);
  });

  it('clamps a negative between-run variance component to zero, not to NaN', () => {
    // The case above is the important one and deserves saying plainly: when
    // MS_between < MS_within the moment estimator of the between-run variance is
    // NEGATIVE. Taking its square root gives NaN, which serializes to null; the
    // CLSI-standard handling is to report zero, meaning "no detectable
    // between-run component". Reporting NaN would turn a routine, expected
    // result — common with few runs — into an apparent computation failure.
    const r = estimateImprecision({ runs: [[9, 11], [9, 11]] });
    expect(r.anova.msBetween).toBeLessThan(r.anova.msWithin);
    expect(r.betweenRunSd).toBe(0);
    expect(Number.isNaN(r.betweenRunSd)).toBe(false);
    // …and the clamp must not leak into the total, which is the number reported.
    expect(r.withinLabSd).toBe(r.repeatabilitySd);
  });

  it('separated runs: the between-run component is recovered exactly', () => {
    // runs [[9,11],[19,21]] — same within-run spread, run means 10 apart:
    //   grand mean = 15; MS_within = 2 (df 2); MS_between = 2·(25+25) = 100 (df 1)
    //   σ²_between = (100 − 2)/2 = 49  → SD = 7   EXACTLY
    //   σ²_withinLab = 2 + 49 = 51     → SD = √51 = 7.14143
    const r = estimateImprecision({ runs: [[9, 11], [19, 21]] });
    expect(r.grandMean).toBe(15);
    expect(r.anova.msWithin).toBe(2);
    expect(r.anova.msBetween).toBe(100);
    expect(r.betweenRunSd).toBeCloseTo(7, 12);
    expect(r.withinLabSd).toBeCloseTo(Math.sqrt(51), 12);
    expect(r.withinLabCvPct).toBeCloseTo((Math.sqrt(51) / 15) * 100, 10);
  });

  it('the within-run SD is identical in both fixtures — only the run means moved', () => {
    // A cross-check that isolates the between-run machinery: the replicate
    // spread is the same 9/11 in both, so repeatability MUST be unchanged. If it
    // moves, run-mean separation is leaking into the within-run estimate, which
    // would inflate repeatability and understate the between-run component —
    // exactly the direction that flatters an assay's precision claim.
    const same = estimateImprecision({ runs: [[9, 11], [9, 11]] });
    const separated = estimateImprecision({ runs: [[9, 11], [19, 21]] });
    expect(separated.repeatabilitySd).toBe(same.repeatabilitySd);
    expect(separated.betweenRunSd).toBeGreaterThan(same.betweenRunSd);
  });

  it('CV is null, not NaN, when the grand mean is zero', () => {
    // A coefficient of VARIATION needs a level to be relative to. This is
    // reachable whenever the measurand is signed — a bias, a drift, a difference
    // score — not only in contrived data. The SDs remain perfectly well defined
    // and must still be reported.
    const r = estimateImprecision({ runs: [[-1, 1], [-1, 1]] });
    expect(r.grandMean).toBe(0);
    expect(r.repeatabilitySd).toBeCloseTo(Math.SQRT2, 12);
    expect(r.repeatabilityCvPct).toBeNull();
    expect(r.withinLabCvPct).toBeNull();
    const wire = JSON.parse(JSON.stringify(r));
    expect(wire.withinLabCvPct).toBeNull();
    expect(wire.withinLabSd).toBeCloseTo(Math.SQRT2, 12);
  });

  it('refuses an unbalanced or too-small design rather than estimating from it', () => {
    expect(() => estimateImprecision({ runs: [[1, 2]] })).toThrow();
    expect(() => estimateImprecision({ runs: [[1], [2]] })).toThrow();
    expect(() => estimateImprecision({ runs: [[1, 2], [3, 4, 5]] })).toThrow();
  });
});

describe('EP17 detection capability is the stated closed form', () => {
  // Blanks [9,10,11] and lows [19,20,21] both have mean-centred deviations
  // −1, 0, +1, so the sample SD is exactly 1 in each. That makes LoB and LoD
  // pure functions of the normal quantile, with nothing to mistranscribe.
  const Z95 = normalQuantile(0.95);

  it('LoB = mean_blank + cp·SD_blank, with default α = 0.05', () => {
    const r = estimateDetectionCapability({
      blankReplicates: [9, 10, 11],
      lowSamples: [[19, 20, 21]],
    });
    expect(r.blankMean).toBe(10);
    expect(r.blankSd).toBeCloseTo(1, 12);
    expect(r.cp).toBeCloseTo(Z95, 12);
    expect(r.lob).toBeCloseTo(10 + Z95, 12);
  });

  it('LoD = LoB + cβ·pooled SD_low — the increment is exactly cβ·SD', () => {
    const r = estimateDetectionCapability({
      blankReplicates: [9, 10, 11],
      lowSamples: [[19, 20, 21]],
    });
    expect(r.pooledLowSd).toBeCloseTo(1, 12);
    expect(r.lod).toBeCloseTo(10 + 2 * Z95, 12);
    expect(r.lod - r.lob).toBeCloseTo(r.cBeta * r.pooledLowSd, 12);
    // LoD is above LoB by construction; the reverse would let an assay claim
    // detection below its own blank cut-off.
    expect(r.lod).toBeGreaterThan(r.lob);
  });

  it('the EP17-A2 bias correction K scales only the LoD increment', () => {
    const plain = estimateDetectionCapability({
      blankReplicates: [9, 10, 11],
      lowSamples: [[19, 20, 21]],
    });
    const corrected = estimateDetectionCapability({
      blankReplicates: [9, 10, 11],
      lowSamples: [[19, 20, 21]],
      biasCorrectionK: 1.2,
    });
    expect(corrected.lob).toBe(plain.lob); // K must not touch LoB
    expect(corrected.lod - corrected.lob).toBeCloseTo(1.2 * (plain.lod - plain.lob), 12);
  });

  it('a tighter false-positive rate raises LoB', () => {
    const at05 = estimateDetectionCapability({
      blankReplicates: [9, 10, 11],
      lowSamples: [[19, 20, 21]],
    });
    const at01 = estimateDetectionCapability({
      blankReplicates: [9, 10, 11],
      lowSamples: [[19, 20, 21]],
      alpha: 0.01,
    });
    expect(at01.lob).toBeCloseTo(10 + normalQuantile(0.99), 12);
    expect(at01.lob).toBeGreaterThan(at05.lob);
  });

  it('pools across low samples by degrees of freedom, not by simple averaging', () => {
    // Two samples with different replicate counts and different spreads. Pooling
    // must weight by dfᵢ = nᵢ − 1: sqrt(Σ dfᵢ·sᵢ² / Σ dfᵢ). A plain mean of the
    // SDs would give a different (smaller) answer here, and would understate the
    // LoD — i.e. claim better detection than the data support.
    const a = [10, 11]; //          s² = 0.5,  df = 1
    const b = [20, 22, 24, 26]; //  s² = 6.667, df = 3
    const sd = (v: number[]) => {
      const m = v.reduce((s, x) => s + x, 0) / v.length;
      return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
    };
    const pooled = Math.sqrt((1 * sd(a) ** 2 + 3 * sd(b) ** 2) / 4);
    const r = estimateDetectionCapability({
      blankReplicates: [9, 10, 11],
      lowSamples: [a, b],
    });
    expect(r.pooledLowSd).toBeCloseTo(pooled, 12);
    expect(r.pooledLowSd).not.toBeCloseTo((sd(a) + sd(b)) / 2, 6);
  });
});

describe('EP09 method comparison separates mean bias from bias at the decision level', () => {
  it('a pure constant offset: slope 1, bias 1 everywhere', () => {
    const r = compareMethods({ reference: [1, 2, 3, 4], test: [2, 3, 4, 5], decisionLevel: 10 });
    expect(r.slope).toBeCloseTo(1, 12);
    expect(r.intercept).toBeCloseTo(1, 12);
    expect(r.r2).toBeCloseTo(1, 12);
    expect(r.meanBias).toBeCloseTo(1, 12);
    expect(r.sdBias).toBeCloseTo(0, 12);
    // Constant offset ⇒ bias at any level equals the mean bias.
    expect(r.biasAtDecisionLevel).toBeCloseTo(1, 12);
    expect(r.limitsOfAgreement.lower).toBeCloseTo(1, 12);
    expect(r.limitsOfAgreement.upper).toBeCloseTo(1, 12);
  });

  it('proportional bias: mean bias UNDERSTATES bias at a decision level above the range', () => {
    // test = 1.1 × reference, measured over [1, 4]. Mean bias across the measured
    // range is 0.25, but at a medical-decision level of 10 the bias is 1.0 — four
    // times larger. This is the whole reason EP09 reports bias at the decision
    // level separately, and the reason a single "average bias" number is not an
    // acceptable substitute in a submission.
    const r = compareMethods({
      reference: [1, 2, 3, 4],
      test: [1.1, 2.2, 3.3, 4.4],
      decisionLevel: 10,
    });
    expect(r.slope).toBeCloseTo(1.1, 12);
    expect(r.intercept).toBeCloseTo(0, 10);
    expect(r.meanBias).toBeCloseTo(0.25, 12);
    expect(r.biasAtDecisionLevel).toBeCloseTo(1.0, 10);
    expect(Math.abs(r.biasAtDecisionLevel!)).toBeGreaterThan(Math.abs(r.meanBias) * 3);
  });

  it('omitting the decision level yields null, not a bias at zero', () => {
    // Silently defaulting to level 0 would report the intercept as "the bias",
    // which is a different quantity and is often meaningless for an assay whose
    // reportable range excludes zero.
    const r = compareMethods({ reference: [1, 2, 3, 4], test: [2, 3, 4, 5] });
    expect(r.biasAtDecisionLevel).toBeNull();
  });

  it('limits of agreement widen with scatter and stay centred on the mean bias', () => {
    const r = compareMethods({ reference: [1, 2, 3, 4], test: [2, 3.5, 3.5, 5] });
    const mid = (r.limitsOfAgreement.lower + r.limitsOfAgreement.upper) / 2;
    expect(mid).toBeCloseTo(r.meanBias, 12);
    expect(r.limitsOfAgreement.upper - r.limitsOfAgreement.lower).toBeCloseTo(2 * 1.96 * r.sdBias, 12);
    expect(r.sdBias).toBeGreaterThan(0);
  });
});

describe('stability shelf-life reports null, never Infinity, when the limit is never reached', () => {
  it('a degrading series gives the arithmetic answer', () => {
    // −1 unit per 30 days, 10 units allowed ⇒ 300 days.
    const r = assessRealTimeStability({
      points: [
        { time: 0, value: 100 },
        { time: 30, value: 99 },
        { time: 60, value: 98 },
        { time: 90, value: 97 },
      ],
      initialValue: 100,
      maxPercentChange: 10,
    });
    expect(r.shelfLife).toBeCloseTo(300, 0);
    expect(r.withinSpecAcrossWindow).toBe(true);
  });

  it('a flat series gives null with slope 0 — "no measurable degradation", not a failure', () => {
    const r = assessRealTimeStability({
      points: [
        { time: 0, value: 100 },
        { time: 90, value: 100 },
      ],
      initialValue: 100,
      maxPercentChange: 10,
    });
    expect(r.slopePerUnitTime).toBe(0);
    expect(r.shelfLife).toBeNull();
    // The pairing is what makes null readable: slope === 0 ⟺ shelfLife === null,
    // so the caller can distinguish "never degrades" from "could not compute".
    const wire = JSON.parse(JSON.stringify(r));
    expect(wire.shelfLife).toBeNull();
    expect(wire.slopePerUnitTime).toBe(0);
  });

  it('an Arrhenius fit extrapolated far outside its measured range returns null', () => {
    // Rate constants measured at 180 °C and 200 °C, extrapolated down to 25 °C.
    // The implied activation energy is physically absurd and the predicted
    // storage-temperature rate underflows to zero. The correct output is "no
    // number", not Infinity and not a fabricated shelf-life — the latter is
    // precisely the over-extrapolation ICH Q1E exists to constrain.
    const r = assessAcceleratedStability({
      points: [
        { temperatureC: 180, rateConstant: 1e-3 },
        { temperatureC: 200, rateConstant: 1e300 },
      ],
      storageTemperatureC: 25,
      degradationThreshold: 0.1,
    });
    expect(r.predictedRateAtStorage).toBe(0);
    expect(r.predictedShelfLife).toBeNull();
    expect(JSON.parse(JSON.stringify(r)).predictedShelfLife).toBeNull();
  });

  it('an ordinary accelerated study still returns a finite prediction', () => {
    // The guard above must not have turned the normal path into null.
    const r = assessAcceleratedStability({
      points: [
        { temperatureC: 25, rateConstant: 0.001 },
        { temperatureC: 37, rateConstant: 0.004 },
        { temperatureC: 50, rateConstant: 0.02 },
      ],
      storageTemperatureC: 4,
      degradationThreshold: 0.1,
    });
    expect(r.predictedShelfLife).not.toBeNull();
    expect(r.predictedShelfLife!).toBeGreaterThan(0);
    expect(Number.isFinite(r.predictedShelfLife!)).toBe(true);
  });
});

describe('MRMC reader sizing follows Obuchowski–Rockette', () => {
  // A pilot OR analysis with a modest AUC difference and reader covariance that
  // satisfies the required ordering σ²_ε ≥ Cov1 ≥ Cov2 ≥ Cov3 ≥ 0.
  const base: Omit<MrmcInput, 'nReaders'> = {
    aucDifference: 0.05,
    varTR: 0.001,
    varError: 0.002,
    cov1: 0.001,
    cov2: 0.0008,
    cov3: 0.0006,
    alpha: 0.05,
  };

  /** Var(θ̄₁ − θ̄₂) = (2/J)·[σ²_TR + σ²_ε − Cov1 + (J−1)(Cov2 − Cov3)], written out here. */
  const varFormula = (J: number) =>
    (2 / J) *
    (base.varTR + base.varError - base.cov1 + (J - 1) * (base.cov2 - base.cov3));

  it.each([2, 5, 10, 37, 100])('J=%i matches the variance expression', J => {
    expect(varianceOfModalityDifference({ ...base, nReaders: J })).toBeCloseTo(varFormula(J), 15);
  });

  it('J=5 is 0.00112 and λ = Δ²/Var = 2.2321, with ddf = J − 1', () => {
    // Hand-checkable: bracket = 0.001 + 0.002 − 0.001 + 4×0.0002 = 0.0028,
    // times 2/5 = 0.00112. λ = 0.05²/0.00112 = 2.232142857…
    const r = mrmcPower({ ...base, nReaders: 5 });
    expect(r.varianceOfDifference).toBeCloseTo(0.00112, 15);
    expect(r.lambda).toBeCloseTo(0.0025 / 0.00112, 10);
    expect(r.lambda).toBeCloseTo(2.2321428571, 9);
    expect(r.numeratorDf).toBe(1);
    expect(r.denominatorDf).toBe(4);
    expect(r.power).toBeCloseTo(0.212, 3);
  });

  it('reader covariance puts a FLOOR under the variance that more readers cannot beat', () => {
    // The structural result, and the one a reader study is actually designed
    // around. As J → ∞ the (2/J)·(J−1)(Cov2 − Cov3) term tends to 2(Cov2 − Cov3),
    // so the variance asymptotes to a positive constant rather than to zero.
    // Recruiting readers buys progressively nothing.
    const floor = 2 * (base.cov2 - base.cov3);
    // The residual above the floor is exactly (2/J)·[σ²_TR + σ²_ε − Cov1 − (Cov2 − Cov3)],
    // i.e. it decays as 1/J and never reaches zero. Pinning the RATE is stronger
    // than pinning the limit: a loose "close to the floor at large J" would also
    // pass for an implementation that converged to the floor from below, or at
    // the wrong speed.
    const residualCoefficient =
      2 * (base.varTR + base.varError - base.cov1 - (base.cov2 - base.cov3));
    expect(residualCoefficient).toBeCloseTo(0.0036, 15);
    for (const J of [10, 100, 1000, 1_000_000]) {
      const v = varianceOfModalityDifference({ ...base, nReaders: J });
      expect(v, `J=${J}`).toBeGreaterThan(floor);
      expect(v - floor, `J=${J}`).toBeCloseTo(residualCoefficient / J, 15);
    }
    // …hence λ is bounded above by Δ²/floor = 0.0025/0.0004 = 6.25.
    expect(mrmcPower({ ...base, nReaders: 500 }).lambda).toBeLessThan(0.0025 / floor);
  });

  it('so power rises with readers but saturates well short of 80%', () => {
    // 500 readers still cannot reach conventional power for this effect. A design
    // tool that implied otherwise would send a sponsor recruiting readers to fix
    // a problem readers cannot fix — the answer is more CASES, or a larger effect.
    let prev = 0;
    for (const J of [5, 10, 25, 50, 100, 500]) {
      const p = mrmcPower({ ...base, nReaders: J }).power;
      expect(p, `J=${J}`).toBeGreaterThan(prev);
      prev = p;
    }
    expect(prev).toBeCloseTo(0.696, 3);
    expect(prev).toBeLessThan(0.8);
  });

  it('removing the reader covariance removes the ceiling', () => {
    // The control for the test above: with Cov2 == Cov3 the floor is zero, the
    // variance decays as 2c/J, and ordinary power is reachable. This is what
    // makes the previous test a statement about the covariance structure rather
    // than about the noncentral-F machinery.
    const noFloor = { ...base, cov2: 0.0006 };
    expect(2 * (noFloor.cov2 - noFloor.cov3)).toBe(0);
    expect(mrmcPower({ ...noFloor, nReaders: 500 }).power).toBeGreaterThan(0.999);
  });

  it('mrmcReadersForPower returns an explicit null when the target is unreachable', () => {
    // Not 100, not the best power found, not a throw — null, plus the search
    // bound so the caller knows what was tried. Returning the largest J searched
    // would read as "100 readers will do", which is false and expensive.
    const r = mrmcReadersForPower({ ...base, targetPower: 0.9 });
    expect(r.nReaders).toBeNull();
    expect(r.power).toBeNull();
    expect(r.searchedUpTo).toBe(100);
    expect(r.targetPower).toBe(0.9);
    const wire = JSON.parse(JSON.stringify(r));
    expect(wire.nReaders).toBeNull();
    expect(wire.searchedUpTo).toBe(100);
  });

  it('and the smallest sufficient J when it is reachable', () => {
    const r = mrmcReadersForPower({ ...base, cov2: 0.0006, targetPower: 0.9 });
    expect(r.nReaders).toBe(19);
    expect(r.power!).toBeGreaterThanOrEqual(0.9);
    expect(r.searchedUpTo).toBe(19);
    // Minimality: one fewer reader must fall short, or the search returned a
    // number that is merely sufficient rather than the smallest sufficient.
    expect(mrmcPower({ ...base, cov2: 0.0006, nReaders: 18 }).power).toBeLessThan(0.9);
  });

  it('rejects covariances that violate the OR ordering rather than producing a variance', () => {
    // σ²_ε ≥ Cov1 ≥ Cov2 ≥ Cov3 ≥ 0 is not a convention — violating it can make
    // the variance expression negative, at which point λ is negative and the
    // "power" is meaningless rather than merely wrong.
    expect(() => mrmcPower({ ...base, nReaders: 5, cov1: 0.003 })).toThrow(); // Cov1 > σ²_ε
    expect(() => mrmcPower({ ...base, nReaders: 5, cov3: 0.0009 })).toThrow(); // Cov3 > Cov2
    expect(() => mrmcPower({ ...base, nReaders: 5, cov3: -0.0001 })).toThrow(); // Cov3 < 0
    expect(() => mrmcPower({ ...base, nReaders: 1 })).toThrow(); // J < 2
    expect(() => mrmcPower({ ...base, nReaders: 5.5 })).toThrow(); // non-integer J
    expect(() => mrmcReadersForPower({ ...base, targetPower: 1 })).toThrow();
  });
});
