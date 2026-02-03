import { google } from 'googleapis';
import { Pool } from 'pg';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL,
});

// Helper function for database queries
const q = async <T = any>(query: string, params: any[] = []): Promise<{ rows: T[] }> => {
  if (!pool) throw new Error('Database pool not initialized');
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return { rows: result.rows };
  } finally {
    client.release();
  }
};

function buildCalendar() {
  const raw = process.env.GCAL_JSON;
  if (!raw) throw new Error('GCAL_JSON not set');
  const creds = JSON.parse(raw);
  const jwt = new google.auth.JWT(creds.client_email, undefined, creds.private_key, [
    'https://www.googleapis.com/auth/calendar',
  ]);
  return google.calendar({ version: 'v3', auth: jwt });
}

function asDateStr(d: any) {
  return (d || new Date()).toISOString().slice(0, 10);
}

async function upsertEvent(
  cal: any,
  calendarId: string,
  idKey: string,
  summary: string,
  date: string
) {
  // Google requires RFC3339 for date-only: use all-day event
  const start = { date };
  const end = { date };

  // Try patch if event exists, else insert
  try {
    return await cal.events.patch({
      calendarId,
      eventId: idKey,
      requestBody: { summary, start, end },
    });
  } catch {
    return await cal.events.insert({
      calendarId,
      requestBody: { id: idKey, summary, start, end },
    });
  }
}

/** Push open IR/Tasks/Obligations for a submission */
export async function pushCalendarForSubmission(subId: string) {
  const cal = buildCalendar();
  const calendarId = process.env.GOOGLE_CALENDAR_ID!;
  const sub = (await q<any>(`SELECT * FROM reg_submissions WHERE sub_id=$1`, [subId])).rows[0];

  // IR / Questions
  const questions = (
    await q<any>(
      `SELECT q_id, sec_code, due_date, status FROM reg_questions WHERE sub_id=$1 AND status IN ('OPEN','DRAFTED','IN_REVIEW') AND due_date IS NOT NULL`,
      [subId]
    )
  ).rows;

  // Tasks
  const tasks = (
    await q<any>(
      `SELECT task_id, title, due_date, status FROM reg_tasks WHERE sub_id=$1 AND status IN ('OPEN','IN_PROGRESS') AND due_date IS NOT NULL`,
      [subId]
    )
  ).rows;

  // Obligations
  const obls = (
    await q<any>(
      `SELECT obl_id, title, due_date, status FROM reg_obligations WHERE sub_id=$1 AND status IN ('OPEN','IN_PROGRESS') AND due_date IS NOT NULL`,
      [subId]
    )
  ).rows;

  let pushed = 0;

  for (const qrow of questions) {
    const idKey = `IR-${qrow.q_id}`.toLowerCase();
    await upsertEvent(
      cal,
      calendarId,
      idKey,
      `IR due — ${sub.product_id} ${qrow.sec_code || ''}`,
      asDateStr(qrow.due_date)
    );
    pushed++;
  }

  for (const t of tasks) {
    const idKey = `TASK-${t.task_id}`.toLowerCase();
    await upsertEvent(cal, calendarId, idKey, `Reg task — ${t.title}`, asDateStr(t.due_date));
    pushed++;
  }

  for (const o of obls) {
    const idKey = `OBL-${o.obl_id}`.toLowerCase();
    await upsertEvent(cal, calendarId, idKey, `Reg obligation — ${o.title}`, asDateStr(o.due_date));
    pushed++;
  }

  return { pushed, calendarId };
}
