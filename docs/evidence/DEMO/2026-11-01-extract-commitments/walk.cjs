/**
 * The "extract commitments" walk, in the running app (CLAUDE.md RULE 4: a
 * screen is not done until it was opened and used).
 *
 *   node docs/evidence/DEMO/2026-11-01-extract-commitments/walk.cjs [base-url]
 *
 * One dev-login (local server with ALLOW_DEV_AUTH=1), stored as the client
 * stores it; then, as a person would: Projects -> the LMN-201 project ->
 * Communication -> the approval letter's Questions & responses -> Record one
 * commitment the letter imposes -> see it Recorded -> see it under Meetings &
 * commitments with its due date. A 390-wide view of the letter's commitments,
 * and the C2C-101 information request's questions (G3), close it.
 *
 * Every step asserts what it shows and stops at the first that does not hold.
 * Screenshots go to ./screenshots, the step log to ./walk.json. The seed
 * (scripts/demo/launch-demo/seed.mjs --pack lumen, --pack biotech) must have
 * run. Each full run RECORDS the next unrecorded commitment (a governed write
 * that cannot be undone); 4710-4 was left unrecorded for the live demo.
 * `--narrow-only` re-shoots the 390-wide view and the C2C-101 questions and
 * records nothing (log: ./walk-narrow.json).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const NARROW_ONLY = process.argv.includes('--narrow-only');
const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://127.0.0.1:5000').replace(/\/$/, '');
const EMAIL = process.env.DEMO_SEED_EMAIL || 'jm.smith@concept2cure.pro';
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
const LETTER = 'FDA approval letter (fictional demo), BLA 761901';
const IR_LETTER = 'FDA information request (fictional demo), IND C2C-101';

const log = { mode: NARROW_ONLY ? 'narrow-only' : 'full', base: BASE, email: EMAIL, startedAt: new Date().toISOString(), steps: [], apiErrors: [], consoleErrors: [] };
const step = (name, detail) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}${detail?.note ? ` - ${detail.note}` : ''}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };

/** One sign-in, stored where the client's loadStoredAuth() reads it. */
async function signIn({ page }) {
  // One sign-in, stored where the client's loadStoredAuth() reads it.
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
  expect(who.status === 200 && who.email === EMAIL, `dev-login as ${EMAIL} (got ${JSON.stringify(who)})`);
  step('sign in (one dev-login)', { note: who.email });
}

/** Projects -> LMN-201 -> Communication: the approval letter in the agency inbox. Returns its commitments panel. */
async function openLetter({ page, shot }) {
  // 1. Projects -> LMN-201.
  await page.goto(BASE + '/concept2cure/projects', { waitUntil: 'networkidle' });
  await page.getByRole('searchbox', { name: /^Search projects/ }).fill('LMN-201');
  const card = page.getByText('[Demo · Lumen] LMN-201', { exact: false }).first();
  await card.waitFor();
  step('Projects: the LMN-201 project is listed', { screenshot: await shot('01-projects-lmn201.png') });
  await card.click();
  await page.waitForURL(/project-home\?program=/);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  if (!NARROW_ONLY) step('Project home: LMN-201 is open', { url: page.url().replace(BASE, ''), screenshot: await shot('02-project-home.png') });

  // 2. Communication -> the agency inbox.
  await page.locator('nav').getByText('Communication', { exact: true }).click();
  await page.waitForURL(/communication-center/);
  await page.waitForLoadState('networkidle');
  const letterCard = page.getByText(LETTER, { exact: true });
  await letterCard.waitFor();
  expect(await page.getByText('LMN-201', { exact: true }).first().isVisible(), 'the open project is LMN-201');
  const proposals = page.getByTestId('letter-commitment-proposals');
  return proposals;
}

/** --narrow-only: the form, opened on the first unrecorded commitment, checked and CANCELLED. */
async function checkFormCancelled({ page, shot, proposals }) {
// The form, opened on the first unrecorded commitment, checked and
// CANCELLED: nothing is recorded in this mode.
await page.getByRole('button', { name: /Questions & responses/ }).first().click();
await proposals.waitFor();
const open = proposals.getByRole('button', { name: /^Record commitment .+ from the letter$/ }).first();
const ref = (await open.getAttribute('aria-label')).replace(/^Record commitment (.+) from the letter$/, '$1');
await open.click();
const dialog = page.getByRole('dialog').filter({ hasText: 'Record a commitment' });
await dialog.waitFor();
await page.waitForTimeout(700);
const form = {
  type: await dialog.getByLabel(/^Type/).inputValue(),
  words: await dialog.getByLabel(/^What the letter requires/).inputValue(),
  dueDate: await dialog.getByLabel(/^Due date/).inputValue(),
  basis: await dialog.getByLabel(/^Regulatory basis/).inputValue(),
  reason: await dialog.getByLabel(/^Reason/).inputValue(),
};
expect(form.type && form.words && /^\d{4}-\d{2}-\d{2}$/.test(form.dueDate) && form.basis.endsWith(` · ${ref}`) && form.reason === '', `the form for ${ref} is filled from the letter (got ${JSON.stringify(form)})`);
step(`Record ${ref}: the form is filled from the letter (cancelled, nothing recorded)`, { form, screenshot: await shot('05-record-form-filled.png') });
await dialog.getByRole('button', { name: 'Cancel' }).click();
await dialog.waitFor({ state: 'hidden' });
}

/** The letter's commitments, one recorded from the letter with a reason. Returns what was recorded. */
async function recordFromLetter({ page, shot, proposals }) {
  step('Communication: the approval letter is in the agency inbox', { url: page.url().replace(BASE, ''), screenshot: await shot('03-agency-inbox.png') });

  // 3. The letter's Questions & responses: the commitments it imposes.
  await page.getByRole('button', { name: /Questions & responses/ }).first().click();
  await proposals.waitFor();
  const lead = await proposals.locator('p').first().innerText();
  expect(/^The letter imposes 4 commitments, found in its text without AI\./.test(lead), `"The letter imposes 4 commitments…" (got "${lead}")`);
  await proposals.scrollIntoViewIfNeeded();
  step('Questions & responses: the letter imposes 4 commitments', { note: lead, items: (await proposals.locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()), screenshot: await shot('04-commitments-proposed.png') });

  // 4. Record one: the form is filled from the letter.
  const recordButton = proposals.getByRole('button', { name: /^Record commitment .+ from the letter$/ }).first();
  const ref = (await recordButton.getAttribute('aria-label')).replace(/^Record commitment (.+) from the letter$/, '$1');
  const row = proposals.locator('li', { has: page.getByText(ref, { exact: true }) });
  const rowText = (await row.innerText()).replace(/\s+/g, ' ');
  await recordButton.click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Record a commitment' });
  await dialog.waitFor();
  await page.waitForTimeout(700); // the panel slides in
  const form = {
    type: await dialog.getByLabel(/^Type/).inputValue(),
    words: await dialog.getByLabel(/^What the letter requires/).inputValue(),
    dueDate: await dialog.getByLabel(/^Due date/).inputValue(),
    basis: await dialog.getByLabel(/^Regulatory basis/).inputValue(),
    reason: await dialog.getByLabel(/^Reason/).inputValue(),
  };
  expect(['pmr', 'pmc'].includes(form.type), `type filled (got "${form.type}")`);
  expect(form.words.length > 40 && rowText.includes(form.words.slice(0, 60)), `the letter's words filled (got "${form.words.slice(0, 80)}")`);
  expect(/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate), `due date filled (got "${form.dueDate}")`);
  expect(form.basis.endsWith(` · ${ref}`) && form.basis.length > ref.length + 3, `basis filled with the agency's number (got "${form.basis}")`);
  expect(form.reason === '', 'the reason is left to the person');
  step(`Record ${ref}: the form is filled from the letter`, { form, screenshot: await shot('05-record-form-filled.png') });

  const reason = `Recording ${ref} from the fictional demo approval letter (BLA 761901) for tracking.`;
  await dialog.getByLabel(/^Reason/).fill(reason);
  step(`Record ${ref}: a reason is given`, { reason, screenshot: await shot('06-record-form-reason.png') });
  const posted = page.waitForResponse((r) => r.request().method() === 'POST' && /\/agency-communications\/[^/]+\/commitments$/.test(r.url()));
  await dialog.getByRole('button', { name: 'Record commitment' }).click();
  const res = await posted;
  const body = await res.json().catch(() => null);
  expect(res.status() === 201 && body?.data?.id, `the commitment is recorded (HTTP ${res.status()} ${JSON.stringify(body).slice(0, 200)})`);
  await dialog.waitFor({ state: 'hidden' });

  // 5. Marked Recorded on the letter.
  await row.getByText('Recorded', { exact: true }).waitFor();
  await proposals.scrollIntoViewIfNeeded();
  step(`${ref} is marked Recorded on the letter`, { commitmentId: body.data.id, status: res.status(), screenshot: await shot('07-recorded.png') });
  return { ref, form };
}

/** Meetings & commitments lists it, with its due day in words, before and after the page is read again. */
async function checkRegister({ page, shot }, { ref, form }) {
  // 6. Listed under Meetings & commitments with its due date.
  //    First as the page stands after recording (the toast says it is listed
  //    there), then after the page is read again. 2026-11-01: the register is
  //    read once by CommunicationCenter.tsx and recording from the letter
  //    refreshes only the letter (AgencyResponses.tsx recordLetterCommitment),
  //    so it is absent until a re-read. The walk records what it sees.
  const commitmentsTab = () => page.getByRole('tab', { name: 'Meetings & commitments' }).or(page.getByRole('button', { name: 'Meetings & commitments' })).first();
  const registerText = () => page.locator('#c2c-page').innerText();
  await commitmentsTab().click();
  await page.getByText('REGULATORY COMMITMENTS', { exact: false }).or(page.getByText('Regulatory commitments', { exact: false })).first().waitFor();
  await page.waitForTimeout(1500);
  const before = (await registerText()).replace(/\s+/g, ' ');
  const listedWithoutReread = before.includes(`${form.basis}`) || before.includes(form.words.slice(0, 60));
  await page.getByText(/REGULATORY COMMITMENTS/i).first().scrollIntoViewIfNeeded();
  step(`Meetings & commitments, as the page stands after recording: ${ref} ${listedWithoutReread ? 'is' : 'is NOT'} listed`, {
    listedWithoutReread, finding: listedWithoutReread ? null : 'The register is not re-read after a commitment is recorded from the letter; the toast says it is listed there.',
    screenshot: await shot('08a-register-before-reread.png') });

  await page.reload({ waitUntil: 'networkidle' });
  await commitmentsTab().click();
  // CommitmentRow.tsx: the letter's words, then "<basis> · due <date>".
  const listed = page.locator('.cc-row').filter({ hasText: form.basis }).first();
  await listed.waitFor();
  const listedText = (await listed.innerText()).replace(/\s+/g, ' ');
  const dueWords = new Date(`${form.dueDate}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  expect(listedText.includes(`due ${dueWords}`), `listed with "due ${dueWords}" (got "${listedText.slice(0, 300)}")`);
  expect(listedText.includes(form.words.slice(0, 60)), `listed with the letter's words (got "${listedText.slice(0, 300)}")`);
  await listed.scrollIntoViewIfNeeded();
  step(`Meetings & commitments, after the page is read again: ${ref} is listed, due ${dueWords}`, { listed: listedText.slice(0, 500), screenshot: await shot('08b-register-after-reread.png') });
}

/** The same letter at 390 wide, loaded as a phone loads it. */
async function narrow({ page, shot, proposals }) {
  // 7. The same letter at 390 wide, loaded as a phone loads it. (Resizing the
  //    live page left the desktop rail open as a drawer over the content.)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  const rail = page.locator('nav.rail');
  const railBox = (await rail.isVisible().catch(() => false)) ? await rail.boundingBox() : null;
  const railCovers = !!railBox && railBox.width > 200 && railBox.x >= 0;
  if (railCovers) {
    step('390 wide: the rail opens over the page on load', { finding: 'At 390 wide the primary rail is open over the content on load and takes the pointer.', screenshot: await shot('09a-mobile-390-rail-open.png') });
    await rail.getByRole('button', { name: /Collapse|Close/i }).first().click();
  }
  await page.getByRole('tab', { name: /Agency inbox/ }).or(page.getByRole('button', { name: /Agency inbox/ })).first().click();
  await page.getByText(LETTER, { exact: true }).waitFor();
  const toggle = page.getByRole('button', { name: /Questions & responses/ }).first();
  await page.waitForTimeout(500);
  if (!(await proposals.isVisible().catch(() => false))) await toggle.click();
  await proposals.waitFor();
  await proposals.evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  // The width each commitment's words are given: a column a few characters
  // wide reads one letter per line, with no horizontal overflow to show it.
  const textColumnsPx = await proposals.locator('li > span[title]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  const narrowest = Math.min(...textColumnsPx);
  step('390 wide: the letter\'s commitments', {
    horizontalOverflowPx: overflow, textColumnsPx,
    finding: narrowest < 120 ? `At 390 wide each commitment's words get a ${narrowest}px column and wrap a character or two per line.` : null,
    screenshot: await shot('09-mobile-390-commitments.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** G3 beside it: the C2C-101 information request's numbered questions. */
async function irQuestions({ page, shot }) {
  // 8. G3 beside it: the C2C-101 information request's numbered questions.
  await page.goto(BASE + '/concept2cure/projects', { waitUntil: 'networkidle' });
  await page.getByRole('searchbox', { name: /^Search projects/ }).fill('C2C-101');
  await page.getByText('[Demo · Biotech] C2C-101', { exact: false }).first().click();
  await page.waitForURL(/project-home\?program=/);
  await page.locator('nav').getByText('Communication', { exact: true }).click();
  await page.getByText(IR_LETTER, { exact: true }).waitFor();
  const irCard = page.locator('li, article, div').filter({ has: page.getByText(IR_LETTER, { exact: true }) }).filter({ has: page.getByRole('button', { name: /Questions & responses/ }) }).last();
  await irCard.getByRole('button', { name: /Questions & responses/ }).click();
  const qp = page.getByTestId('letter-question-proposals');
  await qp.waitFor();
  const qlead = (await qp.innerText()).replace(/\s+/g, ' ');
  expect(/In the letter: 3 numbered questions/.test(qlead), `"In the letter: 3 numbered questions" (got "${qlead.slice(0, 200)}")`);
  await qp.scrollIntoViewIfNeeded();
  step('C2C-101: the information request\'s 3 numbered questions are proposed', { screenshot: await shot('10-biotech-ir-questions.png') });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error') log.consoleErrors.push(m.text().slice(0, 300)); });
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) log.apiErrors.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`); });
  const shot = async (file, opts = {}) => { await page.screenshot({ path: path.join(SHOTS, file), ...opts }); return `screenshots/${file}`; };
  try {
    const w = { page, shot };
    await signIn(w);
    w.proposals = await openLetter(w);
    if (NARROW_ONLY) await checkFormCancelled(w);
    else await checkRegister(w, await recordFromLetter(w));
    await narrow(w);
    await irQuestions(w);

    log.outcome = 'passed';
  } catch (err) {
    log.outcome = 'failed';
    log.error = err.message;
    console.error(`FAILED: ${err.message}`);
    await shot('failure.png').catch(() => {});
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, NARROW_ONLY ? 'walk-narrow.json' : 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
    process.exit(log.outcome === 'passed' ? 0 : 1);
  }
})();
