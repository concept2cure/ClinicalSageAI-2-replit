/**
 * Help, training and support (P-127, S13) in the running app. CLAUDE.md RULE 4: opened and used.
 *
 *   node docs/evidence/HELP/walk.cjs [base-url]
 *
 * Two personas (the J1 accounts, docs/evidence/HUMAN-TEST/J1/README.md): a biotech regulatory lead and a device RA
 * manager, each at 1440×900 and 390×844, signed in through the sign-in form. Each:
 *   1. finds Help & training in the account menu and opens it; the course offered is the one for their client type;
 *   2. searches "reset my password" and opens the article; "zzqx flurbington" finds nothing and offers support;
 *   3. opens their getting-started course and a lesson;
 *   4. writes a support request, sends it, sees it with its number, replies, marks it resolved and rates it;
 *   5. opens a request AnA drafted (the navigate_to params AnA's open_support_ticket returns) and sends it;
 *   6. selects Get help and lands in the conversation marked "From Help & training";
 *   7. on Home, the getting-started step opens the course.
 * No AnA turn is sent: the walk exercises the product, not a model. Log: ./walk.json. Screenshots: ./shots.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5100').replace(/\/$/, '');
const HERE = __dirname;
const SHOTS = path.join(HERE, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PERSONAS = {
  biotech: { email: process.env.J1_BIOTECH_EMAIL || 'reg.lead@example.com', password: process.env.J1_BIOTECH_PASSWORD || 'J1-Tester-Pass-2026!', course: /^Getting started with Concept2Cure(?! for device)/ },
  device: { email: process.env.J1_DEVICE_EMAIL || 'device.lead@example.com', password: process.env.J1_DEVICE_PASSWORD || 'Tq9-Harbor-Lantern!', course: /device and diagnostics teams/ },
};
const log = { base: BASE, startedAt: new Date().toISOString(), steps: [], apiErrors: [], pageErrors: [], failures: [] };
const step = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };

async function shot(page, name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function signIn(browser, who, width) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const page = await ctx.newPage();
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) log.apiErrors.push({ who, width, status: r.status(), url: r.url().replace(BASE, ''), at: page.url().replace(BASE, '') }); });
  page.on('pageerror', (e) => log.pageErrors.push({ who, width, message: e.message.slice(0, 300) }));
  await page.goto(`${BASE}/concept2cure/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type=email]').fill(PERSONAS[who].email);
  await page.locator('input[type=password]').fill(PERSONAS[who].password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  return { ctx, page };
}

async function openAccountMenu(page, width) {
  if (width === 390) await page.getByRole('button', { name: 'Open the sidebar' }).click();
  await page.locator('button.rail-account').click();
}

async function walk(browser, who, width) {
  const tag = `${who}-${width}`;
  const { ctx, page } = await signIn(browser, who, width);
  try {
    // 7. Home: the getting-started step (administrators see it in the checklist; the J1 accounts are administrators).
    await page.goto(`${BASE}/concept2cure`, { waitUntil: 'networkidle' });
    const course = page.getByRole('button', { name: /Take the getting-started course/ });
    const offered = await course.waitFor({ timeout: 15000 }).then(() => true, () => false);
    step(`${tag}: Home offers the getting-started course`, { offered });
    if (offered) {
      await shot(page, `${tag}-01-home-course-step`);
      await course.click();
      await page.getByRole('heading', { level: 2, name: PERSONAS[who].course }).waitFor({ timeout: 15000 });
      step(`${tag}: the step opens the course for the client type`);
      await shot(page, `${tag}-02-course-from-home`);
    }

    // 1. Account menu → Help & training.
    await page.goto(`${BASE}/concept2cure`, { waitUntil: 'networkidle' });
    await openAccountMenu(page, width);
    await page.getByRole('menuitem', { name: 'Help & training' }).click();
    await page.getByRole('heading', { level: 1, name: 'Help & training' }).waitFor({ timeout: 15000 });
    await page.getByRole('heading', { name: 'Browse help' }).waitFor({ timeout: 15000 });
    expect(await page.getByRole('button', { name: PERSONAS[who].course }).isVisible(), 'the client type\'s course is listed');
    expect(await noSideScroll(page), 'no sideways scroll on Help & training');
    step(`${tag}: Help & training from the account menu, with the right course`);
    await shot(page, `${tag}-03-help-home`);

    // 2. Search.
    const search = page.getByRole('searchbox', { name: 'Search the Help Center' });
    await search.fill('reset my password');
    await page.getByRole('button', { name: /Sign in, reset your password/ }).click();
    await page.getByRole('heading', { level: 2, name: /Sign in, reset your password/ }).waitFor();
    step(`${tag}: search finds and opens the password article`);
    await shot(page, `${tag}-04-article`);
    await page.getByRole('button', { name: /Help & training/ }).first().click();
    await search.fill('zzqx flurbington');
    await page.getByText(/No article answers/).waitFor();
    step(`${tag}: a search with no answer says so and offers support`);

    // 3. Course and lesson.
    await search.fill('');
    await page.getByRole('button', { name: PERSONAS[who].course }).click();
    await page.getByText('Your progress through a course is not recorded.').waitFor();
    const lessons = page.locator('.hc-lessons > li');
    const n = await lessons.count();
    expect(n >= 5, `a course with lessons (${n})`);
    step(`${tag}: the course lists ${n} lessons and says progress is not recorded`);
    await shot(page, `${tag}-05-course`);
    await page.getByRole('button', { name: 'Assign a document or task to someone' }).click();
    await page.getByRole('heading', { level: 2, name: 'Assign a document or task to someone' }).waitFor();
    step(`${tag}: a lesson opens its article`);

    // 4. A request: write, send, reply, resolve, rate.
    await page.goto(`${BASE}/concept2cure/training`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /New request/ }).click();
    const subject = `Walk ${tag}: Assign is not beside the protocol`;
    await page.getByLabel('Subject').fill(subject);
    await page.getByLabel('What happened').fill('On the Plan step of my project the Assign button is not shown beside the protocol row.');
    await shot(page, `${tag}-06-new-request`);
    await page.getByRole('button', { name: 'Send request' }).click();
    await page.getByRole('heading', { level: 2, name: subject }).waitFor({ timeout: 15000 });
    const eyebrow = await page.locator('.hc-eyebrow').first().innerText();
    expect(/^SUP-\d{6} · Open$/.test(eyebrow.trim()), `numbered and open (${eyebrow})`);
    step(`${tag}: a request is sent and opens with its number`, { eyebrow });
    await page.getByLabel('Reply').fill('It also happens on the Review step.');
    await page.getByRole('button', { name: 'Send reply' }).click();
    await page.getByText('It also happens on the Review step.').waitFor();
    await page.getByRole('button', { name: 'Mark resolved' }).click();
    await page.getByText(/· Resolved$/).waitFor();
    await page.getByRole('button', { name: '4 of 5' }).click();
    await page.getByText('You rated the answer 4 of 5.').waitFor();
    step(`${tag}: reply, resolve and rate`);
    expect(await noSideScroll(page), 'no sideways scroll on a request');
    await shot(page, `${tag}-07-request-resolved`);
    await page.goto(`${BASE}/concept2cure/training`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: new RegExp(subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).waitFor();
    step(`${tag}: the request is listed under Your support requests`);

    // 5. AnA's draft: the params open_support_ticket hands navigate_to, as an address.
    const draft = new URLSearchParams({ request: 'new', subject: `Walk ${tag}: export stops at 80 percent`, details: 'The eCTD export stops at 80 percent every time I run it.', category: 'bug_report', priority: 'high' });
    await page.goto(`${BASE}/concept2cure/training?${draft}`, { waitUntil: 'networkidle' });
    await page.getByText(/AnA drafted this request/).waitFor();
    expect((await page.getByLabel('Urgency').inputValue()) === 'high', 'the drafted urgency');
    await shot(page, `${tag}-08-ana-draft`);
    await page.getByRole('button', { name: 'Send request' }).click();
    await page.getByRole('heading', { level: 2, name: /export stops at 80 percent/ }).waitFor();
    step(`${tag}: AnA's drafted request opens prefilled and is sent by the person`);

    // 6. Get help → the conversation asked as support.
    await page.goto(`${BASE}/concept2cure`, { waitUntil: 'networkidle' });
    await openAccountMenu(page, width);
    await page.getByRole('menuitem', { name: 'Get help' }).click();
    await page.getByText(/From/).filter({ hasText: 'Help & training' }).first().waitFor({ timeout: 15000 });
    step(`${tag}: Get help opens the conversation marked From Help & training`);
    await shot(page, `${tag}-09-get-help`);
  } catch (e) {
    log.failures.push({ tag, message: String(e.message || e).slice(0, 400), at: page.url().replace(BASE, '') });
    console.error(`FAIL ${tag}: ${e.message}`);
    await shot(page, `${tag}-FAIL`).catch(() => {});
  } finally {
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  for (const who of ['biotech', 'device']) for (const width of [1440, 390]) await walk(browser, who, width);
  await browser.close();
  log.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2));
  console.info(`steps ${log.steps.length}, failures ${log.failures.length}, api errors ${log.apiErrors.length}, page errors ${log.pageErrors.length}`);
  process.exit(log.failures.length ? 1 : 0);
})();
