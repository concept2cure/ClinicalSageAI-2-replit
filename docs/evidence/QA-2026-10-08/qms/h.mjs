import { chromium, snap, say, watchedPage, sleep, writeLog, BASE } from '../rate-limits/scripts/lib.mjs';
export { chromium, snap, say, watchedPage, sleep, writeLog, BASE };
const DIR = new URL('.', import.meta.url).pathname;
export async function launch() {
  return chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
}
export async function openCtx(browser, who) {
  return browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, storageState: `${DIR}state-${who}.json` });
}
export async function gotoQuality(page) {
  await page.goto(`${BASE}/concept2cure/quality`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.qms-row', { timeout: 60000 });
  await sleep(1500);
}
export const composer = (page) => page.evaluate(() => { const el = document.querySelector('textarea, [contenteditable=true]'); return el ? (el.value ?? el.innerText) : null; });
