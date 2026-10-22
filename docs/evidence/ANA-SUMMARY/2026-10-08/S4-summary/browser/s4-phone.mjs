// ANA-SUMMARY S4 at 390x844 on the private instance (:5086): the conversation
// s4-desktop.mjs left (THREAD_URL), its turns' Summaries as the bottom sheet
// that replaces the stacked dock, and a turn whose page is closed while it runs
// (the stand-in holds its second round): reopened, it reads "Stopped: this page
// lost its connection." with Continue, from the record.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, signIn, sleep, OUT, watchedPage, writeLog } from '../../../../QA-2026-10-08/rate-limits/scripts/lib.mjs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const JM = { email: 'jm.smith@concept2cure.pro', password: process.env.QA_PASSWORD };
const THREAD_URL = process.env.THREAD_URL;
fs.mkdirSync(path.join(OUT, 'screens'), { recursive: true });
let n = 40;
const shot = async (page, name) => page.screenshot({ path: path.join(OUT, 'screens', `${++n}-${name}.png`), fullPage: false }).catch(() => {});

const READ_SHEET = () => {
  const sheet = document.querySelector('.ana-sheet');
  if (!sheet) return null;
  const words = (li) => {
    const parts = [];
    const walk = document.createTreeWalker(li, 4);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) if (!t.parentElement.closest('.ana-activity-detail')) parts.push(t.textContent);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  };
  const r = sheet.getBoundingClientRect();
  return {
    role: sheet.getAttribute('role'),
    modal: sheet.getAttribute('aria-modal'),
    title: sheet.querySelector('.ana-sheet-title')?.innerText,
    rect: { top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width) },
    head: sheet.querySelector('.ana-summary-head')?.innerText ?? null,
    rows: [...sheet.querySelectorAll('.ana-summary-list > li')].map(words),
    foot: [...sheet.querySelectorAll('.ana-summary-foot')].map((f) => f.innerText.replace(/\s+/g, ' ').trim()),
    dockShown: (() => { const d = document.querySelector('.ct-side-work'); return d ? window.getComputedStyle(d).display !== 'none' : false; })(),
  };
};

const browser = await chromium.launch({ executablePath: EXE });
const desktop = await signIn(browser, JM);
const state = await desktop.storageState();
await desktop.close();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: state });
const log = [];
let page = await watchedPage(ctx, log);
const out = {};

await page.goto(THREAD_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await sleep(5000);
await shot(page, 'phone-thread');
out.overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));

// Each turn's Summary button opens the sheet at that turn.
const buttons = page.locator('button.ana-activity-summary');
out.turns = [];
for (let i = 0; i < (await buttons.count()); i++) {
  await buttons.nth(i).scrollIntoViewIfNeeded().catch(() => {});
  await buttons.nth(i).click().catch(() => {});
  await sleep(2000);
  const rows = page.locator('.ana-sheet .ana-summary button.ana-activity-row');
  for (let k = 0; k < Math.min(await rows.count(), 3); k++) await rows.nth(k).click().catch(() => {});
  await sleep(300);
  out.turns.push(await page.evaluate(READ_SHEET));
  await shot(page, `phone-sheet-${i + 1}`);
  await page.keyboard.press('Escape');
  await sleep(400);
  out.turns[out.turns.length - 1].closedByEscape = (await page.locator('.ana-sheet').count()) === 0;
}

// The header chip opens the sheet on the latest turn.
await page.locator('button.ana-step-chip').first().click().catch(() => {});
await sleep(1500);
out.chip = await page.evaluate(READ_SHEET);
await shot(page, 'phone-chip-sheet');
await page.keyboard.press('Escape');
await sleep(400);

// A page that leaves mid-turn: send, then close the page while the stand-in holds round two.
const box = page.locator('textarea:visible').last();
await box.fill('s4 stop');
await box.press('Enter');
await sleep(4500);
await page.close();
await sleep(8000);
page = await watchedPage(ctx, log);
await page.goto(THREAD_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await sleep(6000);
out.reopenedStop = await page.evaluate(() => [...document.querySelectorAll('.ana-activity-stopped')].map((p) => p.innerText.replace(/\s+/g, ' ').trim()));
await shot(page, 'phone-reopened-lost-connection');
const all = page.locator('button.ana-activity-summary');
await all.last().scrollIntoViewIfNeeded().catch(() => {});
await all.last().click().catch(() => {});
await sleep(2500);
out.lostConnection = await page.evaluate(READ_SHEET);
await shot(page, 'phone-lost-connection-sheet');

fs.writeFileSync(path.join(OUT, 's4-phone.json'), JSON.stringify(out, null, 2));
writeLog('s4-phone-errors', log);
await browser.close();
console.info(JSON.stringify({ turns: out.turns.length, overflow: out.overflow, lost: out.reopenedStop }));
