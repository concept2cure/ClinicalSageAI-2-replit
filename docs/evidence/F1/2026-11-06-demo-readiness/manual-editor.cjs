/** Rehearse a deliberate human save in the existing prepared CSR; never request model output. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const base = 'http://127.0.0.1:5100';
const state = JSON.parse(fs.readFileSync('/workspace/scratch/demo-cdisc-pilot/csr-demo-state.json', 'utf8'));
const note = 'Demonstration note: this working section is being reviewed against the recorded study metadata. No study results are asserted here.';
const result = { status: 'running', startedAt: new Date().toISOString(), programId: state.programId,
  documentId: state.documentId, cases: [], blockedModelOrAgencyRequests: [] };
async function author(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('**/*', route => {
    const request = route.request(); const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== base) return route.abort();
    if (request.method() !== 'GET' && /\/ai\/draft|\/api\/claude|\/api\/ana(?:\/|-)|\/api\/csr\/jobs|\/(?:dispatch|transmit)(?:\/|$)/.test(url.pathname)) {
      result.blockedModelOrAgencyRequests.push({ method: request.method(), path: url.pathname });
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto(base + '/concept2cure/login');
  await page.getByRole('button', { name: /demo access/i }).click();
  await page.getByRole('button', { name: /^Projects$/ }).waitFor({ timeout: 60_000 });
  await page.goto(`${base}/concept2cure/project-home?program=${state.programId}`);
  await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Author/ }).click();
  await page.getByRole('button', { name: 'Open CDISCPILOT01 Clinical Study Report' }).click();
  await page.waitForURL(/document-authoring/);
  const section = page.locator('.ed-tree-row').filter({ hasText: /Study objectives/i }).first();
  await section.click({ timeout: 60_000 });
  const editor = page.getByRole('textbox', { name: /Section .*Study objectives/i });
  await editor.waitFor({ timeout: 30_000 });
  return { context, page, editor };
}
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  try {
    const first = await author(browser);
    await first.editor.click();
    await first.editor.press('Control+End'); await first.editor.press('Enter');
    await first.page.keyboard.insertText(note);
    await first.page.getByRole('textbox', { name: 'Reason for change', exact: true }).fill('Prepared demonstration section from recorded study metadata');
    const saved = first.page.waitForResponse(response => response.request().method() === 'PATCH'
      && /\/api\/authoring\/sections\/[0-9a-f-]+$/.test(new URL(response.url()).pathname));
    await first.page.getByTestId('save-section').click();
    const response = await saved; assert.equal(response.status(), 200);
    await first.page.getByTestId('save-section').filter({ hasText: 'Saved' }).waitFor({ timeout: 30_000 });
    result.cases.push({ name: 'Human section edit saves with deliberate change reason', status: 'passed', httpStatus: 200 });
    await first.context.close();
    // A separate browser storage partition cannot recover the first editor's local draft cache.
    const fresh = await author(browser);
    assert.ok((await fresh.editor.innerText()).includes(note));
    result.cases.push({ name: 'Saved text reopens from the server in a fresh browser context', status: 'passed',
      noteSha256: crypto.createHash('sha256').update(note).digest('hex') });
    await fresh.page.getByRole('button', { name: 'AnA', exact: true }).click();
    await fresh.page.getByRole('menuitem', { name: /^Draft from sources/ }).click();
    await fresh.page.getByTestId('ai-draft-panel').waitFor({ timeout: 30_000 });
    result.cases.push({ name: 'Existing AnA drafting controls open inside the same section editor', status: 'passed', generationRequested: false });
    assert.equal(result.blockedModelOrAgencyRequests.length, 0);
    await fresh.page.screenshot({ path: path.join(__dirname, 'manual-editor-controls.png'),
      mask: [fresh.page.locator('[role="textbox"]'), fresh.page.locator('table'), fresh.page.locator('pre')] });
    result.status = 'passed';
  } catch (error) {
    result.status = 'failed'; result.error = error.message.split('\n')[0]; process.exitCode = 1;
  } finally {
    result.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(__dirname, 'manual-editor-result.json'), JSON.stringify(result, null, 2) + '\n');
    await browser.close();
  }
})();
