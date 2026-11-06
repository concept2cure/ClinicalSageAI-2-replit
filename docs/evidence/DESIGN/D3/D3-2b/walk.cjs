/**
 * D3-2b, one read for several readers, used in the running app (CLAUDE.md RULE 4).
 *
 *   node docs/evidence/DESIGN/D3/D3-2b/walk.cjs [base-url] [programId]
 *
 * One dev-login. The project page's unified work and agency inbox are not read again on any step change (counted
 * at the network). At mount the dev server reads each twice: main.tsx renders under React.StrictMode, which runs
 * effects twice in development only. The Filing card says the agency letters and opens Respond; the
 * Team card says each person's open work. 1440 light and dark, 390 light. Log: ./walk.json, shots: ./screenshots/.
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

const WORK = /\/unified-work(\?|$)/;
const COMMS = /\/agency-communications(\?|$)/;

(async () => {
  expect(PROGRAM, 'a program id');
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const runs = [{ width: 1440, dark: false }, { width: 1440, dark: true }, { width: 390, dark: false }];
  try {
    for (const { width, dark } of runs) {
      const theme = dark ? 'dark' : 'light';
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await signIn(page, dark);
      const seen = { work: 0, comms: 0 };
      const urls = [];
      page.on('request', (r) => { if (r.method() !== 'GET') return; if (WORK.test(r.url())) { seen.work += 1; urls.push(r.url()); } if (COMMS.test(r.url())) { seen.comms += 1; urls.push(r.url()); } });
      log.urls = urls;
      await openProject(page);
      const filing = page.getByRole('region', { name: 'Filing', exact: true });
      const letters = filing.getByRole('button', { name: /^Agency letters: / });
      await page.waitForFunction(() => {
        const b = Array.from(document.querySelectorAll('button')).find((x) => (x.getAttribute('aria-label') || '').startsWith('Agency letters: '));
        return b && !/Reading/.test(b.getAttribute('aria-label'));
      }, null, { timeout: 20000 });
      const lettersName = await letters.getAttribute('aria-label');
      const team = page.getByRole('region', { name: 'Team', exact: true });
      await page.waitForFunction(() => !!document.querySelector('[aria-labelledby="pj-team-card-h"] .pj-team-due, [aria-labelledby="pj-team-card-h"] [role="status"]'), null, { timeout: 20000 });
      const teamLines = await team.locator('.pj-team-due, [role="status"], .pj-k-row').allTextContents();
      if (width === 1440 && !dark) {
        await page.waitForTimeout(1500);
        const atLoad = { ...seen };
        for (const label of ['Plan', 'Evidence', 'Author', 'Review', 'Submit', 'Respond', 'Plan', 'Review']) {
          await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: new RegExp(`^${label}`) }).click();
          await page.waitForTimeout(400);
        }
        await page.waitForTimeout(800);
        log.atLoad = atLoad; log.afterSteps = { ...seen };
        expect(seen.work === atLoad.work && seen.comms === atLoad.comms, `no read on a step change (at load ${JSON.stringify(atLoad)}, after ${JSON.stringify(seen)})`);
        await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Plan/ }).click();
        await letters.click();
        await page.waitForTimeout(400);
        const current = await page.evaluate(() => document.querySelector('.pj-lc-stage[aria-current="step"]')?.textContent?.trim());
        expect(current === 'Respond', 'the letters row opens Respond');
        step('no read of the work or the inbox on any of eight step changes; the letters row opens Respond', { atLoad, afterSteps: { ...seen }, opened: current });
      }
      await filing.scrollIntoViewIfNeeded();
      const shotFile = await shot(page, `${width}-${theme}-filing-team.png`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(!overflow, `no sideways scroll at ${width}`);
      step(`the Filing and Team cards, ${width} ${theme}`, { lettersName, teamLines, shot: shotFile });
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
