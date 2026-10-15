// Reproduce the QMS findings on the current code, before any fix.
import { launch, openCtx, watchedPage, snap, sleep, writeLog, gotoQuality, composer } from './h.mjs';
const browser = await launch();
const out = {};
const log = [];
{
  const ctx = await openCtx(browser, 'michael');
  const page = await watchedPage(ctx, log);
  await gotoQuality(page);
  await snap(page, 'before-register');
  // F1: New controlled document
  await page.getByRole('button', { name: /New controlled document/ }).click();
  await sleep(2500);
  out.newDoc = { url: page.url(), composer: (await composer(page))?.slice(0, 200) };
  await snap(page, 'before-new-doc');
  // F2: open a document by its number
  await gotoQuality(page);
  await page.locator('.qms-row', { hasText: 'SOP-820-100' }).getByRole('button', { name: 'SOP-820-100' }).click();
  await sleep(2500);
  out.openDoc = { url: page.url(), composer: (await composer(page))?.slice(0, 200) };
  await snap(page, 'before-open-doc');
  // F3/F5: the draft row's actions
  await gotoQuality(page);
  const wi = page.locator('.qms-row', { hasText: 'WI-014' });
  out.draftRowActions = await wi.locator('.qms-rowacts button').allInnerTexts();
  await wi.getByRole('button', { name: /Approve/ }).click();
  await sleep(800);
  out.draftApproveDialog = (await page.evaluate(() => document.querySelector('[role=dialog]')?.innerText ?? 'NO DIALOG')).slice(0, 600);
  await snap(page, 'before-draft-approve-dialog');
  await page.keyboard.press('Escape');
  // F4: training
  await gotoQuality(page);
  await page.getByRole('button', { name: /Record training/ }).click();
  await sleep(2500);
  out.recordTraining = { url: page.url(), composer: (await composer(page))?.slice(0, 200) };
  // F8-F11: change control
  await gotoQuality(page);
  await page.getByRole('tab', { name: /Change control/ }).click();
  await sleep(2500);
  out.overdueKpi = await page.locator('.qms-kpi', { hasText: 'Overdue' }).innerText();
  out.changeRows = await page.locator('.qms-row').evaluateAll((rows) => rows.map((r) => ({
    text: r.innerText.replace(/\n+/g, ' | '),
    flagged: !!r.querySelector('.qms-overdue'),
  })));
  await page.locator('.qms-row', { hasText: 'CC-2026-014' }).getByRole('button', { name: 'CC-2026-014' }).click();
  await sleep(800);
  out.linkedPanel = await page.locator('.qcc-detail').innerText();
  await snap(page, 'before-change-links');
  await page.locator('.qms-row', { hasText: 'CC-2026-001' }).getByRole('button', { name: /Advance/ }).click();
  await sleep(2500);
  out.advance = { url: page.url(), composer: (await composer(page))?.slice(0, 200) };
  await ctx.close();
}
{
  // F0: a manager's approval is refused for authority
  const ctx = await openCtx(browser, 'raj');
  const page = await watchedPage(ctx, log);
  await gotoQuality(page);
  await page.locator('.qms-row', { hasText: 'POL-002' }).getByRole('button', { name: /Approve/ }).click();
  await sleep(800);
  await page.getByLabel(/Reason for this action/).fill('Reviewed against the periodic-review checklist');
  await page.getByLabel(/Password/).first().fill(process.env.QA_PW);
  await sleep(300);
  await page.getByRole('button', { name: 'Sign and commit' }).click();
  await sleep(3000);
  out.managerApprove = (await page.evaluate(() => document.querySelector('[role=dialog]')?.innerText ?? 'NO DIALOG')).replace(/\n+/g, ' | ').slice(0, 800);
  await snap(page, 'before-manager-approve');
  await ctx.close();
}
console.info(JSON.stringify(out, null, 1));
writeLog('repro-before', { out, log });
await browser.close();
