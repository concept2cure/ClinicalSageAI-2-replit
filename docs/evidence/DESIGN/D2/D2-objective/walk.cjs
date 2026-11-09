/**
 * The New project wizard's objective in the running app (D2 §2.4 item 6; S1, 505449d7a). A project is created with
 * an objective through the wizard at 1440 light: the field is "Objective (optional)" and holds at most 4,000
 * characters; POST /api/c2c/projects carries the objective, and no charter write follows it; the new project's
 * objectives read (GET /api/charters/by-project/:ref/objectives) holds it as version 1. A malformed objective is
 * refused by the server in its own words, and nothing is created. Then the field at 390 dark.
 *
 *   node docs/evidence/DESIGN/D2/D2-objective/walk.cjs [base-url]
 *
 * Log: ./walk.json; shots: ./screenshots/.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5000').replace(/\/$/, '');
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
const log = { base: BASE, startedAt: new Date().toISOString(), steps: [], requests: [] };
const ok = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };

async function signIn(page, dark) {
  await page.goto(BASE + '/');
  await page.evaluate(async (dark) => {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) });
    const j = await r.json();
    for (const s of [localStorage, sessionStorage]) {
      s.setItem('trialsage_access_token', j.accessToken); s.setItem('trialsage_refresh_token', j.refreshToken ?? '');
      s.setItem('trialsage_token_expiry', new Date(Date.now() + 864e5).toISOString()); s.setItem('trialsage_user', JSON.stringify(j.user));
    }
    localStorage.setItem('c2c-v2-prefs', JSON.stringify({ dark }));
  }, dark);
}

async function toConfigure(page) {
  await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /New project/ }).first().click();
  await page.locator('.rpk-type').first().click();
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.getByRole('textbox', { name: 'Objective (optional)' }).waitFor({ timeout: 30000 });
}

async function fillConfigure(page, stamp) {
    const objective = `Open the IND for D2 walk ${stamp}: show the product is safe at the proposed first-in-human doses.`;
    await page.getByRole('textbox', { name: /Project name/ }).fill(`D2 objective walk ${stamp}`);
    const ws = page.locator('#npw-client-workspace');
    await page.waitForFunction(() => { const el = document.querySelector('#npw-client-workspace'); return el && !el.disabled && el.options.length > 1; }, null, { timeout: 30000 });
    if (!(await ws.inputValue())) await ws.selectOption({ index: 1 });
    const productName = page.getByRole('textbox', { name: /Product name/ });
    if (await productName.count()) await productName.fill('BX-204');
    const productType = page.getByRole('combobox', { name: /Product type/ });
    if (await productType.count()) await productType.selectOption({ index: 1 }).catch(() => {});
  return objective;
}

async function objectiveOfRecord(page, programId, objective) {
    const read = await page.evaluate(async (programId) => {
      const auth = { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` };
      const r = await fetch(`/api/charters/by-project/${programId}/objectives`, { headers: auth });
      return { status: r.status, body: await r.json() };
    }, programId);
    const text = JSON.stringify(read.body);
    log.requests.push({ get: 'objectives', status: read.status, version: read.body?.data?.version ?? read.body?.version ?? null });
    expect(read.status === 200 && text.includes(objective), `the project's objective of record is the one stated (${read.status} ${text.slice(0, 200)})`);
  return read;
}

async function createWithObjective(page, stamp) {
    await signIn(page, false);
    await toConfigure(page);
    const field = page.getByRole('textbox', { name: 'Objective (optional)' });
    expect(await field.getAttribute('maxlength') === '4000', 'the field holds at most 4,000 characters, the server\'s limit');
    const objective = await fillConfigure(page, stamp);
    await field.fill(objective);
    await field.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, 'objective-field-1440-light.png') });
    ok('the objective field is labelled optional, with the server\'s limit');

    const charterWrites = [];
    page.on('request', (r) => { if (/\/api\/charters\//.test(r.url()) && r.method() !== 'GET') charterWrites.push(`${r.method()} ${r.url()}`); });
    await page.getByRole('button', { name: /^Continue$/ }).click();
    const review = await page.locator('.npw-review-row').filter({ has: page.locator('dt', { hasText: /^Objective$/ }) }).locator('dd').textContent();
    expect(review.trim() === objective, `the review shows the objective (${review})`);
    await page.screenshot({ path: path.join(SHOTS, 'objective-review-1440-light.png') });
    const posted = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/c2c\/projects$/.test(r.url()), { timeout: 60000 });
    await page.getByRole('button', { name: /Create project/ }).click();
    const res = await posted;
    const sent = res.request().postDataJSON();
    const receipt = await res.json();
    log.requests.push({ post: '/api/c2c/projects', status: res.status(), sentObjective: sent.objective, recorded: receipt?.meta?.objective ?? receipt?.data?.objective ?? null });
    expect(res.status() === 201 && sent.objective === objective, `the create carries the objective (${res.status()})`);
    const programId = receipt?.data?.id;
    await page.waitForURL(/project-home/, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    expect(charterWrites.length === 0, `no second write: ${charterWrites.join(', ')}`);
    const read = await objectiveOfRecord(page, programId, objective);
    await page.screenshot({ path: path.join(SHOTS, 'project-created-1440-light.png') });
    ok('the project is created with its objective, in one write, and its objective of record is it', { programId, read: read.status });

  return sent;
}

async function refusedByServer(page, sent) {
    // The wizard's own body, with an objective one character past the server's limit.
    const refused = await page.evaluate(async (body) => {
      const auth = { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}`, 'Content-Type': 'application/json' };
      const r = await fetch('/api/c2c/projects', { method: 'POST', headers: auth, body: JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    }, { ...sent, name: `${sent.name} (refused)`, objective: 'x'.repeat(4001) });
    log.requests.push({ post: '/api/c2c/projects (4,001 characters)', status: refused.status, message: refused.body?.message ?? refused.body?.error });
    expect(refused.status === 400 && /at most 4,000 characters/.test(JSON.stringify(refused.body)), `an over-long objective is refused in the server's words (${JSON.stringify(refused).slice(0, 220)})`);
    ok('an over-long objective is refused by the server in its own words', { status: refused.status });
}

async function atPhoneWidth(browser) {
    const small = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const p2 = await small.newPage();
    await signIn(p2, true);
    await toConfigure(p2);
    const f2 = p2.getByRole('textbox', { name: 'Objective (optional)' });
    await f2.scrollIntoViewIfNeeded();
    await p2.screenshot({ path: path.join(SHOTS, 'objective-field-390-dark.png') });
    const hScroll = await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(hScroll <= 1, `no sideways scroll at 390 (${hScroll})`);
    ok('the field at 390 dark', { hScroll });
    await small.close();
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const sent = await createWithObjective(page, stamp);
    await refusedByServer(page, sent);
    await ctx.close();
    await atPhoneWidth(browser);
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2));
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
