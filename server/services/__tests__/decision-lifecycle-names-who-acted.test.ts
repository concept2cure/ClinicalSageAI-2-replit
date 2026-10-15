/**
 * A formal decision, and each transition of it, names the user who acted — or
 * it is not recorded.
 *
 * decision-lifecycle-service wrote decided_by as the decision's creator TYPE —
 * 'human', 'ana' or 'system' — when no user id was given, and the literal
 * 'system' after that (`createdById || createdByType || 'system'`). A
 * transition with no actor was written to the ledger as performed by 'system'
 * (`actorId || 'system'`) and reported a success.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock, getByCodeMock, transitionMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  getByCodeMock: vi.fn(),
  transitionMock: vi.fn(),
}));

vi.mock('../../db.js', () => ({ pool: { query: vi.fn(async () => ({ rows: [], rowCount: 1 })) } }));
vi.mock('../decision-record-service.js', () => ({
  decisionRecordService: { create: createMock, getByDecisionCode: getByCodeMock, transition: transitionMock },
}));

import { decisionLifecycleService } from '../decision-lifecycle-service';
import { LedgerInputRefusal } from '../assumption-registry-service';

const ORG = 77;

const governed = (projectId: string, createdById?: string) => ({
  projectId,
  organizationId: ORG,
  kind: 'promotion-decision' as const,
  governedAction: 'approve-artifact' as const,
  summary: 'Approve section 3.2.P.5',
  rationale: 'All checks cleared',
  sourceSignals: [],
  createdByType: 'human' as const,
  ...(createdById ? { createdById } : {}),
});

const preflight = (projectId: string, createdById?: string) => ({
  projectId,
  organizationId: ORG,
  kind: 'section-preflight-judgment' as const,
  sectionCode: '2.5',
  overall: 'ready',
  summary: 'All preflight checks pass',
  sourceSignals: [],
  ...(createdById ? { createdById } : {}),
});

const refusalOf = (call: Promise<unknown>) => call.then(() => null, (e: unknown) => e);

beforeEach(() => {
  createMock.mockReset().mockResolvedValue({ id: 'row_1' });
  getByCodeMock.mockReset().mockResolvedValue({ id: 'row_1' });
  transitionMock.mockReset().mockResolvedValue({ id: 'row_1' });
});

describe('recording a formal decision', () => {
  it('refuses a governed-action decision no user is named as making, and keeps no copy of it', async () => {
    const err = await refusalOf(decisionLifecycleService.recordGovernedActionDecision(governed('P-1')));
    expect(err, 'the decision was recorded, decided by "human"').toBeInstanceOf(LedgerInputRefusal);
    expect(createMock).not.toHaveBeenCalled();
    expect(decisionLifecycleService.getProjectDecisions('P-1', { organizationId: ORG })).toEqual([]);
  });

  it('refuses a preflight judgment no user is named as running', async () => {
    const err = await refusalOf(decisionLifecycleService.recordPreflightDecision(preflight('P-2')));
    expect(err, 'the judgment was recorded, decided by "system"').toBeInstanceOf(LedgerInputRefusal);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('records the user who made it as the decider', async () => {
    await decisionLifecycleService.recordGovernedActionDecision(governed('P-3', 'u41'));
    await decisionLifecycleService.recordPreflightDecision(preflight('P-3', 'u42'));
    expect(createMock.mock.calls.map(([input]) => (input as { decidedBy: string }).decidedBy)).toEqual(['u41', 'u42']);
  });
});

describe('transitioning a formal decision', () => {
  it('refuses a transition nobody is named as making, and leaves the decision where it was', async () => {
    const decision = await decisionLifecycleService.recordGovernedActionDecision(governed('P-4', 'u41'));
    const r = await decisionLifecycleService.transitionDecision(decision.id, 'confirmed', {});
    expect(r.success, 'the transition was written as performed by "system"').toBe(false);
    expect(r.error).toMatch(/user/i);
    expect(transitionMock).not.toHaveBeenCalled();
    expect(decisionLifecycleService.getDecision(decision.id, ORG)?.status).toBe('recommended');
  });

  it('writes the transition as performed by the user who made it', async () => {
    const decision = await decisionLifecycleService.recordGovernedActionDecision(governed('P-5', 'u41'));
    const r = await decisionLifecycleService.transitionDecision(decision.id, 'confirmed', { actorId: 'u43' });
    expect(r.success).toBe(true);
    expect(transitionMock).toHaveBeenCalledWith('row_1', expect.objectContaining({ performedBy: 'u43' }));
  });
});
