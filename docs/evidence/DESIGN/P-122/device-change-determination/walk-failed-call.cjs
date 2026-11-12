/* Device change determination: the failed call after the wording fix. Usage: node failed-call.cjs <outDir> <baseUrl> <pwFile> */
const { chromium } = require('playwright');
const fs = require('fs');
const [, , OUT, BASE, PW_FILE] = process.argv;
const NEUR = '747737b6-7d3a-431d-9082-3b8a102b771f';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/concept2cure/login`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type=email], input[name=email]', 'rr5-author@example.test');
  await page.fill('input[type=password]', fs.readFileSync(PW_FILE, 'utf8').trim());
  await page.click('button:has-text("Sign in")');
  await page.waitForTimeout(6000);
  await page.goto(`${BASE}/concept2cure/quality?program=${NEUR}`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.getByRole('tab', { name: 'Change control' }).click();
  const num = page.getByRole('button', { name: 'NEUR-CC-2026-002', exact: true });
  await num.waitFor({ timeout: 30000 });
  if ((await num.getAttribute('aria-expanded')) !== 'true') await num.click();
  await page.route('**/api/mdx/qms/changes/*/regulatory-impact', (route) => route.abort());
  await page.getByRole('button', { name: 'Assess the regulatory impact' }).first().click();
  const form = page.getByRole('dialog', { name: /Assess the regulatory impact of/ });
  await form.waitFor({ timeout: 10000 });
  const groups = form.getByRole('radiogroup');
  for (let i = 0; i < await groups.count(); i += 1) {
    const g = groups.nth(i);
    const name = await g.evaluate((el) => document.getElementById(el.getAttribute('aria-labelledby'))?.textContent ?? '');
    if (name.startsWith('Assess for')) continue;
    await g.getByRole('radio', { name: 'No' }).click();
  }
  const reason = form.getByRole('textbox');
  if (await reason.count()) await reason.first().fill('Second-source film data received; assessed again with the verification results.');
  await form.getByRole('button', { name: /Run the assessment/ }).click();
  await form.getByRole('status').waitFor({ timeout: 15000 });
  console.info('status:', (await form.getByRole('status').textContent()));
  await form.getByRole('status').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/after-1440-light-3-failed-call-says-so.png` });
  await browser.close();
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 800)); process.exit(1); });
