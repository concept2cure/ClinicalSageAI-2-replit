/**
 * Read-only browser check of the existing project editor's working-document list.
 * Uses the real local app, dev-login and an existing synthetic document first.
 * The three HTTP-200 faults are injected client result-integrity checks; they
 * are not evidence that the server returned another project's records.
 *
 * BASE_URL=http://127.0.0.1:5100 SCOPE_TEST_EMAIL=scope.editor@example.test \
 * SCOPE_TEST_PROGRAM=<project UUID> SCOPE_TEST_DOCUMENT=<document UUID> \
 * node docs/evidence/F1/2026-11-06-authoring-project-write-access/browser-scope.cjs
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const ERROR_TITLE = 'Couldn’t load documents';
const FOREIGN_TITLE = 'Injected other-project document — client integrity fixture';
const runId = new Date().toISOString().replace(/[^0-9A-Za-z]/g, '') + '-' + crypto.randomBytes(3).toString('hex');
const outputDir = path.join(__dirname, 'browser-scope', runId);
const resultPath = path.join(outputDir, 'results.json');
const state = {
  status: 'running', startedAt: new Date().toISOString(), stage: 'configuration',
  scope: 'Existing local production editor; authenticated real own-project positive, then injected HTTP-200 client-integrity faults. No model or submission actions.',
  cases: [], blockedMutations: [], externalRequestsBlocked: [], apiReadFailures: [],
  applicationMutationsForwarded: 0, authenticationException: 'Only POST /api/auth/dev-login is allowed.',
};

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}
function checkpoint() {
  fs.writeFileSync(resultPath, JSON.stringify(state, null, 2) + '\n');
}
function configuration() {
  const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:5100');
  const local = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(base.hostname);
  if (!local || !['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') fail('LOOPBACK_BASE_URL_REQUIRED');
  const email = process.env.SCOPE_TEST_EMAIL || '';
  if (!/^[^\s@]+@[^\s@]+\.test$/i.test(email)) fail('SYNTHETIC_TEST_EMAIL_REQUIRED');
  const programId = process.env.SCOPE_TEST_PROGRAM || '';
  const documentId = process.env.SCOPE_TEST_DOCUMENT || '';
  if (!UUID.test(programId) || !UUID.test(documentId)) fail('EXISTING_PROJECT_AND_DOCUMENT_UUIDS_REQUIRED');
  return { base: base.origin, email, programId: programId.toLowerCase(), documentId: documentId.toLowerCase() };
}
function scopedList(request, config) {
  const url = new URL(request.url());
  return request.method() === 'GET' && url.origin === config.base && url.pathname === '/api/authoring/docs'
    && url.searchParams.get('programId') === config.programId;
}
function faultBody(mode, body, own, config) {
  const foreignProgram = config.programId === '22222222-2222-4222-8222-222222222222'
    ? '33333333-3333-4333-8333-333333333333' : '22222222-2222-4222-8222-222222222222';
  const foreign = { ...own, id: crypto.randomUUID(), title: FOREIGN_TITLE, program_id: foreignProgram };
  if (mode === 'unsuccessful') return { ...body, success: false };
  return { ...body, success: true, documents: mode === 'foreign' ? [foreign] : [own, foreign] };
}
async function guardRequests(context, config, fault) {
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== config.base) {
      state.externalRequestsBlocked.push({ host: url.hostname, method: request.method() });
      await route.abort('blockedbyclient');
      return;
    }
    const read = ['GET', 'HEAD', 'OPTIONS'].includes(request.method());
    const login = request.method() === 'POST' && url.pathname === '/api/auth/dev-login';
    if (url.pathname.startsWith('/api/') && !read && !login) {
      state.blockedMutations.push({ method: request.method(), path: url.pathname });
      await route.abort('blockedbyclient');
      return;
    }
    if (fault.mode !== 'positive' && scopedList(request, config)) {
      fault.hits += 1;
      await route.fulfill({ status: 200, contentType: 'application/json',
        headers: { 'cache-control': 'no-store' }, body: JSON.stringify(faultBody(fault.mode, fault.body, fault.own, config)) });
      return;
    }
    await route.continue();
  });
}
async function signIn(page, config) {
  await page.goto(config.base + '/', { waitUntil: 'domcontentloaded' });
  const status = await page.evaluate(async email => {
    const response = await fetch('/api/auth/dev-login', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const body = await response.json().catch(() => null);
    if (response.status !== 200) return response.status;
    if (!body?.accessToken || !body?.user) return -1;
    const part = body.accessToken.split('.')[1];
    let expires = Date.now() + 10 * 60_000;
    try {
      const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
      if (Number.isFinite(payload.exp)) expires = payload.exp * 1000;
    } catch { /* AuthService still checks the real returned bearer. */ }
    for (const storage of [localStorage, sessionStorage]) {
      storage.setItem('trialsage_access_token', body.accessToken);
      storage.setItem('trialsage_refresh_token', body.refreshToken ?? '');
      storage.setItem('trialsage_token_expiry', new Date(expires).toISOString());
      storage.setItem('trialsage_user', JSON.stringify(body.user));
    }
    return 200;
  }, config.email);
  if (status !== 200) fail('SYNTHETIC_DEV_LOGIN_FAILED');
}
async function actualList(page, config) {
  const result = await page.evaluate(async programId => {
    const response = await fetch('/api/authoring/docs?status=all&programId=' + encodeURIComponent(programId), {
      headers: { Authorization: 'Bearer ' + localStorage.getItem('trialsage_access_token') },
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, config.programId);
  const body = result.body;
  if (result.status !== 200 || body?.success !== true || !Array.isArray(body.documents)
    || body.documents.some(row => row?.program_id !== config.programId)) fail('REAL_OWN_PROJECT_LIST_NOT_VERIFIED');
  const own = body.documents.find(row => row.id === config.documentId && typeof row.title === 'string' && row.title.trim());
  if (!own) fail('EXISTING_TEST_DOCUMENT_NOT_IN_REAL_LIST');
  return { body, own };
}
async function screenshot(page, width, label) {
  const name = `${width}-${label}.png`;
  await page.screenshot({ path: path.join(outputDir, name), fullPage: true });
  return path.relative(__dirname, path.join(outputDir, name));
}
async function rejectList(page, fault, width, mode) {
  state.stage = `${width}:${mode}`;
  fault.mode = mode;
  fault.hits = 0;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.ed').waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByText(ERROR_TITLE, { exact: true }).waitFor({ state: 'visible', timeout: 45_000 });
  if (fault.hits < 1) fail('FAULT_DID_NOT_INTERCEPT_SCOPED_LIST');
  if (await page.locator('.ed-tree .ed-vol').count()) fail('UNVERIFIED_DOCUMENT_ROWS_REMAINED');
  if (await page.getByText(FOREIGN_TITLE, { exact: true }).count()) fail('INJECTED_FOREIGN_TITLE_RENDERED');
  state.cases.push({ width, mode, status: 'passed', injectedHttp200Responses: fault.hits,
    errorShown: true, documentListRows: 0, foreignTitleRendered: false,
    screenshot: await screenshot(page, width, mode) });
  checkpoint();
}
async function runViewport(browser, config, width) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: 'light' });
  const fault = { mode: 'positive', body: null, own: null, hits: 0 };
  const page = await context.newPage();
  page.on('response', response => {
    const url = new URL(response.url());
    if (response.status() >= 400 && url.pathname.startsWith('/api/') && ['GET', 'HEAD'].includes(response.request().method())) {
      state.apiReadFailures.push({ width, status: response.status(), path: url.pathname });
    }
  });
  try {
    await guardRequests(context, config, fault);
    state.stage = `${width}:sign-in`;
    await signIn(page, config);
    state.stage = `${width}:real-positive`;
    Object.assign(fault, await actualList(page, config));
    await page.goto(`${config.base}/concept2cure/document-authoring?program=${config.programId}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.ed').waitFor({ state: 'visible', timeout: 60_000 });
    const ownRow = page.locator('.ed-tree .ed-vol > button').filter({ hasText: fault.own.title }).first();
    await ownRow.waitFor({ state: 'visible', timeout: 45_000 });
    await ownRow.scrollIntoViewIfNeeded();
    if (await page.getByText(ERROR_TITLE, { exact: true }).count()) fail('REAL_POSITIVE_LIST_SHOWED_ERROR');
    state.cases.push({ width, mode: 'real-positive', status: 'passed', documentId: config.documentId,
      actualScopedServerResponse: true, ownRowVisible: true, screenshot: await screenshot(page, width, 'real-positive') });
    checkpoint();
    for (const mode of ['unsuccessful', 'foreign', 'mixed']) await rejectList(page, fault, width, mode);
  } catch (error) {
    await screenshot(page, width, 'failure').catch(() => undefined);
    throw error;
  } finally {
    await context.close();
  }
}
async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  let browser;
  try {
    const config = configuration();
    state.baseUrl = config.base;
    state.syntheticEmail = config.email;
    state.programId = config.programId;
    state.documentId = config.documentId;
    checkpoint();
    browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    state.browserVersion = browser.version();
    for (const width of [1440, 390]) await runViewport(browser, config, width);
    state.status = 'passed';
    state.stage = 'complete';
  } catch (error) {
    state.status = 'failed';
    state.error = { name: error.name || 'Error', code: error.code || 'BROWSER_SCOPE_CHECK_FAILED', stage: state.stage };
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    state.completedAt = new Date().toISOString();
    checkpoint();
    console.info(JSON.stringify({ status: state.status, cases: state.cases.length, results: path.relative(__dirname, resultPath) }));
  }
}
void main();
