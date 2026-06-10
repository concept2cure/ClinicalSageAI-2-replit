import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.hoisted(() => vi.fn());
// The twin reads csr_reports via pool.query (history check) and the Drizzle handle (CSR
// evidence). Mocking the db module to expose only `pool` makes the Drizzle path throw,
// which the service handles gracefully — no observations, prior falls back to the design.
vi.mock('../../../db', () => ({ pool: { query } }));

import {
  STUDY_TWIN_DISCLAIMER,
  HISTORY_UPLOAD_REQUEST,
  composeSimulationResult,
  composeTwinPrediction,
  simulateStudyTwin,
} from '../study-twin-service';

const design: any = {
  title: 'X',
  phase: '2',
  indication: 'NSCLC',
  framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
  endpoints: [{ name: 'ORR', role: 'primary', type: 'binary', definition: 'objective response rate' }],
  estimands: [],
  statisticalPlan: {
    alpha: 0.05,
    power: 0.9,
    plannedSampleSize: 300,
    plannedAnalyses: [],
    powerAssumptions: { effectSize: 0.3 },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [] });
});

describe('composeSimulationResult — disclaimer + upload prompt', () => {
  it('ALWAYS attaches the disclaimer', () => {
    expect(composeSimulationResult('pred', true, '2', 'NSCLC').disclaimer).toBe(STUDY_TWIN_DISCLAIMER);
    expect(composeSimulationResult('pred', false, '2', 'NSCLC').disclaimer).toBe(STUDY_TWIN_DISCLAIMER);
  });
  it('requests a history upload only when there is no history', () => {
    const ungrounded = composeSimulationResult('p', false, '2', 'x');
    expect(ungrounded.needsHistoryUpload).toBe(true);
    expect(ungrounded.historyRequest).toBe(HISTORY_UPLOAD_REQUEST);
    const grounded = composeSimulationResult('p', true, '2', 'x');
    expect(grounded.needsHistoryUpload).toBe(false);
    expect(grounded.historyRequest).toBeUndefined();
  });
});

describe('simulateStudyTwin — computed, not guessed', () => {
  it('computes a probability of success from the deterministic engine', async () => {
    const r = await simulateStudyTwin({ design, organizationId: 1 });
    expect(r.disclaimer).toBe(STUDY_TWIN_DISCLAIMER);
    expect(r.needsHistoryUpload).toBe(true);
    expect(r.historyRequest).toBe(HISTORY_UPLOAD_REQUEST);
    expect(r.prediction).toMatch(/probability of success/i);
    expect(r.quantitative).toBeDefined();
    expect(r.quantitative!.probabilityOfSuccess).toBeGreaterThanOrEqual(0);
    expect(r.quantitative!.probabilityOfSuccess).toBeLessThanOrEqual(1);
    // The prior rests on the design's assumption (no structured CSR evidence in this env).
    expect(r.quantitative!.effectBasis).toBe('assumption');
  });

  it('reports no probability — honestly — when the design has no effect assumption', async () => {
    const noEffect = { ...design, statisticalPlan: { ...design.statisticalPlan, powerAssumptions: undefined } };
    const r = await simulateStudyTwin({ design: noEffect, organizationId: 1 });
    expect(r.prediction).toMatch(/cannot be simulated/i);
    expect(r.quantitative).toBeUndefined();
    expect(r.disclaimer).toBe(STUDY_TWIN_DISCLAIMER);
  });

  it('reports no probability for a single-arm design rather than faking one', async () => {
    const singleArm = {
      ...design,
      framework: { inferentialFrame: 'superiority', structuralDesign: 'single_arm', controlType: 'none' },
    };
    const r = await simulateStudyTwin({ design: singleArm, organizationId: 1 });
    expect(r.prediction).toMatch(/cannot be simulated/i);
    expect(r.quantitative).toBeUndefined();
  });

  it('treats supplied grounding text as history (no upload request)', async () => {
    const r = await simulateStudyTwin({ design, organizationId: 1 }, 'Prior CSR data...');
    expect(r.needsHistoryUpload).toBe(false);
    expect(r.grounded).toBe(true);
  });

  it('marks grounded when csr_reports exist for the org', async () => {
    query.mockResolvedValue({ rows: [{ ok: 1 }] });
    const r = await simulateStudyTwin({ design, organizationId: 1 });
    expect(r.grounded).toBe(true);
    expect(r.needsHistoryUpload).toBe(false);
  });
});

describe('composeTwinPrediction — figures come from the engine', () => {
  it('renders the computed probability and the defensibility risk', () => {
    const report: any = {
      summary: {
        probabilityOfSuccess: 0.42,
        powerAtPriorMean: 0.55,
        estimatedEffect: { median: 0.3, lower: 0.1, upper: 0.5, scale: 'standardized mean difference' },
        typeIErrorUnderNull: 0.05,
        nRuns: 5000,
      },
      design: { alpha: 0.025 },
      assumptions: { effectBasis: 'assumption', evidenceSources: [], caveats: ['No historical evidence supplied.'] },
      provenance: { seed: 123 },
    };
    const validation: any = { riskLevel: 'high', canAdvance: false, counts: { critical: 1 }, findings: [{ section: '§2 Estimands', title: 'No estimand', severity: 'critical' }] };
    const { text, quantitative } = composeTwinPrediction(report, validation);
    expect(text).toMatch(/42%/);
    expect(text).toMatch(/blocking finding/i);
    expect(quantitative.probabilityOfSuccess).toBe(0.42);
    expect(quantitative.provenanceSeed).toBe(123);
  });
});
