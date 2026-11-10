/**
 * Showcase sweep at trunk head (2026-11-10): what a presenter would hit, screen by screen.
 *
 *   node docs/evidence/DEMO/2026-11-10-showcase-sweep/sweep.cjs [base-url]
 *
 * One dev-login (the presenter), 1440x900. For every project the presenter can open: the project page, each of
 * its six journey stages, and each rail destination opened from the rail with that project in context. Then the
 * rail with the first project only, at 390 wide, for sideways scroll. At each stop it records: API responses
 * >= 400, console and page errors, visible error wording, whether the page scrolls sideways, and a screenshot.
 * Nothing is typed into the address bar after a project is opened except the project's own link.
 * Writes ./sweep.json and ./screens/. Signs out at the end.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const EMAIL = process.env.DEMO_SEED_EMAIL || 'ana.author@concept2cure.pro';
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screens');
const STAGES = ['Plan', 'Evidence', 'Author', 'Review', 'Submit', 'Respond'];
const RAIL = ['Home', 'Tasks', 'Communication', 'Vault', 'Submission Center', 'CMC / Module 3', 'Biostatistics', 'Risk-based monitoring', 'Quality', 'Reporting & analytics'];
const ERR_WORDS = /couldn.t load|could not be (read|loaded|listed)|failed to (load|fetch)|fetch failed|something went wrong|did not load|unexpected error|internal server error|is not a function|undefined|\bNaN\b|\[object Object\]/i;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

const out = { base: BASE, startedAt: new Date().toISOString(), stops: [] };

async function signIn(page) {
  await page.goto(BASE + '/');
  const who = await page.evaluate(async (email) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const j = await r.json();
    const exp = new Date(Date.now() + 86_400_000).toISOString();
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', j.accessToken);
      s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
      s.setItem('trialsage_token_expiry', exp);
      s.setItem('trialsage_user', JSON.stringify(j.user));
    }
    return { status: r.status, email: j.user?.email ?? null };
  }, EMAIL);
  if (who.status !== 200) throw new Error(`dev-login answered ${who.status}`);
}

/** Something on a stop a person should look at: it failed, a 5xx, a console error, error wording, sideways scroll. */
function flagged(r) {
  return Boolean(r.error || r.sideways || r.consoleErrors.length || r.errorText.length || r.apiFailures.some((f) => /^5/.test(f)));
}

/** One line per stop, with only what it has to say. */
function report(r) {
  const parts = [
    r.error ? `ERROR ${r.error}` : '',
    r.apiFailures.length ? `api ${r.apiFailures.join('; ').slice(0, 200)}` : '',
    r.consoleErrors.length ? `console ${r.consoleErrors.length}` : '',
    r.errorText.length ? `text ${JSON.stringify(r.errorText).slice(0, 200)}` : '',
    r.sideways ? 'SIDEWAYS' : '',
  ].filter(Boolean);
  console.info([`${flagged(r) ? 'LOOK' : 'ok  '} ${r.stop}`, ...parts].join(' | '));
}

/** What the page says and whether it scrolls sideways. */
async function readPage(page) {
  const errorText = await page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    return [...document.querySelectorAll('[role="alert"], .es-title, .empty-title, .scaf-note, p, span, div')]
      .filter((el) => el.children.length === 0 && re.test(el.textContent || '') && el.getBoundingClientRect().height > 0)
      .map((el) => el.textContent.trim().slice(0, 180)).slice(0, 5);
  }, ERR_WORDS.source);
  const sideways = await page.evaluate(() => document.scrollingElement.scrollWidth > window.innerWidth + 1);
  return { errorText, sideways };
}

async function stop(page, name, watch, act) {
  const before = { net: watch.net.length, cons: watch.cons.length };
  const r = { stop: name, errorText: [], sideways: false };
  try {
    await act();
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    r.url = page.url().replace(BASE, '');
    Object.assign(r, await readPage(page));
  } catch (e) {
    r.error = String((e && e.message) || e).split('\n')[0].slice(0, 240);
  }
  r.apiFailures = watch.net.slice(before.net);
  r.consoleErrors = watch.cons.slice(before.cons).slice(0, 6);
  // The depth pass keeps a screenshot only where there is something to look at.
  if (process.env.DEPTH !== 'tabs' || process.env.PICK || flagged(r)) {
    await page.screenshot({ path: path.join(SHOTS, `${slug(name)}${r.error ? '-ERR' : ''}.png`) }).catch(() => undefined);
  }
  out.stops.push(r);
  report(r);
}

function watcher(page) {
  const net = []; const cons = [];
  page.on('response', (res) => { const u = res.url(); if (u.includes('/api/') && res.status() >= 400) net.push(`${res.status()} ${res.request().method()} ${u.replace(BASE, '').slice(0, 140)}`); });
  page.on('console', (m) => { if (m.type() === 'error') cons.push(m.text().slice(0, 220)); });
  page.on('pageerror', (e) => cons.push('PAGEERROR ' + String(e).slice(0, 220)));
  return { net, cons };
}

const openProject = (page, id) => page.goto(`${BASE}/concept2cure/project-home?program=${id}`, { waitUntil: 'domcontentloaded' });
const rail = (page, label) => page.getByRole('navigation').getByRole('button', { name: label, exact: true }).or(page.getByRole('navigation').getByRole('link', { name: label, exact: true })).first();

/**
 * DEPTH=tabs: inside the screens. For one project of each kind (the first whose title matches each of PICK): every
 * tab of every rail destination, clicked in turn, and every document the Author stage lists, opened in the editor.
 * Writes ./sweep-tabs.json; screenshots only for a stop with something to look at.
 */
/* One project of each kind; PICK=<text>[,<text>] names others (PICK=C2C-201 for the small-molecule CMC project). */
const PICK = process.env.PICK ? process.env.PICK.split(',').map((t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) : [/C2C-101/, /LMN-801/, /NeuroPanel/, /CDISCPILOT01/];
async function depth(page, watch, listed) {
  for (const p of PICK.map((re) => listed.find((x) => re.test(x.name))).filter(Boolean)) {
    const tag = slug(p.name).slice(0, 22);
    for (const label of RAIL.filter((l) => l !== 'Home')) {
      await openProject(page, p.id);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await rail(page, label).click({ timeout: 15000 }).catch(() => undefined);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      await page.waitForTimeout(2000);
      const tabs = await page.getByRole('tab').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height > 0 && !e.disabled).map((e) => e.textContent.trim()).slice(0, 14));
      for (const [i, name] of tabs.entries()) {
        await stop(page, `${tag} ${label} tab ${name.replace(/\s*·.*$/, '')}`, watch, async () => {
          await page.getByRole('tab').filter({ hasText: name }).first().click({ timeout: 10000 });
        });
        void i;
      }
    }
    // Every document the Author stage offers, opened in the editor.
    await openProject(page, p.id);
    await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Author/ }).click({ timeout: 15000 }).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    const docs = await page.getByRole('button', { name: /^Open / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.textContent.trim()).filter((t) => /^Open /.test(t)).slice(0, 8));
    for (const doc of docs) {
      await stop(page, `${tag} editor ${doc.replace(/^Open /, '')}`, watch, async () => {
        await openProject(page, p.id);
        await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Author/ }).click({ timeout: 15000 });
        await page.getByRole('button', { name: doc, exact: true }).first().click({ timeout: 15000 });
        await page.waitForURL(/document-authoring/, { timeout: 30000 });
      });
    }
  }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const watch = watcher(page);
    await signIn(page);
    const listed = await page.evaluate(async () => {
      const r = await fetch('/api/c2c/projects', { headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } });
      const j = await r.json();
      return (j.projects ?? j.data ?? j).map((p) => ({ id: p.id, name: p.name ?? p.title }));
    });
    out.projects = listed;
    if (process.env.DEPTH === 'tabs') { await depth(page, watch, listed); return; }
    await stop(page, 'home', watch, () => page.goto(BASE + '/concept2cure', { waitUntil: 'domcontentloaded' }));
    await stop(page, 'projects', watch, () => page.goto(BASE + '/concept2cure/projects', { waitUntil: 'domcontentloaded' }));
    for (const p of listed) {
      const tag = slug(p.name).slice(0, 26);
      await stop(page, `${tag} project`, watch, () => openProject(page, p.id));
      for (const stage of STAGES) {
        await stop(page, `${tag} stage ${stage}`, watch, async () => {
          await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: new RegExp(`^${stage}`) }).click({ timeout: 15000 });
        });
      }
      for (const label of RAIL) {
        await stop(page, `${tag} rail ${label}`, watch, async () => {
          await openProject(page, p.id);
          await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
          await rail(page, label).click({ timeout: 15000 });
        });
      }
    }
    await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } }).catch(() => undefined); });
    await context.close();
    out.ok = true;
  } catch (e) {
    out.ok = false; out.error = String(e && e.stack || e);
    console.error(out.error);
    process.exitCode = 1;
  } finally {
    out.finishedAt = new Date().toISOString();
    const look = out.stops.filter(flagged);
    out.summary = { stops: out.stops.length, toLookAt: look.length, serverErrors: out.stops.reduce((n, r) => n + r.apiFailures.filter((f) => /^5/.test(f)).length, 0) };
    fs.writeFileSync(path.join(HERE, process.env.DEPTH === 'tabs' ? `sweep-tabs${process.env.PICK ? '-' + slug(process.env.PICK) : ''}.json` : 'sweep.json'), JSON.stringify(out, null, 2) + '\n');
    console.info(JSON.stringify(out.summary));
    await browser.close();
  }
})();
