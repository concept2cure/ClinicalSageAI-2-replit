/**
 * S12 gap 5, slice 1, in the running app: beside the work projects, the filing's sections drafted from the Vault, each
 * current or replaced since cited, unattributed to a work project (the coordinating session's ruling, 2026-11-09).
 *
 *   node docs/evidence/SPINE/S12/2026-11-09-program-map-slice-1/walk.cjs [base-url] [programId]
 *
 * C2C-101's local database holds a Vault-drafted section from ../2026-11-09-editor-rail-vault-replaced/walk.cjs's seed
 * (that README says what is seeded and why). At 1440 light and 390 dark: Project knowledge's Work areas card shows its
 * work projects and, under them, "Drafted from the Vault" with each section's standing in words, and says which work
 * project produced each version is not recorded yet. Log: ./walk.json; shots: ./screenshots/.
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

async function theMap(page, shot) {
  const card = await openCard(page);
  const map = card.getByTestId('pj-vault-feeds');
  await map.waitFor({ timeout: 30000 });
  await map.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, shot) });
  return (await map.innerText()).replace(/\s+/g, ' ');
}

(async () => {
  expect(PROGRAM, 'a program id');
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await signIn(page, false);
    const text = await theMap(page, 'map-1440-light.png');
    expect(/drafted from Vault versions/.test(text) && /not recorded yet/.test(text), `the map names the Vault-fed sections and says they are unattributed (${text.slice(0, 300)})`);
    expect(/replaced since cited; v\d.*is approved|· current/.test(text), 'each section says its standing');
    ok('beside the work projects, the filing\'s Vault-fed sections with their standing, unattributed', { text: text.slice(0, 600) });
    const small = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
    await signIn(small, true);
    await theMap(small, 'map-390-dark.png');
    const hScroll = await small.evaluate(() => { const i = document.querySelector('.page-inner.pj'); return i ? i.scrollWidth - i.clientWidth : null; });
    expect(hScroll === null || hScroll <= 1, `no sideways scroll at 390 (${hScroll})`);
    ok('the same at 390 dark', { hScroll });
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
