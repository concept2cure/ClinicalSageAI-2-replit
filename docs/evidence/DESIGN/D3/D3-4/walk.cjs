/**
 * D3-4, the project page's step bodies, and D3's acceptance (D3.md §6) walked whole in the running app (RULE 4).
 *
 *   node docs/evidence/DESIGN/D3/D3-4/walk.cjs [base-url] [programId ...]
 *
 * For each project (C2C-101 and the NeuroPanel-Dx 510(k) on the seeded stack), at 1440 light, 1440 dark, 390 light
 * and 390 dark (390 with touch): every step is opened, its body checked and captured. Facts are logged to ./walk.json,
 * screenshots to ./screenshots/. A failed check stops the walk with "expected: …".
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const PROGRAMS = process.argv.slice(3);
const EMAIL = process.env.DEMO_SEED_EMAIL || 'jm.smith@concept2cure.pro';
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
const log = { base: BASE, programs: PROGRAMS, startedAt: new Date().toISOString(), runs: [] };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };
const shot = async (page, name) => { await page.screenshot({ path: path.join(SHOTS, name), fullPage: false }); return `screenshots/${name}`; };

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

/* The page-wide facts of §6 items 1–4 and 14, read in the page. */
const pageFacts = () => {
  const main = document.querySelector('.pj-main');
  const order = ['h1.pj-title', '.pj-byline', '.pj-convo', '[aria-labelledby="pj-threads-h"]', '.pj-lc', '.pj-step-blurb']
    .map((sel) => document.querySelector(sel));
  const inOrder = order.every((el, i) => el && (i === 0 || order[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
  const side = Array.from(document.querySelectorAll('.pj-side h3')).map((h) => h.textContent.trim());
  const upper = Array.from(document.querySelectorAll('.pj *')).filter((el) => window.getComputedStyle(el).textTransform === 'uppercase' && el.textContent.trim()).map((el) => el.className).slice(0, 5);
  const title = document.querySelector('.pj-title');
  const ts = title && window.getComputedStyle(title);
  const inner = document.querySelector('.page-inner.pj');
  const smallButtons = Array.from(document.querySelectorAll('.pj .btn')).filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).map((b) => b.textContent.trim().slice(0, 40));
  return {
    inOrder, side, upper, mainWidth: main ? Math.round(main.getBoundingClientRect().width) : null,
    band: Boolean(document.querySelector('[data-testid="pj-stageband"]')) || /What to do now|Next step ›/.test(document.body.innerText),
    title: ts ? { family: ts.fontFamily, size: ts.fontSize, weight: ts.fontWeight } : null,
    settings: Boolean(document.querySelector('button[aria-label="Project settings"]')),
    hScroll: inner ? inner.scrollWidth - inner.clientWidth : null,
    ring: Boolean(document.querySelector('.pj-map-ring')),
    smallButtons,
  };
};

/* The open step's body, as a person reads it: section headings in order, and what each D3-4 check needs. */
const bodyFacts = () => {
  const main = document.querySelector('.pj-main');
  const heads = Array.from(main.querySelectorAll(':scope > .pj-stagebody h2, :scope > .pj-stagebody section > .pj-sec-h h2, :scope > section.pj-sec h2, :scope > div > section.pj-sec h2'))
    .filter((h) => h.offsetParent).map((h) => h.textContent.trim());
  const tasks = main.querySelector('section[aria-label="Tasks and approvals"]');
  const rows = tasks ? Array.from(tasks.querySelectorAll('.pj-file')).map((r) => ({
    title: r.querySelector('.pj-file-n')?.textContent, status: r.querySelector('.pj-work-status')?.textContent, meta: r.querySelector('.pj-file-m')?.textContent,
  })) : null;
  const markets = main.querySelector('[data-testid="pj-markets"]');
  const doors = markets ? Array.from(markets.querySelectorAll('.pj-sec-h .pj-sec-acts > button')).map((b) => ({ text: b.textContent.trim(), cls: b.className })) : null;
  const acts = markets ? Array.from(markets.querySelectorAll('.pj-mkt-todo-act')).map((b) => b.className) : null;
  const lead = main.querySelector('[data-testid="pj-dossier"]');
  const how = lead && Array.from(lead.querySelectorAll('details > summary')).find((s) => s.textContent === 'How this is measured');
  return {
    heads, rows, doors, acts,
    lead: lead ? { first: lead.querySelector('[data-testid="pj-dossier-home"]')?.textContent, howOpen: how ? how.parentElement.open : null } : null,
    tasksOnStep: Boolean(tasks),
    protocol: Array.from(main.querySelectorAll('[data-testid="pj-protocol"] .pj-file')).map((r) => r.textContent),
    commitments: main.querySelector('section[aria-labelledby="pj-commitments-h"]')?.textContent.slice(0, 160) ?? null,
    recordsInMain: Boolean(main.querySelector('[aria-labelledby="pj-records-h"]')),
    primary: Array.from(main.querySelectorAll('.btn.primary')).filter((b) => b.offsetParent).map((b) => b.textContent.trim()),
  };
};

async function walkStep(page, run, i) {
  const step = page.locator('.pj-lc-stage').nth(i);
  await step.scrollIntoViewIfNeeded();
  await step.click();
  const label = (await step.textContent()).trim();
  await page.waitForTimeout(1200);
  await page.waitForFunction(() => !document.querySelector('.pj-main [aria-busy="true"]'), null, { timeout: 15000 }).catch(() => {});
  const facts = await page.evaluate(pageFacts);
  const body = await page.evaluate(bodyFacts);
  /* The step's body, from the steps down: the page scrolls inside its own container, so scroll the steps to its top. */
  await page.evaluate(() => document.querySelector('.pj-lc').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  const img = await shot(page, `${run.key}-${String(i + 1)}-${label.toLowerCase().replace(/\W+/g, '-')}.png`);
  return { label, facts, body, img };
}

/* The sections D3-4 changed, each captured on its own: Tasks and approvals (Plan), Protocol (Evidence), Module
   completion's lead (Author), the Markets header (Submit), Commitments to the agency (Respond). */
const SECTIONS = {
  Plan: 'section[aria-label="Tasks and approvals"]', Evidence: 'section[aria-labelledby="pj-protocol-h"]',
  Author: 'section[aria-labelledby="pj-modules-h"]', Submit: '[data-testid="pj-markets"]', Respond: 'section[aria-labelledby="pj-commitments-h"]',
};
async function sectionShots(page, run, i, label) {
  const sel = SECTIONS[label];
  const el = sel && page.locator(`.pj-main ${sel}`).first();
  if (!el || !(await el.count())) return [];
  /* The page scrolls inside its own container, so an element capture of a tall section comes out blank: scroll the
     section's top to the top of the view and capture the view. */
  await el.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  const name = `${run.key}-${String(i + 1)}-${label.toLowerCase()}-section.png`;
  await page.screenshot({ path: path.join(SHOTS, name) });
  return [`screenshots/${name}`];
}

function checkStep(s, run) {
  const { label, facts, body } = s;
  expect(facts.inOrder, `${label}: header, composer, conversations, steps, blurb in order`);
  expect(!facts.band, `${label}: no step band`);
  expect(!facts.ring, `${label}: no readiness ring`);
  expect(facts.upper.length === 0, `${label}: nothing uppercase under .pj (${facts.upper.join(', ')})`);
  expect(facts.settings, `${label}: the Project settings button`);
  expect(['About', 'Filing', 'Team'].every((h) => facts.side.includes(h)), `${label}: Project knowledge has About, Filing, Team (${facts.side.join(', ')})`);
  if (run.width === 390) expect(facts.hScroll <= 1, `${label}: no horizontal scroll at 390 (${facts.hScroll})`);
  if (run.width === 390) expect(facts.smallButtons.length === 0, `${label}: every button at least 44px tall to the touch (${facts.smallButtons.join(', ')})`);
  expect(body.primary.length === 0, `${label}: no primary (orange) button in the step body (${body.primary.join(', ')})`);
  expect(!body.recordsInMain, `${label}: Records are in Project knowledge, not the step`);
  if (label === 'Plan') expect(body.tasksOnStep, 'Plan: Tasks and approvals');
  if (label !== 'Plan') expect(!body.tasksOnStep, `${label}: no tasks list`);
  if (label === 'Author') expect(body.lead && body.lead.howOpen === false, 'Author: Module completion led by the figure, "How this is measured" closed');
  if (label === 'Submit' && body.doors && body.doors.length) {
    expect(body.doors.every((d) => /\bsmall\b/.test(d.cls)), 'Submit: every header door is small');
    expect((body.acts || []).every((c) => /\bsmall\b/.test(c)), 'Submit: every to-do act is a small button');
  }
  if (label === 'Respond') expect(body.commitments !== null, 'Respond: Commitments to the agency');
}

(async () => {
  expect(PROGRAMS.length, 'one or more program ids');
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const sizes = [{ width: 1440, dark: false }, { width: 1440, dark: true }, { width: 390, dark: false }, { width: 390, dark: true }];
  try {
    for (const [p, program] of PROGRAMS.entries()) {
      for (const { width, dark } of sizes) {
        const run = { program, width, dark, key: `p${p + 1}-${width}-${dark ? 'dark' : 'light'}`, steps: [], failed: [] };
        const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: 1, hasTouch: width === 390 });
        const page = await ctx.newPage();
        page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) run.failed.push(`${r.status()} ${r.url().replace(BASE, '')}`); });
        page.on('pageerror', (e) => run.failed.push(`pageerror ${e.message}`));
        await signIn(page, dark);
        await page.goto(`${BASE}/concept2cure/project-home?program=${program}`, { waitUntil: 'networkidle' });
        await page.locator('h1.pj-title').waitFor({ timeout: 30000 });
        run.title = await page.locator('h1.pj-title').textContent();
        const count = await page.locator('.pj-lc-stage').count();
        expect(count === 6, `six steps (${count})`);
        for (let i = 0; i < count; i += 1) run.steps.push(await walkStep(page, run, i));
        /* The section captures last, after every step is measured (an element capture taller than the view disturbed
           the touch emulation the measurements depend on). */
        for (let i = 0; i < count; i += 1) {
          await page.locator('.pj-lc-stage').nth(i).click();
          await page.waitForTimeout(800);
          run.steps[i].parts = await sectionShots(page, run, i, run.steps[i].label);
        }
        run.steps.forEach((s) => checkStep(s, run));
        if (width === 1440) {
          const widths = run.steps.map((s) => s.facts.mainWidth);
          expect(Math.max(...widths) - Math.min(...widths) <= 1, `stable main width on all six steps (${widths.join(', ')})`);
        }
        log.runs.push(run);
        console.info(`ok  ${run.key} ${run.title} — ${run.steps.map((s) => s.label).join(', ')}; failed requests: ${run.failed.length}`);
        await ctx.close();
      }
    }
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
