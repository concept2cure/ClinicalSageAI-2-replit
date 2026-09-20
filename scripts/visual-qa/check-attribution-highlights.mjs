#!/usr/bin/env node
/**
 * Does the inline attribution highlighting actually paint, and is the text
 * still readable through it? (ledger L179, Phase 6a)
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * `useAttributionHighlights` is covered by unit tests, but jsdom has no CSS
 * Custom Highlight API: those tests can only check WHICH ranges are handed to
 * which registry. Whether `::highlight(attribution-source)` renders at all, and
 * what it does to the contrast of regulated text underneath it, is not
 * something they can see — and the feature shipped with that gap stated rather
 * than closed. This closes it.
 *
 * Two questions, answered differently on purpose:
 *
 *   DOES IT PAINT?  Empirically. The same text is screenshotted with and
 *                   without the highlight applied; identical bytes mean the
 *                   rule did not render, which is what a typo in a registry
 *                   name or an unsupported selector looks like.
 *
 *   IS IT LEGIBLE?  Arithmetically, with the repo's own WCAG module rather than
 *                   a second copy of the formula — the declared wash composited
 *                   over the REAL computed background of the surface, against
 *                   the REAL computed text colour. A wash that drops regulated
 *                   prose below AA is an accessibility regression dressed as a
 *                   feature.
 *
 * ── NOT CI, ON PURPOSE ───────────────────────────────────────────────────────
 * Playwright is deliberately not a dependency of this repo (see playwright.mjs).
 * This is an on-demand audit, like its siblings here, and it explains itself
 * rather than throwing when the browser is absent.
 *
 * Usage: node scripts/visual-qa/check-attribution-highlights.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './playwright.mjs';
import { browserSource } from '../lib/wcag.mjs';

const TAG = '[visual-qa:attribution-highlights]';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CSS_PATH = path.join(REPO, 'client/src/concept2cure/lineage/attribution-highlights.css');
const HOOK_PATH = path.join(REPO, 'client/src/concept2cure/lineage/useAttributionHighlights.ts');

/** WCAG AA for normal-size body text. */
const AA_NORMAL = 4.5;

/**
 * The names each side uses, read from BOTH files.
 *
 * Reading them from the CSS alone looked right and was useless: rename a rule
 * and the script simply checks the renamed rule, reports it paints, and exits 0
 * while the hook sets a name nothing styles. (Found by trying to make this
 * script fail — it did not.) A highlight that silently stops painting is
 * indistinguishable from a document with nothing to attribute, so the drift
 * itself has to be the finding.
 */
function cssNames(css) {
  return [...css.matchAll(/::highlight\(([a-z-]+)\)/g)].map((m) => m[1]);
}

/** The values of the hook's REGISTRY map — the names actually handed to CSS.highlights. */
function hookNames(hook) {
  const block = hook.match(/const REGISTRY = \{([\s\S]*?)\}\s*as const;/);
  if (!block) return [];
  return [...block[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
}

/** The background-color each rule declares, so the composite is the real one. */
function washFor(css, name) {
  const block = css.match(new RegExp(`::highlight\\(${name}\\)\\s*\\{([^}]*)\\}`));
  if (!block) return null;
  const decl = block[1].match(/background-color:\s*([^;]+);/);
  return decl ? decl[1].trim() : null;
}

const css = fs.readFileSync(CSS_PATH, 'utf8');
const hook = fs.readFileSync(HOOK_PATH, 'utf8');
const names = cssNames(css);
const declared = hookNames(hook);

if (names.length === 0) {
  console.error(`${TAG} no ::highlight() rules found in ${path.relative(REPO, CSS_PATH)}`);
  process.exit(1);
}
if (declared.length === 0) {
  console.error(`${TAG} could not read the REGISTRY map from ${path.relative(REPO, HOOK_PATH)}`);
  process.exit(1);
}

// Styled-but-never-set is dead CSS; set-but-never-styled paints nothing at all.
const unstyled = declared.filter((n) => !names.includes(n));
const unused = names.filter((n) => !declared.includes(n));
if (unstyled.length || unused.length) {
  console.error(`${TAG} the CSS and the hook disagree about highlight names:`);
  for (const n of unstyled) {
    console.error(`  ✗ the hook sets '${n}', and no ::highlight(${n}) rule styles it — it paints nothing`);
  }
  for (const n of unused) {
    console.error(`  ✗ ::highlight(${n}) is styled, and the hook never sets it — dead rule`);
  }
  process.exit(1);
}

/* The surface these sit on: the editor's own background and body ink. Taken
   from the same tokens the product sets, so the measurement is of the page the
   product serves rather than of a white rectangle. */
const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  :root { --text-100: #141413; --text-400: #6b6a65; --border: #e5e3dc; --bg-000: #ffffff; }
  body { margin: 0; background: var(--bg-000); color: var(--text-100);
         font: 16px/1.6 system-ui, sans-serif; }
  #doc { padding: 24px; width: 640px; }
${css}
</style></head>
<body><div id="doc"><p id="p">The primary endpoint was met at week twenty-four in the intent-to-treat population.</p></div></body></html>`;

const browser = await launchChromium();
const context = await browser.newContext({ deviceScaleFactor: 1 });

await context.addInitScript({ content: browserSource() });
const page = await context.newPage();
await page.setContent(PAGE, { waitUntil: 'load' });

const supported = await page.evaluate(
  () => typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight === 'function',
);
if (!supported) {
  console.error(`${TAG} this Chromium has no CSS Custom Highlight API, so nothing could be`);
  console.error(`${TAG} verified. That is a refusal, not a pass.`);
  await browser.close();
  process.exit(1);
}

const target = page.locator('#p');
const clean = await target.screenshot();

const failures = [];
const rows = [];

for (const name of names) {
  // Paint the whole paragraph with this one rule.
  await page.evaluate((highlightName) => {
    CSS.highlights.clear();
    const node = document.getElementById('p').firstChild;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, node.data.length);
    CSS.highlights.set(highlightName, new Highlight(range));
  }, name);

  const painted = await target.screenshot();
  const rendered = !painted.equals(clean);

  // The declared wash, composited over the surface's real computed background,
  // measured against its real computed text colour — using the repo's module.
  const wash = washFor(css, name);
  const ratio = await page.evaluate(
    ({ washColour }) => {
      const { parseRgbString, over, contrastRatio } = window.__wcag;
      const el = document.getElementById('p');
      const cs = getComputedStyle(el);
      const base = parseRgbString(getComputedStyle(document.body).backgroundColor);
      const ink = parseRgbString(cs.color);
      if (!washColour) return null;
      // A probe element resolves the declared colour to rgb() the same way the
      // browser would when painting it.
      const probe = document.createElement('span');
      probe.style.color = washColour;
      document.body.appendChild(probe);
      const resolved = parseRgbString(getComputedStyle(probe).color);
      probe.remove();
      if (!resolved || !base || !ink) return null;
      return contrastRatio(ink, over(resolved, base));
    },
    { washColour: wash },
  );

  rows.push({ name, rendered, ratio });
  if (!rendered) {
    failures.push(`${name}: the rule rendered nothing — the selector or the registry name is wrong`);
  }
  if (ratio !== null && ratio < AA_NORMAL) {
    failures.push(
      `${name}: body text over this wash measures ${ratio.toFixed(2)}:1, below AA ${AA_NORMAL}:1`,
    );
  }
}

await browser.close();

console.log(`${TAG} ${rows.length} highlight rule(s), in real Chromium:`);
for (const r of rows) {
  const ratio = r.ratio === null ? '   —  ' : `${r.ratio.toFixed(2)}:1`;
  console.log(`    ${r.rendered ? 'paints' : 'NOTHING'}  ${ratio}  ::highlight(${r.name})`);
}

if (failures.length) {
  console.error(`\n${TAG} ${failures.length} problem(s):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`${TAG} OK — every rule paints, and body text stays at or above AA through each wash.`);
