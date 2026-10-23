// Static harness for the placement dialog's submit button (item 3).
// Renders the dialog footer with the product's own journey-v2.css, rests the
// pointer on given rows of `.de-btn.primary`, and records the button's top
// edge on 40 consecutive animation frames. A settled button has one value.
// Usage: node jitter-harness.mjs <path-to-journey-v2.css>
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const cssPath = process.argv[2];
const css = fs.readFileSync(cssPath, 'utf8');
const html = `<!doctype html><html><head><style>${css}</style>
<style>:root{--radius-md:8px;--accent-strong:#c6613f;--accent-on-strong:#fff;--shadow-sm:0 1px 2px rgba(0,0,0,.2);--dur:200ms;--ease:ease-out;--border:#ddd;--border-strong:#bbb;}
body{margin:0;font-family:sans-serif}</style></head>
<body><div class="c2c-v2"><div class="de" role="dialog" aria-label="Place into submission" style="margin:40px">
<div class="de-f"><button class="de-btn ghost" type="button">Cancel</button>
<button class="de-btn primary" type="button" id="go">Place into sequence 0001</button></div></div></div></body></html>`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.setContent(html);
const go = page.locator('#go');
const box = await go.boundingBox();

async function rest(label, y) {
  await page.mouse.move(10, 10);
  await page.waitForTimeout(100);
  await page.mouse.move(box.x + box.width / 2, y);
  const frames = await page.evaluate(async () => {
    const btn = document.getElementById('go');
    const out = [];
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => requestAnimationFrame(r));
      out.push({ top: btn.getBoundingClientRect().top, hover: btn.matches(':hover') });
    }
    return out;
  });
  const tops = [...new Set(frames.map((f) => f.top))];
  const hovers = [...new Set(frames.map((f) => f.hover))];
  return { label, pointerY: y, distinctTops: tops.length, tops, hoverStates: hovers, settled: tops.length === 1 };
}

const results = [
  await rest('centre', box.y + box.height / 2),
  await rest('bottom row', box.y + box.height - 0.5),
  await rest('just below', box.y + box.height + 0.5),
];
// The walk's click: the pointer rests on the bottom row, and Playwright waits for a
// stable box before it moves to the centre and clicks.
await page.mouse.move(box.x + box.width / 2, box.y + box.height - 0.5);
await page.evaluate(() => { window.__clicks = 0; document.getElementById('go').addEventListener('click', () => { window.__clicks += 1; }); });
let click;
try {
  await go.click({ timeout: 3000 });
  click = `clicked (${await page.evaluate(() => window.__clicks)} click event)`;
} catch (err) {
  const log = String(err.message);
  click = `${log.split('\n')[0]} | ${log.includes('element is not stable') ? 'element is not stable' : log.slice(0, 300)}`;
}
console.info(JSON.stringify({ css: cssPath, button: box, results, click }, null, 1));
await browser.close();
