/**
 * S6, 2026-11-10 in the running app: a person's folder is moved and removed, and a folder that holds a file is not.
 *
 *   node docs/evidence/SPINE/S6/2026-11-06/walk-folder-moves.cjs [base-url]
 *
 * In the CSR study's Vault (after walk-folders.cjs, which leaves a "Pivotal study CDISCPILOT01 …" folder holding
 * adsl.xpt under 5.3): 1. Remove is refused for that folder, naming what it holds; 2. a new folder is made in 5.3,
 * 3. moved to Module 4, 4. removed. Signs out at the end. Log: ./walk-folder-moves.json.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const EMAIL = process.env.WALK_EMAIL || 'ana.author@concept2cure.pro';
const SHOTS = path.join(__dirname, 'screenshots');
const RUN = new Date().toISOString().slice(11, 19).replace(/:/g, '');
const log = { base: BASE, startedAt: new Date().toISOString(), steps: [] };
const step = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };
const folderButton = (page, re) => page.locator('button.vd-folder', { hasText: re }).first();
const reason = (page, text) => page.getByTestId('vault-folder-reason').fill(text);

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  try {
    await page.goto(BASE + '/');
    const projects = await page.evaluate(async (email) => {
      const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const j = await r.json();
      const exp = new Date(Date.now() + 86_400_000).toISOString();
      for (const s of [localStorage, sessionStorage]) {
        s.setItem('trialsage_access_token', j.accessToken);
        s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
        s.setItem('trialsage_token_expiry', exp);
        s.setItem('trialsage_user', JSON.stringify(j.user));
      }
      const p = await fetch('/api/c2c/projects?limit=200', { headers: { Authorization: `Bearer ${j.accessToken}` } });
      return ((await p.json()).data ?? []).map((x) => ({ id: x.id, title: String(x.title ?? x.name ?? '') }));
    }, EMAIL);
    const program = projects.find((p) => /CDISCPILOT01/.test(p.title));
    expect(program, 'the CSR study project');
    await page.goto(`${BASE}/concept2cure/vault?program=${program.id}`, { waitUntil: 'networkidle' });
    await folderButton(page, /Filing binder/).waitFor({ timeout: 60000 });

    // 1. A folder that holds a file is not removed.
    // The one that holds adsl.xpt: its count reads n/1, where an empty one reads 0/0.
    await folderButton(page, /Pivotal study CDISCPILOT01[\s\S]*\/1\s*$/).click();
    await page.getByTestId('vault-remove-folder').click();
    await reason(page, 'Trying to remove a folder that holds a file.');
    await page.getByTestId('vault-folder-save').click();
    const refused = await page.getByTestId('vault-folder-error').innerText();
    expect(/holds 1 document/.test(refused), `refused, naming what it holds (${refused})`);
    await page.screenshot({ path: path.join(SHOTS, 'moves-1-remove-refused.png') });
    await page.getByRole('button', { name: 'Cancel' }).click();
    step('1. Remove is refused for a folder holding a file', { message: refused });

    // 2. A new folder in 5.3.
    const name = `Working copies ${RUN}`;
    await folderButton(page, /^\s*5\.3\s+Clinical study reports/).click();
    await page.getByTestId('vault-new-folder-button').click();
    await page.getByTestId('vault-folder-name').fill(name);
    await reason(page, 'A place for working copies during the walk.');
    await page.getByTestId('vault-folder-save').click();
    await folderButton(page, new RegExp(name)).waitFor({ timeout: 20000 });
    step('2. A folder made in 5.3', { name });

    // 3. Moved to Module 4.
    await page.getByTestId('vault-move-folder').click();
    const parent = page.getByTestId('vault-folder-parent');
    expect((await parent.inputValue()) === 'bn:5.3', 'Move opens on where the folder is');
    await parent.selectOption('bn:M4');
    await reason(page, 'It belongs with the nonclinical reports.');
    await page.screenshot({ path: path.join(SHOTS, 'moves-2-move-form.png') });
    await page.getByTestId('vault-folder-save').click();
    await page.waitForTimeout(1500);
    const inM4 = await page.evaluate((n) => {
      const all = [...document.querySelectorAll('button.vd-folder')];
      const i = all.findIndex((b) => b.innerText.includes(n));
      const pad = (b) => parseInt(b.style.paddingLeft, 10);
      for (let k = i - 1; k >= 0; k -= 1) if (pad(all[k]) < pad(all[i])) return all[k].innerText.replace(/\s+/g, ' ').trim();
      return null;
    }, name);
    expect(/Module 4/.test(inM4 ?? ''), `the folder now sits in Module 4 (${inM4})`);
    await page.screenshot({ path: path.join(SHOTS, 'moves-3-moved.png') });
    step('3. Moved to Module 4', { parent: inM4 });

    // 4. Removed, empty.
    await page.getByTestId('vault-remove-folder').click();
    await reason(page, 'Made for the walk; it is empty.');
    await page.getByTestId('vault-folder-save').click();
    await page.waitForTimeout(1500);
    expect((await page.locator('button.vd-folder', { hasText: new RegExp(name) }).count()) === 0, 'the folder is gone from the tree');
    const here = (await page.locator('.vd-here').innerText()).replace(/\s+/g, ' ').trim();
    await page.screenshot({ path: path.join(SHOTS, 'moves-4-removed.png') });
    step('4. Removed; the list returns to the folder it was in', { breadcrumb: here });
  } finally {
    await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } }).catch(() => undefined)).catch(() => undefined);
    await browser.close();
    fs.writeFileSync(path.join(__dirname, 'walk-folder-moves.json'), JSON.stringify(log, null, 2));
  }
})().catch((e) => { console.error(e); process.exit(1); });
