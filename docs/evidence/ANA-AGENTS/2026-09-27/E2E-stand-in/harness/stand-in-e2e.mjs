// A scripted stand-in for the Anthropic Messages API, for capturing row 74's
// S1 / S2 / S4 behaviour end to end without a model key. IT IS NOT A MODEL.
// It plays a fixed script per scenario, keyed by a phrase in the person's ask
// (SCENARIOS below), and it refuses every request the real API documents that
// it refuses, by importing the W1 lane's contract (single-sourced, not copied):
//   docs/evidence/W1/2026-09-28-ana-drive/harness/api-contract.mjs
//
// COPIED from the W1 lane's stand-in-model.mjs (sha256 27c19a67…): the wire
// half only — SSE framing, the thinking block an adaptive model streams first,
// text/tool_use streaming, request saving. That file starts a server when it
// is imported and exports nothing, so it cannot be imported; its model half
// (navigation, demos) is not used here. What is new: the scenario scripts, a
// per-request JSON log line (what the server SENT: model, effort, max_tokens,
// tools offered, the stopped-turn note, the steer, the redirect), and
// FAKE_TOOL to choose the read tool the scripts call.
//
//   API_CONTRACT   path to api-contract.mjs (default: the W1 harness, relative)
//   FAKE_PORT      default 8787
//   FAKE_DELAY_MS  pacing (default 300)
//   FAKE_REQ_DIR   where each request body is saved (required)
//   FAKE_TOOL      comma list of read-only tools the scripts may call; the first offered is used
//   FAKE_PROJECT_ID  the project the proposed task names (default 1, the GA seed's C2C-001 IND Program)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const contractUrl = process.env.API_CONTRACT
  ? pathToFileURL(path.resolve(process.env.API_CONTRACT)).href
  : new URL('../../../../W1/2026-09-28-ana-drive/harness/api-contract.mjs', import.meta.url).href;
const { validate, thinks } = await import(contractUrl);

const REQ_DIR = process.env.FAKE_REQ_DIR;
if (!REQ_DIR) throw new Error('FAKE_REQ_DIR is required');
fs.mkdirSync(REQ_DIR, { recursive: true });
const PORT = Number(process.env.FAKE_PORT || 8787);
const DELAY = Number(process.env.FAKE_DELAY_MS || 300);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 23);
const log = obj => console.info(`${stamp()} ${JSON.stringify(obj)}`);

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(b => (b.type === 'text' ? b.text : b.type === 'tool_result' ? textOf(b.content) : '')).join('\n');
}

// ── Reading the request ──────────────────────────────────────────────────────

const RESULT_RE = /\[Tool Result for ([a-z0-9_]+) \(([^)]*)\)\]:\s*/gi;
const isResultTurn = t => /\[Tool Result for /.test(t);

/** Index of the person's ask: the last user turn that is not tool results or an operator note. */
function askIndex(msgs) {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== 'user') continue;
    const t = textOf(m.content);
    if (isResultTurn(t)) continue;
    if (/^\s*\[(Screen report|User interjection|Operator)/i.test(t)) continue;
    return i;
  }
  return -1;
}

/** Tool results after the ask, in order: {name, json, raw}. */
function resultsSince(msgs, from) {
  const out = [];
  for (const m of msgs.slice(from + 1)) {
    if (m.role !== 'user') continue;
    const text = textOf(m.content);
    const hits = [...text.matchAll(RESULT_RE)];
    hits.forEach((h, k) => {
      const start = h.index + h[0].length;
      const end = k + 1 < hits.length ? hits[k + 1].index : text.length;
      const raw = text.slice(start, end).trim();
      let json = null;
      try {
        json = JSON.parse(raw);
      } catch {
        try {
          json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
        } catch {
          /* not JSON */
        }
      }
      out.push({ name: h[1], json, raw });
    });
  }
  return out;
}

/** Everything after the ask that is not a tool result: operator notes, steers, reports. */
function notesSince(msgs, from) {
  return msgs
    .slice(from + 1)
    .filter(m => m.role !== 'assistant')
    .map(m => ({ role: m.role, text: textOf(m.content) }))
    .map(n => (n.role === 'user' ? { ...n, text: n.text.replace(/\[Tool Result for [\s\S]*?(?=\n\n\[|$)/g, '').trim() } : n))
    .filter(n => n.text);
}

// Read-only tools (the gate classifies each UNGOVERNED), in order of preference.
// The server offers a relevance-ranked subset per ask, so the first offered wins.
const READ_TOOLS = (process.env.FAKE_TOOL || 'search_all_documents,global_search,list_vault_documents,project_knowledge_search').split(',');

/** A novel input for `tool` from its schema: every required string gets `words`. */
function inputFor(tool, words) {
  const props = tool.input_schema?.properties || {};
  const required = tool.input_schema?.required || [];
  const input = {};
  for (const k of required.length ? required : Object.keys(props).slice(0, 1)) {
    const t = props[k]?.type;
    if (t === 'string' || t === undefined) input[k] = words;
    else if (t === 'number' || t === 'integer') input[k] = 5;
    else if (t === 'boolean') input[k] = false;
    else if (t === 'array') input[k] = [words];
  }
  return input;
}

function readTool(body) {
  const offered = body.tools || [];
  for (const name of READ_TOOLS) {
    const t = offered.find(x => x.name === name);
    if (t) return t;
  }
  return null;
}

// ── The scripts ──────────────────────────────────────────────────────────────
// Each: (ctx) => { tool?: {name, input}, text?: string }. ctx.k = tool results
// already returned in this turn (so round k+1 is being asked for); ctx.tools =
// whether tools were offered on this call (the loop withdraws them on its
// closing call).

function call(ctx, words, say) {
  const t = readTool(ctx.body);
  if (!t) return { text: `STAND-IN: no read tool was offered on this call (asked for ${READ_TOOLS.join(', ')}).` };
  return { tool: { name: t.name, input: inputFor(t, words) }, text: say };
}

const SCENARIOS = [
  {
    id: 's1-round-cap',
    match: /survey every source/i,
    plan: ctx =>
      ctx.tools
        ? call(ctx, `stability evidence source ${ctx.k + 1}`, `Checking source ${ctx.k + 1}.`)
        : { text: `Stand-in answer: I looked at ${ctx.k} sources and had more to check when the turn was closed.` },
  },
  {
    id: 's4-auto-12',
    match: /work through twelve checks/i,
    plan: ctx =>
      ctx.tools && ctx.k < 12
        ? call(ctx, `readiness check ${ctx.k + 1} of 12`, `Check ${ctx.k + 1} of 12.`)
        : { text: `Stand-in answer: all ${ctx.k} checks are done.` },
  },
  {
    id: 's4-manual',
    match: /check three readiness sources/i,
    plan: ctx => {
      const last = ctx.results[ctx.results.length - 1];
      if (last?.json?.redirected === true) {
        return { text: `Stand-in answer: I did not run that step (${last.json.tool}); I am following your instruction instead.` };
      }
      if (!ctx.tools || ctx.k >= 3) return { text: `Stand-in answer: the ${ctx.k} readiness sources are checked.` };
      return call(ctx, `readiness source ${ctx.k + 1} of 3`, `Readiness source ${ctx.k + 1}.`);
    },
  },
  {
    id: 's4-manual-unavailable',
    match: /check two readiness sources/i,
    plan: ctx =>
      ctx.tools && ctx.k < 2
        ? call(ctx, `unavailable probe ${ctx.k + 1} of 2`, `Source ${ctx.k + 1} of 2.`)
        : { text: `Stand-in answer: both sources are checked.` },
  },
  {
    id: 's4-approval',
    match: /create a review task/i,
    plan: ctx => {
      if (ctx.k === 0 && ctx.tools && (ctx.body.tools || []).some(t => t.name === 'execute_platform_command')) {
        return {
          tool: {
            name: 'execute_platform_command',
            input: {
              command: 'create_task',
              params: { projectId: Number(process.env.FAKE_PROJECT_ID || 1), title: 'E2E stand-in: review the stability protocol', description: 'Proposed by the scripted stand-in model.', priority: 'medium' },
            },
          },
          text: 'I will propose the task; it needs your approval.',
        };
      }
      const last = ctx.results[ctx.results.length - 1];
      if (!last) return { text: 'STAND-IN: execute_platform_command was not offered on this call.' };
      const j = last.json || {};
      return { text: `Stand-in answer: the task outcome was ${j.error || (j.success ? 'success' : 'unknown')}${j.message ? ` — ${j.message}` : ''}` };
    },
  },
  {
    id: 's2-deep',
    match: /in depth, please/i,
    plan: () => ({ text: 'Stand-in answer for the engine check. No tools.' }),
  },
  {
    id: 'continue',
    match: /^\s*continue from where you stopped/i,
    plan: () => ({ text: 'Stand-in answer: picking up from where the previous turn stopped.' }),
  },
];

function plan(body) {
  const msgs = body.messages || [];
  const ai = askIndex(msgs);
  const ask = ai >= 0 ? textOf(msgs[ai].content) : '';
  const results = ai >= 0 ? resultsSince(msgs, ai) : [];
  // tool_choice none (the loop's closing call) means no tool may be called, as on the real API.
  const ctx = { body, msgs, ask, results, k: results.length, tools: (body.tools || []).length > 0 && body.tool_choice?.type !== 'none' };
  // Side calls (titles, reflection) are not streamed and can quote the ask: never scripted.
  if (!body.stream) return { scenario: null, ctx, ai, text: 'Stand-in side call' };
  const sc = SCENARIOS.find(s => s.match.test(ask));
  if (sc) return { scenario: sc.id, ctx, ai, ...sc.plan(ctx) };
  return { scenario: null, ctx, ai, text: 'Stand-in: no scenario matched this ask.' };
}

// ── The wire (copied from the W1 stand-in-model.mjs; see the header) ────────

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}
async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw;
}
async function streamThinking(res, body, n, index) {
  sse(res, 'content_block_start', { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } });
  if (body.thinking?.display === 'summarized') {
    sse(res, 'content_block_delta', { type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: 'Stand-in thinking summary.' } });
  }
  sse(res, 'content_block_delta', { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: `sig_fake_${n}` } });
  sse(res, 'content_block_stop', { type: 'content_block_stop', index });
  return index + 1;
}
async function streamText(res, text, index) {
  sse(res, 'content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
  const words = text.split(/(?<=\s)/);
  for (let i = 0; i < words.length; i += 3) {
    sse(res, 'content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: words.slice(i, i + 3).join('') } });
    await sleep(Math.max(10, DELAY / 30));
  }
  sse(res, 'content_block_stop', { type: 'content_block_stop', index });
  return index + 1;
}
function streamToolCall(res, tool, n, index) {
  sse(res, 'content_block_start', { type: 'content_block_start', index, content_block: { type: 'tool_use', id: `toolu_fake_${n}`, name: tool.name, input: {} } });
  sse(res, 'content_block_delta', { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(tool.input) } });
  sse(res, 'content_block_stop', { type: 'content_block_stop', index });
}
async function streamReply(res, body, p, n) {
  const stop = p.tool ? 'tool_use' : 'end_turn';
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  sse(res, 'message_start', { type: 'message_start', message: { id: `msg_fake_${n}`, type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1 } } });
  sse(res, 'ping', { type: 'ping' });
  let index = 0;
  if (thinks(body)) index = await streamThinking(res, body, n, index);
  if (p.text) index = await streamText(res, p.text, index);
  if (p.tool) streamToolCall(res, p.tool, n, index);
  sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 20 } });
  sse(res, 'message_stop', { type: 'message_stop' });
  res.end();
}
function replyContent(body, p, n) {
  const content = [];
  if (thinks(body)) content.push({ type: 'thinking', thinking: '', signature: `sig_fake_${n}` });
  if (p.text) content.push({ type: 'text', text: p.text });
  if (p.tool) content.push({ type: 'tool_use', id: `toolu_fake_${n}`, name: p.tool.name, input: p.tool.input });
  return content;
}

// ── What the server sent, one JSON line per request ─────────────────────────

/** The request's own settings, as the log records them. */
function requestShape(body) {
  return {
    stream: !!body.stream,
    model: body.model,
    effort: body.output_config?.effort ?? null,
    thinking: body.thinking?.type ?? null,
    max_tokens: body.max_tokens,
    tools: (body.tools || []).length,
    tool_choice: body.tool_choice?.type ?? null,
    msgs: (body.messages || []).length,
  };
}

function describe(n, body, p) {
  const { ctx } = p;
  const all = (body.messages || []).map(m => textOf(m.content)).join('\n');
  const sys = typeof body.system === 'string' ? body.system : (body.system || []).map(b => b.text || '').join('\n');
  const notes = p.ai >= 0 ? notesSince(body.messages, p.ai) : [];
  const stoppedNote = /Your previous turn [^\n]*before it was finished[^\n]*/.exec(`${sys}\n${all}`);
  const last = ctx.results[ctx.results.length - 1];
  return {
    n,
    scenario: p.scenario,
    ...requestShape(body),
    ask: ctx.ask.slice(0, 80),
    resultsThisTurn: ctx.k,
    lastResult: last ? { name: last.name, json: last.json ? JSON.stringify(last.json).slice(0, 220) : last.raw.slice(0, 220) } : null,
    notesAfterAsk: notes.map(x => `${x.role}: ${x.text.slice(0, 300)}`),
    stoppedTurnNote: stoppedNote ? stoppedNote[0].slice(0, 400) : null,
    reply: p.tool ? { tool: p.tool.name, input: p.tool.input } : { text: (p.text || '').slice(0, 120) },
  };
}

// Numbering continues across restarts, so a restarted stand-in never overwrites a saved body.
let seq = fs.readdirSync(REQ_DIR).filter(f => /^\d{4}\.json$/.test(f)).length;
async function handle(req, res) {
  if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) {
    return sendJson(res, 404, { type: 'error', error: { type: 'not_found_error', message: 'not found' } });
  }
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    res.writeHead(400);
    return res.end('bad json');
  }
  const n = ++seq;
  const bad = validate(body, req.headers);
  fs.writeFileSync(path.join(REQ_DIR, `${String(n).padStart(4, '0')}.json`), JSON.stringify({ n, beta: req.headers['anthropic-beta'] ?? null, verdict: bad, body }, null, 1));
  if (bad) {
    log({ n, REFUSED: bad.status, model: body.model, message: bad.message });
    return sendJson(res, bad.status, { type: 'error', error: { type: bad.type, message: bad.message }, request_id: `req_fake_${n}` });
  }
  const p = plan(body);
  log(describe(n, body, p));
  await sleep(DELAY / 3);
  if (body.stream) return streamReply(res, body, p, n);
  return sendJson(res, 200, { id: `msg_fake_${n}`, type: 'message', role: 'assistant', model: body.model, content: replyContent(body, p, n), stop_reason: p.tool ? 'tool_use' : 'end_turn', stop_sequence: null, usage: { input_tokens: 100, output_tokens: 20 } });
}

http
  .createServer((req, res) => {
    handle(req, res).catch(err => {
      log({ error: err instanceof Error ? err.message : String(err) });
      if (!res.writableEnded) res.end();
    });
  })
  .listen(PORT, '127.0.0.1', () => log({ up: `stand-in (scripted, NOT a model) on :${PORT}`, contract: contractUrl }));
