/**
 * One open task per source record: the same task again changes nothing, a new
 * one closes the open task first, none closes it, and a failure never throws.
 * reconcileSourceTasks does the same for every key under one prefix at once
 * (training on a controlled document, one task per person), and
 * replaceSourceTask is its one-key case.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const H = vi.hoisted(() => ({
  open: [] as Array<{ taskId: string; status: string; metadata: unknown; sourceEntityId?: string }>,
  fail: false,
  create: vi.fn(async () => ({})),
  update: vi.fn(async () => ({})),
}));
vi.mock('../../../db', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => { if (H.fail) throw new Error('db down'); return H.open; } }) }),
  },
}));
vi.mock('../../unifiedTaskService', () => ({ default: { createUnifiedTask: H.create, updateTaskStatus: H.update } }));

import { reconcileSourceTasks, replaceSourceTask, type ReplaceSourceTask } from '../source-task';

const base = (over: Partial<ReplaceSourceTask> = {}): ReplaceSourceTask => ({
  organizationId: 3, sourceEntityType: 'capa_record', sourceEntityId: 'capa:x', closeAs: 'cancelled', actorId: 42,
  same: (m) => m.due === '2026-11-30',
  next: { moduleType: 'Quality', title: 'Close CAPA-007', dueDate: new Date('2026-11-30T00:00:00Z'), metadata: { due: '2026-11-30' } },
  ...over,
});

beforeEach(() => { H.open = []; H.fail = false; H.create.mockClear(); H.update.mockClear(); });

describe('replaceSourceTask', () => {
  it('leaves the open task when it already records the same thing', async () => {
    H.open = [{ taskId: 't1', status: 'pending', metadata: { due: '2026-11-30' } }];
    expect(await replaceSourceTask(base())).toBe('unchanged');
    expect(H.update).not.toHaveBeenCalled();
    expect(H.create).not.toHaveBeenCalled();
  });

  it('closes the open task, then writes the next under the organisation, the source and the actor', async () => {
    H.open = [{ taskId: 't1', status: 'pending', metadata: { due: '2026-10-31' } }];
    expect(await replaceSourceTask(base())).toBe('scheduled');
    expect(H.update).toHaveBeenCalledWith('t1', 'cancelled', 42, { organizationId: 3, expectedStatus: 'pending' });
    expect(H.create).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 3, sourceEntityType: 'capa_record', sourceEntityId: 'capa:x', createdById: 42, title: 'Close CAPA-007',
    }));
  });

  it('closes the open task as the act says and writes none when nothing is owed', async () => {
    H.open = [{ taskId: 't1', status: 'in_progress', metadata: {} }];
    expect(await replaceSourceTask(base({ next: null, closeAs: 'completed' }))).toBe('closed');
    expect(H.update).toHaveBeenCalledWith('t1', 'completed', 42, { organizationId: 3, expectedStatus: 'in_progress' });
    expect(H.create).not.toHaveBeenCalled();
  });

  it('reports a failure and never throws into the act it follows', async () => {
    H.fail = true;
    expect(await replaceSourceTask(base())).toBe('failed');
  });
});

describe('reconcileSourceTasks', () => {
  const task = (key: string, metadata: Record<string, unknown>, status = 'pending') => ({ taskId: `t-${key}`, status, metadata, sourceEntityId: key });
  const next = (title: string) => ({ moduleType: 'Quality' as const, title, metadata: { version: '2.0' } });
  const want = (title: string) => ({ next: next(title), same: (m: Record<string, unknown>) => m.version === '2.0' });

  it('keeps what is wanted, closes the rest as the act says, and writes what is missing', async () => {
    H.open = [
      task('qms-document:1:user:5', { version: '2.0' }),
      task('qms-document:1:user:6', { version: '1.0' }),
      task('qms-document:1:user:7', { version: '2.0' }),
    ];
    const result = await reconcileSourceTasks({
      organizationId: 3, sourceEntityType: 'qms_training', match: { prefix: 'qms-document:1:user:' }, actorId: 42,
      desired: new Map([['qms-document:1:user:5', want('five')], ['qms-document:1:user:6', want('six')], ['qms-document:1:user:8', want('eight')]]),
      closeAs: (key) => (key.endsWith(':7') ? 'completed' : 'cancelled'),
    });
    expect(result).toMatchObject({ kept: 1, closed: 2, failed: false });
    expect(result.written.map(w => w.sourceEntityId).sort()).toEqual(['qms-document:1:user:6', 'qms-document:1:user:8']);
    expect(H.update).toHaveBeenCalledWith('t-qms-document:1:user:6', 'cancelled', 42, { organizationId: 3, expectedStatus: 'pending' });
    expect(H.update).toHaveBeenCalledWith('t-qms-document:1:user:7', 'completed', 42, { organizationId: 3, expectedStatus: 'pending' });
    expect(H.create).toHaveBeenCalledTimes(2);
    expect(H.create).toHaveBeenCalledWith(expect.objectContaining({ sourceEntityId: 'qms-document:1:user:8', sourceEntityType: 'qms_training', organizationId: 3, title: 'eight' }));
  });

  it('never treats document 10 as under the prefix of document 1', async () => {
    H.open = [task('qms-document:10:user:5', { version: '1.0' })];
    const result = await reconcileSourceTasks({
      organizationId: 3, sourceEntityType: 'qms_training', match: { prefix: 'qms-document:1:user:' }, actorId: 42,
      desired: new Map([['qms-document:10:user:6', want('elsewhere')]]), closeAs: () => 'cancelled',
    });
    expect(result).toMatchObject({ kept: 0, closed: 0, written: [] });
    expect(H.update).not.toHaveBeenCalled();
    expect(H.create).not.toHaveBeenCalled();
  });

  it('reports a failure part way and never throws', async () => {
    H.fail = true;
    expect(await reconcileSourceTasks({
      organizationId: 3, sourceEntityType: 'qms_training', match: { exact: 'qms-document:1:user:5' }, actorId: 42,
      desired: new Map(), closeAs: () => 'cancelled',
    })).toMatchObject({ failed: true, written: [] });
  });
});
