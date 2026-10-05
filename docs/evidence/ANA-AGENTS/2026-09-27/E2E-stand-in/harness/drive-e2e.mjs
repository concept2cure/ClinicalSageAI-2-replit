// Scenario driver for the row 74 end-to-end capture (S1 / S2 / S4) against the
// scripted stand-in (stand-in-e2e.mjs). It drives the real app in headless
// Chromium, records what the person sees (screenshots + visible text), what
// the browser sent and received on /api/ana-ri/stream (a fetch tee installed
// before the app loads), and leaves the database to capture-sql.sh.
//
//   node drive-e2e.mjs <scenario> [...]      scenarios: see SCENARIOS
//   APP_URL     default http://localhost:5077
//   SERVER_LOG  the app's log (the dev sign-in code is read from it)
//   OUT         evidence folder (screens/ and frames/ are written there)
//   STATE       storage-state file for the signed-in session
//   DATABASE_URL  only for s4-manual-unavailable (it toggles a NOT VALID CHECK on ana_runs)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(process.env.PLAYWRIGHT_PKG || '/opt/node22/lib/node_modules/playwright/package.json');
const { chromium } = require('playwright-core');

const BASE = process.env.APP_URL || 'http://localhost:5077';
const OUT = process.env.OUT;
const STATE = process.env.STATE;
const SERVER_LOG = process.env.SERVER_LOG;
if (!OUT || !STATE || !SERVER_LOG) throw new Error('OUT, STATE and SERVER_LOG are required');
for (const d of ['screens', 'frames']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = (...a) => console.info(new Date().toISOString().slice(11, 19), ...a);

// ── Session ──────────────────────────────────────────────────────────────────

function lastOtp() {
  const hits = [...fs.readFileSync(SERVER_LOG, 'utf8').matchAll(/"code":"(\d{6})"\},"msg":"\[email-service\] Dev OTP code"/g)];
  return hits.length ? hits[hits.length - 1][1] : null;
}

async function signIn(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/concept2cure/login?returnTo=%2Fconcept2cure`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login-email', { timeout: 120000 });
  const before = lastOtp();
  await page.fill('#login-email', 'jm.smith@concept2cure.pro'); // the GA demo seed's account
  await page.fill('#login-password', 'pass-word');
  await page.click('button:has-text("Sign in")');
  let otp = null;
  for (let i = 0; i < 40 && (!otp || otp === before); i++) {
    await sleep(500);
    otp = lastOtp();
  }
  // Development only: with no SMTP the server logs the code (emailService.ts sendLoginOtpEmail).
  const digits = page.locator('input[maxlength="1"]:visible');
  for (let i = 0; i < 6; i++) {
    await digits.nth(i).click();
    await page.keyboard.type(otp[i]);
  }
  await sleep(800);
  if (/\/login/.test(page.url())) {
    const verify = page.locator('button:has-text("Verify")');
    if (await verify.isEnabled().catch(() => false)) await verify.click().catch(() => {});
  }
  await page.waitForURL(u => !String(u).includes('/login'), { timeout: 60000 });
  await ctx.storageState({ path: STATE });
  await ctx.close();
}

// Tee every POST /api/ana-ri/stream: the request body and every SSE frame but the text deltas.
function streamTee() {
  window.__e2e = { streams: [] };
  const orig = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const res = await orig.call(this, input, init);
    const method = String(init?.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
    if (method === 'POST' && /\/api\/ana-ri\/stream(\?|$)/.test(url)) {
      const rec = { t0: Date.now(), body: null, frames: [], deltas: 0, ended: null };
      try {
        rec.body = JSON.parse(init.body);
      } catch {
        /* not JSON */
      }
      window.__e2e.streams.push(rec);
      try {
        const reader = res.clone().body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        // One SSE event: count text deltas, keep every other frame with its time.
        const eatChunk = (chunk) => {
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const f = JSON.parse(line.slice(6));
              if (f.type === 'text' || f.type === 'token' || f.type === 'content' || f.type === 'delta' || f.type === 'thinking') rec.deltas++;
              else rec.frames.push({ ms: Date.now() - rec.t0, ...f });
            } catch {
              /* keepalive or partial */
            }
          }
        };
        (async () => {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf('\n\n')) >= 0) {
              const chunk = buf.slice(0, i);
              buf = buf.slice(i + 2);
              eatChunk(chunk);
            }
          }
          rec.ended = Date.now() - rec.t0;
        })();
      } catch {
        /* a response with no body */
      }
    }
    return res;
  };
}

async function openPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, storageState: STATE });
  await ctx.addInitScript(streamTee);
  const page = await ctx.newPage();
  page.on('pageerror', e => say('PAGEERROR', e.message.slice(0, 200)));
  return { ctx, page };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function goHome(page) {
  await page.goto(`${BASE}/concept2cure`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('textarea', { timeout: 120000 });
  await sleep(1500);
}

async function setPolicy(page, label) {
  const radio = page.locator(`[role="radiogroup"][aria-label="Between steps"] [role="radio"]:has-text("${label}")`).first();
  await radio.click();
  await sleep(300);
  const checked = await radio.getAttribute('aria-checked');
  say(`policy ${label}: aria-checked=${checked}`);
  return checked === 'true';
}

async function ask(page, text) {
  const box = page.locator('textarea:visible').first();
  await box.click();
  await box.fill(text);
  await box.press('Enter');
}

const streams = page => page.evaluate(() => window.__e2e?.streams ?? []);
async function latest(page) {
  const s = await streams(page);
  return s[s.length - 1] ?? null;
}

async function waitFor(page, pred, { timeout = 120000, what = 'condition' } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await latest(page);
    if (s && pred(s)) return s;
    await sleep(400);
  }
  throw new Error(`timed out waiting for ${what}`);
}
const has = (s, type, extra = () => true) => s.frames.some(f => f.type === type && extra(f));
const count = (s, type, extra = () => true) => s.frames.filter(f => f.type === type && extra(f)).length;

async function snap(page, id, name, { full = true } = {}) {
  const file = `${id}-${name}.png`;
  await page.screenshot({ path: path.join(OUT, 'screens', file), fullPage: full });
  say(`screenshot ${file}`);
  return file;
}

async function visibleText(page, id, name) {
  const text = await page.evaluate(() => document.querySelector('main')?.innerText ?? document.body.innerText);
  fs.writeFileSync(path.join(OUT, 'frames', `${id}-${name}.txt`), text);
  return text;
}

function saveFrames(id, all) {
  fs.writeFileSync(path.join(OUT, 'frames', `${id}.json`), JSON.stringify(all, null, 1));
}

function psql(sql) {
  return execFileSync('psql', [process.env.DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-Atc', sql]).toString().trim();
}

// Rows carrying the stand-in's task title. create_task writes project_tasks,
// with the title in `name` (command-executor.ts createTask); the other task
// tables are counted too, and project_tasks' total, so a write under another
// name would still show.
const TASK_TITLE = 'E2E stand-in: review the stability protocol';
function taskRows() {
  const titled = psql("SELECT string_agg(table_name, ',') FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'title' AND table_name ~ 'task'").split(',');
  return {
    'project_tasks (name = title)': Number(psql(`SELECT count(*) FROM project_tasks WHERE name = '${TASK_TITLE}'`)),
    'project_tasks (all rows)': Number(psql('SELECT count(*) FROM project_tasks')),
    ...Object.fromEntries(titled.map(t => [`${t} (title = title)`, Number(psql(`SELECT count(*) FROM ${t} WHERE title = '${TASK_TITLE}'`))])),
  };
}

// ── Scenarios ────────────────────────────────────────────────────────────────

const SCENARIOS = {
  // S1: a turn that keeps calling tools until the round cap; then Continue.
  async 's1-round-cap'(page, id) {
    await goHome(page);
    await setPolicy(page, 'Auto');
    await ask(page, 'Survey every source you can for BX-512 stability evidence.');
    const s = await waitFor(page, x => has(x, 'post_done') || (x.ended !== null && has(x, 'done')), { timeout: 240000, what: 'S1 done' });
    const done = s.frames.find(f => f.type === 'done');
    say('S1 done', JSON.stringify({ stoppedReason: done?.stoppedReason, rounds: done?.rounds, runPolicy: done?.runPolicy }));
    await sleep(2500);
    await snap(page, id, '1-stopped');
    await visibleText(page, id, '1-stopped');
    const cont = page.locator('button:has-text("Continue"):visible');
    say('Continue buttons visible:', await cont.count());
    await cont.last().click();
    const s2 = await waitFor(page, x => x !== s && (has(x, 'post_done') || (x.ended !== null && has(x, 'done'))), { timeout: 120000, what: 'continue done' });
    say('continue sent:', JSON.stringify(s2.body?.message));
    await sleep(2500);
    say('Continue buttons after the continued turn finished:', await page.locator('button:has-text("Continue"):visible').count());
    await snap(page, id, '2-after-continue');
    await visibleText(page, id, '2-after-continue');
    saveFrames(id, await streams(page));
  },

  // S4 Auto: keeps going past the old 8-round balanced ceiling, and ends by itself.
  async 's4-auto'(page, id) {
    await goHome(page);
    await setPolicy(page, 'Auto');
    await snap(page, id, '0-home-auto', { full: false });
    await ask(page, 'Work through twelve checks on the Vorelinib program.');
    const s = await waitFor(page, x => has(x, 'post_done') || (x.ended !== null && has(x, 'done')), { timeout: 240000, what: 'auto done' });
    const done = s.frames.find(f => f.type === 'done');
    say('auto done', JSON.stringify({ stoppedReason: done?.stoppedReason, rounds: done?.rounds, runPolicy: done?.runPolicy }));
    await sleep(2500);
    await snap(page, id, '1-finished');
    await visibleText(page, id, '1-finished');
    saveFrames(id, await streams(page));
  },

  // S4 Manual: hold before round 2 → Run this step; hold before round 3 → Do this instead.
  async 's4-manual'(page, id) {
    await goHome(page);
    await setPolicy(page, 'Manual');
    await snap(page, id, '0-home-manual', { full: false });
    await ask(page, 'Check three readiness sources for BX-512, one at a time.');
    await waitFor(page, x => count(x, 'paused', f => f.reason === 'manual') >= 1, { timeout: 120000, what: 'first manual hold' });
    await page.locator('text=Waiting for you before the next step').first().waitFor({ timeout: 20000 });
    await sleep(800);
    await snap(page, id, '1-hold-before-round-2');
    await visibleText(page, id, '1-hold');
    // Every surface that states what AnA is doing, while she waits for the person.
    const surfaces = await page.evaluate(() => ({
      runControlStrip: [...document.querySelectorAll('.ana-runctl')].map(e => e.innerText.replace(/\n+/g, ' | ')),
      liveDriveStrip: [...document.querySelectorAll('.ana-drive-strip')].map(e => e.innerText.replace(/\n+/g, ' | ')),
      headerButton: [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(t => /waiting for you|progress|working/i.test(t)),
    }));
    fs.writeFileSync(path.join(OUT, 'frames', `${id}-hold-surfaces.json`), JSON.stringify(surfaces, null, 1));
    await page.locator('button:has-text("Run this step"):visible').first().click();
    say('pressed Run this step');
    await waitFor(page, x => count(x, 'paused', f => f.reason === 'manual') >= 2, { timeout: 120000, what: 'second manual hold' });
    await page.locator('text=Waiting for you before the next step').first().waitFor({ timeout: 20000 });
    await sleep(800);
    await snap(page, id, '2-hold-before-round-3');
    const steer = 'Skip that source; summarise what the first two found instead.';
    await page.locator('input[aria-label="Tell AnA what to do instead"]:visible').first().fill(steer);
    await snap(page, id, '3-typed-do-this-instead', { full: false });
    await page.locator('button:has-text("Do this instead"):visible').first().click();
    say('pressed Do this instead');
    await waitFor(page, x => has(x, 'post_done') || (x.ended !== null && has(x, 'done')), { timeout: 120000, what: 'manual done' });
    await sleep(2500);
    await snap(page, id, '4-after-redirect');
    await visibleText(page, id, '4-after-redirect');
    saveFrames(id, await streams(page));
  },

  // S4 Manual that cannot hold: a turn with no run row. The run table refuses
  // NEW rows for this one turn (a NOT VALID CHECK, dropped right after), so
  // beginRun throws, the stream opens no run, and isHoldable is false.
  async 's4-manual-unavailable'(page, id) {
    await goHome(page);
    await setPolicy(page, 'Manual');
    psql('ALTER TABLE ana_runs ADD CONSTRAINT e2e_refuse_new_runs CHECK (false) NOT VALID');
    say('ana_runs now refuses new rows');
    try {
      await ask(page, 'Check two readiness sources for BX-256.');
      await waitFor(page, x => has(x, 'post_done') || (x.ended !== null && has(x, 'done')), { timeout: 120000, what: 'unavailable done' });
    } finally {
      psql('ALTER TABLE ana_runs DROP CONSTRAINT IF EXISTS e2e_refuse_new_runs');
      say('ana_runs constraint dropped');
    }
    await sleep(2500);
    await snap(page, id, '1-manual-unavailable');
    await visibleText(page, id, '1-manual-unavailable');
    saveFrames(id, await streams(page));
  },

  // S4 Auto never approves: a governed write is put to the person; it waits; then declined.
  async 's4-approval'(page, id) {
    await goHome(page);
    await setPolicy(page, 'Auto');
    fs.writeFileSync(path.join(OUT, 'frames', `${id}-before-ask-tasks.json`), JSON.stringify({ taskRowsWithTheTitle: taskRows() }, null, 1));
    await ask(page, 'Create a review task for the BX-512 stability protocol.');
    await waitFor(page, x => has(x, 'approval_required'), { timeout: 120000, what: 'approval_required' });
    await sleep(1500);
    await snap(page, id, '1-approval-prompt');
    await visibleText(page, id, '1-approval-prompt');
    // Leave it unanswered for a while: the turn must not move on by itself under Auto.
    say('holding 20s with the prompt unanswered');
    await sleep(20000);
    const mid = await latest(page);
    const tasksWhileWaiting = taskRows();
    const runWhileWaiting = psql(`SELECT status || ' | pending_approval=' || coalesce(pending_approval->>'command','') || ' | decision=' || coalesce(approval_decision::text,'none') FROM ana_runs WHERE id = '${mid.frames.find(f => f.type === 'run_started')?.runId}'`);
    fs.writeFileSync(
      path.join(OUT, 'frames', `${id}-after-20s-unanswered.json`),
      JSON.stringify({ frameTypes: mid.frames.map(f => f.type), done: has(mid, 'done'), taskRowsWithTheTitle: tasksWhileWaiting, runRow: runWhileWaiting }, null, 1),
    );
    await snap(page, id, '2-still-waiting-20s', { full: false });
    const dialog = page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').first();
    const cancel = (await dialog.count()) ? dialog.locator('button:has-text("Cancel")') : page.locator('button:has-text("Cancel"):visible').last();
    await cancel.click();
    say('declined (Cancel)');
    await waitFor(page, x => has(x, 'post_done') || (x.ended !== null && has(x, 'done')), { timeout: 120000, what: 'approval done' });
    await sleep(2500);
    fs.writeFileSync(path.join(OUT, 'frames', `${id}-after-decline-tasks.json`), JSON.stringify({ taskRowsWithTheTitle: taskRows() }, null, 1));
    await snap(page, id, '3-after-decline');
    await visibleText(page, id, '3-after-decline');
    saveFrames(id, await streams(page));
  },

  // Positive control for the approval check: the same proposal, CONFIRMED by
  // the person, must write the row the declined run did not. Without this the
  // zero counts above could mean "could not have written" as well as "did not".
  async 's4-approval-control'(page, id) {
    await goHome(page);
    await setPolicy(page, 'Auto');
    fs.writeFileSync(path.join(OUT, 'frames', `${id}-before-ask-tasks.json`), JSON.stringify({ taskRowsWithTheTitle: taskRows() }, null, 1));
    await ask(page, 'Create a review task for the BX-512 stability protocol (control run: I will confirm it).');
    await waitFor(page, x => has(x, 'approval_required'), { timeout: 120000, what: 'approval_required' });
    await sleep(1500);
    fs.writeFileSync(path.join(OUT, 'frames', `${id}-while-unanswered-tasks.json`), JSON.stringify({ taskRowsWithTheTitle: taskRows() }, null, 1));
    const dialog = page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').first();
    const confirm = (await dialog.count()) ? dialog.locator('button:has-text("Confirm and run")') : page.locator('button:has-text("Confirm and run"):visible').last();
    await confirm.click();
    say('confirmed (Confirm and run)');
    await waitFor(page, x => has(x, 'post_done') || (x.ended !== null && has(x, 'done')), { timeout: 120000, what: 'control done' });
    await sleep(2500);
    fs.writeFileSync(path.join(OUT, 'frames', `${id}-after-confirm-tasks.json`), JSON.stringify({ taskRowsWithTheTitle: taskRows() }, null, 1));
    await snap(page, id, '1-after-confirm');
    saveFrames(id, await streams(page));
  },

  // S2: Deep research on Home's engine pill; the turn's effort is the pill's.
  // The menu lists each engine by its model word: Deep research is "Maximum".
  async 's2-deep'(page, id) {
    await goHome(page);
    await setPolicy(page, 'Auto');
    const pill = page.locator('button.landing-engine');
    say('pill before:', (await pill.innerText()).replace(/\n/g, ' '));
    await pill.click();
    await sleep(500);
    await snap(page, id, '0-engine-menu', { full: false });
    // What a pointer can reach in the open menu (finding: the composer clips it).
    const hits = await page.evaluate(() =>
      [...document.querySelectorAll('.landing-mode-menu button')].map(b => {
        const r = b.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        const composer = document.querySelector('.landing-composer')?.getBoundingClientRect();
        return {
          option: b.innerText.replace(/\n/g, ' | '),
          optionTop: Math.round(r.top),
          composerTop: composer ? Math.round(composer.top) : null,
          pointerReachesIt: !!hit && (hit === b || b.contains(hit)),
          elementAtItsCentre: hit ? String(hit.className || hit.tagName) : null,
        };
      }),
    );
    fs.writeFileSync(path.join(OUT, 'frames', `${id}-menu-hit-test.json`), JSON.stringify(hits, null, 1));
    await page.locator('.landing-mode-menu button:has-text("Maximum")').click();
    await sleep(500);
    say('pill after:', (await pill.innerText()).replace(/\n/g, ' '));
    await snap(page, id, '1-pill-deep-research', { full: false });
    await ask(page, 'Summarise the Vorelinib IND strategy in depth, please.');
    await waitFor(page, x => has(x, 'post_done') || (x.ended !== null && has(x, 'done')), { timeout: 120000, what: 'deep done' });
    await sleep(2000);
    await snap(page, id, '2-answered');
    saveFrames(id, await streams(page));
    // Back to Standard for later scenarios. "Balanced" is under the clip, so by keyboard.
    await goHome(page);
    await pill.click();
    await sleep(300);
    await page.locator('.landing-mode-menu button:has-text("Balanced")').focus();
    await page.keyboard.press('Enter');
    await sleep(300);
    say('pill restored:', (await pill.innerText()).replace(/\n/g, ' '));
  },
};

// ── Main ─────────────────────────────────────────────────────────────────────

const wanted = process.argv.slice(2);
if (!wanted.length || wanted.some(w => !SCENARIOS[w])) {
  console.error(`usage: drive-e2e.mjs <${Object.keys(SCENARIOS).join('|')}> ...`);
  process.exit(2);
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
try {
  if (!fs.existsSync(STATE)) await signIn(browser);
  for (const id of wanted) {
    say(`── ${id}`);
    const { ctx, page } = await openPage(browser);
    try {
      await SCENARIOS[id](page, id);
      say(`${id}: ran`);
    } catch (err) {
      say(`${id}: FAILED — ${err.message}`);
      await snap(page, id, 'failure').catch(() => {});
      saveFrames(`${id}-failure`, await streams(page).catch(() => []));
      process.exitCode = 1;
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
