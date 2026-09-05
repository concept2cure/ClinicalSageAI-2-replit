#!/usr/bin/env node
/**
 * [visual-qa:contrast] WCAG 2.2 AA text contrast, measured — not estimated.
 *
 * ── Why this needs a browser ──────────────────────────────────────────────────
 * Enterprise and government buyers ask for a VPAT (an accessibility conformance
 * report) before they sign. Contrast is the single most-cited failure in one,
 * and it is the hardest thing to answer honestly from source, because the
 * rendered colour of a piece of text is the product of the whole cascade: a
 * token defined in `design-system/`, resolved through a `var()` chain, possibly
 * overridden by a nested rule, against a background inherited from an ancestor
 * that may itself be transparent.
 *
 * Reading the stylesheets tells you what the tokens are. Only a browser tells
 * you what the pixels are. This walks the REAL captured markup of every surface
 * under the REAL shipped stylesheets and asks Chromium for the computed colour
 * of each text node and the effective background behind it.
 *
 * ── What it measures ──────────────────────────────────────────────────────────
 * WCAG 2.2 SC 1.4.3 (Contrast, Minimum), AA:
 *   · normal text            >= 4.5:1
 *   · large text             >= 3.0:1   (>= 24px, or >= 18.66px when bold)
 * Ratios use the WCAG relative-luminance formula, on sRGB, exactly as specified.
 *
 * Backgrounds are resolved by walking UP the ancestor chain until an element
 * with a non-transparent background-color is found, which is what the eye does.
 * Alpha compositing is applied when a colour is semi-transparent. An element
 * whose background is an image or gradient is SKIPPED rather than guessed at —
 * reporting a confident number for a case this cannot see would be worse than
 * reporting nothing.
 *
 * ── What it does NOT claim ────────────────────────────────────────────────────
 * This is one success criterion. It is not a VPAT, and passing it does not make
 * the product accessible: keyboard operability, focus order and screen-reader
 * semantics are not visible in static markup, because React's event handlers do
 * not survive serialization. Those need a live app and, ultimately, a human.
 * Said plainly here so the number is not mistaken for a conformance claim.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './playwright.mjs';
import { assertCaptureIsFresh } from './capture-freshness.mjs';
/* The WCAG arithmetic is shared with scripts/ci/check-token-contrast.mjs. It
   used to be transcribed into MEASURE below, because Playwright serialises an
   evaluated function and a serialised function cannot close over an import.
   `browserSource()` resolves that without a second copy: the page is handed
   these exact definitions on `window.__wcag`, so the browser runs the module
   rather than a transcription of it. Two correct copies of one formula is still
   two, and a correction to either would have applied to half the product. */
import { browserSource } from '../lib/wcag.mjs';
import { builtStylesheets, styleTags } from './built-css.mjs';

const TAG = '[visual-qa:contrast]';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARKUP = path.join(REPO, '.visual-qa/markup');

// Every built stylesheet, in load order — see built-css.mjs. A colour measured
// against a partial cascade is a measurement of a page the product never serves.
const STYLES = styleTags(builtStylesheets(TAG));

const page = (markup) =>
  `<!doctype html><html><head><meta charset="utf-8">${STYLES}</head>
<body><div class="c2c-v2 shell">${markup}</div></body></html>`;

/** Runs in the browser. Returns one record per text-bearing element. */
const MEASURE = () => {
  // Injected from scripts/lib/wcag.mjs — see the import note above.
  const { parseRgbString: parse, relativeLuminance: lum, over, contrastRatio } = window.__wcag;

  const out = [];
  const els = document.querySelectorAll('.c2c-v2 *');
  for (const el of els) {
    // Only elements with their OWN visible text — otherwise a wrapper is
    // measured once per descendant and one failure is counted many times.
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim();
    if (!own) continue;

    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;

    const fg = parse(cs.color);
    if (!fg) continue;

    // Effective background: walk up until something is not transparent.
    let bg = null;
    let hitImage = false;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') { hitImage = true; break; }
      const c = parse(s.backgroundColor);
      if (c && c.a > 0) { bg = c.a < 1 ? over(c, { r: 255, g: 255, b: 255, a: 1 }) : c; break; }
    }
    // A gradient or image behind the text: cannot be measured this way, and
    // guessing would be worse than declining.
    if (hitImage) continue;
    if (!bg) bg = { r: 255, g: 255, b: 255, a: 1 };

    const fgc = fg.a < 1 ? over(fg, bg) : fg;
    const ratio = contrastRatio(fgc, bg);

    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (weight >= 700 && size >= 18.66);
    const required = large ? 3.0 : 4.5;

    // WCAG 1.4.3 exempts incidental and purely decorative text. A lone
    // separator glyph between metadata items conveys no information a screen
    // reader would read out, and counting them inflates the failure rate with
    // characters no user needs to perceive. Recorded separately rather than
    // silently dropped, so the exclusion is auditable.
    const decorative = window.__wcag.decorativeText(own);

    // SC 1.4.3 also exempts "text that is part of an inactive user interface
    // component". The `option` inside `<select disabled>` on v2__rbm is the
    // whole of that category today: the UA paints it in its own disabled grey
    // (#808080, 3.75:1) which no stylesheet in this repo chooses, and no
    // token change can move. Counting it made the product's floor a permanent
    // 1 that no fix could clear — a number that cannot reach zero stops being
    // read. `closest` covers the ancestor case, which is the one that matters:
    // an `option` is not itself `:disabled` when its `select` is.
    const inactive = !!el.closest(':disabled, [aria-disabled="true"], fieldset[disabled]');

    out.push({
      decorative,
      inactive,
      text: own.slice(0, 48),
      selector: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
      color: cs.color,
      background: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
      fontSize: size,
      ratio: Math.round(ratio * 100) / 100,
      required,
      pass: ratio >= required,
    });
  }
  return out;
};

const files = fs.existsSync(MARKUP)
  ? fs.readdirSync(MARKUP).filter((f) => f.endsWith('.html')).sort()
  : [];
if (files.length === 0) {
  console.error(`${TAG} no captured markup in .visual-qa/markup — run the capture specs first.`);
  process.exit(1);
}

assertCaptureIsFresh(TAG, MARKUP, REPO);

const browser = await launchChromium();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
/* Runs on every document this context creates, so MEASURE always finds it. */
await ctx.addInitScript({ content: browserSource() });

// Prove the measurement before trusting it: known-black on known-white is 21:1.
{
  const p = await ctx.newPage();
  await p.setContent(
    '<div class="c2c-v2 shell" style="background:#fff"><span style="color:#000;font-size:16px">probe</span></div>',
    { waitUntil: 'load' },
  );
  const [probe] = await p.evaluate(MEASURE);
  await p.close();
  if (!probe || Math.abs(probe.ratio - 21) > 0.5) {
    console.error(`${TAG} SELF-CHECK FAILED — black on white measured ${probe?.ratio}, expected 21.`);
    console.error(`${TAG} The luminance maths or the background walk is wrong; the numbers below`);
    console.error(`${TAG} would be meaningless. Fix the harness before reading anything.`);
    await browser.close();
    process.exit(2);
  }
  console.log(`${TAG} self-check OK — black on white measures ${probe.ratio}:1.`);
}

const bySurface = [];
let totalChecked = 0;
let totalFailed = 0;
let decorativeFailures = 0;
let inactiveFailures = 0;
const byPair = new Map();
const worst = [];

for (const file of files) {
  const name = file.replace(/\.html$/, '');
  const markup = fs.readFileSync(path.join(MARKUP, file), 'utf8');
  const p = await ctx.newPage();
  await p.setContent(page(markup), { waitUntil: 'load' });
  const rows = await p.evaluate(MEASURE);
  await p.close();

  const meaningful = rows.filter((r) => !r.decorative && !r.inactive);
  const failed = meaningful.filter((r) => !r.pass);
  decorativeFailures += rows.filter((r) => r.decorative && !r.pass).length;
  inactiveFailures += rows.filter((r) => !r.decorative && r.inactive && !r.pass).length;
  totalChecked += meaningful.length;
  totalFailed += failed.length;
  for (const r of failed) {
    const key = `${r.color} on ${r.background}`;
    byPair.set(key, (byPair.get(key) ?? 0) + 1);
  }
  if (failed.length) {
    bySurface.push({ name, checked: rows.length, failed: failed.length });
    for (const f of failed) worst.push({ surface: name, ...f });
  }
}

await browser.close();

worst.sort((a, b) => a.ratio - b.ratio);

console.log(
  `\n${TAG} ${files.length} surfaces · ${totalChecked} text elements measured · ` +
    `${totalFailed} below WCAG 2.2 AA (${totalChecked ? ((totalFailed / totalChecked) * 100).toFixed(1) : '0.0'}%).\n`,
);

console.log(
  `  (${decorativeFailures} additional low-contrast elements were lone separator glyphs — ` +
    `excluded as decorative per WCAG 1.4.3.\n` +
    `   ${inactiveFailures} were text inside a disabled control — excluded as an inactive ` +
    `user interface component, same clause.)\n`,
);

if (byPair.size) {
  console.log('  BY COLOUR PAIR — the actionable view. One token fixed clears every row:');
  for (const [pair, n] of [...byPair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`    ${String(n).padStart(5)}  ${pair}`);
  }
  console.log('');
}

if (bySurface.length) {
  console.log('  surfaces with failures (worst first):');
  for (const s of bySurface.sort((a, b) => b.failed - a.failed).slice(0, 20)) {
    console.log(`    ${String(s.failed).padStart(4)} / ${String(s.checked).padEnd(5)} ${s.name}`);
  }
  console.log('\n  the 20 lowest ratios anywhere:');
  for (const w of worst.slice(0, 20)) {
    console.log(
      `    ${String(w.ratio).padStart(6)}:1 (needs ${w.required}) ${w.color} on ${w.background} ` +
        `${w.fontSize}px  ${w.selector}  "${w.text}"  [${w.surface}]`,
    );
  }
} else {
  console.log('  No text below AA on any measured surface.');
}

console.log(
  `\n${TAG} Scope: SC 1.4.3 contrast only, on static captured markup. Keyboard\n` +
    `${TAG} operability, focus order and screen-reader semantics are NOT covered —\n` +
    `${TAG} React handlers do not survive serialization. This is evidence toward a\n` +
    `${TAG} VPAT, not a conformance claim.`,
);
