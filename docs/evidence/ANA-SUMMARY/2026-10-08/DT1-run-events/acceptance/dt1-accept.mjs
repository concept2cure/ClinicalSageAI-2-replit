// DT1 acceptance, API level: a turn runs as today; GET /runs/:runId/events
// returns its rows while it runs; they are gone after the record is filed.
// Usage: APP_URL=http://127.0.0.1:5091 PW_FILE=<file> OUT=<dir> node dt1-accept.mjs
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
const BASE = process.env.APP_URL;
const PW = fs.readFileSync(process.env.PW_FILE, 'utf8').trim();
const OUT = process.env.OUT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  const j = await r.json();
  if (!j.accessToken) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j.accessToken;
}
const get = async (token, path) => {
  const r = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } });
  let body;
  try { body = await r.json(); } catch { body = null; }
  return { status: r.status, body };
};

const asker = await login('dt1-asker@example.invalid');
const colleague = await login('dt1-colleague@example.invalid');
const admin = await login('dt1-admin@example.invalid');

const frames = [];
const polls = [];
let runId = null;
let threadId = null;
let ended = false;

const stream = (async () => {
  const r = await fetch(`${BASE}/api/ana-ri/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${asker}` },
    body: JSON.stringify({ message: process.env.ASK || 'Find the stability reports and summarise the shelf-life claims.', run_policy: 'auto' }),
  });
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (!raw.startsWith('data: ')) continue;
      const f = JSON.parse(raw.slice(6));
      frames.push({ at: now(), ...f });
      if (f.type === 'run_started') runId = f.runId;
      if (f.thread_id) threadId = f.thread_id;
      if (f.threadId) threadId = threadId ?? f.threadId;
    }
  }
  ended = true;
})();

// While it runs.
while (!runId && !ended) await sleep(100);
let midTurnViews = null;
while (!ended) {
  const p = await get(asker, `/api/ana-ri/runs/${runId}/events`);
  polls.push({ at: now(), phase: 'live', status: p.status, runStatus: p.body?.status, events: p.body?.events?.length, highWater: p.body?.highWater, sealed: p.body?.sealed, releasedAt: p.body?.releasedAt });
  if (!midTurnViews && p.body?.events?.length >= 3) {
    midTurnViews = {
      asker: p,
      colleague: await get(colleague, `/api/ana-ri/runs/${runId}/events`),
      admin: await get(admin, `/api/ana-ri/runs/${runId}/events`),
      mineLive: await get(asker, '/api/ana-ri/runs?mine=live'),
    };
  }
  await sleep(700);
}
await stream;
// After post_done: until the rows are released (or 20 s).
const timelineFrames = frames.filter((f) => f.type === 'timeline').map((f) => f.event);
let after = null;
for (let i = 0; i < 40; i++) {
  after = await get(asker, `/api/ana-ri/runs/${runId}/events`);
  polls.push({ at: now(), phase: 'after', status: after.status, runStatus: after.body?.status, events: after.body?.events?.length, highWater: after.body?.highWater, sealed: after.body?.sealed, releasedAt: after.body?.releasedAt });
  if (after.body?.releasedAt) break;
  await sleep(500);
}
const byThread = threadId ? await get(asker, `/api/ana-ri/runs?thread_id=${encodeURIComponent(threadId)}`) : null;
const result = {
  runId,
  threadId,
  frameTypes: [...new Set(frames.map((f) => f.type))],
  postDone: frames.find((f) => f.type === 'post_done')?.turnRecord ?? null,
  timelineFrameCount: timelineFrames.length,
  liveRowsEqualFramesSoFar: midTurnViews
    ? // Structural: jsonb stores an object's keys in its own order.
      isDeepStrictEqual(midTurnViews.asker.body.events, timelineFrames.slice(0, midTurnViews.asker.body.events.length))
    : null,
  midTurnViews,
  afterRecord: after,
  byThreadAfter: byThread,
  polls,
};
fs.writeFileSync(`${OUT}/dt1-accept.json`, JSON.stringify(result, null, 2));
fs.writeFileSync(`${OUT}/dt1-frames.json`, JSON.stringify(frames, null, 2));
console.info(JSON.stringify({
  runId, timelineFrameCount: result.timelineFrameCount, livePolls: polls.filter((p) => p.phase === 'live').length,
  maxLiveRows: Math.max(0, ...polls.filter((p) => p.phase === 'live').map((p) => p.events ?? 0)),
  liveRowsEqualFramesSoFar: result.liveRowsEqualFramesSoFar,
  colleague: midTurnViews?.colleague?.status, admin: midTurnViews?.admin?.status, adminScope: midTurnViews?.admin?.body?.controlScope,
  mineLive: midTurnViews?.mineLive?.body?.runs?.length,
  postDone: result.postDone?.status, after: { status: after?.status, runStatus: after?.body?.status, events: after?.body?.events?.length, sealed: after?.body?.sealed, releasedAt: after?.body?.releasedAt },
}, null, 1));
