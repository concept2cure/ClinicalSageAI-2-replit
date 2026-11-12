/**
 * S6 steps 2 and 3 in the running app (CLAUDE.md RULE 4: opened and used).
 *
 *   node docs/evidence/SPINE/S6/2026-11-06/walk-binders.cjs [base-url]
 *
 * Step 2: each filing's Vault opens on its own binder, first in the tree, read from the filing's outline: a US IND,
 * an NDA, an EU MAA, a 510(k) (eSTAR), an EU MDR and an EU IVDR technical file. The NDA, MAA, MDR and IVDR projects
 * are made through POST /api/c2c/projects when absent (named "S6 binder walk · …").
 * Step 3: in the IND's Vault, a binder folder lists the plan work bound to it; in the project's Plan, a task's CTD
 * binding opens its binder folder in the Vault.
 * Signs out at the end. Log: ./walk-binders.json.
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

const api = (page, method, url, body) => page.evaluate(async ({ method, url, body }) => {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}, { method, url, body });

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
    return r.status;
  }, EMAIL);
  expect(who === 200, `dev-login ${who}`);
}
const projects = async (page) => ((await api(page, 'GET', '/api/c2c/projects?limit=200')).body?.data ?? [])
  .map((x) => ({ id: x.id, title: String(x.title ?? x.name ?? '') }));

const FILINGS = [
  { tag: 'ind', re: /C2C-101/ },
  { tag: 'nda', re: /S6 binder walk · NDA/, make: { programType: 'nda', primaryAgency: 'FDA', productType: 'drug' } },
  { tag: 'maa', re: /S6 binder walk · MAA/, make: { programType: 'maa', primaryAgency: 'EMA', productType: 'drug' } },
  { tag: '510k', re: /NeuroPanel-Dx/ },
  { tag: 'mdr', re: /S6 binder walk · EU MDR/, make: { programType: 'mdr', primaryAgency: 'EU / Notified Body', productType: 'device' } },
  { tag: 'ivdr', re: /S6 binder walk · EU IVDR/, make: { programType: 'ivdr', primaryAgency: 'EU / Notified Body', productType: 'ivd' } },
];

async function ensureProject(page, f, list) {
  const found = list.find((p) => f.re.test(p.title));
  if (found || !f.make) return found;
  const name = f.re.source.replace(/\\/g, '');
  const ws = (await api(page, 'GET', '/api/c2c/projects/intake-workspaces')).body;
  const wsId = (ws?.data ?? ws?.workspaces ?? [])[0]?.id;
  const made = await api(page, 'POST', '/api/c2c/projects', { name, ...f.make, ...(wsId ? { clientWorkspaceId: wsId } : {}) });
  expect(made.status < 300, `made ${name} (${made.status} ${JSON.stringify(made.body).slice(0, 200)})`);
  return { id: made.body?.id ?? made.body?.data?.id, title: name };
}

async function openVault(page, id) {
  await page.goto(`${BASE}/concept2cure/vault?program=${id}`, { waitUntil: 'networkidle' });
  await page.locator('button.vd-folder').first().waitFor({ timeout: 60000 });
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  try {
    await signIn(page);
    const list = await projects(page);
    let ind = null;
    for (const f of FILINGS) {
      const p = await ensureProject(page, f, list);
      expect(p, `a ${f.tag} project`);
      if (f.tag === 'ind') ind = p;
      await openVault(page, p.id);
      const first = (await page.locator('button.vd-folder').first().innerText()).replace(/\s+/g, ' ').trim();
      expect(/^Filing binder/.test(first), `${f.tag}: the tree opens on the binder (${first})`);
      const source = await page.getByTestId('vault-binder-source').innerText().catch(() => '');
      const tops = await page.evaluate(() => [...document.querySelectorAll('button.vd-folder')]
        .filter((b) => b.style.paddingLeft === '24px').map((b) => b.innerText.replace(/\s+/g, ' ').trim()).slice(0, 14));
      await page.screenshot({ path: path.join(SHOTS, `binder-${f.tag}.png`) });
      step(`2. ${f.tag}: the Vault opens on its binder`, { project: p.title, first, source, folders: tops });
    }

    // Step 3a: the IND's Module 3 binder folder lists the plan work bound to it.
    await openVault(page, ind.id);
    await page.locator('button.vd-folder', { hasText: /Module 3/ }).first().click();
    const work = page.getByTestId('vault-plan-work');
    await work.waitFor({ timeout: 30000 });
    const rows = await page.getByTestId('vault-plan-task').allInnerTexts();
    expect(rows.length > 0, 'Module 3 lists plan tasks');
    await work.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, 'plan-work-in-vault.png') });
    step('3a. a binder folder lists the plan work that feeds it', { folder: 'Module 3', tasks: rows.map((r) => r.replace(/\s+/g, ' ')) });

    // Step 3b: in the Plan, a task's CTD binding opens its folder in the Vault.
    await page.goto(`${BASE}/concept2cure/project-home?program=${ind.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Plan/ }).click();
    await page.getByTestId('pj-program-plan').waitFor({ timeout: 30000 });
    for (const d of await page.locator('details.py-ws-row').all()) if (!(await d.evaluate((e) => e.open))) await d.locator('summary').first().click();
    await page.locator('button.py-row-main', { hasText: /drug substance|Drug Substance/i }).first().click();
    const open = page.getByTestId('py-open-vault-folder').first();
    await open.waitFor({ timeout: 15000 });
    await page.screenshot({ path: path.join(SHOTS, 'plan-task-open-in-vault.png') });
    await open.click();
    await page.waitForURL(/\/vault/, { timeout: 30000 });
    await page.locator('.vd-here').waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    const here = (await page.locator('.vd-here').innerText()).replace(/\s+/g, ' ').trim();
    expect(/3\.2\.S/.test(here), `the Vault opened at the task's binder folder (${here})`);
    await page.screenshot({ path: path.join(SHOTS, 'plan-task-folder-in-vault.png') });
    step('3b. a plan task opens its binder folder in the Vault', { breadcrumb: here });
  } finally {
    await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } }).catch(() => undefined)).catch(() => undefined);
    await browser.close();
    fs.writeFileSync(path.join(__dirname, 'walk-binders.json'), JSON.stringify(log, null, 2));
  }
})().catch((e) => { console.error(e); process.exit(1); });
