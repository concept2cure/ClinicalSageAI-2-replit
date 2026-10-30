/**
 * RR5 browser acceptance in Authoring, end to end, on a private instance of
 * the working tree (real server, real PostgreSQL, RLS on, the runtime role
 * app_service):
 *
 *   node rr5-acceptance.mjs <desktop|phone>
 *
 * Environment (nothing secret is in this file):
 *   RR5_BASE      the private instance, e.g. http://localhost:5213
 *   RR5_PROGRAM   the acceptance organization's regulatory program id
 *   RR5_PASSWORD  the synthetic acceptance accounts' password
 *
 * Synthetic accounts only (rr5-*@example.test): Avery Author (admin, the
 * sender), Rae Reviewer and Rob Reviewer (reviewer role, project members).
 * jm.smith and sarah.chen are never used.
 *
 *   1. The author makes a document (two sections, through the API), opens it
 *      in the Authoring workbench, and sends it for review to Rae and Rob in
 *      the Send for review dialog: one request, with a reason and a review
 *      due date. The receipt names each reviewer's task; the Tasks rail shows
 *      the route's round.
 *   2. Rae has the task in Tasks, opens the document from the Review board,
 *      reads "Your turn: sign the review." and signs the existing REVIEWER
 *      e-signature (E-sign, meaning Review). Her route task closes.
 *   3. Rob records "changes requested" on the Review board, with a reason.
 *      The route stops: it is returned with his reason, his task and nobody
 *      else's opens, and the author is told.
 *
 * At 390 x 844 (`phone`, a mobile viewport with touch) the same steps run, and
 * on every screen they cross the page must not scroll sideways and every
 * control the step works must be a 44 px target that is not cut off
 * (phoneChecks). Two steps differ only because the layout does: the Tasks rail
 * covers the document, so Rae closes it before E-sign, and the signature's
 * receipt is closed with its Done before the rail is opened again.
 */
import { chromium } from '/opt/node-tools/node_modules/playwright-core/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const viewport = process.argv[2] === 'phone' ? 'phone' : 'desktop';
const SIZE = viewport === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const BASE = process.env.RR5_BASE ?? 'http://localhost:5213';
const PROGRAM = process.env.RR5_PROGRAM;
const PASSWORD = process.env.RR5_PASSWORD;
if (!PROGRAM || !PASSWORD) throw new Error('RR5_PROGRAM and RR5_PASSWORD are required');
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, viewport);
mkdirSync(out, { recursive: true });
const tag = `${viewport === 'phone' ? 'P' : 'D'}${Date.now().toString(36).slice(-4).toUpperCase()}`;
const TITLE = `Module 2.5 Clinical Overview RR5-${tag}`;
const log = [];
const note = (line) => { log.push(line); console.info(line); };
const PEOPLE = { author: 'rr5-author@example.test', rae: 'rr5-reviewer1@example.test', rob: 'rr5-reviewer2@example.test' };
const DUE = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
const CHANGES = 'Section 2.5.2 must cite the final SAP, version 3.0.';

async function apiLogin(email) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', Origin: BASE }, body: JSON.stringify({ email, password: PASSWORD }) });
  const body = await res.json();
  if (!res.ok || !body.accessToken) throw new Error(`API sign-in failed for ${email}: ${res.status}`);
  return { token: body.accessToken, userId: Number(body.user?.id) };
}
async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}`, Origin: BASE, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
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

async function snap(s, name, focus) {
  shot += 1;
  const file = `${String(shot).padStart(2, '0')}-${s.who}-${name}.png`;
  if (focus) await s.page.locator(focus).first().scrollIntoViewIfNeeded().catch(() => {});
  await s.page.screenshot({ path: resolve(out, file), fullPage: false });
  note(`  screenshot ${viewport}/${file}`);
  if (!focus) return;
  const target = s.page.locator(focus).first();
  const text = (await target.innerText().catch(() => '')).replace(/\s*\n\s*/g, ' | ');
  if (text) note(`    text: ${text.slice(0, 700)}`);
}

/**
 * Phone checks: no horizontal scroll, and every control in `selector` a touch
 * target at least 44 px tall that is not cut off.
 *
 * The overflow is measured against the screen's width, not `innerWidth`. On a
 * mobile viewport `innerWidth` is the layout viewport, which a phone browser
 * widens to fit a page that is too wide, so `scrollWidth - innerWidth` was 0
 * on a page 485 px wide (the first phone run, 2026-10-30). The shell's page
 * column scrolls on its own, so its sideways scroll counts too. A control's
 * target is its `<label>` when it is inside one: tapping the label works it.
 * A control is cut off when an ancestor that clips without scrolling sideways
 * (overflow hidden or clip) hides part of its width: no scroll reaches it.
 * `{ assert: false }` records what it measures without failing the run: for a
 * known open item outside this slice, so the log still shows it.
 */
async function phoneChecks(s, where, selector, { assert = true } = {}) {
  if (viewport !== 'phone') return;
  const r = await s.page.evaluate(({ sel, screenWidth }) => {
    /* The shell's page column (`.page`) scrolls on both axes, so a page too
       wide for it scrolls sideways inside it, not in the document. */
    const column = [...document.querySelectorAll('.page')].filter((el) => el.offsetParent !== null)
      .reduce((most, el) => Math.max(most, el.scrollWidth - el.clientWidth), 0);
    const page = Math.max(document.documentElement.scrollWidth, window.innerWidth) + column;
    const small = sel ? [...document.querySelectorAll(sel)].filter((el) => el.offsetParent !== null)
      .map((el) => ({ el, target: el.closest('label') ?? el }))
      .map(({ el, target }) => ({ text: (el.getAttribute('aria-label') || target.textContent || '').trim().slice(0, 40), h: Math.round(target.getBoundingClientRect().height) }))
      .filter((x) => x.h < 44) : [];
    const cut = sel ? [...document.querySelectorAll(sel)].filter((el) => el.offsetParent !== null).filter((el) => {
      const box = el.getBoundingClientRect();
      let left = box.left, right = box.right;
      for (let n = el.parentElement; n; n = n.parentElement) {
        const ox = window.getComputedStyle(n).overflowX;
        if (ox === 'hidden' || ox === 'clip') { const b = n.getBoundingClientRect(); left = Math.max(left, b.left); right = Math.min(right, b.right); }
      }
      return right - left < box.width - 1;
    }).map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)) : [];
    return { overflow: page - screenWidth, layout: `${window.innerWidth}x${window.innerHeight}`, small, cut };
  }, { sel: selector ?? '', screenWidth: SIZE.width });
  note(`  phone ${where}: horizontal overflow ${r.overflow}px (layout viewport ${r.layout}); controls under 44px: ${JSON.stringify(r.small)}; controls cut off: ${JSON.stringify(r.cut)}`);
  if (!assert) return;
  if (r.overflow > 0) throw new Error(`${where}: horizontal scroll of ${r.overflow}px at ${SIZE.width} wide`);
  if (r.small.length) throw new Error(`${where}: ${r.small.length} control(s) under 44 px`);
  if (r.cut.length) throw new Error(`${where}: ${r.cut.length} control(s) cut off`);
}

async function openInWorkbench(s) {
  await s.page.goto(`${BASE}/concept2cure/document-authoring?program=${PROGRAM}`, { waitUntil: 'networkidle', timeout: 120000 });
  await s.page.getByText(TITLE, { exact: false }).first().click();
  await s.page.getByText('Clinical rationale', { exact: false }).first().waitFor({ timeout: 30000 }).catch(() => {});
  await s.page.waitForTimeout(1500);
}

async function openFromBoard(s) {
  await s.page.goto(`${BASE}/concept2cure/review?program=${PROGRAM}`, { waitUntil: 'networkidle', timeout: 120000 });
  await s.page.locator('.lrow', { hasText: TITLE }).first().click();
  await s.page.waitForTimeout(800);
}

/** The person's Tasks tray (the bell: tasks, approvals and notices), opened: whether it lists each of `texts`. */
async function tray(s, texts) {
  await s.page.goto(`${BASE}/concept2cure/home?program=${PROGRAM}`, { waitUntil: 'networkidle', timeout: 120000 });
  await s.page.locator('.tt-trigger').first().click();
  await s.page.getByText(texts[0]).first().waitFor({ timeout: 20000 }).catch(() => {});
  await s.page.waitForTimeout(800);
  const body = await s.page.innerText('body');
  return texts.map((t) => body.includes(t));
}

async function openTasksRail(s) {
  await s.page.getByTestId('tasks-rail-open').click();
  await s.page.getByTestId('ar-round').waitFor({ timeout: 30000 });
  await s.page.waitForTimeout(800);
}

/**
 * At a phone's width the Tasks rail is a sheet over the whole document, so the
 * document's own controls (E-sign) are under it. A person closes it with its
 * close control first; on the desktop it sits beside the document.
 */
async function closeTasksRailOnPhone(s) {
  if (viewport !== 'phone') return;
  await phoneChecks(s, 'the Tasks rail\'s close control', 'aside.ed-comments .ed-comments-close');
  await s.page.getByRole('button', { name: 'Close tasks' }).click();
  await s.page.getByTestId('ar-round').waitFor({ state: 'detached', timeout: 10000 });
}

try {
  // 1 ── the document, and the author's one request ─────────────────────────
  const author = await apiLogin(PEOPLE.author);
  const rae = await apiLogin(PEOPLE.rae);
  const rob = await apiLogin(PEOPLE.rob);
  const created = await api(author.token, 'POST', '/api/authoring/docs', { title: TITLE, module: 'M2', client_program_id: PROGRAM });
  if (created.status !== 201) throw new Error(`document create ${created.status}`);
  const docId = String(created.json.document?.id ?? created.json.id);
  for (const [i, [code, title, body]] of [['2.5.1', 'Clinical rationale', 'The product is developed for adults with the target condition.'],
    ['2.5.2', 'Statistical approach', 'The analysis follows the statistical analysis plan.']].entries()) {
    const sec = await api(author.token, 'POST', '/api/authoring/sections', { doc_id: docId, code, title, content: `<p>${body}</p>`, order_index: i });
    if (sec.status !== 201) throw new Error(`section create ${sec.status}`);
  }
  note(`document ${docId} "${TITLE}" with two sections (API)`);

  const a = await session('author');
  await openInWorkbench(a);
  await a.page.getByTestId('send-for-review-open').click();
  const dlg = a.page.getByTestId('send-for-review-dialog');
  await dlg.waitFor();
  await dlg.getByTestId(`sfr-reviewer-${rae.userId}`).waitFor();
  await a.page.waitForTimeout(800);
  await snap(a, 'send-for-review-open', '[data-testid="send-for-review-dialog"]');
  await phoneChecks(a, 'Send for review dialog', '[data-testid="send-for-review-dialog"] button, [data-testid="send-for-review-dialog"] input[type="checkbox"]');
  await dlg.getByTestId(`sfr-reviewer-${rae.userId}`).check();
  await dlg.getByTestId(`sfr-reviewer-${rob.userId}`).check();
  await dlg.getByTestId('sfr-reason').fill('Ready for medical review before the pre-IND package.');
  await dlg.getByTestId('sfr-due').fill(DUE);
  await dlg.getByTestId('sfr-instructions').fill('Check the clinical claims against the cited sources.');
  await snap(a, 'send-for-review-filled', '[data-testid="send-for-review-dialog"]');
  await dlg.getByTestId('sfr-submit').click();
  await dlg.getByTestId('sfr-tasks').waitFor({ timeout: 30000 });
  await snap(a, 'receipt-one-request-two-route-tasks', '[data-testid="sfr-result"]');
  const receipt = await dlg.getByTestId('sfr-tasks').innerText();
  if (!/Task ROUTE-.*Rae Reviewer/s.test(receipt) || !/Task ROUTE-.*Rob Reviewer/s.test(receipt)) throw new Error(`receipt does not name both route tasks: ${receipt}`);
  await dlg.getByTestId('sfr-done').click();
  await a.page.getByTestId('ar-round').waitFor({ timeout: 30000 });
  await snap(a, 'round-after-send', '[data-testid="ar-round"]');
  const sent = await a.page.getByTestId('ar-round-headline').innerText();
  if (!/Waiting for (Rae Reviewer and Rob Reviewer|Rob Reviewer and Rae Reviewer)\./.test(sent)) throw new Error(`round after send: ${sent}`);
  await phoneChecks(a, 'the round in the Tasks rail', '[data-testid="ar-round"] button');

  // 2 ── Rae: her task, her turn, the REVIEWER e-sign ────────────────────────
  const r = await session('rae');
  const [listed, told] = await tray(r, [`Review: ${TITLE}`, `Review requested: ${TITLE}`]);
  await snap(r, 'tasks-tray', '.tt-panel');
  note(`  rae's Tasks list "Review: ${TITLE}": ${listed}; her notices include "Review requested: ${TITLE}": ${told}`);
  if (!listed || !told) throw new Error('Rae\'s Tasks do not list her review task and its notice');
  await phoneChecks(r, 'Rae\'s Tasks tray', '.tt-panel button');
  await phoneChecks(r, 'the shell\'s top bar, with the tray\'s trigger (open item, recorded and not asserted)', '.topbar button, .topbar a', { assert: false });
  await r.page.keyboard.press('Escape').catch(() => {});
  await openFromBoard(r);
  await snap(r, 'review-board-awaiting', '.split-detail');
  await phoneChecks(r, 'the Review board', '.split-detail .dt-acts .btn, [data-testid="rv-open-in-editor"], .rv-reply .btn');
  await r.page.getByTestId('rv-open-in-editor').click();
  await r.page.waitForTimeout(2500);
  await openTasksRail(r);
  await snap(r, 'round-your-turn', '[data-testid="ar-round"]');
  const turn = await r.page.getByTestId('ar-round-headline').innerText();
  if (turn.trim() !== 'Your turn: sign the review.') throw new Error(`Rae's headline: ${turn}`);
  await phoneChecks(r, 'Rae\'s round in the Tasks rail', '[data-testid="ar-round"] button');
  await closeTasksRailOnPhone(r);
  await phoneChecks(r, 'the document\'s E-sign control', '.ed-doc-commit button');
  await r.page.getByRole('button', { name: /E-sign/ }).first().click();
  const sign = r.page.getByRole('dialog');
  const commit = sign.getByRole('button', { name: /Sign and commit/ });
  await commit.waitFor();
  await r.page.waitForTimeout(600);
  for (let i = 0; i < 5 && !(await commit.isEnabled()); i++) {
    await sign.getByLabel(/Reason for this action/).fill('I reviewed the saved document as it stands.');
    await sign.getByLabel(/Password/).fill(PASSWORD);
    await r.page.waitForTimeout(400);
  }
  await snap(r, 'reviewer-esign', '[role="dialog"]');
  await phoneChecks(r, 'the REVIEWER e-sign dialog', '[role="dialog"] button');
  await commit.click();
  if (viewport === 'phone') {
    /* The receipt ("Signature applied") is a modal over the document, and
       the Tasks rail's toggle is under it: Done closes it. */
    const done = r.page.locator('.es-modal').getByRole('button', { name: 'Done' });
    await done.waitFor({ timeout: 30000 });
    await phoneChecks(r, 'the signature receipt', '.es-modal button');
    await done.click();
    await done.waitFor({ state: 'detached', timeout: 10000 });
  } else {
    await r.page.getByText(/Signed|recorded/i).first().waitFor({ timeout: 30000 }).catch(() => {});
    const close = sign.getByRole('button', { name: /Close|Done/ }).first();
    if (await close.isVisible().catch(() => false)) await close.click();
  }
  await r.page.waitForTimeout(2500);
  if (viewport === 'phone') await openTasksRail(r);
  await snap(r, 'round-after-review-signature', '[data-testid="ar-round"]');
  const signed = await r.page.getByTestId('ar-round-headline').innerText();
  if (!/^You signed at \d\d:\d\d UTC; waiting for Rob Reviewer\.$/.test(signed.trim())) throw new Error(`Rae after signing: ${signed}`);

  // 3 ── Rob: "changes requested" on the Review board; the route stops ───────
  const b = await session('rob');
  await openFromBoard(b);
  await phoneChecks(b, 'Rob\'s Review board', '.split-detail .dt-acts .btn, [data-testid="rv-open-in-editor"], .rv-reply .btn');
  await b.page.getByRole('button', { name: /Request changes/ }).first().click();
  const decision = b.page.locator('.rv-decision-dialog');
  await decision.waitFor();
  await decision.locator('#rv-decision').selectOption('changes_requested');
  await decision.locator('#rv-reason').fill(CHANGES);
  await snap(b, 'changes-requested-decision', '.rv-decision-dialog');
  await phoneChecks(b, 'Rob\'s decision dialog', '.rv-decision-dialog button, .rv-decision-dialog select');
  await decision.getByRole('button', { name: 'Record change request' }).click();
  await decision.locator('.rv-decision-receipt').waitFor({ timeout: 30000 });
  await snap(b, 'changes-requested-recorded', '.rv-decision-receipt');
  await decision.getByRole('button', { name: 'Close' }).click().catch(() => {});

  const after = await api(author.token, 'GET', `/api/authoring/documents/${docId}/review-route`);
  const round = after.json?.round;
  note(`  route ${round?.route?.id}: status ${round?.route?.status}, reason "${round?.route?.statusReason}"; members ${JSON.stringify(round?.members?.map((m) => [m.printedName, m.outcome]))}`);
  if (round?.route?.status !== 'returned' || round?.route?.statusReason !== CHANGES) throw new Error('the route was not returned with Rob\'s reason');

  await openInWorkbench(a);
  await openTasksRail(a);
  await snap(a, 'round-returned', '[data-testid="ar-round"]');
  const returned = await a.page.getByTestId('ar-round-headline').innerText();
  if (returned.trim() !== `Returned by Rob Reviewer: ${CHANGES}`) throw new Error(`author's headline after the change request: ${returned}`);
  const [returnedNotice] = await tray(a, [`Returned for revision: ${TITLE}`]);
  await snap(a, 'notice-returned-for-revision', '.tt-panel');
  await phoneChecks(a, 'the author\'s Tasks tray', '.tt-panel button');
  note(`  author's notices include "Returned for revision: ${TITLE}": ${returnedNotice}`);
  if (!returnedNotice) throw new Error('the author was not told the route was returned');
  await a.page.keyboard.press('Escape').catch(() => {});
  await phoneChecks(a, 'the returned round', '[data-testid="ar-round"] button');
  note(`page errors: ${errors.length ? JSON.stringify(errors) : 'none'}`);
  note('RESULT: pass');
} catch (e) {
  note(`RESULT: fail — ${e.message.split('\n')[0]}`);
  process.exitCode = 1;
  writeFileSync(resolve(out, 'fail-detail.txt'), `${e.stack ?? e.message}\n`);
  for (const [i, ctx] of browser.contexts().entries()) {
    for (const [j, pg] of ctx.pages().entries()) await pg.screenshot({ path: resolve(out, `fail-${i}-${j}.png`) }).catch(() => {});
  }
} finally {
  writeFileSync(resolve(out, 'run.log'), `${log.join('\n')}\n`);
  await browser.close();
}
