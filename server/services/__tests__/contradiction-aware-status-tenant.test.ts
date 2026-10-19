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

describe('an incomplete scan is not rendered as an absence of contradictions', () => {
  /*
   * The same sentence this file already holds, for the other way of reaching a 0.
   *
   * "A failed read left the counts at 0 and the summary at 'No pending decisions or
   * contradictions'; it now fails, rather than reporting none" — the method's own comment.
   * A scan that SUCCEEDS but bounded or skipped its own work reaches the same 0 by a
   * different road: detectCrossArtifactContentConflict dropped every significant issue past
   * the tenth, and returned an empty array when fewer than two artifacts were readable.
   * Rendering that 0 as "No pending decisions or contradictions" asserts cleanliness about a
   * comparison that did not happen.
   */
  it('says the scan was incomplete instead of "no contradictions"', async () => {
    H.buildContext.mockResolvedValue({
      unresolvedCount: 0,
      blockingCount: 0,
      overlayActiveCount: 0,
      scanIncomplete: true,
      crossArtifactCoverage: {
        sectionsRead: 1, sectionsSkippedShort: 0, issuesFound: 0,
        findingsRecorded: 0, truncated: false, comparedNothing: true,
      },
    });

    const s = await decisionLifecycleService.computeContradictionAwareStatus('42', { organizationId: 77 });

    expect(s.contradictionScanIncomplete).toBe(true);
    expect(s.summary).not.toBe('No pending decisions or contradictions');
    expect(s.summary).toMatch(/incomplete/i);
  });

  it('a truncated scan says so, and does not read as a complete count', async () => {
    H.buildContext.mockResolvedValue({
      unresolvedCount: 10,
      blockingCount: 0,
      overlayActiveCount: 0,
      scanIncomplete: true,
      crossArtifactCoverage: {
        sectionsRead: 12, sectionsSkippedShort: 0, issuesFound: 25,
        findingsRecorded: 10, truncated: true, comparedNothing: false,
      },
    });

    const s = await decisionLifecycleService.computeContradictionAwareStatus('42', { organizationId: 77 });

    expect(s.contradictionScanIncomplete).toBe(true);
    // The count is a floor, and the sentence must not present it as the total.
    expect(s.summary).toMatch(/incomplete|at least/i);
  });

  it('a complete scan with nothing to report still says so plainly', async () => {
    H.buildContext.mockResolvedValue({
      unresolvedCount: 0, blockingCount: 0, overlayActiveCount: 0, scanIncomplete: false,
    });

    const s = await decisionLifecycleService.computeContradictionAwareStatus('42', { organizationId: 77 });

    expect(s.contradictionScanIncomplete).toBe(false);
    expect(s.summary).toBe('No pending decisions or contradictions');
  });
});
