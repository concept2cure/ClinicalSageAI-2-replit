#!/usr/bin/env node
/**
 * Does AnA actually answer?
 *
 * Drives the real chat path against a running instance — dev-login, then
 * POST /api/ana-ri/stream — and reports which of five things happened. It is
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
 * ── The five outcomes ───────────────────────────────────────────────────────
 *   LIVE      completed an answer with a real-provider receipt. This checks
 *             one turn, not scientific review or the full regulated workflow.
 *   FIXTURES  answered, but from AI_GATEWAY_DETERMINISTIC. Honest and useful
 *             for CI; NOT evidence the provider path works. Fails under
 *             --require-live, which is what a deploy gate should pass.
 *   SILENT    the stream completed and carried no content. The failure this
 *             script exists for: it looks like success from every angle except
 *             the user's.
 *   UNVERIFIED text arrived, but the current completion/provider receipt is
 *             missing, stopped, contradictory or from an unexpected provider.
 *   UNREACHABLE  auth failed, the endpoint 5xx'd, or nothing was listening.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   node scripts/ops/verify-ana-answers.mjs
 *   node scripts/ops/verify-ana-answers.mjs --base-url https://staging.example --require-live
 *   node scripts/ops/verify-ana-answers.mjs --token "$JWT"        # skip dev-login
 *   npm run verify:ana -- --model gpt-4o-mini --expect-provider openai --require-live
 *   npm run verify:ana -- --project-id <project-uuid> --expect-provider openai
 *
 * --model requests the existing governed model_override; placement/approval
 * may substitute a model. --expect-provider checks the actual served receipt.
 * No flag changes provider approval, PQ or server-side project admission.
 *
 * Exit 0 only when the outcome is acceptable: LIVE always, FIXTURES unless
 * --require-live or --expect-provider. Other outcomes always exit 1. Older
 * servers without the current complete receipt cannot establish LIVE proof.
 */

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const BASE = (flag('base-url', process.env.ANA_VERIFY_BASE_URL || 'http://localhost:5000')).replace(/\/$/, '');
const EMAIL = flag('email', process.env.ANA_VERIFY_EMAIL || process.env.VITE_DEV_LOGIN_EMAIL ||
  process.env.DEMO_AUTHOR_EMAIL || 'raj.patel@concept2cure.pro');
const QUESTION = flag('question', 'In one sentence, what is the difference between an IND and an NDA?');
const REQUIRE_LIVE = has('require-live');
const MODEL = flag('model')?.trim();
const PROJECT_ID = flag('project-id')?.trim();
const EXPECTED_PROVIDER = flag('expect-provider')?.trim();
const LIVE_PROOF_REQUIRED = REQUIRE_LIVE || Boolean(EXPECTED_PROVIDER);
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
    signal: AbortSignal.timeout(TIMEOUT_MS),
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
      body: JSON.stringify({ message: QUESTION,
        ...(MODEL ? { model_override: MODEL } : {}),
        ...(PROJECT_ID ? { project_id: PROJECT_ID } : {}),
      }),
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

function receiptProblem(done) {
  if (typeof done.provider !== 'string' || !done.provider.trim() ||
      typeof done.model !== 'string' || !done.model.trim()) {
    return 'the terminal receipt does not identify a provider and model';
  }
  if (done.stoppedReason !== 'no_more_tools') {
    return `the turn did not complete (stoppedReason=${String(done.stoppedReason ?? 'missing')}; expected no_more_tools)`;
  }
  if (EXPECTED_PROVIDER && done.provider !== EXPECTED_PROVIDER) {
    return 'the served provider did not match --expect-provider';
  }
  return null;
}

function classify(events) {
  const text = events.filter(e => e.type === 'text').map(e => e.content || '').join('');
  const receipts = events.filter(e => e.type === 'done');
  const done = receipts[0] || null;
  const errorEvent = events.find(e => e.type === 'error') || null;
  const unverified = why => ({ outcome: 'UNVERIFIED', text, done, why });

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
  if (receipts.length !== 1) return unverified('exactly one terminal completion receipt is required');
  // Receipt metadata identifies fixtures. A real answer may discuss demo mode;
  // its words cannot turn an actual provider receipt into a fixture.
  const isFixture = done.model === 'demo-mode' || done.deterministic === true ||
    done.provider === 'demo' || done.provider === 'deterministic';
  if (isFixture) return { outcome: 'FIXTURES', text, done,
    why: 'answered from AI_GATEWAY_DETERMINISTIC fixtures, not a provider model' };
  const problem = receiptProblem(done);
  if (problem) return unverified(problem);
  return {
    outcome: 'LIVE',
    text,
    done,
    why: `answered from ${done.provider} / ${done.model}`,
  };
}

const main = async () => {
  const missing = ['model', 'project-id', 'expect-provider'].find(name => has(name) && !flag(name)?.trim());
  if (missing) {
    fail(`--${missing} requires a value; no verification request was sent.`);
    process.exitCode = 1; return;
  }
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
    if (LIVE_PROOF_REQUIRED) {
      fail('\n❌ Live provider proof was requested and this instance is serving fixtures.');
      fail('   Unset AI_GATEWAY_DETERMINISTIC and configure the intended provider credential.');
      process.exit(1);
    }
    say('\n⚠️  AnA answers, but from fixtures. The transport works; the provider path is UNPROVEN.');
    say('   Re-run with --require-live against an instance that has a provider key.');
    process.exit(0);
  }

  fail('\n❌ AnA could not be verified.');
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
