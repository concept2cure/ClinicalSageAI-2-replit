// import { google } from "googleapis"; // Temporarily disabled for development

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

export async function insertAllDayEvent(evt: EventInput): Promise<{ id?: string }> {
  const svc = envJSON('GOOGLE_SERVICE_ACCOUNT'); // {client_email, private_key, ...}
  if (!svc) throw new Error('GOOGLE_SERVICE_ACCOUNT missing/invalid');
  const calId = process.env.GOOGLE_CALENDAR_ID!;
  const tz = evt.timezone || process.env.TZ || 'UTC';

  // Temporarily disabled for development
  throw new Error('Google Calendar integration temporarily disabled for development');

  // const jwt = new google.auth.JWT({
  //   email: svc.client_email,
  //   key: svc.private_key,
  //   scopes: ["https://www.googleapis.com/auth/calendar"],
  //   subject: svc.subject || undefined,
  // });

  // const calendar = google.calendar({ version: "v3", auth: jwt });
  // const res = await calendar.events.insert({
  //   calendarId: calId,
  //   requestBody: {
  //     summary: evt.summary,
  //     description: evt.description || "",
  //     start: { date: evt.date, timeZone: tz },
  //     end:   { date: evt.date, timeZone: tz },
  //   },
  // });
  // return res.data;
}
