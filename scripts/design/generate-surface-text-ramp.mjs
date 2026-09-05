#!/usr/bin/env node
/**
 * Generate the surface-scoped muted-text ramp (GA ledger L102).
 *
 * ── The problem, and why the obvious fixes do not work ────────────────────────
 * After L101 took `--text-400` to #75736d it clears 4.5:1 on `--bg-000` exactly
 * (4.50) and fails on every tinted surface: 4.30 on `--bg-050`, 4.08 on
 * `--bg-100`, 3.79 on `--bg-200`. That is the residual ~447 failures.
 *
 * L102 established that neither global lever has room:
 *   · darkening `--text-400` far enough for all surfaces lands within 1.03:1 of
 *     `--text-300`, which is two tokens claiming to be one step apart while
 *     being the same colour;
 *   · lightening the three surfaces collapses them into `--bg-000` and erases
 *     the surface hierarchy.
 * It concluded the only honest fix was moving ~447 call sites to `--text-300`.
 *
 * That conclusion rests on a hidden premise: that the token must take ONE value
 * globally. It does not — custom properties inherit, so a token can be re-based
 * on the element that establishes the surface. Measured per surface, the ramp
 * has room everywhere:
 *
 *     surface          --text-400          --text-300          step
 *     bg-050 #f5f4ee   #71706a (4.51)      #686660 (5.21)      1.156:1
 *     bg-100 #f0eee6   #6e6c66 (4.52)      #64625c (5.25)      1.162:1
 *     bg-200 #e8e6dc   #686661 (4.58)      #5f5d58 (5.26)      1.147:1
 *
 * — against a global step of 1.158:1. The step is PRESERVED, because the
 * constraint was never global; evaluating one value against every background at
 * once is what forced the collapse.
 *
 * Two further facts made this safe rather than clever. `--text-400` is a
 * foreground token in practice: 1,437 of its ~1,490 stylesheet uses are
 * `color:`. And `--text-300` itself measures 4.39 on `--bg-200`, so L102's
 * proposed migration would not have closed that surface either.
 *
 * ── Why generated ─────────────────────────────────────────────────────────────
 * The re-base has to name every selector that establishes one of these
 * surfaces — ~1,000 of them today. Hand-maintained, that list is wrong the
 * first time someone adds a card, and wrong silently. This script derives it
 * from the stylesheets themselves with a real CSS parse, and
 * `ci:surface-text-ramp` fails when the checked-in output no longer matches
 * what the sources imply.
 *
 * ── Why one sheet PER SHELL TREE ──────────────────────────────────────────────
 * The first version emitted every selector from every stylesheet into a single
 * sheet under v2/. That re-defined ~80 pdev-owned classes (`.pdev-*`,
 * `.state-*`) inside the v2 tree, which is precisely the defect
 * `ci:check-shell-css-collisions` exists to catch: Vite emits each shell tree
 * (v2/, mdx/, pdev/) as its own CSS chunk, the runtime loader appends chunks to
 * <head> and never removes them, so once a user has visited two shells BOTH
 * definitions are live and the one that loaded last wins page-wide. A class
 * may therefore be defined in exactly one tree.
 *
 * So the ramp is split by OWNER. Each shell tree gets its own generated sheet
 * naming only the selectors collected from that tree's own stylesheets, and
 * each shell root imports its sheet LAST so it lands after the rules it
 * corrects. The contrast fix is preserved for every shell — each shell just
 * carries its own slice.
 *
 * Stylesheets outside the three trees (`client/src/index.css`,
 * `client/src/styles/*.css`, `concept2cure/_shared/**`, `concept2cure/quality/**`,
 * `concept2cure/components/**`) are owned by v2. V2App is the root shell that
 * mounts the mdx, pdev and quality surfaces inside itself
 * (`v2/surfaces/PdevSurfaces.tsx`, `CollabLauncher.tsx`, `QualityModule.tsx`),
 * so its chunk is present whenever any of those sheets can render — and it is
 * the only tree that qualifies as "always there". One owner, documented here,
 * rather than a fourth sheet the collision gate would not see.
 *
 * `*.module.css` sheets are NOT collected. Vite hashes their class names
 * (`.aiProse` ships as `._aiProse_u8ymw_555`), so a bare `.aiProse` in a plain
 * sheet can never match the element the module styles — the emitted selector
 * was dead weight that also counted as "v2 defines .aiProse" for the collision
 * gate. A CSS-module surface that needs the re-base has to carry it inside the
 * module itself.
 *
 * Usage:
 *   node scripts/design/generate-surface-text-ramp.mjs           # write all
 *   node scripts/design/generate-surface-text-ramp.mjs --check   # drift gate
 */
import postcss from 'postcss';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');

/**
 * One generated sheet per shell tree, mirroring SHELL_TREES in
 * scripts/ci/check-shell-css-collisions.mjs. `dir` is the tree whose
 * stylesheets feed the sheet; `out` is where it is written; `root` is the shell
 * entry component that must import it last.
 */
const SHELL_TREES = {
  v2: {
    dir: 'client/src/concept2cure/v2',
    out: 'client/src/concept2cure/v2/styles/surface-text-ramp.css',
    root: 'client/src/concept2cure/v2/V2App.tsx',
  },
  mdx: {
    dir: 'client/src/concept2cure/mdx',
    out: 'client/src/concept2cure/mdx/surface-text-ramp.css',
    root: 'client/src/concept2cure/mdx/MdxSurfaceHost.tsx',
  },
  pdev: {
    dir: 'client/src/concept2cure/pdev',
    out: 'client/src/concept2cure/pdev/surface-text-ramp.css',
    root: 'client/src/concept2cure/pdev/PdevRoute.tsx',
  },
};

/** Owner of every stylesheet that lives outside the three shell trees. */
const SHARED_OWNER = 'v2';

/**
 * Per surface: the re-based ramp that holds 4.5:1 on THAT background while
 * keeping `--text-400` a visible step below `--text-300`.
 * Values solved with scripts/lib/wcag.mjs — the same maths the gate measures
 * with, so the two cannot disagree about what passes.
 */
const TIERS = {
  '050': { light: { t400: '#71706a', t300: '#686660' }, dark: { t400: '#94928a', t300: '#b0aea5' } },
  '100': { light: { t400: '#6e6c66', t300: '#64625c' }, dark: { t400: '#999890', t300: '#b0aea5' } },
  '200': { light: { t400: '#686661', t300: '#5f5d58' }, dark: { t400: '#a9a8a2', t300: '#b6b4ab' } },
};

const OUTPUTS = new Set(Object.values(SHELL_TREES).map((t) => path.resolve(ROOT, t.out)));

/** Which shell tree owns a stylesheet (repo-relative path). */
function ownerOf(rel) {
  for (const [name, t] of Object.entries(SHELL_TREES)) {
    if (rel === t.dir || rel.startsWith(`${t.dir}/`)) return name;
  }
  return SHARED_OWNER;
}

/**
 * Selectors that establish each tinted surface, from a real parse, grouped by
 * the shell tree that owns the stylesheet they came from.
 */
function collect() {
  const files = execSync("git ls-files 'client/src/**/*.css'", { cwd: ROOT, encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
  const perTree = {};
  for (const name of Object.keys(SHELL_TREES)) {
    perTree[name] = { sources: [], byTier: { '050': new Set(), '100': new Set(), '200': new Set() } };
  }
  for (const f of files) {
    if (OUTPUTS.has(path.resolve(ROOT, f))) continue; // never feed an output back in
    if (f.endsWith('.module.css')) continue;          // hashed class names — see header
    let root;
    try { root = postcss.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { continue; }
    const tree = perTree[ownerOf(f)];
    let hit = false;
    root.walkDecls((d) => {
      if (!/^background(-color)?$/.test(d.prop)) return;
      const m = /var\(--bg-(050|100|200)\)/.exec(d.value);
      if (!m) return;
      const rule = d.parent;
      if (!rule || rule.type !== 'rule') return;
      for (const s of rule.selectors) {
        const sel = s.trim();
        // A selector that is itself a theme root would re-base globally.
        if (!sel || sel.startsWith(':root') || sel.startsWith('[data-theme')) continue;
        tree.byTier[m[1]].add(sel);
        hit = true;
      }
    });
    if (hit) tree.sources.push(f);
  }
  return perTree;
}

/** The sheet for one tree, or null when that tree establishes no tinted surface. */
function render(name, { sources, byTier }) {
  const total = Object.values(byTier).reduce((n, s) => n + s.size, 0);
  if (total === 0) return null;
  const { dir, root } = SHELL_TREES[name];
  const L = [];
  L.push('/* GENERATED by scripts/design/generate-surface-text-ramp.mjs — do not edit.');
  L.push(' *');
  L.push(` * Surface-scoped muted-text ramp (GA ledger L102) — ${name} shell tree.`);
  L.push(' *');
  L.push(' * `--text-400` clears 4.5:1 on `--bg-000` and fails on every tinted surface');
  L.push(' * (4.30 / 4.08 / 3.79). No single global value fixes that without collapsing');
  L.push(" * into `--text-300`, and lightening the surfaces erases the hierarchy — so the");
  L.push(' * ramp is re-based on the element that establishes each surface instead.');
  L.push(' * Custom properties inherit, so every descendant gets the corrected pair with');
  L.push(' * no call-site change, and the step between the two tokens is preserved');
  L.push(' * (1.147–1.162:1 against a global 1.158:1).');
  L.push(' *');
  L.push(' * One sheet per shell tree: Vite keeps every shell CSS chunk in <head> for the');
  L.push(' * whole session, so a class defined in two trees is a page-wide collision');
  L.push(' * (ci:check-shell-css-collisions). This sheet names only selectors that');
  L.push(` * stylesheets owned by \`${dir}/\` establish, and \`${path.basename(root)}\``);
  L.push(' * imports it last so it lands after the rules it corrects.');
  if (name === SHARED_OWNER) {
    L.push(' * Stylesheets outside the v2/, mdx/ and pdev/ trees are owned by v2 because');
    L.push(' * V2App is the root shell that mounts the other shells inside itself.');
  }
  L.push(' *');
  L.push(` * Sources (${sources.length}):`);
  for (const s of sources) L.push(` *   ${s}`);
  L.push(' *');
  L.push(' * Tiers are emitted darkest-last so the strongest requirement wins where one');
  L.push(' * selector carries more than one surface.');
  L.push(' */');
  L.push('');
  for (const tier of ['050', '100', '200']) {
    const sels = [...byTier[tier]].sort();
    if (!sels.length) continue;
    const { light, dark } = TIERS[tier];
    L.push(`/* ── --bg-${tier} · ${sels.length} selector(s) ── */`);
    L.push(sels.join(',\n') + ' {');
    L.push(`  --text-400: ${light.t400};`);
    L.push(`  --text-300: ${light.t300};`);
    L.push('}');
    L.push(`[data-theme="dark"] :is(${sels.join(', ')}),`);
    L.push(`[data-theme="dark"]:is(${sels.join(', ')}) {`);
    L.push(`  --text-400: ${dark.t400};`);
    L.push(`  --text-300: ${dark.t300};`);
    L.push('}');
    L.push('');
  }
  return L.join('\n');
}

const perTree = collect();
const expected = Object.fromEntries(
  Object.keys(SHELL_TREES).map((name) => [name, render(name, perTree[name])]),
);

if (process.argv.includes('--check')) {
  const stale = [];
  for (const [name, css] of Object.entries(expected)) {
    const out = SHELL_TREES[name].out;
    const abs = path.join(ROOT, out);
    const cur = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    if (css === null && cur !== null) stale.push(`${out} — should not exist (${name} establishes no tinted surface)`);
    else if (css !== null && cur === null) stale.push(`${out} — missing`);
    else if (css !== cur) stale.push(`${out} — stale`);
  }
  if (stale.length) {
    console.error('[ci:surface-text-ramp] FAIL — generated ramp sheet(s) do not match the stylesheets:');
    for (const s of stale) console.error(`    ${s}`);
    console.error('  A stylesheet gained or lost a tinted-surface rule, so the re-based');
    console.error('  text ramp no longer covers what the sources imply. Regenerate:');
    console.error('    node scripts/design/generate-surface-text-ramp.mjs');
    process.exit(1);
  }
  console.log(
    `[ci:surface-text-ramp] OK — ${Object.values(expected).filter(Boolean).length} generated ramp sheet(s) match the stylesheets.`,
  );
  process.exit(0);
}

for (const [name, css] of Object.entries(expected)) {
  const out = SHELL_TREES[name].out;
  const abs = path.join(ROOT, out);
  if (css === null) {
    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
      console.log(`[surface-text-ramp] removed ${out} (${name} establishes no tinted surface)`);
    }
    continue;
  }
  fs.writeFileSync(abs, css);
  console.log(`[surface-text-ramp] wrote ${out} (${css.split('\n').length} lines)`);
}
