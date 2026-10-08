// Finding 1: send 'take me to the vault' from the project composer; watch URL and what is on screen.
import { open, openProject, sleep, snap, bodyText } from './h.mjs';
const ASK = process.argv[2] || 'take me to the vault';
const { page, done } = await open('r1-nav');
await openProject(page);
const ta = page.locator('textarea[aria-label="Message AnA about this project"]');
console.log('composer present:', await ta.count());
await ta.fill(ASK);
await ta.press('Enter');
for (let i = 0; i < 14; i++) {
  await sleep(1000);
  const t = await bodyText(page);
  console.log(`${i + 1}s ${page.url().replace(/^.*5078/, '')} | ask visible: ${t.includes(ASK)} | strip: ${/AnA is driving/.test(t)} | ${t.slice(0, 100)}`);
}
await snap(page, 'r1-after-send');
const t = await bodyText(page);
console.log('FINAL url', page.url(), 'ask visible:', t.includes(ASK), 'answer visible:', /You are on|Opening vault|Navigation result/.test(t));
console.log('links to conversation:', await page.locator('text=/conversation/i').count());
await done();
