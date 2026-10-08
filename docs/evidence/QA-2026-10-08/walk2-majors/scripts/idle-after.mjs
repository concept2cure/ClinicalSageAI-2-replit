// After the fix, real time: fresh sign-in, idle, one page reload at minute 9 (as the walk had at 13:15:48), then wait.
// Expect the warning at 14 minutes after sign-in and the sign-out at 15, not 15 after the reload.
import { open, goto, settle, w2, sleep, snap, BASE } from '../walk-2/h.mjs';
const { page, done } = await open('idle-after', w2('invitee2'), { fresh: true });
await goto(page, '/concept2cure/projects');
await settle(page, 1500);
const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 60000).toFixed(2) + 'm';
page.on('request', (r) => { if (/\/api\/v1\/auth\/(logout|session)/.test(r.url())) console.info(ts(), 'REQ', r.method(), r.url().replace(/^https?:\/\/[^/]+/, '')); });
let reloaded = false;
for (let i = 0; i < 34; i++) {
  await sleep(30_000);
  if (!reloaded && Date.now() - t0 >= 9 * 60_000) { reloaded = true; console.info(ts(), 'page.reload() — nobody touches the page'); await page.reload({ waitUntil: 'domcontentloaded' }); }
  const d = await page.locator('[role=alertdialog]').count().catch(() => -1);
  console.info(ts(), 'poll url', page.url().replace(BASE, ''), 'dialog', d);
  if (d === 1 && !(await page.evaluate(() => window.__snapped).catch(() => true))) { await page.evaluate(() => { window.__snapped = true; }); await snap(page, 'idle-after-warning'); }
  if (/login/.test(page.url())) { await sleep(1500); await snap(page, 'idle-after-signed-out'); break; }
}
console.info(ts(), 'sign-in page says:', (await page.locator('body').innerText().catch(() => '')).split('\n').filter((l) => /inactiv|signed out|session/i.test(l)).slice(0, 3).join(' | '));
await done();
