// After the client fix: the draft row offers Send for review and no Approve; a row under review offers Approve.
import { launch, openCtx, watchedPage, snap, writeLog, gotoQuality } from './h.mjs';
const browser = await launch();
const log = [];
const ctx = await openCtx(browser, 'michael');
const page = await watchedPage(ctx, log);
await gotoQuality(page);
const actions = async (num) => page.locator('.qms-row', { hasText: num }).locator('.qms-rowacts button').allInnerTexts();
const out = { 'WI-014 (draft)': await actions('WI-014'), 'POL-002 (in review)': await actions('POL-002') };
await snap(page, 'after-register-draft-row');
console.info(JSON.stringify(out, null, 1));
writeLog('check-after', { out, log });
await browser.close();
