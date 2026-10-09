// A local stand-in for the Anthropic Messages API, for an end-to-end run of the
// REAL server loop with no model key. It plays a fixed turn: declare a plan,
// search the project, mark steps done, answer. Tool calls are made only for
// tools the server actually offered in `tools`. Every request is logged.
import http from 'node:http';
import fs from 'node:fs';

const PORT = Number(process.env.FAKE_PORT || 5099);
const HOLD_MS = Number(process.env.HOLD_MS || 0); // pause before each tool round
const LOG = process.env.FAKE_LOG || '/tmp/fake-anthropic.log';

const plan = (...s) => ({ steps: s.map(([title, status]) => ({ title, status })) });
const SECTION = '<p>The primary endpoint is progression-free survival (PFS) at 12 months, assessed by blinded independent central review per RECIST 1.1.</p><p>Intercurrent events are handled with a treatment-policy strategy: outcomes after discontinuation or rescue therapy are included as observed.</p><p>The key secondary endpoint is overall survival, tested hierarchically after PFS to control the family-wise error rate at a one-sided alpha of 0.025.</p>';
const SCRIPT = [
  { tool: 'update_plan', input: plan(['Read the protocol', 'in_progress'], ['Draft the endpoint summary', 'pending'], ['Check the estimand', 'pending']) },
  { tool: 'project_knowledge_search', input: { query: 'primary endpoint' } },
  { tool: 'update_plan', input: plan(['Read the protocol', 'completed'], ['Draft the endpoint summary', 'in_progress'], ['Check the estimand', 'pending']) },
  { tool: 'draft_authoring_document', input: { title: 'Primary endpoint summary — ONC-221', module: 'M2', sections: [{ code: '2.7.3.1', title: 'Primary endpoint', content: SECTION }] } },
  { tool: 'update_plan', input: plan(['Read the protocol', 'completed'], ['Draft the endpoint summary', 'completed'], ['Check the estimand', 'in_progress']) },
  { tool: 'update_plan', input: plan(['Read the protocol', 'completed'], ['Draft the endpoint summary', 'completed'], ['Check the estimand', 'completed']) },
  { text: 'I drafted the primary endpoint summary from Protocol ONC-221 v3.2: PFS at 12 months by blinded central review, with a treatment-policy estimand for intercurrent events. It is saved as an authoring document for your review.' },
];

const log = (o) => fs.appendFileSync(LOG, JSON.stringify(o) + '\n');

// The loop returns results either as tool_result blocks or as text headed
// "[Tool Result for <name> (<id>)]" — count both.
function toolResultsSoFar(messages) {
  let n = 0;
  for (const m of messages || []) {
    const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content ?? '') }];
    for (const b of blocks) {
      if (b.type === 'tool_result') n += 1;
      else if (b.type === 'text') n += (String(b.text).match(/\[Tool Result for /g) || []).length;
    }
  }
  return n;
}

function nextStep(body) {
  const offered = new Set((body.tools || []).map((t) => t.name));
  const script = SCRIPT.filter((s) => !s.tool || offered.has(s.tool));
  const n = toolResultsSoFar(body.messages);
  return { step: script[Math.min(n, script.length - 1)], offered: [...offered], n };
}

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function streamStep(res, step, model) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  sse(res, 'message_start', {
    type: 'message_start',
    message: { id: `msg_${Date.now()}`, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 50, output_tokens: 1 } },
  });
  if (step.tool) {
    sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: `toolu_${Date.now()}`, name: step.tool, input: {} } });
    sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(step.input) } });
    sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
    sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 20 } });
  } else {
    sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    for (const part of step.text.match(/.{1,24}/g)) {
      sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: part } });
    }
    sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
    sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 40 } });
  }
  sse(res, 'message_stop', { type: 'message_stop' });
  res.end();
}

function jsonStep(res, step, model) {
  const content = step.tool
    ? [{ type: 'tool_use', id: `toolu_${Date.now()}`, name: step.tool, input: step.input }]
    : [{ type: 'text', text: step.text }];
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({
    id: `msg_${Date.now()}`, type: 'message', role: 'assistant', model, content,
    stop_reason: step.tool ? 'tool_use' : 'end_turn', stop_sequence: null, usage: { input_tokens: 50, output_tokens: 20 },
  }));
}

http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', async () => {
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch { /* not JSON */ }
    if (!req.url.startsWith('/v1/messages')) {
      log({ url: req.url, note: 'unhandled' });
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'fake' } }));
    }
    const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
    // A side call (classifier, title, summariser) gets a plain short answer.
    if (!hasTools) {
      log({ url: req.url, stream: !!body.stream, side: true });
      const step = { text: 'OK' };
      return body.stream ? streamStep(res, step, body.model) : jsonStep(res, step, body.model);
    }
    const { step, offered, n } = nextStep(body);
    log({ url: req.url, stream: !!body.stream, n, step: step.tool || 'text', offeredPlan: offered.includes('update_plan'), offeredSearch: offered.includes('project_knowledge_search'), offeredDraft: offered.includes('draft_authoring_document'), toolCount: offered.length, lastUser: JSON.stringify(body.messages?.slice(-1)).slice(0, 300) });
    if (HOLD_MS && step.tool) await new Promise((r) => setTimeout(r, HOLD_MS));
    return body.stream ? streamStep(res, step, body.model) : jsonStep(res, step, body.model);
  });
}).listen(PORT, '127.0.0.1', () => log({ up: PORT }));
