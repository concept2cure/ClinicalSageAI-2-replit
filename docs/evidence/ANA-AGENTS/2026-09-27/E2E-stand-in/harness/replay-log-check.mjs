// Replays saved request bodies through the CURRENT stand-in-e2e.mjs and
// compares what it logs (describe(): the settings it read, the ask, the last
// result, the notes, and the reply it scripts) with the capture's own log
// lines. Written because the stand-in was edited and restarted at 18:38:15
// (logs/05-driver.txt) and the pre-edit file was not kept: this shows, request
// by request, where the file that is filed would have scripted something else.
//   node replay-log-check.mjs <saved requests dir> <logs/09 file> <from> <to>   API_CONTRACT
// Starts the stand-in on 127.0.0.1:8798 with an empty scratch request dir.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [dir, logFile, fromS, toS] = process.argv.slice(2);
if (!dir || !logFile || !process.env.API_CONTRACT) throw new Error('usage: replay-log-check.mjs <requests dir> <log> <from> <to> (API_CONTRACT set)');
const from = Number(fromS || 1);
const to = Number(toS || 48);
const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-'));

const logged = new Map();
for (const line of fs.readFileSync(logFile, 'utf8').split('\n')) {
  const j = line ? JSON.parse(line.slice(line.indexOf(' ') + 1)) : null;
  if (j && Number.isInteger(j.n)) logged.set(j.n, j);
}

const child = spawn(process.execPath, [path.join(here, 'stand-in-e2e.mjs')], {
  env: { ...process.env, FAKE_PORT: '8798', FAKE_REQ_DIR: scratch, FAKE_DELAY_MS: '0' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const replayed = new Map();
let buf = '';
let up;
const ready = new Promise(r => (up = r));
child.stdout.on('data', d => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    const j = JSON.parse(line.slice(line.indexOf(' ') + 1));
    if (j.up) up();
    else if (Number.isInteger(j.n)) replayed.set(j.n, j);
  }
});
await ready;

for (let n = from; n <= to; n++) {
  const saved = JSON.parse(fs.readFileSync(path.join(dir, `${String(n).padStart(4, '0')}.json`), 'utf8'));
  const headers = { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' };
  if (saved.beta) headers['anthropic-beta'] = saved.beta;
  const res = await fetch('http://127.0.0.1:8798/v1/messages', { method: 'POST', headers, body: JSON.stringify(saved.body) });
  await res.text();
}
await new Promise(r => setTimeout(r, 200));
child.kill();

let same = 0;
const differ = [];
for (let n = from; n <= to; n++) {
  const a = logged.get(n);
  const b = replayed.get(n - from + 1); // the scratch stand-in numbers from 1
  if (!a || !b) { differ.push({ n, why: !a ? 'not in the capture log' : 'not replayed' }); continue; }
  const strip = o => { const { n: _n, ...rest } = o; return JSON.stringify(rest); };
  if (strip(a) === strip(b)) same++;
  else {
    const fields = Object.keys({ ...a, ...b }).filter(k => k !== 'n' && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    differ.push({ n, fields: Object.fromEntries(fields.map(k => [k, { capture: a[k], filedStandIn: b[k] }])) });
  }
}
console.info(JSON.stringify({ replayed: `#${from}–#${to}`, identical: same, differ }, null, 1));
fs.rmSync(scratch, { recursive: true, force: true });
