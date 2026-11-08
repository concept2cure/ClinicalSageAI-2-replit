/** Actual Demo access sign-in against the npm-dev Codespaces replica. No model calls. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:5100';
const result = { status: 'running', startedAt: new Date().toISOString(), cases: [] };
const output = path.join(__dirname, 'startup-browser.json');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route('**/*', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== base) return route.abort();
      if (request.method() !== 'GET' && url.pathname !== '/api/auth/dev-login') return route.abort();
      return route.continue();
    });
    await page.goto(base + '/concept2cure/login');
    await page.getByRole('button', { name: /demo access/i }).click();
    await page.getByRole('button', { name: /^Projects$/ }).waitFor({ timeout: 60_000 });
    const user = await page.evaluate(() => JSON.parse(localStorage.getItem('trialsage_user') || 'null'));
    assert.equal(user?.email, 'ana.author@concept2cure.pro');
    result.cases.push({ name: 'Actual Demo access signs in the configured author', status: 'passed' });
    await page.getByRole('button', { name: /^Projects$/ }).click();
    await page.getByRole('button', { name: /New project/ }).first().waitFor({ timeout: 30_000 });
    assert.equal(await page.getByText(/Something went wrong|An unexpected error occurred/i).count(), 0);
    result.cases.push({ name: 'Project-first workspace opens after sign-in', status: 'passed' });
    await page.screenshot({ path: path.join(__dirname, 'startup-projects.png') });
    result.status = 'passed';
  } catch (error) {
    result.status = 'failed'; result.error = error.message.split('\n')[0];
    process.exitCode = 1;
  } finally {
    result.finishedAt = new Date().toISOString();
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
    await browser.close();
  }
})();
