// Walk-2 helper: one browser per script, a cached signed-in state per user, every non-GET /api call logged.
import { chromium, watchedPage, snap, writeLog, BASE, sleep, say, signIn } from '../lib.mjs';
import fs from 'node:fs';
export { snap, sleep, BASE, say, chromium, writeLog };
export const OUT = process.env.OUT;
if (!OUT) throw new Error('set OUT');
export const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PW = process.env.QA_TEAM_PASSWORD; // the team password is never written here
if (!PW) throw new Error('set QA_TEAM_PASSWORD');
export const U = (n) => ({ email: n.includes('@') ? n : `${n}@concept2cure.pro`, password: PW });
export const RAJ = U('raj.patel');
export const EMILY = U('emily.watson');
export const DAVID = U('david.kim');
export const LISA = U('lisa.johnson');
export const MICHAEL = U('michael.brown');
export const QA3 = U('qa-onboard-3');
export const QA4 = U('qa-onboard-4');
export const VORELINIB = '50c41bb6-5796-4dc6-a848-72e4d1246ebd';
export const BX256 = '099991d1-dac8-43c5-b88a-8baab26194ee';
const STATE_DIR = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/2dce5675-71af-532e-b288-abcf4efad803/scratchpad/qa/walk-2/.state';
fs.mkdirSync(STATE_DIR, { recursive: true });

export async function open(name, user = RAJ, { fresh = false } = {}) {
  const browser = await chromium.launch({ executablePath: EXE });
  const statePath = `${STATE_DIR}/state-${user.email.split('@')[0]}.json`;
  let ctx = null;
  if (!fresh && fs.existsSync(statePath)) {
    try {
      ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: statePath, acceptDownloads: true });
      // probe the session
      const p = await ctx.newPage();
      await p.goto(`${BASE}/concept2cure`, { waitUntil: 'domcontentloaded' });
      await sleep(2500);
      if (/\/login/.test(p.url())) { await ctx.close(); ctx = null; }
      else await p.close();
    } catch { ctx = null; }
  }
  if (!ctx) ctx = await signIn(browser, user);
  const log = [];
  const page = await watchedPage(ctx, log);
  page.on('response', async (r) => {
    const u = r.url();
    if (!u.includes('/api/')) return;
    const m = r.request().method();
    if (m !== 'GET') {
      let body = '';
      try { body = (await r.text()).slice(0, 2500).replace(/eyJ[A-Za-z0-9_.-]{20,}/g, '[redacted-jwt]').replace(/"(accessToken|refreshToken|token|setupUrl|secret|otpauthUrl|qrCode)":"[^"]*"/g, '"$1":"[redacted]"').replace(/(token=)[A-Za-z0-9_-]+/g, '$1[redacted]'); } catch { /* body unreadable: logged empty */ }
      const req = (r.request().postData() || '').slice(0, 1500).replace(/"password"\s*:\s*"[^"]*"/g, '"password":"[redacted]"').replace(/"currentPassword"\s*:\s*"[^"]*"/g, '"currentPassword":"[redacted]"');
      fs.appendFileSync(`${OUT}/${name}-api.log`, `${new Date().toISOString().slice(11, 19)} ${m} ${r.status()} ${u.replace(BASE, '')}\n  REQ ${req}\n  RES ${body.replace(/\n/g, ' ')}\n`);
    }
  });
  const done = async () => { writeLog(name, log); try { await ctx.storageState({ path: statePath }); } catch { /* state not saved */ } await browser.close(); };
  return { browser, ctx, page, log, done };
}
export async function clickables(page, scope = 'main') {
  return page.evaluate((scope) => {
    const root = document.querySelector(scope) || document.body;
    const els = [...root.querySelectorAll('a, button, [role=button], [role=link], [role=tab], [role=menuitem], textarea, input, select')];
    return els.filter((e) => e.offsetParent !== null).map((e) => {
      const t = (e.innerText || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 90);
      const a = e.getAttribute('aria-label') || e.getAttribute('title') || e.getAttribute('placeholder') || e.getAttribute('id') || '';
      return `${e.tagName.toLowerCase()}${e.disabled ? '[disabled]' : ''}${e.getAttribute('href') ? ' href=' + e.getAttribute('href') : ''} | ${t}${a ? ' {' + a + '}' : ''}`;
    });
  }, scope);
}
export async function goto(page, path) {
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await sleep(1500);
}
export async function settle(page, ms = 1500) {
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await sleep(ms);
}
export async function text(page, sel = 'main') {
  return (await page.locator(sel).first().innerText().catch(() => '')).replace(/\n{3,}/g, '\n\n');
}
export function apiErrs(log) { return log.filter((l) => l.kind !== 'console' || !/ERR_CERT|fonts\.g/.test(l.text)); }
// Authenticated API GET through the page's own token (as the app would read it).
export async function apiGet(page, path) {
  return page.evaluate(async (path) => {
    const keys = Object.keys(localStorage);
    let tok = null;
    for (const k of ['trialsage_access_token', 'c2c_access_token', 'access_token', 'token']) { if (localStorage.getItem(k)) { tok = localStorage.getItem(k); break; } }
    if (!tok) { for (const k of keys) { const v = localStorage.getItem(k) || ''; if (/^ey[A-Za-z0-9_-]+\./.test(v)) { tok = v; break; } } }
    const r = await fetch(path, { headers: tok ? { Authorization: `Bearer ${tok}` } : {}, credentials: 'include' });
    let body; const t = await r.text(); try { body = JSON.parse(t); } catch { body = t.slice(0, 2000); }
    return { status: r.status, body };
  }, path);
}
// Text of the Submission Center's active workspace (after the tab bar).
export async function wsText(page) {
  const t = await text(page);
  const k = t.lastIndexOf('Cross-region\nDispatch');
  return k >= 0 ? t.slice(k + 'Cross-region\nDispatch'.length) : t;
}
export async function scTab(page, name) {
  await page.getByRole('tab', { name, exact: true }).first().click();
  await settle(page, 2500);
}
// Walk-2 throwaway accounts (own self-serve organization).
export function w2(name) {
  const a = JSON.parse(fs.readFileSync('/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/2dce5675-71af-532e-b288-abcf4efad803/scratchpad/qa/walk-2/.state/w2-accounts.json', 'utf8'));
  return a[name];
}
