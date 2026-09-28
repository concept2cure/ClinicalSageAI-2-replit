// Strict stand-in for the Anthropic Messages API, for driving AnA end to end
// without a key. It behaves like a model that uses the self-drive tools the
// way the prompts ask, it refuses requests the real API refuses (see
// ../contract-audit.txt for each rule's source), and it streams the way a
// real adaptive model does: a thinking block first, pings, and — with
// FAKE_THINK_MS — thinking in silence. See README.md for how to run it.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { thinks, validate } from './api-contract.mjs';

const REQ_DIR = process.env.FAKE_REQ_DIR || path.join(os.tmpdir(), 'ana-drive-stand-in', 'requests');
fs.mkdirSync(REQ_DIR, { recursive: true });

const PORT = Number(process.env.FAKE_PORT || 8787);
const DELAY = Number(process.env.FAKE_DELAY_MS || 600);
const NO_TEXT = process.env.FAKE_NO_TEXT === '1'; // tool rounds carry no prose
const log = (...a) => console.info(new Date().toISOString().slice(11, 23), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(b => (b.type === 'text' ? b.text : b.type === 'tool_result' ? textOf(b.content) : '')).join('\n');
}

// ── The model it plays ────────────────────────────────────────────────────────

function parseResultBody(body) {
  try {
    return JSON.parse(body);
  } catch {
    /* not bare JSON: try the outermost braces */
  }
  try {
    return JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
}

function resultsIn(text) {
  const re = /\[Tool Result for ([a-z_]+) \(([^)]*)\)\]:\s*/g;
  const found = [];
  let hit;
  while ((hit = re.exec(text))) found.push({ name: hit[1], start: hit.index, bodyStart: re.lastIndex });
  return found.map((h, k) => {
    const raw = text.slice(h.bodyStart, k + 1 < found.length ? found[k + 1].start : undefined).trim();
    return { name: h.name, json: parseResultBody(raw), raw };
  });
}

/** Parse "[Tool Result for NAME (ID)]: {json}" blocks out of user turns. */
function toolResults(msgs) {
  return msgs.filter(m => m.role === 'user').flatMap(m => resultsIn(textOf(m.content)));
}

function findAsk(msgs) {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== 'user') continue;
    const t = textOf(m.content);
    if (/\[Tool Result for /.test(t)) continue;
    if (/^\s*\[(Screen report|User interjection)/i.test(t)) continue;
    if (/take me|open program|search the vault|demo|go to|show me/i.test(t)) return t;
  }
  return '';
}

const NAME_PARAM = {
  'authoring.open-document': 'title',
  'submissions.select-submission': 'submission',
  'risk.select-hazard': 'hazard',
  'change-assessment.select-change': 'change',
};
let demo = null;

const outcomeOf = last => `${last.json?.status ?? 'unknown'}${last.json?.message ? ' — ' + last.json.message : ''}`;

function turnOf(body) {
  const msgs = body.messages || [];
  const offered = new Set((body.tools || []).map(tool => tool.name));
  const results = toolResults(msgs);
  return {
    body,
    msgs,
    all: msgs.map(m => textOf(m.content)).join('\n'),
    ask: findAsk(msgs).toLowerCase(),
    results,
    last: results[results.length - 1],
    tool(name, input, say) {
      if (!offered.has(name)) return { text: `FAKE: the tool ${name} was not offered on this turn.` };
      return { tool: { name, input }, text: NO_TEXT ? '' : say || '' };
    },
  };
}

// An app observation from the screen, spliced mid-turn.
function planReport(t) {
  const lastText = textOf(t.msgs[t.msgs.length - 1]?.content ?? '');
  const report = /Screen report[^\n]*\n?([^\n]*)/i.exec(lastText);
  if (!report || /demo/.test(t.ask) || /\[Tool Result for /.test(lastText)) return null;
  return { text: `That did not happen on your screen: ${report[1] || 'the move was refused'}. I will not claim it did.` };
}

function planDemoStart(t) {
  if (!t.results.some(r => r.name === 'list_demo_scripts')) {
    demo = null;
    return t.tool('list_demo_scripts', {}, 'Let me find the right demonstration.');
  }
  const id = /sales/.test(t.ask) ? 'sales-flagship' : 'training-orientation';
  return t.tool('start_product_demo', { demo: id }, 'Starting the demonstration.');
}

function demoProgram(d) {
  const want = String(process.env.FAKE_DEMO_PROGRAM || '').toLowerCase();
  const chosen = want && d.programs?.find(p => `${p.name} ${p.code || ''}`.toLowerCase().includes(want));
  return chosen?.name || d.programs?.[0]?.name;
}

// A screen report that lists what IS on screen: retry the guessed act once with a real name.
function retryWithListedName(t) {
  const listings = [...t.all.matchAll(/listed: "([^"]+)"/gi)];
  if (listings.length <= demo.reportsSeen) return null;
  const newest = listings[listings.length - 1][1];
  demo.reportsSeen = listings.length;
  if (!demo.guess || demo.retried.has(demo.guess.actionId)) return null;
  const g = demo.guess;
  demo.retried.add(g.actionId);
  demo.guess = null;
  const name = newest.replace(/^([A-Z]+-\d+) — .*/, '$1');
  return t.tool('act_on_screen', { action: g.actionId, params: { ...g.params, [g.param]: name } }, `The screen lists "${newest}" — opening that one.`);
}

// The last act could not be sent without a name: send a guess; the screen will say what exists.
function guessName(t) {
  if (t.last?.name !== 'act_on_screen' || t.last.json?.status !== 'needs_parameters' || !demo.pendingAct) return null;
  const a = demo.pendingAct;
  demo.pendingAct = null;
  const param = NAME_PARAM[a.actionId];
  if (!param) return null;
  demo.guess = { actionId: a.actionId, params: a.params, param };
  return t.tool('act_on_screen', { action: a.actionId, params: { ...a.params, [param]: 'Quarterly summary' } }, 'Opening one of their records.');
}

function nextStop(t, steps, program) {
  if (demo.idx >= steps.length) return { text: `That is the whole demonstration: ${steps.length} stops. Ask me about any of them.` };
  const s = steps[demo.idx++];
  const say = `Stop ${demo.idx}: ${String(s.say).split('.')[0]}.`;
  if (s.navigate) return t.tool('navigate_to', { target: s.navigate.target, ...(program ? { program } : {}) }, say);
  const opensProgram = s.act.actionId === 'projects.open-program' && program;
  const params = { ...(s.act.params || {}), ...(opensProgram ? { program } : {}) };
  demo.pendingAct = { actionId: s.act.actionId, params };
  return t.tool('act_on_screen', { action: s.act.actionId, params }, say);
}

function planDemo(t) {
  if (!/demo/.test(t.ask)) return null;
  const started = t.results.filter(r => r.name === 'start_product_demo').pop();
  if (!started) return planDemoStart(t);
  const d = started.json || {};
  if (d.status !== 'demo_ready') return { text: `The demonstration could not start: ${d.message || d.status}.` };
  const steps = (d.script?.steps || []).filter(s => s.navigate || s.act);
  if (!demo || demo.script !== d.script?.id) demo = { script: d.script?.id, idx: 0, reportsSeen: 0, guess: null, retried: new Set() };
  return retryWithListedName(t) ?? guessName(t) ?? nextStop(t, steps, demoProgram(d));
}

function planVaultSearch(t) {
  const asked = /search the vault for (\w+)/.exec(t.ask);
  if (!asked) return null;
  const { last, results } = t;
  const search = say => t.tool('act_on_screen', { action: 'vault.search', params: { query: asked[1] } }, say);
  if (!last) return search('Searching the Vault.');
  // Asked which program: open one on the Vault, as the refusal says, then search again.
  const programs = last.json?.programs ?? [];
  if (last.name === 'act_on_screen' && last.json?.status === 'needs_project' && programs.length && results.length < 3) {
    return t.tool('navigate_to', { target: 'vault', program: programs[0].name }, `Opening ${programs[0].name}'s Vault first.`);
  }
  if (last.name === 'navigate_to' && last.json?.status === 'navigation_ready' && results.length < 4) return search('Now searching it.');
  return { text: `Vault search result: ${outcomeOf(last)}.` };
}

function planOpenProgram(t) {
  const asked = /open program ([\w-]+)/.exec(t.ask);
  if (!asked) return null;
  const { last, results } = t;
  if (!last) return t.tool('act_on_screen', { action: 'projects.open-program', params: { program: asked[1] } }, `Opening ${asked[1]}.`);
  const opened = ['applied', 'performed', 'queued', 'ok', 'done'].some(s => String(last.json?.status || '').includes(s));
  if (last.name === 'act_on_screen' && results.length < 2 && opened) return t.tool('navigate_to', { target: 'project-home' }, 'Taking you to its home.');
  return { text: `Open program: ${outcomeOf(last)}.` };
}

function planNav(t) {
  const asked = /take me to (?:the )?([\w -]+)/.exec(t.ask);
  if (!asked) return null;
  const want = asked[1].trim();
  const target = /biostat/.test(want) ? 'biostatistics' : want.replace(/\s+/g, '-');
  const { last, results } = t;
  if (!last) return t.tool('navigate_to', { target }, `Opening ${want}.`);
  const programs = last.json?.programs ?? [];
  if (last.json?.status === 'needs_project' && programs.length && results.length < 3) {
    return t.tool('navigate_to', { target, program: programs[0].name }, `I will use ${programs[0].name}.`);
  }
  return { text: `Navigation result: ${outcomeOf(last)}. You are on ${want} now.` };
}

function plan(body) {
  const t = turnOf(body);
  const planned = planReport(t) ?? planDemo(t) ?? planVaultSearch(t) ?? planOpenProgram(t) ?? planNav(t);
  if (planned) return cutOff(t, planned);
  if (/title|summar/i.test(t.all.slice(0, 400)) && !body.stream) return { text: 'Live Drive test' };
  return { text: 'Understood.' };
}

// FAKE_CUT_OFF: on asks matching the pattern, the final answer stops halfway
// with stop_reason "max_tokens", as the real API ends one at the length limit.
function cutOff(t, planned) {
  const match = process.env.FAKE_CUT_OFF ? new RegExp(process.env.FAKE_CUT_OFF, 'i') : null;
  if (!match || planned.tool || !match.test(t.ask)) return planned;
  return { text: planned.text.slice(0, Math.ceil(planned.text.length / 2)), stop: 'max_tokens' };
}

// ── The wire ──────────────────────────────────────────────────────────────────

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

function saveRequest(n, headers, verdict, body) {
  try {
    const file = path.join(REQ_DIR, `${String(n).padStart(4, '0')}.json`);
    fs.writeFileSync(file, JSON.stringify({ n, beta: headers['anthropic-beta'] ?? null, verdict, body }, null, 1));
  } catch {
    /* a request that cannot be saved is still answered */
  }
}

function logReceived(body, p, n) {
  const lastText = (body.messages || []).slice(-2).map(m => textOf(m.content)).join('\n');
  const report = /\[Screen report\][^\n]*\n?\n?([^\n]{0,200})/.exec(lastText);
  if (report) log(`#${n} received screen report: ${report[1]}`);
  const what = p.tool ? `${p.tool.name} ${JSON.stringify(p.tool.input)}` : `text "${p.text.slice(0, 80)}"`;
  log(`#${n} stream=${!!body.stream} tools=${(body.tools || []).length} msgs=${(body.messages || []).length} ->`, what);
}

// FAKE_SLOW_TOOL=name:ms holds a round that calls `name`, so a test can act
// (take over, switch off, navigate away) before its result lands.
async function holdSlowTool(p) {
  const [slowName, slowMs] = String(process.env.FAKE_SLOW_TOOL || '').split(':');
  if (p.tool && slowName && p.tool.name === slowName) await sleep(Number(slowMs) || 4000);
}

// FAKE_THINK_MS: think silently for that long, as display "omitted" does —
// the API sends only ping events meanwhile (FAKE_THINK_MATCH limits it to
// asks matching a pattern).
async function thinkSilently(res, body, n) {
  const thinkMs = Number(process.env.FAKE_THINK_MS || 0);
  const match = process.env.FAKE_THINK_MATCH ? new RegExp(process.env.FAKE_THINK_MATCH, 'i') : null;
  if (thinkMs <= 0 || (match && !match.test(findAsk(body.messages || [])))) return;
  log(`#${n} thinking silently for ${thinkMs}ms (pings only)`);
  for (let waited = 0; waited < thinkMs; waited += 5000) {
    await sleep(Math.min(5000, thinkMs - waited));
    if (res.writableEnded || res.destroyed) return;
    sse(res, 'ping', { type: 'ping' });
  }
}

// Opus 5.x and Fable default to display "omitted": an empty thinking block
// closed by its signature. "summarized" streams a summary first.
async function streamThinking(res, body, n, index) {
  sse(res, 'content_block_start', { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } });
  await thinkSilently(res, body, n);
  if (body.thinking?.display === 'summarized') {
    sse(res, 'content_block_delta', { type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: 'Working out which screen this needs.' } });
  }
  sse(res, 'content_block_delta', { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: `sig_fake_${n}` } });
  sse(res, 'content_block_stop', { type: 'content_block_stop', index });
  return index + 1;
}

async function streamText(res, text, index) {
  sse(res, 'content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
  const words = text.split(/(?<=\s)/);
  for (let i = 0; i < words.length; i += 2) {
    sse(res, 'content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: words.slice(i, i + 2).join('') } });
    await sleep(Math.max(15, DELAY / 20));
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
  const stop = p.stop ?? (p.tool ? 'tool_use' : 'end_turn');
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

let seq = 0;
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
  saveRequest(n, req.headers, bad, body);
  if (bad) {
    log(`#${n} ${bad.status} REFUSED model=${body.model}: ${bad.message}`);
    return sendJson(res, bad.status, { type: 'error', error: { type: bad.type, message: bad.message }, request_id: `req_fake_${n}` });
  }
  const p = plan(body);
  logReceived(body, p, n);
  await sleep(DELAY / 3);
  await holdSlowTool(p);
  if (body.stream) return streamReply(res, body, p, n);
  const stop = p.stop ?? (p.tool ? 'tool_use' : 'end_turn');
  return sendJson(res, 200, { id: `msg_fake_${n}`, type: 'message', role: 'assistant', model: body.model, content: replyContent(body, p, n), stop_reason: stop, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 20 } });
}

http
  .createServer((req, res) => {
    handle(req, res).catch(err => {
      log('request failed:', err instanceof Error ? err.message : String(err));
      if (!res.writableEnded) res.end();
    });
  })
  .listen(PORT, '127.0.0.1', () => log(`stand-in model on :${PORT} delay=${DELAY} noText=${NO_TEXT}`));
