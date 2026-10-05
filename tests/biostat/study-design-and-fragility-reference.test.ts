/**
 * Study-design sizing and assumption fragility — pinned to published methods.
 *
 * ── What these pin, and against what ────────────────────────────────────────
 * Three defects an independent audit found, each a number a customer reads:
 *
 *   1. `study-design/sample-size.solveSampleSize` sized binary and time-to-event
 *      endpoints with the unit-variance standardized-difference formula.
 *        • Two proportions 0.5 vs 0.7, α .05 two-sided, power .8 — the pooled-
 *          variance normal approximation (Fleiss, Levin & Paik 2003 §4.2, no
 *          continuity correction) gives n = 92.999 → **93 per arm** (102.76 →
 *          **103** with the Fleiss–Tytun–Ury continuity correction). The engine
 *          returned 393 — the size for a STANDARDIZED difference of 0.2.
 *        • HR 0.7, 1:1, α .05 two-sided, power .8 — Schoenfeld (1983):
 *          D = 4(z₀.₉₇₅ + z₀.₈)² / (ln 0.7)² = 246.79 → **247 events**. The
 *          engine returned 248 and called them SUBJECTS. Subjects follow from
 *          events only through an event probability; without one they are unknown.
 *
 *   2. `biostatistics-judgment/assumption-fragility` estimated power at 80% of the
 *      planned effect as power × 0.64. For a z test the noncentrality is linear in
 *      the effect, so the exact value is
 *          power' = Φ(0.8·λ − z₁₋α/₂) + Φ(−0.8·λ − z₁₋α/₂),
 *      λ the noncentrality at which the design reaches its stated power. For a
 *      design at 80% power, α .05: 0.6108 (the shortcut said 0.512). The same
 *      module scaled power by 1/√1.5 for a 50% variance increase (exact: λ/√1.5,
 *      0.6284 at 80% power, shortcut 0.653).
 *
 *   3. `biostatistics-bridge/design-adapter` told the user "SD = effect" when the
 *      engine uses SD = 1 for a continuous endpoint with no variance.
 *
 * Every expected value below is either derived in the test from Φ / Φ⁻¹ (the
 * canonical `stats/normal`, verified to full precision elsewhere) or quoted with
 * its source. Reference values were cross-checked against R 4.x:
 * `power.prop.test(p1=.5,p2=.7,power=.8)` → n = 92.99884, and
 * `4*(qnorm(.975)+qnorm(.8))^2/log(.7)^2` → 246.7871.
 */

import { describe, it, expect } from 'vitest';
import { normalCdf, normalQuantile } from '../../server/services/stats/normal';
import {
  solveSampleSize,
  sampleSizeForPower,
} from '../../server/services/study-design/sample-size';
import type { EffectPrior } from '../../server/services/study-design/evidence-prior';
import type { StudyDesign } from '../../server/services/study-design/study-design-types';
import { judgeAssumptionFragility } from '../../server/services/biostatistics-judgment/assumption-fragility';
import type { StudyDesignInput } from '../../server/services/biostatistics-judgment/types';
import { studyDesignToStatisticalInput } from '../../server/services/biostatistics-bridge/design-adapter';

const Z975 = normalQuantile(0.975);
const Z80 = normalQuantile(0.8);

/** A point-mass prior: assurance collapses to power, so both sizes must agree. */
function pointPrior(mean: number): EffectPrior {
  return { mean, sd: 0, basis: 'assumption', observations: [], caveats: [], sources: [] };
}

function design(
  type: StudyDesign['endpoints'][number]['type'],
  powerAssumptions?: NonNullable<StudyDesign['statisticalPlan']>['powerAssumptions'],
  plannedSampleSize?: number,
): StudyDesign {
  return {
    title: 'Reference fixture',
    phase: '3',
    indication: 'reference',
    objectives: [{ level: 'primary', order: 1, text: 'Superiority', endpointName: 'Primary' }],
    estimands: [],
    endpoints: [{ name: 'Primary', role: 'primary', type, definition: 'reference endpoint' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: { targetDescription: 'adults', analysisPopulations: [{ kind: 'ITT', definition: 'all' }], eligibility: [] },
    arms: [
      { name: 'Drug', interventions: [{ name: 'Drug', role: 'investigational' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo' }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double' },
    statisticalPlan: { alpha: 0.05, oneSided: false, plannedAnalyses: [], powerAssumptions, plannedSampleSize },
  } as StudyDesign;
}

// ─── 1. study-design sizing ──────────────────────────────────────────────────

describe('solveSampleSize — binary endpoint (pooled-variance normal approximation)', () => {
  it('sizes 0.5 vs 0.7 at 93 per arm, and states the method and the continuity-corrected 103', () => {
    const r = solveSampleSize(design('binary', { eventRate: 0.5 }), pointPrior(0.2), { targetPower: 0.8 });
    // Closed form, derived here: n = [z√(2p̄q̄) + z_β√(p₀q₀+p₁q₁)]² / Δ²
    const n = (Z975 * Math.sqrt(2 * 0.6 * 0.4) + Z80 * Math.sqrt(0.25 + 0.21)) ** 2 / 0.04;
    expect(n).toBeCloseTo(92.99884482754564, 9);
    expect(r.nPerArmForPower).toBe(93);
    expect(r.totalForPower).toBe(186);
    expect(r.unit).toBe('subjects');
    expect(r.sizingMethod).toMatch(/pooled/i);
    expect(r.sizingMethod).toMatch(/no continuity correction/i);
    expect(r.binary).toMatchObject({ controlRate: 0.5, treatmentRate: 0.7, nPerArmForPowerContinuityCorrected: 103 });
    // A point prior: assurance is power, so the assurance size is the power size.
    expect(r.nPerArmForAssurance).toBe(93);
  });

  it('power at 93 per arm is the pooled-z power 0.800005', () => {
    const r = solveSampleSize(design('binary', { eventRate: 0.5 }, 186), pointPrior(0.2), { targetPower: 0.8 });
    expect(r.atPlannedN).not.toBeNull();
    expect(r.atPlannedN!.nPerArm).toBe(93);
    // Upper rejection region only (the engine's effective one-sided α), derived here.
    const upper = normalCdf((0.2 * Math.sqrt(93) - Z975 * Math.sqrt(0.48)) / Math.sqrt(0.46));
    expect(r.atPlannedN!.power).toBeCloseTo(upper, 12);
    // The auditor's two-sided value 0.8000055748 adds the opposite tail, Φ(−4.84) ≈ 6.3e-7.
    const lower = normalCdf((-0.2 * Math.sqrt(93) - Z975 * Math.sqrt(0.48)) / Math.sqrt(0.46));
    expect(upper + lower).toBeCloseTo(0.8000055747840035, 9);
  });

  it('refuses to size a binary risk difference without a control rate rather than standardizing it', () => {
    expect(() => solveSampleSize(design('binary'), pointPrior(0.2), { targetPower: 0.8 })).toThrow(/control/i);
  });
});

describe('solveSampleSize — time-to-event endpoint (Schoenfeld events)', () => {
  const theta = -Math.log(0.7); // benefit-oriented log hazard-ratio reduction

  it('returns 247 EVENTS for HR 0.7 and leaves subjects unknown without an event probability', () => {
    const D = (4 * (Z975 + Z80) ** 2) / Math.log(0.7) ** 2;
    expect(D).toBeCloseTo(246.7871045473585, 9);
    const r = solveSampleSize(design('time_to_event'), pointPrior(theta), { targetPower: 0.8 });
    expect(r.unit).toBe('events');
    expect(r.events).not.toBeNull();
    expect(r.events!.forPower).toBe(247);
    expect(r.events!.forAssurance).toBe(247);
    expect(r.events!.eventProbability).toBeNull();
    // 248 subjects was the defect: an event count labelled as subjects.
    expect(r.nPerArmForPower).toBeNull();
    expect(r.totalForPower).toBeNull();
    expect(r.caveats.join(' ')).toMatch(/event probability/i);
  });

  it('is sign-symmetric in the effect (ln 0.7 sizes the same 247 events)', () => {
    const r = solveSampleSize(design('time_to_event'), pointPrior(Math.log(0.7)), { targetPower: 0.8 });
    expect(r.events!.forPower).toBe(247);
  });

  it('converts events to subjects only through a supplied event probability', () => {
    const r = solveSampleSize(design('time_to_event', { eventRate: 0.7 }), pointPrior(theta), { targetPower: 0.8 });
    expect(r.events!.forPower).toBe(247);
    expect(r.events!.eventProbability).toBe(0.7);
    // 247 / 0.7 = 352.86 → 353 subjects → 177 per arm (1:1).
    expect(r.nPerArmForPower).toBe(177);
    expect(r.totalForPower).toBe(354);
  });
});

describe('sampleSizeForPower — continuous, labelled as the normal approximation it is', () => {
  it('gives the z-approximation 62.79 → 63 per arm for d = 0.5 (the t-based answer would be 64)', () => {
    expect(2 * ((Z975 + Z80) / 0.5) ** 2).toBeCloseTo(62.79103787479271, 9);
    expect(sampleSizeForPower(0.5, 0.025, 0.8)).toBe(63);
    const r = solveSampleSize(design('continuous'), pointPrior(0.5), { targetPower: 0.8 });
    expect(r.nPerArmForPower).toBe(63);
    expect(r.unit).toBe('subjects');
    expect(r.sizingMethod).toMatch(/normal approximation/i);
    expect(r.sizingMethod).not.toMatch(/t-test/i);
  });
});

// ─── 2. assumption fragility ────────────────────────────────────────────────

/** Exact two-sided z-test power at a scaled noncentrality, derived independently. */
function exactScaledPower(power: number, alpha: number, scale: number): number {
  const z = normalQuantile(1 - alpha / 2);
  const pw = (l: number) => normalCdf(l - z) + normalCdf(-l - z);
  let lo = 0;
  let hi = z + normalQuantile(power) + 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (pw(mid) < power) lo = mid; else hi = mid;
  }
  return pw(scale * lo);
}

const BASE: StudyDesignInput = {
  projectId: 'ref',
  studyType: 'superiority',
  phase: 'III',
  indication: 'reference',
  endpointType: 'continuous',
  primaryEndpoint: 'change',
  statisticalMethod: 'ancova',
  alpha: 0.05,
  powerTarget: 0.8,
  effectSizeAssumption: 0.5,
  allocationRatio: 1,
  attritionAssumption: 0.2,
  computedSampleSize: 160,
  computedPower: 0.8,
  variance: 1,
};

function factor(input: StudyDesignInput, parameter: string) {
  const f = judgeAssumptionFragility(input).sensitivityFactors.find((x) => x.parameter === parameter);
  expect(f, parameter).toBeDefined();
  return f!;
}

describe('assumption fragility — exact z-test power under each shift', () => {
  it('power at 80% of the planned effect is 61.1% for an 80%-powered design, not 51%', () => {
    expect(exactScaledPower(0.8, 0.05, 0.8)).toBeCloseTo(0.61077, 4);
    // The auditor's one-tailed form, Φ(0.8(z.975+z.8) − z.975), agrees to 1e-4.
    expect(normalCdf(0.8 * (Z975 + Z80) - Z975)).toBeCloseTo(0.6107614515489888, 12);
    const f = factor(BASE, 'effect_size');
    expect(f.description).toContain('61.1%');
    expect(f.description).not.toMatch(/\b51%/);
    expect(f.impact).toBe('high');
  });

  it('a 90%-powered design keeps 73.7% at 80% of the effect: marginal, not broken (the shortcut said 58%)', () => {
    const p = exactScaledPower(0.9, 0.05, 0.8);
    expect(p).toBeGreaterThan(0.70);
    expect(p).toBeLessThan(0.80);
    const f = factor({ ...BASE, computedPower: 0.9 }, 'effect_size');
    expect(f.description).toContain(`${(p * 100).toFixed(1)}%`);
    expect(f.impact).toBe('moderate');
  });

  it('a 50% variance increase scales the noncentrality by 1/√1.5 (62.8% from 80%, the shortcut said 65%)', () => {
    const p = exactScaledPower(0.8, 0.05, 1 / Math.sqrt(1.5));
    expect(p).toBeCloseTo(0.62836, 4);
    const f = factor(BASE, 'variance');
    expect(f.description).toContain(`${(p * 100).toFixed(1)}%`);
    expect(f.impact).toBe('high');
  });

  it('variance: an 86%-powered design falls below 70% (exact 69.9%; the shortcut said 70.2% and passed it)', () => {
    const p = exactScaledPower(0.86, 0.05, 1 / Math.sqrt(1.5));
    expect(p).toBeLessThan(0.70);
    expect(factor({ ...BASE, computedPower: 0.86 }, 'variance').impact).toBe('high');
  });

  it('doubling attrition is reported as the exact power at the reduced evaluable n', () => {
    // 20% → 40% dropout: evaluable n × 0.6/0.8, noncentrality × √0.75.
    const p = exactScaledPower(0.8, 0.05, Math.sqrt(0.6 / 0.8));
    const f = factor(BASE, 'attrition');
    expect(f.description).toContain(`${(p * 100).toFixed(1)}%`);
  });

  it('time-to-event: a 20% weaker effect is a 20% smaller log hazard ratio (HR 0.7 → 0.7^0.8)', () => {
    const f = factor({ ...BASE, endpointType: 'time_to_event', hazardRatio: 0.7, effectSizeAssumption: 0.7 }, 'effect_size');
    expect(f.breakingPoint).toBeCloseTo(0.7 ** 0.8, 6);
  });

  it('does not invent a number for an equivalence (TOST) design', () => {
    const f = factor({ ...BASE, studyType: 'equivalence' }, 'effect_size');
    expect(f.description).toMatch(/not computed/i);
    expect(f.breakingPoint).toBeNull();
  });
});

// ─── 3. design adapter message ──────────────────────────────────────────────

describe('design adapter — the variance default it reports is the one the engine applies', () => {
  it('says SD = 1, not SD = effect', () => {
    const d = design('continuous', { effectSize: 0.4 });
    const gap = studyDesignToStatisticalInput(d).gaps.find((g) => g.field === 'variance');
    expect(gap).toBeDefined();
    expect(gap!.message).toMatch(/SD\s*=\s*1\b/);
    expect(gap!.message).not.toMatch(/SD\s*=\s*effect/i);
  });
});
