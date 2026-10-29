/**
 * RR2 browser acceptance on a Vault version: reviewers one after another, two
 * approvers, and a reviewer added to an open route, end to end, on a private
 * instance of the working tree (real server, real PostgreSQL, RLS on, the
 * runtime role app_service, dev-login refused).
 *
 *   node rr2-vault-acceptance.mjs <desktop|phone>
 *
 * Environment (nothing secret is in this file):
 *   RR2_BASE      the private instance, e.g. http://localhost:5201
 *   RR2_PROGRAM   the acceptance organization's regulatory program id
 *   RR2_PASSWORD  the synthetic acceptance accounts' password
 *
 * The accounts are synthetic (rr3-*@example.test, from RR3's acceptance, and
 * rr2-approver2@example.test). jm.smith and sarah.chen are never used.
 *
 * Run A, through the route form: the sender names Rae and Rob one after
 * another (Rob moved earlier with the Earlier button), each step dated, and
 * Ann and Ava as approvers. Rae waits, and is told only when Rob has signed.
 * Ann's approval reads "Approved (1 of 2 required)" and leaves the version in
 * review. Ava's approves it.
 * Run B: a route with Rae as reviewer and Ann as approver. Rae signs, so it is
 * Ann's turn. The sender adds Ria as a reviewer with a reason. Ann waits again
 * and is told. Ria signs, then Ann approves.
 *
 * The harness (sign-in, snap, phoneChecks, openVaultDoc, signHere, openTray) is
 * RR3's (../../2026-10-29-RR3/acceptance/rr3-acceptance.mjs).
 */
import { chromium } from '/opt/node-tools/node_modules/playwright-core/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const viewport = process.argv[2] === 'phone' ? 'phone' : 'desktop';
const SIZE = viewport === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const BASE = process.env.RR2_BASE ?? 'http://localhost:5201';
const PROGRAM = process.env.RR2_PROGRAM;
const PASSWORD = process.env.RR2_PASSWORD;
if (!PROGRAM || !PASSWORD) throw new Error('RR2_PROGRAM and RR2_PASSWORD are required');
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, 'vault', viewport);
mkdirSync(out, { recursive: true });
const tag = `${viewport === 'phone' ? 'P' : 'D'}${Date.now().toString(36).slice(-4).toUpperCase()}`;
const log = [];
const note = (line) => { log.push(line); console.info(line); };

const PEOPLE = {
  sender: 'rr3-sender@example.test',
  rae: 'rr3-reviewer1@example.test',
  rob: 'rr3-reviewer2@example.test',
  ria: 'rr3-reviewer3@example.test',
  ann: 'rr3-approver@example.test',
  ava: 'rr2-approver2@example.test',
};

async function apiLogin(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', Origin: BASE }, body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json();
  if (!res.ok || !body.accessToken) throw new Error(`API sign-in failed for ${email}: ${res.status}`);
  return { token: body.accessToken, userId: Number(body.user?.id) };
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, Origin: BASE, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function upload(token, title) {
  const form = new FormData();
  form.set('programId', PROGRAM);
  form.set('documentTitle', title);
  form.set('documentType', 'OTHER');
  form.set('documentCode', `RR2-${title.replace(/[^A-Za-z0-9]+/g, '-').toUpperCase()}`);
  const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${title}\ntrailer<</Root 1 0 R>>\n%%EOF\n`;
  form.set('file', new Blob([pdf], { type: 'application/pdf' }), `${title.replace(/\s+/g, '-').toLowerCase()}.pdf`);
  const res = await fetch(`${BASE}/api/vault/ingest`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: BASE }, body: form });
  const body = await res.json();
  if (res.status !== 201) throw new Error(`Upload of ${title} failed: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return String(body.document.id);
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', headless: true, args: ['--no-sandbox'] });
const errors = [];
let shot = 0;

async function session(who) {
  const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1, ...(viewport === 'phone' ? { isMobile: true, hasTouch: true } : {}) });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  await page.goto(`${BASE}/concept2cure/login`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('#login-email', PEOPLE[who]);
  await page.fill('#login-password', PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login') && !u.pathname.startsWith('/auth'), { timeout: 60000 });
  note(`${who}: signed in`);
  return { context, page, who };
}

/** Bring `el` into view through every scroll container on the way (the Vault's detail pane scrolls on its own). */
const intoView = (el) => {
  const scroller = (n) => {
    for (let p = n.parentElement; p; p = p.parentElement) {
      const y = window.getComputedStyle(p).overflowY;
      if ((y === 'auto' || y === 'scroll') && p.scrollHeight > p.clientHeight) return p;
    }
    return null;
  };
  for (let child = el, pane = scroller(el); pane; child = pane, pane = scroller(pane)) {
    pane.scrollTop += child.getBoundingClientRect().top - pane.getBoundingClientRect().top - 8;
  }
};

/**
 * A screenshot at the viewport under test, with the route's panel (or `focus`)
 * scrolled into view; then the element itself, with only the window made
 * taller (same width, same layout) and put back.
 */
async function snap(s, name, focus = '[data-testid="vault-route-round"]') {
  const target = s.page.locator(focus).first();
  const visible = await target.isVisible().catch(() => false);
  if (visible) await target.evaluate(intoView).catch(() => {});
  shot += 1;
  const file = `${String(shot).padStart(2, '0')}-${s.who}-${name}.png`;
  await s.page.screenshot({ path: resolve(out, file), fullPage: false });
  note(`  screenshot ${viewport}/${file}`);
  if (!visible) return;
  const detail = file.replace(/\.png$/, '-detail.png');
  await s.page.setViewportSize({ width: SIZE.width, height: 2400 });
  await s.page.waitForTimeout(300);
  await target.evaluate(intoView).catch(() => {});
  await target.screenshot({ path: resolve(out, detail) }).catch(() => {});
  await s.page.setViewportSize(SIZE);
  note(`  screenshot ${viewport}/${detail} (the element, window ${SIZE.width}x2400)`);
  const text = (await target.innerText().catch(() => '')).replace(/\s*\n\s*/g, ' | ');
  if (text) note(`    text: ${text.slice(0, 900)}`);
}

/** Phone checks: no horizontal scroll, every control in `selector` at least 44 px tall. */
async function phoneChecks(s, where, selector) {
  if (viewport !== 'phone') return;
  const r = await s.page.evaluate((sel) => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const small = [...document.querySelectorAll(sel)].filter((el) => el.offsetParent !== null)
      .map((el) => ({ text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40), h: Math.round(el.getBoundingClientRect().height) }))
      .filter((x) => x.h < 44);
    return { overflow, small };
  }, selector);
  note(`  phone ${where}: horizontal overflow ${r.overflow}px; controls under 44px: ${JSON.stringify(r.small)}`);
  if (r.overflow > 0) throw new Error(`${where}: horizontal scroll of ${r.overflow}px at 390 wide`);
  if (r.small.length) throw new Error(`${where}: touch targets under 44px: ${JSON.stringify(r.small)}`);
}

/** The version being exercised, by its Vault id (set once uploaded). */
let currentVaultId = null;

async function openVaultDoc(s, title) {
  await s.page.goto(`${BASE}/concept2cure/vault?program=${PROGRAM}`, { waitUntil: 'networkidle', timeout: 120000 });
  const row = s.page.locator(`text=${title} >> visible=true`).first();
  if (await row.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
    await row.click();
  } else {
    // At 390 wide the uploaded-files row renders its name 0 px wide (a Vault
    // layout issue outside RR3), so open the version the way a route notice
    // does: publish the Vault's deep-link target (vaultTarget.ts).
    note(`  ${s.who}: the row for ${title} has no visible width at this size; opened through the Vault's deep-link target, as a notice does`);
    await s.page.evaluate(({ documentId, programId }) => {
      window.C2C_VAULT_TARGET = { documentId, programId };
      window.dispatchEvent(new Event('c2c:vault-target'));
    }, { documentId: currentVaultId, programId: PROGRAM });
  }
  await s.page.getByTestId('vault-versions').waitFor();
  await s.page.getByTestId('vault-route-headline').first().waitFor();
}

const headline = async (s) => (await s.page.getByTestId('vault-route-headline').first().textContent())?.trim();

async function signHere(s, which, reason) {
  await s.page.getByRole('button', { name: new RegExp(`^${which === 'review' ? 'Sign review' : 'Approve'}:`) }).click();
  const dialog = s.page.getByRole('dialog');
  const commit = dialog.getByRole('button', { name: /Sign and commit/ });
  await commit.waitFor();
  await s.page.waitForTimeout(500); // the dialog settles before it is filled (RR2: a fill during its entry was lost)
  for (let i = 0; i < 5 && !(await commit.isEnabled()); i++) {
    await dialog.getByLabel(/Reason for this action/).fill(reason);
    await dialog.getByLabel(/Password/).fill(PASSWORD);
    await s.page.waitForTimeout(400);
  }
  await commit.click();
  await s.page.getByText(/Signed|recorded/i).first().waitFor({ timeout: 30000 }).catch(() => {});
  const close = dialog.getByRole('button', { name: /Close|Done/ }).first();
  if (await close.isVisible().catch(() => false)) await close.click();
  await s.page.waitForTimeout(1500);
}

async function openTray(s) {
  await s.page.locator('.tt-trigger').first().click();
  await s.page.getByRole('dialog', { name: 'Your work' }).waitFor();
  await s.page.waitForTimeout(1500);
}


const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const trayText = async (s) => (await s.page.getByRole('dialog', { name: 'Your work' }).innerText()).replace(/\s*\n\s*/g, ' | ');
const memberText = async (s, id) => ((await s.page.getByTestId(`vault-route-member-${id}`).first().innerText().catch(() => '')) || '').trim();

async function start(token, vaultId) {
  const started = await api(token, 'POST', '/api/regulatory/documents', { sources: { vault_documents: { nativeId: vaultId, role: 'artifact' } } });
  if (started.status !== 201) throw new Error(`start failed: ${started.status} ${JSON.stringify(started.json).slice(0, 300)}`);
  return String(started.json.canonicalId);
}

try {
  const senderApi = await apiLogin(PEOPLE.sender);
  const ids = {};
  for (const who of ['rae', 'rob', 'ria', 'ann', 'ava']) ids[who] = (await apiLogin(PEOPLE[who])).userId;

  // ── Run A: one after another, two approvers, through the form ──
  const titleA = `Stability summary ${tag}`;
  currentVaultId = await upload(senderApi.token, titleA);
  note(`uploaded ${titleA} → ${currentVaultId}`);
  const sender = await session('sender');
  await openVaultDoc(sender, titleA).catch(async () => { await sender.page.getByTestId('vault-versions').waitFor(); });
  await sender.page.getByRole('button', { name: /^Send for review:/ }).first().click();
  const form = sender.page.getByTestId('vault-route-form');
  await form.waitFor();
  await form.getByTestId(`vr-reviewer-${ids.rae}`).click();
  await form.getByTestId(`vr-reviewer-${ids.rob}`).click();
  await form.getByTestId('vr-order-sequential').check();
  await form.getByRole('button', { name: 'Move Rob Reviewer earlier' }).click();
  const order = await form.getByTestId('vr-steps').locator('.vr-step-name').allInnerTexts();
  note(`sender: the steps read ${JSON.stringify(order)}`);
  if (order[0] !== 'Step 1 · Rob Reviewer') throw new Error('Earlier did not move Rob to step 1');
  await form.getByTestId('vr-step-due-0').fill(day(3));
  await form.getByTestId('vr-step-due-1').fill(day(5));
  await form.getByTestId(`vr-approver-${ids.ann}`).click();
  await form.getByTestId(`vr-approver-${ids.ava}`).click();
  await form.getByTestId('vr-approval-due').fill(day(8));
  await form.getByTestId('vr-reason').fill('Ready for medical then statistical review, then QA and RA approval');
  await phoneChecks(sender, 'route form', '[data-testid="vault-route-form"] .vr-move, [data-testid="vault-route-form"] .rf-opt, [data-testid="vault-route-form"] .de-btn, [data-testid="vault-route-form"] .de-x');
  await snap(sender, 'route-form-sequential-two-approvers', '[data-testid="vr-steps"]');
  await form.getByTestId('vr-send').click();
  await form.waitFor({ state: 'detached', timeout: 30000 });
  await sender.page.getByTestId('vault-route-headline').first().waitFor();
  note(`sender: sent: "${await headline(sender)}"`);
  await phoneChecks(sender, 'round panel', '.vr-round .sp-ask, .vd-ver-acts .sp-ask');
  await snap(sender, 'sent-sequential-round');

  const rae = await session('rae');
  await openTray(rae);
  const raeBefore = await trayText(rae);
  note(`rae: told before her turn: ${raeBefore.includes(`Review requested: ${titleA}`) || raeBefore.includes(`It is your turn: review ${titleA}`)}; task row waiting: ${/waiting on/i.test(raeBefore)}`);
  await snap(rae, 'tasks-tray-waiting-for-rob', '[aria-label="Your work"]');
  await openVaultDoc(rae, titleA);
  note(`rae: "${await headline(rae)}"; her line: "${await memberText(rae, ids.rae)}"; Sign review offered: ${await rae.page.getByRole('button', { name: /^Sign review:/ }).count()}`);
  await snap(rae, 'waits-for-rob');

  const rob = await session('rob');
  await openVaultDoc(rob, titleA);
  note(`rob: "${await headline(rob)}"`);
  await signHere(rob, 'review', 'Reviewed the medical content: consistent with the CSR');
  await openTray(rae);
  const raeAfter = await trayText(rae);
  note(`rae: told it is her turn: ${raeAfter.includes(`It is your turn: review ${titleA}`)}`);
  if (!raeAfter.includes(`It is your turn: review ${titleA}`)) throw new Error('Rae was not told it is her turn');
  await snap(rae, 'tasks-tray-your-turn', '[aria-label="Your work"]');
  await openVaultDoc(rae, titleA);
  await signHere(rae, 'review', 'Reviewed the statistical tables against the SAP');

  const ann = await session('ann');
  await openVaultDoc(ann, titleA);
  note(`ann: "${await headline(ann)}"`);
  await ann.page.getByRole('button', { name: /^Approve:/ }).click();
  const annDialog = ann.page.getByRole('dialog');
  await annDialog.waitFor();
  const annMeta = (await annDialog.innerText()).replace(/\s*\n\s*/g, ' | ');
  note(`ann: the approval dialog says: ${annMeta.includes('Your approval is 1 of 2 required') ? '"Your approval is 1 of 2 required"' : 'NOT the share'}`);
  await snap(ann, 'approve-dialog-1-of-2', '[role="dialog"]');
  await annDialog.getByRole('button', { name: /Cancel|Close/ }).first().click();
  await signHere(ann, 'approve', 'Approved for quality');
  await openVaultDoc(ann, titleA);
  const annLine = await memberText(ann, ids.ann);
  note(`ann: after her approval: "${await headline(ann)}"; her line: "${annLine}"; stage: ${await ann.page.getByTestId('vault-version-stage').first().textContent()}`);
  if (!annLine.includes('Approved (1 of 2 required)')) throw new Error('the first approver does not read 1 of 2');
  await snap(ann, 'approved-1-of-2-still-in-review');

  const ava = await session('ava');
  await openVaultDoc(ava, titleA);
  note(`ava: "${await headline(ava)}"`);
  await signHere(ava, 'approve', 'Approved for regulatory affairs');
  await openVaultDoc(sender, titleA);
  note(`sender: after the last approval: "${await headline(sender)}" · ${await sender.page.getByTestId('vault-version-stage').first().textContent()}`);
  note(`sender: Ann's line "${await memberText(sender, ids.ann)}"; Ava's line "${await memberText(sender, ids.ava)}"`);
  await snap(sender, 'approved-by-both');

  // ── Run B: add a reviewer to the open route ──
  const titleB = `Nonclinical overview ${tag}`;
  currentVaultId = await upload(senderApi.token, titleB);
  const idB = await start(senderApi.token, currentVaultId);
  const sentB = await api(senderApi.token, 'POST', `/api/regulatory/documents/${idB}/advance`, {
    to: 'in_review', reason: 'Ready for nonclinical review and QA approval',
    route: { reviewers: [ids.rae], approvers: [ids.ann], order: 'parallel', reviewDueDate: day(3), approvalDueDate: day(6) },
  });
  if (sentB.status !== 200) throw new Error(`send B failed: ${sentB.status} ${JSON.stringify(sentB.json).slice(0, 300)}`);
  const raeApi = await apiLogin(PEOPLE.rae);
  const raeSigned = await api(raeApi.token, 'POST', `/api/regulatory/documents/${idB}/sign`, { meaning: 'reviewed', password: PASSWORD, reason: 'Reviewed the nonclinical overview' });
  note(`B: sent naming Rae (reviewer) and Ann (approver); Rae signed through the API: ${raeSigned.status}, reviewComplete ${raeSigned.json?.reviewComplete}`);
  await openVaultDoc(sender, titleB);
  note(`sender: "${await headline(sender)}"`);
  await sender.page.getByTestId('vr-add-reviewer').first().click();
  const sheet = sender.page.getByTestId('vault-route-add');
  await sheet.waitFor();
  await sheet.getByTestId(`vr-add-${ids.ria}`).click();
  await sheet.getByTestId('vr-add-due').fill(day(4));
  await sheet.getByTestId('vr-add-reason').fill('Toxicology must review the safety margins before approval');
  await phoneChecks(sender, 'add-reviewer sheet', '[data-testid="vault-route-add"] .rf-opt, [data-testid="vault-route-add"] .de-btn, [data-testid="vault-route-add"] .de-x, [data-testid="vault-route-add"] .rf-search');
  await snap(sender, 'add-reviewer-sheet', '[data-testid="vault-route-add"]');
  await sheet.getByTestId('vr-add-confirm').click();
  await sheet.waitFor({ state: 'detached', timeout: 30000 });
  await sender.page.waitForTimeout(1500);
  await openVaultDoc(sender, titleB);
  note(`sender: after adding Ria: "${await headline(sender)}"; Ann's line "${await memberText(sender, ids.ann)}"`);
  await snap(sender, 'ria-added-ann-waits');
  await openTray(ann);
  const annTray = await trayText(ann);
  note(`ann: told she waits again: ${annTray.includes(`Waiting on a new reviewer: ${titleB}`)}`);
  if (!annTray.includes(`Waiting on a new reviewer: ${titleB}`)) throw new Error('Ann was not told she waits on a new reviewer');
  await snap(ann, 'tasks-tray-waiting-on-new-reviewer', '[aria-label="Your work"]');
  const ria = await session('ria');
  await openVaultDoc(ria, titleB);
  note(`ria: "${await headline(ria)}"`);
  await signHere(ria, 'review', 'Reviewed the safety margins');
  await openVaultDoc(ann, titleB);
  note(`ann: "${await headline(ann)}"`);
  await signHere(ann, 'approve', 'Approved for the pre-IND package');
  await openVaultDoc(sender, titleB);
  note(`sender: B after the approval: "${await headline(sender)}" · ${await sender.page.getByTestId('vault-version-stage').first().textContent()}`);
  await snap(sender, 'b-approved-with-history');
  note(`page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
  if (errors.length) process.exitCode = 1;
} catch (err) {
  note(`FAILED: ${err instanceof Error ? err.stack : String(err)}`);
  process.exitCode = 1;
} finally {
  writeFileSync(resolve(out, 'run.log'), `${log.join('\n')}\n`);
  await browser.close();
}
