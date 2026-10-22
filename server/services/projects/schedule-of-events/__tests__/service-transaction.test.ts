/** Caller-owned connection lifecycle; real rollback/locking also run in the dbtest. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  poolQuery: vi.fn(), connect: vi.fn(), query: vi.fn(), discard: vi.fn(), generate: vi.fn(),
}));
vi.mock('../../../../db', () => ({ pool: { query: H.poolQuery, connect: H.connect } }));
vi.mock('../../../notifications/notification-service', () => ({ createNotification: vi.fn() }));
vi.mock('../../../c2c/current-program-access', async original => {
  const actual = await original<typeof import('../../../c2c/current-program-access')>();
  return { ...actual, readCurrentProgramActor: async () => ({ userId: 99, role: 'member' }) };
});
vi.mock('../../../report-os/project-access', () => ({ canAccessReportProject: async () => true }));
vi.mock('../generator', () => ({ generateSchedule: H.generate }));

import { generateProjectSchedule } from '../service';

const params = { orgId: 3, projectId: 12, projectType: 'ind' };
const executor = { query: H.query, discard: H.discard };
const context = { actorUserId: 99, executor };
const reply = async (sql: string) => ({
  rows: sql.includes('SELECT id, status FROM projects') ? [{ id: 12, status: 'active' }]
    : sql.includes('RETURNING id, version') ? [{ id: 5, version: 1 }] : [],
});

beforeEach(() => {
  vi.resetAllMocks();
  H.query.mockImplementation(reply);
  H.discard.mockResolvedValue(undefined);
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
  it('does not query when deterministic generation fails', async () => {
    const failure = new Error('Invalid schedule inputs');
    H.generate.mockImplementation(() => { throw failure; });
    await expect(generateProjectSchedule(params,context)).rejects.toBe(failure);
    expect(H.query).not.toHaveBeenCalled(); expect(H.connect).not.toHaveBeenCalled();
  });
  it('refuses absent caller context without acquiring another connection', async () => {
    await expect(generateProjectSchedule(params,undefined as unknown as typeof context)).rejects.toMatchObject({status:403});
    expect(H.query).not.toHaveBeenCalled(); expect(H.connect).not.toHaveBeenCalled(); expect(H.poolQuery).not.toHaveBeenCalled();
  });
  it('commits after its response reads on the caller connection', async () => {
    await generateProjectSchedule(params,context);
    const queries = H.query.mock.calls.map(([sql]) => String(sql));
    expect(queries[0]).toBe('BEGIN'); expect(queries.at(-1)).toBe('COMMIT');
    expect(queries.slice(1,-1).some(sql => sql.includes('SELECT * FROM project_schedule_revisions'))).toBe(true);
    expect(queries.filter(sql => sql.includes('SELECT id, status FROM projects') && sql.includes('FOR UPDATE'))).toHaveLength(2);
    expect(H.connect).not.toHaveBeenCalled(); expect(H.poolQuery).not.toHaveBeenCalled(); expect(H.discard).not.toHaveBeenCalled();
  });
  it('rolls back a response-load failure and preserves the original error', async () => {
    const failure = new Error('Could not read generated goals');
    H.query.mockImplementation(async (sql: string) => { if (sql.includes('SELECT * FROM project_schedule_goals')) throw failure; return reply(sql); });
    await expect(generateProjectSchedule(params,context)).rejects.toBe(failure);
    expect(H.query).toHaveBeenCalledWith('ROLLBACK'); expect(H.query).not.toHaveBeenCalledWith('COMMIT'); expect(H.discard).not.toHaveBeenCalled();
  });
  it('discards if BEGIN cannot be confirmed without pretending to roll back', async () => {
    const failure = new Error('BEGIN connection failure');
    H.query.mockRejectedValue(failure);
    await expect(generateProjectSchedule(params,context)).rejects.toBe(failure);
    expect(H.discard).toHaveBeenCalledExactlyOnceWith(failure); expect(H.query).not.toHaveBeenCalledWith('ROLLBACK');
  });
  it('discards on rollback failure without masking the original write failure', async () => {
    const failure = new Error('Milestone insert refused');
    H.query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO project_workflow_stages')) throw failure;
      if (sql === 'ROLLBACK') throw new Error('Lost connection during rollback');
      return reply(sql);
    });
    await expect(generateProjectSchedule(params,context)).rejects.toBe(failure);
    expect(H.discard).toHaveBeenCalledExactlyOnceWith(failure); expect(H.query).not.toHaveBeenCalledWith('COMMIT');
  });
  it('rejects and discards an uncertain COMMIT without retrying or issuing ROLLBACK', async () => {
    const failure = new Error('COMMIT acknowledgement lost');
    H.query.mockImplementation(async (sql: string) => { if (sql === 'COMMIT') throw failure; return reply(sql); });
    await expect(generateProjectSchedule(params,context)).rejects.toBe(failure);
    expect(H.discard).toHaveBeenCalledExactlyOnceWith(failure);
    expect(H.query.mock.calls.filter(([sql]) => sql === 'COMMIT')).toHaveLength(1); expect(H.query).not.toHaveBeenCalledWith('ROLLBACK');
  });
  it('preserves the uncertain COMMIT failure even if discard also fails', async () => {
    const failure = new Error('COMMIT acknowledgement lost');
    H.query.mockImplementation(async (sql: string) => { if (sql === 'COMMIT') throw failure; return reply(sql); });
    H.discard.mockRejectedValue(new Error('Discard cleanup unavailable'));
    await expect(generateProjectSchedule(params,context)).rejects.toBe(failure);
    expect(H.discard).toHaveBeenCalledExactlyOnceWith(failure); expect(H.query).not.toHaveBeenCalledWith('ROLLBACK');
  });
});
