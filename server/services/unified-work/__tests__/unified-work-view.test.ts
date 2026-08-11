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
