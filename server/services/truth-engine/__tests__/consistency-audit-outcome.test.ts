/**
 * A consistency check reports its 21 CFR Part 11 §11.10(e) audit row.
 *
 * `runConsistencyCheck` records an AI_GENERATE row for every check it persists.
 * The failure path already checked `persisted`; the success path awaited the
 * write and discarded it, so the findings were stored and answered whether or
 * not the record of who ran the check existed. It now returns the outcome with
 * the findings, and AnA's `check_consistency` passes it on (WO-16C hand-on
 * item 2). The route reports it in headers: see
 * server/routes/__tests__/submissions-consistency-audit-outcome.test.ts.
 *
 * The store and the gateway are stubbed: what is under test is the outcome.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  logAction: vi.fn(async (..._a: unknown[]) => ({ persisted: true, chained: true, tamperProof: true }) as unknown),
}));

vi.mock('../../auditService', () => ({ default: { logAction: (...a: unknown[]) => h.logAction(...a) } }));
vi.mock('../../ai-gateway', () => ({
  getGateway: () => ({
    route: async () => ({
      content: JSON.stringify({
        findings: [
          { status: 'conflict', leftRef: '2.7.3', rightRef: 'CSR-001', detail: 'Enrollment 186 vs 120' },
          { status: 'match', leftRef: '2.7.3', rightRef: 'CSR-002', detail: null },
        ],
      }),
    }),
  }),
}));

// The two statements the check issues: the ownership SELECT and one INSERT per finding.
vi.mock('../../../db', () => {
  let n = 0;
  const select = () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 11 }] }) }) });
  const insert = () => ({
    values: (v: Record<string, unknown>) => ({ returning: async () => [{ id: ++n, ...v }] }),
  });
  return { db: { select, insert }, pool: {}, getPool: () => ({}) };
});

import { runConsistencyCheck } from '../truth-engine-service';

const lost = { persisted: false, chained: false, tamperProof: false, error: 'relation "audit_logs" is unavailable' };
const CTX = { organizationId: 7, userId: 3 };
const PARAMS = {
  submissionId: 11,
  dimension: 'enrollment',
  left: { ref: '2.7.3', text: '186 subjects were enrolled.' },
  right: [{ ref: 'CSR-001', text: '120 subjects were enrolled.' }],
};

beforeEach(() => {
  h.logAction.mockReset();
  h.logAction.mockResolvedValue({ persisted: true, chained: true, tamperProof: true });
});

describe('runConsistencyCheck reports its audit row', () => {
  it('returns the findings with a recorded row', async () => {
    const r = await runConsistencyCheck(PARAMS, CTX);
    expect(r.findings).toHaveLength(2);
    expect(r.auditTrail).toEqual({ persisted: true, chained: true });
  });

  it('says so when the row was not written, without the store text', async () => {
    h.logAction.mockResolvedValueOnce(lost);
    const r = await runConsistencyCheck(PARAMS, CTX);
    expect(r.findings, 'the persisted findings stand').toHaveLength(2);
    expect(r.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    expect(JSON.stringify(r)).not.toMatch(/audit_logs/);
  });
});

describe("AnA's check_consistency passes the outcome on", () => {
  it('tells AnA the record was not written', async () => {
    h.logAction.mockResolvedValueOnce(lost);
    const { getToolHandler } = await import('../../ana/AnaToolExecutor');
    const res = JSON.parse(
      await getToolHandler('check_consistency')!(
        { submission_id: 11, dimension: 'enrollment', left: PARAMS.left, right: PARAMS.right },
        { ...CTX, humanConfirmed: true } as never,
      ),
    );
    expect(res.ok).toBe(true);
    expect(res.conflicts).toBe(1);
    expect(res.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    expect(String(res.message)).toMatch(/audit entry .* could not be written/i);
  });
});
