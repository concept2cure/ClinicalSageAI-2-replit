// Finding 2: send from the project composer, wait for the reply, reload the conversation page.
import { open, openProject, sleep, snap, bodyText } from './h.mjs';
const ASK = process.argv[2] || 'Summarize the open risks for this program';
const { page, done } = await open('r2-reload');
await openProject(page);
const ta = page.locator('textarea[aria-label="Message AnA about this project"]');
await ta.fill(ASK);
await ta.press('Enter');
await sleep(9000);
const before = await bodyText(page);
console.log('BEFORE url', page.url().replace(/^.*5078/, ''), '| ask:', before.includes(ASK), '| Understood:', /Understood\./.test(before));
await snap(page, 'r2-before-reload');
await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
await sleep(6000);
const after = await bodyText(page);
console.log('AFTER url', page.url().replace(/^.*5078/, ''), '| ask:', after.includes(ASK), '| Understood:', /Understood\./.test(after), '| New conversation:', /New conversation/.test(after), '| Talk to AnA:', /Talk to AnA/.test(after));
await snap(page, 'r2-after-reload');
await done();
