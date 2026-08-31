#!/usr/bin/env node
/**
 * Measure the surface-scoped text ramp in a real browser (GA ledger L102).
 *
 * The values in generate-surface-text-ramp.mjs are COMPUTED. This asks Chromium
 * what it actually resolves, because a cascade that should work and a cascade
 * that does are different claims — and the first version of this probe proved
 * the point by inventing three class names, failing, and being wrong itself.
 *
 * Needs playwright + a Chromium at PLAYWRIGHT_BROWSERS_PATH; skipped in CI
 * where those are absent, which is why it is a probe and not a gate.
 */
import { launchChromium } from './playwright.mjs';
import { contrastRatio, parseRgbString } from '../lib/wcag.mjs';
import fs from 'node:fs';

const palette = fs.readFileSync('design-system/colors_and_type.css', 'utf8');
const ramp    = fs.readFileSync('client/src/concept2cure/v2/styles/surface-text-ramp.css', 'utf8');

/* Real selectors taken from the generated sheet, one per tier. */
/* REAL selectors, taken from the generated sheet — an earlier version of this
   probe invented three class names, which the ramp correctly did not cover, and
   the measurement dutifully reported failure. The probe was wrong. */
const cases = [
  ['--bg-050', '.ac-empty',    'background: var(--bg-050)'],
  ['--bg-100', '.ac-rec-mod',  'background: var(--bg-100)'],
  ['--bg-200', '.ac-exec-bar', 'background: var(--bg-200)'],
];

const html = `<!doctype html><html><head><style>
${palette}
${cases.map(([, sel, bg]) => `${sel}{${bg};}`).join('\n')}
${ramp}
</style></head><body>
${cases.map(([, sel]) => `<div class="${sel.slice(1)}"><span class="probe">Muted text</span></div>`).join('')}
</body></html>`;

const browser = await launchChromium();
const page = await (await browser.newContext()).newPage();
await page.setContent(html);

const out = await page.evaluate(() => {
  const res = [];
  for (const el of document.querySelectorAll('.probe')) {
    const parent = el.parentElement;
    const cs = getComputedStyle(el);
    const ps = getComputedStyle(parent);
    res.push({
      surface: parent.className,
      bg: ps.backgroundColor,
      t400: cs.getPropertyValue('--text-400').trim(),
      t300: cs.getPropertyValue('--text-300').trim(),
    });
  }
  return res;
});
await browser.close();

console.log('MEASURED IN CHROMIUM — the ramp as the browser actually resolves it\n');
let bad = 0;
for (const r of out) {
  const bg = parseRgbString(r.bg);
  const f4 = parseRgbString(`rgb(${parseInt(r.t400.slice(1,3),16)}, ${parseInt(r.t400.slice(3,5),16)}, ${parseInt(r.t400.slice(5,7),16)})`);
  const f3 = parseRgbString(`rgb(${parseInt(r.t300.slice(1,3),16)}, ${parseInt(r.t300.slice(3,5),16)}, ${parseInt(r.t300.slice(5,7),16)})`);
  const c4 = contrastRatio(f4, bg), c3 = contrastRatio(f3, bg);
  const ok = c4 >= 4.5 && c3 >= 4.5;
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} .${r.surface.padEnd(10)} bg=${r.bg.padEnd(20)} --text-400=${r.t400} ${c4.toFixed(2)}:1   --text-300=${r.t300} ${c3.toFixed(2)}:1   step=${contrastRatio(f4,f3).toFixed(3)}`);
}
process.exit(bad ? 1 : 0);
