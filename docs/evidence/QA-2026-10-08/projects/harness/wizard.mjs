// Walk New project > IND > leave name and product blank > Review. Never clicks Create.
import { open, snap, sleep, BASE } from './h.mjs';
const TAG = process.env.TAG || 'before';
const { page, log, done } = await open();
await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pj-card', { timeout: 90000 });
await page.locator('button', { hasText: 'New project' }).first().click(); await sleep(3000);
await page.locator('button').filter({ hasText: 'Investigational New Drug Application' }).nth(0).click({ timeout: 15000 });
await sleep(500);
await page.locator('button', { hasText: /^Continue$/ }).first().click(); await sleep(1200);
await snap(page, `${TAG}-wizard-step2-blank`);
const cont = page.locator('button', { hasText: /^Continue$/ }).first();
console.log('STEP2 Continue enabled with blank name:', await cont.isEnabled());
const step2 = await page.evaluate(() => document.querySelector('.npw-form')?.innerText.replace(/\s+/g, ' ').slice(0, 600));
console.log('STEP2 TEXT:', step2);
if (await cont.isEnabled()) {
  await cont.click(); await sleep(1500);
  await snap(page, `${TAG}-wizard-review-blank`);
  const rows = await page.$$eval('.npw-review-row', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  console.log('REVIEW ROWS:', JSON.stringify(rows));
  const create = page.locator('button', { hasText: 'Create project' }).last();
  console.log('Create enabled:', await create.isEnabled());
}
// Now type a name with a code token and a single-word product, go to Review.
await page.locator('button', { hasText: /^Back$/ }).first().click().catch(() => {}); await sleep(800);
await page.getByPlaceholder('e.g. BX-204 — Investigational New Drug Application').fill('HLV-334 — Investigational New Drug Application (QA-FIX)');
await page.getByPlaceholder('e.g. BX-204', { exact: true }).fill('');
await sleep(400);
await page.locator('button', { hasText: /^Continue$/ }).first().click(); await sleep(1200);
const rows2 = await page.$$eval('.npw-review-row', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
console.log('REVIEW ROWS (named, blank product):', JSON.stringify(rows2));
await snap(page, `${TAG}-wizard-review-named`);
console.log('LOG', JSON.stringify(log));
await done();
