/**
 * P-123 item 2 in the running app (CLAUDE.md RULE 4: opened and used).
 *
 *   node docs/evidence/SPINE/S6/2026-11-10/walk-risk-management.cjs [base-url]
 *
 * In the 510(k) demo project's Vault, the Library's risk management section (D6) reads "When applicable" with the
 * reason (a Special 510(k)) and does not block; the sections the device decides keep the words trunk's rule gives
 * them. Signs out. Log: ./walk-risk-management.json.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const EMAIL = process.env.WALK_EMAIL || 'ana.author@concept2cure.pro';
const SHOTS = path.join(__dirname, 'screenshots');
const log = { base: BASE, startedAt: new Date().toISOString(), steps: [] };
const step = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`, JSON.stringify(detail).slice(0, 500)); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };

const api = (page, url) => page.evaluate(async (url) => {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
}, url);

async function signIn(page) {
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
}

const leaves = (tree) => {
  const out = {};
  const walk = (ns) => { for (const n of ns ?? []) { if (Array.isArray(n.children)) walk(n.children); else if (n.filingSectionKey) out[n.filingSectionKey] = n; } };
  walk(tree);
  return out;
};

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  try {
    await signIn(page);
    const list = (await api(page, '/api/c2c/projects?limit=200')).body?.data ?? [];
    const project = list.find((p) => /NeuroPanel-Dx/.test(String(p.title ?? p.name ?? '')));
    expect(project, 'the 510(k) demo project');
    const vault = await api(page, `/api/c2c/project-vault/${project.id}`);
    expect(vault.status === 200, `vault read ${vault.status}`);
    const byKey = leaves(vault.body.data.tree);
    expect(byKey.D6?.type === 'When applicable', `D6 reads When applicable (${byKey.D6?.type})`);
    expect(!byKey.D6.blocker, 'D6 does not block');
    expect(/Special 510\(k\)/.test(byKey.D6.preview), `D6 says why (${byKey.D6.preview})`);
    step('1. the Library read', Object.fromEntries(['A1', 'D4', 'D6', 'E2', 'E3'].map((k) => [k, { type: byKey[k]?.type, blocker: !!byKey[k]?.blocker }])));

    await page.goto(`${BASE}/concept2cure/vault?program=${project.id}`, { waitUntil: 'networkidle' });
    await page.locator('button.vd-folder').first().waitFor({ timeout: 60000 });
    const open = async (re) => { const b = page.locator('button.vd-folder', { hasText: re }).last(); await b.waitFor({ timeout: 20000 }); await b.click(); await page.waitForTimeout(400); };
    // The binder lists the same headings; the document's outline is the second set, under its own folder.
    const headings = () => page.locator('button.vd-folder', { hasText: /Design, manufa/ }).count();
    if (await headings() < 2) await open(/K510/i);
    expect(await headings() >= 2, 'the 510(k) document outline is open below the binder');
    await open(/Design, manufa/);
    // The document's rows list each section with its word; the binder's headings above share the names.
    const row = page.locator('div, li, button', { hasText: /Benefits, risks and mitigation/ }).filter({ hasText: /When applicable/ }).last();
    await row.waitFor({ timeout: 20000 });
    await row.scrollIntoViewIfNeeded();
    const meta = (await row.innerText()).replace(/\s+/g, ' ').trim();
    expect(/When applicable/.test(meta), `the section's row reads When applicable (${meta})`);
    await page.screenshot({ path: path.join(SHOTS, 'risk-management-when-applicable.png') });
    step('2. opened in the Vault', { row: meta });
  } finally {
    await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } }).catch(() => undefined)).catch(() => undefined);
    await browser.close();
    fs.writeFileSync(path.join(__dirname, 'walk-risk-management.json'), JSON.stringify(log, null, 2));
  }
})().catch((e) => { console.error(e); process.exit(1); });
