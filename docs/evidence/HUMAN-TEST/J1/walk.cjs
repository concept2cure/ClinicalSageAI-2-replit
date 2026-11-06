/**
 * Human test J1 in the running app: sign-in, Home and its composer, Projects (grid, list, search, filters, the schedule
 * line), New project (an IND, a 510(k), a diagnostic) with its objective, and the project page's six steps, its About
 * card and Project settings. Two personas, each at 1440×900 and 390×844. CLAUDE.md RULE 4: opened and used.
 *
 *   node docs/evidence/HUMAN-TEST/J1/walk.cjs [base-url]
 *
 * Accounts (README "Test accounts"): the biotech regulatory lead signs in with the seeded demo admin
 * (DEMO_USER_EMAIL / DEMO_USER_PASSWORD); the device RA manager is a self-serve sign-up made through /concept2cure/signup
 * as a "Medical Device Company". Both sign in through the sign-in form, never dev-login.
 *
 * Projects are made through New project once, by name; a second run opens them. Log: ./walk.json. Screenshots: ./shots.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5100').replace(/\/$/, '');
const HERE = __dirname;
const SHOTS = path.join(HERE, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PERSONAS = {
  biotech: { email: process.env.J1_BIOTECH_EMAIL || 'reg.lead@example.com', password: process.env.J1_BIOTECH_PASSWORD || 'J1-Tester-Pass-2026!' },
  device: { email: process.env.J1_DEVICE_EMAIL || 'device.lead@example.com', password: process.env.J1_DEVICE_PASSWORD || 'Tq9-Harbor-Lantern!' },
};
const log = { base: BASE, startedAt: new Date().toISOString(), steps: [], apiErrors: [], pageErrors: [] };
const step = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };

/** A screenshot of the whole page, its inner scroller included (the shell scrolls inside `main`). */
async function shot(page, name) {
  const vp = page.viewportSize();
  const h = await page.evaluate(() => {
    let m = document.documentElement.scrollHeight;
    for (const e of document.querySelectorAll('*')) {
      const s = window.getComputedStyle(e);
      if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 5) m = Math.max(m, e.scrollHeight + e.getBoundingClientRect().top);
    }
    return Math.min(m, 9000);
  });
  await page.setViewportSize({ width: vp.width, height: Math.max(vp.height, Math.ceil(h)) });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  await page.setViewportSize(vp);
}
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

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

async function projectId(page, title) {
  return page.evaluate(async (title) => {
    const r = await fetch('/api/c2c/projects?limit=100', { headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` } });
    const j = await r.json();
    return (j.data ?? []).find((p) => p.title === title)?.id ?? null;
  }, title);
}

/** New project through the wizard: the filing, the configure step, the review, Create. */
async function newProject(page, tag, { tab, filing, name, code, indication, objective, review }) {
  const existing = await projectId(page, name);
  if (existing) { step(`${tag}: ${name} already exists (made by an earlier run)`, { id: existing }); return existing; }
  await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'New project' }).first().click();
  if (tab) await page.getByText(tab).first().click({ timeout: 60000 });
  await page.getByText(filing, { exact: true }).first().click({ timeout: 60000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  const ws = page.locator('#npw-client-workspace');
  await ws.waitFor();
  if ((await ws.inputValue()) === '') await ws.selectOption({ index: 1 });
  await page.getByPlaceholder(/^e\.g\. BX-204 — /).fill(name);
  await page.getByPlaceholder('e.g. BX-204', { exact: true }).fill(code);
  if (indication) await page.getByPlaceholder(/pulmonary fibrosis/).fill(indication);
  const sels = page.locator('main select');
  for (let i = 1; i < await sels.count(); i += 1) {
    const opts = await sels.nth(i).locator('option').allTextContents();
    if (/^Not (yet determined|stated)/.test(opts[0]) && opts.length > 1) await sels.nth(i).selectOption({ index: review.choose?.[i] ?? 1 });
  }
  await page.locator('main input[type=date]').fill(review.target);
  const placeholder = await page.locator('#npw-objective').getAttribute('placeholder');
  expect(!/study set out|primary endpoint/.test(placeholder), `the objective's placeholder speaks to every filing (${placeholder})`);
  await page.locator('#npw-objective').fill(objective);
  await shot(page, `${tag}-new-configure`);
  await page.getByRole('button', { name: 'Continue' }).click();
  const rv = async (term) => page.locator('.npw-review-row').filter({ has: page.locator('dt', { hasText: new RegExp(`^${term}$`) }) }).locator('dd').innerText();
  expect((await rv('Client type')) === review.clientType, `review Client type ${review.clientType} (${await rv('Client type')})`);
  expect((await rv('Objective')) === objective, 'review shows the objective');
  expect(!(await page.locator('main').innerText()).match(/\bMDX\b/), 'the review never says MDX');
  await shot(page, `${tag}-new-review`);
  await page.getByRole('button', { name: /Create project/ }).click();
  await page.waitForURL(/project-home\?program=/, { timeout: 60000 });
  const id = new URL(page.url()).searchParams.get('program');
  step(`${tag}: New project ${filing} created and opened`, { id, clientType: review.clientType });
  return id;
}

/** The project page: About and its objective, the six steps (the column does not move), and Project settings. */
async function projectPage(page, tag, id, { objective, device }) {
  await page.goto(`${BASE}/concept2cure/project-home?program=${id}`, { waitUntil: 'networkidle' });
  const about = await page.locator('main').innerText();
  // The opening words: the objective can have later versions (the README's "actions" pass records a version 2).
  expect(about.includes(objective.replace(/\.$/, '').slice(0, 40)), "the About card states the project's objective");
  const xs = {};
  for (const s of ['Plan', 'Evidence', 'Author', 'Review', 'Submit', 'Respond']) {
    await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: new RegExp(`^${s}`) }).click();
    await page.waitForTimeout(1500);
    await page.waitForLoadState('networkidle').catch(() => {});
    xs[s] = await page.evaluate(() => Math.round(document.querySelector('h1.pj-title').getBoundingClientRect().x));
    const text = await page.locator('main').innerText();
    if (s === 'Plan') {
      expect(text.includes('Due for you'), 'Plan: Due for you');
      const none = page.getByTestId('pj-program-none');
      if (await none.count()) {
        // A filing the engine has no work breakdown for (a 510(k) for IVD): said in words, never by its key.
        const note = await none.innerText();
        expect(/has none yet/.test(note) && !/\bus_[a-z0-9_]+\b/.test(note), `Plan: the no-breakdown note names the filing in words (${note})`);
      } else {
        expect(text.includes('Program plan') && text.includes('Workstreams'), 'Plan: the program plan and its workstreams');
        expect(await page.getByTestId('pj-schedule-line').count() === 1, 'Plan: the schedule line');
      }
    }
    if (s === 'Evidence') {
      const lanes = await page.getByRole('group', { name: 'Document sources' }).innerText();
      expect(device ? !lanes.includes('IND documents') : lanes.includes('IND documents'), `Evidence lanes (${lanes.replace(/\n/g, ' · ')})`);
    }
    if (s === 'Submit' && device) {
      expect(!text.includes('No market for this project yet'), 'Submit: a device project is not told it has no market');
    }
    expect(!/\bMDX\b/.test(await page.locator('.pj-tags').innerText().catch(() => '')), 'the line under the name never says MDX');
    expect(await noSideScroll(page), `${s}: no horizontal page scroll`);
    const past = await page.evaluate(() => [...document.querySelectorAll('.pj button, .pj a')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1 && !e.closest('nav, [role=navigation]'); })
      .map((e) => (e.textContent || '').trim().slice(0, 50)));
    expect(past.length === 0, `${s}: no control runs past the screen's edge (${past.join(' | ')})`);
    await shot(page, `${tag}-step-${s.toLowerCase()}`);
  }
  if (page.viewportSize().width > 400) expect(new Set(Object.values(xs)).size === 1, `the column stays put across steps (${JSON.stringify(xs)})`);
  step(`${tag}: the six steps open; the title's x on each`, { xs });
  await page.getByRole('button', { name: 'Project settings' }).first().click();
  await page.getByRole('button', { name: 'Close settings' }).waitFor();
  await shot(page, `${tag}-settings`);
  await page.getByRole('button', { name: 'Close settings' }).click();
  step(`${tag}: Project settings opens and closes`);
}

async function homeAndProjects(page, tag, who) {
  const home = await page.locator('main').innerText();
  expect(/Good (morning|afternoon|evening)/.test(home), 'Home greets');
  // Titles are data (the demo pack names one "[Demo · MDX] …"); the client type is the row's second line.
  const typeLines = await page.locator('.home-row-m').allInnerTexts();
  expect(!typeLines.some((t) => /\bMDX\b/.test(t)), `Home's client types are in words (${typeLines.join(' | ')})`);
  await page.getByPlaceholder(/How can I help/).fill('What does an IND need before Pre-IND?');
  await shot(page, `${tag}-home`);
  step(`${tag}: Home and its composer`);
  await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, `${tag}-projects-grid`);
  const search = page.getByPlaceholder(/^Search/);
  await search.fill('J1-');
  await page.waitForTimeout(800);
  const matched = await page.locator('main').innerText();
  expect(matched.includes('J1-'), 'search finds the J1 projects');
  await search.fill('zzzz-none');
  await page.waitForTimeout(800);
  expect((await page.locator('main').innerText()).includes('No projects match'), 'search with no match says so');
  await search.fill('');
  if (who === 'biotech') {
    await page.locator('main select').nth(1).selectOption({ index: 1 });
    await page.waitForTimeout(800);
    await shot(page, `${tag}-projects-filtered`);
    await page.locator('main select').nth(1).selectOption({ index: 0 });
  }
  await page.getByRole('button', { name: 'List' }).click();
  await page.waitForTimeout(1200);
  const cells = await page.evaluate(() => [...document.querySelectorAll('.pj-index .ct-row > div')].filter((c) => c.scrollWidth > c.clientWidth + 1).length);
  expect(cells === 0, `no list cell spills (${cells})`);
  expect(await noSideScroll(page), 'Projects list: no horizontal page scroll');
  await shot(page, `${tag}-projects-list`);
  await page.getByRole('button', { name: 'Grid' }).click();
  step(`${tag}: Projects grid, search, filters, list`);
}

(async () => {
  const browser = await chromium.launch();
  const ids = {};
  try {
    for (const width of [1440, 390]) {
      const w = width === 390 ? 'phone' : 'desk';
      // The biotech regulatory lead: an IND.
      let { ctx, page } = await signIn(browser, 'biotech', width);
      step(`${w} biotech: signed in through the form`, { url: page.url().replace(BASE, '') });
      if (width === 1440) {
        ids.ind = await newProject(page, `${w}-ind`, {
          filing: 'Investigational New Drug Application', name: 'J1-WALK-IND — Investigational New Drug Application', code: 'J1W-101',
          indication: 'Moderate-to-severe ulcerative colitis', objective: 'File the IND and reach study-may-proceed by Q3 2027.',
          review: { target: '2027-06-30', clientType: 'Biotech' },
        });
      }
      await page.goto(`${BASE}/concept2cure`, { waitUntil: 'networkidle' });
      await homeAndProjects(page, `${w}-biotech`, 'biotech');
      await projectPage(page, `${w}-ind`, ids.ind, { objective: 'File the IND and reach study-may-proceed by Q3 2027.', device: false });
      await ctx.close();

      // The device RA manager: a 510(k) and a diagnostic.
      ({ ctx, page } = await signIn(browser, 'device', width));
      step(`${w} device: signed in through the form`);
      const home = await page.locator('main').innerText();
      if (/Create your first project/.test(home)) expect(home.includes('for example an IND or a 510(k)'), 'Home names a device filing');
      if (width === 1440) {
        ids.k = await newProject(page, `${w}-510k`, {
          tab: 'Medical Devices', filing: '510(k) Premarket Notification', name: 'J1-WALK-510K — CardioSense ECG patch 510(k)', code: 'J1W-CS',
          objective: 'Obtain 510(k) clearance for the CardioSense ECG patch by Q3 2027.',
          review: { target: '2027-03-31', clientType: 'Medical device & IVD', choose: { 1: 2, 2: 1 } },
        });
        ids.dx = await newProject(page, `${w}-dx`, {
          tab: 'Diagnostics & IVD', filing: '510(k) for IVD', name: 'J1-WALK-DX — RespiPlex respiratory panel 510(k)', code: 'J1W-RP',
          objective: 'Obtain 510(k) clearance for the RespiPlex respiratory panel.',
          review: { target: '2027-05-28', clientType: 'Medical device & IVD', choose: { 1: 2, 2: 2 } },
        });
      }
      await page.goto(`${BASE}/concept2cure`, { waitUntil: 'networkidle' });
      await homeAndProjects(page, `${w}-device`, 'device');
      await projectPage(page, `${w}-510k`, ids.k, { objective: 'Obtain 510(k) clearance for the CardioSense ECG patch by Q3 2027.', device: true });
      if (width === 1440) await projectPage(page, `${w}-dx`, ids.dx, { objective: 'Obtain 510(k) clearance for the RespiPlex respiratory panel.', device: true });
      await ctx.close();
    }
    log.ids = ids;
    log.result = 'pass';
  } catch (e) {
    log.result = 'fail';
    log.error = e.message;
    console.error(e);
    process.exitCode = 1;
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
  }
})();
