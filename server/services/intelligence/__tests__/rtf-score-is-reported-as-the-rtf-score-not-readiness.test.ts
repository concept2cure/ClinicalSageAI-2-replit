/**
 * scoreSubmissionDraft reports its refuse-to-file score under that name, not as
 * readiness.
 *
 * The result carried `blendedReadiness`: the completeness engine's rule-based
 * RTF score (100 less deductions for missing required sections, weak sections,
 * open issues and escalations), blended with the model's predicted RTF score
 * only when a trained model contributes, so at cold start it is the rule-based
 * score itself. "Readiness" named it as something else: readiness here is the
 * required-section completeness and the composite computeReadiness builds. It
 * is now `refuseToFileScore`, and the composite's riskScores carry the same.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPool } from '../../../../tests/setup';

vi.mock('../../../db/runtime', () => ({ pool: mockPool, getPool: () => mockPool, db: mockPool, getDb: () => mockPool }));

const { scoreSubmissionDraft, computeReadiness } = await import('../regulatory-intelligence');
const { _invalidateModelCacheForTests } = await import('../risk-model');
const { requiredSectionsFor } = await import('../../ectd/required-sections');

// Every required NDA section but one, and one open escalation: 100 - 20 - 5.
const REQUIRED = [...(requiredSectionsFor('NDA') ?? [])];
const NDA_DRAFT = {
  organizationId: 42,
  submissionType: 'NDA',
  targetAgency: 'FDA',
  presentSections: REQUIRED.slice(1),
  openEscalations: 1,
};

beforeEach(() => {
  _invalidateModelCacheForTests();
  mockPool.query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 }); // no model, no prior
});

describe('the refuse-to-file score', () => {
  it('is reported as refuseToFileScore — the rule-based RTF score at cold start — and not as readiness', async () => {
    const result = await scoreSubmissionDraft(NDA_DRAFT);

    expect(result.completeness.rtfRisk.rtfScore).toBe(75);
    expect(result).toHaveProperty('refuseToFileScore', 75);
    expect(result).not.toHaveProperty('blendedReadiness');
  });

  it('is carried under the same name inside the composite readiness summary', async () => {
    const summary = await computeReadiness(NDA_DRAFT);

    expect(summary.riskScores).toHaveProperty('refuseToFileScore', summary.riskScores.completeness.rtfRisk.rtfScore);
    expect(summary.riskScores).not.toHaveProperty('blendedReadiness');
  });
});
