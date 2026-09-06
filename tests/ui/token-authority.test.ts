/**
 * Contract: exactly four stylesheets may define design tokens, and they may
 * never disagree.
 *
 * ── What this replaces ────────────────────────────────────────────────────────
 * The repository carried fourteen separate `:root` blocks declaring CSS custom
 * properties. Nine were unreachable from the app entry point — nothing imported
 * them — and several disagreed with canonical:
 *
 *   client/src/styles/theme.css:21        --color-primary: #d97757   (canonical: #292524)
 *   client/src/concept2cure/projects/project.css:25-27   all three font stacks
 *   ui_kits/home/styles.css                17 tokens
 *   ui_kits/mdx_phase2/app.css             17 tokens
 *
 * None of them was causing a visual bug, because none of them was loading. That
 * is precisely the problem: each was a latent regression that would fire the
 * moment someone added a single `import`. A one-line change in an unrelated
 * file could have flipped the primary colour app-wide, or hard-coded the accent
 * to a light-mode hex and silently broken dark mode.
 *
 * An audit cannot prevent that; only a gate can. This test walks the real
 * module graph from `client/src/main.tsx` — JS imports, dynamic `import()`,
 * `export … from`, and CSS `@import` — and fails if:
 *
 *   1. a stylesheet outside the allow-list becomes reachable while declaring
 *      tokens (someone wired an orphan back up), or
 *   2. two reachable stylesheets declare the same token with different values
 *      (the winner is then decided by import order, which is not a design
 *      decision anyone made), or
 *   3. canonical is pulled in more than once (it was, and shipped twice in the
 *      entry chunk).
 *
 * Deliberately NOT asserted: that unreachable token files do not exist. The
 * design-source kits under `ui_kits/` are legitimate artefacts.
 * What matters is that they stay out of the app's graph.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// One implementation, shared with surface-honesty.contract.test.ts — see that
// file's header for why this is a state machine and not a pair of regexes.
import { stripComments } from './_strip-comments';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENTRY = path.join(REPO_ROOT, 'client/src/main.tsx');

/**
 * The only stylesheets permitted to declare custom properties inside the app's
 * import graph. Adding an entry here is a design-authority decision and should
 * be argued for in review — that is the point of the list being explicit.
 */
const TOKEN_AUTHORITIES = [
  'design-system/colors_and_type.css',              // canonical: colour, type, spacing, radii, motion
  'client/src/index.css',                           // global alias shim + --shadcn-* bridge
  'client/src/concept2cure/v2/styles/app-v2.css',   // shell layout metrics (--ana, --rail, --black)
  // client/src/concept2cure/mdx/app.css was here. It no longer declares tokens
  // at :root — its layout metrics (--rail-expanded, --tabbar, --ana-expanded,
  // --ana-seam, --black) moved onto `.mdx-shell` when that sheet was scoped, so
  // they now apply to the MDX subtree instead of the document. That is strictly
  // better than an authority: a kit's own metrics were never global concerns,
  // and while they were global v2 was silently consuming one of them (--black,
  // via admin-access.css) from a kit it does not own. v2 declares its own now.
  //
  // The list shrinking is the improvement, so this is a deliberate removal, not
  // a relaxation — a fourth file declaring :root tokens should still fail.
].sort();

const JS_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/** `from '…'`, bare `import '…'`, `import('…')`, `export … from '…'`. */
const JS_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
/** `@import "x";` / `@import 'x';` / `@import url("x");` */
const CSS_IMPORT = /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/g;
/** A `--token: value;` declaration. */
const DECL = /(--[A-Za-z0-9_-]+)\s*:\s*([^;}]+)/g;

const rel = (abs: string) => path.relative(REPO_ROOT, abs).split(path.sep).join('/');


/** Resolve a specifier the way Vite does for this repo's aliases. */
function resolve(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(REPO_ROOT, 'client/src', spec.slice(2));
  else if (spec.startsWith('@shared/')) base = path.join(REPO_ROOT, 'shared', spec.slice(8));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // bare package specifier — node_modules, out of scope

  const candidates = [
    base,
    ...JS_EXT.map((e) => base + e),
    ...JS_EXT.map((e) => path.join(base, 'index' + e)),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

/** BFS the import graph from the entry point. Returns every file reached. */
function walkGraph(): { css: string[]; cssImportCounts: Map<string, number> } {
  const seen = new Set<string>();
  const css = new Set<string>();
  const importCounts = new Map<string, number>();
  const queue = [ENTRY];

  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);

    const isCss = file.endsWith('.css');
    const src = stripComments(fs.readFileSync(file, 'utf8'), isCss);
    const pattern = isCss ? CSS_IMPORT : JS_SPECIFIER;
    if (isCss) css.add(file);

    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(src)) !== null) {
      const target = resolve(m[1], file);
      if (!target) continue;
      // Count every edge, not just first arrival — a file imported twice is
      // inlined twice by the bundler.
      if (target.endsWith('.css')) {
        importCounts.set(target, (importCounts.get(target) ?? 0) + 1);
      }
      if (!seen.has(target)) queue.push(target);
    }
  }
  return { css: [...css], cssImportCounts: importCounts };
}

/** Custom properties declared in a file's `:root` blocks only. */
function rootTokens(file: string): Map<string, string> {
  const src = stripComments(fs.readFileSync(file, 'utf8'), true);
  const out = new Map<string, string>();

  // Walk `:root {` … matching `}`. Only `:root` — `.dark` and media queries are
  // *supposed* to redefine tokens with different values.
  const opener = /(^|[\s,}])(:root)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = opener.exec(src)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    const body = src.slice(start, i - 1);
    DECL.lastIndex = 0;
    let d: RegExpExecArray | null;
    while ((d = DECL.exec(body)) !== null) {
      out.set(d[1], d[2].trim().replace(/\s+/g, ' '));
    }
  }
  return out;
}

const graph = walkGraph();
const reachableCss = graph.css.map(rel).sort();
const declaring = graph.css.filter((f) => rootTokens(f).size > 0).map(rel).sort();

describe('design-token authority', () => {
  it('the entry graph resolves — the walker is not silently finding nothing', () => {
    // Guards against the whole suite passing vacuously if resolution breaks.
    expect(reachableCss.length).toBeGreaterThan(5);
    expect(reachableCss).toContain('client/src/index.css');
    expect(reachableCss).toContain('design-system/colors_and_type.css');
  });

  it('only the four authorised stylesheets declare tokens in the app graph', () => {
    expect(declaring).toEqual(TOKEN_AUTHORITIES);
  });

  it('no orphaned token file has been wired back into the graph', () => {
    // Named explicitly: these were deleted or quarantined because they
    // disagreed with canonical. If one reappears here, the value conflicts in
    // its header come back with it.
    const quarantined = [
      'client/src/styles/theme.css',
      'client/src/concept2cure/design/claude-design.css',
      'client/src/concept2cure/design/zen.css',
      'client/src/concept2cure/projects/project.css',
      'client/src/concept2cure/biopharma/app.css',
      'ui_kits/home/styles.css',
      'ui_kits/mdx_phase2/app.css',
      'ui_kits/pdev/styles.css',
      'ui_kits/mdx/app.css',
      'ui_kits/mdx/tokens-shim.css',
    ];
    expect(reachableCss.filter((f) => quarantined.includes(f))).toEqual([]);
  });

  it('canonical tokens are inlined exactly once', () => {
    // main.tsx and index.css both imported design-system/colors_and_type.css,
    // resolving to the same path. Vite does not dedupe across a JS import and a
    // CSS @import, so the entry chunk carried two full copies (~19 KB).
    const canonical = path.join(REPO_ROOT, 'design-system/colors_and_type.css');
    expect(graph.cssImportCounts.get(canonical)).toBe(1);
  });

  it('no two authorities disagree about the same token', () => {
    const byToken = new Map<string, Map<string, string>>(); // token -> value -> file
    for (const file of graph.css) {
      for (const [token, value] of rootTokens(file)) {
        if (!byToken.has(token)) byToken.set(token, new Map());
        byToken.get(token)!.set(value, rel(file));
      }
    }
    const conflicts = [...byToken.entries()]
      .filter(([, values]) => values.size > 1)
      .map(([token, values]) =>
        `${token}: ${[...values].map(([v, f]) => `${f} => ${v}`).join('  |  ')}`,
      );
    // A conflict means import order silently decides the value. That is never
    // a decision anyone made on purpose.
    expect(conflicts).toEqual([]);
  });

  it('declares each token at most once per file — no self-shadowing', () => {
    // client/src/styles/theme.css shipped a :root with 14 duplicate keys, so
    // half its own declarations were dead. Catch that class of bug directly.
    const offenders: string[] = [];
    for (const file of graph.css) {
      const src = stripComments(fs.readFileSync(file, 'utf8'), true);
      const opener = /(^|[\s,}])(:root)\s*\{/g;
      let m: RegExpExecArray | null;
      while ((m = opener.exec(src)) !== null) {
        let depth = 1;
        let i = m.index + m[0].length;
        const start = i;
        while (i < src.length && depth > 0) {
          if (src[i] === '{') depth++;
          else if (src[i] === '}') depth--;
          i++;
        }
        const body = src.slice(start, i - 1);
        const counts = new Map<string, number>();
        DECL.lastIndex = 0;
        let d: RegExpExecArray | null;
        while ((d = DECL.exec(body)) !== null) {
          counts.set(d[1], (counts.get(d[1]) ?? 0) + 1);
        }
        for (const [tok, n] of counts) {
          if (n > 1) offenders.push(`${rel(file)}: ${tok} declared ${n}× in one :root`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the deleted stylesheets stay deleted', () => {
  it('zen.css is gone — 799 lines with zero consumers', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'client/src/concept2cure/design/zen.css'))).toBe(false);
  });

  it('no source file references a --zen-* token or a .zen-* class', () => {
    // The justification for deleting zen.css was that nothing used it. If that
    // ever stops being true, this fails before the missing styles ship.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === 'dist') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.(tsx?|jsx?|css)$/.test(e.name)) continue;
        const src = stripComments(fs.readFileSync(p, 'utf8'), e.name.endsWith('.css'));
        if (/var\(\s*--zen-/.test(src)) offenders.push(`${rel(p)}: var(--zen-*)`);
      }
    };
    walk(path.join(REPO_ROOT, 'client/src'));
    expect(offenders).toEqual([]);
  });
});
