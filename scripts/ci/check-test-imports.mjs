#!/usr/bin/env node
/**
 * Every relative import in every test file must resolve to a file on disk.
 *
 * ── The hole this closes ──────────────────────────────────────────────────────
 * `tsconfig.json`'s include is `client/src`, `server`, `shared`, `agents`. The
 * test trees — `tests/`, and every `__tests__/` directory under `client/src` —
 * are NOT in it. So `tsc --noEmit` has never once looked at a test file, and
 * "typecheck is clean" has never meant anything about them.
 *
 * That is not theoretical. The shell convergence deleted 455 unreachable client
 * modules; 11 test files imported modules in that set. Nothing said so. `tsc`
 * reported zero errors — truthfully, for the tree it was pointed at — and the
 * failures surfaced one CI round later as 16 red suites, where they were first
 * misdiagnosed as database contention because the honest signal had never been
 * available. Two rounds of CI were spent on a question a 200ms static check
 * answers exactly.
 *
 * ── Why not just add tests/ to tsconfig ───────────────────────────────────────
 * Tried, measured: 577 errors. 238 of them are `TS7031` (implicitly-typed
 * destructured parameters in mock factories) and 76 are `TS18048` (possibly
 * undefined) — loose typing that is conventional in this repo's tests and is a
 * separate, much larger decision. Adopting a 577-error baseline to catch the
 * 40 that matter would bury the signal in the noise, and a baseline that large
 * stops being read.
 *
 * This checks one thing instead, the thing that actually broke: does the file
 * this test imports EXIST. A test whose subject was deleted is not a style
 * question — it cannot run at all, and it fails in CI rather than here only
 * because CI is where somebody finally executes it.
 *
 * ── Scope, deliberately narrow ────────────────────────────────────────────────
 * Relative (`./`, `../`) and aliased (`@/`, `@shared/`, `@server/`, `@assets/`)
 * specifiers only. Bare package specifiers are excluded on purpose: whether
 * `@playwright/test` is installed is a dependency-management question that
 * `npm ci` already answers, and including it here would make this gate fail on
 * every machine where an optional CI-only package is absent. Every specifier
 * this gate skips is counted and printed, so the narrowness is visible rather
 * than implied.
 *
 * `vi.mock()` / `jest.mock()` are also excluded, and that is not an oversight.
 * Mocking a path that does not resolve is legal — the factory simply never gets
 * used — and this repo does it DELIBERATELY in at least four places, mocking
 * both `'../../db'` and `'../../../db'` for the same module because "vitest's
 * mock-key matching is path-string-sensitive" (the comment at
 * `tests/services/auditService.test.ts:112`). Flagging those would make the gate
 * wrong about working code on its first run, which is how a gate gets muted.
 *
 * ── Why a scanner instead of a regex over raw source ──────────────────────────
 * The first version ran the import patterns over the raw file and reported 32
 * failures, of which 7 were text inside string literals and comments — an
 * assertion reading `expect(router).not.toContain("from '../ZenApp'")` is a test
 * PROVING a module was unimported, reported as an unresolved import. So the
 * source is tokenised first: line comments, block comments and the contents of
 * '…', "…" and `…` are blanked (length-preserved, so line numbers survive)
 * before any pattern runs.
 *
 * The sibling gate `check-client-reachability.mjs` warns at length against
 * stripping comments with a regex, and it is right — its own attempt ate 2,039
 * characters of a file and every import in them. A character-level scanner has
 * no such failure mode: it cannot confuse a comment for a string because it
 * tracks which one it is in.
 *
 * Usage:
 *   node scripts/ci/check-test-imports.mjs
 *   node scripts/ci/check-test-imports.mjs --list     # print every test file scanned
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Trees that hold tests. Kept explicit — a glob over the repo also walks dist/. */
const SEARCH_ROOTS = ['tests', 'client/src', 'server', 'shared', 'agents', 'scripts'];

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  'coverage',
  '_archive',
  'test-results',
  'playwright-report',
]);

/** Mirrors tsconfig paths + vite resolve.alias. */
const ALIASES = [
  ['@/', 'client/src/'],
  ['@shared/', 'shared/'],
  ['@server/', 'server/'],
  ['@assets/', 'attached_assets/'],
];

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Extensions a specifier may resolve to WITHOUT the importer naming one.
 *
 * `.css`/`.json` are here because Vite resolves them and a test that imports a
 * stylesheet for its side effects is importing a real file whose deletion
 * matters just as much.
 */
const RESOLVE_EXTS = [...CODE_EXTS, '.json', '.css', '.scss', '.svg'];

const isTestFile = (p) =>
  /(^|[\\/])__tests__[\\/]/.test(p) || /\.(test|spec|e2e)\.[cm]?[jt]sx?$/.test(p);

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, out);
    } else if (e.isFile() && CODE_EXTS.includes(path.extname(full)) && isTestFile(full)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Blank out comments and string BODIES, preserving length and newlines.
 *
 * The quote characters themselves are kept, so `from './x'` becomes
 * `from '   '` — the import patterns below still see the shape of a specifier
 * and simply read nothing where a quoted body used to be. That is what makes
 * `expect(src).toContain("from '../ZenApp'")` stop looking like an import: the
 * outer double-quoted string is blanked, and everything inside it with it.
 *
 * Specifiers are therefore read from the RAW source at the offsets this pass
 * identifies — the blanking decides *where* an import is, not *what* it names.
 */
function blankNonCode(src) {
  const out = Array.from(src);
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k += 1) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };

  /**
   * Does a `/` at `at` open a regex literal, or is it division?
   *
   * This is not pedantry. `tests/ui/one-shell.test.ts:64` reads
   *
   *   const SHELL_ROOT = /className=\{?[`"']([a-z0-9-]*\s)?c2c-v2/;
   *
   * — a regex containing a BACKTICK. Without this check the scanner entered a
   * template literal there and ran to the next backtick twenty lines later,
   * blanking every line between. The first falsification probe caught it: a
   * deliberately broken `import … from './a-module-that-was-deleted'` appended
   * to that file was NOT reported, while a specifier inside a template literal
   * WAS. Exactly backwards, and the only reason it was visible is that the
   * probe tested both directions instead of just "does it fail".
   *
   * The classic disambiguation heuristic: after a value (identifier, literal,
   * `)`, `]`) a slash is division; after an operator or the start of a
   * statement it opens a regex. Keywords that can precede a regex are listed
   * because `return /x/` is a regex while `foo /x/` is two divisions.
   */
  const REGEX_PRECEDERS = /[([{,;:!&|?+\-*%~^<>=]$/;
  const KEYWORD_BEFORE_REGEX =
    /\b(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/;
  const opensRegex = (at) => {
    let k = at - 1;
    while (k >= 0 && /\s/.test(src[k])) k -= 1;
    if (k < 0) return true;
    const before = src.slice(0, k + 1);
    return REGEX_PRECEDERS.test(before) || KEYWORD_BEFORE_REGEX.test(before);
  };

  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];

    if (c === '/' && next !== '/' && next !== '*' && opensRegex(i)) {
      // Walk to the closing `/`, honouring escapes and character classes
      // (a `/` inside `[...]` does not end the literal).
      let j = i + 1;
      let inClass = false;
      while (j < src.length) {
        const d = src[j];
        if (d === '\\') {
          j += 2;
          continue;
        }
        if (d === '\n') break; // unterminated — it was division after all
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) break;
        j += 1;
      }
      if (j < src.length && src[j] === '/') {
        blank(i + 1, j);
        i = j + 1;
        continue;
      }
      // Fell off the line: not a regex. Advance one and keep scanning.
      i += 1;
      continue;
    }

    if (c === '/' && next === '/') {
      const end = src.indexOf('\n', i);
      blank(i, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      blank(i, end === -1 ? src.length : end + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === c) break;
        // An unterminated single/double quote means this was not a string at
        // all (an apostrophe in a comment the scanner already passed, or a JSX
        // text node). Bail at the line end rather than swallowing the file.
        if (c !== '`' && src[j] === '\n') break;
        j += 1;
      }
      blank(i + 1, j);
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/**
 * Module specifiers in a source file, read from `code` (blanked) but resolved
 * against `raw` (original text at the same offsets).
 *
 * `vi.mock` / `jest.mock` are absent by design — see the header.
 */
function specifiers(raw) {
  const code = blankNonCode(raw);
  const out = [];
  const patterns = [
    /\bfrom\s*(['"])([^'"\n]*)\1/g, // import … from 'x' / export … from 'x'
    /\bimport\s*\(\s*(['"])([^'"\n]*)\1/g, // dynamic import('x')
    /\brequire\s*\(\s*(['"])([^'"\n]*)\1/g, // require('x')
    /\bimport\s+(['"])([^'"\n]*)\1/g, // bare side-effect import 'x'
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(code)) !== null) {
      // m[2] is blank in `code`; read the real specifier out of `raw` at the
      // same offsets. m.index + the match's own offset to the opening quote.
      const quoteAt = m.index + m[0].indexOf(m[1]);
      const spec = raw.slice(quoteAt + 1, quoteAt + 1 + m[2].length);
      if (spec) out.push({ spec, index: m.index });
    }
  }
  return out;
}

const lineOf = (src, index) => src.slice(0, index).split('\n').length;

function resolves(rawSpec, fromFile) {
  // Vite resource queries — `./x?raw`, `./y?url`, `./z?worker&inline`. The file
  // on disk is the part before the `?`; the suffix asks the bundler for a
  // different representation of it.
  const spec = rawSpec.split('?')[0];
  if (!spec) return true;

  let base;
  if (spec.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), spec);
  } else {
    const alias = ALIASES.find(([a]) => spec.startsWith(a));
    if (!alias) return true; // bare specifier — out of scope, see header
    base = path.join(repoRoot, alias[1], spec.slice(alias[0].length));
  }

  if (fs.existsSync(base) && fs.statSync(base).isFile()) return true;

  // ESM specifiers name `.js` for a `.ts` source. Probe the TypeScript sources
  // before giving up — the sibling gates document the same quirk.
  const swap = base.replace(/\.([cm]?)js$/, '');
  if (swap !== base) {
    for (const e of CODE_EXTS) if (fs.existsSync(swap + e)) return true;
  }

  for (const e of RESOLVE_EXTS) if (fs.existsSync(base + e)) return true;
  for (const e of CODE_EXTS) if (fs.existsSync(path.join(base, 'index' + e))) return true;
  // A directory with a package.json main, or any directory at all that a
  // bundler could resolve — treated as resolving, since being wrong here costs
  // a false failure on a gate whose whole value is that it never cries wolf.
  if (fs.existsSync(base) && fs.statSync(base).isDirectory()) return true;
  return false;
}

const testFiles = [];
for (const root of SEARCH_ROOTS) {
  const dir = path.join(repoRoot, root);
  if (fs.existsSync(dir)) walk(dir, testFiles);
}
testFiles.sort();

const broken = [];
let checked = 0;
let skippedBare = 0;

for (const file of testFiles) {
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const { spec, index } of specifiers(src)) {
    const isLocal = spec.startsWith('.') || ALIASES.some(([a]) => spec.startsWith(a));
    if (!isLocal) {
      skippedBare += 1;
      continue;
    }
    checked += 1;
    if (!resolves(spec, file)) {
      broken.push({
        file: path.relative(repoRoot, file),
        line: lineOf(src, index),
        spec,
      });
    }
  }
}

if (process.argv.includes('--list')) {
  for (const f of testFiles) console.log(`  ${path.relative(repoRoot, f)}`);
  console.log('');
}

console.log(
  `[ci:test-imports] ${testFiles.length} test files · ${checked} local imports checked · ` +
    `${skippedBare} bare package specifiers skipped (out of scope).`,
);

if (broken.length > 0) {
  console.error(`\n[ci:test-imports] FAIL — ${broken.length} import(s) name a file that does not exist:\n`);
  for (const b of broken) console.error(`  ${b.file}:${b.line}  →  ${b.spec}`);
  console.error(
    '\nA test that cannot resolve its import cannot run. If the module was deleted\n' +
      'deliberately, the test goes with it — or is rewritten against whatever replaced\n' +
      'it. Do not leave it in the tree: `tsconfig` does not cover tests, so nothing\n' +
      'else in CI will tell you, and it will surface as a red suite with a misleading\n' +
      'error one job later.\n',
  );
  process.exit(1);
}

console.log('[ci:test-imports] OK — every local import in every test file resolves.');
