/**
 * S12 in the running app: a C2C-101 section's Sources rail lists its sources again (the coordinating session's ruling
 * of 2026-11-09). On the local demo stack every section's GET /api/authoring/sections/:id/sources answered 503
 * NATIVE_SOURCE_ACCESS_UNAVAILABLE, because one native Quality source in the organisation could not be verified
 * (route-before.log). Now the section's list is read whatever that one source does.
 *
 *   node docs/evidence/SPINE/S12/2026-11-09-sources-list-survives-unverifiable-native/walk.cjs [base-url] [programId]
 *
 * At 1440 light: the editor opens "2.3 · Quality Overall Summary", section 2.3; More → Sources opens the rail, which
 * lists the section's data-room citations with their states and does not say "Couldn't load this section's sources".
 * Log: ./walk.json; shots: ./screenshots/.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const PROGRAM = process.argv[3];
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
const log = { base: BASE, program: PROGRAM, startedAt: new Date().toISOString(), steps: [] };
const ok = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };

async function signIn(page) {
  await page.goto(BASE + '/');
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) });
    const j = await r.json();
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
      s.setItem('trialsage_token_expiry', new Date(Date.now() + 864e5).toISOString()); s.setItem('trialsage_user', JSON.stringify(j.user));
    }
  });
}

(async () => {
  expect(PROGRAM, 'a program id');
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await signIn(page);
    const read = page.waitForResponse((r) => /\/api\/authoring\/sections\/[^/]+\/sources$/.test(r.url()), { timeout: 60000 });
    await page.goto(`${BASE}/concept2cure/document-authoring?program=${PROGRAM}`, { waitUntil: 'networkidle' });
    await page.getByText('2.3 · Quality Overall Summary', { exact: false }).first().click({ timeout: 60000 });
    await page.getByRole('button', { name: /^2\.3(?![.\d])/ }).first().click({ timeout: 30000 });
    await page.getByTestId('ed-more').click();
    await page.getByTestId('sources-rail-open').click();
    const reply = await read;
    log.read = { status: reply.status() };
    expect(reply.status() === 200, `the section's sources read answers 200 (${reply.status()})`);
    await page.getByText('Drafted from').first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    const rail = (await page.locator('aside.ed-comments').innerText()).replace(/\s+/g, ' ');
    expect(!/Couldn’t load this section’s sources/.test(rail), 'the rail does not say it could not load');
    const listed = (rail.match(/cited /g) || []).length;
    expect(listed > 0, `the rail lists the section's citations (${rail.slice(0, 300)})`);
    await page.screenshot({ path: path.join(SHOTS, 'sources-rail-2.3-1440-light.png') });
    ok('section 2.3\'s Sources rail lists its citations with their states', { listed, superseded: (rail.match(/replaced since cited/g) || []).length });
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
