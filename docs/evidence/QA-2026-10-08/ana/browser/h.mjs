// j5-fix harness: 5078, signed in as michael.brown through the real form.
import { chromium, watchedPage, snap, writeLog, BASE, sleep, say, signIn } from '../../rate-limits/scripts/lib.mjs';
import fs from 'node:fs';
export { snap, sleep, BASE, say };
export const OUT = process.env.OUT;
export const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const MB = { email: 'michael.brown@concept2cure.pro', password: process.env.QA_PW };
export const VORELINIB = '50c41bb6-5796-4dc6-a848-72e4d1246ebd';
export async function open(name) {
  const browser = await chromium.launch({ executablePath: EXE });
  const statePath = `${OUT}/state.json`;
  let ctx = null;
  if (fs.existsSync(statePath)) {
    try { ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: statePath, acceptDownloads: true }); } catch { ctx = null; }
  }
  if (!ctx) ctx = await signIn(browser, MB);
  const log = [];
  const page = await watchedPage(ctx, log);
  page.on('response', async (r) => {
    const u = r.url();
    if (!u.includes('/api/')) return;
    const m = r.request().method();
    if (m !== 'GET' || /\/api\/chat\/threads/.test(u)) {
      let body = '';
      try { body = (await r.text()).slice(0, 1500); } catch {}
      fs.appendFileSync(`${OUT}/${name}-api.log`, `${new Date().toISOString().slice(11,19)} ${m} ${r.status()} ${u.replace(BASE,'')}\n  REQ ${(r.request().postData()||'').slice(0,600)}\n  RES ${body.replace(/\n/g,' ')}\n`);
    }
  });
  page.on('requestfailed', (r) => { if (r.url().includes('/api/')) fs.appendFileSync(`${OUT}/${name}-api.log`, `${new Date().toISOString().slice(11,19)} FAILED ${r.url().replace(BASE,'')} ${r.failure()?.errorText}\n`); });
  const done = async () => { writeLog(name, log); try { await ctx.storageState({ path: statePath }); } catch {} await browser.close(); };
  return { browser, ctx, page, log, done };
}
export async function goto(page, p) {
  await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await sleep(1500);
}
export async function openProject(page, title = 'Vorelinib') {
  await goto(page, '/concept2cure/projects');
  await sleep(2000);
  await page.getByText(title, { exact: false }).first().click();
  await sleep(4500);
}
export const bodyText = (page) => page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' '));
