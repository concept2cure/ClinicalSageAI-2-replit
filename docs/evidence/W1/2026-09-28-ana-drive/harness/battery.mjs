// End-to-end battery: a real browser, the real app, the strict stand-in model.
// node battery.mjs [scenario ...]   (default: all non-special scenarios)
// Environment (README.md): APP_URL, FAKE_LOG, CHROMIUM_PATH, HARNESS_OUT,
// DATABASE_URL (the two special scenarios only), BATTERY_EMAIL/PASSWORD.
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SP = process.env.HARNESS_OUT || path.join(os.tmpdir(), 'ana-drive-battery');
fsSync.mkdirSync(SP, { recursive: true });
const BASE = process.env.APP_URL || 'http://localhost:5000';
const HOME = `${BASE}/concept2cure`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const psql = sql => execSync(`psql ${JSON.stringify(process.env.DATABASE_URL || '')} -Atc ${JSON.stringify(sql)}`).toString().trim();

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.info(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function login(page) {
  await page.goto(`${BASE}/concept2cure/login?returnTo=%2Fconcept2cure`, { waitUntil: 'domcontentloaded' });
  // The GA demo seed's account (docs/LOCAL_TESTING.md).
  await page.fill('#login-email', process.env.BATTERY_EMAIL || 'jm.smith@concept2cure.pro');
  await page.fill('#login-password', process.env.BATTERY_PASSWORD || 'pass-word');
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(u => !String(u).includes('/login'), { timeout: 30000 });
  await sleep(2500);
}

async function goHome(page) {
  await page.goto(HOME, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('textarea', { timeout: 30000 });
  await sleep(1500);
}

async function ask(page, text) {
  const box = page.locator('textarea:visible').first();
  await box.click();
  await box.fill(text);
  await box.press('Enter');
}

/** Record every distinct path the app shows until `until` holds or timeout. */
async function watchUrls(page, { until, timeout = 45000 }) {
  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const p = new URL(page.url()).pathname;
    if (seen[seen.length - 1] !== p) seen.push(p);
    if (until && (await until(seen))) break;
    await sleep(150);
  }
  return seen;
}

async function stripText(page) {
  return (await page.locator('.ana-drive-strip').allTextContents().catch(() => [])).join(' | ');
}
// What AnA said at each stop reaches the person, each stop in its own
// paragraph. The stand-in narrates a stop as "Stop N: <talking point> …".
function recordNarration(text) {
  const total = Number(/That is the whole demonstration: (\d+) stops/.exec(text)?.[1] ?? 0);
  const said = new Set([...text.matchAll(/Stop (\d+):/g)].map(m => Number(m[1])));
  const unsaid = Array.from({ length: total }, (_, i) => i + 1).filter(k => !said.has(k));
  const runOn = [...text.matchAll(/\S{0,24}\S(?=Stop \d+:|That is the whole demonstration)/g)].map(m => m[0]);
  record('training demo: every stop is narrated in AnA\'s words', total > 0 && unsaid.length === 0, `${total} stops; not narrated: ${unsaid.join(', ') || 'none'}`);
  record('training demo: each round\'s words start their own paragraph', runOn.length === 0, runOn.length ? `run together after: ${runOn.slice(0, 3).map(r => JSON.stringify(r)).join(', ')}` : '');
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}
async function waitIdle(page, timeout = 60000) {
  // The turn is over when no Stop control is offered in any composer. Give the
  // turn a moment to start first, or an early check reads "idle" before it began.
  const stopSel = 'button[aria-label*="Stop" i]:visible, button:has-text("Stop generating"):visible';
  await page.locator(stopSel).first().waitFor({ timeout: 5000 }).catch(() => {});
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const streaming = await page.locator('button[aria-label*="Stop" i]:visible, button:has-text("Stop generating"):visible').count();
    if (!streaming) return true;
    await sleep(300);
  }
  return false;
}

const SCENARIOS = {
  async biostat(page) {
    await goHome(page);
    await ask(page, 'take me to biostatistics');
    const seen = await watchUrls(page, { until: s => s.some(p => p.endsWith('/biostatistics')) });
    await waitIdle(page);
    const text = await bodyText(page);
    await page.screenshot({ path: `${SP}/e2e-biostat.png` });
    record('take me to biostatistics → Biostatistics opens', seen.some(p => p.endsWith('/biostatistics')), seen.join(' → '));
    record('biostat: no tool-missing / error text', !/FAKE:|not offered|Something went wrong/i.test(text));
  },
  async vault(page) {
    await goHome(page);
    await ask(page, 'take me to the vault');
    const seen = await watchUrls(page, { until: s => s.some(p => p.endsWith('/vault')) });
    await waitIdle(page);
    await sleep(1000);
    const text = await bodyText(page);
    await page.screenshot({ path: `${SP}/e2e-vault.png` });
    record('take me to the vault → a program\'s Vault opens', seen.some(p => p.endsWith('/vault')), seen.join(' → '));
    record('vault: a real program is open (no "open a program" state)', /BX-\d{3}|Vorelinib|CV-117|IV-415/.test(text) && !/open a program first|select a program to/i.test(text));
  },
  async openProgram(page) {
    await goHome(page);
    await ask(page, 'open program BX-301');
    const seen = await watchUrls(page, { until: s => s.some(p => p.endsWith('/project-home')) });
    await waitIdle(page);
    await sleep(1000);
    const text = await bodyText(page);
    await page.screenshot({ path: `${SP}/e2e-open-program.png` });
    record('open program BX-301 → its project home', seen.some(p => p.endsWith('/project-home')), seen.join(' → '));
    record('open program: BX-301 is the program shown', /BX-301/.test(text));
  },
  // Acting on a screen the person is not on: the bus heads there and the
  // action arrives while the screen's read is in flight, so the screen holds
  // it until its data settles. Each ask is answered with "Act result: …
  // Screen: …" (the stand-in's planAct). The Inconsistency overlay is
  // project-scoped, so a program is opened first; the design needs the local
  // study design the README names.
  async heldAction(page) {
    await goHome(page);
    await ask(page, 'open program BX-301');
    await watchUrls(page, { until: s => s.some(p => p.endsWith('/project-home')) });
    await waitIdle(page);
    const actResults = async () => [...(await bodyText(page)).matchAll(/Act result:[^\n]*/g)].map(m => m[0]);
    // The next "Act result:" line, read once its turn is over (it streams in).
    const nextResult = async before => {
      for (const t = Date.now(); Date.now() - t < 45000; await sleep(500)) {
        if ((await actResults()).length > before) {
          await waitIdle(page);
          return (await actResults()).pop();
        }
      }
      return '(no answer within 45 s)';
    };
    const selectedText = async sel => (await page.locator(sel).allTextContents().catch(() => [])).join(',');

    let t = Date.now();
    let before = (await actResults()).length;
    await ask(page, 'act inconsistency.set-regulator regulator=EMA');
    const overlaySaid = await nextResult(before);
    const overlayMs = Date.now() - t;
    const overlay = await selectedText('button.gi-reg-b.on');
    await page.screenshot({ path: `${SP}/e2e-held-overlay.png` });
    record(
      "held action: an overlay switch sent from another screen gets the screen's own answer",
      /Screen: /.test(overlaySaid) && !/not confirmed/.test(overlaySaid),
      `${overlaySaid} (overlay ${overlay || 'unchanged'}; answered in ${overlayMs} ms)`,
    );

    t = Date.now();
    before = (await actResults()).length;
    await ask(page, 'act biostatistics.load-design design=Phase 2 dose finding');
    const designSaid = await nextResult(before);
    const designMs = Date.now() - t;
    const loaded = await selectedText('button.sp-row[aria-pressed="true"] .sp-row-t');
    await page.screenshot({ path: `${SP}/e2e-held-design.png` });
    record(
      'held action: a study design named from another screen is loaded',
      loaded === 'Phase 2 dose finding' && /Screen: no report/.test(designSaid),
      `${designSaid} (selected: ${loaded || 'none'}; answered in ${designMs} ms)`,
    );
  },
  async vaultSearch(page) {
    await goHome(page);
    await ask(page, 'search the vault for stability');
    const strips = new Set();
    const seen = await watchUrls(page, {
      timeout: 20000,
      until: async () => { const st = await stripText(page); if (st) strips.add(st); return false; },
    });
    await waitIdle(page);
    const val = await page.locator('input[type="search"], input[placeholder*="Search" i]').evaluateAll(els => els.map(e => e.value));
    const strip = [...strips].join(' || ');
    const empty = /No documents in this project's vault yet/.test(await bodyText(page));
    await page.screenshot({ path: `${SP}/e2e-vault-search.png` });
    record('search the vault for stability → Vault opens', seen.some(p => p.endsWith('/vault')), seen.join(' → '));
    record(
      'vault search: the query is in the search box, or an empty vault is refused out loud',
      empty ? /no documents yet, so there is nothing to search/.test(strip) : val.includes('stability'),
      empty ? `empty vault; strip: ${strip.slice(0, 160)}` : JSON.stringify(val),
    );
  },
  async demo(page) {
    await goHome(page);
    await ask(page, 'give me the training demo');
    let sawDemoStrip = false;
    const seen = await watchUrls(page, {
      timeout: 150000,
      until: async () => {
        if (/AnA is demonstrating/.test(await stripText(page))) sawDemoStrip = true;
        return /That is the whole demonstration/.test(await bodyText(page));
      },
    });
    await page.screenshot({ path: `${SP}/e2e-demo-end.png` });
    const want = ['/projects', '/project-home', '/vault', '/authoring'];
    const missing = want.filter(w => !seen.some(p => p.endsWith(w)));
    record('training demo visits every stop in order', missing.length === 0, `seen: ${seen.join(' → ')}${missing.length ? '  missing: ' + missing.join(',') : ''}`);
    record('training demo shows "AnA is demonstrating"', sawDemoStrip);
    record('training demo reaches its end', /That is the whole demonstration/.test(await bodyText(page)));
    recordNarration(await bodyText(page));
  },
  async salesDemo(page) {
    const fs = await import('node:fs');
    const logAt = fs.statSync((process.env.FAKE_LOG || `${SP}/stand-in.log`)).size;
    await goHome(page);
    await ask(page, 'give me the sales demo');
    const failures = new Set();
    const seen = await watchUrls(page, {
      timeout: 300000,
      until: async () => {
        const st = await stripText(page);
        for (const m of st.matchAll(/Could not[^|]*/g)) failures.add(m[0].trim().slice(0, 160));
        return /That is the whole demonstration/.test(await bodyText(page));
      },
    });
    const log = fs.readFileSync((process.env.FAKE_LOG || `${SP}/stand-in.log`), 'utf8').slice(logAt);
    await page.screenshot({ path: `${SP}/e2e-sales-demo-end.png` });
    const retry = /act_on_screen \{"action":"authoring\.open-document","params":\{[^}]*"title":"(?!Quarterly summary)[^"]+"/.test(log);
    const want = ['/projects', '/project-home', '/authoring', '/submissions'];
    const missing = want.filter(w => !seen.some(p => p.endsWith(w)));
    record('sales demo visits its stops', missing.length === 0, `seen: ${seen.join(' → ')}${missing.length ? '  missing: ' + missing.join(',') : ''}`);
    record('sales demo: a guessed document name is refused with the real titles, and AnA retries with one', retry, [...failures].join(' || ') || 'no refusal seen');
    record('sales demo reaches its end', /That is the whole demonstration/.test(await bodyText(page)));
  },
  async railAsk(page) {
    await page.goto(`${HOME}/projects`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    let box = page.locator('aside textarea:visible').first();
    if (!(await box.count())) {
      await page.keyboard.press('Control+\\');
      await sleep(600);
      box = page.locator('aside textarea:visible').first();
    }
    await box.click();
    await box.fill('take me to biostatistics');
    await box.press('Enter');
    const seen = await watchUrls(page, { until: s => s.some(p => p.endsWith('/biostatistics')) });
    await waitIdle(page);
    await sleep(800);
    const railStill = await page.locator('aside textarea:visible').count();
    const text = await bodyText(page);
    await page.screenshot({ path: `${SP}/e2e-rail.png` });
    record('rail: take me to biostatistics → Biostatistics opens', seen.some(p => p.endsWith('/biostatistics')), seen.join(' → '));
    record('rail: the conversation is still there after the move', railStill > 0 && /Navigation result/.test(text));
  },
  async chipsWhenOff(page) {
    await goHome(page);
    const sw = page.locator('[role="switch"]').first();
    if ((await sw.getAttribute('aria-checked')) === 'true') await sw.click();
    await sleep(300);
    await ask(page, 'take me to biostatistics');
    await waitIdle(page);
    await sleep(800);
    const stayed = new URL(page.url()).pathname;
    const chip = page.locator('button:has-text("Biostatistics")').last();
    await chip.waitFor({ timeout: 30000 }).catch(() => {});
    const hasChip = (await chip.count()) > 0;
    if (hasChip) await chip.click();
    await sleep(1500);
    const after = new URL(page.url()).pathname;
    await page.screenshot({ path: `${SP}/e2e-chips.png` });
    record('drive off: the ask does not move the screen', !stayed.endsWith('/biostatistics'), stayed);
    record('drive off: a Biostatistics chip is offered and works', hasChip && after.endsWith('/biostatistics'), `chip=${hasChip} after=${after}`);
    // Restore the default.
    await goHome(page);
    const sw2 = page.locator('[role="switch"]').first();
    if ((await sw2.getAttribute('aria-checked')) !== 'true') await sw2.click();
  },
  // Needs the fake started with FAKE_SLOW_TOOL=start_product_demo:6000
  async takeoverBeforePromotion(page) {
    await goHome(page);
    const start = new URL(page.url()).pathname;
    await ask(page, 'give me the sales demo');
    // list_demo_scripts round, then start_product_demo is held 6s by the fake.
    await sleep(2500);
    const sw = page.locator('[role="switch"]').first();
    const before = await sw.getAttribute('aria-checked');
    await sw.click(); // the person switches AnA's hands off mid-turn
    await sleep(300);
    const off = await sw.getAttribute('aria-checked');
    let rearmed = false;
    const seen = await watchUrls(page, {
      timeout: 25000,
      until: async () => {
        if (/AnA is demonstrating|AnA is driving/.test(await stripText(page))) rearmed = true;
        return false;
      },
    });
    await page.screenshot({ path: `${SP}/e2e-takeover.png` });
    record('switch-off mid-turn: switch reads off', before === 'true' && off === 'false', `${before} → ${off}`);
    record('switch-off mid-turn: the demo promotion does not re-arm the drive', !rearmed, await stripText(page));
    record('switch-off mid-turn: the screen does not move', seen.every(p => p === start), seen.join(' → '));
    await page.locator('[role="switch"]').first().click();
  },
  // Needs the fake started with FAKE_SLOW_TOOL=start_product_demo:8000
  // Run by name, with the stand-in's FAKE_CUT_OFF=biostat: the answer that
  // follows the move stops halfway at the length limit.
  async cutOff(page) {
    await goHome(page);
    await ask(page, 'take me to biostatistics');
    await watchUrls(page, { timeout: 60000, until: async () => /answer cut off/i.test(await bodyText(page)) });
    await sleep(1500);
    const text = await bodyText(page);
    await page.screenshot({ path: `${SP}/e2e-cut-off.png` });
    record('cut-off answer: the turn says it was cut off', /Stopped: answer cut off/.test(text), (text.match(/Stopped: answer cut off[^\n]*/) || [''])[0]);
    record("cut-off answer: the note says so under the answer", /AnA's answer was cut off before she finished it/.test(text));
    record('cut-off answer: it never reads "Finished"', !/Finished in/.test(text));
  },
  async screenReportChannel(page) {
    await goHome(page);
    await ask(page, 'give me the sales demo');
    await sleep(3000);
    const runId = psql(`select id from ana_runs where status='running' order by created_at desc limit 1`);
    const token = await page.evaluate(() => {
      for (const s of [localStorage, sessionStorage]) for (let i = 0; i < s.length; i++) { const k = s.key(i); const v = s.getItem(k) || ''; if (/^eyJ/.test(v)) return v; try { const o = JSON.parse(v); if (o?.accessToken) return o.accessToken; if (o?.token) return o.token; } catch { /* not JSON: not a token */ } }
      return null;
    });
    const res = await page.evaluate(async ({ runId, token }) => {
      const r = await fetch(`/api/ana-ri/stream/${encodeURIComponent(runId)}/control`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: 'screen_report', message: '[Screen report] Could not open Vault: the screen did not load.' }),
      });
      return { status: r.status, body: await r.text() };
    }, { runId, token });
    await waitIdle(page, 120000);
    const events = psql(`select control_events::text from ana_runs where id='${runId}'`);
    const text = await bodyText(page);
    record('screen_report accepted by the control route', res.status === 200, `${res.status} ${res.body.slice(0, 160)}`);
    record('screen_report is not written as a human control event', !/screen_report|Could not open Vault/.test(events), events.slice(0, 200));
    record('screen_report is not shown as "You steered AnA"', !/You steered AnA[^\n]*Could not open Vault/.test(text));
  },
};

const want = process.argv.slice(2);
const names = want.length ? want : ['biostat', 'vault', 'openProgram', 'heldAction', 'vaultSearch', 'railAsk', 'demo', 'salesDemo', 'chipsWhenOff'];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
if (process.env.TRACE_STREAM) {
  page.on('requestfailed', r => { if (r.url().includes('/api/ana-ri/stream')) console.info('REQUEST FAILED', r.method(), r.url(), r.failure()?.errorText); });
  page.on('request', r => { if (r.url().includes('/api/ana-ri/stream')) console.info('REQUEST', r.method(), r.url()); });
  page.on('response', r => { if (r.url().includes('/api/ana-ri/stream')) console.info('RESPONSE', r.status(), r.url()); });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.info('CONSOLE', m.type(), m.text().slice(0, 300)); });
}
await login(page);
for (const n of names) {
  try { await SCENARIOS[n](page); } catch (e) { record(n, false, `threw: ${String(e).slice(0, 300)}`); await page.screenshot({ path: `${SP}/e2e-${n}-threw.png` }).catch(() => {}); }
}
record('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
const failed = results.filter(r => !r.ok).length;
console.info(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
