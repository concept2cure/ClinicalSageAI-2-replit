/**
 * RR4 browser acceptance: the review route on a QMS controlled document, end
 * to end, on a private instance of the working tree (real server, real
 * PostgreSQL, RLS on).
 *
 *   node rr4-acceptance.mjs <desktop|phone>
 *
 * Environment (nothing secret is in this file):
 *   RR4_BASE      the private instance, e.g. http://localhost:5198
 *   RR4_PROGRAM   the acceptance organization's regulatory program id
 *   RR4_PASSWORD  the synthetic acceptance accounts' password
 *   RR4_DESIGNATE the account the administrator designates on this run
 *                 ('qa' on the desktop run, 'ann' on the phone run)
 *
 * The accounts are synthetic (rr4-*@example.test). jm.smith and sarah.chen
 * are never used.
 *
 * Steps, each with a screenshot in ./<viewport>/:
 *   1. the administrator designates a QMS approver in Admin and access, with a
 *      reason, and the member's drawer says "Designated";
 *   2. the author sends SOP A for review in the register's route form, naming
 *      one reviewer and the designated approver (a non-designated Approver is
 *      not offered as approver, and the form says why); the row shows the round;
 *   3. the reviewer signs the review from the route's sheet; the approver's
 *      row reads "Your turn: approve."; the approver approves, and SOP A is
 *      Effective with every member signed;
 *   4. SOP B, sent the same way, is returned for revision by the reviewer with
 *      a reason, and is a draft again with "Returned by Rae Reviewer: …".
 */
import { chromium } from '/opt/node-tools/node_modules/playwright-core/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const viewport = process.argv[2] === 'phone' ? 'phone' : 'desktop';
const SIZE = viewport === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const BASE = process.env.RR4_BASE ?? 'http://localhost:5198';
const PROGRAM = process.env.RR4_PROGRAM;
const PASSWORD = process.env.RR4_PASSWORD;
const DESIGNATE = process.env.RR4_DESIGNATE ?? (viewport === 'phone' ? 'ann' : 'qa');
if (!PROGRAM || !PASSWORD) throw new Error('RR4_PROGRAM and RR4_PASSWORD are required');
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, viewport);
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
  const created = await api(token, 'POST', '/api/mdx/qms/documents', { title, docType: 'sop', programId: PROGRAM, templateKey: 'sop', reason: `Author ${title} for the RR4 acceptance run` });
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

try {
  const ids = {};
  for (const k of Object.keys(PEOPLE)) ids[k] = (await apiLogin(PEOPLE[k].email)).userId;
  const samApi = await apiLogin(PEOPLE.sam.email);

  // 1. The administrator designates a QMS approver.
  const admin = await session('admin');
  await admin.page.goto(`${BASE}/concept2cure/admin-console`, { waitUntil: 'networkidle', timeout: 120000 });
  const designee = PEOPLE[DESIGNATE];
  await admin.page.locator('button.ctable-row', { hasText: designee.name }).first().click();
  const drawer = admin.page.locator('.adm-drawer');
  await drawer.waitFor();
  note(`admin: ${designee.name}'s QMS approver standing before: "${(await drawer.getByTestId('member-qms-approver-standing').textContent())?.trim()}"`);
  await drawer.getByTestId('member-qms-approver').click();
  const form = admin.page.getByRole('dialog');
  await form.waitFor();
  await snap(admin, 'designate-form', '[role="dialog"]');
  await form.getByLabel(/Reason/).fill(`${designee.name} approves SOPs for the site QA function`);
  // The governed form's own controls; its header close is the shared drawer's 30 px .de-x (C2CForm, pre-existing; see the README).
  await phoneChecks(admin, 'the designation form', '[role="dialog"] button:not(.de-x), [role="dialog"] textarea');
  await form.getByRole('button', { name: 'Designate' }).click();
  await drawer.getByTestId('member-qms-approver-standing').filter({ hasText: /^Designated$/ }).waitFor({ timeout: 20000 });
  note(`admin: ${designee.name} is now "${(await drawer.getByTestId('member-qms-approver-standing').textContent())?.trim()}"`);
  await snap(admin, 'designated', '.adm-drawer');
  await admin.context.close();

  // 2. The author sends SOP A for review in the route form.
  const sopA = await authoredSop(samApi.token, `Deviation handling ${tag}`);
  const sopB = await authoredSop(samApi.token, `Line clearance ${tag}`);
  const sam = await session('sam');
  await openRegister(sam);
  await rowOf(sam, sopA.number).scrollIntoViewIfNeeded();
  await rowOf(sam, sopA.number).getByRole('button', { name: /Send for review/ }).click();
  const routeForm = sam.page.getByTestId('qms-route-form');
  await routeForm.waitFor();
  await routeForm.getByTestId(`qms-approver-${ids.qa}`).waitFor();
  const notOffered = await routeForm.getByTestId('qms-route-not-offered').textContent().catch(() => '');
  note(`sam: approver list: ${JSON.stringify(await routeForm.getByTestId('qms-route-approver').locator('.rf-opt').evaluateAll((els) => els.map((e) => `${e.textContent?.trim()}${e.classList.contains('is-disabled') ? ' (not offered)' : ''}`)))}`);
  note(`sam: approver list notes: ${JSON.stringify(await routeForm.getByTestId('qms-route-approver').locator('.rf-note').allTextContents())}`);
  note(`sam: ${notOffered?.trim()}`);
  await routeForm.getByTestId(`qms-reviewer-${ids.rae}`).check();
  await routeForm.getByTestId(`qms-approver-${ids.qa}`).check();
  await routeForm.getByTestId('qms-review-due').fill(day(3));
  await routeForm.getByTestId('qms-approval-due').fill(day(5));
  await routeForm.getByTestId('qms-route-reason').fill('Ready for QA review before the site rollout');
  await snap(sam, 'route-form', '[data-testid="qms-route-form"]');
  await phoneChecks(sam, 'the route form', '[data-testid="qms-route-form"] button, [data-testid="qms-route-form"] .rf-opt');
  await routeForm.getByTestId('qms-route-send').click();
  await routeForm.waitFor({ state: 'detached', timeout: 20000 });
  note(`sam: ${sopA.number} row reads "${await routeLine(sam, sopA.number)}"`);
  await snap(sam, 'sent-round-in-register', `.qms-row:has-text("${sopA.number}")`);
  const panelSam = await openPanel(sam, sopA.number);
  await snap(sam, 'route-sheet', '[data-testid="qms-route-panel"]');
  await phoneChecks(sam, 'the route sheet', '[data-testid="qms-route-panel"] button');
  await sam.page.getByRole('button', { name: 'Close' }).last().click();
  // SOP B goes on the same route through the API (the form is shown above).
  const sentB = await api(samApi.token, 'PATCH', `/api/mdx/qms/documents/${sopB.id}`, {
    status: 'in_review', reason: 'Ready for QA review before the site rollout',
    route: { reviewers: [ids.rae], approvers: [ids.qa], order: 'parallel', reviewDueDate: day(3), approvalDueDate: day(5) },
  });
  if (sentB.status !== 200) throw new Error(`send B failed: ${sentB.status} ${JSON.stringify(sentB.json).slice(0, 300)}`);
  note(`sam: ${sopB.number} sent on the same route through the API`);
  await sam.context.close();
  void panelSam;

  // 3. The reviewer signs; the approver approves.
  const rae = await session('rae');
  await openRegister(rae);
  note(`rae: ${sopA.number} row reads "${await routeLine(rae, sopA.number)}"`);
  const panelRae = await openPanel(rae, sopA.number);
  await snap(rae, 'your-turn-review', '[data-testid="qms-route-panel"]');
  await panelRae.getByTestId('qms-route-sign').click();
  await snap(rae, 'review-signature-dialog');
  await esign(rae, 'I reviewed the deviation handling procedure as written', `/api/mdx/qms/documents/${sopA.id}/review`);
  await snap(rae, 'review-signed-receipt');
  await openRegister(rae);
  note(`rae: after signing, ${sopA.number} row reads "${await routeLine(rae, sopA.number)}"`);
  await snap(rae, 'signed-waiting', `.qms-row:has-text("${sopA.number}")`);
  const qa = await session('qa');
  await openRegister(qa);
  note(`qa: ${sopA.number} row reads "${await routeLine(qa, sopA.number)}"`);
  const panelQa = await openPanel(qa, sopA.number);
  await snap(qa, 'your-turn-approve', '[data-testid="qms-route-panel"]');
  await panelQa.getByTestId('qms-route-approve').click();
  await esign(qa, 'Approved as the designated QMS approver', `/api/mdx/qms/documents/${sopA.id}/approve`);
  await snap(qa, 'approval-signed-receipt');
  await openRegister(qa);
  const statusA = (await rowOf(qa, sopA.number).locator('.qms-pill').last().textContent())?.trim();
  note(`qa: ${sopA.number} is now "${statusA}"`);
  if (!/Effective/i.test(statusA ?? '')) throw new Error(`${sopA.number} is not effective after the approval: ${statusA}`);
  await snap(qa, 'approved-effective', `.qms-row:has-text("${sopA.number}")`);
  const round = await api((await apiLogin(PEOPLE.qa.email)).token, 'GET', `/api/mdx/qms/documents/${sopA.id}/review-route`);
  note(`round of ${sopA.number}: status ${round.json?.round?.route?.status}; members ${JSON.stringify(round.json?.round?.members?.map((m) => `${m.printedName}:${m.role}:${m.outcome}`))}`);
  await qa.context.close();

  // 4. SOP B is returned for revision by the reviewer.
  await openRegister(rae);
  const panelB = await openPanel(rae, sopB.number);
  await panelB.getByTestId('qms-route-return').click();
  const act = rae.page.getByTestId('qms-act-return');
  await act.waitFor();
  await act.getByTestId('qms-act-reason').fill('Section 4 cites the retired line-clearance form; update it first');
  await snap(rae, 'return-reason', '[data-testid="qms-act-return"]');
  await phoneChecks(rae, 'the return sheet', '[data-testid="qms-act-return"] button');
  await act.getByTestId('qms-act-confirm').click();
  await act.waitFor({ state: 'detached', timeout: 20000 });
  await openRegister(rae);
  const statusB = (await rowOf(rae, sopB.number).locator('.qms-pill').last().textContent())?.trim();
  note(`rae: ${sopB.number} is now "${statusB}"; row reads "${await routeLine(rae, sopB.number)}"`);
  if (!/Draft/i.test(statusB ?? '')) throw new Error(`${sopB.number} is not a draft after the return: ${statusB}`);
  await snap(rae, 'returned-draft', `.qms-row:has-text("${sopB.number}")`);
  await phoneChecks(rae, 'the register', '.qms-route-acts button');
  await rae.context.close();
  note(`page errors: ${errors.length ? JSON.stringify(errors) : 'none'}`);
} catch (err) {
  note(`FAILED: ${err instanceof Error ? err.stack : String(err)}`);
  process.exitCode = 1;
} finally {
  writeFileSync(resolve(out, 'run.log'), `${log.join('\n')}\n`);
  await browser.close();
}
