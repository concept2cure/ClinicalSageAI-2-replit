// j3 after: who sees the in-review Vault version, and is Sign review offered to someone who cannot sign?
import { chromium, signIn, sleep, BASE } from '../lib.mjs';
import fs from 'node:fs';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PID = '8a11b987-ac2d-4748-9e9c-5dc40c082662';
const DOC = 'Tolvexa-DS-Stability-Protocol-STB-0101';
const who = process.argv[2] || 'david.kim';
const PW = process.env.QA_TEAM_PASSWORD; // the team password is never written here
const out = process.env.OUT;
const browser = await chromium.launch({ executablePath: EXE });
const ctx = await signIn(browser, { email: `${who}@concept2cure.pro`, password: PW });
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
const say = (...a) => console.log(who, ...a);
// Review & approval, scope "Awaiting my review" (the default) and "All open".
await page.goto(`${BASE}/concept2cure/review?program=${PID}`, { waitUntil: 'domcontentloaded' });
await sleep(5000);
await page.getByRole('button', { name: 'Awaiting my review' }).click().catch(() => {});
await sleep(3000);
const mine = await page.locator('main').innerText().catch(() => '');
say('review (awaiting my review): vault section', /Vault versions in review/i.test(mine), '| row:', (mine.match(/Tolvexa-DS-Stability[^\n]*\n[^\n]*\n[^\n]*/) || ['(none)'])[0].replace(/\n/g, ' | '));
await page.getByRole('button', { name: 'All open' }).click().catch(() => {});
await sleep(3000);
const all = await page.locator('main').innerText().catch(() => '');
const row = (all.match(/Tolvexa-DS-Stability[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*/) || ['(none)'])[0].replace(/\n/g, ' | ');
say('review (all open): row:', row);
await page.screenshot({ path: `${out}/screens/j3-review-${who}.png` });
// The version in the Vault.
await page.goto(`${BASE}/concept2cure/vault?program=${PID}`, { waitUntil: 'domcontentloaded' });
await sleep(5000);
await page.getByTestId('vault-uploads-lane').getByText(DOC, { exact: true }).first().click().catch((e) => say('open doc failed', e.message));
await sleep(4000);
const sign = page.getByRole('button', { name: /^(Sign review|Approve): / }).first();
say('Sign review/Approve button count', await sign.count(), 'enabled', await sign.isEnabled().catch(() => null));
const who2 = await page.getByTestId('vault-who-may-sign').innerText().catch(() => '(no who-may-sign line)');
say('who may sign:', who2);
const versions = await page.getByTestId('vault-versions').innerText().catch(() => '');
say('blocked line:', (versions.match(/Your role does not[^\n]*/) || ['(none)'])[0]);
await page.getByTestId('vault-versions').screenshot({ path: `${out}/screens/j3-vault-version-${who}.png` }).catch(() => {});
await browser.close();
