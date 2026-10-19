import { google } from 'googleapis';
/*
 * Gmail read access for correspondence search (server/services/integrations/
 * correspondence-search.ts, gmail.readonly scope). Nothing here writes.
 *
 * Removed 2026-10-19 (rows D2 and D5; decision P-39 item 1): gmailIngestToReg
 * and resolveSubmissionId, with the module's own pool. The ingest had no caller
 * anywhere; it wrote reg_questions columns the table does not have (sub_id,
 * sec_code, source, raw_text) into a file that is now read-only in the database
 * (migrations/20261019b_reg_questions_read_only.sql), and resolveSubmissionId
 * read the newest reg_submissions row of any tenant. Agency questions are
 * recorded on the letter they came in (agency_communication_questions); taking
 * them from a letter's file is the gap analysis's "Next" item 2
 * (docs/design/RIM_GAP_ANALYSIS_2026-10-18.md).
 */

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
