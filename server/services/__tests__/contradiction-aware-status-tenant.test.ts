/**
 * The contradiction-aware decision status is the caller's tenant's, and a
 * failed read is a failure — not "No pending decisions or contradictions".
 *
 * computeContradictionAwareStatus read contradictions for organization 1
 * ("Default org — real multi-tenant uses req context") and decisions with no
 * tenant at all, and caught any failure into zero counts. GET
 * /api/authoring-actions/contradiction-context serves it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const H = vi.hoisted(() => ({ buildContext: vi.fn() }));

vi.mock('../../db.js', () => ({ pool: { query: vi.fn(async () => ({ rows: [], rowCount: 1 })) } }));
vi.mock('../decision-record-service.js', () => ({
  decisionRecordService: {
    create: vi.fn(async () => ({ id: 'row_1' })),
    getByDecisionCode: vi.fn(async () => ({ id: 'row_1' })),
    transition: vi.fn(async () => ({ id: 'row_1' })),
  },
}));
vi.mock('../contradiction-engine-service.js', () => ({
  contradictionEngineService: { buildPreflightContradictionContext: H.buildContext },
}));

import { decisionLifecycleService } from '../decision-lifecycle-service';

beforeEach(() => {
  H.buildContext.mockReset();
  H.buildContext.mockResolvedValue({ unresolvedCount: 3, blockingCount: 1, overlayActiveCount: 0 });
});

describe('computeContradictionAwareStatus', () => {
  it("reads the caller's organization's contradictions, not organization 1's", async () => {
    const s = await decisionLifecycleService.computeContradictionAwareStatus('42', { organizationId: 77 });
    expect(H.buildContext).toHaveBeenCalledWith(77, 42, expect.any(Object));
    expect(s.contradictionCount).toBe(3);
    expect(s.summary).toMatch(/3 contradiction\(s\) \(1 blocking\)/);
  });

  it('counts only the caller organization\'s decisions', async () => {
    await decisionLifecycleService.recordGovernedActionDecision({
      projectId: '42', organizationId: 88, kind: 'reapproval-decision',
      governedAction: 'approve-artifact', summary: 'Other tenant', rationale: 'r',
      sourceSignals: [], createdByType: 'human', createdById: 'u9',
    });
    const s = await decisionLifecycleService.computeContradictionAwareStatus('42', { organizationId: 77 });
    expect(s.needsReapproval).toBe(false);
    expect(s.pendingConfirmations).toBe(0);
  });

  it('fails, rather than reporting no contradictions, when they cannot be read', async () => {
    H.buildContext.mockRejectedValue(new Error('relation "contradiction_findings" does not exist'));
    await expect(
      decisionLifecycleService.computeContradictionAwareStatus('42', { organizationId: 77 }),
    ).rejects.toThrow(/contradiction_findings/);
  });

  it('refuses to run without an organization', async () => {
    await expect(
      decisionLifecycleService.computeContradictionAwareStatus('42', {} as never),
    ).rejects.toThrow(/organization is required/);
    expect(H.buildContext).not.toHaveBeenCalled();
  });
});
