// Controlled response checks against the real local UI; no message/task mutation is forwarded.
const { chromium } = require(process.env.C2C_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const state = process.env.C2C_LOCAL_STATE || '/tmp/c2c-ana-live-state-20261113';
const auth = JSON.parse(fs.readFileSync(state + '/collab-browser-private.json', 'utf8'));
const mode = process.env.C2C_BROWSER_EXPECT || 'green';
const base = 'http://127.0.0.1:5000';
const result = { mode, scope: 'Actual local app and fictional account; intercepted message/task receipts; no real outbound message or task mutation.', cases: [], pageErrors: [] };
async function scenario(browser, kind) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let messages = 0, tasks = 0;
  await context.addInitScript(({ auth }) => {
    for (const storage of [localStorage, sessionStorage]) {
      storage.setItem('trialsage_access_token', auth.accessToken);
      storage.setItem('trialsage_refresh_token', auth.refreshToken || '');
      storage.setItem('trialsage_token_expiry', new Date(Date.now() + 3600000).toISOString());
      storage.setItem('trialsage_user', JSON.stringify(auth.user));
      storage.setItem('currentOrganizationId', String(auth.user.organizationId));
      storage.setItem('currentOrganization', String(auth.user.organizationId));
    }
  }, { auth });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== base) { await route.abort(); return; }
    let data;
    if (url.pathname === '/api/task-management/assignees') data = { data: [{ id: 101, name: 'Fictional teammate' }] };
    else if (url.pathname === '/api/projects') data = [{ id: 41, name: 'Fictional task project' }];
    else if (url.pathname === '/api/tasks/messages' && request.method() === 'POST') {
      messages += 1;
      data = kind === 'message' ? { success: true, data: {} } : { success: true, data: { id: 303 } };
    } else if (url.pathname === '/api/tasks/tasks' && request.method() === 'POST') {
      tasks += 1;
      data = { success: true, data: { taskId: kind === 'task' ? { malformed: true } : 'synthetic-browser-task', assigneeId: 101 } };
    } else if (url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Unrelated mutation blocked by browser check.' }) }); return;
    }
    if (data !== undefined) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) }); return; }
    await route.continue();
  });
  try {
    const page = await context.newPage();
    page.on('pageerror', error => result.pageErrors.push({ name: error.name, message: error.message.slice(0, 120) }));
    await page.goto(base + '/concept2cure/home', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByText('Ana Author', { exact: true }).first().waitFor({ state: 'visible', timeout: 45000 });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('c2c:open-collab', { detail: { mode: 'collab' } })));
    await page.getByTitle('Fictional teammate', { exact: true }).click();
    await page.getByLabel('Message', { exact: true }).fill('Please review the fictional endpoint summary.');
    await page.getByRole('button', { name: /Also create a task/ }).click();
    await page.getByTestId('collab-send').click();
    let warning = '', retryBlocked = false;
    if (mode === 'red') {
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => window.C2C?.list().length === 1);
      if (messages !== 1 || tasks !== 1) throw Error('Baseline false confirmation not reproduced');
    } else {
      warning = await page.getByRole('alert').innerText();
      retryBlocked = await page.getByTestId('collab-send').isDisabled();
      if (!/unknown/i.test(warning) || !retryBlocked) throw Error('Unconfirmed receipt was not held as unknown');
      if (kind === 'message' && tasks !== 0) throw Error('Unconfirmed message launched its optional task');
      if (kind === 'task' && (!/message was sent/i.test(warning) || tasks !== 1)) throw Error('Confirmed message status lost');
      await page.getByTestId('collab-send').evaluate(el => el.click());
      if (messages !== 1 || tasks !== (kind === 'task' ? 1 : 0)) throw Error('Unconfirmed operation repeated');
      if (await page.evaluate(() => window.C2C.list().length) !== 0) throw Error('Malformed receipt fabricated a task row');
      await page.locator('.cl-modal').evaluate(async el => { await Promise.all(el.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
    }
    await page.screenshot({ path: state + '/receipt-' + kind + '-' + mode + '.png', fullPage: true });
    result.cases.push({ scenario: kind + '-receipt', messages, tasks, retryBlocked, taskRows: await page.evaluate(() => window.C2C.list().length), warning });
  } finally { await context.close(); }
}
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try { await scenario(browser, 'message'); await scenario(browser, 'task'); result.status = 'passed'; }
  catch (error) { result.status = 'failed'; result.error = { name: error.name, message: error.message.slice(0, 220) }; process.exitCode = 1; }
  finally { await browser.close(); fs.writeFileSync(state + '/receipt-browser-' + mode + '.json', JSON.stringify(result, null, 2) + '\n'); console.info(JSON.stringify(result)); }
})();
