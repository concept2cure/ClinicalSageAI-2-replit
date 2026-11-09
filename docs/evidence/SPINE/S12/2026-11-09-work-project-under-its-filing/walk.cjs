/**
 * S12 slice 2 in the running app: a work project is added from the project page's Work areas card, and listed.
 *
 *   node docs/evidence/SPINE/S12/2026-11-09-work-project-under-its-filing/walk.cjs [base-url] [programId]
 *
 * At 1440 light: Project knowledge's Work areas card lists "Work projects"; "Add a work project" opens D0's form;
 * a CMC work project is added by name through the one project intake (POST /api/c2c/projects with its parent and
 * kind) and listed (GET /api/project-hierarchy/:anchor/children). Then the
 * card is captured at 1440 dark and 390 light and dark. The name carries the run's time, so each run adds its own.
 * Log: ./walk.json; shots: ./screenshots/.
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

async function addOne(page, card, name) {
  await card.getByRole('button', { name: /Add a work project/ }).click();
  await page.getByLabel(/Kind of work/).selectOption('cmc');
  await page.getByLabel(/^Name/).fill(name);
  await page.screenshot({ path: path.join(SHOTS, 'add-form-1440-light.png') });
  const posted = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/c2c\/projects$/.test(r.url()));
  await page.getByRole('button', { name: 'Add work project' }).click();
  const res = await posted;
  log.requests.push({ post: res.url().replace(BASE, ''), status: res.status(), body: await res.json() });
  expect(res.status() === 201, `the work project is added (${res.status()})`);
  /* The list's own row, not the toast (which also names it): the card reads again after the add, without a reload. */
  await card.locator('.pj-work-project-n', { hasText: name }).waitFor({ timeout: 20000 });
}

async function captureCard(browser, width, dark) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, hasTouch: width === 390 });
  const page = await ctx.newPage();
  await signIn(page, dark);
  const card = await openCard(page);
  const shot = `card-${width}-${dark ? 'dark' : 'light'}.png`;
  await page.screenshot({ path: path.join(SHOTS, shot) });
  const facts = await page.evaluate(() => {
    const inner = document.querySelector('.page-inner.pj');
    return { hScroll: inner ? inner.scrollWidth - inner.clientWidth : null, text: document.querySelector('[data-testid="pj-work-projects"]')?.textContent?.slice(0, 200) };
  });
  if (width === 390) expect(facts.hScroll <= 1, `no sideways scroll at 390 (${facts.hScroll})`);
  ok(`the card at ${width} ${dark ? 'dark' : 'light'}`, { shot: `screenshots/${shot}`, ...facts });
  await ctx.close();
  return card;
}

(async () => {
  expect(PROGRAM, 'a program id');
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('response', (r) => { if (r.url().includes('/api/project-hierarchy/') || /\/api\/c2c\/projects$/.test(r.url())) log.requests.push({ [r.request().method()]: r.url().replace(BASE, ''), status: r.status() }); });
    await signIn(page, false);
    const card = await openCard(page);
    const name = `Drug substance CMC ${new Date().toISOString().slice(0, 16)}`;
    await addOne(page, card, name);
    await page.screenshot({ path: path.join(SHOTS, 'added-1440-light.png') });
    ok('a CMC work project is added from the Work areas card and listed', { name });
    await ctx.close();
    for (const [width, dark] of [[1440, true], [390, false], [390, true]]) await captureCard(browser, width, dark);
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
