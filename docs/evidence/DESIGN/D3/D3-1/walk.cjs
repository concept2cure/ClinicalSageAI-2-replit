/**
 * D3-1, the project page's frame, opened and used in the running app (CLAUDE.md RULE 4).
 *
 *   node docs/evidence/DESIGN/D3/D3-1/walk.cjs [base-url] [programId]
 *
 * One dev-login. The project page at 1440 and 390 wide, light and dark: the header (name, settings, byline,
 * objective), AnA's composer with the open step's suggestion, the project's conversations, the steps as one
 * segmented control, and Project knowledge beside them. A suggestion fills the box and sends nothing. Each step
 * offers its own suggestion. Project settings opens as a drawer, closes on Escape and gives focus back.
 * Log: ./walk.json, shots: ./screenshots/.
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
  await page.getByRole('navigation', { name: 'Project lifecycle' }).waitFor({ timeout: 20000 });
}

/** What the frame shows, read from the page, not assumed. */
async function readFrame(page) {
  return page.evaluate(() => {
    const t = (s) => document.querySelector(s)?.textContent?.trim() ?? null;
    const main = document.querySelector('.pj-main');
    const order = main ? Array.from(main.children).map((c) => c.className || c.tagName) : [];
    const facts = Array.from(document.querySelectorAll('.pj-side dl.pj-fact')).map((dl) => [dl.querySelector('dt')?.textContent, dl.querySelector('dd')?.textContent]);
    const stepsEl = document.querySelector('nav.pj-lc');
    const steps = Array.from(stepsEl?.querySelectorAll('button') ?? []).map((b) => ({ label: b.textContent.trim(), current: b.getAttribute('aria-current') }));
    const suggestions = Array.from(document.querySelectorAll('[role="group"][aria-label="Suggestions"] button')).map((b) => b.textContent.trim());
    return {
      title: t('h1.pj-title'), byline: t('.pj-top .pj-byline'), objective: !!document.querySelector('.pj-top .pj-objective'),
      settingsButton: !!document.querySelector('.pj-top button[aria-label="Project settings"]'),
      composer: !!document.querySelector('textarea[aria-label="Ask AnA about this project"]'),
      suggestions, steps, blurb: t('.pj-step-blurb'), order,
      knowledge: t('#pj-knowledge-h'), facts,
      stageBand: !!document.querySelector('[data-testid="pj-stageband"], .pj-stageband'),
      whatToDoNow: /What to do now|Next step/.test(document.body.innerText),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
  return `screenshots/${name}`;
}

/** At 1440 light: a suggestion, every step, and the settings drawer, used. */
async function exerciseThePage(page) {
      /* A suggestion fills the box and sends nothing. */
      const posts = [];
      page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/(chat|ana)/.test(r.url())) posts.push(r.url()); });
      const box = page.getByRole('textbox', { name: 'Ask AnA about this project' });
      const first = page.getByRole('group', { name: 'Suggestions' }).getByRole('button').first();
      const words = (await first.textContent()).trim();
      await first.click();
      await page.waitForTimeout(400);
      const value = await box.inputValue();
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
      expect(value === words, 'the suggestion is in the box');
      expect(focused === 'Ask AnA about this project', 'focus is in the box');
      expect(posts.length === 0, 'nothing was sent');
      step('a suggestion fills the box and sends nothing', { words, value, focused, posts });
      await box.fill('');

      /* Each step offers its own suggestion. */
      const perStep = [];
      for (const label of ['Plan', 'Evidence', 'Author', 'Review', 'Submit', 'Respond']) {
        await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: new RegExp(`^${label}`) }).click();
        await page.waitForTimeout(300);
        const f = await readFrame(page);
        const measured = await page.evaluate(() => ({
          mainWidth: Math.round(document.querySelector('.pj-main').getBoundingClientRect().width),
          /* Measured, not asserted: the step bodies are D3-4's (D3.md §4.7, acceptance 3). */
          uppercase: Array.from(document.querySelectorAll('.pj *')).filter((e) => window.getComputedStyle(e).textTransform === 'uppercase' && e.textContent.trim()).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`),
        }));
        perStep.push({ step: label, current: f.steps.find((s) => s.current === 'step')?.label, suggestions: f.suggestions, blurb: f.blurb, ...measured });
      }
      expect(perStep.every((p) => p.current === p.step), 'each click opens its step');
      const widths = perStep.map((p) => p.mainWidth);
      expect(Math.max(...widths) - Math.min(...widths) <= 1, `the main column keeps its width on every step (${widths.join(', ')})`);
      step('each step offers its own suggestion', { perStep });
      await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Author/ }).click();
      await page.waitForTimeout(300);
      await shot(page, '1440-light-author-step.png');

      /* Project settings is a drawer: it opens, Escape closes it, focus returns. */
      await page.evaluate(() => window.scrollTo(0, 0));
      const trigger = page.locator('.pj-top button[aria-label="Project settings"]');
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Project settings' });
      await dialog.waitFor({ timeout: 10000 });
      await page.waitForTimeout(500);
      const drawer = await shot(page, '1440-light-settings-drawer.png');
      const inDialog = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
      expect(await dialog.getByRole('button', { name: 'Close settings' }).count() === 1, 'the drawer closes by "Close settings"');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached', timeout: 5000 });
      const back = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
      expect(inDialog, 'focus moves into the drawer');
      expect(back === 'Project settings', 'focus returns to the settings button');
      step('Project settings is a drawer: Escape closes it and focus returns', { inDialog, focusAfterClose: back, shot: drawer });
}

(async () => {
  expect(PROGRAM, 'a program id');
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const dark of [false, true]) {
      for (const width of [1440, 390]) {
        const theme = dark ? 'dark' : 'light';
        const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 960 }, deviceScaleFactor: 2 });
        const page = await ctx.newPage();
        await signIn(page, dark);
        await openProject(page);
        const frame = await readFrame(page);
        expect(frame.title, 'the project name');
        expect(frame.composer, "AnA's composer on the page");
        expect(frame.suggestions.length >= 1, 'the open step offers a suggestion');
        expect(frame.steps.length === 6, 'six steps in one control');
        expect(frame.steps.filter((s) => s.current === 'step').length === 1, 'one step is current');
        expect(frame.knowledge === 'Project knowledge', 'Project knowledge beside the steps');
        expect(!frame.stageBand && !frame.whatToDoNow, 'no step band, no "What to do now"');
        expect(!frame.overflowX, `no sideways scroll at ${width}`);
        expect(await page.locator('body').getAttribute('data-theme') === (dark ? 'dark' : null), `${theme} theme`);
        const top = await shot(page, `${width}-${theme}-top.png`);
        await page.getByRole('navigation', { name: 'Project lifecycle' }).scrollIntoViewIfNeeded();
        const stepsShot = await shot(page, `${width}-${theme}-steps.png`);
        step(`the frame, ${width} ${theme}`, { frame, shots: [top, stepsShot] });

        if (!dark && width === 1440) await exerciseThePage(page);
        await ctx.close();
      }
    }
    log.result = 'pass';
  } catch (e) {
    log.result = 'fail';
    log.error = String(e && e.stack || e);
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2) + '\n');
  }
})();
