/**
 * S11 step 4 in the running app: the Plan step opens with "Due for you", and each IND document names the
 * work-breakdown task that produces it, with its due date and owner (CLAUDE.md RULE 4: opened and used).
 *
 *   node docs/evidence/SPINE/S11/2026-11-05-plan-step/walk.cjs [base-url]
 *
 * Runs after step 3's walk (../2026-11-05-owners-and-due-dates/walk.cjs), which makes WALK-IND-301 (target
 * Jun 4, 2027) and gives "Submit IND" to the signed-in person. At 1440 and at 390. Log: ./walk.json.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5100').replace(/\/$/, '');
const EMAIL = process.env.WALK_EMAIL || 'walk.owner@example.com';
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
const log = { base: BASE, startedAt: new Date().toISOString(), steps: [], apiErrors: [] };
const step = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name), fullPage: false });

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
  expect(who.status === 200, `dev-login (${JSON.stringify(who)})`);
  const rows = await page.evaluate(async () => {
    const r = await fetch('/api/c2c/projects?limit=100', { headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } });
    return ((await r.json()).data ?? []).map((x) => ({ id: x.id, title: String(x.title ?? x.name ?? '') }));
  });
  const id = rows.find((r) => r.title === 'WALK-IND-301')?.id;
  expect(id, 'WALK-IND-301 exists (run step 3\'s walk first)');
  step('sign in (one dev-login)', { email: who.email, project: id });
  return id;
}

async function openPlan(page, programId) {
  await page.goto(`${BASE}/concept2cure/project-home?program=${programId}`, { waitUntil: 'networkidle' });
  await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Plan/ }).click();
  const plan = page.getByTestId('pj-plan');
  await plan.getByTestId('pj-program-plan').waitFor({ timeout: 30000 });
  return plan;
}

async function walk(page, programId, width) {
  const tag = width === 390 ? 'phone' : 'desk';
  const plan = await openPlan(page, programId);
  // 1. Due for you, first in the step.
  const due = plan.getByTestId('pj-due-for-you');
  await due.waitFor();
  await due.locator('.pj-due-row').first().waitFor({ timeout: 15000 });
  // The strategy opens the step since 2026-11-10 (THE_PROGRAM §8 item 1); what is due for the person follows it.
  const first = await plan.evaluate((el) => [...el.children].slice(0, 2).map((c) => c.getAttribute('data-testid')).join(','));
  expect(first === 'pj-plan-strategy,pj-due-for-you', `the strategy, then Due for you (${first})`);
  const rows = await due.locator('.pj-due-row').allInnerTexts();
  expect(rows.some((r) => r.includes('Submit IND')), `Submit IND is due for the person (${rows})`);
  await due.scrollIntoViewIfNeeded();
  await shot(page, `${tag}-01-due-for-you.png`);
  step(`${width}: 1. Due for you, first`, { rows });

  // 2. The content plan's join: open every phase and read each document's producing task.
  for (const d of await plan.locator('details.pj-plan-phase').all()) if (!(await d.evaluate((e) => e.open))) await d.locator('summary').first().click();
  const entries = plan.locator('.pf-library-entry');
  const total = await entries.count();
  const joined = await plan.getByTestId('plan-produced-by').count();
  const esg = plan.locator('.pf-library-entry', { hasText: 'FDA ESG submission acknowledgment' }).first();
  const esgLine = await esg.getByTestId('plan-produced-by').innerText();
  expect(/^Work: Submit IND · due Jun 3, 2027 · /.test(esgLine), `the ESG acknowledgment names Submit IND (${esgLine})`);
  await esg.scrollIntoViewIfNeeded();
  await shot(page, `${tag}-02-document-produced-by.png`);
  const tpp = plan.locator('.pf-library-entry', { hasText: 'Target Product Profile' }).first();
  const tppLine = await tpp.getByTestId('plan-produced-by').innerText();
  await tpp.scrollIntoViewIfNeeded();
  await shot(page, `${tag}-03-document-no-owner.png`);
  step(`${width}: 2. each document names its producing task`, { documents: total, joined, esg: esgLine, tpp: tppLine });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow <= 0, `no horizontal scroll at ${width} (${overflow})`);
  step(`${width}: 3. no horizontal scroll`, { overflow });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) log.apiErrors.push(`${r.status()} ${r.url()}`); });
  try {
    const id = await signIn(page);
    await walk(page, id, 1440);
    await page.setViewportSize({ width: 390, height: 844 });
    await walk(page, id, 390);
  } catch (err) {
    log.error = err instanceof Error ? err.message : String(err);
    console.error(log.error);
    await shot(page, 'zz-failure.png').catch(() => {});
    process.exitCode = 1;
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2) + '\n');
    await browser.close();
  }
})();
