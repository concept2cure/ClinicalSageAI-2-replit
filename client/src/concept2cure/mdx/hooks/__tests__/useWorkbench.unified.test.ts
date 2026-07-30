import { describe, it, expect } from 'vitest';
import { workNotOnTheBoard, type UnifiedWorkSummaryView } from '../useWorkbench';

const summary = (bySource: UnifiedWorkSummaryView['bySource']): UnifiedWorkSummaryView => ({
  total: Object.values(bySource).reduce((a, b) => a + b, 0),
  blocking: 0, open: 0, inProgress: 0, done: 0,
  bySource,
});

describe('workNotOnTheBoard', () => {
  it('counts the sources the task board cannot show (schedule + filings)', () => {
    const n = workNotOnTheBoard(summary({ schedule: 3, review: 5, correspondence: 2, filing: 1 }));
    expect(n).toBe(4); // 3 schedule + 1 filing; review/correspondence ARE on the board
  });

  it('is zero when everything already comes from work items', () => {
    expect(workNotOnTheBoard(summary({ schedule: 0, review: 7, correspondence: 3, filing: 0 }))).toBe(0);
  });

  it('degrades to zero rather than throwing when the view has not loaded', () => {
    expect(workNotOnTheBoard(null)).toBe(0);
  });
});
