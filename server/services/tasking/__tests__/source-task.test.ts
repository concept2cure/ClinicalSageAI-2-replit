/**
 * One open task per source record: the same task again changes nothing, a new
 * one closes the open task first, none closes it, and a failure never throws.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const H = vi.hoisted(() => ({
  open: [] as Array<{ taskId: string; status: string; metadata: unknown }>,
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

import { replaceSourceTask, type ReplaceSourceTask } from '../source-task';

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
