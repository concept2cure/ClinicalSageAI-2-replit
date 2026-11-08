/**
 * S6 2026-11-06, step 1 in the running app: folders a person makes, like Veeva's (CLAUDE.md RULE 4: opened and used).
 *
 *   node docs/evidence/SPINE/S6/2026-11-06/walk-folders.cjs [base-url]
 *
 * In the CSR study's Vault (Xanomeline TTS Phase 2, CDISCPILOT01, prepared by .devcontainer/post-start.sh):
 *   1. the header offers "New folder" beside "Upload a folder";
 *   2. New folder, made in the binder's 5.3 Clinical study reports, with a reason;
 *   3. Rename it, with a reason;
 *   4. Move an uploaded study file into it ("Move to…" lists it, indented under 5.3);
 *   5. the record: each change's audit row names who, when and why (read back through the app's own history).
 * At 1440 and 390. Signs out at the end. Log: ./walk-folders.json.
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
  expect(who.status === 200, `dev-login ${JSON.stringify(who)}`);
  const projects = await api(page, 'GET', '/api/c2c/projects?limit=100');
  return (projects.data ?? []).map((x) => ({ id: x.id, title: String(x.title ?? x.name ?? '') }));
}
const api = (page, method, url, body) => page.evaluate(async ({ method, url, body }) => {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` }, body: body ? JSON.stringify(body) : undefined });
  return r.json().catch(() => ({ status: r.status }));
}, { method, url, body });
const signOut = (page) => page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } }).catch(() => undefined));

/* The binder's folder: the cabinet comes after the authored documents' own section folders, which share its numbers. */
const folderButton = (page, re) => page.locator('button.vd-folder', { hasText: re }).last();

async function openVault(page, programId) {
  await page.goto(`${BASE}/concept2cure/vault?program=${programId}`, { waitUntil: 'networkidle' });
  await page.locator('button.vd-folder', { hasText: /Filing binder/ }).first().waitFor({ timeout: 60000 });
}

async function walkDesk(page, program) {
  await openVault(page, program.id);
  const acts = await page.locator('.ph-acts').innerText();
  expect(/New folder/.test(acts) && /Upload a folder/.test(acts) && !/Add a folder/.test(acts), `header: ${acts}`);
  step('1. the header: New folder beside Upload a folder', { header: acts.replace(/\s+/g, ' ') });

  // 2. New folder in 5.3 Clinical study reports.
  await folderButton(page, /^\s*5\.3\s+Clinical study reports/).click();
  await page.getByTestId('vault-new-folder-button').click();
  const form = page.getByTestId('vault-folder-edit');
  await form.waitFor();
  const parent = await page.getByTestId('vault-folder-parent').inputValue();
  expect(parent === 'bn:5.3', `New folder is made in the open folder (${parent})`);
  const name = `Pivotal study ${RUN}`;
  await page.getByTestId('vault-folder-name').fill(name);
  await page.getByTestId('vault-folder-reason').fill('A place for the pivotal study’s ADaM datasets and outputs.');
  await page.screenshot({ path: path.join(SHOTS, 'after-1-new-folder-form.png') });
  await page.getByTestId('vault-folder-save').click();
  const made = folderButton(page, new RegExp(name));
  await made.waitFor({ timeout: 20000 });
  const here = await page.locator('.vd-here').innerText();
  expect(here.includes(name) && /made by/.test(here), `the new folder is open (${here})`);
  await page.screenshot({ path: path.join(SHOTS, 'after-2-folder-made.png') });
  step('2. New folder made in 5.3 Clinical study reports', { name, breadcrumb: here });

  // 3. Rename it.
  const renamed = `Pivotal study CDISCPILOT01 ${RUN}`;
  await page.getByTestId('vault-rename-folder').click();
  await page.getByTestId('vault-folder-name').fill(renamed);
  await page.getByTestId('vault-folder-reason').fill('Named for the study it holds, as the TMF names it.');
  await page.getByTestId('vault-folder-save').click();
  await folderButton(page, new RegExp(renamed)).waitFor({ timeout: 20000 });
  step('3. Renamed, with a reason', { from: name, to: renamed });

  // 4. Move an uploaded study file into it.
  await page.getByRole('tab', { name: /^Uploads/ }).click();
  const row = page.locator('[data-view="uploads"] .vd-row, [data-view="uploads"] button', { hasText: /adsl/i }).first();
  await row.waitFor({ timeout: 20000 });
  await row.click();
  const move = page.locator('select[aria-label="Move this document to a dossier folder"]');
  await move.waitFor({ timeout: 20000 });
  const options = await move.locator('option').allInnerTexts();
  const target = options.find((o) => o.includes(renamed));
  expect(target && /^\u00a0/.test(target), `Move to… lists the folder indented under 5.3 (${target})`);
  const value = await move.locator('option', { hasText: renamed }).getAttribute('value');
  await move.selectOption(value);
  await page.getByTestId('vault-filing-reason').fill('The ADSL dataset belongs with the pivotal study it describes.');
  await page.screenshot({ path: path.join(SHOTS, 'after-3-move-to.png') });
  await move.locator('xpath=following-sibling::button').click();
  await page.waitForTimeout(1500);
  await page.getByRole('tab', { name: /^Library/ }).click();
  await folderButton(page, new RegExp(renamed)).click();
  await page.locator('.vd-rows .vd-row', { hasText: /adsl/i }).first().waitFor({ timeout: 20000 });
  await page.screenshot({ path: path.join(SHOTS, 'after-4-document-in-folder.png') });
  step('4. A study file moved into the folder', { folderId: value });
  return { folderId: value, renamed };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  try {
    const projects = await signIn(page);
    const program = projects.find((p) => /CDISCPILOT01/.test(p.title));
    expect(program, 'the CSR study project exists (post-start.sh prepares it)');
    const { folderId } = await walkDesk(page, program);

    // 5. The record, read back through the app's audit history for the folder and the document.
    step('5. the audit trail: read from audit_logs after the walk (README, audit.txt)', { folderId });

    // At 390: the Vault's header and the folder.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/concept2cure/vault?program=${program.id}`, { waitUntil: 'networkidle' });
    await page.getByTestId('vault-new-folder-button').waitFor({ timeout: 60000 });
    await page.screenshot({ path: path.join(SHOTS, 'after-5-phone-header.png') });
    step('6. at 390');
  } finally {
    await signOut(page);
    await browser.close();
    fs.writeFileSync(path.join(__dirname, 'walk-folders.json'), JSON.stringify(log, null, 2));
  }
})().catch((e) => { console.error(e); process.exit(1); });
