// The stand-in's own rules, each made to fail on a request built to break it:
// every case must get the status it names. node selftest.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stand-in-selftest-'));
const srv = spawn('node', [path.join(here, 'stand-in-model.mjs')], { env: { ...process.env, FAKE_PORT: '8799', FAKE_REQ_DIR: dir, FAKE_DELAY_MS: '30' }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise(r => setTimeout(r, 700));
const U = t => ({ role: 'user', content: t });
const A = t => ({ role: 'assistant', content: t });
const S = t => ({ role: 'system', content: t });
const tool = { name: 'navigate_to', description: 'go', input_schema: { type: 'object', properties: {} } };
const base = (o = {}) => ({ model: 'claude-opus-5-5', max_tokens: 4096, messages: [U('hi')], ...o });
const cc = { type: 'ephemeral' };
const cases = [
  ['valid: opus-5-5, tool, inline system last', 200, base({ tools: [tool], messages: [U('q'), A('a'), U('r'), S('report')] })],
  ['valid: inline system then assistant', 200, base({ messages: [U('q'), S('steer'), A('a'), U('r')] })],
  ['valid: sonnet-4-6 budget thinking, temperature 1', 200, base({ model: 'claude-sonnet-4-6', max_tokens: 4096, thinking: { type: 'enabled', budget_tokens: 2048 }, temperature: 1 })],
  ['retired model', 404, base({ model: 'claude-3-5-sonnet-20241022' })],
  ['retired opus 4.1', 404, base({ model: 'claude-opus-4-1-20250805' })],
  ['system after assistant', 400, base({ messages: [U('q'), A('a'), S('x')] })],
  ['system followed by user', 400, base({ messages: [U('q'), S('x'), U('r')] })],
  ['system first', 400, base({ messages: [S('x'), U('q')] })],
  ['system on sonnet-5', 400, base({ model: 'claude-sonnet-5', messages: [U('q'), S('x')] })],
  ['temperature on opus-5-5', 400, base({ temperature: 0.3 })],
  ['budget thinking on opus-5', 400, base({ model: 'claude-opus-5', thinking: { type: 'enabled', budget_tokens: 2048 } })],
  ['thinking disabled on opus-5-5', 400, base({ thinking: { type: 'disabled' } })],
  ['tool name with a dot', 400, base({ tools: [{ ...tool, name: 'vault.search' }] })],
  ['extra key on a tool', 400, base({ tools: [{ ...tool, category: 'nav' }] })],
  ['extra key on a message', 400, base({ messages: [{ role: 'user', content: 'q', foldLabel: 'x' }] })],
  ['five cache breakpoints', 400, base({ system: [1, 2, 3, 4, 5].map(i => ({ type: 'text', text: `s${i}`, cache_control: cc })) })],
  ['effort on haiku', 400, base({ model: 'claude-haiku-4-5', output_config: { effort: 'low' } })],
  ['xhigh on sonnet-4-6', 400, base({ model: 'claude-sonnet-4-6', output_config: { effort: 'xhigh' } })],
  ['haiku thinking with temperature 0.3', 400, base({ model: 'claude-haiku-4-5', thinking: { type: 'enabled', budget_tokens: 1024 }, temperature: 0.3 })],
  ['budget >= max_tokens', 400, base({ model: 'claude-sonnet-4-6', max_tokens: 1024, thinking: { type: 'enabled', budget_tokens: 1024 } })],
  ['first message assistant', 400, base({ messages: [A('a'), U('q')] })],
  ['empty user turn mid-conversation', 400, base({ messages: [U(''), A('a'), U('q')] })],
  ['forced tool_choice on opus-5-5', 400, base({ tools: [tool], tool_choice: { type: 'any' } })],
  ['tool_use with no tool_result', 400, base({ messages: [U('q'), { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'navigate_to', input: {} }] }, U('r')] })],
  ['max_tokens over the model limit', 400, base({ model: 'claude-haiku-4-5', max_tokens: 100000 })],
];
let fail = 0;
for (const [name, want, body] of cases) {
  const r = await fetch('http://127.0.0.1:8799/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const txt = await r.text();
  const ok = r.status === want;
  if (!ok) fail++;
  console.info(`${ok ? 'PASS' : 'FAIL'} ${String(r.status).padEnd(3)} (want ${want}) ${name}${r.status >= 400 ? ' — ' + (JSON.parse(txt).error?.message ?? txt).slice(0, 110) : ''}`);
}
srv.kill();
fs.rmSync(dir, { recursive: true, force: true });
console.info(fail ? `${fail} FAILED` : `all ${cases.length} cases as expected`);
process.exit(fail ? 1 : 0);
