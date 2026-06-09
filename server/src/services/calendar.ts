import { google } from 'googleapis';

type EventInput = { summary: string; description?: string; date: string; timezone?: string };

function envJSON(name: string) {
  const raw = process.env[name];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function calendarEnabled() {
  return !!(process.env.GOOGLE_CALENDAR_ID && process.env.GOOGLE_SERVICE_ACCOUNT);
}

/**
 * Insert an all-day event into the configured Google Calendar using a service
 * account (domain-wide delegation optional via `subject`). Requires
 * GOOGLE_SERVICE_ACCOUNT (JSON with client_email/private_key) and
 * GOOGLE_CALENDAR_ID. Returns the created event id + link.
 */
export async function insertAllDayEvent(
  evt: EventInput
): Promise<{ id?: string; htmlLink?: string }> {
  const svc = envJSON('GOOGLE_SERVICE_ACCOUNT'); // {client_email, private_key, ...}
  if (!svc) throw new Error('GOOGLE_SERVICE_ACCOUNT missing/invalid');
  const calId = process.env.GOOGLE_CALENDAR_ID;
  if (!calId) throw new Error('GOOGLE_CALENDAR_ID missing');
  const tz = evt.timezone || process.env.TZ || 'UTC';

  const jwt = new google.auth.JWT({
    email: svc.client_email,
    // Env-stored keys commonly have escaped newlines.
    key: (svc.private_key || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject: svc.subject || undefined,
  });

  const calendar = google.calendar({ version: 'v3', auth: jwt });
  const res = await calendar.events.insert({
    calendarId: calId,
    requestBody: {
      summary: evt.summary,
      description: evt.description || '',
      // All-day events use `date` (YYYY-MM-DD), not `dateTime`.
      start: { date: evt.date, timeZone: tz },
      end: { date: evt.date, timeZone: tz },
    },
  });
  return { id: res.data.id || undefined, htmlLink: res.data.htmlLink || undefined };
}
