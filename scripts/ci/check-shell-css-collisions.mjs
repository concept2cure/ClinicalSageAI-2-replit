#!/usr/bin/env node
/**
 * CI Guard: cross-shell CSS collisions.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The product ships three shell trees — v2/, mdx/ and pdev/ — each with its own
 * stylesheets, and Vite emits each as a separate async CSS chunk. The runtime
 * loader appends those chunks with `document.head.appendChild(link)` and never
 * removes them; there is no removeChild or .remove() anywhere in the preload
 * helper. A stylesheet loaded when the user visits one shell therefore stays in
 * the document for the rest of the session.
 *
 * That is harmless while each tree keeps to its own namespace. It is not
 * harmless for the 281 class names this gate finds defined in more than one
 * tree. Four of them, with the conflicting declarations read out of the built
 * CSS chunks rather than inferred from source:
 *
 *     .small     v2 font-size:12px           pdev font-size:11px
 *     .ico       v2 --text-400, 17px         pdev --accent-100
 *     .primary   v2 border-color:transparent  pdev 1px solid --accent-100
 *     .ghost     v2 background only           pdev + colour + border
 *
 * Same specificity, so the chunk that loaded LAST wins — for the whole page.
 * Visit pdev once and the v2 shell renders differently afterwards, until a hard
 * reload. It is order-dependent and only appears after cross-shell navigation,
 * which is why ordinary testing never surfaces it.
 *
 * ── What the distribution says ────────────────────────────────────────────────
 * 264 of the 281 are v2↔mdx. Two files account for most of it:
 * v2/styles/pathway-core-v2.css and mdx/pathway-tabs.css share 100 of 101
 * classes — 99%, which is a fork rather than a collision. The rest cluster on
 * the .ana-* family, because the AnA chat panel is implemented three times
 * (v2/Shell.tsx, mdx/shell/AnaRail.tsx, pdev/shell/AnaDock.tsx). "One shell,
 * one composer" is the stated law; this file measures the distance from it.
 *
 * ── What this gate does, and deliberately does not ────────────────────────────
 * It does NOT change a rendered pixel, and it does not try to fix the 281.
 * Several of these styles are settled product-owner decisions, and a sweeping
 * rename would be a large uncontrolled visual change made by a linter.
 *
 * It freezes the blast radius. The baseline may only SHRINK. A new generic class
 * shared across two shell trees fails the build with the two files named.
 *
 * The real repair is shell convergence: one shell, one stylesheet, no second
 * chunk to collide with. Until then the number this prints is the outstanding
 * debt, and it can only go down.
 *
 * Usage:
 *   node scripts/ci/check-shell-css-collisions.mjs
 *   node scripts/ci/check-shell-css-collisions.mjs --list
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE_FILE = path.join(repoRoot, 'scripts/ci/shell-css-collisions-baseline.json');

/** Each shell tree Vite emits as its own CSS chunk. */
const SHELL_TREES = {
  v2: 'client/src/concept2cure/v2',
  mdx: 'client/src/concept2cure/mdx',
  pdev: 'client/src/concept2cure/pdev',
};

/**
 * Root classes that confine a rule to one shell's subtree. A selector whose
 * FIRST compound carries one of these can only ever match inside that shell, so
 * it cannot collide with another shell no matter what class names follow it.
 */
const SHELL_ROOTS = ['mdx-shell', 'pdev-shell', 'c2c-v2', 'qms-shell'];

/**
 * Class names a stylesheet can apply OUTSIDE its own shell.
 *
 * The first version of this collected every class appearing anywhere in a
 * selector, which is a different question and the wrong one. Under it,
 * `.mdx-shell .rail` still counted as "defining .rail" — so scoping the whole
 * MDX sheet moved the number from 281 to 280 and the gate would have reported a
 * completed fix as no progress. A rule that cannot match outside its shell is
 * not a collision; only an unscoped selector is.
 */
function definedClasses(css) {
  // Strip comments first so a commented-out rule cannot contribute.
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found = new Set();

  // Selector lists live before each `{`. Split on commas and judge each one.
  //
  // The bounding `\s*` groups the first version had — `(^|[};])\s*([^{}@;]+?)\s*\{`
  // — are ambiguous with the `[^{}@;]+?` between them, since that class matches
  // whitespace too. A run of spaces could be split between the three in
  // quadratically many ways, which is the shape a polynomial-backtracking
  // scanner flags. The trimming they were there for is done by `.trim()` on the
  // next line anyway, so they are simply gone: one greedy class, no ambiguity,
  // identical output. (Verified: the collision count is unchanged at 23.)
  const RULE = /(^|[};])([^{}@;]+)\{/g;
  let m;
  while ((m = RULE.exec(body)) !== null) {
    for (const sel of m[2].split(',')) {
      const s = sel.trim();
      if (!s || s.startsWith('@') || /^\d|^from$|^to$/.test(s)) continue; // keyframe stops

      // Confined if ANY compound on the ancestor chain is a shell root, not
      // only the first. The first version looked at the first compound alone,
      // so `[data-theme="dark"] .mdx-shell .x` — which can only ever match
      // inside the mdx shell — was read as mdx defining `.x` page-wide, while
      // the light-mode twin `.mdx-shell .x` was correctly skipped. The
      // generated surface-text-ramp sheets emit exactly that dark-mode shape
      // (`[data-theme="dark"] :is(.mdx-shell .a, .mdx-shell .b, …)`), and
      // after the comma split above the FIRST alternative of every such list
      // begins with the theme attribute rather than the root. A leading
      // `:is(` / `:where(` wrapper is stripped before the comparison for the
      // same reason; `:not(` is deliberately NOT stripped — `:not(.mdx-shell)`
      // is the opposite of confinement.
      // A compound may carry the wrapper mid-token (`[data-theme="dark"]:is(.mdx-shell`),
      // so each compound is split on the wrapper and every piece is judged.
      const compounds = s
        .split(/[\s>+~]+/)
        .flatMap((c) => c.split(/:(?:is|where)\(/));
      const scoped = compounds.some((compound) =>
        SHELL_ROOTS.some(
          (r) => compound === `.${r}` || compound.startsWith(`.${r}.`) ||
                 compound.startsWith(`.${r}[`) || compound.startsWith(`.${r}:`),
        ),
      );
      if (scoped) continue; // confined to one shell — cannot leak

      const CLS = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g;
      let c;
      while ((c = CLS.exec(s)) !== null) found.add(c[1]);
    }
  }
  return found;
}

function cssFiles(dir) {
  const abs = path.join(repoRoot, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.css')) {
      out.push(path.join(entry.parentPath ?? entry.path, entry.name));
    }
  }
  return out;
}

// class -> Map(shell -> Set(file))
const origin = new Map();
for (const [shell, dir] of Object.entries(SHELL_TREES)) {
  for (const file of cssFiles(dir)) {
    const rel = path.relative(repoRoot, file);
    for (const cls of definedClasses(fs.readFileSync(file, 'utf8'))) {
      if (!origin.has(cls)) origin.set(cls, new Map());
      const byShell = origin.get(cls);
      if (!byShell.has(shell)) byShell.set(shell, new Set());
      byShell.get(shell).add(rel);
    }
  }
}

const collisions = [...origin.entries()]
  .filter(([, byShell]) => byShell.size > 1)
  .map(([cls, byShell]) => ({ cls, shells: [...byShell.keys()].sort(), byShell }))
  .sort((a, b) => a.cls.localeCompare(b.cls));

if (!fs.existsSync(BASELINE_FILE)) {
  console.error(`[ci:shell-css-collisions] FAIL — baseline missing at ${BASELINE_FILE}`);
  process.exit(1);
}
const baseline = new Set(JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')).collisions);

const current = new Set(collisions.map((c) => c.cls));
const introduced = collisions.filter((c) => !baseline.has(c.cls));
const resolved = [...baseline].filter((c) => !current.has(c)).sort();

if (process.argv.includes('--list')) {
  for (const c of collisions) {
    console.log(`  .${c.cls}  [${c.shells.join('+')}]`);
    for (const [shell, files] of c.byShell) console.log(`      ${shell}: ${[...files].join(', ')}`);
  }
  console.log('');
}

const byPair = {};
for (const c of collisions) {
  const k = c.shells.join('+');
  byPair[k] = (byPair[k] ?? 0) + 1;
}
console.log(
  `[ci:shell-css-collisions] ${collisions.length} class name(s) defined in more than one ` +
    `shell tree (baseline ${baseline.size}) — ` +
    Object.entries(byPair).map(([k, v]) => `${k}:${v}`).join(', '),
);

if (resolved.length > 0) {
  console.log(
    `\n  ${resolved.length} baseline entr${resolved.length === 1 ? 'y is' : 'ies are'} now clean.\n` +
      `  Regenerate ${path.relative(repoRoot, BASELINE_FILE)} so the ratchet holds:\n` +
      `    ${resolved.slice(0, 12).join(', ')}${resolved.length > 12 ? ', …' : ''}`,
  );
}

if (introduced.length > 0) {
  console.error('\n[ci:shell-css-collisions] FAIL — new cross-shell CSS collision(s):\n');
  for (const c of introduced) {
    console.error(`  .${c.cls}  — defined in ${c.shells.join(' AND ')}`);
    for (const [shell, files] of c.byShell) {
      console.error(`      ${shell}: ${[...files].join(', ')}`);
    }
  }
  console.error(
    '\nVite appends each shell CSS chunk to <head> and never removes it, so once a user\n' +
      'visits two shells in one session BOTH definitions are live and the one that loaded\n' +
      'last wins for the whole page. Namespace the class (.pdev-x / .mdx-x), or lift it\n' +
      'into the shared layer so there is one definition instead of two that disagree.\n',
  );
  process.exit(1);
}

console.log('[ci:shell-css-collisions] OK — no new cross-shell collisions.');
