import { describe, expect, it } from 'vitest';
import { classifyDue, alreadyNotified, DUE_SOON_WINDOW_MS } from '../taskDueSweep';

const NOW = Date.UTC(2026, 7, 7, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

describe('classifyDue — the sweep’s window logic', () => {
  it('no due date → never classified', () => {
    expect(classifyDue(null, NOW)).toBeNull();
  });

  it('past due → overdue', () => {
    expect(classifyDue(new Date(NOW - HOUR), NOW)).toBe('overdue');
  });

  it('inside the 48h window → due-soon', () => {
    expect(classifyDue(new Date(NOW + HOUR), NOW)).toBe('due-soon');
    expect(classifyDue(new Date(NOW + DUE_SOON_WINDOW_MS), NOW)).toBe('due-soon');
  });

  it('beyond the window → not yet interesting', () => {
    expect(classifyDue(new Date(NOW + DUE_SOON_WINDOW_MS + HOUR), NOW)).toBeNull();
  });

  it('an unparseable date never classifies (no fabricated urgency)', () => {
    expect(classifyDue('not-a-date', NOW)).toBeNull();
  });
});

describe('alreadyNotified — once per class, never re-spammed', () => {
  it('fresh task: both classes notify', () => {
    expect(alreadyNotified({}, 'due-soon')).toBe(false);
    expect(alreadyNotified(null, 'overdue')).toBe(false);
  });

  it('due-soon marker suppresses due-soon but NOT the later overdue', () => {
    const m = { dueSoonNotifiedAt: '2026-08-05T00:00:00Z' };
    expect(alreadyNotified(m, 'due-soon')).toBe(true);
    expect(alreadyNotified(m, 'overdue')).toBe(false);
  });

  it('overdue marker suppresses both classes (no backwards due-soon)', () => {
    const m = { overdueNotifiedAt: '2026-08-06T00:00:00Z' };
    expect(alreadyNotified(m, 'overdue')).toBe(true);
    expect(alreadyNotified(m, 'due-soon')).toBe(true);
  });

  it('unrelated metadata is preserved semantics — only the markers matter', () => {
    expect(alreadyNotified({ someOtherKey: 1 }, 'due-soon')).toBe(false);
  });
});
