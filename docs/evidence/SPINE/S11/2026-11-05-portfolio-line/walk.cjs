/**
 * S11 in the running app: the Plan step's workstreams and schedule line (THE_PROGRAM §8 items 3–4), and the portfolio
 * line on Projects (§5, §9 step 6). CLAUDE.md RULE 4: opened and used, at 1440 and at 390.
 *
 *   node docs/evidence/SPINE/S11/2026-11-05-portfolio-line/walk.cjs [base-url]
 *
 * Runs after step 3's walk (../2026-11-05-owners-and-due-dates/walk.cjs: WALK-IND-301, target Jun 4, 2027, with
 * "Submit IND" owned; WALK-IND-302, no target). Through the product's own API it makes, once, WALK-IND-303 (target
 * Feb 1, 2027: the work should have started) and WALK-510K-401 (a 510(k), target Apr 30, 2027), marks WALK-IND-301's
 * Planning tasks done and one WALK-510K-401 task blocked. Log: ./walk.json.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://127.0.0.1:5100').replace(/\/$/, '');
const EMAIL = process.env.WALK_EMAIL || 'walk.owner@example.com';
const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
const log = { base: BASE, startedAt: new Date().toISOString(), steps: [], apiErrors: [] };
const step = (name, detail = {}) => { log.steps.push({ name, ...detail }); console.info(`ok  ${name}`); };
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name), fullPage: false });

async function api(page, method, url, body) {
  return page.evaluate(async ({ method, url, body }) => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}` },
      body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, { method, url, body });
}

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
  expect(who.status === 200, `dev-login (${JSON.stringify(who)})`);
  step('sign in (one dev-login)', who);
}

async function project(page, name, body) {
  const list = await api(page, 'GET', '/api/c2c/projects?limit=100');
  const found = (list.json?.data ?? []).find((p) => p.title === name);
  if (found) return found.id;
  const made = await api(page, 'POST', '/api/c2c/projects', { name, productName: name, primaryAgency: 'FDA', ...body });
  expect(made.status < 300 && made.json?.data?.id, `${name} created (${made.status} ${JSON.stringify(made.json).slice(0, 200)})`);
  return made.json.data.id;
}

async function setStatus(page, programId, taskId, status) {
  const r = await api(page, 'PATCH', `/api/v1/pyramids/by-project/${programId}/progress/${encodeURIComponent(taskId)}`, { status });
  expect(r.status === 200, `status ${taskId} → ${status} (${r.status})`);
}

async function openPlan(page, programId) {
  await page.goto(`${BASE}/concept2cure/project-home?program=${programId}`, { waitUntil: 'networkidle' });
  await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Plan/ }).click();
  const plan = page.getByTestId('pj-program-plan');
  await plan.waitFor({ timeout: 30000 });
  return plan;
}

const rowsOf = (plan) => plan.locator('details.py-ws-row').evaluateAll((rows) => rows.map((r) =>
  [...r.querySelectorAll('summary > span')].map((s) => s.textContent).join(' | ')));

async function walk(page, P, width) {
  const tag = width === 390 ? 'phone' : 'desk';
  // 1. WALK-IND-301: on track, Planning done; the line and the workstreams.
  let plan = await openPlan(page, P.ind301);
  const line = plan.getByTestId('pj-schedule-line');
  await line.scrollIntoViewIfNeeded();
  const dots = await line.locator('.py-line-dot').evaluateAll((ds) => ds.map((d) => d.getAttribute('title')));
  const caption = await line.locator('figcaption').innerText();
  expect(/Study may proceed by Jul 4, 2027 \(FDA, 21 CFR 312\.40\)/.test(caption), `the IND's 30-day clock (${caption})`);
  await shot(page, `${tag}-01-ind301-schedule-line.png`);
  const rows301 = await rowsOf(plan);
  expect(/^Planning \| .* \| Completed \| Done$/.test(rows301[0]), `Planning is done (${rows301[0]})`);
  await plan.getByTestId('pj-workstreams').scrollIntoViewIfNeeded();
  await shot(page, `${tag}-02-ind301-workstreams.png`);
  const ws = plan.locator('details.py-ws-row').nth(7);
  await ws.locator('summary').click();
  await ws.locator('.py-row-t').first().waitFor({ timeout: 10000 });
  const opened = await ws.locator('.py-row-t').allInnerTexts();
  expect(opened.includes('Submit IND'), `the last workstream opens to its tasks (${opened})`);
  await ws.scrollIntoViewIfNeeded();
  await shot(page, `${tag}-03-ind301-workstream-open.png`);
  step(`${width}: 1. WALK-IND-301 line and workstreams`, { dots, caption, rows: rows301, opened });

  // 2. WALK-IND-303: the work should already have started.
  plan = await openPlan(page, P.ind303);
  const rows303 = await rowsOf(plan);
  expect(rows303.some((r) => r.endsWith('At risk')), `at risk (${rows303})`);
  await plan.getByTestId('pj-schedule-line').scrollIntoViewIfNeeded();
  await shot(page, `${tag}-04-ind303-at-risk.png`);
  step(`${width}: 2. WALK-IND-303 at risk`, { sentence: await plan.getByTestId('pj-program-schedule').innerText(), rows: rows303 });

  // 3. WALK-510K-401: the MDUFA goal from regulatory-timelines, a blocked workstream, and the device note.
  plan = await openPlan(page, P.k510);
  const cap510 = await plan.getByTestId('pj-schedule-line').locator('figcaption').innerText();
  expect(/MDUFA decision by Jul 29, 2027 \(FDA \(CDRH\)/.test(cap510), `the MDUFA goal (${cap510})`);
  const rows510 = await rowsOf(plan);
  expect(rows510.some((r) => r.endsWith('Blocked')), `a blocked workstream (${rows510})`);
  const note = await plan.getByTestId('pj-workstreams-note').count() ? await plan.getByTestId('pj-workstreams-note').innerText() : null;
  await plan.getByTestId('pj-schedule-line').scrollIntoViewIfNeeded();
  await shot(page, `${tag}-05-510k-line-blocked.png`);
  await plan.getByTestId('pj-workstreams').scrollIntoViewIfNeeded();
  await shot(page, `${tag}-06-510k-workstreams-note.png`);
  step(`${width}: 3. WALK-510K-401 clock, blocked, device note`, { caption: cap510, rows: rows510, note });

  // 4. Projects: each card's line, from one read for the page.
  const batches = [];
  const onReq = (r) => { if (r.url().includes('/api/v1/pyramids/by-project?refs=')) batches.push(r.url()); };
  page.on('request', onReq);
  await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'networkidle' });
  // Projects remembers the view; the cards are the grid's.
  await page.getByRole('button', { name: /^Grid/ }).click();
  await page.locator('.pj-card-plan').first().waitFor({ timeout: 20000 });
  const cards = await page.locator('.pj-card').evaluateAll((cs) => cs.map((c) => `${c.querySelector('.pj-card-t')?.textContent} → ${c.querySelector('.pj-card-plan')?.textContent ?? '(no line)'}`));
  page.off('request', onReq);
  expect(batches.length === 1, `one batch read for the page (${batches.length})`);
  await shot(page, `${tag}-07-projects-cards.png`);
  if (width !== 390) {
    await page.getByRole('button', { name: /List/ }).click();
    await shot(page, `${tag}-08-projects-list.png`);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow <= 0, `no horizontal scroll at ${width} (${overflow})`);
  step(`${width}: 4. Projects, one read, one line per card`, { batchReads: batches.length, cards, overflow });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) log.apiErrors.push(`${r.status()} ${r.url()}`); });
  try {
    await signIn(page);
    const list = await api(page, 'GET', '/api/c2c/projects?limit=100');
    const P = { ind301: (list.json?.data ?? []).find((p) => p.title === 'WALK-IND-301')?.id };
    expect(P.ind301, 'WALK-IND-301 exists (run step 3\'s walk first)');
    P.ind303 = await project(page, 'WALK-IND-303', { programType: 'ind', productType: 'drug', indication: 'Walk indication', targetSubmissionDate: '2027-02-01' });
    P.k510 = await project(page, 'WALK-510K-401', { programType: '510k', indication: 'Walk device indication', targetSubmissionDate: '2027-04-30' });
    const ind = (await api(page, 'GET', `/api/v1/pyramids/by-project/${P.ind301}`)).json.data;
    for (const t of ind.pyramid.tasks.filter((x) => x.phase === 'phase1')) await setStatus(page, P.ind301, t.id, 'done');
    const k = (await api(page, 'GET', `/api/v1/pyramids/by-project/${P.k510}`)).json.data;
    await setStatus(page, P.k510, k.pyramid.tasks.find((x) => x.phase === 'phase2').id, 'blocked');
    step('set up through the API', { projects: P });
    await walk(page, P, 1440);
    await page.setViewportSize({ width: 390, height: 844 });
    await walk(page, P, 390);
  } catch (err) {
    log.error = err instanceof Error ? err.message : String(err);
    console.error(log.error);
    await shot(page, 'zz-failure.png').catch(() => {});
    process.exitCode = 1;
  } finally {
    log.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(HERE, 'walk.json'), JSON.stringify(log, null, 2) + '\n');
    await browser.close();
  }
})();
