// Browser walk for the Codespace evidence: sign in with "Demo access", Home, Projects, a project, AnA, the CSR.
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2];
const BASE = 'http://127.0.0.1:5000';
const log = [];
const note = (s) => { log.push(s); console.log(s); };
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  const apiErrors = [];
  page.on('response', (r) => { if (r.status() >= 500 && r.url().includes('/api/')) apiErrors.push(`${r.status()} ${r.url().replace(BASE, '')}`); });
  const shot = async (name) => { await page.waitForTimeout(1500); await page.screenshot({ path: path.join(OUT, name) }); note(`shot ${name} @ ${page.url().replace(BASE, '')}`); };
  try {
    await page.goto(`${BASE}/concept2cure/login`, { waitUntil: 'networkidle' });
    await shot('01-sign-in.png');
    await page.getByRole('button', { name: 'Demo access' }).click();
    await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 60000 });
    await page.waitForLoadState('networkidle');
    await shot('02-home.png');
    await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'networkidle' });
    await shot('03-projects.png');
    const titles = await page.locator('main').innerText();
    note('projects page mentions CDISCPILOT01: ' + titles.includes('CDISCPILOT01'));
    note('projects page mentions [Demo: ' + /\[Demo/.test(titles));
    await page.getByText('Xanomeline TTS Phase 2 (CDISCPILOT01)').first().click();
    await page.waitForURL(/project-home/, { timeout: 60000 });
    await page.waitForLoadState('networkidle');
    const projectUrl = page.url();
    await shot('04-project.png');
    // AnA: the project's conversation composer.
    const composer = page.getByRole('textbox').first();
    await composer.click();
    await composer.fill('What does this project hold so far?');
    await shot('05-ana-composer.png');
    await composer.press('Enter');
    await page.waitForTimeout(8000);
    await shot('06-ana-answer.png');
    // The CSR, in the one editor.
    await page.goto(projectUrl, { waitUntil: 'networkidle' });
    await page.getByRole('navigation', { name: 'Project lifecycle' }).getByRole('button', { name: /^Author/ }).click();
    await page.getByRole('button', { name: 'Open CDISCPILOT01 Clinical Study Report' }).click();
    await page.waitForURL(/document-authoring/, { timeout: 60000 });
    const panel = page.locator('details[aria-label="Build from the study’s data"]');
    await panel.waitFor({ timeout: 60000 });
    if (!(await panel.evaluate((d) => d.open))) await panel.locator('summary').click();
    await panel.scrollIntoViewIfNeeded();
    await shot('07-csr-build-from-study-data.png');
    const build = panel.getByRole('button', { name: /Build CSR draft/ });
    note('Build CSR draft button visible: ' + (await build.isVisible().catch(() => false)));
  } catch (e) {
    note('FAILED: ' + e.message.split('\n')[0]);
    await page.screenshot({ path: path.join(OUT, 'fail.png') }).catch(() => {});
    process.exitCode = 1;
  } finally {
    note('5xx API responses: ' + JSON.stringify(apiErrors));
    require('fs').writeFileSync(path.join(OUT, 'walk-log.txt'), log.join('\n') + '\n');
    await browser.close();
  }
})();
