// Read the Submission Center's Submissions table rows (Program column first).
import { open, snap, sleep, BASE } from './h.mjs';
const TAG = process.env.TAG || 'before';
const { page, log, done } = await open();
await page.goto(`${BASE}/concept2cure/submission-center`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('tr.sc-subrow', { timeout: 90000 });
await sleep(2500);
await snap(page, `${TAG}-submission-center`);
const rows = await page.$$eval('tr.sc-subrow', (els) => els.map((e) => [...e.querySelectorAll('td')].map((td) => td.innerText.replace(/\s+/g, ' ').trim()).join(' | ')));
for (const r of rows) console.log('ROW:', r);
console.log('LOG', JSON.stringify(log.filter((l) => l.status !== 404)));
await done();
