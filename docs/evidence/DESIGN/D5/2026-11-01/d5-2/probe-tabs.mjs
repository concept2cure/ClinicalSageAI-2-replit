import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = process.argv[2];
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:5000/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);
await page.locator('input[type="email"], input[name="email"]').first().fill('jm.smith@concept2cure.pro');
await page.locator('input[type="password"]').first().fill('Dev-Shots-2026!');
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(6000);
const URL = 'http://127.0.0.1:5000/concept2cure/cmc?program=585ae9b6-d8f7-474e-bd99-797f7551df4e';
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
const probe = async (label) => {
  const r = await page.evaluate(() => {
    const root = document.querySelector('[data-work-area]');
    const cs = (el) => globalThis.getComputedStyle(el);
    const accent = cs(document.querySelector('.c2c-v2')).getPropertyValue('--accent-strong').trim();
    const d = document.createElement('div'); d.style.color = accent; document.body.appendChild(d);
    const want = globalThis.getComputedStyle(d).color; d.remove();
    return {
      orange: [...root.querySelectorAll('button, a, .btn')].filter((e) => cs(e).backgroundColor === want).map((e) => e.textContent.trim().slice(0, 32)),
      upper: [...root.querySelectorAll('*')].filter((e) => cs(e).textTransform === 'uppercase' && (e.textContent || '').trim()).map((e) => e.textContent.trim().slice(0, 36)),
      h2s: [...root.querySelectorAll('h2')].slice(0, 6).map((e) => e.textContent.trim().slice(0, 40)),
      secSubs: [...root.querySelectorAll('p.sec-sub')].map((e) => e.textContent.trim().slice(0, 110)),
      height: root.scrollHeight,
    };
  });
  console.info(`\n--- ${label} ---\n` + JSON.stringify(r, null, 1));
};
await page.getByRole('tab', { name: 'Module 3 build', exact: true }).click();
await page.waitForTimeout(4000);
await probe('Module 3 build');
await page.screenshot({ path: `${OUT}/cmc-build-1440-light.png` });
await page.getByRole('tab', { name: 'Quality by design', exact: true }).click();
await page.waitForTimeout(4000);
await probe('Quality by design');
await page.screenshot({ path: `${OUT}/cmc-qbd-1440-light.png` });
await page.getByRole('button', { name: 'Study records', exact: true }).click();
await page.waitForTimeout(5000);
await probe('Substance & product');
await page.screenshot({ path: `${OUT}/cmc-records-1440-light.png` });
await b.close();
