/**
 * P-111 item 5 in the running app: Quality is a work kind. On C2C-101, a Quality work project is added through the one
 * intake (POST /api/c2c/projects, workKind 'quality'); the Work areas card lists it as "Quality · <owner>" and, where
 * the project offers the Quality area, as a door to it; clicking it opens the Quality area. Then 390 dark.
 * Binding the area to the work project, and its task list, are P-111's later slices; this walk does not claim them.
 *
 *   node docs/evidence/SPINE/S12/2026-11-09-quality-work-kind/walk.cjs [base-url] [programId]
 *
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


/* A Quality work project, through the one intake. Idempotent by name: 201 the first time, 200 after. */
async function ensureQuality(page) {
  const res = await page.evaluate(async (program) => {
    const auth = { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}`, 'Content-Type': 'application/json' };
    const team = await (await fetch(`/api/c2c/projects/${program}/team`, { headers: auth })).json();
    const anchor = team?.data?.project_id ?? team?.project_id;
    const r = await fetch('/api/c2c/projects', { method: 'POST', headers: auth, body: JSON.stringify({ parentProjectId: anchor, name: 'Drug product QA', workKind: 'quality' }) });
    return { status: r.status, anchor, body: await r.json() };
  }, PROGRAM);
  log.requests.push({ post: '/api/c2c/projects (quality)', status: res.status, workKind: res.body?.data?.workKind });
  expect((res.status === 201 || res.status === 200) && res.body?.data?.workKind === 'quality', `the Quality work project is recorded (${JSON.stringify(res)})`);
  return res;
}

async function qualityDoor(card) {
  const door = card.locator('button.pj-work-project-door', { hasText: /Drug product QA/ }).first();
  await door.waitFor({ timeout: 20000 });
  const title = await door.getAttribute('title');
  const words = (await door.textContent()).trim();
  expect(/Quality · /.test(words), `the row names its kind (${words})`);
  expect(/^Open Quality on this project$/.test(title), `the row is a door to Quality (${title})`);
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
    const added = await ensureQuality(page);
    ok('a Quality work project, through the one intake', { status: added.status });
    const card = await openCard(page);
    const { door, title, words } = await qualityDoor(card);
    await door.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, 'quality-door-1440-light.png') });
    ok('the card lists it with its kind, as a door to Quality', { title, words });
    await door.click();
    await page.waitForURL((u) => /\/concept2cure\/quality/.test(u.pathname), { timeout: 20000 });
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => { const m = document.querySelector('main') ?? document.body; return !/Loading…|Loading\.\.\./.test(m.innerText) && m.innerText.trim().length > 80; }, null, { timeout: 45000 });
    const url = page.url().replace(BASE, '');
    await page.screenshot({ path: path.join(SHOTS, 'quality-opened-1440-light.png') });
    ok('clicking it opens the Quality area', { url });
    await ctx.close();
    const small = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const p2 = await small.newPage();
    await signIn(p2, true);
    const c2 = await openCard(p2);
    const d2 = await qualityDoor(c2);
    await d2.door.scrollIntoViewIfNeeded();
    await p2.screenshot({ path: path.join(SHOTS, 'quality-door-390-dark.png') });
    const hScroll = await p2.evaluate(() => { const i = document.querySelector('.page-inner.pj'); return i ? i.scrollWidth - i.clientWidth : null; });
    expect(hScroll === null || hScroll <= 1, `no sideways scroll at 390 (${hScroll})`);
    ok('the same at 390 dark', { hScroll });
    await small.close();
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
