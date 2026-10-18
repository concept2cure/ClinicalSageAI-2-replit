/**
 * First-cycle approval is a chance of success. It is not banded as a risk.
 *
 * scoreOneTarget mapped all three targets through the risk mapping — score
 * (1 - p) × 100 and a band read from p — so first-cycle approval read
 * backwards. With a network prior of 0.10 for first-cycle approval, "a 10%
 * chance of approval in the first cycle" came back as score 90, band "low";
 * a 90% chance came back as band "critical".
 *
 * Score and band now exist only for the risk targets (RTF, CRL). First-cycle
 * approval reports its probability, and its own mapping: the band of 1 - p,
 * the chance of NOT being approved in the first cycle.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPool } from '../../../../tests/setup';

vi.mock('../../../db/runtime', () => ({
  pool: mockPool,
  getPool: () => mockPool,
  db: mockPool,
  getDb: () => mockPool,
}));

const { scoreSubmissionDraft } = await import('../regulatory-intelligence');
const { _invalidateModelCacheForTests } = await import('../risk-model');

/** Network priors by target; no trained model. */
function priors(byTarget: Record<string, number>) {
  mockPool.query.mockImplementation((text: string, params: unknown[] = []) => {
    if (/FROM intelligence\.network_risk_priors[\s\S]*ORDER BY sample_size DESC/.test(text)) {
      const p: number | undefined = byTarget[String(params[0])];
      return Promise.resolve({
        rows: p === undefined ? [] : [{ noised_rate: String(p), sample_size: 40, tenant_count: 6, epsilon: '1.0' }],
      });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

const DRAFT = {
  organizationId: 42,
  submissionType: 'NDA',
  targetAgency: 'FDA',
  presentSections: ['1.1', '2.5', '3.2.S'],
};

beforeEach(() => {
  _invalidateModelCacheForTests();
  mockPool.query.mockReset();
});

describe('first-cycle approval', () => {
  it('a 10% chance of approval is not "low" risk, and carries no risk score', async () => {
    priors({ rtf: 0.8, crl: 0.8, first_cycle_approval: 0.1 });
    const result = await scoreSubmissionDraft(DRAFT);

    // The risk targets keep the risk mapping.
    expect(result.rtf).toMatchObject({ probability: 0.8, score: 20, band: 'critical' });

    const approval = result.firstCycleApproval;
    expect(approval.probability).toBeCloseTo(0.1, 5);
    expect(approval).not.toHaveProperty('score');
    expect(approval).not.toHaveProperty('band');
    // Its own mapping: 1 - p = 0.9 chance of no first-cycle approval.
    expect(approval.nonApprovalBand).toBe('critical');
  });

  it('a 90% chance of approval maps to a low chance of non-approval', async () => {
    priors({ rtf: 0.1, crl: 0.1, first_cycle_approval: 0.9 });
    const result = await scoreSubmissionDraft(DRAFT);
    expect(result.firstCycleApproval.nonApprovalBand).toBe('low');
  });

  it('unassessed first-cycle approval has no band either', async () => {
    priors({ rtf: 0.3 });
    const result = await scoreSubmissionDraft(DRAFT);
    expect(result.firstCycleApproval.probability).toBeNull();
    expect(result.firstCycleApproval.nonApprovalBand).toBeNull();
  });
});
