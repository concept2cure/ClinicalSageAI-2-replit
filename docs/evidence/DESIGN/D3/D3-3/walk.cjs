/**
 * D3-3, the Team card and drawer and the settings request, opened and used in the running app (CLAUDE.md RULE 4).
 *
 *   node docs/evidence/DESIGN/D3/D3-3/walk.cjs [base-url] [programId]
 *
 * One dev-login. On the project page: the Team card is in Project knowledge on all six steps, and Plan has no Team
 * section. "Manage" opens the Team drawer (roster, sharing, the authority note once). Escape closes it and focus
 * returns to "Manage". About's "Edit" opens Project settings with focus in the description. 1440 and 390, light; the
 * drawer also in dark. Log: ./walk.json, shots: ./screenshots/.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const PROGRAM = process.argv[3];
const EMAIL = process.env.DEMO_SEED_EMAIL || 'jm.smith@concept2cure.pro';
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
const NOTE = 'Recorded responsibilities describe coordination.';
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

/** The Team card on every step; no Team section in the main column. */
async function cardOnEveryStep(page) {
  const steps = [];
  for (const label of ['Plan', 'Evidence', 'Author', 'Review', 'Submit', 'Respond']) {
    await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: new RegExp(`^${label}`) }).click();
    await page.waitForTimeout(300);
    steps.push(await page.evaluate((step) => {
      const card = document.querySelector('aside.pj-side [aria-labelledby="pj-team-card-h"]');
      const rows = Array.from(card?.querySelectorAll('.pj-team-row') ?? []).map((r) => r.textContent.trim());
      const mainTeam = Array.from(document.querySelectorAll('.pj-main h2')).some((h) => h.textContent.trim() === 'Team');
      return { step, card: !!card, rows, mainTeam };
    }, label));
  }
  expect(steps.every((s) => s.card && !s.mainTeam), 'the Team card on every step, and no Team section in the main column');
  return steps;
}

/** "Manage" opens the drawer; Escape closes it and focus returns. */
async function teamDrawer(page, shotName) {
  const manage = page.getByRole('button', { name: 'Manage team' });
  await manage.scrollIntoViewIfNeeded();
  await manage.click();
  const drawer = page.getByRole('dialog', { name: 'Team' });
  await drawer.waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  const read = await drawer.evaluate((d, note) => ({
    roster: !!d.querySelector('[aria-label="Recorded project team"]'),
    sharing: Array.from(d.querySelectorAll('h2, h3, h4')).map((h) => h.textContent.trim()),
    notes: d.textContent.split(note).length - 1,
    focusInside: d.contains(document.activeElement),
    width: Math.round(d.getBoundingClientRect().width),
  }), NOTE);
  const file = await shot(page, shotName);
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'detached', timeout: 5000 });
  const back = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  expect(read.roster, 'the recorded team in the drawer');
  expect(read.notes === 1, 'the authority note once');
  expect(read.focusInside, 'focus moves into the drawer');
  expect(back === 'Manage team', 'focus returns to "Manage"');
  return { ...read, focusAfterClose: back, shot: file };
}

/** About's "Edit" opens Project settings with focus in the description. */
async function aboutEdit(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'Edit project details' }).click();
  const dialog = page.getByRole('dialog', { name: 'Project settings' });
  await dialog.waitFor({ timeout: 10000 });
  await page.getByRole('textbox', { name: 'Project description' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  const focused = await page.evaluate(() => document.activeElement?.closest('label')?.textContent?.trim().slice(0, 40) ?? document.activeElement?.tagName);
  const file = await shot(page, '1440-light-about-edit.png');
  expect(/^Project description/.test(focused), `focus in the description (was ${focused})`);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached', timeout: 5000 });
  return { focused, shot: file };
}

(async () => {
  expect(PROGRAM, 'a program id');
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const runs = [{ width: 1440, dark: false }, { width: 390, dark: false }, { width: 1440, dark: true }];
  try {
    for (const { width, dark } of runs) {
      const theme = dark ? 'dark' : 'light';
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 960 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await signIn(page, dark);
      await openProject(page);
      if (width === 1440 && !dark) step('the Team card on every step; Plan has no Team section', { steps: await cardOnEveryStep(page) });
      await page.locator('aside.pj-side [aria-labelledby="pj-team-card-h"]').scrollIntoViewIfNeeded();
      const card = await shot(page, `${width}-${theme}-team-card.png`);
      step(`Manage opens the Team drawer, ${width} ${theme}`, { card, ...(await teamDrawer(page, `${width}-${theme}-team-drawer.png`)) });
      if (width === 1440 && !dark) step('About "Edit" opens Project settings on the description', await aboutEdit(page));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(!overflow, `no sideways scroll at ${width}`);
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
