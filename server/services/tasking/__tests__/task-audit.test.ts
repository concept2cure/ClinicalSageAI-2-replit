import { describe, it, expect, vi, beforeEach } from 'vitest';

const recordGovernedAction = vi.hoisted(() => vi.fn());
vi.mock('../../../db', () => ({ pool: { query: vi.fn() } }));
vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction }));

import { auditTaskAction } from '../task-audit';

beforeEach(() => vi.clearAllMocks());

describe('auditTaskAction', () => {
  it('records a governed lineage entry for a task mutation', async () => {
    recordGovernedAction.mockResolvedValue({ actionId: 'a', auditId: 'b', sha256Chain: 'c' });
    await auditTaskAction({
      orgId: 2,
      userId: 7,
      command: 'task.transition',
      taskId: 'TASK-1',
      payload: { from: 'pending', to: 'completed' },
    });
    expect(recordGovernedAction).toHaveBeenCalledTimes(1);
    const [, params] = recordGovernedAction.mock.calls[0];
    expect(params).toMatchObject({
      orgId: 2,
      userId: 7,
      command: 'task.transition',
      target: 'task:TASK-1',
      domain: 'tasking',
      surface: 'tasking-api',
    });
    expect(params.reason).toBeTruthy();
    expect(params.payload).toEqual({ from: 'pending', to: 'completed' });
  });

  it('uses a provided reason (trimmed) when present', async () => {
    recordGovernedAction.mockResolvedValue({});
    await auditTaskAction({
      orgId: 2,
      userId: 7,
      command: 'task.create',
      taskId: 'T',
      reason: '  needed for audit  ',
    });
    expect(recordGovernedAction.mock.calls[0][1].reason).toBe('needed for audit');
  });

  it('skips silently without a tenant, actor, or target (no attributionless row)', async () => {
    await auditTaskAction({ orgId: 2, userId: null, command: 'task.create', taskId: 'T' });
    await auditTaskAction({ orgId: 0, userId: 7, command: 'task.create', taskId: 'T' });
    await auditTaskAction({ orgId: 2, userId: 7, command: 'task.create', taskId: '' });
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it('never throws when the ledger write fails (best-effort)', async () => {
    recordGovernedAction.mockRejectedValue(new Error('db down'));
    await expect(
      auditTaskAction({ orgId: 2, userId: 7, command: 'task.link', taskId: 'T' }),
    ).resolves.toBeUndefined();
  });
});
