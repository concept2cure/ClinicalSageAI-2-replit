#!/usr/bin/env node
/**
 * Does AnA actually answer?
 *
 * Drives the real chat path against a running instance — dev-login, then
 * POST /api/ana-ri/stream — and reports which of four things happened. It is
 * the check that did not exist while AnA was broken, and the reason finding
 * out took a whole session rather than a minute.
 *
 * ── Why a probe, when /readyz already reports on AnA ──────────────────────────
 * /readyz answers "is a provider configured". That is strictly narrower than
 * "AnA can answer", and the gap between those two sentences is where every
 * defect in this sequence lived:
 *
 *   ready: true  while every turn returned 503 GATEWAY_UNAVAILABLE
 *   ana: ok      while the transport delivered no words at all
 *
 * The second one is the sharp case. In deterministic mode the gateway produced
 * content and never forwarded it to the streaming callback, so the turn closed
 * with `outputTokens: 71` and `turn_status: "completed"` while the client got
 * an empty bubble. Every server-side signal said success. The only way to know
 * was to ask her something and look at what came back — which is what this
 * does.
 *
 * ── The four outcomes ────────────────────────────────────────────────────────
 *   LIVE      answered, from a real provider model. The only state that proves
 *             the product works end to end.
 *   FIXTURES  answered, but from AI_GATEWAY_DETERMINISTIC. Honest and useful
 *             for CI; NOT evidence the provider path works. Fails under
 *             --require-live, which is what a deploy gate should pass.
 *   SILENT    the stream completed and carried no content. The failure this
 *             script exists for: it looks like success from every angle except
 *             the user's.
 *   UNREACHABLE  auth failed, the endpoint 5xx'd, or nothing was listening.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   node scripts/ops/verify-ana-answers.mjs
 *   node scripts/ops/verify-ana-answers.mjs --base-url https://staging.example --require-live
 *   node scripts/ops/verify-ana-answers.mjs --token "$JWT"        # skip dev-login
 *
 * Exit 0 only when the outcome is acceptable: LIVE always, FIXTURES unless
 * --require-live. SILENT and UNREACHABLE always exit 1.
 */

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const BASE = (flag('base-url', process.env.ANA_VERIFY_BASE_URL || 'http://localhost:5000')).replace(/\/$/, '');
const EMAIL = flag('email', process.env.ANA_VERIFY_EMAIL || 'raj.patel@concept2cure.pro');
const QUESTION = flag('question', 'In one sentence, what is the difference between an IND and an NDA?');
const REQUIRE_LIVE = has('require-live');
const TIMEOUT_MS = Number(flag('timeout-ms', '120000'));

const say = (...a) => console.log(...a);
const fail = (...a) => console.error(...a);

/** Obtain a bearer token: an explicit --token wins, else dev-login. */
async function getToken() {
  const explicit = flag('token', process.env.ANA_VERIFY_TOKEN);
  if (explicit) return explicit;

  const res = await fetch(`${BASE}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL }),
  });
  if (!res.ok) {
    throw new Error(
      `dev-login returned ${res.status}. It is gated on NODE_ENV=development AND ` +
        `ALLOW_DEV_AUTH=1 and needs a seeded user. Against a real deployment, ` +
        `pass --token instead.`,
    );
  }
  const body = await res.json();
  const token = body?.accessToken;
  if (!token) throw new Error('dev-login succeeded but returned no accessToken');
  return token;
}

/** Drive one real turn and return the parsed SSE events. */
async function askAna(token) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/api/ana-ri/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: QUESTION }),
      signal: ctl.signal,
    });
    if (!res.ok) {
      let detail = '';
      try { detail = JSON.stringify(await res.json()); } catch { /* body may not be JSON */ }
      throw new Error(`POST /api/ana-ri/stream returned ${res.status}. ${detail}`);
    }
    const raw = await res.text();
    const events = [];
    for (const line of raw.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try { events.push(JSON.parse(line.slice(6))); } catch { /* keepalive / partial */ }
    }
    return events;
  } finally {
    clearTimeout(timer);
  }
}

function classify(events) {
  const text = events.filter(e => e.type === 'text').map(e => e.content || '').join('');
  const done = events.find(e => e.type === 'done') || null;
  const errorEvent = events.find(e => e.type === 'error') || null;

  if (errorEvent) {
    return { outcome: 'UNREACHABLE', text, done, why: errorEvent.message || errorEvent.error || 'stream reported an error' };
  }
  if (!text.trim()) {
    // The bug this script exists for. Report the server-side signals that
    // wrongly said success, because those are what an operator would have
    // trusted.
    return {
      outcome: 'SILENT',
      text,
      done,
      why:
        'the stream completed and carried no content' +
        (done ? ` — while done reported model=${done.model} outputTokens=${done.usage?.outputTokens}` : ''),
    };
  }
  // `deterministic` is set by the gateway's fixture path; model 'demo-mode' is
  // its signature. Either is enough to refuse to call this a live answer.
  const isFixture = done?.model === 'demo-mode' || done?.deterministic === true || /demo mode/i.test(text);
  return {
    outcome: isFixture ? 'FIXTURES' : 'LIVE',
    text,
    done,
    why: isFixture
      ? 'answered from AI_GATEWAY_DETERMINISTIC fixtures, not a provider model'
      : `answered from ${done?.provider ?? 'a provider'} / ${done?.model ?? 'unknown model'}`,
  };
}

const main = async () => {
  say(`[verify-ana] asking ${BASE} — "${QUESTION}"`);
  let events;
  try {
    events = await askAna(await getToken());
  } catch (err) {
    fail(`\n  OUTCOME: UNREACHABLE`);
    fail(`  ${err instanceof Error ? err.message : String(err)}`);
    fail(`\n  AnA could not be asked at all. This is not a verdict on whether she can answer.`);
    process.exit(1);
  }

  const { outcome, text, done, why } = classify(events);
  const kinds = [...new Set(events.map(e => e.type))].join(' → ');

  say(`  events   : ${kinds}`);
  say(`  chars    : ${text.length}`);
  if (done) say(`  model    : ${done.provider ?? '?'} / ${done.model ?? '?'} (${done.usage?.outputTokens ?? '?'} output tokens)`);
  say(`\n  OUTCOME: ${outcome}`);
  say(`  ${why}`);

  if (text.trim()) {
    const preview = text.trim().replace(/\s+/g, ' ').slice(0, 220);
    say(`\n  AnA said: ${preview}${text.trim().length > 220 ? '…' : ''}`);
  }

  if (outcome === 'LIVE') { say('\n✅ AnA answers from a live model.'); process.exit(0); }

  if (outcome === 'FIXTURES') {
    if (REQUIRE_LIVE) {
      fail('\n❌ --require-live was set and this instance is serving fixtures.');
      fail('   Unset AI_GATEWAY_DETERMINISTIC and configure ANTHROPIC_API_KEY.');
      process.exit(1);
    }
    say('\n⚠️  AnA answers, but from fixtures. The transport works; the provider path is UNPROVEN.');
    say('   Re-run with --require-live against an instance that has a provider key.');
    process.exit(0);
  }

  fail('\n❌ AnA did not answer.');
  if (outcome === 'SILENT') {
    fail('   Every server-side signal here can still read as success — that is the point of this check.');
    fail('   Look at the gateway → onStream path before trusting /readyz on this instance.');
  }
  process.exit(1);
};

main().catch((err) => {
  fail(`[verify-ana] unexpected failure: ${err?.stack || err}`);
  process.exit(1);
});
