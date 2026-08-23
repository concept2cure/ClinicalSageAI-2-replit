/**
 * The built stylesheets a captured fragment must be measured against.
 *
 * ── The defect this exists for ───────────────────────────────────────────────
 * Three checks each carried their own `asset(prefix)` helper and each loaded
 * the same four bundles: `index-*`, `V2App-*`, and one of `MdxSurfaceHost-*` /
 * `PdevRoute-*`. The build emits **twenty**. The other sixteen are route
 * chunks — `Insights-*`, `QualityModule-*`, `Rbm-*`, `ana-v2-*`, and so on —
 * and fourteen of them style classes that appear in the captured markup: 239
 * classes in all.
 *
 * So every surface whose CSS had been code-split was measured with part of its
 * stylesheet missing, and nothing said so. `check-surface-styling.mjs` was the
 * one script that could tell: its self-check asserts `.rc-ana` computes to
 * `display:flex`, `.rc-ana` lives in `insights-v2.css`, and that file is in the
 * `Insights-*` chunk. It went to `block`, the script exited 2, and
 * `npm run visual-qa` — the documented entry point — died at step two. The
 * self-check was right. The sheet list was wrong.
 *
 * ── Why every chunk, rather than a surface→chunk map ─────────────────────────
 * The harness has no route table, and a hand-written map from 118 surface ids
 * to bundler-decided chunk names would be wrong the first time a module moved.
 * Loading all of them is a SUPERSET of what any one route serves: a surface
 * gets its own sheet plus rules from routes the user has not visited. That is
 * a real difference and it is stated rather than hidden — it is tolerable here
 * because every v2 rule is `.c2c-v2`-scoped design-system CSS with a per-area
 * prefix (`rc-`, `ae-`, `bs-`, `fc-`, `pe-`), so cross-chunk collision is
 * unlikely and, unlike a missing sheet, would show up as a wrong value rather
 * than as silence.
 *
 * Order is load order: the entry sheet first (design tokens and Tailwind,
 * whose custom properties everything else reads), then the shell, then the
 * route chunks by name so a rebuild produces the same cascade twice.
 *
 * @module scripts/visual-qa/built-css
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSETS = path.join(REPO, 'dist/public/assets');

/** Entry first, then the shell, then everything else by name. */
const RANK = (name) => (name.startsWith('index-') ? 0 : name.startsWith('V2App-') ? 1 : 2);

/**
 * Every built stylesheet, in load order.
 *
 * @param {string} tag log prefix of the calling check
 * @param {{ soft?: boolean }} [opts] `soft` returns [] instead of exiting, for
 *   callers that report the missing build themselves.
 * @returns {{ file: string, path: string, css: string }[]}
 */
export function builtStylesheets(tag, opts = {}) {
  const names = fs.existsSync(ASSETS)
    ? fs.readdirSync(ASSETS).filter((f) => f.endsWith('.css'))
    : [];
  if (!names.some((n) => n.startsWith('index-'))) {
    if (opts.soft) return [];
    console.error(`${tag} no built stylesheet matching index-*.css in dist/public/assets.`);
    console.error(`${tag} Run \`npm run build\` first — these checks read the SHIPPED css, not source.`);
    console.error(`${tag} Measuring against source CSS instead would test a cascade the product never serves.`);
    process.exit(1);
  }
  return names
    .sort((a, b) => RANK(a) - RANK(b) || a.localeCompare(b))
    .map((file) => ({ file, path: path.join(ASSETS, file), css: fs.readFileSync(path.join(ASSETS, file), 'utf8') }));
}

/** The same set as `<style>` elements, ready to drop into a page's `<head>`. */
export function styleTags(sheets) {
  return sheets.map((s) => `<style>${s.css}</style>`).join('\n');
}
