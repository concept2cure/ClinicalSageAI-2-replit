/**
 * OQ execution harness for the CSA validation package (docs/validation/OQ-00x).
 *
 * One runner per launch app (tests/validation/oq/<app>/run.mjs) declares its
 * protocol steps against this harness. The harness:
 *
 *   - authenticates the way the client does, then GET /api/v1/auth/session,
 *     then seeds the four trialsage_* storage keys before first paint (same
 *     approach as tests/e2e/dev-auth-helper.ts). With VALIDATION_USER_PASSWORD
 *     set it signs in with the password (POST /api/auth/login), completing the
 *     TOTP challenge from VALIDATION_USER_TOTP_SECRET when the server requires
 *     MFA, which every server that is not a development one does. Without it,
 *     it uses POST /api/auth/dev-login, which only development answers. The
 *     record states which was used (environment.authentication);
 *   - drives the real app in Chromium through playwright-core (no @playwright/test
 *     fixture layer, so the run is a plain `node` process with no test reporter
 *     rewriting the outcome);
 *   - records, per step, every API request/response it made (secrets redacted),
 *     a full-page screenshot when the step touched the browser, browser console
 *     errors, and the verdict;
 *   - writes the evidence bundle to docs/evidence/W3/<date>/OQ-<APP>/ as
 *     result.json plus a human-readable execution record.
 *
 * Verdict vocabulary (docs/validation/VMP-001 §9):
 *   pass          the expected result was observed
 *   fail          the expected result was NOT observed (defect or wrong expectation)
 *   deviation     the step could not be executed as written; the reason is recorded
 *                 (e.g. no AI provider, no external gateway, no credential held)
 *   not-executed  a prerequisite step failed so this step never ran
 *
 * A deviation is never rendered as a pass, and a step that throws is a fail.
 * Nothing here ever fabricates an observation: `observed` is always what the
 * server or the page actually returned.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freshTotp } from './totp.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

export const RUN_DATE = process.env.VALIDATION_RUN_DATE || '2026-09-23';
export const BASE_URL = (process.env.VALIDATION_BASE_URL || 'http://localhost:5200').replace(/\/$/, '');
export const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const TEST_USER_EMAIL = process.env.VALIDATION_USER_EMAIL || 'jonmichaelpsmith@gmail.com';
export const EVIDENCE_ROOT =
  process.env.VALIDATION_EVIDENCE_ROOT || path.join(REPO_ROOT, 'docs', 'evidence', 'W3', RUN_DATE);

// Authentication factors never reach a record. `mfaToken` is the QMS approval's
// name for the authenticator code (`totp` is the governed actions' name).
const REDACT_KEYS = new Set(['pin', 'old_pin', 'password', 'totp', 'mfaToken', 'accessToken', 'refreshToken', 'token']);

export class ExpectationFailed extends Error {
  constructor(message, observed) {
    super(message);
    this.name = 'ExpectationFailed';
    this.observed = observed;
  }
}

export class Deviation extends Error {
  constructor(reason, observed) {
    super(reason);
    this.name = 'Deviation';
    this.observed = observed;
  }
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT_KEYS.has(k) ? '[REDACTED]' : redact(v);
    }
    return out;
  }
  return value;
}

/** Best-effort git identity without running git: read .git/HEAD and the ref file. */
export function readGitHead() {
  try {
    const head = fs.readFileSync(path.join(REPO_ROOT, '.git', 'HEAD'), 'utf8').trim();
    if (head.startsWith('ref: ')) {
      const ref = head.slice(5);
      const refPath = path.join(REPO_ROOT, '.git', ref);
      let sha = null;
      if (fs.existsSync(refPath)) sha = fs.readFileSync(refPath, 'utf8').trim();
      else {
        const packed = path.join(REPO_ROOT, '.git', 'packed-refs');
        if (fs.existsSync(packed)) {
          const line = fs
            .readFileSync(packed, 'utf8')
            .split('\n')
            .find((l) => l.endsWith(' ' + ref));
          if (line) sha = line.split(' ')[0];
        }
      }
      return { branch: ref.replace(/^refs\/heads\//, ''), commit: sha };
    }
    return { branch: null, commit: head };
  } catch {
    return { branch: null, commit: null };
  }
}

export async function devLogin(baseUrl = BASE_URL, email = TEST_USER_EMAIL) {
  const res = await fetch(`${baseUrl}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify({ email }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.accessToken) {
    throw new Error(
      `dev-login failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}. ` +
        'The server must run with NODE_ENV=development and ALLOW_DEV_AUTH=1 (server/auth/dev-auth-policy.ts); ' +
        'against any other server set VALIDATION_USER_PASSWORD (and VALIDATION_USER_TOTP_SECRET).',
    );
  }
  return validatedSession(baseUrl, body, 'dev-login');
}

/**
 * Sign in with a password, the way a person does on any server that is not a
 * development one: POST /api/auth/login, and when the server answers with an
 * MFA challenge, POST /api/auth/mfa/verify with the current code of the
 * identity's enrolled TOTP factor. An emailed one-time code cannot be completed
 * unattended, so a challenge that offers no TOTP method is an error naming what
 * the identity needs. Neither the password nor the secret appears in any
 * message or record.
 */
export async function passwordLogin(baseUrl, { email, password, totpSecret = '' }) {
  const login = await postJson(baseUrl, '/api/auth/login', { email, password });
  if (!login.ok) {
    throw new Error(`password login for ${email} failed (${login.status}): ${JSON.stringify(login.body?.error ?? login.body).slice(0, 200)}`);
  }
  if (!login.body?.mfaRequired) return validatedSession(baseUrl, login.body, 'password');
  const verified = await completeTotpChallenge(baseUrl, email, login.body, totpSecret);
  return validatedSession(baseUrl, verified, 'password+totp');
}

function postJson(baseUrl, route, payload) {
  return fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify(payload),
  }).then(async (r) => ({ status: r.status, ok: r.ok, body: await r.json().catch(() => ({})) }));
}

async function completeTotpChallenge(baseUrl, email, challenge, totpSecret) {
  const methods = challenge.mfaMethods ?? [];
  if (!methods.some((m) => m?.type === 'totp')) {
    throw new Error(
      `the server requires MFA for ${email} and offers no TOTP factor (${JSON.stringify(methods)}); ` +
        'an emailed code cannot be completed unattended — enroll a TOTP authenticator for this identity and supply its secret',
    );
  }
  if (!totpSecret) {
    throw new Error(`the server requires a TOTP code for ${email}; supply the secret of its enrolled authenticator`);
  }
  const code = await freshTotp(email, totpSecret);
  const verified = await postJson(baseUrl, '/api/auth/mfa/verify', { challengeId: challenge.challengeId, code, method: 'totp' });
  if (!verified.ok || !verified.body?.accessToken) {
    throw new Error(`TOTP verification for ${email} failed (${verified.status}): ${JSON.stringify(verified.body?.error ?? {}).slice(0, 200)}`);
  }
  return verified.body;
}

/**
 * A session opened once by run-all.mjs and handed to every protocol process
 * (VALIDATION_SESSIONS, in the environment only — never on disk or in a record),
 * so a full run signs each identity in once, as a person does. Signing in once
 * per protocol took about nine sign-ins per run from one address, and the
 * server allows ten per fifteen minutes: a re-run inside that window was refused
 * 429 part-way through the package. Re-validated before use.
 */
export async function sharedSession(role, baseUrl = BASE_URL) {
  let session = null;
  try {
    session = JSON.parse(process.env.VALIDATION_SESSIONS || '{}')[role] ?? null;
  } catch {
    session = null;
  }
  return session?.accessToken ? validatedSession(baseUrl, session, session.method) : null;
}

/** The run identity's credential when one is supplied, else null (dev-login). */
export function runCredential() {
  const password = process.env.VALIDATION_USER_PASSWORD || '';
  if (!password) return null;
  return { email: TEST_USER_EMAIL, password, totpSecret: process.env.VALIDATION_USER_TOTP_SECRET || '' };
}

async function validatedSession(baseUrl, body, method) {
  const sess = await (
    await fetch(`${baseUrl}/api/v1/auth/session`, {
      headers: { Authorization: `Bearer ${body.accessToken}`, Origin: baseUrl },
    })
  ).json();
  if (!sess.authenticated || !sess.user) throw new Error(`session validation failed after ${method}`);
  return { accessToken: body.accessToken, refreshToken: body.refreshToken, user: sess.user, method };
}

/** Server log used to attribute a 500 to an environment defect (IQ-DEV-001). */
export const SERVER_LOG = process.env.VALIDATION_SERVER_LOG || '/tmp/w3a-server.log';
const PERMISSION_DENIED_RE = /permission denied for (table|schema|relation) ([A-Za-z0-9_.]+)/g;
/**
 * Denials the server logs on almost every request without changing the
 * response (the enforcement-mode reader and the tamper-proof audit sidecar
 * both catch and continue). They are real IQ-DEV-001 symptoms — recorded in
 * IQ-07 — but they never explain a step's verdict, so they are not allowed
 * to turn a genuine failure into a deviation.
 */
const NOISE_DENIALS = new Set(['table platform_settings', 'table tamper_proof_log']);

function logSize() {
  try {
    return fs.statSync(SERVER_LOG).size;
  } catch {
    return -1;
  }
}

/** Read the server log written since `from` and pull out permission-denied lines. */
function logSince(from) {
  try {
    if (from < 0) return null;
    const size = fs.statSync(SERVER_LOG).size;
    if (size <= from) return null;
    const fd = fs.openSync(SERVER_LOG, 'r');
    const buf = Buffer.alloc(Math.min(size - from, 512 * 1024));
    fs.readSync(fd, buf, 0, buf.length, from);
    fs.closeSync(fd);
    const text = buf.toString('utf8');
    const all = [...new Set([...text.matchAll(PERMISSION_DENIED_RE)].map((m) => `${m[1]} ${m[2]}`))];
    const denied = all.filter((d) => !NOISE_DENIALS.has(d));
    const lines = text.split('\n').filter((l) => /permission denied|"level":50|request_failed/.test(l)).slice(-12);
    return { denied, noise: all.filter((d) => NOISE_DENIALS.has(d)), excerpt: lines.map((l) => l.slice(0, 400)) };
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PACE_MS = Number(process.env.VALIDATION_PACE_MS || 250);

export function createApiClient({ baseUrl, accessToken, onRecord, identity = null }) {
  return async function api(method, apiPath, body, opts = {}) {
    const url = `${baseUrl}${apiPath}`;
    const headers = { Origin: baseUrl, Accept: 'application/json' };
    if (accessToken && !opts.anonymous) headers.Authorization = `Bearer ${accessToken}`;
    let fetchBody;
    if (body instanceof FormData) fetchBody = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      fetchBody = JSON.stringify(body);
    }
    await sleep(PACE_MS);
    const started = Date.now();
    const logFrom = logSize();
    let res;
    let text;
    let retries = 0;
    // The platform rate-limits per source IP (server/config/platform-limits.ts:
    // api 100 req/min). A validation run and its browser share one IP, so a
    // 429 here is the limiter working, not the requirement under test. Wait
    // for the window and retry; every retry is recorded on the step.
    for (;;) {
      res = await fetch(url, { method, headers, body: fetchBody });
      text = await res.text();
      if (res.status !== 429 || retries >= 6) break;
      retries += 1;
      const retryAfter = Number(res.headers.get('retry-after'));
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      let waitMs = 15_000;
      if (Number.isFinite(retryAfter) && retryAfter > 0) waitMs = retryAfter * 1000 + 500;
      else if (Number.isFinite(reset) && reset > Date.now() / 1000) waitMs = (reset - Date.now() / 1000) * 1000 + 500;
      else if (Number.isFinite(reset) && reset > Date.now()) waitMs = reset - Date.now() + 500;
      console.log(`    (429 on ${method} ${apiPath}; waiting ${Math.round(waitMs / 1000)}s, retry ${retries})`);
      await sleep(Math.min(waitMs, 70_000));
      if (body instanceof FormData) break; // multipart bodies are single-use
    }
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const record = {
      request: {
        method,
        url,
        anonymous: !!opts.anonymous,
        // Which identity sent it. Null = the run's dev-login identity; a
        // credentialed step (OQ-QMS-05, OQ-SUBC-08) names the second signer.
        identity,
        body: body instanceof FormData ? '[multipart/form-data]' : redact(body ?? null),
      },
      response: {
        status: res.status,
        contentType: res.headers.get('content-type'),
        durationMs: Date.now() - started,
        rateLimitRetries: retries,
        body: json !== null ? redact(json) : text.slice(0, 4000),
      },
    };
    let envDenied = null;
    if (res.status === 500) {
      const excerpt = logSince(logFrom);
      if (excerpt) {
        record.serverLogExcerpt = excerpt;
        if (excerpt.denied.length) envDenied = excerpt.denied;
      }
    }
    if (onRecord) onRecord(record);
    return { status: res.status, ok: res.ok, json, text, headers: res.headers, retries, envDenied };
  };
}

export async function launchBrowser() {
  if (!fs.existsSync(CHROMIUM_PATH)) {
    throw new Error(`Chromium not found at ${CHROMIUM_PATH}; set CHROMIUM_PATH`);
  }
  const { chromium } = require('playwright-core');
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  return browser;
}

/**
 * Seed the storage the client's loadStoredAuth() reads, and optionally the
 * shell's open-program mirror (client/src/concept2cure/v2/shellProject.ts:
 * sessionStorage key `c2c.shell-project`, restored at shell boot).
 */
export async function seedAuthenticatedContext(context, auth, shellProject) {
  const expiry = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
  await context.addInitScript(
    ([token, refresh, exp, userJson, projectJson]) => {
      for (const store of [window.localStorage, window.sessionStorage]) {
        store.setItem('trialsage_access_token', token);
        store.setItem('trialsage_refresh_token', refresh);
        store.setItem('trialsage_token_expiry', exp);
        store.setItem('trialsage_user', userJson);
      }
      if (projectJson) window.sessionStorage.setItem('c2c.shell-project', projectJson);
    },
    [
      auth.accessToken,
      auth.refreshToken,
      expiry,
      JSON.stringify(auth.user),
      shellProject ? JSON.stringify(shellProject) : '',
    ],
  );
}

function nowIso() {
  return new Date().toISOString();
}

export async function createRun({ app, appLabel, protocolId, protocolTitle, needsBrowser = true }) {
  const dir = path.join(EVIDENCE_ROOT, `OQ-${app}`);
  const stepsDir = path.join(dir, 'steps');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(stepsDir, { recursive: true });

  const startedAt = nowIso();
  const readyz = await fetch(`${BASE_URL}/readyz`)
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
    .catch((e) => ({ status: 0, body: { error: String(e) } }));
  const credential = runCredential();
  const auth =
    (await sharedSession('run')) ?? (credential ? await passwordLogin(BASE_URL, credential) : await devLogin());

  let browser = null;
  let context = null;
  let page = null;
  const consoleErrors = [];
  if (needsBrowser) {
    browser = await launchBrowser();
    context = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE_URL });
    await seedAuthenticatedContext(context, auth, null);
    page = await context.newPage();
    page.on('pageerror', (e) => consoleErrors.push({ at: nowIso(), kind: 'pageerror', message: e.message }));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push({ at: nowIso(), kind: 'console.error', message: m.text() });
    });
  }

  const steps = [];
  const state = {}; // shared between steps (ids created earlier, etc.)
  let prerequisiteFailed = null;

  async function newPage(shellProject, opts = {}) {
    // A fresh context so the shell-project mirror is seeded before boot.
    if (context) await context.close().catch(() => {});
    context = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE_URL });
    if (!opts.anonymous) await seedAuthenticatedContext(context, auth, shellProject ?? null);
    page = await context.newPage();
    page.on('pageerror', (e) => consoleErrors.push({ at: nowIso(), kind: 'pageerror', message: e.message }));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push({ at: nowIso(), kind: 'console.error', message: m.text() });
    });
    return page;
  }

  async function step(def, fn) {
    const { id, title, urs = [], action, expected, kind = 'scripted', dependsOn = [] } = def;
    const rec = {
      id,
      title,
      urs,
      kind,
      action,
      expected,
      status: 'not-executed',
      observed: null,
      startedAt: nowIso(),
      finishedAt: null,
      evidence: [],
      api: [],
      consoleErrors: [],
      note: def.note ?? null,
    };
    steps.push(rec);
    // A prerequisite must have PASSED. A deviation on a prerequisite means the
    // fixture this step needs was not produced, so the step cannot run either.
    const blockedBy = dependsOn.find((d) => {
      const s = steps.find((x) => x.id === d);
      return !s || s.status !== 'pass';
    });
    if (blockedBy) {
      rec.status = 'not-executed';
      rec.observed = `prerequisite step ${blockedBy} did not pass`;
      rec.finishedAt = nowIso();
      console.log(`  ${id}  not-executed  (${rec.observed})`);
      return rec;
    }
    const errBefore = consoleErrors.length;
    const stepLogFrom = logSize();
    let apiCounter = 0;
    const denied = new Set();
    let rateLimitRetries = 0;
    const onRecord = (record) => {
      apiCounter += 1;
      const file = `${id}.api-${apiCounter}.json`;
      fs.writeFileSync(path.join(stepsDir, file), JSON.stringify(record, null, 2));
      rec.api.push({
        file: `steps/${file}`,
        method: record.request.method,
        url: record.request.url,
        status: record.response.status,
        ...(record.request.identity ? { identity: record.request.identity } : {}),
      });
      rateLimitRetries += record.response.rateLimitRetries ?? 0;
      for (const d of record.serverLogExcerpt?.denied ?? []) denied.add(d);
    };
    const api = createApiClient({ baseUrl: BASE_URL, accessToken: auth.accessToken, onRecord });
    const ctx = {
      api,
      state,
      auth,
      baseUrl: BASE_URL,
      /**
       * A client for a SECOND authenticated identity (a session from
       * `passwordLogin`, see credentials.mjs), recorded on this step exactly like `api`.
       * Used by the credentialed steps: the two-person rule (§11.10(d)) means the
       * approver/signer can never be the identity that authored the fixture.
       */
      apiAs(otherAuth) {
        return createApiClient({
          baseUrl: BASE_URL,
          accessToken: otherAuth.accessToken,
          onRecord,
          identity: otherAuth.user?.email ?? null,
        });
      },
      get page() {
        return page;
      },
      newPage,
      expect(cond, message, observed) {
        if (!cond) throw new ExpectationFailed(message, observed);
      },
      deviation(reason, observed) {
        throw new Deviation(reason, observed);
      },
      /**
       * Tables the IQ run (scripts/validation/run-iq.mjs, check IQ-07) found
       * unreadable by the runtime role — the evidence for IQ-DEV-001. Lets a
       * step attribute a swallowed 500 to that open deviation with a citation
       * instead of guessing.
       */
      deniedTables() {
        try {
          const p = path.join(EVIDENCE_ROOT, 'IQ', 'db-role-denied-tables.json');
          return JSON.parse(fs.readFileSync(p, 'utf8')).denied ?? [];
        } catch {
          return [];
        }
      },
      async screenshot(label) {
        if (!page) return null;
        const file = label ? `${id}.${label}.png` : `${id}.png`;
        await page.screenshot({ path: path.join(stepsDir, file), fullPage: true });
        rec.evidence.push(`steps/${file}`);
        return file;
      },
      attach(name, data) {
        const file = `${id}.${name}`;
        fs.writeFileSync(
          path.join(stepsDir, file),
          typeof data === 'string' ? data : JSON.stringify(data, null, 2),
        );
        rec.evidence.push(`steps/${file}`);
        return file;
      },
      async goto(urlPath, waitFor) {
        // A surface load is dozens of API calls from the same IP as the runner
        // (server/config/platform-limits.ts: api 100 req/min per IP). If the
        // browser is rate-limited during the load, the surface honestly shows
        // its error state — which is the limiter working, not the requirement
        // under test. Wait out the window and load once more; the 429 count is
        // recorded on the step either way.
        await sleep(Number(process.env.VALIDATION_NAV_PAUSE_MS || 4000));
        for (let attempt = 1; ; attempt += 1) {
          let limited = 0;
          const onResp = (r) => {
            if (r.status() === 429) limited += 1;
          };
          page.on('response', onResp);
          await page.goto(`${BASE_URL}${urlPath}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
          await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
          page.off('response', onResp);
          rec.browser429 = (rec.browser429 ?? 0) + limited;
          if (!limited || attempt >= 3) break;
          console.log(`    (browser hit ${limited} × 429 loading ${urlPath}; waiting 62s, reload ${attempt})`);
          await sleep(62_000);
        }
        if (waitFor) await page.waitForSelector(waitFor, { timeout: 30_000 });
        return page;
      },
      /** Wait until the rendered page text contains `needle` (string or RegExp). */
      async expectText(needle, timeoutMs = 30_000) {
        const started = Date.now();
        let text = '';
        for (;;) {
          text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
          const hit = needle instanceof RegExp ? needle.test(text) : text.includes(needle);
          if (hit) return true;
          if (Date.now() - started > timeoutMs) {
            throw new ExpectationFailed(`page text does not contain ${needle instanceof RegExp ? needle : JSON.stringify(needle)}`, text.slice(0, 600));
          }
          await sleep(750);
        }
      },
    };
    try {
      const observed = await fn(ctx);
      rec.status = 'pass';
      rec.observed = observed ?? 'expected result observed';
      console.log(`  ${id}  pass`);
    } catch (e) {
      if (e instanceof Deviation) {
        rec.status = 'deviation';
        rec.observed = e.observed ?? null;
        rec.deviationReason = e.message;
        console.log(`  ${id}  deviation  (${e.message})`);
      } else if (
        denied.size > 0 ||
        (def.attributeEnvFromLog === true && stepLogFrom >= 0 && (logSince(stepLogFrom)?.denied?.length ?? 0) > 0)
      ) {
        // Browser-driven steps never see a response body. A step that reads a
        // route known to 500 on the open installation deviation may OPT IN to
        // attribution from the server log written while it ran; the excerpt is
        // attached. Steps do not get this by default, so a genuine product
        // failure cannot be re-labelled by unrelated log noise.
        if (denied.size === 0) {
          const ex = logSince(stepLogFrom);
          for (const d of ex.denied) denied.add(d);
          fs.writeFileSync(path.join(stepsDir, `${id}.server-log-excerpt.json`), JSON.stringify(ex, null, 2));
          rec.evidence.push(`steps/${id}.server-log-excerpt.json`);
        }
        // The server answered 500 and its log, read at the moment of the
        // request, names a permission the runtime role lacks. That is the
        // open installation deviation IQ-DEV-001, not the requirement under
        // test — recorded as a deviation with the log excerpt attached to the
        // step's API record, never as a pass.
        rec.status = 'deviation';
        rec.observed = e.observed ?? null;
        rec.deviationReason = `IQ-DEV-001: runtime role lacks privileges (${[...denied].join('; ')}) in this environment; the route answered 500 (server log excerpt attached). Underlying check: ${e.message}. Re-execute after the grant is applied.`;
        console.log(`  ${id}  deviation  (IQ-DEV-001: ${[...denied].join('; ')})`);
      } else if (e instanceof ExpectationFailed) {
        rec.status = 'fail';
        rec.observed = e.observed ?? null;
        rec.failure = e.message;
        console.log(`  ${id}  FAIL  (${e.message})`);
      } else {
        rec.status = 'fail';
        rec.failure = `runner error: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)}`;
        console.log(`  ${id}  FAIL  (${rec.failure})`);
      }
      if (page) {
        try {
          const file = `${id}.at-failure.png`;
          await page.screenshot({ path: path.join(stepsDir, file), fullPage: true });
          rec.evidence.push(`steps/${file}`);
        } catch {
          /* page may be gone */
        }
      }
      if (rec.status === 'fail' && !prerequisiteFailed) prerequisiteFailed = id;
    }
    rec.consoleErrors = consoleErrors.slice(errBefore);
    rec.rateLimitRetries = rateLimitRetries;
    rec.finishedAt = nowIso();
    return rec;
  }

  async function finish() {
    if (browser) await browser.close().catch(() => {});
    const counts = { pass: 0, fail: 0, deviation: 0, 'not-executed': 0 };
    for (const s of steps) counts[s.status] += 1;
    const result = {
      protocolId,
      protocolTitle,
      app,
      appLabel,
      status: 'DRAFT — UNSIGNED (automated execution; human review and signature outstanding)',
      executedBy: `automated runner tests/validation/oq/${app.toLowerCase()}/run.mjs`,
      executedAt: startedAt,
      finishedAt: nowIso(),
      environment: {
        baseUrl: BASE_URL,
        node: process.version,
        chromium: CHROMIUM_PATH,
        playwrightCore: require('playwright-core/package.json').version,
        git: readGitHead(),
        testUser: auth.user.email,
        authentication: auth.method,
        organizationId: auth.user.organizationId,
        readyz,
      },
      counts,
      steps,
    };
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(dir, `${protocolId}-execution-record.md`), renderExecutionRecord(result));
    console.log(
      `\n${protocolId} ${appLabel}: ${counts.pass} pass, ${counts.fail} fail, ${counts.deviation} deviation, ${counts['not-executed']} not-executed → ${path.relative(REPO_ROOT, dir)}`,
    );
    return result;
  }

  return { step, finish, state, auth, api: createApiClient({ baseUrl: BASE_URL, accessToken: auth.accessToken }), newPage };
}

function md(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function renderExecutionRecord(result) {
  const lines = [];
  lines.push(`# ${result.protocolId} — ${result.protocolTitle}: execution record`);
  lines.push('');
  lines.push(`**Status:** ${result.status}`);
  lines.push('');
  lines.push(`> Generated by \`${result.executedBy}\`. Do not edit by hand — re-run the protocol.`);
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|---|---|');
  lines.push(`| Executed at (UTC) | ${result.executedAt} → ${result.finishedAt} |`);
  lines.push(`| Base URL | ${result.environment.baseUrl} |`);
  lines.push(`| Git | ${result.environment.git.branch ?? '?'} @ ${result.environment.git.commit ?? '?'} |`);
  lines.push(`| Node / Chromium / playwright-core | ${result.environment.node} / ${result.environment.chromium} / ${result.environment.playwrightCore} |`);
  lines.push(`| Test identity | ${result.environment.testUser} (organization ${result.environment.organizationId}) |`);
  lines.push(
    `| /readyz at start | HTTP ${result.environment.readyz.status}: ${md(JSON.stringify(result.environment.readyz.body))} |`,
  );
  lines.push(
    `| Counts | ${result.counts.pass} pass · ${result.counts.fail} fail · ${result.counts.deviation} deviation · ${result.counts['not-executed']} not-executed |`,
  );
  lines.push('');
  lines.push('## Steps');
  lines.push('');
  lines.push('| Step | URS | Kind | Action | Expected | Observed | Verdict | Evidence |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const s of result.steps) {
    const observed =
      s.status === 'deviation'
        ? `DEVIATION: ${s.deviationReason}${s.observed ? ' — ' + (typeof s.observed === 'string' ? s.observed : JSON.stringify(s.observed)) : ''}`
        : s.status === 'fail'
          ? `FAIL: ${s.failure}${s.observed ? ' — ' + (typeof s.observed === 'string' ? s.observed : JSON.stringify(s.observed)) : ''}`
          : typeof s.observed === 'string'
            ? s.observed
            : JSON.stringify(s.observed);
    const ev = [...s.evidence, ...s.api.map((a) => `${a.file} (${a.method} ${a.status})`)].map((e) => `\`${e}\``).join('<br>');
    lines.push(
      `| ${s.id} | ${s.urs.join('<br>')} | ${s.kind} | ${md(s.action)} | ${md(s.expected)} | ${md(observed)} | **${s.status}** | ${ev} |`,
    );
  }
  lines.push('');
  const errs = result.steps.filter((s) => s.consoleErrors.length);
  lines.push('## Browser console errors observed during steps');
  lines.push('');
  if (!errs.length) lines.push('None recorded.');
  for (const s of errs) {
    lines.push(`- **${s.id}**:`);
    for (const e of s.consoleErrors) lines.push(`  - ${e.kind}: ${md(e.message).slice(0, 300)}`);
  }
  lines.push('');
  lines.push('## Signature block');
  lines.push('');
  lines.push('| Role | Name | Signature | Date |');
  lines.push('|---|---|---|---|');
  lines.push('| Executed by (automation owner) | | *unsigned* | |');
  lines.push('| Reviewed by (qualified validation contractor) | | *unsigned* | |');
  lines.push('| Approved by (founder / system owner) | | *unsigned* | |');
  lines.push('');
  return lines.join('\n');
}

/** Small helpers shared by runners. */
export const helpers = {
  uuidRe: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  stamp() {
    return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  },
};
