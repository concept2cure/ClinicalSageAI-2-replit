// AnA detach DT3 acceptance, in a real browser (Chromium), on a private
// instance with the DT1 stand-in model, against fresh2 with RLS on. One
// person on a desktop (1280x800) and a phone (390x844), and an admin of the
// same organisation.
//
//   A. The desktop starts a long Auto turn and its page CLOSES. The phone opens
//      the conversation, follows the turn to its end, and the record seals.
//   B. The page that started a turn RELOADS mid-turn and rejoins it.
//   C. An admin stops a colleague's turn: the asker reads "Stopped by an
//      administrator." and the admin's follower offers Stop and nothing else.
//      Since the DT3 review (re-run 2026-10-22): the Stop asks why in a dialog
//      that names whose turn it is, and the sealed Summary credits the
//      administrator by name, with the reason — never "You stopped the run".
//   E. A Manual turn holds; the desktop page closes; the phone shows the hold
//      with "Run this step" and "Do this instead", and its answer is obeyed.
//   F. A turn nobody watches finishes: TaskTray names the conversation, and the
//      notice opens it through the server-verified notification door.
//   G. Live Drive ON (the product's default since 9db931c56): the turn asks to
//      drive, moves the screen while its page is open, and the page closes. By
//      decision D-7 (2026-10-22) it detaches like any other turn: its later
//      screen action is refused, never queued, and listed as a step that did
//      not run ("Not run: the page was closed, so AnA stopped driving the
//      screen."); its read runs; it finishes and seals. (Run on 2026-10-22
//      with the stand-in's "d7 drive" play and FAKE_SLOW_TOOL=act_on_screen,
//      so the screen action is asked for after the page has closed.)
//   D. SIGTERM mid-turn: the server ends the run server_shutdown before its
//      drain; after a restart the phone reads "Stopped: the server restarted
//      for an update." with Continue. (Last: it restarts the server.)
//
// A–F run with Live Drive switched OFF (the person's own setting, stored as the
// shell stores it), as they were first run under the earlier D-7 (a turn that
// asked to drive did not detach). G runs with it on.
//
// Usage (no credential is written anywhere; the sign-in code is read from the
// dev server's own log):
//   APP_URL=http://127.0.0.1:5099 SERVER_LOG=<log> PW_FILE=<file> OUT=<dir>
//   APP_PORT=5099 RESTART=<script that starts the server> node dt3-detach.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium, signIn, sleep, BASE, OUT, watchedPage, writeLog } from '../../../../QA-2026-10-08/rate-limits/scripts/lib.mjs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PW = fs.readFileSync(process.env.PW_FILE, 'utf8').trim();
const ASKER = { email: 'dt1-asker@example.invalid', password: PW };
const ADMIN = { email: 'dt1-admin@example.invalid', password: PW };
const ASK = 's5 tasks: find the stability reports, list the project documents, read the two archived reports, and summarise the shelf-life claims';
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const ONLY = (process.env.ONLY || 'A,B,C,E,F,G,D').split(',');
const say = (...a) => console.info(new Date().toISOString().slice(11, 19), ...a);
const shots = path.join(OUT, 'screens');
fs.mkdirSync(shots, { recursive: true });
let n = 0;
const shot = async (page, name) => {
  n += 1;
  const file = path.join(shots, `${String(n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  return path.basename(file);
};

// Tee every /api/ana-ri/stream body into window.__frames.
const TEE = `
  (() => {
    window.__frames = [];
    const orig = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const res = await orig(...args);
      const url = String(args[0] && args[0].url ? args[0].url : args[0]);
      if (!/\\/api\\/ana-ri\\/stream$/.test(url) || !res.body) return res;
      const [a, b] = res.body.tee();
      (async () => {
        try {
          const reader = b.getReader(); const dec = new TextDecoder(); let buf = '';
          for (;;) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
            let i; while ((i = buf.indexOf('\\n\\n')) >= 0) { const f = buf.slice(0, i); buf = buf.slice(i + 2);
              if (f.startsWith('data: ')) { try { window.__frames.push({ at: Date.now(), ...JSON.parse(f.slice(6)) }); } catch {} } } }
        } catch {}
      })();
      return new Response(a, { status: res.status, statusText: res.statusText, headers: res.headers });
    };
  })();`;

const READ_VIEW = () => {
  const text = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
  const all = (sel) => [...document.querySelectorAll(sel)].map(text);
  const body = document.body.innerText;
  return {
    url: location.pathname,
    phase: all('.ana-activity-phase'),
    alerts: all('.ana-activity-unrecorded'),
    stopped: all('.ana-activity-stopped'),
    strip: text(document.querySelector('.ana-runctl')),
    stripButtons: [...document.querySelectorAll('.ana-runctl button')].map((b) => b.innerText.trim()),
    buttons: [...document.querySelectorAll('main button, .ct-thread button')].map((b) => b.innerText.trim()).filter((t) => /Continue|Stop|Recorded|Summary|Run this step|Do this instead/.test(t)),
    lastTurn: text([...document.querySelectorAll('.ct-turn, .ct-msg')].pop() ?? null)?.slice(0, 600) ?? null,
    bodyHas: {
      stoppedResponding: /stopped responding/i.test(body),
      lostConnection: /lost its connection/i.test(body),
      byAdmin: /Stopped by an administrator/.test(body),
      restarted: /the server restarted for an update/.test(body),
      unreachable: /Can't reach the server/.test(body),
      runThisStep: /Run this step/.test(body),
      doThisInstead: /Do this instead/.test(body),
    },
  };
};

/** The run's own read, as the asker's page makes it — without `visible`, so it never counts as watching. */
const readRun = (page, runId) =>
  page.evaluate(async (id) => {
    const token = sessionStorage.getItem('trialsage_access_token') || localStorage.getItem('trialsage_access_token');
    const r = await fetch(`/api/ana-ri/runs/${encodeURIComponent(id)}/events?after=2000`, { headers: token ? { authorization: `Bearer ${token}` } : {}, credentials: 'include' });
    const b = await r.json().catch(() => null);
    return b && { http: r.status, status: b.status, stoppedReason: b.stoppedReason, runPolicy: b.runPolicy, hold: b.hold, detachedAt: b.detachedAt, unattendedStopsAt: b.unattendedStopsAt, sealed: b.sealed, releasedAt: b.releasedAt };
  }, runId);

const browser = await chromium.launch({ executablePath: EXE });
const log = [];
const result = { checks: {}, views: {}, shots: {}, runs: {} };

// The person has switched Live Drive off (the shell's own stored setting).
const LIVE_DRIVE_OFF = `
  (() => {
    try {
      const prefs = JSON.parse(localStorage.getItem('c2c-v2-prefs') || '{}');
      localStorage.setItem('c2c-v2-prefs', JSON.stringify({ ...prefs, liveDrive: false, liveDriveDefault: 2 }));
    } catch {}
  })();`;
const askerCtx = await signIn(browser, ASKER);
await askerCtx.addInitScript(TEE);
await askerCtx.addInitScript(LIVE_DRIVE_OFF);
let phoneCtx = null;
const phoneContext = async () => {
  if (!phoneCtx) {
    phoneCtx = await signIn(browser, ASKER);
    await phoneCtx.addInitScript(LIVE_DRIVE_OFF);
  }
  return phoneCtx;
};

/** A desktop page of the asker that starts a turn; resolves once a step is under way. */
async function startTurn(label, policy = /Auto/, ctx = askerCtx, ask = ASK) {
  const page = await watchedPage(ctx, log);
  // What the turn's request asked for: live_drive decides whether it may detach (D-7).
  let sent = null;
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/api\/ana-ri\/stream$/.test(r.url())) {
      try { sent = JSON.parse(r.postData() || '{}'); } catch { sent = {}; }
    }
  });
  await page.setViewportSize(DESKTOP);
  await page.goto(`${BASE}/concept2cure/conversation-thread`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ct-composer textarea', { timeout: 180000 });
  await page.getByRole('radio', { name: policy }).first().click().catch(() => say(label, 'no policy radio'));
  await page.fill('.ct-composer textarea', ask);
  await page.keyboard.press('Enter');
  let threadId = null;
  let runId = null;
  let steps = 0;
  for (let i = 0; i < 360 && !(threadId && runId && steps > 0); i++) {
    await sleep(250);
    const frames = await page.evaluate(() => window.__frames);
    threadId = frames.find((f) => f.type === 'thread_id')?.thread_id ?? threadId;
    runId = frames.find((f) => f.type === 'run_started')?.runId ?? runId;
    steps = frames.filter((f) => f.type === 'timeline' && f.event?.kind === 'step').length;
  }
  say(label, 'thread', threadId, 'run', runId);
  result.runs[label] = { threadId, runId, liveDriveRequested: sent ? sent.live_drive === true : null, runPolicySent: sent?.run_policy ?? null };
  return { page, threadId, runId, url: `${BASE}/concept2cure/conversation-thread/${encodeURIComponent(threadId)}` };
}

async function untilView(page, pred, ms) {
  for (let t = 0; t < ms; t += 1000) {
    const v = await page.evaluate(READ_VIEW).catch(() => null);
    if (v && pred(v)) return v;
    await sleep(1000);
  }
  return page.evaluate(READ_VIEW);
}

async function untilRun(page, runId, pred, ms) {
  for (let t = 0; t < ms; t += 1000) {
    const r = await readRun(page, runId).catch(() => null);
    if (r && pred(r)) return r;
    await sleep(1000);
  }
  return readRun(page, runId).catch(() => null);
}

async function phonePage() {
  const page = await watchedPage(await phoneContext(), log);
  await page.setViewportSize(PHONE);
  return page;
}

// ── A. The page closes; the phone follows to the end ─────────────────────────
if (ONLY.includes('A')) {
  const a = await startTurn('A');
  result.views.A_desktopBeforeClose = await a.page.evaluate(READ_VIEW);
  result.shots.A_desktopBeforeClose = await shot(a.page, 'A-desktop-turn-running');
  await a.page.close();
  say('A: desktop page closed');
  const phone = await phonePage();
  await sleep(3000);
  await phone.goto(a.url, { waitUntil: 'domcontentloaded' });
  await phone.waitForSelector('.ana-activity-phase', { timeout: 90000 }).catch(() => say('A phone: no phase line'));
  await sleep(2500);
  result.runs.A.afterClose = await readRun(phone, a.runId);
  result.views.A_phoneFollowing = await phone.evaluate(READ_VIEW);
  result.shots.A_phoneFollowing = await shot(phone, 'A-phone-following-after-desktop-closed');
  await untilRun(phone, a.runId, (r) => Boolean(r.sealed), 300000);
  result.views.A_phoneEnd = await untilView(phone, (v) => v.phase.length === 0 && v.buttons.includes('Summary'), 60000);
  result.runs.A.end = await readRun(phone, a.runId);
  result.shots.A_phoneEnd = await shot(phone, 'A-phone-handed-over-to-record');
  result.checks.A_detachedNotStopped = Boolean(result.runs.A.afterClose?.detachedAt) && ['running', 'paused', 'awaiting_approval'].includes(result.runs.A.afterClose?.status);
  result.checks.A_finishedAndSealed = result.runs.A.end?.status === 'finished' && Boolean(result.runs.A.end?.sealed);
  result.checks.A_noLostConnection = !result.views.A_phoneEnd.bodyHas.lostConnection && !result.views.A_phoneEnd.bodyHas.stoppedResponding;
  await phone.close();
}

// ── B. The starting page reloads and rejoins ──────────────────────────────────
if (ONLY.includes('B')) {
  const b = await startTurn('B');
  await sleep(2000);
  await b.page.reload({ waitUntil: 'domcontentloaded' });
  say('B: reloaded');
  await b.page.waitForSelector('.ana-activity-phase', { timeout: 90000 }).catch(() => say('B: no phase line after reload'));
  await sleep(3000);
  result.views.B_afterReload = await b.page.evaluate(READ_VIEW);
  result.runs.B.afterReload = await readRun(b.page, b.runId);
  result.shots.B_afterReload = await shot(b.page, 'B-desktop-reloaded-rejoined');
  await untilRun(b.page, b.runId, (r) => Boolean(r.sealed), 300000);
  result.views.B_end = await untilView(b.page, (v) => v.phase.length === 0 && v.buttons.includes('Summary'), 60000);
  result.runs.B.end = await readRun(b.page, b.runId);
  result.shots.B_end = await shot(b.page, 'B-desktop-after-reload-handed-over');
  result.checks.B_rejoined = result.views.B_afterReload.phase.some((p) => /Working|step/.test(p)) && ['running', 'paused', 'awaiting_approval'].includes(result.runs.B.afterReload?.status);
  result.checks.B_finished = result.runs.B.end?.status === 'finished' && Boolean(result.runs.B.end?.sealed);
  result.checks.B_noLostConnection = !result.views.B_end.bodyHas.lostConnection && !result.views.B_end.bodyHas.stoppedResponding;
  await b.page.close();
}

// ── C. An admin stops a colleague's turn ──────────────────────────────────────
const ADMIN_STOP_REASON = 'Stopping a turn that is drafting for the wrong agency.';
/** The sealed record's controls, as this page's person reads them (GET /turn-records/:id/summary). */
const readSummaryControls = (page, recordId) =>
  page.evaluate(async (id) => {
    const token = sessionStorage.getItem('trialsage_access_token') || localStorage.getItem('trialsage_access_token');
    const r = await fetch(`/api/ana-ri/turn-records/${encodeURIComponent(id)}/summary`, { headers: token ? { authorization: `Bearer ${token}` } : {}, credentials: 'include' });
    const b = await r.json().catch(() => null);
    return b?.data?.controls ?? null;
  }, recordId);
if (ONLY.includes('C')) {
  const c = await startTurn('C');
  const adminCtx = await signIn(browser, ADMIN);
  const admin = await watchedPage(adminCtx, log);
  await admin.setViewportSize(PHONE);
  await admin.goto(c.url, { waitUntil: 'domcontentloaded' });
  await admin.waitForSelector('.ana-activity-phase', { timeout: 90000 }).catch(() => say('C admin: no phase line'));
  await sleep(2500);
  result.views.C_admin = await admin.evaluate(READ_VIEW);
  result.shots.C_admin = await shot(admin, 'C-admin-follower-with-stop');
  await admin.locator('.ana-runctl button', { hasText: 'Stop' }).first().click({ timeout: 15000 }).catch(() => say('C admin: no Stop'));
  say('C: admin pressed Stop');
  // Since the DT3 review (DP-82): the Stop asks why, in a dialog that names whose turn it is.
  const dialog = admin.getByRole('dialog');
  await dialog.waitFor({ timeout: 15000 }).catch(() => say('C admin: no dialog'));
  result.views.C_adminDialog = await dialog.innerText().catch(() => null);
  result.shots.C_adminDialog = await shot(admin, 'C-admin-stop-asks-why');
  await dialog.locator('textarea').fill(ADMIN_STOP_REASON).catch(() => say('C admin: no reason box'));
  await dialog.locator('input[type="text"]').fill('stop').catch(() => say('C admin: no confirm box'));
  await dialog.getByRole('button', { name: /Confirm and log/ }).click({ timeout: 15000 }).catch(() => say('C admin: no confirm'));
  say('C: admin confirmed, with a reason');
  await untilView(c.page, (v) => v.bodyHas.byAdmin, 90000);
  await sleep(4000);
  result.views.C_askerAfter = await c.page.evaluate(READ_VIEW);
  // What the asker's own stream said once the admin's stop landed.
  result.views.C_askerFrames = await c.page.evaluate(() =>
    window.__frames
      .filter((f) => !['token', 'text', 'content', 'thinking'].includes(f.type) && !(f.type === 'timeline' && f.event?.kind === 'step'))
      .map((f) => ({ type: f.type, ...(f.event ? { kind: f.event.kind, outcome: f.event.outcome, stoppedReason: f.event.stoppedReason } : {}), ...(f.stoppedReason !== undefined ? { stoppedReason: f.stoppedReason } : {}), ...(f.error ? { error: String(f.error).slice(0, 120) } : {}) })),
  );
  result.runs.C.end = await readRun(c.page, c.runId);
  result.shots.C_askerAfter = await shot(c.page, 'C-asker-stopped-by-an-administrator');
  result.views.C_adminAfter = await untilView(admin, (v) => v.bodyHas.byAdmin, 30000);
  result.shots.C_adminAfter = await shot(admin, 'C-admin-after-stop');
  // The sealed record's Summary, as the asker and as the administrator read it (DT3 review blocker: never "You" for the asker).
  await untilRun(c.page, c.runId, (r) => Boolean(r.sealed), 120000);
  result.runs.C.sealed = await readRun(c.page, c.runId);
  const cRecord = result.runs.C.sealed?.sealed?.recordId ?? null;
  result.runs.C.askerSummaryControls = cRecord ? (await readSummaryControls(c.page, cRecord)) : null;
  result.runs.C.adminSummaryControls = cRecord ? (await readSummaryControls(admin, cRecord)) : null;
  await c.page.getByRole('button', { name: 'Summary' }).last().click({ timeout: 15000 }).catch(() => say('C asker: no Summary'));
  await sleep(2500);
  result.views.C_askerSummaryText = await c.page.evaluate(() => {
    const t = document.body.innerText;
    return { creditsAdministrator: /Stopped by [^\n]+, an administrator/.test(t), saysYouStopped: /You stopped the run/.test(t), reasonShown: t.includes('Reason: ') };
  });
  result.shots.C_askerSummary = await shot(c.page, 'C-asker-summary-stopped-by-the-administrator');
  const askerControl = result.runs.C.askerSummaryControls?.[0] ?? null;
  const adminControl = result.runs.C.adminSummaryControls?.[0] ?? null;
  result.checks.C_adminHadStopOnly = result.views.C_admin.stripButtons.includes('Stop') && !result.views.C_admin.stripButtons.includes('Pause');
  result.checks.C_dialogNamesTheTurnAndAsksWhy = Boolean(result.views.C_adminDialog && /Stop .+'s turn/.test(result.views.C_adminDialog) && !/this person/.test(result.views.C_adminDialog) && /Reason for this action/.test(result.views.C_adminDialog));
  result.checks.C_rowSaysAdmin = result.runs.C.end?.status === 'cancelled' && result.runs.C.end?.stoppedReason === 'admin_cancelled';
  result.checks.C_askerReadsAdminLine = result.views.C_askerAfter.bodyHas.byAdmin;
  result.checks.C_summaryCreditsTheAdministrator = askerControl?.action === 'cancel' && askerControl?.by?.kind === 'administrator' && askerControl?.reason === ADMIN_STOP_REASON
    && result.views.C_askerSummaryText.creditsAdministrator && !result.views.C_askerSummaryText.saysYouStopped && result.views.C_askerSummaryText.reasonShown;
  result.checks.C_administratorReadsItAsTheirs = adminControl?.by?.kind === 'you_as_administrator';
  await admin.close();
  await adminCtx.close();
  await c.page.close();
}

// ── E. A Manual hold, answered from the phone after the desktop closed ────────
if (ONLY.includes('E')) {
  const e = await startTurn('E', /Manual/);
  await e.page.waitForSelector('text=Waiting for you before the next step', { timeout: 120000 }).catch(() => say('E: no hold on desktop'));
  result.shots.E_desktopAtHold = await shot(e.page, 'E-desktop-manual-hold');
  await e.page.close();
  say('E: desktop page closed at the hold');
  const phone = await phonePage();
  await phone.goto(e.url, { waitUntil: 'domcontentloaded' });
  result.views.E_phoneAtHold = await untilView(phone, (v) => v.bodyHas.runThisStep && v.bodyHas.doThisInstead, 90000);
  result.runs.E.atHold = await readRun(phone, e.runId);
  result.shots.E_phoneAtHold = await shot(phone, 'E-phone-run-this-step-do-this-instead');
  const before = await readRun(phone, e.runId);
  await phone.getByRole('button', { name: /^(Resume|Run this step)$/ }).first().click({ timeout: 15000 }).catch(() => say('E phone: no Run this step'));
  say('E: phone pressed Run this step');
  result.runs.E.afterRun = await untilRun(phone, e.runId, (r) => r.status !== 'paused' || (r.hold && JSON.stringify(r.hold) !== JSON.stringify(before?.hold)), 60000);
  await sleep(3000);
  result.shots.E_phoneAfterRun = await shot(phone, 'E-phone-after-run-this-step');
  await phone.getByRole('button', { name: 'Stop' }).first().click({ timeout: 15000 }).catch(() => say('E phone: no Stop'));
  result.runs.E.end = await untilRun(phone, e.runId, (r) => !['running', 'paused', 'awaiting_approval'].includes(r.status), 60000);
  await sleep(4000);
  result.shots.E_phoneEnd = await shot(phone, 'E-phone-stopped');
  result.checks.E_holdWrittenForFollower = result.runs.E.atHold?.status === 'paused' && result.runs.E.atHold?.hold?.reason === 'manual' && Array.isArray(result.runs.E.atHold?.hold?.next) && result.runs.E.atHold.hold.next.length > 0;
  result.checks.E_phoneShowsHoldButtons = result.views.E_phoneAtHold.bodyHas.runThisStep && result.views.E_phoneAtHold.bodyHas.doThisInstead;
  result.checks.E_detachedAtHold = Boolean(result.runs.E.atHold?.detachedAt);
  result.checks.E_stoppedFromPhone = result.runs.E.end?.status === 'cancelled';
  await phone.close();
}

// ── F. Nobody watches: the notice names the conversation and opens it ────────
if (ONLY.includes('F')) {
  const f = await startTurn('F');
  await f.page.close();
  say('F: page closed; nobody watches');
  const reader = await watchedPage(askerCtx, log);
  await reader.setViewportSize(DESKTOP);
  await reader.goto(`${BASE}/concept2cure`, { waitUntil: 'domcontentloaded' });
  result.runs.F.end = await untilRun(reader, f.runId, (r) => r.status === 'finished' && Boolean(r.releasedAt || r.sealed), 300000);
  await sleep(3000);
  await reader.reload({ waitUntil: 'domcontentloaded' });
  await reader.getByRole('button', { name: /Your work/ }).first().click({ timeout: 120000 }).catch(() => say('F: no TaskTray'));
  await reader.getByRole('dialog', { name: 'Your work' }).waitFor({ timeout: 30000 }).catch(() => say('F: no tray dialog'));
  await sleep(2000);
  const notice = reader.locator('.tt-notif', { hasText: 'AnA finished your request' }).first();
  result.views.F_notice = await notice.innerText({ timeout: 30000 }).catch(() => null);
  result.shots.F_tray = await shot(reader, 'F-tasktray-notice-names-the-conversation');
  await notice.getByRole('button', { name: 'Open conversation' }).click({ timeout: 15000 }).catch(() => say('F: no Open conversation'));
  await sleep(6000);
  result.views.F_opened = await reader.evaluate(READ_VIEW);
  result.shots.F_opened = await shot(reader, 'F-notice-opened-the-conversation');
  result.checks.F_noticeNamesConversation = Boolean(result.views.F_notice && /AnA finished your request/.test(result.views.F_notice) && /s5 tasks|UTC|stability/i.test(result.views.F_notice));
  result.checks.F_openedTheConversation = result.views.F_opened.url.includes(f.threadId ?? '#none#') || /conversation-thread/.test(result.views.F_opened.url);
  await reader.close();
}

// ── G. Live Drive on (the default): the turn detaches; the screen is let go (D-7) ──
const SCREEN_GONE_LINE = 'Not run: the page was closed, so AnA stopped driving the screen.';
const D7_ASK = 'd7 drive: open the Vault on my screen, search it for stability, then list the project documents';
/** The sealed record's Summary, as the record's own reader returns it. */
const readSummary = (page, recordId) =>
  page.evaluate(async (id) => {
    const token = sessionStorage.getItem('trialsage_access_token') || localStorage.getItem('trialsage_access_token');
    const r = await fetch(`/api/ana-ri/turn-records/${encodeURIComponent(id)}/summary`, { headers: token ? { authorization: `Bearer ${token}` } : {}, credentials: 'include' });
    const b = await r.json().catch(() => null);
    const d = b?.data;
    return d && {
      http: r.status,
      outcome: d.outcome,
      verdict: d.verdict,
      steps: (d.events ?? []).filter((e) => e.kind === 'step' && e.status).map((e) => ({ label: e.label, status: e.status, message: e.message ?? null, source: e.source })),
    };
  }, recordId);
if (ONLY.includes('G')) {
  const driveCtx = await signIn(browser, ASKER);
  await driveCtx.addInitScript(TEE);
  const g = await startTurn('G', /Auto/, driveCtx, D7_ASK);
  result.views.G_beforeClose = await g.page.evaluate(READ_VIEW);
  result.shots.G_beforeClose = await shot(g.page, 'G-live-drive-turn-moving-the-screen');
  await g.page.close();
  say('G: Live Drive page closed');
  const phone = await phonePage();
  await sleep(3000);
  await phone.goto(g.url, { waitUntil: 'domcontentloaded' });
  await phone.waitForSelector('.ana-activity-phase', { timeout: 90000 }).catch(() => say('G phone: no phase line'));
  result.runs.G.afterClose = await readRun(phone, g.runId);
  result.views.G_phoneFollowing = await phone.evaluate(READ_VIEW);
  result.shots.G_phoneFollowing = await shot(phone, 'G-phone-following-the-detached-drive-turn');
  await untilRun(phone, g.runId, (r) => Boolean(r.sealed), 300000);
  result.views.G_phoneEnd = await untilView(phone, (v) => v.phase.length === 0 && v.buttons.includes('Summary'), 60000);
  result.runs.G.end = await readRun(phone, g.runId);
  result.shots.G_phoneEnd = await shot(phone, 'G-phone-handed-over-to-record');
  const recordId = result.runs.G.end?.sealed?.recordId ?? null;
  result.runs.G.summary = recordId ? await readSummary(phone, recordId) : null;
  await phone.getByRole('button', { name: 'Summary' }).last().click({ timeout: 15000 }).catch(() => say('G phone: no Summary'));
  await sleep(2500);
  result.views.G_phoneSummary = await phone.evaluate(() => ({ screenGoneShown: document.body.innerText.includes('Not run: the page was closed, so AnA stopped driving the screen.') }));
  result.shots.G_phoneSummary = await shot(phone, 'G-phone-summary-screen-step-not-run');
  const steps = result.runs.G.summary?.steps ?? [];
  result.checks.G_liveDriveRequested = result.runs.G.liveDriveRequested === true;
  result.checks.G_detachedNotStopped = Boolean(result.runs.G.afterClose?.detachedAt) && ['running', 'paused', 'awaiting_approval', 'finished'].includes(result.runs.G.afterClose?.status);
  result.checks.G_finishedAndSealed = result.runs.G.end?.status === 'finished' && Boolean(result.runs.G.end?.sealed) && Boolean(result.runs.G.end?.detachedAt);
  result.checks.G_screenActionNotRun = steps.some((s) => s.status === 'not_run' && s.message === SCREEN_GONE_LINE);
  result.checks.G_readStillRan = steps.some((s) => s.status === 'success' && /document/i.test(s.label));
  result.checks.G_summaryShowsTheLine = result.views.G_phoneSummary.screenGoneShown;
  result.checks.G_noLostConnection = !result.views.G_phoneEnd.bodyHas.lostConnection && !result.views.G_phoneEnd.bodyHas.stoppedResponding;
  await phone.close();
  await driveCtx.close();
}

// ── D. SIGTERM mid-turn ───────────────────────────────────────────────────────
if (ONLY.includes('D')) {
  const d = await startTurn('D');
  const phone = await phonePage();
  await phone.goto(d.url, { waitUntil: 'domcontentloaded' });
  await phone.waitForSelector('.ana-activity-phase', { timeout: 90000 }).catch(() => say('D phone: no phase line'));
  await sleep(2000);
  // The process listening on the app port (npx → tsx → node).
  const port = process.env.APP_PORT || '5099';
  const listener = execFileSync('bash', ['-c', `lsof -ti tcp:${port} -sTCP:LISTEN | head -1`]).toString().trim();
  say('D: SIGTERM to', listener);
  result.checks.D_sigtermAt = new Date().toISOString();
  process.kill(Number(listener), 'SIGTERM');
  await sleep(5000);
  result.views.D_phoneWhileDown = await phone.evaluate(READ_VIEW);
  result.shots.D_phoneWhileDown = await shot(phone, 'D-phone-while-server-down');
  for (let i = 0; i < 60; i++) {
    const still = execFileSync('bash', ['-c', `lsof -ti tcp:${port} -sTCP:LISTEN || true`]).toString().trim();
    if (!still) break;
    await sleep(1000);
  }
  execFileSync('bash', [process.env.RESTART]);
  say('D: restarting');
  for (let i = 0; i < 300; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) break; } catch { /* starting */ }
    await sleep(1000);
  }
  say('D: server back');
  result.views.D_phoneAfter = await untilView(phone, (v) => v.bodyHas.restarted, 180000);
  result.runs.D.end = await readRun(phone, d.runId);
  result.shots.D_phoneAfter = await shot(phone, 'D-phone-server-restarted-for-an-update');
  result.views.D_desktopAfter = await untilView(d.page, (v) => v.bodyHas.restarted, 90000);
  result.shots.D_desktopAfter = await shot(d.page, 'D-desktop-server-restarted-for-an-update');
  result.checks.D_rowSaysShutdown = result.runs.D.end?.status === 'failed' && result.runs.D.end?.stoppedReason === 'server_shutdown';
  result.checks.D_phoneReadsRestart = result.views.D_phoneAfter.bodyHas.restarted;
  result.checks.D_continueOffered = [...result.views.D_phoneAfter.buttons, ...result.views.D_desktopAfter.buttons].some((b) => /Continue/.test(b));
  await phone.close();
}

fs.writeFileSync(path.join(OUT, 'dt3-detach.json'), JSON.stringify(result, null, 2));
writeLog('dt3-detach-console-and-http', log);
say('done', JSON.stringify(result.checks));
await browser.close();
