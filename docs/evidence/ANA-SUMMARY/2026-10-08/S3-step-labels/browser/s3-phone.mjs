// ANA-SUMMARY S3 at 390x844: reopen the S3 conversation, open each turn's
// record and every chevron, and say which element (if any) is wider than the
// viewport. A reopened thread also shows what a reload reads (trace rows).
import fs from 'node:fs';
import path from 'node:path';
import { chromium, signIn, sleep, BASE, OUT, watchedPage, writeLog } from '../qa/lib.mjs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const JM = { email: 'jm.smith@concept2cure.pro', password: process.env.QA_PASSWORD };
fs.mkdirSync(path.join(OUT, 'screens'), { recursive: true });
let n = 20;
const shot = async (page, name) => page.screenshot({ path: path.join(OUT, 'screens', `${++n}-${name}.png`), fullPage: false }).catch(() => {});

const browser = await chromium.launch({ executablePath: EXE });
const desktop = await signIn(browser, JM);
const state = await desktop.storageState();
await desktop.close();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: state });
const log = [];
const page = await watchedPage(ctx, log);
await page.goto(`${BASE}/concept2cure/projects`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await sleep(1500);
await page.getByText('Vorelinib · KIT-mutant GIST', { exact: false }).first().click();
await sleep(4000);
await page.getByText('s3 search stability', { exact: false }).first().click();
await sleep(5000);
await shot(page, 'phone-reopened');

const out = { records: [] };
const toggles = page.locator('button.ana-activity-toggle');
const count = await toggles.count();
for (let i = 0; i < count; i++) {
  const t = toggles.nth(i);
  if ((await t.getAttribute('aria-expanded')) === 'false') await t.click().catch(() => {});
}
await sleep(500);
const rows = page.locator('.ana-activity-list button.ana-activity-row');
for (let i = 0; i < (await rows.count()); i++) await rows.nth(i).click().catch(() => {});
await sleep(500);
out.records = await page.evaluate(() =>
  [...document.querySelectorAll('.ana-activity-list')].map((l) => ({
    steps: [...l.querySelectorAll('.ana-activity-step')].map((li) => ({
      row: li.querySelector('.ana-activity-row')?.textContent?.replace(/\s+/g, ' ').trim(),
      preview: li.querySelector('.ana-activity-preview')?.textContent ?? null,
      detail: li.querySelector('.ana-activity-detail:not([hidden])')?.innerText ?? null,
    })),
  })),
);
out.overflow = await page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const wide = [...document.querySelectorAll('body *')]
    .filter((el) => el.getBoundingClientRect().right > vw + 1 && getComputedStyle(el).position !== 'fixed')
    .map((el) => ({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 80), right: Math.round(el.getBoundingClientRect().right) }));
  return { scrollWidth: document.documentElement.scrollWidth, clientWidth: vw, widest: wide.slice(0, 12), activityWide: wide.filter((w) => /ana-activity/.test(w.cls)).slice(0, 12) };
});
// Each record in view, one screenshot each.
const lists = page.locator('.ana-activity-list');
for (let i = 0; i < (await lists.count()); i++) {
  await lists.nth(i).scrollIntoViewIfNeeded().catch(() => {});
  await sleep(300);
  await shot(page, `phone-record-${i + 1}`);
}
fs.writeFileSync(path.join(OUT, 's3-phone.json'), JSON.stringify(out, null, 2));
writeLog('s3-phone-errors', log);
await browser.close();
console.log(JSON.stringify({ records: out.records.length, overflow: { scrollWidth: out.overflow.scrollWidth, clientWidth: out.overflow.clientWidth, activityWide: out.overflow.activityWide.length } }));
