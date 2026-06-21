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
    expect(STATISTICAL_DESIGN_TOOLS).toHaveLength(13);
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
