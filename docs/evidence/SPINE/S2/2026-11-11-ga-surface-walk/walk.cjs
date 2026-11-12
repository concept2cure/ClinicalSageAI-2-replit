/**
 * The data catalog as a person reaches and uses it, at trunk head (S2, 2026-11-11, for GA).
 *
 *   node walk.cjs [base-url]      env WALK_EMAIL (default the Lumen lead), WIDTH (default 1440), PICK (default LMN-201)
 *
 * Every step is a click a person makes; nothing is typed into the address bar after the project is opened.
 * Each step records API responses >= 400, console errors and what the page showed. Writes walk-<width>.json and
 * shots/<width>-*.png. Signs out at the end.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const EMAIL = process.env.WALK_EMAIL || 'lumen.lead@lumen-demo.example';
const WIDTH = Number(process.env.WIDTH || 1440);
const PICK = new RegExp(process.env.PICK || 'LMN-201');
const SHOTS = path.join(__dirname, 'shots');
const out = { base: BASE, email: EMAIL, width: WIDTH, at: new Date().toISOString(), steps: [] };

async function step(page, watch, name, act) {
  const before = { net: watch.net.length, cons: watch.cons.length };
  const r = { step: name };
  try { r.saw = await act(); } catch (e) { r.error = String((e && e.message) || e).split('\n')[0].slice(0, 300); }
  await page.waitForTimeout(600);
  r.api = watch.net.slice(before.net); r.console = watch.cons.slice(before.cons).slice(0, 5);
  r.sideways = await page.evaluate(() => document.scrollingElement.scrollWidth > window.innerWidth + 1).catch(() => null);
  const file = `${WIDTH}-${String(out.steps.length + 1).padStart(2, '0')}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}.png`;
  await page.screenshot({ path: path.join(SHOTS, file) }).catch(() => undefined);
  out.steps.push(r);
  console.info(`${r.error || r.api.length || r.console.length || r.sideways ? 'LOOK' : 'ok  '} ${name}${r.error ? ' | ERROR ' + r.error : ''}${r.api.length ? ' | api ' + r.api.join('; ').slice(0, 220) : ''}${r.console.length ? ' | console ' + r.console.length : ''}${r.sideways ? ' | SIDEWAYS' : ''} | ${JSON.stringify(r.saw ?? null).slice(0, 260)}`);
}
const entries = (page) => page.getByTestId('data-room-entry');
/* Wait as a person does: until the list stops saying it is loading (up to 45 s), and say how long that took. */
const settle = async (page) => {
  const t = Date.now();
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
  await page.waitForFunction(() => !document.querySelector('.pf-list[aria-busy="true"]'), null, { timeout: 45000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  return Date.now() - t;
};

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: WIDTH, height: WIDTH < 600 ? 844 : 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const watch = { net: [], cons: [] };
    page.on('response', (res) => { const u = res.url(); if (u.includes('/api/') && res.status() >= 400) watch.net.push(`${res.status()} ${res.request().method()} ${u.replace(BASE, '').slice(0, 130)}`); });
    page.on('console', (m) => { if (m.type() === 'error') watch.cons.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => watch.cons.push('PAGEERROR ' + String(e).slice(0, 200)));
    await page.goto(BASE + '/');
    const who = await page.evaluate(async (email) => {
      const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const j = await r.json(); const exp = new Date(Date.now() + 86_400_000).toISOString();
      for (const s of [localStorage, sessionStorage]) { s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
        s.setItem('trialsage_token_expiry', exp); s.setItem('trialsage_user', JSON.stringify(j.user)); }
      const p = await (await fetch('/api/c2c/projects', { headers: { Authorization: `Bearer ${j.accessToken}` } })).json();
      return (p.projects ?? p.data ?? p).map((x) => ({ id: x.id, name: x.name ?? x.title }));
    }, EMAIL);
    const project = who.find((p) => PICK.test(p.name)); out.project = project; out.projects = who.length;
    const nav = page.getByRole('navigation');
    const railVault = () => nav.getByRole('button', { name: 'Vault', exact: true }).or(nav.getByRole('link', { name: 'Vault', exact: true })).first();

    await step(page, watch, 'Project page', async () => {
      await page.goto(`${BASE}/concept2cure/project-home?program=${project.id}`, { waitUntil: 'domcontentloaded' }); await settle(page);
      return { catalogButton: await page.getByTestId('open-data-catalog').count() };
    });
    await step(page, watch, 'Project page: Open the data catalog', async () => {
      await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Evidence/ }).click({ timeout: 15000 }).catch(() => undefined);
      await page.getByTestId('open-data-catalog').first().click({ timeout: 15000 }); await settle(page);
      await entries(page).first().waitFor({ timeout: 30000 });
      return { url: page.url().replace(BASE, ''), selectedTab: await page.getByRole('tab', { selected: true }).first().textContent().catch(() => null), rows: await entries(page).count() };
    });
    await step(page, watch, 'Catalog: what a row says', async () => {
      const first = entries(page).first();
      const rows = await entries(page).evaluateAll((els) => els.slice(0, 60).map((el) => el.querySelector('summary')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 160)));
      await first.locator('summary').click(); await page.waitForTimeout(500);
      const detail = (await first.textContent()).replace(/\s+/g, ' ').slice(0, 700);
      const ungraded = rows.filter((t) => !/\b[A-D] · \d+|Grade [A-D]|\b[A-D]\b \d/.test(t || '')).length;
      return { rows: rows.length, first3: rows.slice(0, 3), ungradedRows: ungraded, detail };
    });
    await step(page, watch, 'Catalog: narrow by each filter', async () => {
      const selects = page.locator('select'); const n = await selects.count(); const seen = [];
      for (let i = 0; i < n; i++) {
        const sel = selects.nth(i); if (!(await sel.isVisible())) continue;
        const label = (await sel.getAttribute('aria-label')) || (await sel.evaluate((e) => e.labels?.[0]?.textContent || e.name || ''));
        const options = await sel.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent.trim() })));
        const pick = options.find((o) => o.v);
        if (!pick) { seen.push({ label, options: options.length, picked: null }); continue; }
        await sel.selectOption(pick.v); const ms = await settle(page);
        const rows = await entries(page).count();
        const empty = rows === 0 ? (await page.locator('.empty-title, .es-title, [role="status"]').first().textContent().catch(() => null)) : null;
        seen.push({ label, options: options.length, picked: pick.t, rows, empty, ms });
        await sel.selectOption(options[0].v); await settle(page);
      }
      return seen;
    });
    await step(page, watch, 'Catalog: search', async () => {
      const box = page.getByPlaceholder('Find source documents and data…');
      await box.fill('protocol'); await box.press('Enter'); await settle(page);
      const rows = await entries(page).count();
      await box.fill(''); await box.press('Enter'); await settle(page);
      return { rowsForProtocol: rows, rowsAfterClear: await entries(page).count() };
    });
    await step(page, watch, 'Catalog: Use another project\'s file in this project, then Remove', async () => {
      const sel = page.getByLabel('Only this project');
      const other = (await sel.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent.trim() })))).find((o) => o.v && !/LMN-201/.test(o.t));
      if (!other) return { otherProject: null };
      await sel.selectOption(other.v); await settle(page);
      const entry = entries(page).first();
      const title = (await entry.locator('summary span').first().textContent()).trim();
      await entry.locator('summary').click();
      await entry.getByRole('button', { name: /Use in this project/ }).click({ timeout: 10000 }); await settle(page);
      const chip = await entry.getByText('Used in this project').count();
      // The project's own view lists it first, with where it came from.
      await page.getByRole('button', { name: 'This project', exact: true }).click(); await settle(page);
      const used = page.getByTestId('data-room-used');
      const usedSays = (await used.first().textContent().catch(() => null) || '').replace(/\s+/g, ' ').slice(0, 300);
      const remove = (await used.count()) ? used.getByRole('button', { name: /^Remove/ }).first() : page.getByRole('button', { name: /^Remove$/ }).first();
      const removeOffered = await remove.count();
      if (removeOffered) { await remove.click(); await settle(page); }
      const after = (await used.first().textContent().catch(() => null) || '').replace(/\s+/g, ' ').slice(0, 160);
      await page.getByRole('button', { name: 'All my projects', exact: true }).click(); await settle(page);
      return { otherProject: other.t, title, chip, usedSays, removeOffered, after };
    });
    await step(page, watch, 'Catalog: the Vault\'s documents, organized by folder and graded', async () => {
      const vault = page.getByTestId('data-room-vault-entry');
      await vault.first().waitFor({ timeout: 30000 });
      const groups = await page.getByTestId('data-room-group').evaluateAll((els) => els.map((el) => el.querySelector('p')?.textContent.trim()));
      const first = vault.first();
      await first.locator('summary').click(); await page.waitForTimeout(400);
      return { status: (await page.locator('.pf-count[role="status"]').first().textContent()).trim(), vaultRows: await vault.count(), groups,
        ungraded: await vault.filter({ hasNot: page.getByTestId('source-grade') }).count(),
        detail: (await first.textContent()).replace(/\s+/g, ' ').slice(0, 900) };
    });
    await step(page, watch, 'Catalog: use another project\'s Vault document here, then Remove', async () => {
      const sel = page.getByLabel('Only this project');
      const other = (await sel.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent.trim() })))).find((o) => o.v && !/LMN-201/.test(o.t));
      if (!other) return { otherProject: null };
      await sel.selectOption(other.v); await settle(page);
      const entry = page.getByTestId('data-room-vault-entry').first();
      if (!(await entry.count())) return { otherProject: other.t, vaultRows: 0 };
      const title = (await entry.locator('summary span').first().textContent()).trim();
      await entry.locator('summary').click();
      // A use left by an interrupted run is removed first, as a person would.
      if (await entry.getByRole('button', { name: /^Remove/ }).count()) { await entry.getByRole('button', { name: /^Remove/ }).click(); await settle(page); }
      await entry.getByRole('button', { name: /Use in this project/ }).click({ timeout: 10000 }); await settle(page);
      const chip = await entry.getByText('Used in this project').count();
      await page.getByRole('button', { name: 'This project', exact: true }).click(); await settle(page);
      const used = page.getByTestId('data-room-used');
      const usedSays = (await used.first().textContent().catch(() => null) || '').replace(/\s+/g, ' ').slice(0, 300);
      const remove = used.getByRole('button', { name: /^Remove/ }).first();
      const removeOffered = await remove.count();
      if (removeOffered) { await remove.click(); await settle(page); }
      const after = await used.count();
      await page.getByRole('button', { name: 'All my projects', exact: true }).click(); await settle(page);
      return { otherProject: other.t, title, chip, usedSays, removeOffered, usedSectionsAfterRemove: after };
    });
    await step(page, watch, 'Catalog: This project scope', async () => {
      await page.getByRole('button', { name: 'This project', exact: true }).or(page.getByRole('radio', { name: 'This project' })).or(page.getByRole('tab', { name: 'This project' })).first().click({ timeout: 10000 }); await settle(page);
      const rows = await entries(page).count();
      await page.getByRole('button', { name: 'All my projects', exact: true }).or(page.getByRole('radio', { name: 'All my projects' })).or(page.getByRole('tab', { name: 'All my projects' })).first().click({ timeout: 10000 }); await settle(page);
      return { thisProject: rows, allMyProjects: await entries(page).count() };
    });
    await step(page, watch, 'Vault from the rail: Data catalog tab', async () => {
      await page.goto(`${BASE}/concept2cure/project-home?program=${project.id}`, { waitUntil: 'domcontentloaded' }); await settle(page);
      if (WIDTH < 900) await page.getByRole('button', { name: /menu|navigation/i }).first().click({ timeout: 5000 }).catch(() => undefined);
      await railVault().click({ timeout: 15000 }); await settle(page);
      const tabs = await page.getByRole('tab').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.textContent.trim()));
      await page.getByRole('tab', { name: 'Data catalog' }).click({ timeout: 15000 }); await settle(page);
      await entries(page).first().waitFor({ timeout: 30000 });
      return { tabs, rows: await entries(page).count() };
    });
    await step(page, watch, 'Vault with no project open: Data catalog tab', async () => {
      await page.goto(`${BASE}/concept2cure`, { waitUntil: 'domcontentloaded' }); await settle(page);
      if (WIDTH < 900) await page.getByRole('button', { name: /menu|navigation/i }).first().click({ timeout: 5000 }).catch(() => undefined);
      await railVault().click({ timeout: 15000 }); await settle(page);
      const tab = page.getByRole('tab', { name: 'Data catalog' });
      if (!(await tab.count())) return { tab: 'absent', body: (await page.locator('main').first().textContent().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300) };
      await tab.click({ timeout: 15000 }); await settle(page);
      return { rows: await entries(page).count(), says: (await page.getByRole('tabpanel').first().textContent().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400) };
    });
    await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } }).catch(() => undefined); });
    await context.close();
  } catch (e) { out.error = String(e && e.stack || e); console.error(out.error); process.exitCode = 1; }
  finally { fs.writeFileSync(path.join(__dirname, `walk-${WIDTH}.json`), JSON.stringify(out, null, 2) + '\n'); await browser.close(); }
})();
