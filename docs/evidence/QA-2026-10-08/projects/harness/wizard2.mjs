// After: Configure with a blank name (Continue disabled), then a name and a blank product > Review. Creates only if CREATE=1.
import { open, snap, sleep, BASE } from './h.mjs';
const TAG = process.env.TAG || 'after';
const { page, log, done } = await open();
await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pj-card', { timeout: 90000 });
await page.locator('button', { hasText: 'New project' }).first().click(); await sleep(3000);
await page.locator('button').filter({ hasText: 'Investigational New Drug Application' }).nth(0).click({ timeout: 15000 });
await sleep(500);
await page.locator('button', { hasText: /^Continue$/ }).first().click(); await sleep(1200);
const cont = page.locator('button', { hasText: /^Continue$/ }).first();
console.log('blank name -> Continue enabled:', await cont.isEnabled());
await page.getByPlaceholder('e.g. BX-204 — Investigational New Drug Application').fill('   ');
console.log('spaces name -> Continue enabled:', await cont.isEnabled());
await page.getByPlaceholder('e.g. BX-204 — Investigational New Drug Application').fill(process.env.NAME || 'HLV-334 — Investigational New Drug Application (QA-FIX)');
await page.getByPlaceholder('e.g. BX-204', { exact: true }).fill(process.env.PRODUCT ?? '');
console.log('named -> Continue enabled:', await cont.isEnabled());
await snap(page, `${TAG}-wizard-configure-named`);
await cont.click(); await sleep(1500);
const rows = await page.$$eval('.npw-review-row', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
console.log('REVIEW ROWS:', JSON.stringify(rows));
await snap(page, `${TAG}-wizard-review`);
if (process.env.CREATE === '1') {
  const posted = page.waitForResponse((r) => r.url().endsWith('/api/c2c/projects') && r.request().method() === 'POST', { timeout: 60000 });
  await page.locator('button', { hasText: 'Create project' }).last().click();
  const res = await posted;
  const body = await res.json().catch(() => ({}));
  console.log('CREATE status', res.status(), 'code', body?.data?.code, 'title', body?.data?.title, 'meta', JSON.stringify(body?.meta ?? {}));
  console.log('REQUEST BODY', res.request().postData());
  await sleep(4000);
  await snap(page, `${TAG}-wizard-created`);
}
console.log('LOG', JSON.stringify(log));
await done();
