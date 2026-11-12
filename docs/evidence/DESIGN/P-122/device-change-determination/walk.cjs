/* Device change determination: screenshots of a change record's detail in Quality, on the device demo project NEUR.
   Usage: node shots.cjs <outDir> <baseUrl> <pwFile> <before|after>
   Signs in as the instance's author, files one change under NEUR if none is there (through the product's own route,
   as "Raise change request" does), then opens the change's detail at 1440 and 390 px, light and dark.
   "after" also uses the screen: it opens the form, forces one failed call, runs the US and the EU assessment through
   the form, and reads the result back in every size and theme. */
const { chromium } = require('playwright');
const fs = require('fs');

const [, , OUT, BASE, PW_FILE, PHASE] = process.argv;
const NEUR = '747737b6-7d3a-431d-9082-3b8a102b771f';
const BIOLOGIC = 'af5db78f-529b-45a2-a1f0-fede3f15181b';
const CHANGE = {
  changeNumber: 'NEUR-CC-2026-002',
  title: 'NP-100 sample cartridge: second-source optical window film',
  description: 'Current: the optical window film comes from one supplier. Proposed: qualify a second-source film of the same material specification for the NP-100 sample cartridge.',
  changeType: 'material', classification: 'minor', riskLevel: 'low',
  reason: 'Single-source supply risk on the cartridge optical window film.',
  programId: NEUR,
};
const SIZES = [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844 }]];
const ASSESS = 'Assess the regulatory impact';
/* The answers given through the form. US: the film could affect optical performance and verification is not done
   yet. EU: no criterion is met. */
const US_YES = ['Could the change significantly affect safety or effectiveness?'];
const EU_YES = [];

async function signIn(page) {
  await page.goto(`${BASE}/concept2cure/login`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type=email], input[name=email]', 'rr5-author@example.test');
  await page.fill('input[type=password]', fs.readFileSync(PW_FILE, 'utf8').trim());
  await page.click('button:has-text("Sign in")');
  await page.waitForTimeout(6000);
}

/** Call a QMS route as the signed-in person, from the page. */
function api(page, method, path, body) {
  return page.evaluate(async ([m, p, b]) => {
    const res = await fetch(p, {
      method: m, credentials: 'include',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` },
      body: b ? JSON.stringify(b) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  }, [method, path, body ?? null]);
}

async function ensureChange(page) {
  const listed = await api(page, 'GET', `/api/mdx/qms/changes?program_id=${NEUR}`);
  if (listed.status !== 200) throw new Error(`change list: ${listed.status}`);
  const found = (listed.json.data || []).find((c) => c.change_number === CHANGE.changeNumber);
  if (found) return found.id;
  const made = await api(page, 'POST', '/api/mdx/qms/changes', CHANGE);
  if (made.status !== 201) throw new Error(`raise change: ${made.status} ${JSON.stringify(made.json).slice(0, 200)}`);
  return made.json.data.id;
}

async function setTheme(page, dark) {
  await page.evaluate((on) => {
    const prefs = JSON.parse(localStorage.getItem('c2c-v2-prefs') || '{}');
    localStorage.setItem('c2c-v2-prefs', JSON.stringify({ ...prefs, dark: on }));
  }, dark);
}

async function openDetail(page, program, number) {
  await page.goto(`${BASE}/concept2cure/quality?program=${program}`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.getByRole('tab', { name: 'Change control' }).click();
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  const num = page.getByRole('button', { name: number, exact: true });
  await num.waitFor({ timeout: 30000 });
  if ((await num.getAttribute('aria-expanded')) !== 'true') await num.click();
  await page.waitForTimeout(600);
  await page.locator('.qcc-detail').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.info(`shot ${name}`);
}

const form = (page) => page.getByRole('dialog', { name: /Assess the regulatory impact of/ });

/** Answer every question of the open form: yes for the listed ones, no for the rest. */
async function answerAll(page, yes) {
  const groups = form(page).getByRole('radiogroup');
  const count = await groups.count();
  for (let i = 0; i < count; i += 1) {
    const group = groups.nth(i);
    const name = await group.evaluate((el) => document.getElementById(el.getAttribute('aria-labelledby'))?.textContent?.replace(/\*$/, '').trim() ?? '');
    if (name === 'Assess for') continue;
    await group.getByRole('radio', { name: yes.includes(name) ? 'Yes' : 'No' }).click();
  }
}

/** Open the form on a market. */
async function openForm(page, market) {
  await page.getByRole('button', { name: ASSESS }).first().click();
  await form(page).waitFor({ timeout: 10000 });
  await form(page).getByRole('radiogroup', { name: 'Assess for' }).getByRole('radio', { name: market }).click();
  await page.waitForTimeout(300);
}

/** Run one market's assessment through the form, and wait for the log to re-read. */
async function assess(page, market, yes) {
  await openForm(page, market);
  await answerAll(page, yes);
  await form(page).getByRole('button', { name: /Run the assessment/ }).click();
  await form(page).waitFor({ state: 'detached', timeout: 20000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(700);
}

/** Use the screen once, at 1440 light: a forced failed call, then the US and the EU assessment. */
async function useTheScreen(page) {
  await openDetail(page, NEUR, CHANGE.changeNumber);
  // A failed call: the test browser aborts the request, so nothing reaches the server.
  await page.route('**/api/mdx/qms/changes/*/regulatory-impact', (route) => route.abort());
  await openForm(page, 'United States');
  await answerAll(page, US_YES);
  await form(page).getByRole('button', { name: /Run the assessment/ }).click();
  await form(page).getByRole('status').waitFor({ timeout: 15000 });
  await form(page).getByRole('status').scrollIntoViewIfNeeded();
  await shot(page, 'after-1440-light-3-failed-call-says-so');
  await page.unroute('**/api/mdx/qms/changes/*/regulatory-impact');
  await form(page).getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(300);
  await page.locator('.qcc-impact').scrollIntoViewIfNeeded();
  await shot(page, 'after-1440-light-3b-nothing-recorded-after-the-failed-call');

  await assess(page, 'United States', US_YES);
  await page.locator('.qcc-impact').scrollIntoViewIfNeeded();
  await shot(page, 'after-1440-light-4-us-recorded-toast');
  await assess(page, 'European Union', EU_YES);
}

async function context(browser, state, viewport, dark) {
  const ctx = await browser.newContext({ viewport, storageState: state });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/concept2cure/quality?program=${NEUR}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await setTheme(page, dark);
  return { ctx, page };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    const first = await browser.newPage({ viewport: SIZES[0][1] });
    await signIn(first);
    const id = await ensureChange(first);
    console.info(`change ${CHANGE.changeNumber} is id ${id}`);
    const state = await first.context().storageState();
    await first.close();
    const each = async (run) => {
      for (const [w, viewport] of SIZES) {
        for (const dark of [false, true]) {
          const { ctx, page } = await context(browser, state, viewport, dark);
          await run(page, `${PHASE}-${w}-${dark ? 'dark' : 'light'}`);
          await ctx.close();
        }
      }
    };
    if (PHASE === 'before') {
      await each(async (page, tag) => {
        await openDetail(page, NEUR, CHANGE.changeNumber);
        await shot(page, `${tag}-1-device-change`);
        await openDetail(page, BIOLOGIC, 'LMN-CC-2026-021');
        await shot(page, `${tag}-9-biologic-change`);
      });
      return;
    }
    // After, pass 1: what is offered before anything is assessed, and the form with no question answered.
    await each(async (page, tag) => {
      await openDetail(page, NEUR, CHANGE.changeNumber);
      await page.locator('.qcc-impact').scrollIntoViewIfNeeded();
      await shot(page, `${tag}-1-offered-not-assessed`);
      await openForm(page, 'United States');
      await shot(page, `${tag}-2-form-no-question-answered`);
    });
    const { ctx, page } = await context(browser, state, SIZES[0][1], false);
    await useTheScreen(page);
    await ctx.close();
    // After, pass 2: the determinations as kept, assessing again, and a biologic project's change.
    await each(async (page, tag) => {
      await openDetail(page, NEUR, CHANGE.changeNumber);
      await page.locator('.qcc-impact').scrollIntoViewIfNeeded();
      await shot(page, `${tag}-5-determinations-kept`);
      await openForm(page, 'United States');
      await shot(page, `${tag}-6-assessing-again`);
      await form(page).getByRole('button', { name: 'Cancel' }).click();
      await openDetail(page, BIOLOGIC, 'LMN-CC-2026-021');
      await shot(page, `${tag}-9-biologic-change-one-sentence`);
    });
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 1500)); process.exit(1); });
