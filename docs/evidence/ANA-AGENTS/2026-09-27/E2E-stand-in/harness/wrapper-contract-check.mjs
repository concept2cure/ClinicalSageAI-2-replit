// Does this wrapper still refuse what the imported contract refuses? Starts a
// second instance of stand-in-e2e.mjs on its own port and folder, sends three
// requests the real API refuses and one it takes, and prints what came back.
// (The contract's own 25 cases are the W1 lane's selftest.mjs, run unmodified.)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-wrapper-check-'));
const srv = spawn('node', [path.join(here, 'stand-in-e2e.mjs')], {
  env: { ...process.env, FAKE_PORT: '8798', FAKE_REQ_DIR: dir, FAKE_DELAY_MS: '30' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise(r => setTimeout(r, 800));
const base = o => ({ model: 'claude-opus-5-5', max_tokens: 1024, messages: [{ role: 'user', content: 'hi' }], ...o });
const cases = [
  ['retired model', 404, base({ model: 'claude-3-5-sonnet-20241022' })],
  ['temperature on opus-5-5', 400, base({ temperature: 0.3 })],
  ['forced tool choice on opus-5-5', 400, base({ tools: [{ name: 'global_search', input_schema: { type: 'object', properties: {} } }], tool_choice: { type: 'any' } })],
  ['valid request', 200, base({})],
];
let failed = 0;
for (const [name, want, body] of cases) {
  const r = await fetch('http://127.0.0.1:8798/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const text = await r.text();
  const ok = r.status === want;
  if (!ok) failed++;
  console.info(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${r.status} (want ${want}) ${text.slice(0, 160)}`);
}
srv.kill();
console.info(failed ? `${failed} unexpected` : 'all as expected');
process.exit(failed ? 1 : 0);
