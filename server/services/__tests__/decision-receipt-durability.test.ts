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

const { calls, createMock } = vi.hoisted(() => ({
  calls: [] as Array<{ text: string; params: unknown[] }>,
  createMock: vi.fn(),
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
  decisionRecordService: { create: createMock },
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
