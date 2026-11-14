import { describe, it, expect } from 'vitest';
import {
  normalizePriority,
  normalizeTaskStatus,
  normalizeWorkItemStatus,
  normalizeFilingStatus,
  taskToUnified,
  workItemToUnified,
  filingToUnified,
  mergeUnifiedWork,
  summarizeUnifiedWork,
  compareUnifiedWork,
  compareByNeed,
  needGroup,
  priorityRank,
  unifiedTaskToUnified,
  loadUnifiedWork,
} from '../unified-work-view';

/**
 * Pure-normalizer tests for the unified work view. The DB loader is a thin
 * wrapper over these; the mapping rules (what counts as blocked, what blocks,
 * how the three systems' vocabularies reconcile) are the part worth pinning.
 */

describe('status normalization across the three systems', () => {
  it('maps project_tasks vocabulary', () => {
    expect(normalizeTaskStatus('todo')).toBe('open');
    expect(normalizeTaskStatus('in-progress')).toBe('in_progress');
    expect(normalizeTaskStatus('review')).toBe('in_progress');
    expect(normalizeTaskStatus('blocked')).toBe('blocked');
    expect(normalizeTaskStatus('done')).toBe('done');
    expect(normalizeTaskStatus(undefined)).toBe('open');
  });

  it('maps work-item vocabulary (resolved and closed are both done)', () => {
    expect(normalizeWorkItemStatus('open')).toBe('open');
    expect(normalizeWorkItemStatus('in_progress')).toBe('in_progress');
    expect(normalizeWorkItemStatus('resolved')).toBe('done');
    expect(normalizeWorkItemStatus('closed')).toBe('done');
  });

  it('treats a filing awaiting additional info as BLOCKED, not merely in flight', () => {
    expect(normalizeFilingStatus('draft')).toBe('open');
    expect(normalizeFilingStatus('filed')).toBe('in_progress');
    expect(normalizeFilingStatus('under_review')).toBe('in_progress');
    expect(normalizeFilingStatus('additional_info')).toBe('blocked');
    expect(normalizeFilingStatus('decision')).toBe('done');
    expect(normalizeFilingStatus('withdrawn')).toBe('done');
  });
});

describe('priority normalization', () => {
  it('passes through the shared scale', () => {
    expect(normalizePriority('high')).toBe('high');
    expect(normalizePriority('URGENT')).toBe('urgent');
  });

  it('maps correspondence severities onto the shared scale', () => {
    expect(normalizePriority('critical')).toBe('urgent');
    expect(normalizePriority('major')).toBe('high');
    expect(normalizePriority('minor')).toBe('low');
  });

  it('returns null for unknown/absent rather than inventing a priority', () => {
    expect(normalizePriority(undefined)).toBeNull();
    expect(normalizePriority('weird')).toBeNull();
  });
});

describe('row adapters', () => {
  it('flags a blocked task and a critical-to-quality task as blocking', () => {
    expect(taskToUnified({ id: 1, status: 'blocked', name: 'X' }).blocking).toBe(true);
    expect(taskToUnified({ id: 2, status: 'todo', criticalToQuality: true, name: 'Y' }).blocking).toBe(true);
    // …but a finished critical task no longer blocks.
    expect(taskToUnified({ id: 3, status: 'done', criticalToQuality: true, name: 'Z' }).blocking).toBe(false);
  });

  it('routes correspondence work items into their own lane', () => {
    const corr = workItemToUnified({ id: 9, workItemId: 'wi_a', sourceType: 'correspondence', title: 'Letter issue' });
    expect(corr.source).toBe('correspondence');
    expect(corr.id).toBe('correspondence:wi_a');

    const review = workItemToUnified({ id: 10, workItemId: 'wi_b', sourceType: 'review_task', title: 'Review' });
    expect(review.source).toBe('review');
  });

  it('does not treat a resolved work item as blocking even with a blockerType', () => {
    const r = workItemToUnified({ id: 1, sourceType: 'review_task', status: 'resolved', blockerType: 'approval_pending', title: 'T' });
    expect(r.blocking).toBe(false);
    expect(r.status).toBe('done');
  });

  it('maps a filing awaiting agency info to a blocking item with its decision clock', () => {
    const f = filingToUnified({
      id: 'sub-1',
      catalogKey: 'pma_original',
      status: 'additional_info',
      decisionDueAt: new Date('2026-09-01T00:00:00.000Z'),
      projectId: 4,
    });
    expect(f.source).toBe('filing');
    expect(f.blocking).toBe(true);
    expect(f.dueAt).toBe('2026-09-01T00:00:00.000Z');
    expect(f.projectId).toBe(4);
  });

  it('gives every source a globally unique composite id', () => {
    const ids = [
      taskToUnified({ id: 1, name: 'a' }).id,
      workItemToUnified({ id: 1, sourceType: 'review_task', title: 'b' }).id,
      filingToUnified({ id: '1', title: 'c' }).id,
    ];
    expect(new Set(ids).size).toBe(3); // no collision across systems
  });
});

describe('merge + ordering', () => {
  it('puts blockers first, then soonest due, with undated last', () => {
    const items = mergeUnifiedWork({
      tasks: [
        { id: 1, name: 'later', status: 'todo', dueDate: '2026-12-01T00:00:00.000Z' },
        { id: 2, name: 'undated', status: 'todo' },
        { id: 3, name: 'sooner', status: 'todo', dueDate: '2026-08-01T00:00:00.000Z' },
      ],
      filings: [{ id: 'f1', title: 'blocked filing', status: 'additional_info' }],
    });
    expect(items[0].title).toBe('blocked filing'); // blocking wins
    expect(items[1].title).toBe('sooner');
    expect(items[2].title).toBe('later');
    expect(items[3].title).toBe('undated'); // undated sorts last
  });

  it('is a stable, deterministic comparator', () => {
    const a = taskToUnified({ id: 1, name: 'alpha', status: 'todo' });
    const b = taskToUnified({ id: 2, name: 'beta', status: 'todo' });
    expect(compareUnifiedWork(a, b)).toBeLessThan(0);
    expect(compareUnifiedWork(b, a)).toBeGreaterThan(0);
  });

  it('handles the empty case without inventing anything', () => {
    expect(mergeUnifiedWork({})).toEqual([]);
  });
});

describe('board dependency blockers', () => {
  it.each(['completed', 'cancelled'])('does not count a %s board task with retained dependencies as blocking', status => {
    const items = mergeUnifiedWork({
      boardTasks: [{ taskId: 'TASK-FINISHED', title: 'Finished work', status,
        blockedBy: ['TASK-PREDECESSOR'], criticalPath: true }],
    });

    expect(items[0].status).toBe('done');
    expect(items[0].blocking).toBe(false);
    expect(summarizeUnifiedWork(items)).toMatchObject({ total: 1, done: 1, blocking: 0 });
  });

  it.each([
    { status: 'blocked', blockedBy: [], criticalPath: false },
    { status: 'pending', blockedBy: ['TASK-PREDECESSOR'], criticalPath: false },
    { status: 'in-progress', blockedBy: [], criticalPath: true },
  ])('retains an active blocker for $status / dependencies $blockedBy / critical path $criticalPath', row => {
    const items = mergeUnifiedWork({ boardTasks: [{ taskId: 'TASK-ACTIVE', title: 'Active work', ...row }] });

    expect(items[0].status).not.toBe('done');
    expect(items[0].blocking).toBe(true);
    expect(summarizeUnifiedWork(items)).toMatchObject({ total: 1, done: 0, blocking: 1 });
  });

  it('rolls up active blockers without completed or cancelled dependency history', () => {
    const items = mergeUnifiedWork({ boardTasks: [
      { taskId: 'TASK-COMPLETE', title: 'Complete', status: 'completed', blockedBy: ['TASK-OLD'] },
      { taskId: 'TASK-CANCELLED', title: 'Cancelled', status: 'cancelled', blockedBy: ['TASK-OLD'] },
      { taskId: 'TASK-BLOCKED', title: 'Blocked', status: 'blocked' },
      { taskId: 'TASK-DEPENDENT', title: 'Dependent', status: 'pending', blockedBy: ['TASK-PREDECESSOR'] },
      { taskId: 'TASK-CRITICAL', title: 'Critical', status: 'in-progress', criticalPath: true },
    ] });

    expect(summarizeUnifiedWork(items)).toMatchObject({ total: 5, done: 2, blocking: 3, partial: false });
    expect(items.filter(item => item.blocking).map(item => item.nativeId).sort()).toEqual([
      'TASK-BLOCKED', 'TASK-CRITICAL', 'TASK-DEPENDENT',
    ]);
  });
});

describe('summary roll-up', () => {
  it('counts by status and by source', () => {
    const items = mergeUnifiedWork({
      tasks: [
        { id: 1, name: 't1', status: 'todo' },
        { id: 2, name: 't2', status: 'done' },
        { id: 3, name: 't3', status: 'blocked' },
      ],
      workItems: [
        { id: 4, sourceType: 'correspondence', title: 'c1', status: 'open', blockerType: 'regulatory_correspondence_issue' },
        { id: 5, sourceType: 'review_task', title: 'r1', status: 'in_progress' },
      ],
      filings: [{ id: 'f1', title: 'f', status: 'under_review' }],
      boardTasks: [
        { taskId: 'TASK-1', title: 'b1', status: 'in-progress' },
        { taskId: 'TASK-2', title: 'b2', status: 'blocked' },
      ],
    });
    const s = summarizeUnifiedWork(items);
    expect(s.total).toBe(8);
    expect(s.bySource).toEqual({ schedule: 3, review: 1, correspondence: 1, filing: 1, board: 2 });
    expect(s.done).toBe(1);
    expect(s.blocking).toBe(3); // the blocked task + the correspondence blocker + the blocked board task
    expect(s.inProgress).toBe(3); // review in_progress + filing under_review + board in-progress
  });

  it('adapts canonical board tasks (unified_tasks) into the shared shape', () => {
    const open = mergeUnifiedWork({
      boardTasks: [
        {
          taskId: 'TASK-9',
          title: 'Reconcile ORR',
          status: 'review',
          priority: 'critical',
          assigneeName: 'M. Wei',
          moduleType: 'Biostatistics',
          criticalPath: true,
        },
      ],
    });
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({
      id: 'board:TASK-9',
      source: 'board',
      status: 'in_progress',
      priority: 'urgent', // 'critical' maps onto the shared scale
      ownerName: 'M. Wei',
      blocking: true, // critical-path + not done holds the timeline
      detail: 'Biostatistics',
    });
  });
});

/**
 * P-131 item 3: one order of need wherever a person's work is listed. Overdue,
 * then due within seven days, then later, then no date; within a group
 * critical, urgent, high, medium, low, none; then the earlier date; then a
 * stable key. The client's comparator is tested with these same cases.
 */
describe('the order of need (P-131 item 3)', () => {
  const NOW = Date.parse('2026-11-13T12:00:00Z');
  const k = (key: string, dueAt: string | null, priority: string | null) => ({ key, dueAt, priority });

  it('groups by when: overdue, due within seven days, later, no date', () => {
    expect(needGroup('2026-11-12T12:00:00Z', NOW)).toBe('overdue');
    expect(needGroup('2026-11-13T12:00:01Z', NOW)).toBe('due_week');
    expect(needGroup('2026-11-20T12:00:00Z', NOW)).toBe('due_week'); // exactly seven days is this week
    expect(needGroup('2026-11-20T12:00:01Z', NOW)).toBe('later');
    expect(needGroup(null, NOW)).toBe('no_date');
    expect(needGroup('not a date', NOW)).toBe('no_date'); // an unreadable date is not invented
  });

  it('ranks critical above urgent, then high, medium, low, then none', () => {
    expect(['critical', 'urgent', 'high', 'medium', 'low', null, 'whatever'].map(priorityRank)).toEqual([0, 1, 2, 3, 4, 5, 5]);
    // The correspondence severities the view already maps.
    expect(priorityRank('major')).toBe(priorityRank('high'));
    expect(priorityRank('minor')).toBe(priorityRank('low'));
    expect(priorityRank(' Critical ')).toBe(0);
  });

  it('orders groups first, then priority, then the earlier date, then the key', () => {
    const items = [
      k('none-date', null, 'critical'),
      k('later-urgent', '2026-12-30T00:00:00Z', 'urgent'),
      k('week-low', '2026-11-14T00:00:00Z', 'low'),
      k('week-high-late', '2026-11-19T00:00:00Z', 'high'),
      k('week-high-soon', '2026-11-15T00:00:00Z', 'high'),
      k('overdue-low', '2026-11-01T00:00:00Z', 'low'),
      k('overdue-critical', '2026-11-10T00:00:00Z', 'critical'),
      k('overdue-urgent', '2026-11-02T00:00:00Z', 'urgent'),
      k('week-high-b', '2026-11-15T00:00:00Z', 'high'),
    ];
    expect([...items].sort((a, b) => compareByNeed(a, b, NOW)).map((i) => i.key)).toEqual([
      'overdue-critical', 'overdue-urgent', 'overdue-low',
      'week-high-b', 'week-high-soon', 'week-high-late', 'week-low',
      'later-urgent',
      'none-date',
    ]);
  });

  it('is antisymmetric and gives equal keys zero (control)', () => {
    const a = k('a', '2026-11-14T00:00:00Z', 'high');
    const b = k('b', '2026-11-14T00:00:00Z', 'high');
    expect(compareByNeed(a, b, NOW)).toBeLessThan(0);
    expect(compareByNeed(b, a, NOW)).toBeGreaterThan(0);
    expect(compareByNeed(a, { ...a }, NOW)).toBe(0);
  });
});

/**
 * P-131 item 6 / R2: the owner each other store records travels on the unified
 * item, so "Mine" and my-work can include that work. A filing records no owner.
 */
describe('the owner each store records', () => {
  it('carries project_tasks.assignee_id, c2c_project_work_items.owner_id and unified_tasks.assignee_id', () => {
    expect(taskToUnified({ id: 1, name: 'Milestone', status: 'todo', assigneeId: 31 }).ownerId).toBe(31);
    expect(workItemToUnified({ id: 2, title: 'Letter', sourceType: 'correspondence', ownerId: 32, ownerName: 'R. Ito' })).toMatchObject({ ownerId: 32, ownerName: 'R. Ito' });
    expect(unifiedTaskToUnified({ taskId: 'T-1', title: 'Board', assigneeId: 33 }).ownerId).toBe(33);
  });

  it('says no owner when none is recorded, and never one for a filing (control)', () => {
    expect(taskToUnified({ id: 1, name: 'Milestone', status: 'todo' }).ownerId).toBeNull();
    expect(workItemToUnified({ id: 2, title: 'Letter', ownerId: null }).ownerId).toBeNull();
    expect(filingToUnified({ id: 'f1', title: 'K123', status: 'filed' }).ownerId).toBeNull();
  });
});

/** Columns constrained by a Drizzle condition, by walking its chunks. */
function columnsOf(condition: unknown): string[] {
  const names: string[] = [];
  const walk = (n: any, depth = 0): void => {
    if (!n || depth > 10) return;
    if (n.name && n.columnType) names.push(n.name);
    for (const key of ['queryChunks', 'left', 'right']) {
      const v = n[key];
      if (v) (Array.isArray(v) ? v : [v]).forEach((x: unknown) => walk(x, depth + 1));
    }
  };
  walk(condition);
  return names;
}

describe('loadUnifiedWork, narrowed to one owner', () => {
  function capturing() {
    const reads: Array<{ table: string; where: unknown }> = [];
    const database = {
      select: () => ({
        from: (table: any) => ({
          where: (where: unknown) => {
            reads.push({ table: table[Symbol.for('drizzle:Name')], where });
            return Promise.resolve([]);
          },
        }),
      }),
    };
    return { database: database as never, reads };
  }

  it('keeps the organisation predicate and adds the owner column on every store that records one', async () => {
    const { database, reads } = capturing();
    const view = await loadUnifiedWork({ organizationId: 9, ownedBy: 31 }, database);
    const cols = Object.fromEntries(reads.map((r) => [r.table, columnsOf(r.where)]));
    expect(cols.project_tasks).toEqual(expect.arrayContaining(['organization_id', 'assignee_id']));
    expect(cols.c2c_project_work_items).toEqual(expect.arrayContaining(['org_id', 'owner_id']));
    expect(cols.unified_tasks).toEqual(expect.arrayContaining(['organization_id', 'assignee_id']));
    // A filing records no owner, so nothing is read for it and it contributes nothing.
    expect(cols.estar_submissions).toBeUndefined();
    expect(view.sources.estar_submissions).toEqual({ ran: true, rowCount: 0 });
  });

  it('can leave out the work items another read already lists, by their source type', async () => {
    const { database, reads } = capturing();
    await loadUnifiedWork({ organizationId: 9, ownedBy: 31, excludeWorkItemSourceTypes: ['review_thread', 'review_task'] }, database);
    expect(columnsOf(reads.find((r) => r.table === 'c2c_project_work_items')!.where)).toContain('source_type');
  });

  it('reads every store org-wide, with no owner column, when no owner is named (control)', async () => {
    const { database, reads } = capturing();
    await loadUnifiedWork({ organizationId: 9 }, database);
    expect(reads.map((r) => r.table).sort()).toEqual(['c2c_project_work_items', 'estar_submissions', 'project_tasks', 'unified_tasks']);
    for (const r of reads) expect(columnsOf(r.where)).not.toEqual(expect.arrayContaining(['assignee_id']));
    expect(columnsOf(reads.find((r) => r.table === 'c2c_project_work_items')!.where)).not.toContain('owner_id');
  });
});
