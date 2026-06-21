import { describe, it, expect } from 'vitest';
import { selectAnalytics } from '../useAnalytics';

describe('selectAnalytics (double-deref null-safety)', () => {
  it('returns all-null for undefined payload', () => {
    expect(selectAnalytics(undefined)).toEqual({
      kpis: null, phases: null, blockers: null, reviewers: null, anaUsage: null, pace24m: null,
    });
  });

  it('does not throw and returns all-null when data is null', () => {
    // Previously `data?.data.kpis` threw TypeError on `{ data: null }`.
    expect(() => selectAnalytics({ data: null } as any)).not.toThrow();
    expect(selectAnalytics({ data: null } as any).kpis).toBeNull();
  });

  it('does not throw when data is an empty object', () => {
    expect(() => selectAnalytics({} as any)).not.toThrow();
    expect(selectAnalytics({} as any).phases).toBeNull();
  });

  it('passes through populated fields', () => {
    const payload = {
      data: {
        kpis: [{ k: 1 }], phases: [], blockers: [], reviewers: [], anaUsage: [], pace24m: [],
      },
    } as any;
    const sel = selectAnalytics(payload);
    expect(sel.kpis).toEqual([{ k: 1 }]);
    expect(sel.phases).toEqual([]);
  });
});
