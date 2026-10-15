// Renders two .de-field.half fields after N preceding divs, with the real
// journey-v2.css, and measures the gap between them. Usage: node measure.mjs <css>
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((p) => fs.existsSync(p));
const css = fs.readFileSync(process.argv[2], 'utf8');
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
const results = [];
for (const before of [0, 1, 2, 3]) {
  const pre = Array.from({ length: before }, () => '<div class="de-field">x</div>').join('');
  await page.setContent(`<style>${css}</style><div class="c2c-v2"><div class="de-body" style="width:500px">${pre}
    <div class="de-field half" id="a"><label>A</label><input style="width:100%"></div><div class="de-field half" id="b"><label>B</label><input style="width:100%"><div>hint line</div></div></div></div>`);
  const r = await page.evaluate(() => {
    const a = document.getElementById('a').getBoundingClientRect(); const b = document.getElementById('b').getBoundingClientRect();
    return { sameRow: Math.abs(a.top - b.top) < 1, gap: Math.round(b.left - a.right) };
  });
  results.push({ precedingDivs: before, ...r });
}
console.info(JSON.stringify(results));
const bad = results.filter((r) => !r.sameRow || r.gap !== 12);
console.info(bad.length ? `FAIL: ${bad.length} of ${results.length} layouts do not pair with a 12px gap` : `PASS: all ${results.length} layouts pair with a 12px gap`);
await browser.close();
process.exit(bad.length ? 1 : 0);
