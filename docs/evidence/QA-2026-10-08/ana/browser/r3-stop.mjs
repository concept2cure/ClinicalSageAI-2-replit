// Finding 3: send, click Stop as soon as it appears, read the transcript; then reload.
import { open, openProject, sleep, snap, bodyText } from './h.mjs';
const ASK = process.argv[2] || 'Summarize the open risks for this program';
const { page, done } = await open('r3-stop');
await openProject(page);
const ta = page.locator('textarea[aria-label="Message AnA about this project"]');
await ta.fill(ASK);
await ta.press('Enter');
const stop = page.locator('button.is-stop, button:has-text("Stop")').first();
let clicked = false;
for (let i = 0; i < 60 && !clicked; i++) {
  if (await stop.isVisible().catch(() => false)) { await stop.click().catch(() => {}); clicked = true; console.log('clicked Stop at', i * 100, 'ms after the button appeared poll'); }
  else await sleep(100);
}
await sleep(4000);
const t = await bodyText(page);
const ana = await page.evaluate(() => [...document.querySelectorAll('.ct-turn.ct-ana')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
console.log('clicked:', clicked, '| url', page.url().replace(/^.*5078/, ''));
console.log('AnA turns:', JSON.stringify(ana));
console.log('stopped marker:', /stopped/i.test(ana.join(' ')));
await snap(page, 'r3-after-stop');
await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
await sleep(6000);
const ana2 = await page.evaluate(() => [...document.querySelectorAll('.ct-turn')].map((e) => e.className + ': ' + e.innerText.replace(/\s+/g, ' ').trim()));
console.log('AFTER RELOAD turns:', JSON.stringify(ana2));
await snap(page, 'r3-after-reload');
await done();
