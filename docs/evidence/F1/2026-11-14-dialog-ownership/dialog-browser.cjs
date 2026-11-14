// Controlled keyboard/unmount checks in the real UI; no business mutation is forwarded.
const { chromium } = require(process.env.C2C_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const state = process.env.C2C_LOCAL_STATE || '/tmp/c2c-ana-live-state-20261113';
const auth = JSON.parse(fs.readFileSync(state + '/collab-browser-private.json', 'utf8'));
const base = 'http://127.0.0.1:5000', mode = process.env.C2C_BROWSER_EXPECT || 'green';
const result = { mode, scope: 'Actual local app, fictional account, controlled DOM keyboard and lower-dialog dismissal; intercepted rows; no business mutations or provider calls.', cases: [], pageErrors: [] };
const task = { taskId: 'TASK-FICTIONAL-DIALOG', title: 'Fictional dialog review', project: '41', moduleType: 'Regulatory', taskType: 'review', status: 'review', priority: 'medium', assignee: String(auth.user.id), assignedBy: String(auth.user.id), progress: 0, impactScore: null, criticalPath: false, regulatoryImpact: false, approvalRequired: false, approvalStatus: 'not_required', approvalHistory: [], dependsOn: [], blocks: [], comments: 0, attachments: 0, source: 'unified', due: 'No due date', dueDateIso: null, phase: null, estimatedHours: null, activity: [] };
async function start(browser, path = 'home') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ auth }) => {
    for (const storage of [localStorage, sessionStorage]) {
      storage.setItem('trialsage_access_token', auth.accessToken); storage.setItem('trialsage_refresh_token', auth.refreshToken || '');
      storage.setItem('trialsage_token_expiry', new Date(Date.now() + 3600000).toISOString()); storage.setItem('trialsage_user', JSON.stringify(auth.user));
      storage.setItem('currentOrganizationId', String(auth.user.organizationId)); storage.setItem('currentOrganization', String(auth.user.organizationId));
    }
  }, { auth });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()); let body, status = 200;
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== base) { await route.abort(); return; }
    if (url.pathname === '/api/task-management/board') body = { success: true, data: [task] };
    else if (url.pathname === '/api/projects') body = [{ id: 41, name: 'Fictional dialog project' }];
    else if (url.pathname === '/api/task-management/assignees') body = { data: [{ id: Number(auth.user.id), name: 'Fictional teammate' }] };
    else if (url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      status = 409; body = { error: 'Business mutation blocked by dialog check.' };
    }
    if (body !== undefined) { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); return; }
    await route.continue();
  });
  const page = await context.newPage(); page.on('pageerror', error => result.pageErrors.push({ name: error.name, message: error.message.slice(0, 140) }));
  await page.goto(base + '/concept2cure/' + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByText('Ana Author', { exact: true }).first().waitFor({ state: 'visible', timeout: 45000 });
  return { context, page };
}
async function compose(page) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('c2c:open-collab', { detail: { mode: 'collab' } })));
  const field = page.getByLabel('Message', { exact: true }); await field.fill('Keep this fictional unsent draft.'); return field;
}
async function settle(page) {
  await page.locator('.cl-modal').evaluate(async el => { await Promise.all(el.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
}
async function keyboardCase(browser, composing) {
  const { context, page } = await start(browser);
  try {
    const field = await compose(page);
    const event = await field.evaluate((el, composing) => {
      if (!composing) el.addEventListener('keydown', event => event.preventDefault(), { once: true });
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, isComposing: composing });
      el.dispatchEvent(event); return { isComposing: event.isComposing, defaultPrevented: event.defaultPrevented };
    }, composing);
    const retained = await page.getByRole('dialog').count() === 1;
    if (mode === 'red' ? retained : !retained) throw Error('Unexpected keyboard ownership result');
    if (retained) {
      if (await field.inputValue() !== 'Keep this fictional unsent draft.') throw Error('Draft changed');
      await settle(page);
    }
    await page.screenshot({ path: state + '/dialog-' + (composing ? 'composing' : 'handled') + '-' + mode + '.png', fullPage: true });
    if (mode === 'green') { await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' }); }
    result.cases.push({ scenario: composing ? 'composing-escape' : 'handled-escape', ...event, retainedDraft: retained, ordinaryEscapeCloses: mode === 'green' });
  } finally { await context.close(); }
}
async function focusCase(browser) {
  const { context, page } = await start(browser, 'tasks');
  try {
    const card = page.getByRole('button', { name: 'Open ' + task.title, exact: true }); await card.focus(); await card.click();
    await page.locator('.tb-detail').waitFor({ state: 'visible' });
    const field = await compose(page);
    await page.locator('.tb-detail .tb-detail-x').evaluate(el => el.click());
    await page.locator('.tb-detail').waitFor({ state: 'detached' });
    const insideTop = await page.locator('.cl-modal').evaluate(el => el.contains(document.activeElement));
    if (mode === 'red' ? insideTop : !insideTop) throw Error('Unexpected focus restoration result');
    if (await field.inputValue() !== 'Keep this fictional unsent draft.') throw Error('Draft changed');
    await settle(page); await page.screenshot({ path: state + '/dialog-focus-' + mode + '.png', fullPage: true });
    result.cases.push({ scenario: 'lower-dialog-closes', survivingTopHasFocus: insideTop, retainedDraft: true });
  } finally { await context.close(); }
}
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try { await keyboardCase(browser, true); await keyboardCase(browser, false); await focusCase(browser); if (result.pageErrors.length) throw Error('Browser raised a page error'); result.status = 'passed'; }
  catch (error) { result.status = 'failed'; result.error = { name: error.name, message: error.message.slice(0, 240) }; process.exitCode = 1; }
  finally { await browser.close(); fs.writeFileSync(state + '/dialog-browser-' + mode + '.json', JSON.stringify(result, null, 2) + '\n'); console.info(JSON.stringify(result)); }
})();
