// Open a program's project home from the Projects list; record readiness, tool tiles, CRL / lifecycle tiles.
import { open, snap, sleep, BASE } from './h.mjs';
const TAG = process.env.TAG || 'before';
const CODE = process.env.CODE || 'BX-256';
const { page, log, done } = await open();
await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pj-card', { timeout: 90000 });
await sleep(800);
await page.locator('.pj-card', { hasText: CODE + ' ·' }).first().click();
await page.waitForSelector('.pj-title', { timeout: 60000 });
await sleep(4000);
await snap(page, `${TAG}-home-${CODE}`);
const aside = await page.$$eval('.pj-side .pj-card', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 160)));
console.log('ASIDE CARDS:', JSON.stringify(aside));
const tools = await page.$$eval('.pj-main .pj-tool .pj-tool-t', (els) => els.map((e) => e.innerText.trim()));
console.log('TOOLS:', JSON.stringify(tools));
for (const t of ['FDA CRL library', 'Lifecycle management']) {
  console.log(`TILE "${t}" offered:`, tools.includes(t));
}
if (process.env.CLICK && tools.includes(process.env.CLICK)) {
  await page.locator('.pj-main .pj-tool', { hasText: process.env.CLICK }).first().click();
  await sleep(5000);
  await snap(page, `${TAG}-tile-${process.env.CLICK}`);
  console.log('AFTER CLICK:', (await page.evaluate(() => document.querySelector('main, .page-inner, body')?.innerText ?? '')).replace(/\s+/g, ' ').slice(0, 500));
}
console.log('LOG', JSON.stringify(log));
await done();
