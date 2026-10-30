/**
 * RR2 browser acceptance on a QMS controlled document: two designated QMS
 * approvers, end to end, on a private instance of the working tree (real
 * server, real PostgreSQL, RLS on, the runtime role app_service).
 *
 *   node rr2-qms-acceptance.mjs <desktop|phone>
 *
 * Environment (nothing secret is in this file):
 *   RR2_BASE      the private instance, e.g. http://localhost:5202
 *   RR2_PROGRAM   the acceptance organization's regulatory program id
 *   RR2_PASSWORD  the synthetic acceptance accounts' password
 *
 * The accounts are RR4's synthetic ones (rr4-*@example.test). In that
 * organization Quinn QA and Ann Approver are both designated QMS approvers.
 * jm.smith and sarah.chen are never used.
 *
 * The author sends an SOP in the register's route form, naming Rae as reviewer
 * and Quinn and Ann as QMS approvers. Rae signs the review. Quinn's approval
 * dialog says "Your approval is 1 of 2 required". After Quinn signs, the SOP is
 * still under review and Quinn's line reads "Approved (1 of 2 required)". Ann's
 * approval makes it Effective.
 *
 * The harness (sign-in, snap, phoneChecks, openRegister, openPanel, esign) is
 * RR4's (../../2026-10-29-RR4/acceptance/rr4-acceptance.mjs).
 */
import { chromium } from '/opt/node-tools/node_modules/playwright-core/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const viewport = process.argv[2] === 'phone' ? 'phone' : 'desktop';
const SIZE = viewport === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const BASE = process.env.RR2_BASE ?? 'http://localhost:5202';
const PROGRAM = process.env.RR2_PROGRAM;
const PASSWORD = process.env.RR2_PASSWORD;
if (!PROGRAM || !PASSWORD) throw new Error('RR2_PROGRAM and RR2_PASSWORD are required');
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, 'qms', viewport);
mkdirSync(out, { recursive: true });
const tag = `${viewport === 'phone' ? 'P' : 'D'}${Date.now().toString(36).slice(-4).toUpperCase()}`;
const log = [];
const note = (line) => { log.push(line); console.info(line); };

const PEOPLE = {
  admin: { email: 'rr4-admin@example.test', name: 'Ada Admin' },
  sam: { email: 'rr4-author@example.test', name: 'Sam Sender' },
  rae: { email: 'rr4-reviewer@example.test', name: 'Rae Reviewer' },
  qa: { email: 'rr4-qa@example.test', name: 'Quinn QA' },
  ann: { email: 'rr4-approver@example.test', name: 'Ann Approver' },
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
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** An SOP authored in the canonical editor, through the product's own create and section save. */
async function authoredSop(token, title) {
  const created = await api(token, 'POST', '/api/mdx/qms/documents', { title, docType: 'sop', programId: PROGRAM, templateKey: 'sop', reason: `Author ${title} for the RR2 acceptance run` });
  if (created.status !== 201) throw new Error(`create failed: ${created.status} ${JSON.stringify(created.json).slice(0, 300)}`);
  const doc = created.json.data;
  const sections = await api(token, 'GET', `/api/authoring/docs/${doc.authoring_document_id}/sections`);
  const list = sections.json?.sections ?? sections.json?.data ?? sections.json ?? [];
  const first = (Array.isArray(list) ? list : [])[0];
  if (!first?.id) throw new Error(`no sections read: ${sections.status} ${JSON.stringify(sections.json).slice(0, 200)}`);
  const saved = await api(token, 'PATCH', `/api/authoring/sections/${first.id}`, { content: `<p>${title}: record each deviation within one working day, with its reason and the person who found it.</p>`, changeReason: 'Write the procedure text for review' });
  if (saved.status >= 300) throw new Error(`section save failed: ${saved.status} ${JSON.stringify(saved.json).slice(0, 300)}`);
  note(`created ${doc.doc_number} "${title}" (document ${doc.id}) with saved text`);
  return { id: Number(doc.id), number: doc.doc_number };
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
  await page.fill('#login-email', PEOPLE[who].email);
  await page.fill('#login-password', PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login') && !u.pathname.startsWith('/auth'), { timeout: 60000 });
  note(`${who}: signed in`);
  return { context, page, who };
}

async function snap(s, name, focus) {
  await s.page.waitForTimeout(450); // the drawer's open animation (journey-v2.css de-slide / de-fade) settles first
  if (focus) await s.page.locator(focus).first().scrollIntoViewIfNeeded().catch(() => {});
  shot += 1;
  const file = `${String(shot).padStart(2, '0')}-${s.who}-${name}.png`;
  await s.page.screenshot({ path: resolve(out, file), fullPage: false });
  note(`  screenshot ${viewport}/${file}`);
  if (!focus) return;
  const target = s.page.locator(focus).first();
  if (!(await target.isVisible().catch(() => false))) return;
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

async function openRegister(s) {
  await s.page.goto(`${BASE}/concept2cure/quality?program=${PROGRAM}`, { waitUntil: 'networkidle', timeout: 120000 });
  await s.page.locator('.qms-row').first().waitFor({ timeout: 60000 });
}
const rowOf = (s, number) => s.page.locator('.qms-row', { hasText: number }).first();
async function routeLine(s, number) {
  const line = rowOf(s, number).locator('.qms-route-line');
  await line.waitFor();
  return (await line.textContent())?.trim();
}
async function openPanel(s, number) {
  const row = rowOf(s, number);
  await row.scrollIntoViewIfNeeded();
  await row.getByTestId('qms-route-open').click();
  const panel = s.page.getByTestId('qms-route-panel');
  await panel.waitFor();
  return panel;
}
/** The platform's signing dialog (EsignModal): reason, password, Sign and commit; waits for the signed POST's answer. */
async function esign(s, reason, path) {
  const area = s.page.locator('textarea[placeholder^="A short, specific reason"]');
  await area.waitFor();
  await s.page.waitForTimeout(500); // the dialog's open animation settles before typing
  await area.fill(reason);
  await s.page.locator('input[type=password]').fill(PASSWORD);
  const commit = s.page.getByRole('button', { name: /Sign and commit/ });
  for (let i = 0; i < 40 && !(await commit.isEnabled()); i++) await s.page.waitForTimeout(250);
  const answered = s.page.waitForResponse((r) => r.url().endsWith(path) && r.request().method() === 'POST', { timeout: 30000 });
  await commit.click();
  const res = await answered;
  note(`  ${s.who}: POST ${path} → ${res.status()}`);
  if (res.status() >= 300) throw new Error(`${path} refused: ${res.status()} ${(await res.text()).slice(0, 300)}`);
}
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);


const memberLine = async (panel, id) => ((await panel.getByTestId(`qms-route-member-${id}`).innerText().catch(() => '')) || '').trim();

try {
  const ids = {};
  for (const k of Object.keys(PEOPLE)) ids[k] = (await apiLogin(PEOPLE[k].email)).userId;
  const samApi = await apiLogin(PEOPLE.sam.email);
  const sop = await authoredSop(samApi.token, `Deviation handling ${tag}`);

  // The author sends it, naming one reviewer and two QMS approvers.
  const sam = await session('sam');
  await openRegister(sam);
  await rowOf(sam, sop.number).getByRole('button', { name: /Send for review/ }).click();
  const form = sam.page.getByTestId('qms-route-form');
  await form.getByTestId(`qms-approver-${ids.qa}`).waitFor();
  await form.getByTestId(`qms-approver-${ids.qa}`).check();
  await form.getByTestId(`qms-approver-${ids.ann}`).check();
  await form.getByTestId(`qms-reviewer-${ids.rae}`).check();
  await form.getByTestId('qms-review-due').fill(day(3));
  await form.getByTestId('qms-approval-due').fill(day(6));
  await form.getByTestId('qms-route-reason').fill('Ready for QA and site quality approval before rollout');
  await phoneChecks(sam, 'the route form', '[data-testid="qms-route-form"] button, [data-testid="qms-route-form"] .rf-opt');
  await snap(sam, 'route-form-two-qms-approvers', '[data-testid="qms-route-approver"]');
  await form.getByTestId('qms-route-send').click();
  await form.waitFor({ state: 'detached', timeout: 30000 });
  await openRegister(sam);
  note(`sam: ${sop.number} row reads "${await routeLine(sam, sop.number)}"`);
  const panelSam = await openPanel(sam, sop.number);
  await phoneChecks(sam, 'the route sheet', '[data-testid="qms-route-panel"] button');
  await snap(sam, 'route-sheet-two-approvers', '[data-testid="qms-route-panel"]');
  void panelSam;
  await sam.context.close();

  // The reviewer signs.
  const rae = await session('rae');
  await openRegister(rae);
  const panelRae = await openPanel(rae, sop.number);
  await panelRae.getByTestId('qms-route-sign').click();
  await esign(rae, 'I reviewed the deviation handling procedure as written', `/api/mdx/qms/documents/${sop.id}/review`);
  await rae.context.close();

  // The first QMS approver: told which approval theirs is; the SOP stays under review.
  const qa = await session('qa');
  await openRegister(qa);
  note(`qa: ${sop.number} row reads "${await routeLine(qa, sop.number)}"`);
  const panelQa = await openPanel(qa, sop.number);
  await panelQa.getByTestId('qms-route-approve').click();
  await qa.page.locator('textarea[placeholder^="A short, specific reason"]').waitFor();
  const dialogText = (await qa.page.getByRole('dialog').last().innerText()).replace(/\s*\n\s*/g, ' | ');
  note(`qa: the approval dialog says "Your approval is 1 of 2 required": ${dialogText.includes('Your approval is 1 of 2 required')}`);
  if (!dialogText.includes('Your approval is 1 of 2 required')) throw new Error('the first approver is not told their share');
  await snap(qa, 'approve-dialog-1-of-2');
  await esign(qa, 'Approved as QA, the first of two QMS approvers', `/api/mdx/qms/documents/${sop.id}/approve`);
  await openRegister(qa);
  const statusMid = (await rowOf(qa, sop.number).locator('.qms-pill').last().textContent())?.trim();
  const panelQa2 = await openPanel(qa, sop.number);
  const qaLine = await memberLine(panelQa2, ids.qa);
  note(`qa: after the first approval ${sop.number} is "${statusMid}"; Quinn's line "${qaLine}"; headline "${(await panelQa2.getByTestId('qms-route-headline').textContent())?.trim()}"`);
  if (/Effective/i.test(statusMid ?? '')) throw new Error('the first of two approvals made the SOP effective');
  if (!qaLine.includes('Approved (1 of 2 required)')) throw new Error('the first approver does not read 1 of 2');
  await snap(qa, 'approved-1-of-2-still-under-review', '[data-testid="qms-route-panel"]');
  await qa.context.close();

  // The second QMS approver makes it effective.
  const ann = await session('ann');
  await openRegister(ann);
  note(`ann: ${sop.number} row reads "${await routeLine(ann, sop.number)}"`);
  const panelAnn = await openPanel(ann, sop.number);
  await panelAnn.getByTestId('qms-route-approve').click();
  await esign(ann, 'Approved as site quality, the second QMS approver', `/api/mdx/qms/documents/${sop.id}/approve`);
  await openRegister(ann);
  const statusEnd = (await rowOf(ann, sop.number).locator('.qms-pill').last().textContent())?.trim();
  note(`ann: ${sop.number} is now "${statusEnd}"`);
  if (!/Effective/i.test(statusEnd ?? '')) throw new Error(`${sop.number} is not effective after the last approval: ${statusEnd}`);
  // An effective row offers no route sheet; the completed round is read through the route's own read.
  await snap(ann, 'effective-both-approved', `.qms-row:has-text("${sop.number}")`);
  const round = await api((await apiLogin(PEOPLE.ann.email)).token, 'GET', `/api/mdx/qms/documents/${sop.id}/review-route`);
  note(`round of ${sop.number}: status ${round.json?.round?.route?.status}; approvalComplete ${round.json?.round?.approvalComplete}; members ${JSON.stringify(round.json?.round?.members?.map((m) => `${m.printedName}:${m.role}:${m.outcome}`))}`);
  if (round.json?.round?.route?.status !== 'complete') throw new Error('the route is not complete after the last approval');
  await ann.context.close();
  note(`page errors: ${errors.length ? JSON.stringify(errors) : 'none'}`);
  if (errors.length) process.exitCode = 1;
} catch (err) {
  note(`FAILED: ${err instanceof Error ? err.stack : String(err)}`);
  process.exitCode = 1;
} finally {
  writeFileSync(resolve(out, 'run.log'), `${log.join('\n')}\n`);
  await browser.close();
}
