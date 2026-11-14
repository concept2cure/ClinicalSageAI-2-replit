// Real local task UI with fictional intercepted rows and writes; no assignment is forwarded.
const { chromium } = require(process.env.C2C_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const state = process.env.C2C_LOCAL_STATE || '/tmp/c2c-ana-live-state-20261113';
const auth = JSON.parse(fs.readFileSync(state + '/collab-browser-private.json', 'utf8'));
const actor = Number(auth.user.id), org = Number(auth.user.organizationId), other = actor + 1000;
const base = 'http://127.0.0.1:5000', version = 'a'.repeat(64);
const refusals = {
  408: { error: 'REQUEST_TIMEOUT', message: 'The assignment request timed out.' },
  403: { error: 'TASK_ASSIGNMENT_DENIED', message: 'Current project permissions do not allow this assignment.' },
};
const result = { scope: 'Actual local app, fictional account and intercepted task/roster/error responses; no assignment or other mutation forwarded.', cases: [], pageErrors: [] };
const task = { taskId: 'TASK-FICTIONAL-HANDOFF', title: 'Fictional endpoint review', project: '41', moduleType: 'Regulatory', taskType: 'review', status: 'review', priority: 'medium', assignee: String(actor), assignedBy: String(actor), progress: 0, impactScore: null, criticalPath: false, regulatoryImpact: false, approvalRequired: false, approvalStatus: 'not_required', approvalHistory: [], dependsOn: [], blocks: [], comments: 0, attachments: 0, source: 'unified', due: 'No due date', dueDateIso: null, phase: null, estimatedHours: null, activity: [] };
async function check(browser, status) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let writes = 0, automaticWrites = 0, reads = 0, page;
  await context.addInitScript(({ auth }) => {
    for (const storage of [localStorage, sessionStorage]) {
      storage.setItem('trialsage_access_token', auth.accessToken); storage.setItem('trialsage_refresh_token', auth.refreshToken || '');
      storage.setItem('trialsage_token_expiry', new Date(Date.now() + 3600000).toISOString()); storage.setItem('trialsage_user', JSON.stringify(auth.user));
      storage.setItem('currentOrganizationId', String(auth.user.organizationId)); storage.setItem('currentOrganization', String(auth.user.organizationId));
    }
  }, { auth });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()); let body, code = 200;
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== base) { await route.abort(); return; }
    if (url.pathname === '/api/task-management/board') body = { success: true, data: [task] };
    else if (url.pathname === '/api/projects') body = [{ id: 41, name: 'Fictional handoff project' }];
    else if (url.pathname === '/api/task-management/assignees') {
      const data = [{ id: String(actor), name: 'Fictional current holder', label: 'Fictional current holder' }, { id: String(other), name: 'Fictional colleague', label: 'Fictional colleague' }];
      if (url.searchParams.has('taskId')) {
        reads += 1;
        body = { success: true, data, total: data.length, meta: { taskId: task.taskId, projectId: 41, actorUserId: actor, organizationId: org, clientWorkspaceId: request.headers()['x-client-id'] ? Number(request.headers()['x-client-id']) : null, status: 'review', canAssign: true, assigneeId: actor, assignmentVersion: version } };
      } else body = { data: data.map(row => ({ ...row, id: Number(row.id) })) };
    } else if (url.pathname === '/api/tasks/tasks/' + task.taskId && request.method() === 'PATCH') {
      writes += 1; code = status; body = refusals[status];
    } else if (url.pathname === '/api/tasks/tasks/auto-assign' && request.method() === 'POST') {
      automaticWrites += 1; code = 409; body = { error: 'Automatic assignment blocked by this check.' };
    } else if (url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      code = 409; body = { error: 'Unrelated mutation blocked by this check.' };
    }
    if (body !== undefined) { await route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(body) }); return; }
    await route.continue();
  });
  try {
    page = await context.newPage(); page.on('pageerror', error => result.pageErrors.push({ name: error.name, message: error.message.slice(0, 150) }));
    await page.goto(base + '/concept2cure/tasks', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByText(task.title, { exact: true }).first().click({ timeout: 45000 });
    await page.getByRole('button', { name: 'Change assignee', exact: true }).click();
    await page.getByRole('combobox', { name: /^New assignee/ }).selectOption(String(other));
    await page.getByLabel('Reason for assignment', { exact: true }).fill('Fictional sponsor handoff');
    await page.getByRole('button', { name: 'Save assignment', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Task assignment', exact: true });
    const warning = await panel.getByRole('alert').innerText();
    const automatic = panel.getByRole('button', { name: 'Auto-assign task', exact: true });
    const held = await automatic.isDisabled();
    if (status === 408 && (!held || !/could not confirm|may have reached/i.test(warning))) throw Error('Timeout was not held as unconfirmed');
    if (status === 403 && (held || !/permissions/i.test(warning))) throw Error('Definite refusal lost its correction controls');
    await page.screenshot({ path: state + '/assignment-' + status + '.png', fullPage: true });
    let refreshed = false;
    if (status === 408) {
      await panel.getByRole('button', { name: 'Refresh assignment', exact: true }).click();
      await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'Auto-assign task' && !button.disabled));
      refreshed = !await automatic.isDisabled();
    }
    if (writes !== 1 || automaticWrites !== 0 || (status === 408 && (!refreshed || reads < 2))) throw Error('Recovery repeated a write or failed to reread');
    result.cases.push({ status, writes, automaticWrites, rosterReads: reads, automaticHeld: held, explicitRefreshRecovered: refreshed, warning });
  } catch (error) {
    result.fixtureDebug = { rosterReads: reads, panel: await page.locator('.tb-assignment, .c2c-error').allTextContents() };
    await page.screenshot({ path: state + '/assignment-fixture-failure.png', fullPage: true });
    throw error;
  } finally { await context.close(); }
}
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try { await check(browser, 408); await check(browser, 403); if (result.pageErrors.length) throw Error('Browser raised a page error'); result.status = 'passed'; }
  catch (error) { result.status = 'failed'; result.error = { name: error.name, message: error.message.slice(0, 250) }; process.exitCode = 1; }
  finally { await browser.close(); fs.writeFileSync(state + '/assignment-browser.json', JSON.stringify(result, null, 2) + '\n'); console.info(JSON.stringify(result)); }
})();
