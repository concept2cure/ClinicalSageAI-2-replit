/**
 * Calendar event creation for AnA (Google Calendar, service account).
 *
 * Wraps the env-configured Google Calendar integration
 * (server/src/services/calendar.ts) so AnA can put regulatory milestones —
 * submission deadlines, IR response due dates, freeze dates — on the team
 * calendar. The calendar module is lazy-imported (and injectable) so this is
 * unit-testable without googleapis, and a deployment without the calendar
 * configured degrades gracefully instead of throwing.
 *
 * @module server/services/integrations/calendar-event
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface CalendarEventParams {
  summary: string;
  /** All-day date, YYYY-MM-DD. */
  date: string;
  description?: string;
  timezone?: string;
}

export interface CalendarEventResponse {
  source: 'Google Calendar';
  configured: boolean;
  created: boolean;
  eventId?: string;
  url?: string;
  error?: string;
  note?: string;
}

export interface CalendarDeps {
  isEnabled: () => boolean;
  insertAllDayEvent: (evt: CalendarEventParams) => Promise<{ id?: string; htmlLink?: string }>;
}

const defaultDeps: CalendarDeps = {
  isEnabled: () => {
    // Mirror calendarEnabled() without eagerly importing googleapis.
    return !!(process.env.GOOGLE_CALENDAR_ID && process.env.GOOGLE_SERVICE_ACCOUNT);
  },
  insertAllDayEvent: async evt => {
    const { insertAllDayEvent } = await import('../../src/services/calendar.js');
    return insertAllDayEvent(evt);
  },
};

/**
 * Create an all-day calendar event for a regulatory milestone. Never throws —
 * an unconfigured calendar or invalid input is reported in the response.
 */
export async function createCalendarEvent(
  params: CalendarEventParams,
  deps: CalendarDeps = defaultDeps
): Promise<CalendarEventResponse> {
  const summary = (params.summary || '').trim();
  const date = (params.date || '').trim();

  if (!summary) {
    return { source: 'Google Calendar', configured: true, created: false, error: 'summary is required.' };
  }
  if (!DATE_RE.test(date)) {
    return {
      source: 'Google Calendar',
      configured: true,
      created: false,
      error: 'date must be an all-day date in YYYY-MM-DD format.',
    };
  }

  if (!deps.isEnabled()) {
    return {
      source: 'Google Calendar',
      configured: false,
      created: false,
      note: 'Google Calendar is not connected (GOOGLE_CALENDAR_ID / GOOGLE_SERVICE_ACCOUNT unset). Ask an admin to connect it in Settings → Integrations.',
    };
  }

  const res = await deps.insertAllDayEvent({
    summary,
    date,
    description: params.description,
    timezone: params.timezone,
  });

  return {
    source: 'Google Calendar',
    configured: true,
    created: true,
    eventId: res.id,
    url: res.htmlLink,
  };
}
