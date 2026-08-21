#!/usr/bin/env node
/**
 * WHY the contrast failures, not how many.
 *
 * `check-contrast.mjs` reports one number — most recently 1819 of 4151 text
 * elements below WCAG 2.2 AA, 43.8%. That number is correct and almost
 * unactionable: it says the product has a contrast problem without saying
 * whether it has one problem or four hundred. This groups the same failures by
 * what causes them.
 *
 * The answer is concentrated. Two token values account for ~90% of every
 * failure measured, and the largest of them is a token the contrast gate
 * deliberately permits:
 *
 *   --text-400 (#8a8880)   1202 failures   68.5%
 *   --accent-200 (#c96442)  371 failures   21.1%
 *
 * `ci:token-contrast` stays green over both, because it carries them as
 * documented exceptions SCOPED TO LARGE TEXT (>=18.66px bold or >=24px, where
 * SC 1.4.3 asks 3:1 rather than 4.5:1). Measured against what the product
 * actually renders, exactly ONE failing element — 0.1% — is in that size range.
 * The exception covers essentially nothing and permits essentially everything:
 * the hole is shaped precisely like the thing the exception allows.
 *
 * ── Reporting, not gating ────────────────────────────────────────────────────
 * This exits 0 whatever it finds. It is a diagnostic for deciding what to fix,
 * and turning it into a gate would duplicate `check-contrast.mjs` rather than
 * inform it.
 *
 * ── What its numbers are, and are not ────────────────────────────────────────
 * They will not match `check-contrast.mjs` exactly: this counts only elements
 * with their own non-empty text node and a non-zero box (3937 here against that
 * check's 4151), so its totals run slightly lower. Colours it cannot parse are
 * counted as unmeasurable and reported, never silently dropped — an earlier
 * draft used `parseColor` (hex and oklch) on `getComputedStyle` output (`rgb()`
 * strings), got null for every element, and reported ZERO failures against a
 * gate saying 1819. A disagreement that size is the analysis being wrong.
 *
 * Usage:  npm run visual-qa:contrast-why      (after capture + build)
 *
 * @module scripts/visual-qa/contrast-breakdown
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './playwright.mjs';
import { builtStylesheets, styleTags } from './built-css.mjs';
import { contrastRatio, parseRgbString, over, decorativeText } from '../lib/wcag.mjs';

const TAG = '[visual-qa:contrast-why]';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARKUP = path.join(REPO, '.visual-qa/markup');

const files = fs.existsSync(MARKUP)
  ? fs.readdirSync(MARKUP).filter((f) => f.endsWith('.html')).sort()
  : [];
if (files.length === 0) {
  console.error(`${TAG} no captured markup — run \`npm run visual-qa:capture\` first.`);
  process.exit(1);
}

const sheets = builtStylesheets(TAG);
const page = (markup) =>
  `<!doctype html><html><head><meta charset="utf-8">${styleTags(sheets)}</head>` +
  `<body><div class="c2c-v2 shell">${markup}</div></body></html>`;

/** Runs in the browser: one record per element that paints its own text. */
const MEASURE = () => {
  const out = [];
  document.querySelectorAll('.c2c-v2 *').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (!own) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const cs = getComputedStyle(el);
    // Walk up for the painted background: a transparent element shows its
    // ancestor's, which is what the eye actually compares the text against.
    let bgEl = el, bg = cs.backgroundColor;
    while (bgEl && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
      bgEl = bgEl.parentElement;
      if (!bgEl) break;
      bg = getComputedStyle(bgEl).backgroundColor;
    }
    out.push({ fg: cs.color, bg: bg || 'rgb(255, 255, 255)', size: parseFloat(cs.fontSize), weight: cs.fontWeight, text: own });
  });
  return out;
};

const browser = await launchChromium();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();

const pairs = new Map();
const byFg = new Map();
let total = 0, unmeasurable = 0, fails = 0, largeFails = 0, decorative = 0;

for (const file of files) {
  await p.setContent(page(fs.readFileSync(path.join(MARKUP, file), 'utf8')), { waitUntil: 'load' });
  for (const r of await p.evaluate(MEASURE)) {
    total++;
    const fg = parseRgbString(r.fg);
    const bg = parseRgbString(r.bg);
    if (!fg || !bg) { unmeasurable++; continue; }
    const ratio = contrastRatio(fg.a != null && fg.a < 1 ? over(fg, bg) : fg, bg);
    // SC 1.4.3: large text is >=24px, or >=18.66px at 700+.
    const large = r.size >= 24 || (r.size >= 18.66 && Number(r.weight) >= 700);
    const need = large ? 3 : 4.5;
    if (ratio + 0.01 >= need) continue;
    // Same SC 1.4.3 exemption the gate applies, from the same definition.
    // Without it this tool counted lone separator glyphs — which are the
    // lightest text on any surface — and reported them against whichever token
    // happened to colour them, sending the reader to fix a token with no
    // failures. It disagreed with `visual-qa:contrast` by about thirty.
    if (decorativeText(r.text)) { decorative++; continue; }
    fails++;
    if (r.size >= 18.66) largeFails++;
    const key = `${r.fg} on ${r.bg} @${r.size}px`;
    const g = pairs.get(key) || { n: 0, ratio, need };
    g.n++;
    pairs.set(key, g);
    byFg.set(r.fg, (byFg.get(r.fg) || 0) + 1);
  }
}
await ctx.close();
await browser.close();

console.log(`${TAG} ${files.length} fragments · ${total} text elements · ${unmeasurable} unmeasurable · ${decorative} decorative (SC 1.4.3) · ${fails} below AA`);

console.log(`\n${TAG} worst pairs:`);
const top = [...pairs.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12);
for (const [k, g] of top) {
  console.log(`  ${String(g.n).padStart(5)}  ${k}  ${g.ratio.toFixed(2)}:1 (needs ${g.need})`);
}
const cover = top.reduce((s, [, g]) => s + g.n, 0);
console.log(`  top ${top.length} pairs cover ${cover} of ${fails} (${(100 * cover / fails).toFixed(1)}%)`);

console.log(`\n${TAG} by foreground colour:`);
for (const [c, n] of [...byFg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
  console.log(`  ${String(n).padStart(5)}  ${c}  ${(100 * n / fails).toFixed(1)}%`);
}

console.log(
  `\n${TAG} failures at >=18.66px, the range the token gate's exceptions are scoped to: ` +
    `${largeFails} (${(100 * largeFails / fails).toFixed(1)}%)`,
);
