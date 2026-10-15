/**
 * AnA sizing engines — pinned to published reference values.
 *
 * Covers the two sizing paths AnA reaches through its tools:
 *   - server/services/ana-biostats/computation-engine.ts (compute_sample_size,
 *     analyze_missing_data_impact, the biostats workflows)
 *   - server/services/ana/study-design.ts (advise_study_design)
 *
 * Every expected value below is quoted from a published method and was
 * reproduced independently (R power.t.test / scipy) by the 2026-10-05
 * statistical audit — not from this repository's code. Where the expected value
 * is a closed form, the closed form is written next to it.
 *
 * Eight defects were found by that audit; each has a case here that FAILED
 * against the pre-fix engine (the red run is recorded in the change that added
 * this file) and the already-correct cases are pinned beside them so that a
 * fix to one path cannot quietly move another.
 */
import { describe, it, expect } from 'vitest';
import { ComputationEngine } from '../../server/services/ana-biostats/computation-engine';
import type { StatisticalInput } from '../../server/services/ana-biostats/types';
import { estimateSampleSize } from '../../server/services/ana/study-design';
import { normalCdf, normalQuantile } from '../../server/services/stats/normal';

const engine = new ComputationEngine();

const base: StatisticalInput = {
  clientTrack: 'biotech_pharma',
  studyType: 'superiority',
  objectiveType: 'efficacy',
  endpointType: 'continuous',
  alpha: 0.05,
  powerTarget: 0.8,
  effectSize: 0.5,
  variance: 1,
  attritionRate: 0,
  allocationRatio: 1,
  numberOfGroups: 2,
};

const z975 = normalQuantile(0.975);

// ─────────────────────────────────────────────────────────────────────────────
// Already correct before the audit — pinned so the fixes cannot move them.
// ─────────────────────────────────────────────────────────────────────────────
describe('already-correct cases stay correct', () => {
  it('binary 0.5 vs 0.7 → 93 per group (Fleiss, pooled-variance z; 92.999 → 93)', () => {
    const r = engine.compute({ ...base, endpointType: 'binary', effectSize: 0.2, controlRate: 0.5, treatmentRate: 0.7 });
    expect(r.sampleSize.perGroup).toBe(93);
    // pooled-z power at 93/group = 0.80001 (scipy)
    expect(r.power).toBeCloseTo(0.80001, 3);
  });

  it('time-to-event HR 0.7 → 247 events (Schoenfeld 1983: 4(z.975+z.80)²/ln(0.7)² = 246.79 → 247)', () => {
    const r = engine.compute({ ...base, endpointType: 'time_to_event', effectSize: 0.3, eventRate: 1 });
    expect(/events=(\d+)/.exec(r.formula)?.[1]).toBe('247');
  });

  it('continuous non-inferiority M=0.5, diff 0, one-sided 0.025, power 0.9 → 85 (Chow, Shao & Wang §3.2: 84.06 → 85)', () => {
    const r = engine.compute({ ...base, studyType: 'non_inferiority', effectSize: 0, nonInferiorityMargin: -0.5, powerTarget: 0.9 });
    expect(r.sampleSize.perGroup).toBe(85);
    // It is a normal-approximation z formula and must say so, not "t-test".
    expect(r.method.toLowerCase()).toContain('normal approximation');
    expect(r.method.toLowerCase()).not.toContain('t-test');
  });

  it('study-design advisor: binary 0.5 vs 0.7 → 93, HR 0.7 → 247 events, NI → 85', () => {
    expect(estimateSampleSize({ endpointFamily: 'binary', p1: 0.5, p2: 0.7 }).perArm).toBe(93);
    expect(estimateSampleSize({ endpointFamily: 'time_to_event', hazardRatio: 0.7 }).events).toBe(247);
    expect(
      estimateSampleSize({ endpointFamily: 'continuous', goal: 'non_inferiority', alpha: 0.025, power: 0.9, meanDifference: 0, sd: 1, margin: 0.5 }).perArm,
    ).toBe(85);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Defect 1 — equivalence (TOST). Chow, Shao & Wang (2008) §3.2.3, true
// difference 0: n = 2σ²(z₁₋α + z₁₋β/2)²/Δ² = 2(1.6449 + 1.2816)²/0.25 = 68.51 → 69.
// ─────────────────────────────────────────────────────────────────────────────
describe('defect 1: TOST equivalence', () => {
  it('engine: margin ±0.5, σ=1, diff 0, α=0.05, power 0.80 → 69 per group (was 63)', () => {
    const r = engine.compute({ ...base, studyType: 'equivalence', effectSize: 0, equivalenceMargin: 0.5 });
    expect(r.sampleSize.perGroup).toBe(69);
  });

  it('engine: reported power is the TOST power, 2Φ(Δ/SE − z₁₋α) − 1 = 0.8036 at n=69 (was one-sided 0.836)', () => {
    const r = engine.compute({ ...base, studyType: 'equivalence', effectSize: 0, equivalenceMargin: 0.5 });
    expect(r.power).toBeCloseTo(0.8036, 3);
  });

  it('engine, binary: p1 = p2 = 0.80, margin ±0.10 → (z.95 + z.90)²·(0.16+0.16)/0.1² = 274.04 → 275 (was sized as superiority on p2 − p1 = 0)', () => {
    // Chow, Shao & Wang (2008) §4.2.3, two-proportion TOST with equal true rates.
    const r = engine.compute({ ...base, endpointType: 'binary', studyType: 'equivalence', effectSize: 0, controlRate: 0.8, treatmentRate: 0.8, equivalenceMargin: 0.1 });
    expect(r.sampleSize.perGroup).toBe(275);
  });

  it('study-design advisor: same question → 69 per arm (was 50)', () => {
    const r = estimateSampleSize({ endpointFamily: 'continuous', goal: 'equivalence', meanDifference: 0, sd: 1, margin: 0.5 });
    expect(r.perArm).toBe(69);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Defect 2 — 2×2 crossover. Julious (2004) Stat Med 23:1921, normal form:
// N_total = 2σ²(1−ρ)(z.975 + z.80)²/δ² = 2·0.5·7.849/0.25 = 31.40 → 32.
// ─────────────────────────────────────────────────────────────────────────────
describe('defect 2: 2×2 crossover total N', () => {
  it('d=0.5, σ=1, ρ=0.5, α .05 two-sided, power .8 → 32 subjects in total (was 64)', () => {
    const r = engine.computeCrossover({ ...base, crossoverPeriods: 2, withinSubjectCorrelation: 0.5 });
    expect(r.totalSubjects).toBe(32);
  });

  it('refuses a correlation it was not given rather than assuming one', () => {
    expect(() => engine.computeCrossover({ ...base, crossoverPeriods: 2 })).toThrow(/correlation/i);
  });

  it('refuses a period count it has no formula for rather than multiplying N', () => {
    expect(() => engine.computeCrossover({ ...base, crossoverPeriods: 3, withinSubjectCorrelation: 0.5 })).toThrow(/2×2|two-period|2-period/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Defect 3 — AUC vs a fixed null. Hanley & McNeil (1982) Radiology 143:29,
// Var(Â) = [A(1−A) + (n−1)(Q1−A²) + (n−1)(Q2−A²)]/n², Q1 = A/(2−A),
// Q2 = 2A²/(1+A), n diseased = n non-diseased. Smallest n with
// z.975·SE₀(n) + z.80·SE₁(n) ≤ A − A₀: 9.19 → 10 per group.
// ─────────────────────────────────────────────────────────────────────────────
describe('defect 3: AUC sample size (Hanley–McNeil)', () => {
  it('AUC 0.85 vs 0.50, α .05, power .8 → 10 per group (variance no longer divided by 100)', () => {
    const r = engine.computeAUCComparison({ ...base, clientTrack: 'diagnostics_ivd', endpointType: 'auc_roc', aucTarget: 0.85, aucNull: 0.5 });
    expect(r.aucSampleSize).toBe(10);
  });

  it('refuses when no target AUC is given rather than assuming 0.85', () => {
    expect(() => engine.computeAUCComparison({ ...base, clientTrack: 'diagnostics_ivd', endpointType: 'auc_roc' })).toThrow(/aucTarget/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Defect 4 — diagnostic sensitivity sizing. One-sample binomial test of
// H0: Se ≤ goal (Chow, Shao & Wang §4.1), delegated to the canonical
// stats/diagnostic-design.sizeSingleProportion: Se 0.90 vs goal 0.85,
// one-sided 0.025, power 0.80 → [1.96√(.85·.15) + 0.8416√(.9·.1)]²/0.05² = 362.8 → 363.
// ─────────────────────────────────────────────────────────────────────────────
describe('defect 4: diagnostic sensitivity sizing', () => {
  const dx: StatisticalInput = {
    ...base,
    clientTrack: 'diagnostics_ivd',
    studyType: 'diagnostic_accuracy',
    objectiveType: 'diagnostic_accuracy',
    endpointType: 'sensitivity_specificity',
    effectSize: 0.9,
    sensitivity: 0.9,
    specificity: 0.9,
    prevalence: 0.5,
    nonInferiorityMargin: 0.05,
    numberOfGroups: 1,
  };

  it('Se 0.90 vs performance goal 0.85 → 363 diseased subjects (was 139 from a hard-coded 5% half-width)', () => {
    const r = engine.compute(dx);
    expect(r.diagnosticMetrics?.sampleSizeForSensitivity).toBe(363);
    expect(r.method.toLowerCase()).toContain('performance goal');
  });

  it('the margin is an input: a 0.10 margin (goal 0.80) → [1.96·0.4 + 0.8416·0.3]²/0.1² = 107.4 → 108', () => {
    const r = engine.compute({ ...dx, nonInferiorityMargin: 0.1 });
    expect(r.diagnosticMetrics?.sampleSizeForSensitivity).toBe(108);
  });

  it('refuses when no margin / performance goal is given rather than assuming 5%', () => {
    expect(() => engine.compute({ ...dx, nonInferiorityMargin: undefined })).toThrow(/margin/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Defect 5 — Dunnett. Dunnett (1955) JASA 50:1096, two-sided, k = 3 treatments
// vs one control, equal allocation (ρ = 0.5), df = ∞: c = 2.3490, so the
// per-comparison α is 2(1 − Φ(2.3490)) = 0.01883. Šidák's 0.01695 is not it.
// ─────────────────────────────────────────────────────────────────────────────
describe('defect 5: Dunnett is Dunnett', () => {
  it('3 vs control, α .05 → per-comparison α 0.01883 (was Šidák 0.01695)', () => {
    const r = engine.computeMultiplicity({ ...base, numberOfEndpoints: 3, multiplicityMethod: 'dunnett' });
    expect(r.effectiveFamilyAlpha).toBeCloseTo(0.018826, 4);
    expect(Math.abs(r.effectiveFamilyAlpha - 0.016952)).toBeGreaterThan(1e-3);
  });

  it('sample-size impact scales with (z₁₋α* + z₁₋β)², not z₁₋α*² — Bonferroni ×3 → +33%', () => {
    // ((z(1−.05/6) + z.8)/(z.975 + z.8))² − 1 = 0.3338
    const r = engine.computeMultiplicity({ ...base, numberOfEndpoints: 3, multiplicityMethod: 'bonferroni' });
    expect(r.sampleSizeImpact).toBe(33);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Defect 6 — kappa. The previous variance had a +0.01 term and a hard-coded
// null κ₀ = 0.40 with no published basis. The input contract carries neither
// κ₀ nor the marginal rating prevalence that Donner & Eliasziw (1992) needs, so
// the engine refuses instead of answering.
// ─────────────────────────────────────────────────────────────────────────────
describe('defect 6: kappa sizing refuses rather than fudging', () => {
  it('computeAgreementKappa throws an explicit not-supported refusal', () => {
    expect(() =>
      engine.computeAgreementKappa({ ...base, clientTrack: 'diagnostics_ivd', studyType: 'agreement', agreementTarget: 0.8 }),
    ).toThrow(/not supported/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Defect 7 — silent defaults.
// ─────────────────────────────────────────────────────────────────────────────
describe('defect 7: no silent substitution, power per endpoint type', () => {
  it('time-to-event with effectSize ≥ 1 (HR ≤ 0) refuses instead of sizing HR = 0.5', () => {
    expect(() => engine.compute({ ...base, endpointType: 'time_to_event', effectSize: 1.2, eventRate: 0.6 })).toThrow(/hazard ratio/i);
  });

  it('binary missing-data impact uses the two-proportion power (0.7035 at 74/group), not the continuous formula', () => {
    const input: StatisticalInput = { ...base, endpointType: 'binary', effectSize: 0.2, controlRate: 0.5, treatmentRate: 0.7, variance: undefined };
    const b = engine.compute(input); // 93/group, 186 total
    const impact = engine.computeMissingDataImpact({ ...input, expectedMissingRate: 0.2, missingDataMethod: 'complete_case' }, b);
    expect(impact.effectiveSampleSize).toBe(148);
    // pooled-z power at 74/group: Φ((0.2√74 − z.975√(2·.6·.4)) / √(.25+.21))
    const expected = normalCdf((0.2 * Math.sqrt(74) - z975 * Math.sqrt(2 * 0.6 * 0.4)) / Math.sqrt(0.25 + 0.21));
    expect(impact.adjustedPower).toBeCloseTo(expected, 6);
    expect(impact.adjustedPower).toBeCloseTo(0.7035, 3);
  });

  it('time-to-event missing-data impact uses the Schoenfeld power at the events the smaller N yields', () => {
    const input: StatisticalInput = { ...base, endpointType: 'time_to_event', effectSize: 0.3, eventRate: 1, variance: undefined };
    const b = engine.compute(input); // 247 events → 124/group, 248 total
    const impact = engine.computeMissingDataImpact({ ...input, expectedMissingRate: 0.2, missingDataMethod: 'complete_case' }, b);
    // 198 evaluable → 99/group → 198 events; power = Φ(√(E)/2·|ln 0.7| − z.975)
    const expected = normalCdf((Math.sqrt(198) / 2) * Math.abs(Math.log(0.7)) - z975);
    expect(impact.adjustedPower).toBeCloseTo(expected, 6);
  });

  it('time-to-event reports the Schoenfeld power at its events (0.8003 at 247), not the target echoed', () => {
    const r = engine.compute({ ...base, endpointType: 'time_to_event', effectSize: 0.3, eventRate: 1 });
    expect(r.power).toBeCloseTo(0.80034, 4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Defect 8 — a method called a t-test is sized as a t-test. R power.t.test
// (two-sided, two-sample, σ=1): d = 0.5 → n = 63.77 → 64, power 0.80146;
// d = 0.3 → 175.4 → 176. The normal approximation gives 63 and 175.
// ─────────────────────────────────────────────────────────────────────────────
describe('defect 8: two-sample t-test sized with the t distribution', () => {
  it('d = 0.5 → 64 per group (was 63), power 0.8015 at 64', () => {
    const r = engine.compute(base);
    expect(r.method).toContain('t-test');
    expect(r.sampleSize.perGroup).toBe(64);
    expect(r.power).toBeCloseTo(0.80146, 4);
  });

  it('d = 0.3 → 176 per group (was 175)', () => {
    expect(engine.compute({ ...base, effectSize: 0.3 }).sampleSize.perGroup).toBe(176);
  });
});
