#!/usr/bin/env node
/**
 * Does anything spill sideways out of the box it is given?
 *
 * ── The defect this exists for ───────────────────────────────────────────────
 * A fix to AnA's work record moved a failure sentence onto its own line with
 * `flex-basis:100%` and an 18px `margin-left`. That is 100% PLUS 18px. At the
 * width the component actually gets — `--ana: 380px` less 12px of `.ana-body`
 * padding a side, so 356px — the step row measured 361px inside a 343px box and
 * the rail scrolled horizontally.
 *
 * Nothing caught it. 2,153 tests passed, every CSS gate passed, CI went green,
 * and the commit shipped. jsdom parses the cascade but does not lay it out, so
 * `getByText` returns the same answer whether an element fits or overflows; the
 * design gates read stylesheets as text and cannot know what 100% resolves to.
 * Only a browser at the right width can answer this, which is what this does.
 *
 * ── Why the width matters more than the check ────────────────────────────────
 * The defect was in fact "verified" before it shipped — by rendering the
 * component at 460px, where it fits. A layout inspected at a width it never
 * receives is not inspected. So every fragment is measured at the width its own
 * capture declares in `_viewports.json`, and a fragment with no declared width
 * is measured at the desktop viewport the surface captures assume.
 *
 * ── Ratchet, not a cliff ─────────────────────────────────────────────────────
 * Run over captured surfaces this will find pre-existing overflows that are not
 * this change's to fix. The baseline records what was already true; the check
 * fails only on a COUNT above it, and prints anything new by name. A baseline
 * that shrinks is written back on --write-baseline, so the number can fall and
 * never silently rise.
 *
 * Usage:
 *   npm run visual-qa:overflow
 *   npm run visual-qa:overflow -- --write-baseline
 *
 * @module scripts/visual-qa/check-overflow
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './playwright.mjs';

const TAG = '[visual-qa:overflow]';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARKUP = path.join(REPO, '.visual-qa/markup');
const ASSETS = path.join(REPO, 'dist/public/assets');
const BASELINE = path.join(REPO, 'scripts/visual-qa/overflow-baseline.json');

/** Width used for fragments whose capture declared none (the surface captures). */
const DESKTOP = 1440;
/** Sub-pixel rounding: a 0.5px difference is layout noise, not a defect. */
const TOLERANCE = 1;

const WRITE = process.argv.includes('--write-baseline');

function asset(prefix) {
  if (!fs.existsSync(ASSETS)) return '';
  const f = fs.readdirSync(ASSETS).find((n) => n.startsWith(prefix) && n.endsWith('.css'));
  return f ? fs.readFileSync(path.join(ASSETS, f), 'utf8') : '';
}

const ENTRY = asset('index-');
const V2 = asset('V2App-');

const pageFor = (markup) =>
  `<!doctype html><html><head><meta charset="utf-8">` +
  `<style>${ENTRY}</style><style>${V2}</style>` +
  // The measured box is the fragment's own width and nothing wider, so a
  // fragment cannot be rescued by a viewport it will never have.
  `<style>html,body{margin:0;padding:0}#box{overflow:hidden}</style>` +
  `</head><body><div id="box">${markup}</div></body></html>`;

/**
 * Runs in the browser. An element overflows when its content is wider than its
 * own box. SR-only regions are excluded by rule, not by accident: the standard
 * clip technique gives them a 1px box on purpose, so text wider than that is
 * the technique working rather than a layout failure.
 */
const MEASURE = (tolerance) => {
  const out = [];
  const srOnly = (el) => {
    const cs = getComputedStyle(el);
    return (
      (el.clientWidth <= 1 && el.clientHeight <= 1) ||
      cs.clip === 'rect(0px, 0px, 0px, 0px)' ||
      cs.clipPath === 'inset(50%)'
    );
  };
  document.querySelectorAll('#box *').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    if (srOnly(el)) return;
    if (el.scrollWidth > el.clientWidth + tolerance) {
      const cs = getComputedStyle(el);
      // An element that scrolls on purpose is not overflowing its box.
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return;
      const cls = String(el.getAttribute('class') || '').trim().split(/\s+/).slice(0, 3).join('.');
      out.push({
        selector: `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      });
    }
  });
  return out;
};

const files = fs.existsSync(MARKUP)
  ? fs.readdirSync(MARKUP).filter((f) => f.endsWith('.html')).sort()
  : [];
if (files.length === 0) {
  console.error(`${TAG} no captured markup in .visual-qa/markup — run \`npm run visual-qa:capture\` first.`);
  process.exit(1);
}
if (!ENTRY && !V2) {
  console.error(`${TAG} no built CSS in dist/public/assets — run \`npm run build\` first.`);
  console.error(`${TAG} Measuring against source CSS instead would test a cascade the product never serves.`);
  process.exit(1);
}

const viewports = fs.existsSync(path.join(MARKUP, '_viewports.json'))
  ? JSON.parse(fs.readFileSync(path.join(MARKUP, '_viewports.json'), 'utf8'))
  : {};

const browser = await launchChromium();
const findings = [];

for (const file of files) {
  const width = viewports[file] ?? DESKTOP;
  const ctx = await browser.newContext({ viewport: { width: Math.max(width, 320), height: 900 } });
  const p = await ctx.newPage();
  await p.setContent(pageFor(fs.readFileSync(path.join(MARKUP, file), 'utf8')), { waitUntil: 'load' });
  await p.evaluate((w) => { document.getElementById('box').style.width = `${w}px`; }, width);
  // Open every disclosure: a record nobody expanded hides most of its rows.
  for (const t of await p.locator('[aria-expanded="false"]').all()) {
    await t.click().catch(() => {});
  }
  const hits = await p.evaluate(MEASURE, TOLERANCE);
  for (const h of hits) findings.push({ file, width, ...h });
  await ctx.close();
}
await browser.close();

const baseline = fs.existsSync(BASELINE)
  ? JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  : { count: 0, known: [] };

const key = (f) => `${f.file} ${f.selector}`;
const known = new Set(baseline.known ?? []);
const fresh = findings.filter((f) => !known.has(key(f)));

console.log(`${TAG} ${files.length} fragment(s) measured · ${findings.length} overflowing · baseline ${baseline.count}`);
for (const f of findings) {
  const mark = known.has(key(f)) ? ' ' : '+';
  console.log(`  ${mark} ${f.file} @${f.width}px  ${f.selector}  ${f.scrollWidth} > ${f.clientWidth}`);
}

if (WRITE) {
  const next = { count: findings.length, known: [...new Set(findings.map(key))].sort() };
  fs.writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n', 'utf8');
  console.log(`${TAG} baseline written: ${next.count}`);
  process.exit(0);
}

if (fresh.length > 0 || findings.length > baseline.count) {
  console.error(`\n${TAG} FAILED — ${fresh.length} new overflow(s), ${findings.length} total against a baseline of ${baseline.count}.`);
  console.error(`${TAG} An element wider than its own box makes the column scroll sideways.`);
  console.error(`${TAG} If this is deliberate, give the element its own overflow-x rule rather than baselining it.`);
  process.exit(1);
}
if (findings.length < baseline.count) {
  console.log(`${TAG} OK — and ${baseline.count - findings.length} fewer than the baseline. Re-run with --write-baseline to lower it.`);
  process.exit(0);
}
console.log(`${TAG} OK — nothing overflows its box beyond the recorded baseline.`);
