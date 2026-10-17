import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn() }, writeChainedAuditRow: h.write }));
import { recordAuditRow } from '../audit-write-outcome';

beforeEach(() => { h.write.mockReset().mockResolvedValue(undefined); });
const entry = { organizationId: 7, userId: 4, action: 'SYNTHETIC_AUDIT', resourceType: 'document', resourceId: 12 };
describe('request-owned ancillary audit transaction completion', () => {
  it('returns a confirmed receipt only after COMMIT succeeds', async () => {
    const client = { query: vi.fn(async (_sql: string) => ({ rows: [] })), release: vi.fn() };
    expect(await recordAuditRow(entry, { query: client.query, connect: async () => client })).toEqual({ persisted: true, chained: true });
    expect(client.query.mock.calls.map(args => args[0])).toEqual(['BEGIN', 'COMMIT']);
    expect(client.release).toHaveBeenCalledExactlyOnceWith(undefined);
  });
  it('rolls back a rejected write before COMMIT, with a bounded receipt', async () => {
    h.write.mockRejectedValueOnce(new Error('PRIVATE audit diagnostic'));
    const client = { query: vi.fn(async (_sql: string) => ({ rows: [] })), release: vi.fn() };
    const outcome = await recordAuditRow(entry, { query: client.query, connect: async () => client });
    expect(outcome).toMatchObject({ persisted: false });
    expect(outcome).not.toHaveProperty('unconfirmed');
    expect(client.query.mock.calls.map(args => args[0])).toEqual(['BEGIN', 'ROLLBACK']);
    expect(JSON.stringify(outcome)).not.toContain('PRIVATE');
  });
  it('discards uncertain COMMIT without claiming rollback or absence', async () => {
    const error = new Error('PRIVATE lost COMMIT response');
    const client = { query: vi.fn(async (sql: string) => { if (sql === 'COMMIT') throw error; return { rows: [] }; }), release: vi.fn() };
    const outcome = await recordAuditRow(entry, { query: client.query, connect: async () => client });
    expect(outcome).toMatchObject({ persisted: false, unconfirmed: true });
    expect(outcome).toHaveProperty('message', expect.stringContaining('could not be confirmed'));
    expect(client.query.mock.calls.map(args => args[0])).toEqual(['BEGIN', 'COMMIT']);
    expect(client.release).toHaveBeenCalledExactlyOnceWith(error);
    expect(JSON.stringify(outcome)).not.toContain('PRIVATE');
  });
  it('discards failed rollback instead of returning uncertain transaction state to the pool', async () => {
    h.write.mockRejectedValueOnce(new Error('write refused'));
    const error = new Error('rollback response lost');
    const client = { query: vi.fn(async (sql: string) => { if (sql === 'ROLLBACK') throw error; return { rows: [] }; }), release: vi.fn() };
    expect(await recordAuditRow(entry, { query: client.query, connect: async () => client })).toMatchObject({ persisted: false });
    expect(client.release).toHaveBeenCalledExactlyOnceWith(error);
  });
});
