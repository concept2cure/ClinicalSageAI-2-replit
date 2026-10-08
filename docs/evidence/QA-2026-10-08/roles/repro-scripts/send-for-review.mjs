// Real-form sign-in as QA_EMAIL; Projects -> Vorelinib -> Vault (DMS); reload (client re-reads
// /api/v1/auth/session); select Vorelinib-DS-Specification-J3-r2; report the role message or the
// Send for review control; if offered and CONFIRM=1, confirm and capture the POST response.
// Pre-fix server: getDb() throws before any store call, so no row is written. Password from env DPW.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const BASE = 'http://localhost:5077';
const { QA_EMAIL: EMAIL, DPW: PW, OUT_DIR: OUT, DOC_TITLE = 'Vorelinib-DS-Specification-J3-r2', CONFIRM = '1', TAG = '' } = process.env;
if (!EMAIL || !PW || !OUT) throw new Error('QA_EMAIL, DPW, OUT_DIR required');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1200 } })).newPage();
const traffic = [];
page.on('response', async (r) => {
  const u = r.url();
  if (u.includes('/api/') && (r.status() >= 400 || u.includes('/api/regulatory/documents') || u.includes('/api/v1/auth/session'))) {
    let b = ''; try { b = (await r.text()).slice(0, 240); } catch {}
    traffic.push({ method: r.request().method(), path: new URL(u).pathname, status: r.status(), body: b });
  }
});
const controls = () => page.$$eval('button', (els) => els
  .map((e) => ({ text: (e.innerText || '').trim().replace(/\s+/g, ' '), label: e.getAttribute('aria-label') || '', disabled: e.disabled }))
  .filter((x) => /^Send for review/i.test(x.text) || /^Send for review/i.test(x.label)));

await page.goto(BASE + '/concept2cure/login', { waitUntil: 'domcontentloaded' });
await page.fill('#login-email', EMAIL);
await page.fill('#login-password', PW);
await page.click('button:has-text("Sign in")');
await page.waitForTimeout(3000);
const go = async (path) => {
  if (process.env.SPA === '1') {
    // In-app navigation: no document load, so the sign-in roles stay in memory.
    await page.evaluate((p) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate', { state: {} })); }, path);
  } else {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(3500);
};
await go('/concept2cure/projects');
await page.locator('button', { hasText: /^Vorelinib · KIT-mutant GIST/ }).first().click();
await page.waitForTimeout(3000);
await page.locator('button', { hasText: /^Vault \(DMS\)/ }).first().click();
await page.waitForTimeout(3500);
// The client has now loaded the sign-in roles. Reload: the bootstrap re-reads /api/v1/auth/session.
if (process.env.NORELOAD !== '1') {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
}
await page.locator('button', { hasText: DOC_TITLE }).first().click().catch(async () => page.locator(`text=${DOC_TITLE}`).first().click());
await page.waitForTimeout(7000);

const versionsHeading = page.getByText(/^Versions/).first();
const hasVersions = await versionsHeading.count();
if (hasVersions) await versionsHeading.scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(3000);
const bodyText = await page.innerText('body');
console.log(`[${TAG || EMAIL}] versions heading present:`, hasVersions > 0);
if (hasVersions) console.log(`[${TAG || EMAIL}] versions context:`, await page.evaluate(() => { const h = [...document.querySelectorAll('*')].find((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && /^Versions/.test(n.textContent.trim())) && e.innerText && e.innerText.length < 4000); return h ? h.innerText.replace(/\s+/g, ' ').slice(0, 600) : null; }));
const roleMessage = (bodyText.match(/Your role does not send[^.]*\./) || [null])[0];
const before = await controls();
console.log(`[${TAG || EMAIL}] role message:`, roleMessage);
console.log(`[${TAG || EMAIL}] send-for-review controls:`, JSON.stringify(before));
await page.screenshot({ path: `${OUT}/${TAG || 'send'}-detail.png` });

let confirmAlerts = null;
if (CONFIRM === '1' && before.length && !before[0].disabled) {
  const sendBtn = page.locator('button', { hasText: /^Send for review/ }).first();
  await sendBtn.click();
  await page.waitForTimeout(1500);
  const group = page.getByRole('group', { name: 'Confirm sending for review' });
  if (await group.count()) {
    await group.getByRole('button', { name: 'Send for review', exact: true }).click();
  }
  await page.waitForTimeout(4000);
  confirmAlerts = await page.$$eval('[role=alert], [role=status]', (els) => els.map((e) => (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 300)).filter(Boolean));
  console.log(`[${TAG || EMAIL}] alerts after confirm:`, JSON.stringify(confirmAlerts));
}
const lifecycle = traffic.filter((t) => t.path.startsWith('/api/regulatory/documents'));
console.log(`[${TAG || EMAIL}] api errors:`, JSON.stringify(traffic.filter((t) => t.status >= 400).map((t) => ({ m: t.method, p: t.path, s: t.status, b: t.body.slice(0, 120) })), null, 1));
console.log(`[${TAG || EMAIL}] lifecycle requests:`, JSON.stringify(lifecycle, null, 1));
fs.writeFileSync(`${OUT}/${TAG || 'send'}.json`, JSON.stringify({ email: EMAIL, roleMessage, controlsBefore: before, confirmAlerts, traffic: traffic.slice(-30) }, null, 2));
await browser.close();
