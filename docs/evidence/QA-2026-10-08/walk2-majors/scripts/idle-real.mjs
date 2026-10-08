// Real time: what does the page do over 16 idle minutes? Every /api request timed; the dialog polled.
import { open, goto, settle, w2, sleep, snap, BASE } from '../walk-2/h.mjs';
const { page, ctx, done } = await open('idle-real', w2('invitee2'));
const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 60000).toFixed(2) + 'm';
console.log('pages in context at start', ctx.pages().length);
page.on('request', (r) => { if (r.url().includes('/api/')) console.log(ts(), 'REQ', r.method(), r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 100)); });
page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) console.log(ts(), 'RES', r.status(), r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 100)); });
page.on('pageerror', (e) => console.log(ts(), 'pageerror', e.message));
page.on('console', (m) => { if (/session|idle|logout|refresh/i.test(m.text())) console.log(ts(), 'console', m.text().slice(0, 200)); });
await goto(page, '/concept2cure/projects');
await settle(page, 2000);
console.log(ts(), 'visibility', await page.evaluate(() => document.visibilityState), 'hasFocus', await page.evaluate(() => document.hasFocus()));
for (let i = 0; i < 34; i++) {
  await sleep(30_000);
  const d = await page.locator('[role=alertdialog]').count().catch(() => -1);
  console.log(ts(), 'poll url', page.url().replace(BASE, ''), 'dialog', d);
  if (/login/.test(page.url())) break;
}
await snap(page, 'idle-real-end');
await done();
