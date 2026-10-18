/** Connection lifecycle proof only; SQL rollback and locking are covered by the dbtest. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  query: vi.fn(), clientQuery: vi.fn(), connect: vi.fn(), release: vi.fn(), generate: vi.fn(),
}));
vi.mock('../../../../db', () => ({ pool: { query: H.query, connect: H.connect } }));
vi.mock('../../../notifications/notification-service', () => ({ createNotification: vi.fn() }));
vi.mock('../generator', () => ({ generateSchedule: H.generate }));

import { generateProjectSchedule } from '../service';

const params = { orgId: 3, projectId: 12, projectType: 'ind' };
const reply = async (sql: string) => ({
  rows: sql.includes('SELECT id FROM projects') ? [{ id: 12 }]
    : sql.includes('RETURNING id, version') ? [{ id: 5, version: 1 }] : [],
});

beforeEach(() => {
  vi.resetAllMocks();
  H.query.mockImplementation(reply);
  H.clientQuery.mockImplementation(reply);
  H.connect.mockResolvedValue({ query: H.clientQuery, release: H.release });
  H.generate.mockReturnValue({
    projectType: 'ind', framework: 'FDA', basisSummary: 'Recorded basis', confidence: 'medium',
    baselineDate: new Date('2026-10-17'), targetDate: new Date('2027-01-17'),
    milestones: [{
      key: 'review', title: 'Review', sortOrder: 1, category: 'regulatory', dependsOn: [],
      baselineDate: new Date('2026-10-17'), targetDate: new Date('2027-01-17'),
    }],
  });
});

describe('schedule generation transaction lifecycle', () => {
  it('does not acquire a connection when deterministic generation fails', async () => {
    const failure = new Error('Invalid schedule inputs');
    H.generate.mockImplementation(() => { throw failure; });
    await expect(generateProjectSchedule(params)).rejects.toBe(failure);
    expect(H.connect).not.toHaveBeenCalled();
    expect(H.query).not.toHaveBeenCalled();
  });

  it('propagates connection acquisition failure without a pool write', async () => {
    const failure = new Error('No connection available');
    H.connect.mockRejectedValue(failure);
    await expect(generateProjectSchedule(params)).rejects.toBe(failure);
    expect(H.query).not.toHaveBeenCalled();
    expect(H.release).not.toHaveBeenCalled();
  });

  it('commits after its response reads and releases a healthy connection', async () => {
    await generateProjectSchedule(params);
    const queries = H.clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(queries[0]).toBe('BEGIN');
    expect(queries.at(-1)).toBe('COMMIT');
    expect(queries.slice(1, -1).some(sql => sql.includes('SELECT * FROM project_schedule_revisions'))).toBe(true);
    expect(H.query).not.toHaveBeenCalled();
    expect(H.release).toHaveBeenCalledExactlyOnceWith();
  });

  it('rolls back a response-load failure and preserves the original error', async () => {
    const failure = new Error('Could not read generated goals');
    H.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM project_schedule_goals')) throw failure;
      return reply(sql);
    });
    await expect(generateProjectSchedule(params)).rejects.toBe(failure);
    expect(H.clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(H.clientQuery).not.toHaveBeenCalledWith('COMMIT');
    expect(H.release).toHaveBeenCalledExactlyOnceWith();
  });

  it('evicts the connection if BEGIN cannot be confirmed', async () => {
    const failure = new Error('BEGIN connection failure');
    H.clientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN') throw failure;
      return reply(sql);
    });
    await expect(generateProjectSchedule(params)).rejects.toBe(failure);
    expect(H.release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('evicts on rollback failure without masking the write failure', async () => {
    const failure = new Error('Milestone insert refused');
    H.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO project_workflow_stages')) throw failure;
      if (sql === 'ROLLBACK') throw new Error('Lost connection during rollback');
      return reply(sql);
    });
    await expect(generateProjectSchedule(params)).rejects.toBe(failure);
    expect(H.release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('rejects and evicts an uncertain COMMIT even if cleanup succeeds', async () => {
    const failure = new Error('COMMIT acknowledgement lost');
    H.clientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'COMMIT') throw failure;
      return reply(sql);
    });
    await expect(generateProjectSchedule(params)).rejects.toBe(failure);
    expect(H.clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(H.release).toHaveBeenCalledExactlyOnceWith(true);
  });
});
