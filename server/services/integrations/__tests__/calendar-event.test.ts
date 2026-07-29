/**
 * Calendar event creation — unit tests (calendar module injected).
 * Verifies input validation, the not-configured gate, and the success path
 * without googleapis.
 */
import { describe, it, expect, vi } from 'vitest';
import { createCalendarEvent, type CalendarDeps } from '../calendar-event';

function makeDeps(over: Partial<CalendarDeps> = {}): CalendarDeps {
  return {
    isEnabled: () => true,
    insertAllDayEvent: vi.fn().mockResolvedValue({ id: 'evt_123', htmlLink: 'https://cal/evt_123' }),
    ...over,
  };
}

describe('createCalendarEvent', () => {
  it('rejects a missing summary and a malformed date without calling the calendar', async () => {
    const deps = makeDeps();
    const noSummary = await createCalendarEvent({ summary: '  ', date: '2026-07-01' }, deps);
    expect(noSummary.created).toBe(false);
    expect(noSummary.error).toMatch(/summary/i);

    const badDate = await createCalendarEvent({ summary: 'Deadline', date: '07/01/2026' }, deps);
    expect(badDate.created).toBe(false);
    expect(badDate.error).toMatch(/YYYY-MM-DD/);

    expect(deps.insertAllDayEvent).not.toHaveBeenCalled();
  });

  it('returns a not-connected note when the calendar is disabled', async () => {
    const insertAllDayEvent = vi.fn();
    const res = await createCalendarEvent(
      { summary: 'Deadline', date: '2026-07-01' },
      { isEnabled: () => false, insertAllDayEvent }
    );
    expect(res.configured).toBe(false);
    expect(res.created).toBe(false);
    expect(res.note).toMatch(/not connected/i);
    expect(insertAllDayEvent).not.toHaveBeenCalled();
  });

  it('creates the event and returns id + url on the happy path', async () => {
    const deps = makeDeps();
    const res = await createCalendarEvent(
      { summary: 'IND seq 0003 deadline', date: '2026-07-01', description: 'context', timezone: 'America/New_York' },
      deps
    );
    expect(deps.insertAllDayEvent).toHaveBeenCalledWith({
      summary: 'IND seq 0003 deadline',
      date: '2026-07-01',
      description: 'context',
      timezone: 'America/New_York',
    });
    expect(res.created).toBe(true);
    expect(res.eventId).toBe('evt_123');
    expect(res.url).toBe('https://cal/evt_123');
  });
});
