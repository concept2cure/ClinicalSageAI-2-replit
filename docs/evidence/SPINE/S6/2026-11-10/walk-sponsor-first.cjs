/**
 * P-107 item 3, in the running app: with no project open, the Vault asks which sponsor first.
 *
 *   node docs/evidence/SPINE/S6/2026-11-10/walk-sponsor-first.cjs [base-url]
 *
 * Ana Author's organisation works for two sponsors in the seeded demo. 1. The Vault with no project open asks which
 * sponsor and lists no project or artifact; 2. choosing one lists only its projects' Vaults, and its governed
 * artifacts are read by one of its projects (sameClientAs); 3. Change sponsor asks again.
 * Signs out at the end. Log: ./walk-sponsor-first.json.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const EMAIL = process.env.WALK_EMAIL || 'ana.author@concept2cure.pro';
const SHOTS = path.join(__dirname, 'screenshots');
const log = { base: BASE, startedAt: new Date().toISOString(), steps: [] };
const step = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  const artifactReads = [];
  page.on('request', (r) => { if (r.url().includes('/api/artifacts-center')) artifactReads.push(r.url().replace(BASE, '')); });
  try {
    await page.goto(BASE + '/');
    const status = await page.evaluate(async (email) => {
      const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const j = await r.json();
      const exp = new Date(Date.now() + 86_400_000).toISOString();
      for (const s of [localStorage, sessionStorage]) {
        s.setItem('trialsage_access_token', j.accessToken);
        s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
        s.setItem('trialsage_token_expiry', exp);
        s.setItem('trialsage_user', JSON.stringify(j.user));
      }
      return r.status;
    }, EMAIL);
    expect(status === 200, `dev-login ${status}`);

    // 1. No project open: which sponsor?
    await page.goto(`${BASE}/concept2cure/vault`, { waitUntil: 'networkidle' });
    const choice = page.getByTestId('vault-sponsor-choice');
    await choice.waitFor({ timeout: 60000 });
    const sponsors = (await choice.locator('.ct-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    expect(sponsors.length > 1, `several sponsors are offered (${sponsors})`);
    expect((await page.getByTestId('vault-project-list').count()) === 0, 'no project is listed before a sponsor is chosen');
    expect((await page.getByTestId('vault-org-artifacts').count()) === 0, 'no artifact is listed before a sponsor is chosen');
    expect(artifactReads.length === 0, `no artifact read was made (${artifactReads})`);
    await page.screenshot({ path: path.join(SHOTS, 'sponsor-1-which.png') });
    step('1. the Vault asks which sponsor; nothing of any sponsor is read or shown', { sponsors });

    // 2. One sponsor: its projects only, its artifacts by one of its projects.
    await choice.getByRole('button', { name: /Show the Vaults of .*Lumen/ }).click();
    const list = page.getByTestId('vault-project-list');
    await list.waitFor({ timeout: 30000 });
    const rows = (await list.locator('.ct-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    expect(rows.length > 0 && rows.every((r) => /Lumen|LMN-/.test(r)), `only Lumen's projects are listed (${rows})`);
    await page.getByTestId('vault-org-artifacts').waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    expect(artifactReads.length > 0 && artifactReads.every((u) => u.includes('sameClientAs=')), `every artifact read names a project of the sponsor (${artifactReads})`);
    await page.screenshot({ path: path.join(SHOTS, 'sponsor-2-one-sponsor.png') });
    step("2. one sponsor: its projects' Vaults, and its artifacts read inside it", { heading: await list.locator('h2').innerText(), projects: rows, artifactReads });

    // 3. Change sponsor asks again.
    await page.getByTestId('vault-sponsor-change').click();
    await choice.waitFor({ timeout: 15000 });
    expect((await page.getByTestId('vault-org-artifacts').count()) === 0, 'the artifacts are gone again');
    step('3. Change sponsor asks again');
  } finally {
    await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } }).catch(() => undefined)).catch(() => undefined);
    await browser.close();
    fs.writeFileSync(path.join(__dirname, 'walk-sponsor-first.json'), JSON.stringify(log, null, 2));
  }
})().catch((e) => { console.error(e); process.exit(1); });
