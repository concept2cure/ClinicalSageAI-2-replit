/**
 * The Vault's uploads lane at a phone's width: is each uploaded file's name
 * visible, and does clicking it open the document?
 *
 *   node vault-phone-list.mjs <before|after>
 *
 * Runs at 390x844 and 1440x900 against a private instance of the working tree
 * (real server, real PostgreSQL, RLS on). Writes <before|after>/run.log, one
 * JSON line per viewport, and two screenshots per viewport: the lane in the
 * window, and the lane element itself.
 *
 * Environment (nothing secret is in this file):
 *   VPL_BASE      the private instance, e.g. http://localhost:5231
 *   VPL_PROGRAM   the synthetic organization's project id
 *   VPL_EMAIL     a synthetic account (never jm.smith or sarah.chen)
 *   VPL_PASSWORD  its password
 *
 * Exit 1 when, at any viewport, a lane name is under 40 px wide or the first
 * row does not open its document. So `before` exits 1 at 390 and `after` 0.
 */
import { chromium } from '/opt/node-tools/node_modules/playwright-core/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const phase = process.argv[2] === 'after' ? 'after' : 'before';
const { VPL_BASE: BASE, VPL_PROGRAM: PROGRAM, VPL_EMAIL: EMAIL, VPL_PASSWORD: PASSWORD } = process.env;
if (!BASE || !PROGRAM || !EMAIL || !PASSWORD) throw new Error('VPL_BASE, VPL_PROGRAM, VPL_EMAIL and VPL_PASSWORD are required');
if (/jm\.smith|sarah\.chen/i.test(EMAIL)) throw new Error('use a synthetic account');
const out = resolve(dirname(fileURLToPath(import.meta.url)), phase);
mkdirSync(out, { recursive: true });

const MIN_NAME_PX = 40;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', headless: true, args: ['--no-sandbox'] });
const log = [];
let failed = false;

for (const [label, size] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]]) {
  const phone = label === 'phone';
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/concept2cure/login`, { waitUntil: 'networkidle', timeout: 180000 });
  await page.fill('#login-email', EMAIL);
  await page.fill('#login-password', PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 60000 });
  await page.goto(`${BASE}/concept2cure/vault?program=${PROGRAM}`, { waitUntil: 'networkidle', timeout: 180000 });
  const lane = page.getByTestId('vault-uploads-lane');
  await lane.waitFor({ timeout: 30000 });
  await lane.evaluate((el) => el.scrollIntoView({ block: 'start' }));

  const measured = await lane.evaluate((el) => {
    const rows = [...el.querySelectorAll('.vd-dr-row')];
    return {
      laneWidth: Math.round(el.getBoundingClientRect().width),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      rows: rows.map((row) => {
        const name = row.querySelector('.vd-dr-name');
        const r = name.getBoundingClientRect();
        return { title: name.textContent.trim(), nameWidth: Math.round(r.width), nameHeight: Math.round(r.height), rowHeight: Math.round(row.getBoundingClientRect().height),
          parts: [...row.children].map((c) => `${String(c.className).split(' ')[0] || c.tagName.toLowerCase()} ${Math.round(c.getBoundingClientRect().width)}`).join(' | ') };
      }),
    };
  });
  await page.screenshot({ path: resolve(out, `${label}-${size.width}x${size.height}.png`) });
  await lane.screenshot({ path: resolve(out, `${label}-${size.width}x${size.height}-lane.png`) });

  // Open the first row's document from the lane, by its name, as a person does.
  const first = measured.rows[0];
  let opened = false;
  let openError = null;
  if (first) {
    try {
      await lane.locator('.vd-dr-name', { hasText: first.title }).first().click({ timeout: 5000 });
      await page.getByTestId('vault-versions').waitFor({ timeout: 15000 });
      opened = true;
    } catch (e) {
      openError = String(e.message).split('\n')[0];
    }
  }
  const narrow = measured.rows.filter((r) => r.nameWidth < MIN_NAME_PX);
  const ok = measured.rows.length > 0 && narrow.length === 0 && opened && measured.overflow <= 0;
  if (!ok) failed = true;
  const line = { viewport: `${size.width}x${size.height}`, ok, ...measured, firstRowOpened: opened, openError, pageErrors: errors };
  log.push(JSON.stringify(line));
  console.info(JSON.stringify(line));
  await context.close();
}

await browser.close();
writeFileSync(resolve(out, 'run.log'), `${log.join('\n')}\n`);
process.exit(failed ? 1 : 0);
