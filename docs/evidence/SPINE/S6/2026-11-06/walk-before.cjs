/**
 * S6 2026-11-06, BEFORE: the project's Vault as trunk drew it (f5891e9d), for the founder's
 * "a Vault user interface, files, folders … just like Veeva".
 *
 *   node docs/evidence/SPINE/S6/2026-11-06/walk-before.cjs [base-url]
 *
 * Signs in once (dev-login, Ana Author), opens the seeded IND and 510(k) projects' Vaults, and shoots the
 * header and the filing cabinet. Signs out at the end. Log: ./walk-before.json.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const EMAIL = process.env.WALK_EMAIL || 'ana.author@concept2cure.pro';
const SHOTS = path.join(__dirname, 'screenshots');
const log = { base: BASE, startedAt: new Date().toISOString(), steps: [] };
const step = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };

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
  if (who.status !== 200) throw new Error(`dev-login ${JSON.stringify(who)}`);
  return page.evaluate(async () => {
    const r = await fetch('/api/c2c/projects?limit=100', { headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } });
    return ((await r.json()).data ?? []).map((x) => ({ id: x.id, title: String(x.title ?? x.name ?? '') }));
  });
}

async function signOut(page) {
  await page.evaluate(async () => {
    await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } }).catch(() => undefined);
  });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  try {
    const projects = await signIn(page);
    for (const [tag, re] of [['ind', /C2C-101/], ['510k', /NeuroPanel-Dx/]]) {
      const p = projects.find((x) => re.test(x.title));
      if (!p) throw new Error(`no project ${re}`);
      await page.goto(`${BASE}/concept2cure/vault?program=${p.id}`, { waitUntil: 'networkidle' });
      const cabinet = page.locator('.vd-folder', { hasText: /filing cabinet|Filing binder/ }).first();
      await cabinet.waitFor({ timeout: 60000 });
      await cabinet.click();
      await page.waitForTimeout(800);
      const folders = await page.locator('.vd-folder').allInnerTexts();
      const header = await page.locator('.ph-acts').innerText();
      await page.screenshot({ path: path.join(SHOTS, `before-${tag}-vault.png`) });
      step(`before: ${tag} Vault`, { project: p.title, header, folders: folders.map((f) => f.replace(/\s+/g, ' ').trim()) });
    }
  } finally {
    await signOut(page);
    await browser.close();
    fs.writeFileSync(path.join(__dirname, 'walk-before.json'), JSON.stringify(log, null, 2));
  }
})().catch((e) => { console.error(e); process.exit(1); });
