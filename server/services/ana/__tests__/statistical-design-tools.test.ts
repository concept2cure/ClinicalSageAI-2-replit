/**
 * Verifies the nine deterministic statistical-design tools are (a) registered as
 * AnA tool handlers and (b) wired to their engines with correct argument mapping,
 * by exercising each through the public getToolHandler() seam and checking the
 * deterministic envelope. These engines (server/services/stats/*) were previously
 * unreachable by AnA; this guards the wiring against regressions.
 */
import { describe, it, expect } from 'vitest';

import { getToolHandler } from '../AnaToolExecutor';
import { STATISTICAL_DESIGN_TOOLS } from '../statisticalDesignTools';

const ctx = {} as any;

async function call(name: string, input: Record<string, unknown>) {
  const handler = getToolHandler(name);
  expect(handler, `handler for ${name} must be registered`).toBeTruthy();
  const raw = await handler!(input, ctx);
  return JSON.parse(raw as string);
}

describe('statistical-design tools — registration', () => {
  it('every defined tool has a registered handler', () => {
    for (const tool of STATISTICAL_DESIGN_TOOLS) {
      expect(getToolHandler(tool.name), `${tool.name} handler`).toBeTruthy();
    }
    expect(STATISTICAL_DESIGN_TOOLS).toHaveLength(19);
  });
});

describe('statistical-design tools — stranded-engine batch (assurance, Monte-Carlo, IVD extensions)', () => {
  it('compute_assurance (quadrature) returns assurance bounded below the design power', async () => {
    const out = await call('compute_assurance', {
      priorMean: 0.4,
      priorSd: 0.15,
      nPerArm: 120,
    });
    expect(out.status).toBe('computed');
    expect(out.engine).toBe('deterministic');
    expect(out.result.assurance).toBeGreaterThan(0);
    expect(out.result.assurance).toBeLessThan(1);
    // Assurance averages over effect uncertainty ⇒ ≤ power at the prior mean.
    expect(out.result.assurance).toBeLessThanOrEqual(out.result.powerAtPriorMean + 1e-9);
  });

  it('compute_assurance (monte_carlo) is seeded/reproducible and tagged seeded-monte-carlo', async () => {
    const args = { priorMean: 0.4, priorSd: 0.15, nPerArm: 120, method: 'monte_carlo', nSim: 5000, seed: 11 };
    const a = await call('compute_assurance', args);
    const b = await call('compute_assurance', args);
    expect(a.status).toBe('computed');
    expect(a.engine).toBe('seeded-monte-carlo');
    expect(a.result.assurance).toBe(b.result.assurance); // reproducible for the seed
  });

  it('run_monte_carlo_simulation (diagnostic_accuracy) returns credible intervals', async () => {
    const out = await call('run_monte_carlo_simulation', {
      mode: 'diagnostic_accuracy',
      tp: 90, fp: 10, fn: 10, tn: 90,
      iterations: 2000,
      seed: 3,
    });
    expect(out.status).toBe('computed');
    expect(out.engine).toBe('seeded-monte-carlo');
    expect(out.result.sensitivity.p2_5).toBeLessThanOrEqual(out.result.sensitivity.p97_5);
    expect(out.result.specificity.median).toBeGreaterThan(0);
  });

  it('run_monte_carlo_simulation (time_to_market) returns P50 ≤ P90 weeks', async () => {
    const out = await call('run_monte_carlo_simulation', {
      mode: 'time_to_market',
      phases: [
        { name: 'Analytical', studyWeeks: [12, 16] },
        { name: 'Clinical', studyWeeks: [40] },
      ],
      iterations: 1000,
      seed: 5,
    });
    expect(out.status).toBe('computed');
    expect(out.result.p90Weeks).toBeGreaterThanOrEqual(out.result.p50Weeks);
  });

  it('run_monte_carlo_simulation (review_outcome) returns a verdict distribution', async () => {
    const out = await call('run_monte_carlo_simulation', {
      mode: 'review_outcome',
      profile: { pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis' },
      evidenceProbabilities: { analyticalPrecision: 0.9, detectionCapability: 0.8, clinicalPerformance: 0.7 },
      iterations: 1000,
      seed: 9,
    });
    expect(out.status).toBe('computed');
    const v = out.result.verdictProbabilities;
    expect(v.likely_acceptance + v.additional_information_likely + v.not_substantially_complete)
      .toBeCloseTo(1, 6);
  });

  it('run_monte_carlo_simulation relays an invalid mode as needs_parameters', async () => {
    const out = await call('run_monte_carlo_simulation', { mode: 'nonsense' });
    expect(out.status).toBe('needs_parameters');
  });

  it('assess_ivd_analytical_extensions (carryover) computes a pass/fail percent', async () => {
    const out = await call('assess_ivd_analytical_extensions', {
      mode: 'carryover',
      lowAfterHigh: [1.05, 1.1, 1.0],
      lowBaseline: [1.0, 1.02, 0.98],
      highSample: [100, 101, 99],
    });
    expect(out.status).toBe('computed');
    expect(out.engine).toBe('deterministic');
    expect(typeof out.result.carryoverPct).toBe('number');
    expect(typeof out.result.pass).toBe('boolean');
  });

  it('assess_ivd_analytical_extensions (cutoff) maximizes the Youden index', async () => {
    const out = await call('assess_ivd_analytical_extensions', {
      mode: 'cutoff',
      observations: [
        { score: 1, positive: false },
        { score: 2, positive: false },
        { score: 5, positive: true },
        { score: 6, positive: true },
      ],
    });
    expect(out.status).toBe('computed');
    expect(out.result.youdenJ).toBeGreaterThan(0);
    expect(out.result.sensitivity).toBeGreaterThan(0);
  });

  it('assess_ivd_analytical_extensions relays an invalid mode as needs_parameters', async () => {
    const out = await call('assess_ivd_analytical_extensions', { mode: 'nonsense' });
    expect(out.status).toBe('needs_parameters');
  });
});

describe('statistical-design tools — operational forecasting', () => {
  it('forecast_enrollment returns a reproducible completion forecast', async () => {
    const out = await call('forecast_enrollment', {
      sites: [{ meanRate: 1.5 }, { meanRate: 2.0, activationTime: 1 }],
      targetN: 60,
      seed: 42,
    });
    expect(out.status).toBe('computed');
    expect(out.engine).toBe('seeded-monte-carlo');
    expect(out.result.probReached).toBeGreaterThan(0);
    expect(out.result.medianTime).toBeGreaterThan(0);
  });

  it('project_events returns a target-event time projection', async () => {
    const out = await call('project_events', {
      accrualRate: 10,
      accrualPeriod: 12,
      medianControl: 8,
      hazardRatio: 0.7,
      targetEvents: 40,
      seed: 7,
    });
    expect(out.status).toBe('computed');
    expect(out.engine).toBe('seeded-monte-carlo');
    expect(out.result).toBeTruthy();
  });
});

describe('statistical-design tools — IVD/diagnostics batch', () => {
  it('compute_diagnostic_accuracy returns sensitivity/specificity from a 2x2', async () => {
    const out = await call('compute_diagnostic_accuracy', { tp: 90, fp: 10, fn: 10, tn: 90 });
    expect(out.status).toBe('computed');
    expect(out.result.sensitivity).toBeCloseTo(0.9, 6);
    expect(out.result.specificity).toBeCloseTo(0.9, 6);
    expect(out.result.sensitivityCi).toBeTruthy();
  });

  it('size_diagnostic_study (single_proportion) returns an exact N', async () => {
    const out = await call('size_diagnostic_study', {
      mode: 'single_proportion',
      goal: 0.8,
      expected: 0.9,
    });
    expect(out.status).toBe('computed');
    expect(out.result.nExact).toBeGreaterThan(0);
  });

  it('design_bayesian_device sizes a single-arm device study', async () => {
    const out = await call('design_bayesian_device', {
      goal: 0.8,
      expected: 0.92,
      successThreshold: 0.95,
      targetPower: 0.9,
    });
    expect(out.status).toBe('computed');
    expect(out.result.n).toBeGreaterThan(0);
  });

  it('compute_analytical_performance (imprecision) returns SD/CV', async () => {
    const out = await call('compute_analytical_performance', {
      mode: 'imprecision',
      runs: [
        [10.1, 10.2, 9.9],
        [10.0, 10.3, 10.1],
        [9.8, 10.0, 10.2],
      ],
    });
    expect(out.status).toBe('computed');
    expect(out.result).toBeTruthy();
  });

  it('size_diagnostic_study relays an invalid mode as needs_parameters', async () => {
    const out = await call('size_diagnostic_study', { mode: 'nonsense' });
    expect(out.status).toBe('needs_parameters');
  });
});

describe('statistical-design tools — deterministic computation', () => {
  it('analyze_safety_signal flags a strong disproportionality signal', async () => {
    const out = await call('analyze_safety_signal', { a: 20, b: 80, c: 10, d: 890 });
    expect(out.status).toBe('computed');
    expect(out.result.signal).toBe(true);
    expect(out.result.prr).toBeGreaterThan(2);
    expect(out.result.ror).toBeGreaterThan(0);
  });

  it('screen_signal_panel consolidates frequentist + Bayesian methods into a tier', async () => {
    const out = await call('screen_signal_panel', { a: 30, b: 100, c: 10, d: 10000 });
    expect(out.status).toBe('computed');
    expect(out.result.frequentist.signal).toBe(true);
    expect(out.result.bcpnn.signal).toBe(true);
    expect(out.result.ebgm.signal).toBe(true);
    expect(out.result.concordance).toBe(3);
    expect(out.result.tier).toBe('strong');
    // Bayesian shrinkage pulls EBGM below the raw relative report ratio.
    expect(out.result.ebgm.ebgm).toBeLessThan(out.result.ebgm.relativeReportRatio!);
  });

  it('adjust_multiplicity (Holm) rejects only the smallest p when expected', async () => {
    const out = await call('adjust_multiplicity', {
      pValues: [0.01, 0.04, 0.03],
      alpha: 0.05,
      procedure: 'holm',
    });
    expect(out.status).toBe('computed');
    // Holm: 0.01 < 0.05/3 rejects; 0.03 > 0.05/2 stops the step-down.
    expect(out.result.rejectedIndices).toEqual([0]);
  });

  it('design_mmrm returns a positive per-arm sample size', async () => {
    const out = await call('design_mmrm', {
      visits: 3,
      covariance: 'compound_symmetry',
      rho: 0.5,
      sigma: 2,
      delta: 1,
    });
    expect(out.status).toBe('computed');
    expect(out.result.nPerArm).toBeGreaterThan(0);
    expect(out.result.achievedPower).toBeGreaterThanOrEqual(0.9 - 1e-6);
  });

  it('design_dose_finding returns BOIN boundaries + decision table', async () => {
    const out = await call('design_dose_finding', { target: 0.3 });
    expect(out.status).toBe('computed');
    expect(out.result.boundaries.lambdaE).toBeGreaterThan(0);
    expect(out.result.boundaries.lambdaD).toBeGreaterThan(out.result.boundaries.lambdaE);
    expect(Array.isArray(out.result.decisionTable)).toBe(true);
  });

  it('analyze_rmst computes a finite difference + CI', async () => {
    const out = await call('analyze_rmst', {
      treatment: { times: [5, 6, 7, 8, 9], events: [1, 1, 0, 1, 1] },
      control: { times: [3, 4, 5, 6, 7], events: [1, 1, 1, 0, 1] },
      tau: 6,
    });
    expect(out.status).toBe('computed');
    expect(Number.isFinite(out.result.difference)).toBe(true);
    expect(out.result.ciUpper).toBeGreaterThanOrEqual(out.result.ciLower);
  });

  it('design_group_sequential controls type I error at alpha (OBF)', async () => {
    const out = await call('design_group_sequential', {
      informationFractions: [0.5, 1.0],
      alpha: 0.025,
      spendingFunction: 'obrien-fleming',
      driftGrid: [0, 3],
    });
    expect(out.status).toBe('computed');
    expect(out.result.boundaries.efficacyBoundaries.length).toBe(2);
    expect(out.result.operatingCharacteristics.typeIError).toBeLessThanOrEqual(0.025 + 5e-3);
  });
});

describe('statistical-design tools — validation', () => {
  it('relays a validation error as needs_parameters (does not throw)', async () => {
    const out = await call('adjust_multiplicity', {
      pValues: [0.01, 0.02],
      alpha: 2, // invalid
      procedure: 'bonferroni',
    });
    expect(out.status).toBe('needs_parameters');
    expect(typeof out.message).toBe('string');
  });
});
