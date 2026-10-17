import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  write: vi.fn(), query: vi.fn(),
}));
vi.mock('../../../db', () => ({ db: {}, pool: { query: (...args: unknown[]) => h.query(...args) } }));
vi.mock('../../auditService', () => ({ default: { logAction: (...args: unknown[]) => h.write(...args) } }));
import { decisionLineageService } from '../DecisionLineageService';

const params = { organizationId: 7, entityType: 'artifact', entityId: 42, action: 'review', performedBy: '9' };
beforeEach(() => {
  h.write.mockReset().mockResolvedValue({ persisted: true, chained: true, tamperProof: true });
  h.query.mockReset();
});

describe('decision record acknowledgment', () => {
  it('acknowledges the real queryable store and protects the attempt id from supplied details', async () => {
    const result = await decisionLineageService.recordDecision({ ...params, details: { decisionId: 'forged-attempt' } });
    expect(result).toMatchObject({ recorded: true, queryable: true, auditTrail: { persisted: true, chained: true } });
    expect(result.decisionId).toMatch(/^DEC-[a-f0-9-]{36}$/);
    expect(h.write.mock.calls[0][0].details.decisionId).toBe(result.decisionId);
  });
  it('distinguishes durable tamper-proof-only storage from a readable lineage entry', async () => {
    h.write.mockResolvedValue({ persisted: true, chained: false, tamperProof: true });
    expect(await decisionLineageService.recordDecision(params)).toMatchObject({ recorded: true, queryable: false,
      auditTrail: { persisted: true, chained: false } });
  });
  for (const rejected of [false, true]) {
    it(`does not call an unconfirmed attempt a saved decision (${rejected ? 'rejected' : 'resolved'} sink)`, async () => {
      if (rejected) h.write.mockRejectedValue(new Error('synthetic private audit store detail'));
      else h.write.mockResolvedValue({ persisted: false, chained: false, tamperProof: false, error: 'synthetic private audit store detail' });
      const result = await decisionLineageService.recordDecision(params);
      expect(result).toMatchObject({ recorded: false, queryable: false, auditTrail: { persisted: false,
        code: 'AUDIT_ROW_NOT_PERSISTED', message: 'The decision entry could not be confirmed. Review lineage before retrying.' } });
      expect(result.decisionId).toMatch(/^DEC-/); // an attempt identifier, never proof of completion
      expect(JSON.stringify(result)).not.toMatch(/private audit store|action itself completed/);
    });
  }
});

describe('exact tenant-scoped decision attempt readback', () => {
  it('returns the actual minimal receipt rather than all audit details', async () => {
    h.query.mockResolvedValue({ rows: [{ receipt: { auditRecordId: 'actual-row', recordedAt: '2026-10-14T00:00:00Z' },
      observed_at: new Date('2026-10-14T01:00:00Z') }] });
    const result = await decisionLineageService.readDecisionAttempt(7, 'DEC-attempt');
    expect(result).toEqual({ state: 'recorded', recorded: true, queryable: true, decisionId: 'DEC-attempt',
      auditRecordId: 'actual-row', recordedAt: '2026-10-14T00:00:00Z', asOf: '2026-10-14T01:00:00.000Z' });
    expect(h.query.mock.calls[0][1]).toEqual([7, 'DEC-attempt']);
  });
  it('distinguishes a confirmed empty read from an unavailable receipt store', async () => {
    h.query.mockResolvedValue({ rows: [{ receipt: null, observed_at: new Date('2026-10-14T01:00:00Z') }] });
    expect(await decisionLineageService.readDecisionAttempt(7, 'DEC-attempt')).toMatchObject({ state: 'not_found', recorded: false,
      queryable: false, attemptId: 'DEC-attempt' });
    h.query.mockRejectedValue(new Error('synthetic private query detail'));
    await expect(decisionLineageService.readDecisionAttempt(7, 'DEC-attempt')).rejects.toMatchObject({ code: 'DECISION_RECEIPT_UNAVAILABLE' });
  });
});
