/**
 * Integration tests for the regulatory-intelligence orchestrator.
 *
 * The DB layer is mocked at the `pg` import boundary (per tests/setup.ts) —
 * this suite swaps the mockPool's responses per-test so we can drive the
 * orchestrator through realistic scenarios without a live Postgres.
 *
 * Covers:
 *   - Cold-start: no model, no priors → rule-based score, source=cold_start.
 *   - Network-prior fallback: priors present, no model → blended toward prior.
 *   - Trained model active: score uses the model, blends with prior.
 *   - Persistence: every predict writes a risk_predictions row.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPool } from '../../../../tests/setup';

// Force the runtime pool import to resolve to the suite-level mockPool.
// Without this, `pool` is `null` (no DATABASE_URL) and every DB call NPEs
// before the orchestrator can route a query through the dispatcher.
vi.mock('../../../db/runtime', () => ({
  pool: mockPool,
  getPool: () => mockPool,
  db: mockPool,
  getDb: () => mockPool,
}));

const { scoreSubmissionDraft } = await import('../regulatory-intelligence');
const { _invalidateModelCacheForTests } = await import('../risk-model');

// Helper: build a sequence of mock query responses. The orchestrator runs:
//   1. validateCompletenessEngine.validate — pure, no DB
//   2. For each of 3 targets (rtf/crl/firstCycle): lookupNetworkPrior (≤ 4
//      queries depending on fallback path) + getActiveModel (1 query, cached)
//   3. Persist risk_predictions (1 insert)
// We script the mock by registering a queue of (text-matcher, response) pairs
// and routing each call to the first matcher that hits.

interface MockEntry {
  match: RegExp;
  result: { rows: unknown[]; rowCount?: number };
}

function queryDispatcher(entries: MockEntry[]) {
  return vi.fn((text: string) => {
    for (const e of entries) {
      if (e.match.test(text)) {
        return Promise.resolve(e.result);
      }
    }
    // Default: empty result. Lets unrelated queries (cache warmups, etc.)
    // succeed without crashing.
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

beforeEach(() => {
  _invalidateModelCacheForTests();
  mockPool.query.mockReset();
});

describe('scoreSubmissionDraft — cold start', () => {
  it('returns rule-based + cold_start predictions when no model and no priors exist', async () => {
    mockPool.query.mockImplementation(
      queryDispatcher([
        // every lookup returns empty
        { match: /network_risk_priors/, result: { rows: [] } },
        { match: /risk_model_versions/, result: { rows: [] } },
        // insert risk_predictions returns success
        { match: /INSERT INTO intelligence\.risk_predictions/, result: { rows: [] } },
      ]),
    );

    const result = await scoreSubmissionDraft({
      organizationId: 42,
      submissionType: 'NDA',
      targetAgency: 'FDA',
      therapeuticArea: 'oncology',
      presentSections: ['1.1', '1.2', '1.3', '2.3', '2.4', '2.5', '2.7', '3.2.S', '3.2.P'],
    });

    expect(result.rtf.source).toBe('cold_start');
    expect(result.crl.source).toBe('cold_start');
    expect(result.firstCycleApproval.source).toBe('cold_start');
    // Cold start uses the default 0.5 probability → mid-range score band.
    expect(result.rtf.probability).toBeCloseTo(0.5);
    // Rule-based completeness still drives the blendedReadiness when no model.
    expect(result.blendedReadiness).toBe(result.completeness.rtfRisk.rtfScore);
    // Recommendations should call out that the layer is cold.
    expect(result.recommendations.some(r => r.toLowerCase().includes('cold-start') || r.includes('no comparable'))).toBe(true);
  });
});

describe('scoreSubmissionDraft — network prior available, model untrained', () => {
  it('uses the network prior as the predicted probability', async () => {
    mockPool.query.mockImplementation(
      queryDispatcher([
        {
          match: /network_risk_priors[\s\S]*WHERE target = \$1/,
          result: {
            rows: [{
              noised_rate: '0.42',
              sample_size: 12,
              tenant_count: 4,
              epsilon: '1.0',
            }],
          },
        },
        { match: /risk_model_versions/, result: { rows: [] } },
        { match: /INSERT INTO intelligence\.risk_predictions/, result: { rows: [] } },
      ]),
    );

    const result = await scoreSubmissionDraft({
      organizationId: 42,
      submissionType: 'NDA',
      targetAgency: 'FDA',
      therapeuticArea: 'oncology',
      presentSections: ['1.1', '1.2', '1.3', '2.3', '2.4', '2.5', '2.7', '3.2.S', '3.2.P'],
    });

    expect(result.rtf.source).toBe('network_prior');
    expect(result.rtf.probability).toBeCloseTo(0.42, 5);
    expect(result.rtf.priorProbability).toBeCloseTo(0.42, 5);
    expect(result.rtf.localWeight).toBe(0);
    expect(result.rtf.priorWeight).toBe(1);
  });
});

describe('scoreSubmissionDraft — trained model + prior', () => {
  it('blends the local model with the network prior weighted by sample size', async () => {
    // 60-sample model → 60 / (30 * 4) = 0.5 local weight.
    mockPool.query.mockImplementation(
      queryDispatcher([
        {
          match: /network_risk_priors[\s\S]*WHERE target = \$1/,
          result: {
            rows: [{ noised_rate: '0.40', sample_size: 20, tenant_count: 5, epsilon: '1.0' }],
          },
        },
        {
          match: /risk_model_versions[\s\S]*is_active = TRUE/,
          result: {
            rows: [{
              id: 'model-v1',
              target: 'rtf',
              feature_names: ['completeness_pct'],
              weights: { intercept: 0, completeness_pct: 0 }, // sigmoid(0) = 0.5
              sample_size: 60,
              positive_rate: '0.3',
              log_loss: '0.5',
              auc: '0.7',
              calibration_brier: '0.2',
              trained_at: '2026-05-20T00:00:00Z',
            }],
          },
        },
        { match: /INSERT INTO intelligence\.risk_predictions/, result: { rows: [] } },
      ]),
    );

    const result = await scoreSubmissionDraft({
      organizationId: 42,
      submissionType: 'NDA',
      targetAgency: 'FDA',
      therapeuticArea: 'oncology',
      presentSections: ['1.1', '1.2', '1.3', '2.3', '2.4', '2.5', '2.7', '3.2.S', '3.2.P'],
    });

    expect(result.rtf.source).toBe('blended');
    expect(result.rtf.localWeight).toBeCloseTo(0.5, 5);
    expect(result.rtf.priorWeight).toBeCloseTo(0.5, 5);
    // blend = 0.5 * sigmoid(0) + 0.5 * 0.4 = 0.5 * 0.5 + 0.2 = 0.45
    expect(result.rtf.probability).toBeCloseTo(0.45, 3);
  });
});

describe('scoreSubmissionDraft — persistence', () => {
  it('writes a risk_predictions row on every score call', async () => {
    const inserts: string[] = [];
    mockPool.query.mockImplementation((text: string) => {
      if (/INSERT INTO intelligence\.risk_predictions/.test(text)) {
        inserts.push(text);
      }
      return Promise.resolve({ rows: [] });
    });

    await scoreSubmissionDraft({
      organizationId: 7,
      submissionType: 'PMA',
      targetAgency: 'FDA',
      presentSections: [],
    });

    expect(inserts.length).toBeGreaterThanOrEqual(1);
    // Sanity check: the insert mentions the right column order so future
    // schema changes break this test loudly.
    expect(inserts[0]).toContain('organization_id');
    expect(inserts[0]).toContain('predicted_prob');
    expect(inserts[0]).toContain('blended_score');
  });
});

describe('scoreSubmissionDraft — band derivation', () => {
  it('escalates the band as risk probability rises', async () => {
    // High predicted probability → critical band.
    mockPool.query.mockImplementation(
      queryDispatcher([
        {
          match: /network_risk_priors[\s\S]*WHERE target = \$1/,
          result: { rows: [{ noised_rate: '0.85', sample_size: 50, tenant_count: 10, epsilon: '1.0' }] },
        },
        { match: /risk_model_versions/, result: { rows: [] } },
        { match: /INSERT INTO intelligence\.risk_predictions/, result: { rows: [] } },
      ]),
    );
    const result = await scoreSubmissionDraft({
      organizationId: 99,
      submissionType: 'NDA',
      targetAgency: 'FDA',
      presentSections: [],
    });
    expect(result.rtf.band).toBe('critical');
    expect(result.rtf.score).toBeLessThan(20); // 100 * (1 - 0.85) = 15
  });
});
