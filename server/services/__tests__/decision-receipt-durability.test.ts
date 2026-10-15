/**
 * A 21 CFR Part 11 receipt that lives only in a process's heap is not a record.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `decision-lifecycle-service.ts` recorded the formal decision and its receipt
 * for every governed authoring action — promote, approve, correct, harmonize —
 * and BOTH writes were fire-and-forget:
 *
 *     persistDecision(decision).then(ok => { if (!ok) log.warn(…) });   // unawaited
 *     this.persistReceipt(receipt).catch(err => log.warn(…));           // unawaited
 *
 * Each method then returned a real id, and eight routes answered 200 with it.
 * The id resolved from `decisionStore` / `receiptStore` — module-level Maps —
 * so it looked correct until a restart, and was invisible to every other worker.
 *
 * The receipt write could not have succeeded anyway.
 * `decision_receipts.organization_id` is `INTEGER NOT NULL DEFAULT 1` and the
 * INSERT never named the column, so every receipt was attributed to
 * organisation 1 whoever acted — and the table's tenant policy
 * (`relrowsecurity=t, relforcerowsecurity=t`) then refused the row for every
 * other tenant. The refusal was swallowed at `log.debug` reading
 * "Receipt persistence skipped (table may not exist)". The table exists. It
 * held 0 rows.
 *
 * ── What these tests hold ────────────────────────────────────────────────────
 * Both writes are awaited, the receipt carries its own tenant, and a failure
 * refuses rather than handing back an id for a record that was never written.
 *
 * @module server/services/__tests__/decision-receipt-durability
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { calls, createMock, getByCodeMock, transitionMock } = vi.hoisted(() => ({
  calls: [] as Array<{ text: string; params: unknown[] }>,
  createMock: vi.fn(),
  getByCodeMock: vi.fn(),
  transitionMock: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  pool: {
    query: vi.fn(async (text: string, params: unknown[]) => {
      calls.push({ text, params });
      return { rows: [], rowCount: 1 };
    }),
  },
}));

vi.mock('../decision-record-service.js', () => ({
  decisionRecordService: {
    create: createMock,
    getByDecisionCode: getByCodeMock,
    transition: transitionMock,
  },
}));

import { decisionLifecycleService } from '../decision-lifecycle-service';

const ORG = 77;

function decisionOpts() {
  return {
    projectId: '42',
    organizationId: ORG,
    kind: 'promotion-decision' as const,
    governedAction: 'approve-artifact' as const,
    summary: 'Approve section 3.2.P.5',
    rationale: 'All checks cleared',
    sourceSignals: [],
    createdByType: 'human' as const,
    createdById: 'u1',
  };
}

function receiptOpts(decisionId: string) {
  return {
    organizationId: ORG,
    decisionId,
    projectId: '42',
    recommendation: { summary: 'Approve', actionIds: ['approve-artifact'], rationale: 'r' },
    confirmation: { accepted: true, confirmedById: 'u1' },
    execution: { executed: true, executedById: 'u1', executionMethod: 'api' },
  };
}

beforeEach(() => {
  calls.length = 0;
  createMock.mockReset().mockResolvedValue({ id: 'row_1' });
  getByCodeMock.mockReset().mockResolvedValue({ id: 'row_1' });
  transitionMock.mockReset().mockResolvedValue({ id: 'row_1' });
});

describe('the receipt carries the tenant that acted', () => {
  it('names organization_id in the INSERT rather than leaving it to DEFAULT 1', async () => {
    const decision = await decisionLifecycleService.recordGovernedActionDecision(decisionOpts());
    await decisionLifecycleService.createReceipt(receiptOpts(decision.id));

    const insert = calls.find(c => /INSERT INTO decision_receipts/.test(c.text));
    expect(insert, 'the receipt was never written').toBeDefined();
    expect(insert!.text).toMatch(/organization_id/);
    expect(
      insert!.params,
      'the acting tenant must be a bound parameter, never the column DEFAULT',
    ).toContain(ORG);
  });
});

describe('a record that was not written is not reported as taken', () => {
  it('refuses the decision when its durable write fails', async () => {
    createMock.mockRejectedValueOnce(new Error('23514 check constraint'));

    await expect(
      decisionLifecycleService.recordGovernedActionDecision(decisionOpts()),
    ).rejects.toThrow(/could not be recorded durably/);
  });

  it('refuses the decision when no tenant was supplied, rather than attributing it', async () => {
    await expect(
      decisionLifecycleService.recordGovernedActionDecision({
        ...decisionOpts(),
        organizationId: undefined as unknown as number,
      }),
    ).rejects.toThrow(/could not be recorded durably/);
  });

  it('refuses the receipt when its durable write fails', async () => {
    const decision = await decisionLifecycleService.recordGovernedActionDecision(decisionOpts());

    const { pool } = await import('../../db.js');
    (pool.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('new row violates row-level security policy'),
    );

    await expect(
      decisionLifecycleService.createReceipt(receiptOpts(decision.id)),
    ).rejects.toThrow(/could not be recorded durably/);
  });

  it('returns the record when both writes land', async () => {
    const decision = await decisionLifecycleService.recordGovernedActionDecision(decisionOpts());
    const receipt = await decisionLifecycleService.createReceipt(receiptOpts(decision.id));

    expect(decision.id).toBeTruthy();
    expect(receipt.id).toBeTruthy();
  });
});

describe('a transition that was not written leaves the decision where it was', () => {
  /* The refusal said "The in-memory record was not advanced" — but the status
     and its stamp were set before the write was attempted, so the in-memory
     decision read 'confirmed' (and getDecision served it) after a transition
     the ledger never recorded. */
  it('when the ledger row cannot be found', async () => {
    const decision = await decisionLifecycleService.recordGovernedActionDecision(decisionOpts());
    getByCodeMock.mockResolvedValueOnce(null);

    const r = await decisionLifecycleService.transitionDecision(decision.id, 'confirmed', { actorId: 'u1' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/could not be transitioned to confirmed durably/);
    const after = decisionLifecycleService.getDecision(decision.id, ORG);
    expect(after?.status).toBe('recommended');
    expect(after?.confirmedById).toBeUndefined();
    expect(after?.confirmedAt).toBeUndefined();
  });

  it('when the ledger refuses the write', async () => {
    const decision = await decisionLifecycleService.recordGovernedActionDecision(decisionOpts());
    transitionMock.mockRejectedValueOnce(new Error('connection terminated'));

    const r = await decisionLifecycleService.transitionDecision(decision.id, 'confirmed', { actorId: 'u1' });
    expect(r.success).toBe(false);
    expect(decisionLifecycleService.getDecision(decision.id, ORG)?.status).toBe('recommended');
  });

  it('when the ledger UPDATE matches no row', async () => {
    const decision = await decisionLifecycleService.recordGovernedActionDecision(decisionOpts());
    transitionMock.mockResolvedValueOnce(null);

    const r = await decisionLifecycleService.transitionDecision(decision.id, 'confirmed', { actorId: 'u1' });
    expect(r.success).toBe(false);
    expect(decisionLifecycleService.getDecision(decision.id, ORG)?.status).toBe('recommended');
  });

  it('records the role an escalation goes to, not the person who escalated', async () => {
    const decision = await decisionLifecycleService.recordGovernedActionDecision(decisionOpts());
    await decisionLifecycleService.transitionDecision(decision.id, 'confirmed', { actorId: 'u1' });
    const r = await decisionLifecycleService.transitionDecision(decision.id, 'escalated', {
      actorId: 'u1', escalatedToRole: 'ra_lead', reason: 'conflicting dose',
    });
    expect(r.success).toBe(true);
    expect(transitionMock).toHaveBeenLastCalledWith('row_1', expect.objectContaining({
      actionState: 'escalated', performedBy: 'u1', escalatedTo: 'ra_lead', reason: 'conflicting dose',
    }));
  });

  it('advances once the write lands', async () => {
    const decision = await decisionLifecycleService.recordGovernedActionDecision(decisionOpts());
    const r = await decisionLifecycleService.transitionDecision(decision.id, 'confirmed', { actorId: 'u1' });
    expect(r.success).toBe(true);
    const after = decisionLifecycleService.getDecision(decision.id, ORG);
    expect(after?.status).toBe('confirmed');
    expect(after?.confirmedById).toBe('u1');
  });
});

describe('a preflight judgment is recorded, or says it was not', () => {
  /* recordPreflightDecision fired its durable write unawaited and returned
     the id regardless ("persisted to memory only"), so the verdict a
     promotion rests on was reported recorded when only this process held it. */
  const judgment = {
    projectId: '42',
    organizationId: ORG,
    kind: 'section-preflight-judgment' as const,
    sectionCode: '2.5',
    overall: 'ready',
    summary: 'All preflight checks pass (preflight durability case)',
    sourceSignals: [],
    // A decision names who made it; with no user it is refused (2026-10-15).
    createdById: 'u1',
  };

  it('refuses the judgment when its durable write fails, and does not keep it', async () => {
    createMock.mockRejectedValueOnce(new Error('connection terminated'));
    await expect(decisionLifecycleService.recordPreflightDecision(judgment)).rejects.toThrow(/could not be recorded durably/);
    expect(
      decisionLifecycleService.getProjectDecisions('42', { organizationId: ORG }).some((d) => d.summary === judgment.summary),
    ).toBe(false);
  });

  it('returns the judgment once it is written', async () => {
    const d = await decisionLifecycleService.recordPreflightDecision(judgment);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ decisionCode: `section-preflight-judgment:${d.id}` }));
  });
});

