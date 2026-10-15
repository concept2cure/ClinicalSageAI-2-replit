/**
 * A risk target nothing estimated is not assessed. It is not a coin flip.
 *
 * risk-model.ts predict() used to answer `probability: prior ?? 0.5` when no
 * trained model and no network prior existed — every estate until 30 outcomes
 * had been recorded. RTF, CRL and first-cycle approval all came back as exactly
 * 0.5. scoreSubmissionDraft turned that into score 50 / band "high", added
 * "High RTF risk: resolve all missing critical sections…", and wrote 0.5 to
 * intelligence.risk_predictions.predicted_prob, which the deployed-model
 * backtest reads back as a prediction. Nothing had measured any of it.
 *
 * Now predict() answers probability null with source 'cold_start'; the target's
 * probability, score and band are null; no risk_predictions row is written for
 * it; and the recommendations say which targets were not assessed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPool } from '../../../../tests/setup';

vi.mock('../../../db/runtime', () => ({
  pool: mockPool,
  getPool: () => mockPool,
  db: mockPool,
  getDb: () => mockPool,
}));

const { predict, _invalidateModelCacheForTests } = await import('../risk-model');
const { scoreSubmissionDraft } = await import('../regulatory-intelligence');

const NDA_DRAFT = {
  organizationId: 42,
  submissionType: 'NDA',
  targetAgency: 'FDA',
  therapeuticArea: 'oncology',
  presentSections: ['1.1', '1.2', '1.3', '2.3', '2.4', '2.5', '2.7', '3.2.S', '3.2.P'],
};

/** No trained model and no network prior anywhere: the cold start. */
function emptyStores(inserts: string[]) {
  mockPool.query.mockImplementation((text: string) => {
    if (/INSERT INTO intelligence\.risk_predictions/.test(text)) inserts.push(text);
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

beforeEach(() => {
  _invalidateModelCacheForTests();
  mockPool.query.mockReset();
});

describe('predict() with no trained model and no network prior', () => {
  it('returns a null probability, not 0.5', async () => {
    emptyStores([]);
    const prediction = await predict({ target: 'rtf', features: {}, networkPrior: null });
    expect(prediction.source).toBe('cold_start');
    expect(prediction.probability).toBeNull();
    expect(prediction.priorWeight).toBe(0);
    expect(prediction.localWeight).toBe(0);
  });

  it('still returns the network prior when one exists', async () => {
    emptyStores([]);
    const prediction = await predict({ target: 'crl', features: {}, networkPrior: 0.42 });
    expect(prediction.source).toBe('network_prior');
    expect(prediction.probability).toBeCloseTo(0.42, 5);
  });
});

describe('scoreSubmissionDraft at cold start', () => {
  it('reports every target as not assessed: no probability, score or band', async () => {
    emptyStores([]);
    const result = await scoreSubmissionDraft(NDA_DRAFT);
    for (const target of [result.rtf, result.crl, result.firstCycleApproval]) {
      expect(target.source).toBe('cold_start');
      expect(target.probability).toBeNull();
    }
    expect(result.rtf.score).toBeNull();
    expect(result.rtf.band).toBeNull();
    expect(result.crl.score).toBeNull();
    expect(result.crl.band).toBeNull();
  });

  it('writes no risk_predictions row for a probability nobody estimated', async () => {
    const inserts: string[] = [];
    emptyStores(inserts);
    await scoreSubmissionDraft(NDA_DRAFT);
    expect(inserts).toEqual([]);
  });

  it('recommends nothing from an unassessed risk, and says what was not assessed', async () => {
    emptyStores([]);
    const result = await scoreSubmissionDraft(NDA_DRAFT);
    expect(result.recommendations.some((r) => /High RTF risk|Do not file/.test(r))).toBe(false);
    expect(result.recommendations.some((r) => /RTF and CRL risk not assessed/.test(r))).toBe(true);
    // The rule-based completeness check still ran, and its blockers are still named.
    expect(result.completeness.assessment.status).toBe('assessed');
    expect(result.blendedReadiness).toBe(result.completeness.rtfRisk.rtfScore);
  });
});
