/**
 * The order of need (P-131 item 3; D6.md §A.7 item 6). One rule, the same cases
 * the server side (S9) is to be tested with:
 *   overdue, due within 7 days, later, no date; then critical > urgent > high >
 *   medium > low > none; then the earlier due date; then a stable key.
 */
import { describe, expect, it } from 'vitest';
import {
  compareByNeed, daysOverdue, groupByNeed, needGroupOf, orderByNeed, priorityRank, type NeedFacts,
} from '../surfaces/taskOrderOfNeed';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const inDays = (d: number) => new Date(NOW + d * 86_400_000).toISOString();
const item = (key: string, priority: string | null, dueIso: string | null, overdue = false): NeedFacts =>
  ({ key, priority, dueIso, overdue });
const keys = (xs: NeedFacts[]) => orderByNeed(xs, (x) => x, NOW).map((x) => x.key);

describe('the order of need', () => {
  it('lists a critical task due in six days above a low task due in two, both below anything overdue (A.6 acceptance 9)', () => {
    expect(keys([
      item('low-2d', 'low', inDays(2)),
      item('crit-6d', 'critical', inDays(6)),
      item('overdue-low', 'low', inDays(-1), true),
    ])).toEqual(['overdue-low', 'crit-6d', 'low-2d']);
  });

  it('groups by when before it ranks by priority: a low task due soon comes before a critical one due later', () => {
    expect(keys([item('crit-30d', 'critical', inDays(30)), item('low-3d', 'low', inDays(3))])).toEqual(['low-3d', 'crit-30d']);
  });

  it('puts work with no due date last, whatever its priority', () => {
    expect(keys([item('crit-none', 'critical', null), item('low-later', 'low', inDays(40))])).toEqual(['low-later', 'crit-none']);
  });

  it('ranks critical, urgent, high, medium, low, then none, inside a group', () => {
    const d = inDays(3);
    expect(keys([
      item('none', null, d), item('low', 'low', d), item('urgent', 'urgent', d),
      item('medium', 'medium', d), item('critical', 'critical', d), item('high', 'high', d),
    ])).toEqual(['critical', 'urgent', 'high', 'medium', 'low', 'none']);
  });

  it('reads correspondence severities on the shared scale and ignores case', () => {
    expect(priorityRank('Major')).toBe(priorityRank('high'));
    expect(priorityRank('minor')).toBe(priorityRank('low'));
    expect(priorityRank('CRITICAL')).toBe(0);
    expect(priorityRank('')).toBe(5);
    expect(priorityRank(undefined)).toBe(5);
  });

  it('breaks a priority tie on the earlier due date, then on the key, so the order is stable', () => {
    expect(keys([item('b', 'high', inDays(5)), item('a', 'high', inDays(4))])).toEqual(['a', 'b']);
    expect(keys([item('b', 'high', inDays(5)), item('a', 'high', inDays(5))])).toEqual(['a', 'b']);
    expect(keys([item('a', 'high', inDays(5)), item('b', 'high', inDays(5))])).toEqual(['a', 'b']);
    expect(compareByNeed(item('a', 'high', null), item('a', 'high', null), NOW)).toBe(0);
  });

  it('takes overdue from the caller and does not re-derive it from the date', () => {
    // A review route member that waits on an earlier step is passed with no due date (my-work.ts):
    // it is outside the triage even though its stored date is past.
    expect(needGroupOf(item('waiting', 'high', null), NOW)).toBe('none');
    // A date in the past that the caller did not call overdue is not moved into Overdue here.
    expect(needGroupOf(item('past', 'high', inDays(-2), false), NOW)).toBe('week');
    expect(needGroupOf(item('late', 'high', inDays(-2), true), NOW)).toBe('overdue');
  });

  it('draws the 7-day line at seven days from now', () => {
    expect(needGroupOf(item('d7', null, inDays(7)), NOW)).toBe('week');
    expect(needGroupOf(item('d8', null, inDays(7.01)), NOW)).toBe('later');
  });

  it('returns all four groups, in order, with empty ones present', () => {
    const groups = groupByNeed([item('x', 'low', inDays(10))], (x) => x, NOW);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ['Overdue', 0], ['Due within 7 days', 0], ['Later', 1], ['No due date', 0],
    ]);
  });

  it('does not change the list it is given', () => {
    const xs = [item('b', 'low', null), item('a', 'critical', null)];
    orderByNeed(xs, (x) => x, NOW);
    expect(xs.map((x) => x.key)).toEqual(['b', 'a']);
  });

  it('counts whole days overdue, and 0 for a date that fell due earlier today', () => {
    expect(daysOverdue(inDays(-3.5), NOW)).toBe(3);
    expect(daysOverdue(inDays(-0.2), NOW)).toBe(0);
    expect(daysOverdue(null, NOW)).toBe(0);
  });
});
