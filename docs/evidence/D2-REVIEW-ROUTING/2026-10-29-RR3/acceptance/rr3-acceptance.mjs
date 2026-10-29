/**
 * RR3 browser acceptance: reassign and hand back on a Vault review route, end
 * to end, on a private instance of the working tree (real server, real
 * PostgreSQL, RLS on).
 *
 *   node rr3-acceptance.mjs <desktop|phone>
 *
 * Environment (nothing secret is in this file):
 *   RR3_BASE      the private instance, e.g. http://localhost:5197
 *   RR3_PROGRAM   the acceptance organization's regulatory program id
 *   RR3_PASSWORD  the synthetic acceptance accounts' password
 *
 * The accounts are synthetic (rr3-*@example.test). jm.smith and sarah.chen
 * are never used.
 *
 * Steps, each with a screenshot in ./<viewport>/:
 *   1. the sender uploads a version and sends it on a route naming Rae and
 *      Rob as reviewers and Ann as approver (through the API: the form is
 *      RR1b's acceptance);
 *   2. the sender opens the version: Reassign on each member; reassigns
 *      Rae's review to Ria in the sheet, with a reason; the round names Ria
 *      and the naming history says who reassigned what from whom to whom;
 *   3. Rae's Tasks no longer list the review, and her notice says it was
 *      reassigned; Ria's notice opens the version and she signs the review;
 *   4. Rob hands his review back, with a reason: he is offered no signature,
 *      and the round says he waits on the sender;
 *   5. the sender's notice says Rob handed it back; the sender reassigns
 *      Rob's review to Rae; Rae signs; Ann approves on the route; the
 *      history lists send, reassign, hand back, reassign.
 */
import { chromium } from '/opt/node-tools/node_modules/playwright-core/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const viewport = process.argv[2] === 'phone' ? 'phone' : 'desktop';
const SIZE = viewport === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const BASE = process.env.RR3_BASE ?? 'http://localhost:5197';
const PROGRAM = process.env.RR3_PROGRAM;
const PASSWORD = process.env.RR3_PASSWORD;
if (!PROGRAM || !PASSWORD) throw new Error('RR3_PROGRAM and RR3_PASSWORD are required');
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, viewport);
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
  form.set('documentCode', `RR3-${title.replace(/[^A-Za-z0-9]+/g, '-').toUpperCase()}`);
  const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${title}\ntrailer<</Root 1 0 R>>\n%%EOF\n`;
  form.set('file', new Blob([pdf], { type: 'application/pdf' }), `${title.replace(/\s+/g, '-').toLowerCase()}.pdf`);
  const res = await fetch(`${BASE}/api/vault/ingest`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: BASE }, body: form });
  const body = await res.json();
  if (res.status !== 201) throw new Error(`Upload of ${title} failed: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return String(body.document.id);
}

/** Send the version on a route through the API: start its record, then advance it into review naming the people. */
async function sendOnRoute(token, vaultId, ids) {
  const started = await api(token, 'POST', '/api/regulatory/documents', { sources: { vault_documents: { nativeId: vaultId, role: 'artifact' } } });
  if (started.status !== 201) throw new Error(`start failed: ${started.status} ${JSON.stringify(started.json).slice(0, 300)}`);
  const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const sent = await api(token, 'POST', `/api/regulatory/documents/${started.json.canonicalId}/advance`, {
    to: 'in_review', reason: 'Ready for medical and QA review before the pre-IND package',
    route: { reviewers: [ids.rae, ids.rob], approvers: [ids.ann], order: 'parallel', reviewDueDate: day(3), approvalDueDate: day(5) },
  });
  if (sent.status !== 200) throw new Error(`send failed: ${sent.status} ${JSON.stringify(sent.json).slice(0, 300)}`);
  return String(started.json.canonicalId);
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

async function reassign(s, from, to, reason) {
  await s.page.getByRole('button', { name: `Reassign ${from}` }).click();
  const sheet = s.page.getByTestId('vault-route-reassign');
  await sheet.waitFor();
  await sheet.getByTestId('vr-reassign-search').waitFor();
  await sheet.getByTestId('vr-reassign-search').fill(to.split(' ')[0]);
  await sheet.getByText(to, { exact: true }).first().click();
  await sheet.getByTestId('vr-reassign-reason').fill(reason);
  await phoneChecks(s, 'reassign sheet', '[data-testid="vault-route-reassign"] .rf-opt, [data-testid="vault-route-reassign"] .de-btn, [data-testid="vault-route-reassign"] .de-x, [data-testid="vault-route-reassign"] .rf-search');
  await snap(s, `reassign-${from.split(' ')[0].toLowerCase()}-sheet`, '[data-testid="vault-route-reassign"]');
  await sheet.getByTestId('vr-reassign-confirm').click();
  await sheet.waitFor({ state: 'detached' });
  await s.page.waitForTimeout(1500);
  note(`${s.who}: reassigned ${from} to ${to}: "${await headline(s)}"`);
}

async function signHere(s, which, reason) {
  await s.page.getByRole('button', { name: new RegExp(`^${which === 'review' ? 'Sign review' : 'Approve'}:`) }).click();
  const dialog = s.page.getByRole('dialog');
  await dialog.getByLabel(/Reason for this action/).fill(reason);
  await dialog.getByLabel(/Password/).fill(PASSWORD);
  await dialog.getByRole('button', { name: /Sign and commit/ }).click();
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

try {
  const senderApi = await apiLogin(PEOPLE.sender);
  const ids = {};
  for (const who of ['rae', 'rob', 'ann']) ids[who] = (await apiLogin(PEOPLE[who])).userId;
  const title = `Clinical overview ${tag}`;
  const vaultId = await upload(senderApi.token, title);
  currentVaultId = vaultId;
  note(`uploaded ${title} → ${vaultId}`);
  const canonicalId = await sendOnRoute(senderApi.token, vaultId, ids);
  note(`sent ${title} on a route (record ${canonicalId}): reviewers Rae Reviewer and Rob Reviewer, approver Ann Approver`);

  // 2. The sender reassigns Rae's review to Ria.
  const sender = await session('sender');
  await openVaultDoc(sender, title);
  await phoneChecks(sender, 'round panel', '.vr-round .sp-ask, .vd-ver-acts .sp-ask');
  await snap(sender, 'round-with-reassign');
  await reassign(sender, 'Rae Reviewer', 'Ria Reviewer', 'Rae is on leave until next month; Ria covers the clinical review');
  await snap(sender, 'reassigned-to-ria');

  // 3. Rae: the review has left her Tasks, and she is told. Ria: her notice opens the version; she signs.
  const rae = await session('rae');
  await openTray(rae);
  const raeTray = (await rae.page.getByRole('dialog', { name: 'Your work' }).innerText()).replace(/\s*\n\s*/g, ' | ');
  note(`rae: tray lists the review: ${raeTray.includes(`Review: ${title}`)}; told it was reassigned: ${raeTray.includes(`Review reassigned: ${title}`)}`);
  if (raeTray.includes(`Review: ${title}`)) throw new Error('the reassigned review is still in Rae\'s Tasks');
  await snap(rae, 'tasks-tray-reassigned-away', '[aria-label="Your work"]');
  const ria = await session('ria');
  await openTray(ria);
  await snap(ria, 'tasks-tray-review-requested', '[aria-label="Your work"]');
  await ria.page.getByRole('button', { name: 'Open the version in the Vault' }).first().click();
  await ria.page.getByTestId('vault-route-headline').first().waitFor();
  note(`ria: the notice opened the version: "${await headline(ria)}"`);
  await signHere(ria, 'review', 'Reviewed the clinical overview against the protocol');
  await openVaultDoc(ria, title);
  note(`ria: after signing: "${await headline(ria)}"`);
  await snap(ria, 'signed-waiting');

  // 4. Rob hands his review back.
  const rob = await session('rob');
  await openVaultDoc(rob, title);
  await rob.page.getByRole('button', { name: /^Hand back:/ }).click();
  const hb = rob.page.getByTestId('vault-route-hand-back');
  await hb.getByTestId('vr-act-reason').fill('I am on leave for the whole review window');
  await phoneChecks(rob, 'hand-back sheet', '[data-testid="vault-route-hand-back"] .de-btn, [data-testid="vault-route-hand-back"] .de-x');
  await snap(rob, 'hand-back-reason', '[data-testid="vault-route-hand-back"]');
  await hb.getByTestId('vr-act-confirm').click();
  await hb.waitFor({ state: 'detached' });
  await rob.page.waitForTimeout(1500);
  note(`rob: handed back: "${await headline(rob)}"; offered Sign review: ${await rob.page.getByRole('button', { name: /^Sign review:/ }).count()}`);
  await snap(rob, 'handed-back');

  // 5. The sender is told, reassigns Rob's review to Rae; Rae signs; Ann approves.
  await openTray(sender);
  const senderTray = (await sender.page.getByRole('dialog', { name: 'Your work' }).innerText()).replace(/\s*\n\s*/g, ' | ');
  note(`sender: told of the hand-back: ${senderTray.includes(`Handed back by Rob Reviewer: ${title}`)}`);
  await snap(sender, 'tasks-tray-handed-back', '[aria-label="Your work"]');
  await openVaultDoc(sender, title);
  note(`sender: "${await headline(sender)}"`);
  await snap(sender, 'round-handed-back');
  await reassign(sender, 'Rob Reviewer', 'Rae Reviewer', 'Rob is on leave; Rae is back and takes the second review');
  await snap(sender, 'reassigned-to-rae');

  await openVaultDoc(rae, title);
  note(`rae: "${await headline(rae)}"`);
  await signHere(rae, 'review', 'Reviewed the clinical overview for medical accuracy');
  const ann = await session('ann');
  await openVaultDoc(ann, title);
  note(`ann: "${await headline(ann)}"`);
  await signHere(ann, 'approve', 'Approved for the pre-IND package');
  await openVaultDoc(sender, title);
  note(`sender: after the approval: "${await headline(sender)}" · ${await sender.page.getByTestId('vault-version-stage').first().textContent()}`);
  await snap(sender, 'approved-with-history');
  note(`page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
} catch (err) {
  note(`FAILED: ${err instanceof Error ? err.stack : String(err)}`);
  process.exitCode = 1;
} finally {
  writeFileSync(resolve(out, 'run.log'), `${log.join('\n')}\n`);
  await browser.close();
}
