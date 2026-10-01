/**
 * AnA Command's "Tasks done" is done over total, or no figure (row D2, 2026-10-01).
 *
 * Until 2026-10-01 the briefing computed (total - blocked) / total and answered
 * 100 when the total was 0 — and the resolver always supplied 0, so every
 * project read "Tasks done 100%". With real counts the old ratio still read 100%
 * for a project where nothing was done but nothing was blocked.
 */
import { describe, expect, it } from 'vitest';
import { taskCompletionPercent } from '../continuity-service';

describe('taskCompletionPercent', () => {
  it('is done over total, rounded', () => {
    expect(taskCompletionPercent({ totalTasks: 5, doneTasks: 2, taskCountsPartial: false })).toBe(40);
    expect(taskCompletionPercent({ totalTasks: 3, doneTasks: 3, taskCountsPartial: false })).toBe(100);
  });

  it('is 0, not 100, when nothing is done and nothing is blocked (the old ratio read 100)', () => {
    expect(taskCompletionPercent({ totalTasks: 4, doneTasks: 0, taskCountsPartial: false })).toBe(0);
  });

  it('is no figure when there is nothing to complete (the old code read 100)', () => {
    expect(taskCompletionPercent({ totalTasks: 0, doneTasks: 0, taskCountsPartial: false })).toBeNull();
  });

  it('is no figure when a task store went unread — the counts are a floor', () => {
    expect(taskCompletionPercent({ totalTasks: 5, doneTasks: 5, taskCountsPartial: true })).toBeNull();
  });
});
