/**
 * Adaptive-trial interim statistics and the AnA adaptive-design boundaries —
 * pinned to published values and to independent integrals.
 *
 * ── What this file covers ────────────────────────────────────────────────────
 *   server/services/adaptive-trial-operations-service.ts  (/api/biostat/adaptive/*)
 *   server/services/trial-statistics/trial-statistics-knowledge.ts
 *     → designAdaptiveDesign, which backs the AnA tool `design_adaptive_design`.
 *
 * Before this file, both carried their own boundary math: a nominal
 * z_{1−Δα/2} per look (ignoring the correlation between looks and halving a
 * one-sided α), recomputed for each interim as if it were the first look, on a
 * normal CDF that fed |x| to erf without dividing by √2 (Φ(1.96) = 0.981).
 * Both now delegate to the canonical engine (stats/group-sequential-oc.ts,
 * stats/normal.ts). These tests pin the results so neither can drift back.
 *
 * ── Provenance of the expected values ───────────────────────────────────────
 *   • Lan–DeMets O'Brien–Fleming spending, one-sided α = 0.025:
 *       α*(0.5) = 2(1 − Φ(z_{0.9875}/√0.5)) = 0.0015253 (gsDesign::sfLDOF);
 *       2 equally spaced looks → 2.963 / 1.969; 3 looks → 3.710 / 2.511 / 1.993
 *       (gsDesign::gsDesign(k, test.type = 1, sfu = sfLDOF)).
 *   • Lan–DeMets Pocock spending, one-sided α = 0.025, 2 looks → 2.157 / 2.201
 *       (gsDesign sfu = sfLDPocock).
 *   • The 2-look boundaries are ALSO re-derived here independently of every
 *     production module: P(Z₁ < b₁, Z₂ < b₂) with corr = √(t₁/t₂) is a 1-D
 *     integral ∫_{−∞}^{b₁} φ(x) Φ((b₂ − ρx)/√(1−ρ²)) dx, done by Simpson's rule
 *     against a local erf. A formula error in the engine cannot also be in that.
 *   • Conditional power, B-value form (Lan & Wittes 1988; Jennison & Turnbull
 *     2000, §10.2): with Z_t at information fraction t, final critical value c
 *     and drift θ = E[Z₁],
 *         CP(θ) = 1 − Φ((c − Z_t√t − θ(1 − t)) / √(1 − t)).
 *     Z = 2.0, t = 0.5, c = 1.959964: current trend (θ = Z_t/√t) → 0.8903,
 *     H0 (θ = 0) → 0.2201.
 *   • Predictive power (Spiegelhalter, Freedman & Blackburn 1986; Jennison &
 *     Turnbull §10.3), flat prior on θ: posterior θ | Z_t ~ N(Z_t/√t, 1/t), so
 *         PP = Φ((Z_t − c√t) / √(1 − t)),
 *     → 0.8074 at the same inputs. Verified below by integrating CP(θ) over the
 *     posterior numerically — for the flat prior and for an informative one.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── A minimal in-memory stand-in for drizzle, enough for createPlan and
//    ingestInterimSnapshot. Rows are served per table by `state.rowsFor`.
const state = vi.hoisted(() => ({
  rowsFor: (_table: unknown): any[] => [],
  inserted: [] as Array<{ table: unknown; values: any }>,
}));

vi.mock('../../server/db', () => {
  const thenable = (rows: any[]): any => {
    const p: any = Promise.resolve(rows);
    p.where = () => thenable(rows);
    p.orderBy = () => thenable(rows);
    return p;
  };
  return {
    db: {
      select: () => ({ from: (table: unknown) => thenable(state.rowsFor(table)) }),
      insert: (table: unknown) => ({
        values: (values: any) => ({
          returning: async () => {
            state.inserted.push({ table, values });
            return [{ id: state.inserted.length, ...values }];
          },
        }),
      }),
      update: () => ({ set: () => ({ where: async () => [] }) }),
    },
  };
});

import { adaptiveTrialPlans, interimDataSnapshots } from '../../shared/schema';
import {
  adaptiveTrialOperationsService,
  calculateSpendingBoundaries,
  computeConditionalPower,
  conditionalPowerScenarios,
  computePredictivePower,
} from '../../server/services/adaptive-trial-operations-service';
import { designAdaptiveDesign } from '../../server/services/trial-statistics/trial-statistics-knowledge';
import {
  solveSpendingBoundaries,
  computeOperatingCharacteristic,
} from '../../server/services/stats/group-sequential-oc';

// ── Independent reference machinery (no production imports) ────────────────

/** erf by Abramowitz & Stegun 7.1.26 on x/√2 — independent of stats/normal. */
function refPhi(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}
const refPdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

/** Simpson's rule on [a, b] with n (even) panels. */
function simpson(f: (x: number) => number, a: number, b: number, n = 4000): number {
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return (s * h) / 3;
}

/** One-sided P(reject H0) of a 2-look design, by direct bivariate integration. */
function twoLookTypeIError(t1: number, b1: number, b2: number): number {
  const rho = Math.sqrt(t1);
  const cont = simpson(x => refPdf(x) * refPhi((b2 - rho * x) / Math.sqrt(1 - rho * rho)), -10, b1);
  return 1 - cont;
}

/** CP(θ) in the B-value form, written out independently of the service. */
function refCP(z: number, t: number, c: number, theta: number): number {
  return 1 - refPhi((c - z * Math.sqrt(t) - theta * (1 - t)) / Math.sqrt(1 - t));
}

/** Predictive power = ∫ CP(θ) dPosterior(θ), by quadrature. Normal prior N(m0, s0²); s0 = ∞ is flat. */
function refPredictivePower(z: number, t: number, c: number, m0: number, s0: number): number {
  const b = z * Math.sqrt(t);
  const prec = (Number.isFinite(s0) ? 1 / (s0 * s0) : 0) + t;
  const mean = ((Number.isFinite(s0) ? m0 / (s0 * s0) : 0) + b) / prec;
  const sd = 1 / Math.sqrt(prec);
  return simpson(th => refPdf((th - mean) / sd) / sd * refCP(z, t, c, th), mean - 10 * sd, mean + 10 * sd);
}

const Z975 = 1.959963984540054;

// ═════════════════════════════════════════════════════════════════════════════

describe('adaptive service: spending boundaries are the canonical, correlation-aware ones', () => {
  it("LD-O'Brien–Fleming, 2 looks, one-sided α = 0.025 → 2.963 / 1.969, α*(0.5) = 0.0015253", () => {
    const b = calculateSpendingBoundaries([0.5, 1], 0.025, 'obrien-fleming');
    expect(b.cumulativeAlpha[0]).toBeCloseTo(0.0015253, 6);
    expect(b.criticalValues[0]).toBeCloseTo(2.963, 2);
    expect(b.criticalValues[1]).toBeCloseTo(1.969, 2);
    // Independent bivariate integral: the solved pair spends exactly α.
    expect(twoLookTypeIError(0.5, b.criticalValues[0], b.criticalValues[1])).toBeCloseTo(0.025, 4);
  });

  it('LD-Pocock, 2 looks, one-sided α = 0.025 → 2.157 / 2.201', () => {
    const b = calculateSpendingBoundaries([0.5, 1], 0.025, 'pocock');
    expect(b.criticalValues[0]).toBeCloseTo(2.157, 2);
    expect(b.criticalValues[1]).toBeCloseTo(2.201, 2);
    expect(twoLookTypeIError(0.5, b.criticalValues[0], b.criticalValues[1])).toBeCloseTo(0.025, 4);
  });

  it('interim-only fractions (final look not yet listed) give the same interim boundaries', () => {
    // A boundary at look k depends only on looks 1..k.
    const interimOnly = calculateSpendingBoundaries([1 / 3, 2 / 3], 0.025, 'obrien-fleming');
    expect(interimOnly.criticalValues).toHaveLength(2);
    expect(interimOnly.criticalValues[0]).toBeCloseTo(3.710, 2);
    expect(interimOnly.criticalValues[1]).toBeCloseTo(2.511, 2);
  });

  it('refuses an unknown spending function rather than defaulting', () => {
    expect(() => calculateSpendingBoundaries([0.5, 1], 0.025, 'haybittle' as any)).toThrow();
  });
});

describe('adaptive service: conditional power (B-value form) with explicit assumptions', () => {
  it('Z = 2.0 at t = 0.5, c = 1.96: current trend 0.890, H0 0.220', () => {
    const trend = computeConditionalPower(2, 0.5, Z975, 2 / Math.sqrt(0.5));
    expect(trend).toBeCloseTo(0.8903, 3);
    expect(trend).toBeCloseTo(refCP(2, 0.5, Z975, 2 / Math.sqrt(0.5)), 6);
    expect(computeConditionalPower(2, 0.5, Z975, 0)).toBeCloseTo(0.2201, 3);
  });

  it('labels each assumption and computes each with its own drift', () => {
    const designDrift = Z975 + 0.8416212335729143; // 80% power design: θ = z_{1−α} + z_{1−β}
    const s = conditionalPowerScenarios(2, 0.5, Z975, designDrift);
    expect(s.currentTrend.drift).toBeCloseTo(2 / Math.sqrt(0.5), 12);
    expect(s.currentTrend.conditionalPower).toBeCloseTo(0.8903, 3);
    expect(s.nullHypothesis.drift).toBe(0);
    expect(s.nullHypothesis.conditionalPower).toBeCloseTo(0.2201, 3);
    expect(s.designEffect.drift).toBe(designDrift);
    expect(s.designEffect.conditionalPower).toBeCloseTo(refCP(2, 0.5, Z975, designDrift), 6);
  });

  it('with no design effect on record, the H1 figure is null with a reason — never a default', () => {
    const s = conditionalPowerScenarios(2, 0.5, Z975, null);
    expect(s.designEffect.conditionalPower).toBeNull();
    expect(s.designEffect.reason).toMatch(/design effect/i);
  });
});

describe('adaptive service: predictive power on the Z / B-value scale', () => {
  it('flat prior: Z = 2.0, t = 0.5, c = 1.96 → Φ((Z − c√t)/√(1−t)) = 0.8074', () => {
    const pp = computePredictivePower(2, 0.5, Z975);
    expect(pp).toBeCloseTo(0.8074, 3);
    expect(pp).toBeCloseTo(refPredictivePower(2, 0.5, Z975, 0, Infinity), 4);
  });

  it('normal prior on the drift: matches direct integration of CP over the posterior', () => {
    for (const [z, t, m0, s0] of [
      [1.2, 0.4, 2.8, 1.0],
      [2.5, 0.7, 0, 0.5],
      [-0.5, 0.3, 2.0, 2.0],
    ]) {
      const pp = computePredictivePower(z, t, Z975, { mean: m0, sd: s0 });
      expect(pp, `z=${z} t=${t} prior N(${m0}, ${s0}²)`).toBeCloseTo(
        refPredictivePower(z, t, Z975, m0, s0),
        4,
      );
    }
  });
});

describe('adaptive service: interim boundaries are sequentially consistent', () => {
  const plan = {
    id: 7,
    title: 'GSD',
    designType: 'group_sequential',
    adaptations: [],
    interimLooks: [{ informationFraction: 0.5 }, { informationFraction: 0.75 }],
    stoppingRules: [{ type: 'efficacy', alpha: 0.025 }],
    spendingFunction: 'obrien-fleming',
    spendingParameters: { alpha: 0.025 },
    maxSampleSize: 200,
    organizationId: 1,
  };

  beforeEach(() => {
    state.inserted = [];
  });

  it('look 2 at t = 0.75 uses the boundary conditional on look 1 at t = 0.5', async () => {
    const priorSnapshot = { id: 1, planId: 7, lookNumber: 1, informationFraction: 0.5, organizationId: 1 };
    state.rowsFor = table =>
      table === adaptiveTrialPlans ? [plan] : table === interimDataSnapshots ? [priorSnapshot] : [];

    const r = await adaptiveTrialOperationsService.ingestInterimSnapshot(
      7,
      {
        lookNumber: 2,
        informationFraction: 0.75,
        enrolledCount: 150,
        isBlinded: false,
        summaryStatistics: { testStatistic: 2.2 },
      },
      1,
    );

    const reference = solveSpendingBoundaries([0.5, 0.75, 1], 0.025, 'obrien-fleming');
    expect(r.analysis.boundary.criticalValue).toBeCloseTo(reference.efficacyBoundaries[1], 6);
    expect(r.analysis.boundary.finalCriticalValue).toBeCloseTo(reference.efficacyBoundaries[2], 6);
    // NOT the first-look-alone value z_{1 − α*(0.75)/2} the old code produced (2.688).
    expect(r.analysis.boundary.criticalValue).toBeLessThan(2.45);
    // Cumulative H0 crossing through look 2 equals α*(0.75): the boundary spends what it says.
    const oc = computeOperatingCharacteristic(
      { informationFractions: [0.5 / 0.75, 1], efficacyBoundaries: reference.efficacyBoundaries.slice(0, 2) },
      0,
    );
    expect(oc.rejectProbability).toBeCloseTo(reference.cumulativeAlpha[1], 5);
    // Z = 2.2 is below the look-2 boundary, so no efficacy stop.
    expect(r.analysis.boundary.efficacyCrossed).toBe(false);
    // Conditional power is the current-trend figure, against the design's final boundary.
    const c = reference.efficacyBoundaries[2];
    expect(r.analysis.conditionalPower).toBeCloseTo(refCP(2.2, 0.75, c, 2.2 / Math.sqrt(0.75)), 6);
    expect(r.analysis.predictivePower).toBeCloseTo(refPredictivePower(2.2, 0.75, c, 0, Infinity), 4);
  });

  it('a strongly negative Z does not cross a one-sided efficacy boundary', async () => {
    state.rowsFor = table => (table === adaptiveTrialPlans ? [plan] : []);
    const r = await adaptiveTrialOperationsService.ingestInterimSnapshot(
      7,
      { lookNumber: 1, informationFraction: 0.5, enrolledCount: 100, isBlinded: false, summaryStatistics: { testStatistic: -3.5 } },
      1,
    );
    expect(r.analysis.boundary.criticalValue).toBeCloseTo(2.963, 2);
    expect(r.analysis.boundary.efficacyCrossed).toBe(false);
  });
});

describe('adaptive service: simulated operating characteristics hold α', () => {
  it('createPlan: simulated type I error is within Monte Carlo error of the exact 0.025', async () => {
    state.rowsFor = () => [];
    const r: any = await adaptiveTrialOperationsService.createPlan(
      {
        title: 'OC check',
        designType: 'group_sequential',
        adaptations: [],
        interimLooks: [{ informationFraction: 0.5 }],
        stoppingRules: [{ type: 'efficacy', alpha: 0.025 }],
        spendingFunction: 'obrien-fleming',
        maxSampleSize: 200,
      },
      1,
      1,
    );
    const oc = r.operatingCharacteristics;
    expect(oc.boundaries.criticalValues[0]).toBeCloseTo(2.963, 2);
    expect(oc.boundaries.criticalValues[1]).toBeCloseTo(1.969, 2);
    // 10 000 replicates: SE ≈ √(0.025·0.975/10 000) = 0.0016; allow 4 SE.
    expect(Math.abs(oc.typeIError - 0.025)).toBeLessThan(4 * 0.0016);
    expect(oc.exactTypeIErrorEfficacyOnly).toBeCloseTo(0.025, 4);
    // With no futility rule, every scenario's simulated rejection rate must agree
    // with the exact recursion. This is what catches a simulator that draws the
    // looks independently instead of as one correlated sequence (power at
    // θ = 3.0 is ≈ 0.88 independent vs ≈ 0.85 correlated — about 8 SE apart).
    for (const s of r.plan.simulationResults.scenarios) {
      const p = s.exactRejectionRateEfficacyOnly;
      const se = Math.sqrt((p * (1 - p)) / s.nSimulations);
      expect(Math.abs(s.rejectionRate - p), `effect ${s.effectSize}`).toBeLessThan(4 * se + 1e-3);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe('designAdaptiveDesign (AnA design_adaptive_design): canonical boundaries', () => {
  it('two-sided α = 0.05, 1 interim → per-side LD-OBF at 0.025: 2.963 / 1.969', () => {
    const r = designAdaptiveDesign({ goal: 'stop-early-efficacy', numberOfInterims: 1, alpha: 0.05 });
    const z = r.interimBoundaries.map(b => b.nominalZ);
    expect(z[0]).toBeCloseTo(2.963, 2);
    expect(z[1]).toBeCloseTo(1.969, 2);
    // Each side spends exactly α/2 (independent bivariate integral).
    expect(twoLookTypeIError(0.5, z[0], z[1])).toBeCloseTo(0.025, 3);
    // nominalAlpha is the two-sided nominal significance level of the boundary.
    expect(r.interimBoundaries[0].nominalAlpha).toBeCloseTo(2 * (1 - refPhi(z[0])), 5);
  });

  it('two-sided α = 0.05, 2 interims → 3.710 / 2.511 / 1.993', () => {
    const r = designAdaptiveDesign({ goal: 'stop-early-futility', numberOfInterims: 2, alpha: 0.05 });
    const z = r.interimBoundaries.map(b => b.nominalZ);
    expect(z).toHaveLength(3);
    [3.710, 2.511, 1.993].forEach((e, i) => expect(z[i], `look ${i + 1}`).toBeCloseTo(e, 2));
  });

  it('the final look is not the fixed-design nominal value plus a correlation-blind remainder', () => {
    // The old per-look nominal conversion put the final OBF boundary at 2.0101 for
    // 2 looks; the correlation-aware boundary is 1.969.
    const r = designAdaptiveDesign({ goal: 'select-dose', numberOfInterims: 1, alpha: 0.05 });
    expect(r.interimBoundaries[1].nominalZ).toBeLessThan(1.99);
  });
});
