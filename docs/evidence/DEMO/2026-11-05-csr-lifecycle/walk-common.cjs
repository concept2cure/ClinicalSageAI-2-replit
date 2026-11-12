/**
 * Shared configuration, people, the API helper and the navigation a person uses, for the CSR lifecycle walk
 * (walk.cjs). See walk.cjs for how to run it.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = (process.argv[2] || 'http://127.0.0.1:5200').replace(/\/$/, '');
const DATA = process.argv[3] ? path.resolve(process.argv[3]) : null;
const MODE = process.argv[4] || 'all';
const HERE = __dirname;
/** DEMO_TAG names a separate run (its screenshots are prefixed and its log is walk-<tag>.json), e.g. a diagnostic run. */
const TAG = (process.env.DEMO_TAG || '').replace(/[^a-z0-9-]/gi, '');
const SHOTS = path.join(HERE, 'screenshots');
const PROJECT_TITLE = 'Xanomeline TTS Phase 2 (CDISCPILOT01)';
/** DEMO_CSR_TITLE names another prepared CSR (the Lumen account's LMN-201 report), for the recorders that open it. */
const CSR_TITLE = process.env.DEMO_CSR_TITLE || 'CDISCPILOT01 Clinical Study Report';
const PEOPLE = {
  author: { email: process.env.DEMO_AUTHOR_EMAIL || 'jm.smith@concept2cure.pro', name: 'JM Smith' },
  reviewer: { email: process.env.DEMO_REVIEWER_EMAIL || 'rhea.reviewer@concept2cure.pro', name: 'Rhea Reviewer',
    password: process.env.DEMO_REVIEWER_PASSWORD || process.env.DEMO_SIGNER_PASSWORD },
  approver: { email: process.env.DEMO_APPROVER_EMAIL || 'ava.approver@concept2cure.pro', name: 'Ava Approver',
    password: process.env.DEMO_APPROVER_PASSWORD || process.env.DEMO_SIGNER_PASSWORD },
};
/** The Vault uploads, in the runbook's order; the manifest is written after them (it names their ids and hashes). */
const DATASETS = [['adsl.xpt', 'ADSL'], ['adae.xpt', 'ADAE'], ['adlbc.xpt', 'ADLBC'], ['adlbh.xpt', 'ADLBH'], ['advs.xpt', 'ADVS']];
const DEFINE = 'define.xml';
const EFFICACY = 'cdiscpilot01-efficacy-results.json';
const MANIFEST = 'cdiscpilot01-adam-bundle.json';

const log = { base: BASE, mode: MODE, startedAt: new Date().toISOString(), steps: [], apiErrors: [] };
const state = { file: null, data: {} };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const APPROVE = [...DATASETS.map(([f]) => f), EFFICACY, MANIFEST];
const CSR_ENTRY = 'GLOBAL · Clinical Study Report (CSR)';

function loadState() {
  state.file = path.join(DATA, 'csr-demo-state.json');
  try { state.data = JSON.parse(fs.readFileSync(state.file, 'utf8')); } catch { state.data = {}; }
  state.data.files = state.data.files || {};
}

function saveState() { fs.writeFileSync(state.file, JSON.stringify(state.data, null, 2)); }

/** A screenshot. Subject-level pilot data is never captured: the narrative QC list (subject ids) and any saved
 * narrative text are masked, so a committed screenshot shows titles, counts and statuses only. */
async function shot(page, file) {
  const name = TAG ? `${TAG}-${file}` : file;
  const mask = [page.locator('ul[aria-label="Narrative QC"]'), page.locator('pre[aria-label^="Saved text for §14"], pre[aria-label^="Saved text for §12.3"]')];
  await page.screenshot({ path: path.join(SHOTS, name), mask });
  return `screenshots/${name}`;
}

/** Scroll an element's top to the top of the view (a tall section otherwise lands mid-way). */
const toTop = (locator) => locator.evaluate((e) => e.scrollIntoView({ block: 'start' }));

async function step(name, fn, { critical = false, page = null } = {}) {
  const t0 = Date.now();
  try {
    const detail = (await fn()) || {};
    log.steps.push({ name, outcome: detail.outcome || 'pass', ms: Date.now() - t0, ...detail });
    console.info(`${(detail.outcome || 'pass').padEnd(7)} ${name}`);
    return detail;
  } catch (err) {
    const failShot = page ? await shot(page, `fail-${log.steps.length + 1}.png`).catch(() => null) : null;
    log.steps.push({ name, outcome: 'fail', ms: Date.now() - t0, error: err.message.split('\n')[0], screenshot: failShot });
    console.info(`fail    ${name}: ${err.message.split('\n')[0]}`);
    if (critical) throw err;
    return null;
  }
}

async function signIn(browser, who) {
  const person = PEOPLE[who];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/api/')) log.apiErrors.push(`${who} ${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`);
  });
  await page.goto(BASE + '/');
  const res = await page.evaluate(async (email) => {
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
  }, person.email);
  expect(res.status === 200 && res.email === person.email, `dev-login as ${person.email} (got ${JSON.stringify(res)})`);
  person.page = page;
  return page;
}

/** One JSON call with the person's bearer token, from their own page. */
function apiOnce(page, method, url, body) {
  return page.evaluate(async ([m, u, b]) => {
    const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` },
      body: b === undefined ? undefined : JSON.stringify(b) });
    const text = await r.text();
    try { return { status: r.status, body: JSON.parse(text) }; } catch { return { status: r.status, body: null }; }
  }, [method, url, body]);
}

/** A JSON call, asked again when a dev-server reload destroys the page under it (reads only: a write is never repeated). */
async function api(page, method, url, body) {
  for (let i = 1; ; i++) {
    try { return await apiOnce(page, method, url, body); } catch (err) {
      if (method !== 'GET' || i >= 3) throw err;
      await page.waitForLoadState('networkidle').catch(() => {});
      await sleep(1000);
    }
  }
}

/** Retry a UI action once when the dev server reloads the page under it (Vite reloads on another session's client edit). */
async function retrying(page, fn, tries = 3) {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (err) {
      if (i >= tries) throw err;
      console.info(`        retry ${i}: ${err.message.split('\n')[0]}`);
      await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
    }
  }
}

async function waitFor(fn, ms, every = 2000) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await sleep(every);
  }
}

async function openAuthor(page) {
  await page.goto(`${BASE}/concept2cure/project-home?program=${state.data.programId}`, { waitUntil: 'networkidle' });
  await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Author/ }).click();
}

/** Author → Find or start a document in the editor → More document actions → New document… → M5. Returns the template select. */
async function openNewDocument(page) {
  await openAuthor(page);
  await page.getByRole('button', { name: 'Find or start a document in the editor' }).click();
  await page.waitForURL(/document-authoring/);
  await page.getByRole('button', { name: 'More document actions' }).click();
  await page.getByRole('menuitem', { name: /New document/ }).click();
  const select = page.locator('select:has(option:text("(blank document)"))');
  await select.waitFor();
  await page.getByRole('radio', { name: 'M5', exact: true }).click();
  // The template list loads after the sheet opens ("Loading templates…"); count only once it has loaded.
  await page.getByText(/Loading templates/).waitFor({ state: 'detached', timeout: 60_000 });
  await select.locator('option', { hasText: CSR_ENTRY }).first().waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {});
  return select;
}

/** Every template entry the catalog offers under the CSR's label (F1: there must be one). */
const csrEntries = (select) => select.evaluate((e, label) => [...e.options].filter((o) => o.textContent.trim() === label).map((o) => o.value), CSR_ENTRY);

/** The prepared CSR, opened from the project's Author step, with "Build from the study's data" expanded. */
async function openCsr(page) {
  await openAuthor(page);
  await page.getByRole('button', { name: `Open ${CSR_TITLE}` }).click();
  await page.waitForURL(/document-authoring/);
  const panel = page.locator('details[aria-label="Build from the study’s data"]');
  await panel.waitFor({ timeout: 60_000 });
  if (!(await panel.evaluate((d) => d.open))) await panel.locator('summary').click();
  return panel;
}

/** F1, checked every run: New document → M5 lists the CSR once. The sheet is closed without creating anything. */
async function checkCsrCatalog() {
  const page = PEOPLE.author.page;
  const select = await retrying(page, () => openNewDocument(page));
  const entries = await csrEntries(select);
  const shotPath = await shot(page, '05-new-document-m5-csr-entry.png');
  await page.getByRole('button', { name: 'Cancel' }).last().click();
  return { outcome: entries.length === 1 ? 'pass' : 'fail', csrEntries: entries.length, screenshot: shotPath };
}

/** The file's detail in the project's Vault, with its Versions section open. */
async function openVersions(page, file) {
  await page.goto(`${BASE}/concept2cure/vault?program=${state.data.programId}`, { waitUntil: 'networkidle' });
  await page.getByText(/^Uploads · \d+/).first().click();
  // The visible row: since 2026-11-10 the Library's list stays in the page, hidden, while Uploads shows, so the first
  // match was a hidden copy of the file's name and the click never landed. Every fresh Codespace's CSR study
  // preparation stopped here ("adsl.xpt sent: locator.click: Timeout 30000ms exceeded"; found by `011Dpx…`).
  await page.locator('main').getByText(file, { exact: true }).filter({ visible: true }).first().click();
  const versions = page.locator('aside.vd-detail details', { has: page.locator('summary', { hasText: /^Versions/ }) });
  await versions.waitFor();
  if (!(await versions.evaluate((d) => d.open))) await versions.locator('summary').click();
  return versions;
}

module.exports = {
  chromium, fs, path, crypto, BASE, DATA, MODE, HERE, TAG, SHOTS, PROJECT_TITLE, CSR_TITLE, PEOPLE, DATASETS, DEFINE, EFFICACY, MANIFEST, APPROVE, CSR_ENTRY,
  log, state, expect, sleep, loadState, saveState, shot, toTop, step, signIn, api, retrying, waitFor,
  openAuthor, openNewDocument, csrEntries, openCsr, checkCsrCatalog, openVersions,
};
