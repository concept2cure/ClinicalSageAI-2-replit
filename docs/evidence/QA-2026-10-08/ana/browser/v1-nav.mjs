// After the fix: 'take me to the vault' from the project composer; the Vault shows the reply notice and the way back.
import { open, openProject, sleep, snap, bodyText } from './h.mjs';
const ASK = 'take me to the vault';
const { page, done } = await open('v1-nav');
await openProject(page);
const ta = page.locator('textarea[aria-label="Message AnA about this project"]');
await ta.fill(ASK);
await ta.press('Enter');
let sawBackDuringDrive = false;
for (let i = 0; i < 14; i++) {
  await sleep(1000);
  await bodyText(page);
  const strip = await page.locator('.ana-drive-strip').innerText().catch(() => '');
  if (/AnA is driving/.test(strip) && /Back to conversation/.test(strip)) sawBackDuringDrive = true;
  console.info(`${i + 1}s ${page.url().replace(/^.*508\d/, '')} | strip: ${strip.replace(/\s+/g, ' ').slice(0, 160)}`);
}
console.info('Back offered during the drive:', sawBackDuringDrive);
await snap(page, 'v1-vault-after-reply');
const back = page.locator('.ana-drive-strip button', { hasText: 'Back to conversation' });
console.info('notice Back button:', await back.count());
if (await back.count()) {
  await back.first().click();
  await sleep(3000);
  const t = await bodyText(page);
  console.info('AFTER BACK url', page.url().replace(/^.*508\d/, ''), '| question shown:', t.includes(ASK), '| answer shown:', /You are on vault now/.test(t));
  await snap(page, 'v1-back-in-conversation');
}
await done();
