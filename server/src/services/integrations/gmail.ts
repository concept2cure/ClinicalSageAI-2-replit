// import { google } from "googleapis";
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

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

/** Build Gmail client from env JSON */
function buildGmail() {
  const raw = process.env.GMAIL_OAUTH_JSON;
  if (!raw) throw new Error('GMAIL_OAUTH_JSON not set');
  const cfg = JSON.parse(raw);
  const oauth2 = new google.auth.OAuth2(
    cfg.client_id,
    cfg.client_secret,
    (cfg.redirect_uris || [null])[0]
  );
  oauth2.setCredentials({
    refresh_token: cfg.refresh_token,
    access_token: cfg.access_token,
    expiry_date: cfg.expiry_date,
  });
  return google.gmail({ version: 'v1', auth: oauth2 });
}

/** Pull recent messages matching query; returns normalized array */
export async function gmailFetchRecent(limit = 20) {
  const gmail = buildGmail();
  const userId = process.env.GMAIL_USER_EMAIL || 'me';
  const qstr = process.env.GMAIL_QUERY || 'newer_than:60d';

  const res = await gmail.users.messages.list({ userId, q: qstr, maxResults: limit });
  const items = res.data.messages || [];
  const out: any[] = [];

  for (const m of items) {
    const full = await gmail.users.messages.get({ userId, id: m.id!, format: 'full' });
    const payload = full.data.payload!;
    const headers = (payload.headers || []).reduce((acc: any, h: any) => {
      acc[h.name.toLowerCase()] = h.value;
      return acc;
    }, {});
    const subject = headers['subject'] || '';
    const from = headers['from'] || '';
    const to = headers['to'] || '';
    const date = headers['date'] ? new Date(headers['date']) : new Date();

    // extract text parts
    let body = '';
    const parts = payload.parts || [];
    if (payload.body?.data) body = Buffer.from(payload.body.data, 'base64').toString('utf8');
    for (const p of parts) {
      if ((p.mimeType || '').includes('text/plain') && p.body?.data) {
        body += '\n' + Buffer.from(p.body.data, 'base64').toString('utf8');
      }
    }

    out.push({
      id: m.id,
      threadId: full.data.threadId,
      subject,
      from,
      to,
      date,
      snippet: full.data.snippet || '',
      body,
    });
  }
  return out;
}

/** Heuristic to map to a submission by product code in subject, else default */
async function resolveSubmissionId(subject: string) {
  // naive: try to find latest submission
  const row = (
    await q<any>(`SELECT sub_id FROM reg_submissions ORDER BY created_at DESC LIMIT 1`, [])
  ).rows[0];
  return row?.sub_id || null;
}

/** Parse as IR (questions) or obligations; create rows; return counters */
export async function gmailIngestToReg(): Promise<{
  createdQuestions: number;
  createdObls: number;
  saved: number;
}> {
  const msgs = await gmailFetchRecent(20);
  let createdQuestions = 0,
    createdObls = 0,
    saved = 0;

  for (const m of msgs) {
    // skip if already seen
    const seen = (await q<any>(`SELECT 1 FROM reg_mail_ingest WHERE msg_id=$1`, [m.id])).rows[0];
    if (seen) continue;

    const subId = await resolveSubmissionId(m.subject);

    // --- Extract "questions" style (IR/deficiency) ---
    // Very light heuristic: look for keywords
    const looksIR = /information request|deficiency|additional information|clarify/i.test(
      m.subject + ' ' + m.body
    );
    let extracted = { questions: [], obligations: [], region: undefined as any };

    if (looksIR) {
      // Extremely light extractor (your Questions Hub likely has a richer AI route already)
      // We'll store raw text; the PM can then click "AI Draft" in Questions UI
      extracted.questions = [{ raw: m.body.slice(0, 12000) }];
      createdQuestions += 1;

      // insert a draft Question
      await q(
        `INSERT INTO reg_questions (sub_id, sec_code, question_text, status, due_date, source, raw_text)
               VALUES ($1, null, $2, 'OPEN', (now()+interval '30 day')::date, 'EMAIL', $3)`,
        [subId, m.subject || 'Agency Request', m.body.slice(0, 15000)]
      );
    }

    // --- Extract obligations with graceful fallback to none ---
    // For now, we'll skip AI extraction and just store the raw data
    // This can be enhanced later with actual AI processing

    await q(
      `INSERT INTO reg_mail_ingest (msg_id, thread_id, sub_id, subject, from_addr, to_addr, received_at, snippet, labels, extracted)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [m.id, m.threadId, subId, m.subject, m.from, m.to, m.date, m.snippet, [], extracted]
    );
    saved += 1;
  }

  return { createdQuestions, createdObls, saved };
}
