/**
 * Every class CMC's agency-question view draws with is defined by a stylesheet
 * the CMC chunk itself loads (review of 2026-10-19, rows D2 and D5).
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * cmcAgencyQuestions.tsx drew its history lists with `cc-comm-issues`, a class
 * defined only in Communication's stylesheet (styles/commcenter-v2.css). Each
 * surface is a lazy chunk (surfaceViews.ts lazySurface) and Vite splits CSS per
 * chunk, so on a fresh load straight into CMC the rule was absent until
 * Communication, HAQ or Project home had been opened: the lists lost their
 * marker, gap and type, outside the design system, depending on where the user
 * had been.
 *
 * ── What this checks ─────────────────────────────────────────────────────────
 * The static import graph (no dynamic `import()`, no `import type`) from the
 * CMC chunk's entry, CmcModule.tsx, plus the shell that is always loaded
 * (V2App.tsx, main.tsx), and the stylesheets that graph imports (with their
 * `@import`s). Every class token cmcAgencyQuestions.tsx names, that some
 * stylesheet under client/src defines, must be defined by one of those.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CLIENT = path.join(ROOT, 'client', 'src');
const V2 = path.join(CLIENT, 'concept2cure', 'v2');

function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else if (spec.startsWith('@/')) base = path.join(CLIENT, spec.slice(2));
  else if (spec.startsWith('@shared/')) base = path.join(ROOT, 'shared', spec.slice('@shared/'.length));
  else return null; // a package
  for (const cand of [base, `${base}.tsx`, `${base}.ts`, `${base}.jsx`, `${base}.js`, path.join(base, 'index.tsx'), path.join(base, 'index.ts')]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

/* A bare `import './x.css'` is tried first (the lazy `??`), so the clause
   before `from` never runs on into the next statement. */
const STATIC_IMPORT = /^\s*import\s+(?!type\b)(?:[^;'"]*?\sfrom\s+)??['"]([^'"]+)['"]/gm;
const RE_EXPORT = /^\s*export\s+(?!type\b)(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/gm;
const CSS_IMPORT = /@import\s+(?:url\()?['"]([^'"]+)['"]/g;

/** Every file the static graph from `entries` reaches, stylesheets included. */
function closure(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = fs.readFileSync(file, 'utf8');
    const specs: string[] = [];
    if (file.endsWith('.css')) {
      for (const m of src.matchAll(CSS_IMPORT)) specs.push(m[1]);
    } else {
      for (const m of src.matchAll(STATIC_IMPORT)) specs.push(m[1]);
      for (const m of src.matchAll(RE_EXPORT)) specs.push(m[1]);
    }
    for (const spec of specs) {
      const next = resolveSpec(file, spec);
      if (next && !seen.has(next)) stack.push(next);
    }
  }
  return seen;
}

function cssFilesUnder(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) cssFilesUnder(p, out);
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

/** The complete class tokens a source file names in string literals of className attributes. */
function classTokens(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/className=(?:\{\s*)?(['"`])([^'"`]*)\1/g)) {
    for (const t of m[2].split(/\s+/)) if (t && !t.endsWith('-')) out.add(t);
  }
  return out;
}

const defines = (css: string, token: string) => new RegExp(`\\.${token.replace(/[-]/g, '\\-')}(?![\\w-])`).test(css);

describe('the CMC chunk loads the stylesheets its agency-question view draws with', () => {
  it('every class cmcAgencyQuestions.tsx names is defined by a stylesheet CMC or the shell loads', () => {
    const view = path.join(V2, 'surfaces', 'cmcAgencyQuestions.tsx');
    const loaded = closure([path.join(V2, 'surfaces', 'CmcModule.tsx'), path.join(V2, 'V2App.tsx'), path.join(CLIENT, 'main.tsx')]);
    expect(loaded.has(view), 'cmcAgencyQuestions.tsx is not in the CMC chunk').toBe(true);
    const loadedCss = [...loaded].filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(f, 'utf8'));
    const allCss = cssFilesUnder(CLIENT).map((f) => ({ f, css: fs.readFileSync(f, 'utf8') }));

    const missing: string[] = [];
    for (const token of classTokens(fs.readFileSync(view, 'utf8'))) {
      const definedBy = allCss.filter(({ css }) => defines(css, token)).map(({ f }) => path.relative(ROOT, f));
      if (definedBy.length === 0) continue; // a hook, not a style
      if (!loadedCss.some((css) => defines(css, token))) missing.push(`${token} (defined only in ${definedBy.join(', ')})`);
    }
    expect(missing).toEqual([]);
  });
});
