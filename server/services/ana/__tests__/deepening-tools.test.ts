import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const names = ALL_ANA_TOOLS.map(t => t.name);

describe('deepening tools — registration', () => {
  it.each([
    'assess_batch_poolability',
    'assess_recorded_batch_poolability',
    'get_submission_readiness_twin',
    'assess_benefit_risk',
  ])('%s is defined and registered', (name) => {
    expect(names).toContain(name);
    expect(typeof getToolHandler(name)).toBe('function');
  });
});

/**
 * The variant that reads the stability register rather than taking pasted
 * numbers. Its assessment and every eligibility refusal live in
 * services/cmc/recorded-stability and are covered there and at the route; what
 * matters HERE is the boundary the tool owns — tenant scope, and not answering
 * from a partial set.
 */
describe('assess_recorded_batch_poolability', () => {
  const call = (input: Record<string, unknown>, ctx?: Record<string, unknown>) =>
    getToolHandler('assess_recorded_batch_poolability')!(input, ctx as never);

  it('refuses without an organization context rather than reading across tenants', async () => {
    expect(await call({ study_ids: [1, 2] })).toMatch(/organization context is required/i);
  });

  it('needs at least two distinct ids', async () => {
    for (const study_ids of [[1], [1, 1], [], ['x'], [0, -3]]) {
      const out = JSON.parse(await call({ study_ids }, { organizationId: 101 }));
      expect(out.status).toBe('needs_parameters');
    }
  });

  it('will not assess a partial set when an id is not in this organization', async () => {
    // No study exists for these ids under org 101, so every id is unresolved.
    // Answering from what WAS found would silently narrow the question the user
    // asked, and a pooled verdict over a subset is a different claim.
    const out = JSON.parse(await call({ study_ids: [90001, 90002] }, { organizationId: 101 }));
    expect(['not_found', 'error']).toContain(out.status ?? 'error');
    if (out.status === 'not_found') {
      expect(out.message).toMatch(/do not assess a partial set/);
    }
  });
});

describe('assess_batch_poolability', () => {
  it('decides poolability and a shelf life', async () => {
    const out = JSON.parse(await getToolHandler('assess_batch_poolability')!({
      batches: [
        { batchId: 'A', data: [{ time: 0, value: 101.2 }, { time: 6, value: 98.7 }, { time: 12, value: 97.3 }, { time: 18, value: 95.2 }] },
        { batchId: 'B', data: [{ time: 0, value: 100.6 }, { time: 6, value: 99.3 }, { time: 12, value: 96.8 }, { time: 18, value: 95.6 }] },
      ],
      specLimit: 95, direction: 'decreasing',
    }));
    expect(out.status).toBe('computed');
    expect(['pooled', 'minimum-of-batches']).toContain(out.result.decision);
    expect(out.result.slopeTest).toHaveProperty('pValue');
  });
  it('requires ≥2 batches', async () => {
    const out = JSON.parse(await getToolHandler('assess_batch_poolability')!({ batches: [{ batchId: 'A', data: [{ time: 0, value: 1 }, { time: 1, value: 1 }, { time: 2, value: 1 }] }], specLimit: 0, direction: 'decreasing' }));
    expect(out.status).toBe('needs_parameters');
  });
});

describe('assess_benefit_risk', () => {
  it('computes a structured benefit-risk result', async () => {
    const out = JSON.parse(await getToolHandler('assess_benefit_risk')!({
      benefits: [{ name: 'Efficacy', weight: 3, score: 80 }],
      risks: [{ name: 'AEs', weight: 1, score: 30 }],
    }));
    expect(out.status).toBe('computed');
    expect(out.result.favorability).toBe('favorable');
    expect(out.result.disclaimer).toMatch(/decision aid/i);
  });
  it('validates inputs', async () => {
    const out = JSON.parse(await getToolHandler('assess_benefit_risk')!({ benefits: [], risks: [{ name: 'R', weight: 1, score: 1 }] }));
    expect(out.status).toBe('needs_parameters');
  });
});

/**
 * The Submission Readiness Twin — five live routes, integration-tested, and
 * until now no caller anywhere in the client.
 *
 * The service's own `getEmptyDashboard()` returns overallScore 0 and
 * approvalProbability 0 when no assessment exists, which is byte-identical to a
 * genuinely terrible program. A model handed that payload reports a zero
 * readiness score as fact. That distinction is the handler's job, and it is what
 * these tests exist for.
 */
describe('get_submission_readiness_twin', () => {
  const call = (input: Record<string, unknown>, ctx?: Record<string, unknown>) =>
    getToolHandler('get_submission_readiness_twin')!(input, ctx as never);

  it('refuses without an organization context', async () => {
    expect(await call({ program_id: 'p1' })).toMatch(/organization context is required/i);
  });

  it('requires a program id', async () => {
    for (const program_id of ['', '   ', undefined, 42]) {
      const out = JSON.parse(await call({ program_id }, { organizationId: 101 }));
      expect(out.status).toBe('needs_parameters');
    }
  });

  it('will not report a score for a program outside the caller\'s organization', async () => {
    const out = JSON.parse(
      await call({ program_id: '00000000-0000-4000-8000-000000000000' }, { organizationId: 101 }),
    );
    // Either the tenant proof fails (no such program here) or the environment
    // has no innovation schema at all. Neither may yield a readiness number.
    expect(['not_found', 'error']).toContain(out.status ?? 'error');
    expect(out.dashboard).toBeUndefined();
    if (out.status === 'not_found') {
      expect(out.message).toMatch(/Do not report a readiness score/);
    }
  });
});
