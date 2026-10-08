// Finding 5: attach a .txt in the conversation composer; compare the chip with what the turn reports.
import { open, openProject, sleep, snap, bodyText } from './h.mjs';
import path from 'node:path';
const { page, done } = await open('r5-attach');
await openProject(page);
await page.locator('button.pj-convo-open').click();
await sleep(3000);
await page.locator('[data-testid="ct-attach-input"]').setInputFiles(path.resolve('files/upload-note.txt'));
for (let i = 0; i < 20; i++) { await sleep(500); if (await page.locator('.ct-att-chip[data-status="ready"]').count()) break; }
const chip = await page.locator('.ct-att-chip').first().innerText().catch(() => '(no chip)');
console.log('CHIP:', chip.replace(/\s+/g, ' '));
await snap(page, 'r5-chip');
const ta = page.locator('textarea[aria-label="Reply to AnA"]');
await ta.fill('Summarize the attached stability note');
await ta.press('Enter');
await sleep(9000);
const t = await bodyText(page);
const used = t.match(/Used in this session.{0,300}/);
console.log('USED:', used ? used[0] : '(none)');
await snap(page, 'r5-after-send');
await done();
