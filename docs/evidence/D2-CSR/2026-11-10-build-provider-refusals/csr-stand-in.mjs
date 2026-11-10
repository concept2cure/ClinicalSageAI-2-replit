// Strict stand-in for the Anthropic API, for walking the CSR path without a key.
//
// It refuses every request the real Messages API is documented to refuse (the
// repository's own contract checker, docs/evidence/W1/2026-09-28-ana-drive/harness/api-contract.mjs),
// answers GET /v1/models, and plays a careful medical writer for the CSR builder:
//   - a heading with no retained tables gets prose that states no figure;
//   - a heading bound to retained tables states only exact cell text, and lists
//     every figure in a csr-claims block, as the builder's drafting rules ask.
// It is NOT a model. It proves the path and the request surface, not prose quality.
//
//   FAKE_PORT       port (default 8799)
//   FAKE_REQ_DIR    where each request body is saved (no key is saved)
//   FAKE_FAIL       'auth' | 'credit' | 'rate' | 'model' | 'overloaded': answer every
//                   /v1/messages with that documented API error instead
//   FAKE_RPM        refuse with 429 past this many requests per minute (0 = no limit)
//   FAKE_DELAY_MS   how long it "reasons" before it answers (default 150)
//   FAKE_STREAM_MS, FAKE_STREAM_CHARS   a streamed reply is sent FAKE_STREAM_CHARS characters at a time, that many
//                   milliseconds apart, so a person can watch a heading being written (default: all at once)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const CONTRACT = process.env.API_CONTRACT;
const { validate, thinks } = await import(CONTRACT);

const PORT = Number(process.env.FAKE_PORT || 8799);
const REQ_DIR = process.env.FAKE_REQ_DIR || '';
const FAIL = process.env.FAKE_FAIL || '';
const RPM = Number(process.env.FAKE_RPM || 0);
if (REQ_DIR) fs.mkdirSync(REQ_DIR, { recursive: true });
const log = (...a) => console.info(new Date().toISOString().slice(11, 23), ...a);

const MODEL_IDS = ['claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-haiku-4-5'];

const FAILURES = {
  auth: [401, 'authentication_error', 'invalid x-api-key'],
  credit: [400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.'],
  rate: [429, 'rate_limit_error', 'This request would exceed your organization\'s rate limit of 50 requests per minute.'],
  model: [404, 'not_found_error', 'model: claude-opus-5-5'],
  overloaded: [529, 'overloaded_error', 'Overloaded'],
};

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(b => (b.type === 'text' ? b.text : '')).join('\n');
}
const systemOf = body => (typeof body.system === 'string' ? body.system : textOf(body.system));

// ── The CSR writer it plays ───────────────────────────────────────────────────

const hasDigit = s => /\d/.test(String(s ?? ''));

/** Up to `limit` cells whose row label and column header carry no digit, so the sentence quoting them states one figure. */
function quotableCells(evidence, limit) {
  const out = [];
  for (const table of evidence.tables ?? []) {
    let taken = 0;
    for (let r = 0; r < table.rows.length && taken < 3; r += 1) {
      const row = table.rows[r];
      if (hasDigit(row[0])) continue;
      for (let c = 1; c < row.length; c += 1) {
        const value = row[c];
        if (!value || !hasDigit(value) || hasDigit(table.headers[c])) continue;
        out.push({ table: table.key, row: r, column: c, value, label: row[0], header: table.headers[c], title: table.title });
        taken += 1;
        break;
      }
    }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/** The study metadata the builder quotes in its brief (data, not instructions); {} when it cannot be read. */
function studyOf(brief) {
  const at = brief.lastIndexOf('{"type":"study_metadata"');
  if (at < 0) return {};
  try { return JSON.parse(brief.slice(at)).studyInfo ?? {}; } catch { return {}; }
}

const or = (value, fallback) => value || fallback;

/** Prose for a heading with no retained tables: only what the quoted study metadata says, and no observed result. */
function planProse(study) {
  const against = study.comparator ? ` against ${study.comparator}` : '';
  return [
    `This section is drafted for study ${or(study.protocolNumber, 'of record')}, ${or(study.title, 'as titled in the study information')}. It describes what the protocol and the recorded plan state, and it reports no observed result.`,
    `The study is recorded as a ${or(study.phase, 'clinical')} study of ${or(study.investigationalProduct, 'the investigational product')}${against} in ${or(study.indication, 'the indication of record')}. The recorded design is: ${or(study.studyDesign, 'as stated in the protocol')}.`,
    `The primary endpoint recorded for the study is ${or(study.primaryEndpoint, 'as stated in the protocol')}. The content ICH E3 asks of this heading is to be completed by the medical writer from the governed source documents named in the project, each cited by its version.`,
    'Statements about how the study was carried out, about ethics review and about consent are not made in this draft, because the records that would support them were not supplied to the drafter.',
  ];
}

function draftSection(body) {
  const users = body.messages.filter(m => m.role === 'user').map(m => textOf(m.content));
  const brief = users[0] || '';
  const heading = /Draft ICH E3 Section ([0-9.]+): (.+)/.exec(brief);
  const number = heading?.[1] ?? '';
  const title = (heading?.[2] ?? 'Section').trim();
  let evidence = null;
  for (const u of users) {
    if (!u.startsWith('{')) continue;
    try { const j = JSON.parse(u); if (j?.type === 'retained_csr_evidence') evidence = j.evidence; } catch { /* not the evidence message */ }
  }
  const lines = [title, ''];
  if (!evidence) return { number, text: [...lines, ...planProse(studyOf(brief))].join('\n\n') };
  const cells = quotableCells(evidence, 6);
  lines.push(
    `This section reports values transcribed from the retained analysis tables for the study. The values are historical retained aggregates and their clinical interpretation is for the reviewing clinician and statistician.`,
  );
  for (const cell of cells) {
    lines.push(`In the table "${cell.title.replace(/\d+(?:[.-]\d+)*/g, '').replace(/\s+/g, ' ').trim()}", the row "${cell.label}" under "${cell.header}" reads ${cell.value}.`);
  }
  if (cells.length === 0) lines.push('The retained tables carry no cell this draft can quote without a figure in its label.');
  lines.push('The analysis population, the method and any comparison between groups are to be stated by the medical writer from the statistical analysis plan.');
  const claims = cells.map(({ table, row, column, value }) => ({ table, row, column, value }));
  return { number, text: `${lines.join('\n')}\n\n\`\`\`csr-claims\n${JSON.stringify(claims)}\n\`\`\`` };
}

function plan(body) {
  const system = systemOf(body);
  if (/clinical study report writer/i.test(system)) {
    const d = draftSection(body);
    return { kind: `csr §${d.number}`, text: d.text };
  }
  return { kind: 'chat', text: 'This is the stand-in provider answering. The request reached the provider boundary with a valid shape.' };
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

const sendJson = (res, status, obj, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', 'request-id': `req_fake_${Date.now()}`, ...headers });
  res.end(JSON.stringify(obj));
};
const sse = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
const readBody = req => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', c => chunks.push(c)).on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))).on('error', reject);
});

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const STREAM_CHARS = Number(process.env.FAKE_STREAM_CHARS || 400);
const STREAM_MS = Number(process.env.FAKE_STREAM_MS || 0);

/** A streamed reply: an empty thinking block where the model reasons first, then the text in pieces. */
async function streamReply(res, body, text, n) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  sse(res, 'message_start', { type: 'message_start', message: { id: `msg_fake_${n}`, type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 400, output_tokens: 1 } } });
  let index = 0;
  if (thinks(body)) {
    sse(res, 'content_block_start', { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } });
    sse(res, 'content_block_delta', { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: `sig_fake_${n}` } });
    sse(res, 'content_block_stop', { type: 'content_block_stop', index });
    index += 1;
  }
  sse(res, 'content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
  for (let i = 0; i < text.length; i += STREAM_CHARS) {
    sse(res, 'content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: text.slice(i, i + STREAM_CHARS) } });
    if (STREAM_MS > 0) await pause(STREAM_MS);
  }
  sse(res, 'content_block_stop', { type: 'content_block_stop', index });
  sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: Math.ceil(text.length / 4) } });
  sse(res, 'message_stop', { type: 'message_stop' });
  res.end();
}

let seq = 0;
const stamps = [];
const counts = { messages: 0, refused: 0, models: 0, limited: 0 };

const apiError = (type, message) => ({ type: 'error', error: { type, message } });

/** GET routes and the key check; true when the request was answered here. */
function answeredWithoutModel(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/__counts') { sendJson(res, 200, counts); return true; }
  if (!req.headers['x-api-key']) { sendJson(res, 401, apiError('authentication_error', 'x-api-key header is required')); return true; }
  if (req.method === 'GET' && url.pathname === '/v1/models') {
    counts.models += 1;
    sendJson(res, 200, { data: MODEL_IDS.map(id => ({ type: 'model', id, display_name: id, created_at: '2026-01-01T00:00:00Z' })), has_more: false, first_id: MODEL_IDS[0], last_id: MODEL_IDS[MODEL_IDS.length - 1] });
    return true;
  }
  if (req.method !== 'POST' || url.pathname !== '/v1/messages') { sendJson(res, 404, apiError('not_found_error', 'not found')); return true; }
  return false;
}

/** The configured API error (FAKE_FAIL) or the per-minute limit (FAKE_RPM); true when the request was refused. */
function refusedByAccount(res, body, n) {
  if (FAILURES[FAIL]) {
    const [status, type, message] = FAILURES[FAIL];
    log(`#${n} ${status} ${type} (FAKE_FAIL=${FAIL}) model=${body.model}`);
    sendJson(res, status, apiError(type, message), status === 429 ? { 'retry-after': '20' } : {});
    return true;
  }
  if (RPM <= 0) return false;
  const now = Date.now();
  while (stamps.length && now - stamps[0] > 60_000) stamps.shift();
  if (stamps.length < RPM) { stamps.push(now); return false; }
  counts.limited += 1;
  const wait = Math.ceil((60_000 - (now - stamps[0])) / 1000);
  log(`#${n} 429 rate limit (${RPM}/min) model=${body.model} retry-after=${wait}`);
  sendJson(res, 429, apiError('rate_limit_error', `This request would exceed the rate limit of ${RPM} requests per minute.`), { 'retry-after': String(wait) });
  return true;
}

async function answer(res, body, n) {
  const p = plan(body);
  log(`#${n} 200 model=${body.model} stream=${!!body.stream} ${p.kind} effort=${body.output_config?.effort ?? '-'} thinking=${body.thinking?.type ?? '-'}`);
  await new Promise(r => setTimeout(r, Number(process.env.FAKE_DELAY_MS || 150)));
  if (body.stream) return streamReply(res, body, p.text, n);
  const content = [];
  if (thinks(body)) content.push({ type: 'thinking', thinking: '', signature: `sig_fake_${n}` });
  content.push({ type: 'text', text: p.text });
  return sendJson(res, 200, { id: `msg_fake_${n}`, type: 'message', role: 'assistant', model: body.model, content, stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 400, output_tokens: Math.ceil(p.text.length / 4) } });
}

async function handle(req, res) {
  if (answeredWithoutModel(req, res, new URL(req.url, 'http://x'))) return undefined;
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, apiError('invalid_request_error', 'bad json')); }
  const n = ++seq;
  counts.messages += 1;
  const bad = validate(body, req.headers);
  if (REQ_DIR) fs.writeFileSync(path.join(REQ_DIR, `${String(n).padStart(4, '0')}.json`), JSON.stringify({ refused: bad, version: req.headers['anthropic-version'], beta: req.headers['anthropic-beta'] ?? null, body }, null, 1));
  if (bad) {
    counts.refused += 1;
    log(`#${n} ${bad.status} REFUSED model=${body.model}: ${bad.message}`);
    return sendJson(res, bad.status, apiError(bad.type, bad.message));
  }
  if (refusedByAccount(res, body, n)) return undefined;
  return answer(res, body, n);
}

http.createServer((req, res) => {
  handle(req, res).catch(err => { log('request failed:', err?.message); if (!res.writableEnded) res.end(); });
}).listen(PORT, '127.0.0.1', () => log(`CSR stand-in on :${PORT} fail=${FAIL || '-'} rpm=${RPM || '-'}`));
