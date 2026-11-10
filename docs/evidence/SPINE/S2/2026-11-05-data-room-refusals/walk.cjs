/**
 * The project's Data Room in the running app, with each answer its sources read
 * can get (CLAUDE.md RULE 4: a screen is not done until it was opened and used).
 *
 *   node docs/evidence/SPINE/S2/2026-11-05-data-room-refusals/walk.cjs [base-url] [programId]
 *
 * One dev-login. The project page's Evidence step, Project files, Data room. The
 * sources read answered as the server answers it, then with the module gate's own
 * 403 bodies injected at the browser (the dev account is a platform admin the gate
 * lets through, as the Vault's S6 walk notes): not licensed, not in this release,
 * and a server failure. 1440 and 390 wide. Log: ./walk.json, shots: ./screenshots/.
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

/* The gate's bodies, as server/middleware/moduleEntitlementGate.ts sends them. */
const ANSWERS = {
  'not-licensed': { status: 403, body: { error: 'Module access denied', code: 'MODULE_NOT_LICENSED', module: 'vault', modules: ['vault'], reason: 'Not included in this plan' } },
  'out-of-release': { status: 403, body: { error: { code: 'LAUNCH_SCOPE', message: 'This part of the product is not in this release.' } } },
  'server-failure': { status: 500, body: { error: { code: 'INTERNAL', message: 'Request failed.' } } },
};

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
  expect(who.status === 200 && who.email === EMAIL, `dev-login as ${EMAIL}`);
  step('sign in (one dev-login)', { email: who.email });
}

/** The Data Room lane of Project files, on the project page. */
async function openDataRoom(page) {
  await page.goto(`${BASE}/concept2cure/project-home?program=${PROGRAM}`, { waitUntil: 'networkidle' });
  const steps = page.getByRole('navigation', { name: 'Project lifecycle' });
  await steps.getByRole('button', { name: /^Evidence/ }).click();
  const files = page.locator('#pj-evidence-h');
  await files.waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Data room', exact: true }).click();
  const room = page.getByTestId('editor-data-room');
  await room.waitFor({ timeout: 20000 });
  await room.scrollIntoViewIfNeeded();
  return room;
}

async function shoot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

(async () => {
  expect(PROGRAM, 'a program id argument');
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: 2 });
      const page = await context.newPage();
      await signIn(page);

      // As the server answers it.
      let room = await openDataRoom(page);
      await room.getByText('dw1-synopsis.txt').waitFor({ timeout: 20000 });
      await shoot(page, `${width}-normal`);
      step(`${width}: the Data Room lists the adopted source`, { text: (await room.innerText()).slice(0, 300) });

      for (const [name, answer] of Object.entries(ANSWERS)) {
        await page.route('**/api/c2c/projects/*/sources*', (route) =>
          route.fulfill({ status: answer.status, contentType: 'application/json', body: JSON.stringify(answer.body) }));
        room = await openDataRoom(page);
        await room.getByText(name === 'server-failure' ? 'The data room could not be read' : /Not enabled for your organization|Not in this release/)
          .first().waitFor({ timeout: 20000 })
          .catch(async (e) => { await shoot(page, `${width}-${name}-UNEXPECTED`); log.dom = (await room.innerHTML()).slice(0, 2000); throw e; });
        const text = (await room.innerText()).replace(/\s+/g, ' ');
        const retry = await room.getByRole('button', { name: 'Try again' }).count();
        if (name === 'server-failure') {
          expect(/The data room could not be read/.test(text) && retry === 1, `${name}: a failed read with a retry (${text})`);
        } else {
          expect(!/could not be read/.test(text) && retry === 0, `${name}: its own words and no retry (${text})`);
        }
        await shoot(page, `${width}-${name}`);
        step(`${width}: ${name}`, { status: answer.status, text: text.slice(0, 300), retryOffered: retry === 1 });
        await page.unroute('**/api/c2c/projects/*/sources*');
      }
      await context.close();
    }
    log.finishedAt = new Date().toISOString();
    log.ok = true;
  } catch (err) {
    log.ok = false;
    log.error = String(err && err.message || err);
    console.error(log.error);
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2) + '\n');
    await browser.close();
  }
})();
