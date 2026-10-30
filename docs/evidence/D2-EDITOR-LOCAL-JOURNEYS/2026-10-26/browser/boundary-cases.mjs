import assert from 'node:assert/strict';
import { bearer, document, DOC, OTHER_PROGRAM, PROGRAM } from './fixtures.mjs';
import { capture, settle } from './measure.mjs';
const urlRoot = 'http://127.0.0.1:5216/docs/evidence/D2-EDITOR-LOCAL-JOURNEYS/2026-10-26/browser/';
function gate() { let release; return { promise: new Promise(resolve => { release = resolve; }), release: () => release() }; }
async function held(promise) {
  let timer;
  try { await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Expected scoped read did not enter the synthetic hold')), 7000); })]); }
  finally { clearTimeout(timer); }
}
function install(page, mode, requests, unexpected) {
  const enter = gate(), response = gate(); let reads = 0;
  return { enter, response, ready: page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), headers = request.headers();
    requests.push({ method: request.method(), path: url.pathname, programId: url.searchParams.get('programId'),
      initialBearer: headers.authorization === `Bearer ${bearer()}`, refreshedBearer: headers.authorization === `Bearer ${bearer('refreshed')}`,
      organization: headers['x-organization-id'] });
    if (request.method() === 'POST' && url.pathname === '/api/v1/auth/refresh' && mode === 'refresh')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accessToken: bearer('refreshed'), refreshToken: 'synthetic-rotated', expiresIn: 3600 }) });
    if (request.method() === 'GET' && url.pathname === '/api/authoring/docs' && url.searchParams.get('programId') === PROGRAM) {
      reads++;
      if ((mode === 'refresh' && reads === 1) || (mode.startsWith('late-') && reads === 2)) { enter.release(); await response.promise; }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, documents: [document] }) });
    }
    unexpected.push({ method: request.method(), path: url.pathname });
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Unexpected synthetic endpoint' }) });
  }) };
}
async function runMode(page, mode, hold, { out, key, stages }) {
  await page.goto(`${urlRoot}?mode=${mode}&theme=${key.includes('dark') ? 'dark' : 'light'}`);
  if (mode === 'refresh') {
    await held(hold.enter.promise);
    assert.equal(await page.evaluate(() => window.chooserRefresh()), true, 'Canonical auth refresh must succeed in this synthetic lane');
    hold.response.release();
  }
  const select = page.getByRole('combobox', { name: 'Working document', exact: true });
  await select.selectOption(DOC);
  const dialog = page.getByTestId('source-assembly-dialog');
  await settle(dialog);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), true);
  stages.push(await capture(page, out, key + '-chooser', mode === 'refresh'));
  if (mode === 'escape') {
    await page.keyboard.press('Escape');
    await page.getByText('Chooser closed.', { exact: true }).waitFor();
    return;
  }
  await dialog.getByRole('button', { name: 'Open in editor', exact: true }).click();
  if (mode.startsWith('late-')) {
    await held(hold.enter.promise);
    if (mode === 'late-project') await page.evaluate(({ other, original }) => { window.chooserVisit(other); window.chooserVisit(original); }, { other: OTHER_PROGRAM, original: PROGRAM });
    if (mode === 'late-session') await page.evaluate(() => window.chooserReplace());
    if (mode === 'late-raw') await page.evaluate(() => window.chooserRawSwap());
    hold.response.release();
    await page.getByRole('alert').filter({ hasText: /changed|earlier|reopen/i }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: 'Working document', exact: true }).count(), 0, 'Retired private document choices must be masked');
    assert.equal((await page.locator('body').textContent()).includes(document.title), false, 'Retired document title must not remain visible');
    stages.push(await capture(page, out, key + '-retired', true));
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  await page.getByText('Chooser closed.', { exact: true }).waitFor();
}
export async function runBoundary(browser, viewport, mode, out) {
  const [name, width, height, theme] = viewport;
  const key = `${name}-${mode}`, stages = [], requests = [], unexpected = [], errors = [];
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 500, hasTouch: width < 500 });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const hold = install(page, mode, requests, unexpected); await hold.ready;
  let status = 'pass', error, delivered;
  try {
    await runMode(page, mode, hold, { out, key, stages });
    delivered = await page.evaluate(() => ({ navigation: window.chooserNavigation, target: window.chooserPeek() }));
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    const reads = requests.filter(row => row.method === 'GET');
    assert.equal(reads.length, mode === 'escape' ? 1 : 2);
    assert.ok(reads.every(row => row.programId === PROGRAM && row.organization === '26'));
    if (mode === 'refresh') {
      assert.equal(reads[0].initialBearer, true); assert.equal(reads[1].refreshedBearer, true);
      assert.deepEqual(delivered.navigation, ['document-authoring']); assert.equal(delivered.target.docId, DOC);
    } else { assert.deepEqual(delivered.navigation, []); assert.equal(delivered.target, null); }
    assert.equal(requests.filter(row => row.method !== 'GET' && row.path !== '/api/v1/auth/refresh').length, 0, 'The chooser performs no authoring write');
  } catch (failure) { status = 'fail'; error = failure.message; await page.screenshot({ path: `${out}/${key}-failure.png` }).catch(() => {}); }
  finally { hold.response.release(); await context.close(); }
  return { name, theme, mode, status, error, delivered, requests, unexpected, errors, stages };
}
