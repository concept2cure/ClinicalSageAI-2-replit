import { describe, expect, it } from 'vitest';
import { classifyDue, alreadyNotified, remindWindowMs, DUE_SOON_WINDOW_MS, MAX_REMIND_DAYS } from '../taskDueSweep';

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

describe('remindWindowMs — the notice a task asks for (QMS periodic review, 2026-10-29)', () => {
  const DAY = 24 * HOUR;
  it('no lead, or an unreadable one, is the 48 hours', () => {
    for (const metadata of [null, {}, { remindDaysBefore: 0 }, { remindDaysBefore: -3 }, { remindDaysBefore: 2.5 },
      { remindDaysBefore: '30 days' }, { remindDaysBefore: MAX_REMIND_DAYS + 1 }, { remindDaysBefore: true }]) {
      expect(remindWindowMs(metadata), JSON.stringify(metadata)).toBe(DUE_SOON_WINDOW_MS);
    }
  });

  it('a lead of 1 to 90 days, as a number or as its digits (the SQL reads the text), is that many days', () => {
    expect(remindWindowMs({ remindDaysBefore: 30 })).toBe(30 * DAY);
    expect(remindWindowMs({ remindDaysBefore: '30' })).toBe(30 * DAY);
    expect(remindWindowMs({ remindDaysBefore: MAX_REMIND_DAYS })).toBe(MAX_REMIND_DAYS * DAY);
  });

  it('a task 20 days out is due soon with a 30-day lead, and not without one', () => {
    const due = new Date(NOW + 20 * DAY);
    expect(classifyDue(due, NOW, remindWindowMs({ remindDaysBefore: 30 }))).toBe('due-soon');
    expect(classifyDue(due, NOW, remindWindowMs({}))).toBeNull();
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
