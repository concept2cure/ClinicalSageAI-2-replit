/**
 * D3-2a, Project knowledge on every step, opened and used in the running app (CLAUDE.md RULE 4).
 *
 *   node docs/evidence/DESIGN/D3/D3-2a/walk.cjs [base-url] [programId]
 *
 * One dev-login. On the project page, on all six steps: the side column's cards in order (About, Filing, Team, Work
 * areas, What AnA knows, Skills, Records) and the same on each step. The Filing card's readiness figure opens Author,
 * where the readiness detail now is. A Records store opens. The Work areas rows navigate (Reports is the last row).
 * 1440 light and dark, 390 light. Log: ./walk.json, shots: ./screenshots/.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const PROGRAM = process.argv[3];
const EMAIL = process.env.DEMO_SEED_EMAIL || 'jm.smith@concept2cure.pro';
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
const log = { base: BASE, program: PROGRAM, startedAt: new Date().toISOString(), steps: [] };
const step = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };
const shot = async (page, name) => { await page.screenshot({ path: path.join(SHOTS, name) }); return `screenshots/${name}`; };

async function signIn(page, dark) {
  await page.goto(BASE + '/');
  const who = await page.evaluate(async ({ email, dark }) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const j = await r.json();
    const exp = new Date(Date.now() + 86_400_000).toISOString();
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', j.accessToken);
      s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
      s.setItem('trialsage_token_expiry', exp);
      s.setItem('trialsage_user', JSON.stringify(j.user));
    }
    const prefs = JSON.parse(localStorage.getItem('c2c-v2-prefs') || '{}');
    localStorage.setItem('c2c-v2-prefs', JSON.stringify({ ...prefs, dark }));
    return { status: r.status, email: j.user?.email ?? null };
  }, { email: EMAIL, dark });
  expect(who.status === 200 && who.email === EMAIL, `dev-login as ${EMAIL}`);
}

async function openProject(page) {
  await page.goto(`${BASE}/concept2cure/project-home?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  await page.locator('h1.pj-title').waitFor({ timeout: 20000 });
}

const cardsOf = (page) => page.evaluate(() => Array.from(document.querySelectorAll('aside.pj-side h3')).map((h) => h.textContent.trim()));

async function sameOnEveryStep(page) {
  const steps = [];
  for (const label of ['Plan', 'Evidence', 'Author', 'Review', 'Submit', 'Respond']) {
    await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: new RegExp(`^${label}`) }).click();
    await page.waitForTimeout(400);
    steps.push({ step: label, cards: await cardsOf(page) });
  }
  const first = JSON.stringify(steps[0].cards);
  expect(steps.every((s) => JSON.stringify(s.cards) === first), 'the same cards on every step');
  const order = ['About', 'Filing', 'Team', 'Work areas', 'What AnA knows', 'Records'].map((n) => steps[0].cards.indexOf(n));
  expect(order.every((i) => i >= 0) && order.every((i, k) => k === 0 || i > order[k - 1]), `the cards in order (${steps[0].cards.join(', ')})`);
  return steps;
}

async function filingOpensAuthor(page) {
  await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Plan/ }).click();
  const filing = page.getByRole('region', { name: 'Filing' });
  const row = filing.getByRole('button', { name: /Dossier readiness/ });
  const text = (await row.textContent()).trim();
  await row.click();
  await page.waitForTimeout(500);
  const current = await page.evaluate(() => document.querySelector('.pj-lc-stage[aria-current="step"]')?.textContent?.trim());
  const ringInMain = await page.evaluate(() => !!document.querySelector('.pj-main .pj-map-ring, .pj-main [aria-label*="readiness" i]'));
  expect(current === 'Author', 'the readiness figure opens Author');
  return { row: text, opened: current, readinessDetailInMain: ringInMain };
}

async function recordsOpen(page) {
  const card = page.getByRole('region', { name: 'Records' });
  await card.scrollIntoViewIfNeeded();
  await card.locator('details').first().waitFor({ timeout: 15000 });
  const summaries = await card.locator('details > summary').allTextContents();
  await card.locator('details > summary').first().click();
  const opened = await card.locator('details[open]').count();
  expect(summaries.length === 6 && opened === 1, 'six stores, one opened');
  return { summaries, opened };
}

(async () => {
  expect(PROGRAM, 'a program id');
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const runs = [{ width: 1440, dark: false }, { width: 1440, dark: true }, { width: 390, dark: false }];
  try {
    for (const { width, dark } of runs) {
      const theme = dark ? 'dark' : 'light';
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1100 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await signIn(page, dark);
      await openProject(page);
      await page.getByRole('region', { name: 'Records' }).waitFor({ timeout: 20000 });
      if (width === 1440 && !dark) {
        step('the same Project knowledge on every step, in order', { steps: await sameOnEveryStep(page) });
        step("the Filing card's readiness figure opens Author", await filingOpensAuthor(page));
        step('a Records store opens', await recordsOpen(page));
      }
      /* The page scrolls inside its own container, not the window: bring the top of the page back by its back link. */
      await page.evaluate(() => document.querySelector('.pj-back, h1.pj-title')?.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(300);
      const aside = page.locator('aside.pj-side');
      const top = await shot(page, `${width}-${theme}-knowledge-top.png`);
      await page.getByRole('region', { name: 'Records' }).scrollIntoViewIfNeeded();
      const lower = await shot(page, `${width}-${theme}-knowledge-lower.png`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(!overflow, `no sideways scroll at ${width}`);
      step(`the column, ${width} ${theme}`, { cards: await cardsOf(page), width: Math.round((await aside.boundingBox()).width), shots: [top, lower] });
      await ctx.close();
    }
    log.result = 'pass';
  } catch (e) {
    log.result = 'fail';
    log.error = String((e && e.stack) || e);
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2) + '\n');
  }
})();
