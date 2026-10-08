// Browser after-check for the account panel (P-25), on the QA app (APP_URL) and QA DB.
// Throwaway account only. Secrets (passwords, reset token, TOTP key, codes, recovery
// codes) live in memory; screenshots mask them, text dumps are redacted, and the
// run ends by grepping its own output for every secret it held.
//
//   APP_URL=http://localhost:5078 SERVER_LOG=.../server-5078.log OUT=<evidence dir> \
//   QA_EMAIL=qa-onboard-2@concept2cure.pro node run.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium, BASE, SERVER_LOG, OUT, sleep, say, watchedPage } from '../../rate-limits/scripts/lib.mjs';

const EMAIL = process.env.QA_EMAIL;
if (!/^qa-onboard-[24]@(concept2cure\.pro|example\.com)$/.test(EMAIL || '')) throw new Error('throwaway accounts only');
const DB = 'postgresql://postgres@localhost:5432/c2c_qa';
const secrets = new Set();
const keep = (s) => { if (s) secrets.add(String(s)); return s; };
const redact = (t) => { let o = String(t); for (const s of secrets) o = o.split(s).join('[redacted]'); return o.replace(/token=[A-Za-z0-9%._-]+/g, 'token=[redacted]'); };
const results = [];
const step = (name, ok, detail = '') => { results.push({ step: name, ok, detail: redact(detail) }); say(ok === null ? 'NOT VERIFIED' : ok ? 'PASS' : 'FAIL', name, redact(detail)); };
const sql = (q) => execFileSync('psql', [DB, '-Atc', q], { encoding: 'utf8' }).trim();
const account = () => sql(`select u.name, u.email, o.name, ou.role, u.mfa_enabled from users u join organization_users ou on ou.user_id=u.id join organizations o on o.id=ou.organization_id where u.email='${EMAIL}'`).split('|');

function newPassword() {
  return keep(`Qa${crypto.randomBytes(9).toString('hex')}Zx7!`);
}

/* RFC 6238 TOTP, SHA-1, 6 digits, 30 s — the parameters the otpauth URI states. */
function base32(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) { const v = A.indexOf(c); if (v >= 0) bits += v.toString(2).padStart(5, '0'); }
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totp(secret, counter) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}
let lastStep = 0;
async function freshCode(secret) {
  // A step the server has not consumed, with at least 4 s left in it.
  for (;;) {
    const now = Date.now() / 1000; const s = Math.floor(now / 30);
    if (s > lastStep && 30 - (now % 30) > 4) { lastStep = s; return keep(totp(secret, s)); }
    await sleep(1000);
  }
}

let shot = 0;
async function snap(page, name, mask = []) {
  shot += 1;
  const base = path.join(OUT, 'screens', `${String(shot).padStart(2, '0')}-${name}`);
  await page.screenshot({ path: `${base}.png`, mask, maskColor: '#202020' });
  fs.writeFileSync(`${base}.txt`, redact(await page.evaluate(() => document.body?.innerText ?? '')));
}

const logLines = (re) => (fs.existsSync(SERVER_LOG) ? fs.readFileSync(SERVER_LOG, 'utf8').split('\n').filter((l) => re.test(l)) : []);

async function signIn(browser, password, secondFactor) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/concept2cure/login?returnTo=%2Fconcept2cure`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login-email', { timeout: 120000 });
  const seen = logLines(/Dev OTP code/).length;
  await page.fill('#login-email', EMAIL);
  await page.fill('#login-password', password);
  await page.click('button:has-text("Sign in")');
  // Either the second-factor step, or straight in: the QA app runs with ALLOW_DEV_AUTH=1,
  // whose /login skips every second factor ("Dev mode — MFA skipped").
  const asked = await Promise.race([
    page.waitForSelector('input[maxlength="1"]', { timeout: 30000 }).then(() => true),
    page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 }).then(() => false),
  ]);
  if (!asked) { await page.close(); ctx.factorAsked = false; return ctx; }
  ctx.factorAsked = true;
  let code;
  if (secondFactor === 'email') {
    for (let i = 0; i < 60 && !code; i++) {
      await sleep(500);
      const all = logLines(/Dev OTP code/);
      if (all.length > seen) code = keep(all[all.length - 1].match(/"code":"(\d{6})"/)[1]);
    }
  } else {
    await snap(page, 'signin-asks-authenticator');
    code = await freshCode(secondFactor.secret);
  }
  const digits = page.locator('input[maxlength="1"]:visible');
  for (let i = 0; i < 6; i++) { await digits.nth(i).click(); await page.keyboard.type(code[i]); }
  await sleep(800);
  if (/\/login/.test(page.url())) {
    const verify = page.locator('button:has-text("Verify")');
    if (await verify.isEnabled().catch(() => false)) await verify.click().catch(() => {});
  }
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 60000 });
  await page.close();
  return ctx;
}

async function openAccount(page) {
  await page.goto(`${BASE}/concept2cure`, { waitUntil: 'domcontentloaded' });
  await page.locator('.rail-account').waitFor({ timeout: 120000 });
  await page.locator('.rail-account').click();
  const items = await page.getByRole('menuitem').allInnerTexts();
  await page.getByRole('menuitem', { name: 'Account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Account' });
  await dialog.getByLabel('E-mail').waitFor({ timeout: 30000 });
  return { dialog, items };
}

const browser = await chromium.launch();
const httpLog = [];
try {
  /* A. A known password, through the product's own reset flow. */
  const before = logLines(/Dev reset link/).length;
  const ask = await fetch(`${BASE}/api/v1/auth/password/reset-request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL }) });
  step('reset link requested through POST /password/reset-request', ask.status === 200, `HTTP ${ask.status}`);
  if (ask.status !== 200) throw new Error(`reset request refused: ${ask.status}`);
  let token;
  for (let i = 0; i < 40 && !token; i++) {
    await sleep(250);
    const lines = logLines(/Dev reset link/);
    if (lines.length > before) token = keep(decodeURIComponent(lines[lines.length - 1].match(/token=([^"&]+)/)[1]));
  }
  const stored = sql(`select reset_token from users where email='${EMAIL}'`);
  const mine = token && crypto.createHash('sha256').update(token).digest('hex') === stored;
  step('the logged reset link is this account\'s (sha256 matches users.reset_token)', !!mine);
  if (!mine) throw new Error('reset link does not belong to the throwaway account; stopping');
  const p1 = newPassword();
  const changedBefore = sql(`select coalesce(password_changed_at::text,'') from users where email='${EMAIL}'`);
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/concept2cure/password-reset?token=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#reset-password', { timeout: 120000 });
    await page.fill('#reset-password', p1);
    await page.fill('#reset-password-confirm', p1);
    await page.locator('#reset-password-confirm').locator('xpath=following::button[1]').click();
    let changedAfter = changedBefore;
    for (let i = 0; i < 40 && changedAfter === changedBefore; i++) { await sleep(250); changedAfter = sql(`select coalesce(password_changed_at::text,'') from users where email='${EMAIL}'`); }
    step('password set on the product reset page (users.password_changed_at moved)', changedAfter !== changedBefore, `${changedBefore} -> ${changedAfter}`);
    if (changedAfter === changedBefore) throw new Error('reset did not change the password');
    await ctx.close();
  }

  /* B. Sign in (emailed code), open Account from the account menu. */
  let ctx = await signIn(browser, p1, 'email');
  let page = await watchedPage(ctx, httpLog);
  const opened = await openAccount(page);
  let dialog = opened.dialog;
  const items = opened.items;
  step('the account menu offers Account first', items[0]?.trim() === 'Account', items.join(' | '));
  const [dbName, dbEmail, dbOrg, dbRole] = account();
  const shown = {
    name: await dialog.getByLabel('Name').inputValue(),
    email: await dialog.getByLabel('E-mail').inputValue(),
    org: await dialog.getByLabel('Organisation').inputValue(),
    role: await dialog.getByLabel('Role').inputValue(),
  };
  step('profile matches the database (name, e-mail, organisation, membership role)',
    shown.name === dbName && shown.email === dbEmail && shown.org === dbOrg && shown.role === dbRole,
    `shown ${JSON.stringify(shown)} · db ${JSON.stringify({ dbName, dbEmail, dbOrg, dbRole })}`);
  await snap(page, 'account-panel-open');

  /* C. Wrong current password: the server's refusal, and the session stays. */
  const p2 = newPassword();
  await dialog.getByLabel('Current password').fill('definitely-not-the-password');
  await dialog.getByLabel('New password', { exact: true }).fill(p2);
  await dialog.getByLabel('Confirm new password').fill(p2);
  await dialog.getByRole('button', { name: 'Change password' }).click();
  const refusal = dialog.getByRole('alert');
  await refusal.waitFor({ timeout: 15000 });
  const refusalText = await refusal.innerText();
  const panelText = await dialog.innerText();
  step('wrong current password shows the server\'s refusal', /Current password is incorrect/.test(refusalText), refusalText);
  step('…and not "Session expired", and the session stays', !/Session expired/i.test(panelText) && !/\/login/.test(page.url()));
  await snap(page, 'password-wrong-current');

  /* D. A real change; every session ends; sign in with the new password. */
  await dialog.getByLabel('Current password').fill(p1);
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await dialog.getByRole('status', { name: 'Password changed' }).waitFor({ timeout: 20000 });
  step('password changed; the panel says every session ended', /this one included/.test(await dialog.innerText()));
  await snap(page, 'password-changed');
  await dialog.getByRole('button', { name: 'Sign in again' }).click();
  await page.waitForURL(/\/login/, { timeout: 30000 });
  step('"Sign in again" ends this session and opens sign-in', true, page.url().replace(BASE, ''));
  await ctx.close();
  ctx = await signIn(browser, p2, 'email');
  step('signs in with the new password', true);
  page = await watchedPage(ctx, httpLog);
  ({ dialog } = await openAccount(page));

  /* E. Enrol an authenticator. */
  step('status before enrolment is "Not set up"', /Not set up\./.test(await dialog.innerText()));
  await dialog.getByRole('button', { name: 'Set up authenticator app' }).click();
  const keyEl = dialog.locator('.de-quote code.mono');
  await keyEl.waitFor({ timeout: 20000 });
  const secret = keep((await keyEl.innerText()).trim());
  const qr = dialog.getByRole('img', { name: /QR code/ });
  const qrSrc = (await qr.getAttribute('src')) || '';
  keep(qrSrc);
  step('setup shows the server-drawn QR code (data: URL) and the key', qrSrc.startsWith('data:image/png') && /^[A-Z2-7]{16,}$/.test(secret), `key length ${secret.length}`);
  await snap(page, 'mfa-setup-key-and-qr-masked', [keyEl, qr]);
  await dialog.getByLabel('Code from the app').fill(await freshCode(secret));
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  const codesList = dialog.getByRole('list', { name: 'Recovery codes' });
  await codesList.waitFor({ timeout: 20000 });
  const codes = (await codesList.locator('li').allInnerTexts()).map((c) => keep(c.trim()));
  step('enrolment confirmed; recovery codes shown once', codes.length > 0, `${codes.length} recovery codes`);
  await dialog.getByText(/^Set up\./).waitFor({ timeout: 15000 });
  step('status re-read from the server: "Set up"', true);
  step('database: mfa_enabled = true', account()[4] === 't');
  await snap(page, 'mfa-enrolled-recovery-codes-masked', [codesList]);
  await dialog.getByRole('button', { name: 'Done' }).click();
  step('"Done" removes the recovery codes from the screen', (await dialog.getByRole('list', { name: 'Recovery codes' }).count()) === 0);
  await ctx.close();

  /* F. Sign-in now asks for the authenticator. */
  ctx = await signIn(browser, p2, { secret });
  step('sign-in after enrolment asks for the authenticator', ctx.factorAsked ? true : null,
    ctx.factorAsked ? 'completed with an authenticator code' : 'not verifiable on this QA app: ALLOW_DEV_AUTH=1 makes /login skip every second factor (server log: "Dev mode — MFA skipped")');
  page = await watchedPage(ctx, httpLog);
  ({ dialog } = await openAccount(page));

  /* G. Remove it: a wrong code is refused in the server's words; a current code removes it. */
  await dialog.getByRole('button', { name: 'Remove authenticator' }).click();
  await dialog.getByLabel('Current code from the app').fill('000000');
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
  const removeRefusal = dialog.getByRole('alert');
  await removeRefusal.waitFor({ timeout: 15000 });
  const removeText = await removeRefusal.innerText();
  step('a wrong code to remove shows the server\'s refusal, not "Session expired"',
    /Invalid verification code/.test(removeText) && !/Session expired/i.test(await dialog.innerText()), removeText);
  await snap(page, 'mfa-remove-wrong-code');
  await dialog.getByLabel('Current code from the app').fill(await freshCode(secret));
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
  await dialog.getByText(/^Not set up\./).waitFor({ timeout: 20000 });
  step('a current code removes the authenticator; status re-read: "Not set up"', /Authenticator removed/.test(await dialog.innerText()));
  step('database: mfa_enabled = false', account()[4] === 'f');
  await snap(page, 'mfa-removed');
  await ctx.close();
} catch (e) {
  step('run', false, String(e?.stack || e).slice(0, 800));
} finally {
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'browser-results.json'), redact(JSON.stringify({ app: BASE, account: EMAIL, results }, null, 2)));
  fs.writeFileSync(path.join(OUT, 'browser-http-and-console.json'), redact(JSON.stringify(httpLog, null, 2)));
  // Last: no secret this run held may appear in anything it wrote.
  const leaks = [];
  for (const f of fs.readdirSync(OUT, { recursive: true })) {
    const p = path.join(OUT, String(f));
    if (!fs.statSync(p).isFile() || p.endsWith('.png')) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const s of secrets) if (s.length >= 6 && text.includes(s)) leaks.push(String(f));
  }
  say(leaks.length ? `LEAK in ${[...new Set(leaks)].join(', ')}` : `no secret in ${OUT}`);
  say(`${results.filter((r) => r.ok === true).length} passed, ${results.filter((r) => r.ok === false).length} failed, ${results.filter((r) => r.ok === null).length} not verified`);
}
