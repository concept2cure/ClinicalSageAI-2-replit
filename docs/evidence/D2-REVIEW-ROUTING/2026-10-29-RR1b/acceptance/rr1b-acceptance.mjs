/**
 * RR1b browser acceptance: the Vault review route, end to end, on a private
 * instance of the working tree (real server, real PostgreSQL, RLS on).
 *
 *   node rr1b-acceptance.mjs <desktop|phone>
 *
 * Environment (nothing secret is in this file):
 *   RR1B_BASE      the private instance, e.g. http://localhost:5193
 *   RR1B_PROGRAM   the acceptance organization's regulatory program id
 *   RR1B_PASSWORD  the synthetic acceptance accounts' password
 *
 * The accounts are synthetic (rr1b-*@example.test). jm.smith and sarah.chen
 * are never used.
 *
 * Steps, each with a screenshot in ./<viewport>/:
 *   1. the sender uploads three versions (A, B, C) through the API;
 *   2. the sender opens A in the Vault, Send for review opens the route form
 *      (a sheet on the phone), names two reviewers and one approver, the due
 *      dates and the reason, and sends;
 *   3. the first reviewer opens Tasks: the task and the notice; the notice
 *      opens the version; they sign the review ("You signed at …; waiting for …");
 *   4. the second reviewer finds it on the Review board ("Awaiting my review")
 *      and signs from the version;
 *   5. the approver's notice says it is their turn; they approve by signing on
 *      the route: "Approved (1 of 1 required)", the version Approved;
 *   6. the sender sends B and withdraws it, and sends C and returns it, each
 *      with a reason.
 */
import { chromium } from '/opt/node-tools/node_modules/playwright-core/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const viewport = process.argv[2] === 'phone' ? 'phone' : 'desktop';
const SIZE = viewport === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const BASE = process.env.RR1B_BASE ?? 'http://localhost:5193';
const PROGRAM = process.env.RR1B_PROGRAM;
const PASSWORD = process.env.RR1B_PASSWORD;
if (!PROGRAM || !PASSWORD) throw new Error('RR1B_PROGRAM and RR1B_PASSWORD are required');
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, viewport);
mkdirSync(out, { recursive: true });
const tag = `${viewport === 'phone' ? 'P' : 'D'}${Date.now().toString(36).slice(-4).toUpperCase()}`;
const log = [];
const note = (line) => { log.push(line); console.info(line); };

const PEOPLE = {
  sender: 'rr1b-sender@example.test',
  rae: 'rr1b-reviewer1@example.test',
  rob: 'rr1b-reviewer2@example.test',
  ann: 'rr1b-approver@example.test',
};

async function apiLogin(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', Origin: BASE }, body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json();
  if (!res.ok || !body.accessToken) throw new Error(`API sign-in failed for ${email}: ${res.status}`);
  return body.accessToken;
}

async function upload(token, title) {
  const form = new FormData();
  form.set('programId', PROGRAM);
  form.set('documentTitle', title);
  form.set('documentType', 'OTHER');
  form.set('documentCode', `RR1B-${title.replace(/[^A-Za-z0-9]+/g, '-').toUpperCase()}`);
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
 * scrolled into view; then the element itself. The Vault's detail pane gets
 * the height the page leaves it, so for the element shot only the window is
 * made taller (same width, same layout) and put back.
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
  if (text) note(`    text: ${text.slice(0, 600)}`);
}

/** Phone checks: one column, no horizontal scroll, every route control at least 44 px tall. */
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

async function openVaultDoc(s, title) {
  await s.page.goto(`${BASE}/concept2cure/vault?program=${PROGRAM}`, { waitUntil: 'networkidle', timeout: 120000 });
  await s.page.getByText(title, { exact: false }).first().click();
  await s.page.getByTestId('vault-versions').waitFor();
}

async function sendRoute(s, title, reason) {
  await s.page.getByRole('button', { name: /^Send for review:/ }).click();
  const form = s.page.getByTestId('vault-route-form');
  await form.waitFor();
  await form.getByTestId('vr-reviewer-search').waitFor();
  await form.getByTestId('vr-reviewer-search').fill('Rae');
  await form.getByText('Rae Reviewer', { exact: true }).first().click();
  await form.getByTestId('vr-reviewer-search').fill('');
  await form.getByText('Rob Reviewer', { exact: true }).first().click();
  await form.getByTestId('vr-approver-search').fill('Ann');
  await form.getByText('Ann Approver', { exact: true }).last().click();
  const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  await form.getByTestId('vr-review-due').fill(day(3));
  await form.getByTestId('vr-approval-due').fill(day(5));
  await form.getByTestId('vr-reason').fill(reason);
  await phoneChecks(s, 'route form', '[data-testid="vault-route-form"] .rf-opt, [data-testid="vault-route-form"] .de-btn, [data-testid="vault-route-form"] .de-x, [data-testid="vault-route-form"] .rf-search, [data-testid="vault-route-form"] input[type="date"]');
  await snap(s, `route-form-${title.split(' ').pop()}`, '[data-testid="vr-send"]');
  await form.getByTestId('vr-send').click();
  await form.waitFor({ state: 'detached' });
  await s.page.getByTestId('vault-route-headline').first().waitFor();
  note(`${s.who}: sent ${title}: "${await s.page.getByTestId('vault-route-headline').first().textContent()}"`);
}

async function signHere(s, which, reason) {
  await s.page.getByRole('button', { name: new RegExp(`^${which === 'review' ? 'Sign review' : 'Approve'}:`) }).click();
  const dialog = s.page.getByRole('dialog');
  await dialog.getByLabel(/Reason for this action/).fill(reason);
  await dialog.getByLabel(/Password/).fill(PASSWORD);
  await snap(s, `${which}-dialog`);
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
  const token = await apiLogin(PEOPLE.sender);
  const titles = { a: `Clinical overview ${tag} A`, b: `Clinical overview ${tag} B`, c: `Clinical overview ${tag} C` };
  for (const k of Object.keys(titles)) note(`uploaded ${titles[k]} → ${await upload(token, titles[k])}`);

  // 2. The sender sends A on a named route.
  const sender = await session('sender');
  await openVaultDoc(sender, titles.a);
  await sendRoute(sender, titles.a, 'Ready for medical and QA review before the pre-IND package');
  await phoneChecks(sender, 'round panel', '.vr-round .sp-ask, .vd-ver-acts .sp-ask');
  await snap(sender, 'sent-round');

  // 3. Rae: Tasks shows the task and the notice; the notice opens the version; she signs.
  const rae = await session('rae');
  await openTray(rae);
  await snap(rae, 'tasks-tray', '[aria-label="Your work"]');
  const notice = rae.page.getByRole('button', { name: 'Open the version in the Vault' }).first();
  await notice.click();
  await rae.page.getByTestId('vault-route-headline').first().waitFor();
  note(`rae: the notice opened the version: "${await rae.page.getByTestId('vault-route-headline').first().textContent()}"`);
  await snap(rae, 'notice-opened-version');
  await signHere(rae, 'review', 'Reviewed the clinical overview against the protocol');
  await rae.page.reload({ waitUntil: 'networkidle' });
  await openVaultDoc(rae, titles.a);
  note(`rae: after signing: "${await rae.page.getByTestId('vault-route-headline').first().textContent()}"`);
  await snap(rae, 'signed-waiting');

  // 4. Rob: the Review board's "Awaiting my review", then the version.
  const rob = await session('rob');
  await rob.page.goto(`${BASE}/concept2cure/review?program=${PROGRAM}`, { waitUntil: 'networkidle', timeout: 120000 });
  await rob.page.getByRole('button', { name: 'Awaiting my review' }).click();
  await rob.page.getByTestId('review-vault-queue').waitFor();
  await rob.page.waitForTimeout(1000);
  await snap(rob, 'review-board-mine', '[data-testid="review-vault-queue"]');
  await rob.page.getByRole('button', { name: 'Open the version' }).first().click();
  await rob.page.getByTestId('vault-route-headline').first().waitFor();
  await signHere(rob, 'review', 'Reviewed the clinical overview for medical accuracy');

  // 5. Ann: her notice says it is her turn; she approves on the route.
  const ann = await session('ann');
  await openTray(ann);
  await snap(ann, 'tasks-tray-your-turn', '[aria-label="Your work"]');
  await ann.page.getByRole('button', { name: 'Open the version in the Vault' }).first().click();
  await ann.page.getByTestId('vault-route-headline').first().waitFor();
  note(`ann: "${await ann.page.getByTestId('vault-route-headline').first().textContent()}"`);
  await signHere(ann, 'approve', 'Approved for the pre-IND package');
  await openVaultDoc(ann, titles.a);
  note(`ann: after approving: "${await ann.page.getByTestId('vault-route-headline').first().textContent()}" · ${await ann.page.getByTestId('vault-version-stage').first().textContent()}`);
  await snap(ann, 'approved');

  // 6. The sender withdraws B and returns C, each with a reason.
  await openVaultDoc(sender, titles.b);
  await sendRoute(sender, titles.b, 'Ready for review of the stability summary');
  await sender.page.getByRole('button', { name: /^Withdraw:/ }).click();
  const w = sender.page.getByTestId('vault-route-withdraw');
  await w.getByTestId('vr-act-reason').fill('The approver is on leave; re-route next week');
  await phoneChecks(sender, 'withdraw sheet', '[data-testid="vault-route-withdraw"] .de-btn, [data-testid="vault-route-withdraw"] .de-x');
  await snap(sender, 'withdraw-reason');
  await w.getByTestId('vr-act-confirm').click();
  await w.waitFor({ state: 'detached' });
  await sender.page.waitForTimeout(1500);
  note(`sender: withdrew B: "${await sender.page.getByTestId('vault-route-headline').first().textContent()}"`);
  await snap(sender, 'withdrawn');

  await openVaultDoc(sender, titles.c);
  await sendRoute(sender, titles.c, 'Ready for review of the clinical pharmacology summary');
  await sender.page.getByRole('button', { name: /^Return for revision:/ }).click();
  const r = sender.page.getByTestId('vault-route-return');
  await r.getByTestId('vr-act-reason').fill('Section 2.7.2 needs the updated PK table first');
  await snap(sender, 'return-reason');
  await r.getByTestId('vr-act-confirm').click();
  await r.waitFor({ state: 'detached' });
  await sender.page.waitForTimeout(1500);
  note(`sender: returned C: "${await sender.page.getByTestId('vault-route-headline').first().textContent()}" · ${await sender.page.getByTestId('vault-version-stage').first().textContent()}`);
  await snap(sender, 'returned');
  note(`page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
} catch (err) {
  note(`FAILED: ${err instanceof Error ? err.stack : String(err)}`);
  process.exitCode = 1;
} finally {
  writeFileSync(resolve(out, 'run.log'), `${log.join('\n')}\n`);
  await browser.close();
}
