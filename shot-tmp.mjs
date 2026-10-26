import { chromium } from 'playwright';
const OUT = process.argv[2];
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1600, height: 1100 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto('http://127.0.0.1:5000/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);
// Sign in through the real form.
const email = page.locator('input[type="email"], input[name="email"]').first();
if (await email.count()) {
  await email.fill('jm.smith@concept2cure.pro');
  await page.locator('input[type="password"]').first().fill('pass-word');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(6000);
}
console.info('after login:', page.url());
await page.screenshot({ path: `${OUT}/01-after-login.png`, fullPage: false });

// Open the project so CMC has a program in context, then the CMC work area.
await page.goto(`http://127.0.0.1:5000/concept2cure/project-home?program=585ae9b6-d8f7-474e-bd99-797f7551df4e`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/02-project-home.png`, fullPage: false });

for (const tab of ['overview', 'specs', 'stability', 'batch', 'build']) {
  await page.goto(`http://127.0.0.1:5000/concept2cure/cmc?program=585ae9b6-d8f7-474e-bd99-797f7551df4e`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  if (tab !== 'overview') {
    const label = { specs: 'Specifications', stability: 'Stability', batch: 'Batch records', build: 'Module 3 build' }[tab];
    const btn = page.locator(`button.cm-subtab:has-text("${label}")`).first();
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(4000); }
  }
  await page.screenshot({ path: `${OUT}/cmc-${tab}.png`, fullPage: true });
  const band = await page.locator('[data-testid="pj-stageband"]').first().innerText().catch(() => '(no band)');
  console.info(`--- ${tab} band:`, band.replace(/\n/g, ' | ').slice(0, 260));
}
console.info('page errors:', errs.length ? errs.slice(0, 6) : 'none');
await b.close();
