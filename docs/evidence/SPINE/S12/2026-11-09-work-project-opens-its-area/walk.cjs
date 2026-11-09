/**
 * S12 in the running app: a work project opens on its work area (P-83 (b); the S12 inventory's gap 2).
 *
 *   node docs/evidence/SPINE/S12/2026-11-09-work-project-opens-its-area/walk.cjs [base-url] [programId]
 *
 * On the project page's Work areas card, a CMC work project is a door: clicking it opens CMC / Module 3 on the same
 * project. A nonclinical work project (added through the one intake for this walk) has no work area: it is no door,
 * and its row says so. Captured at 1440 light and 390 dark. Log: ./walk.json; shots: ./screenshots/.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const PROGRAM = process.argv[3];
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
const log = { base: BASE, program: PROGRAM, startedAt: new Date().toISOString(), steps: [], requests: [] };
const ok = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };

async function signIn(page, dark) {
  await page.goto(BASE + '/');
  await page.evaluate(async (dark) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) });
    const j = await r.json();
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
      s.setItem('trialsage_token_expiry', new Date(Date.now() + 864e5).toISOString()); s.setItem('trialsage_user', JSON.stringify(j.user));
    }
    localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark }));
  }, dark);
}

async function openCard(page) {
  await page.goto(`${BASE}/concept2cure/project-home?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  const card = page.getByTestId('pj-work-projects');
  await card.waitFor({ timeout: 30000 });
  await page.waitForFunction(() => !/Reading this project/.test(document.querySelector('[data-testid="pj-work-projects"]')?.textContent ?? ''), null, { timeout: 20000 });
  await card.scrollIntoViewIfNeeded();
  return card;
}

/* A nonclinical work project, through the one intake, so the card has a kind with no work area. Idempotent by name. */
async function ensureNonclinical(page) {
  const res = await page.evaluate(async (program) => {
    const auth = { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}`, 'Content-Type': 'application/json' };
    const team = await (await fetch(`/api/c2c/projects/${program}/team`, { headers: auth })).json().catch(() => null);
    const anchor = team?.data?.project_id ?? team?.project_id ?? null;
    if (!anchor) return { status: 0, anchor };
    const r = await fetch('/api/c2c/projects', { method: 'POST', headers: auth, body: JSON.stringify({ parentProjectId: anchor, name: 'Nonclinical tox package', workKind: 'nonclinical' }) });
    return { status: r.status, anchor };
  }, PROGRAM);
  log.requests.push({ nonclinical: res });
  expect(res.status === 201 || res.status === 200, `the nonclinical work project is recorded (${JSON.stringify(res)})`);
}

async function doorsAndPlainRow(page, card) {
  const door = card.locator('button.pj-work-project-door', { hasText: /Drug substance CMC/ }).first();
  await door.waitFor({ timeout: 20000 });
  const title = await door.getAttribute('title');
  expect(title === 'Open CMC / Module 3 on this project', `the CMC row is a door to CMC (${title})`);
  const plain = card.locator('li', { hasText: 'Nonclinical tox package' });
  expect(await plain.locator('button').count() === 0, 'the nonclinical row is no door');
  const words = (await plain.textContent()).trim();
  expect(/No work area for this kind yet/.test(words), `the nonclinical row says it has no work area (${words})`);
  return { door, title, words };
}

(async () => {
  expect(PROGRAM, 'a program id');
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await signIn(page, false);
    await ensureNonclinical(page);
    const card = await openCard(page);
    const { door, title, words } = await doorsAndPlainRow(page, card);
    await page.screenshot({ path: path.join(SHOTS, 'card-1440-light.png') });
    ok('the CMC work project is a door, and the nonclinical one says it has no work area', { title, nonclinical: words });
    await door.click();
    await page.waitForURL((u) => /\/concept2cure\/cmc/.test(u.pathname), { timeout: 20000 });
    await page.waitForLoadState('networkidle');
    /* The CMC screen itself, not its loading line. */
    await page.waitForFunction(() => { const m = document.querySelector('main') ?? document.body; return !/Loading…|Loading\.\.\./.test(m.innerText) && m.innerText.trim().length > 80; }, null, { timeout: 45000 });
    const url = page.url().replace(BASE, '');
    const shell = await page.evaluate(() => document.body.innerText.slice(0, 400));
    expect(url.includes(PROGRAM) || /C2C-101/.test(shell), `CMC opened on the same project (${url})`);
    await page.screenshot({ path: path.join(SHOTS, 'cmc-opened-1440-light.png') });
    ok('clicking it opens CMC / Module 3 on the same project', { url });
    await ctx.close();
    const small = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const p2 = await small.newPage();
    await signIn(p2, true);
    const c2 = await openCard(p2);
    await doorsAndPlainRow(p2, c2);
    await p2.screenshot({ path: path.join(SHOTS, 'card-390-dark.png') });
    const hScroll = await p2.evaluate(() => { const i = document.querySelector('.page-inner.pj'); return i ? i.scrollWidth - i.clientWidth : null; });
    expect(hScroll <= 1, `no sideways scroll at 390 (${hScroll})`);
    ok('the card at 390 dark', { hScroll });
    await small.close();
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
