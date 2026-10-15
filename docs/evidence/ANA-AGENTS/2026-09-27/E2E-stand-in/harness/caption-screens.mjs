// Burns a "scripted stand-in model" banner and each screenshot's caption
// (screens/CAPTIONS.txt) into a copy under screens/captioned/, so a screenshot
// lifted out of this folder still says what it is. The originals are untouched.
//   node harness/caption-screens.mjs          CHROMIUM_PATH (optional)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const screens = path.join(here, '..', 'screens');
const outDir = path.join(screens, 'captioned');
fs.mkdirSync(outDir, { recursive: true });
const rows = fs.readFileSync(path.join(screens, 'CAPTIONS.txt'), 'utf8').split('\n')
  .filter(l => l && !l.startsWith('#')).map(l => l.split('\t'));
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
for (const [file, caption] of rows) {
  const b64 = fs.readFileSync(path.join(screens, file)).toString('base64');
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff;font:15px/1.4 system-ui,sans-serif;width:1440px">
<div id="c"><div style="background:#7a1f12;color:#fff;padding:10px 16px;font-weight:700">SCRIPTED STAND-IN MODEL, NOT A LIVE MODEL. Row 74 S1/S2/S4 end-to-end capture, 2026-09-28, snapshot 640937815, database ana_e2e_2. ${esc(file)}</div>
<div style="background:#fbeee9;color:#2a1a14;padding:8px 16px;border-bottom:1px solid #d9b8ad">${esc(caption)}</div>
<img style="display:block" src="data:image/png;base64,${b64}"></div></body></html>`);
  await page.locator('#c').screenshot({ path: path.join(outDir, file) });
  console.info(`captioned/${file}`);
}
await browser.close();
