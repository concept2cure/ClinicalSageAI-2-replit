/**
 * The regulatory outcome optimizer (POST /api/biostat/design-optimizer/*)
 * reports what the organisation's outcome records say and nothing else
 * (CLAUDE.md Rule 2, 2026-10-05). It used to fill gaps with figures from
 * nowhere: a sample size chosen by endpoint keyword (survival 400, PFS 350,
 * response 200, else 300), a whole recommendation when there was no data
 * (overall survival, log-rank, N = 300), a "power gain" of log(m) × 0.1 added
 * to an approval rate, and sample-size ranges by endpoint name.
 */
import { describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => ({ correlations: [] as unknown[] }));
vi.mock('../../db', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => rows.correlations }) }),
  },
}));

import { regulatoryOutcomeOptimizerService as svc } from '../regulatory-outcome-optimizer-service';

const build = (outcomes: unknown[]) =>
  (svc as unknown as { buildDesignOptions: (...a: unknown[]) => Array<Record<string, unknown>> }).buildDesignOptions(
    outcomes,
    [],
    [],
  );

const outcome = (over: Record<string, unknown>) => ({
  primaryEndpoint: 'Overall survival',
  statisticalMethod: 'Log-rank test',
  decision: 'approved',
  agency: 'FDA',
  sampleSize: null,
  ...over,
});

describe('recommendDesign options', () => {
  it('recommends nothing when there is no outcome data', () => {
    expect(build([])).toEqual([]);
  });

  it('gives no sample size when no precedent recorded one', () => {
    const [opt] = build([outcome({})]);
    expect(opt.suggestedSampleSize).toBeNull();
  });

  it('gives the precedents’ median sample size when they recorded one', () => {
    const [opt] = build([outcome({ sampleSize: 420 }), outcome({ sampleSize: 380 }), outcome({ sampleSize: 500 })]);
    expect(opt.suggestedSampleSize).toBe(420);
  });
});

describe('runSensitivityAnalysis', () => {
  it('does not vary sample size or attach invented ranges', async () => {
    rows.correlations = [
      { parameterName: 'endpoint', parameterValue: 'Overall survival', successRate: 0.6 },
      { parameterName: 'statistical_method', parameterValue: 'Log-rank test', successRate: 0.7 },
    ];
    const r = await svc.runSensitivityAnalysis({ indication: 'NSCLC', phase: 'III', sampleSize: 300 }, 1);
    expect(r.scenarios.some((s) => s.parameter === 'sample_size')).toBe(false);
    expect(JSON.stringify(r.scenarios)).not.toMatch(/300-500|150-300|50-200/);
  });
});
