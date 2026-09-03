#!/usr/bin/env node
/**
 * Per-module deletion proof — the check that has to be wrong out loud.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * `ci:unreferenced-modules` answers one narrow question correctly: does any
 * file name this module in a module-path string literal? That is an IMPORT
 * GRAPH question, and its answer is not "this file is dead".
 *
 * `server/middleware/authAdapter.ts` is the proof. Nothing imports it, so the
 * import graph calls it unreferenced. But
 * `server/__tests__/security/auth-db-contract-smoke.test.ts` reads it with
 * `fs.readFileSync(path.join(repoRoot, 'server/middleware/authAdapter.ts'))`
 * and asserts its export shape. It is alive, load-bearing, and invisible to
 * every import-graph tool including the one in this repo.
 *
 * An earlier attempt at this analysis claimed 103 modules were dead and safe to
 * delete, on the strength of a script that searched only import syntax — and
 * which was itself broken, reporting zero hits for modules that a plain `rg`
 * finds in ten files. The conclusion was written into the GA ledger before
 * anyone tested the checker. That is the failure this file is built against.
 *
 * ── WHAT IT DOES DIFFERENTLY ────────────────────────────────────────────────
 * It reads every text file in the repository ONCE and looks for four distinct
 * ways a module can be depended on, reporting them separately because they mean
 * different things:
 *
 *   import   — a module-path literal. The import graph. What the other gate sees.
 *   fspath   — the path as a STRING: fs.readFileSync, path.join, a route
 *              manifest, a spawn argument. Alive, invisible to import graphs.
 *   config   — package.json, CI workflows, Dockerfiles, tool configs.
 *   doc      — markdown and text. Not blocking on its own, but a module named
 *              in an architecture document is a decision someone recorded.
 *
 * A module is proposed for deletion ONLY when all four are empty.
 *
 * ── THE CONTROLS ARE THE POINT ──────────────────────────────────────────────
 * `--controls` runs the checker against modules whose status is known
 * INDEPENDENTLY of it, and fails if the checker disagrees. A checker that has
 * never been shown to produce a negative has not been tested, it has been
 * watched. Run the controls before believing any result from this file.
 *
 * Usage:
 *   node scripts/ci/prove-module-unused.mjs --controls     # test the checker
 *   node scripts/ci/prove-module-unused.mjs                # summary
 *   node scripts/ci/prove-module-unused.mjs --json         # full evidence
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const JSON_MODE = process.argv.includes('--json');
const CONTROLS_MODE = process.argv.includes('--controls');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.cache',
  'attached_assets', '.venv', 'venv', '__pycache__',
]);
/**
 * Files that mention every candidate by construction; counting them is circular.
 *
 * The verdict report is on this list because writing it moved the clean count
 * from 23 to 0 in one run: a document whose subject IS the candidate set names
 * every module in it, so counting it as documentation-that-holds-a-module makes
 * the act of reporting the result destroy the result.
 */
const SELF_REFERENTIAL = new Set([
  'scripts/ci/unreferenced-modules-baseline.json',
  'scripts/ci/check-unreferenced-modules.mjs',
  'scripts/ci/prove-module-unused.mjs',
  'docs/reports/L54_UNREFERENCED_MODULE_VERDICTS_2026-09-03.md',
]);

/*
 * Every extension here is a surface a module can be reached FROM. The first
 * version of this list omitted `.mts`, `.py`, `.tf`, `.tmpl` and every
 * extensionless file, which meant a module invoked only from `.husky/pre-push`
 * or a Python entry point would have been reported as having no reference of
 * any kind. Nothing in the current candidate set turned out to be reachable
 * that way, but the list was short by exactly the surfaces this repo has been
 * bitten by before (npm scripts, hooks, migrations), so it is widened here
 * rather than left to be discovered by a wrong deletion.
 */
const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts',
  '.json', '.jsonl', '.md', '.mdx', '.txt',
  '.yml', '.yaml', '.sql', '.sh', '.html', '.css', '.toml', '.env', '.example',
  '.py', '.rb', '.tf', '.tfvars', '.tmpl', '.tpl', '.j2', '.xml', '.csv', '.http',
]);

/** Extensionless files that are still executable/config surfaces. */
const NO_EXT_DIRS = new Set(['.husky', 'bin']);
const NO_EXT_NAMES = /^(Dockerfile|Procfile|Makefile|CODEOWNERS)$/i;

const MAX_BYTES = 4 * 1024 * 1024;

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name), out);
    } else {
      const ext = path.extname(e.name);
      const noExtConfig = !ext
        && (NO_EXT_NAMES.test(e.name) || NO_EXT_DIRS.has(path.basename(dir)));
      if (TEXT_EXT.has(ext) || noExtConfig) out.push(path.join(dir, e.name));
    }
  }
  return out;
}

/** Read the whole repo once. Everything below is a scan over this corpus. */
function buildCorpus() {
  const corpus = [];
  for (const abs of walk(repoRoot)) {
    const rel = path.relative(repoRoot, abs);
    if (SELF_REFERENTIAL.has(rel)) continue;
    let st;
    try { st = fs.statSync(abs); } catch { continue; }
    if (st.size > MAX_BYTES) continue;
    let text;
    try { text = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    corpus.push({ rel, text });
  }
  return corpus;
}

function kindOf(rel) {
  // Anything under docs/ is documentation whatever its extension. The audit
  // evidence packs (docs/audit-2026-07/evidence/*.json,
  // docs/reports/repo-health-scan-latest.json) are machine-generated INVENTORIES
  // that name hundreds of modules. Counting a module's appearance in a report
  // ABOUT the codebase as a dependency OF the codebase inverts the relationship
  // and inflated the held set on the first run of this script.
  if (rel.startsWith('docs/')) return 'doc';
  if (/^(package\.json|package-lock\.json)$/.test(rel)) return 'config';
  if (rel.startsWith('.github/')) return 'config';
  if (/^(Dockerfile|Procfile|Makefile|docker-compose)/i.test(path.basename(rel))) return 'config';
  if (/\.(config|workspace)\.(ts|js|mjs|cjs)$/.test(rel)) return 'config';
  if (/^(vitest|vite|jest|playwright|drizzle|tailwind|postcss|eslint)\./.test(path.basename(rel))) return 'config';
  if (/\.(md|mdx|txt)$/.test(rel)) return 'doc';
  return 'code';
}

/**
 * Is the needle's occurrence on this line inside a comment?
 *
 * This is the difference between "something reaches this module" and "somebody
 * wrote its name down". `server/utils/pdfParse.ts` line 8 says
 * `* same pattern as server/middleware/authAdapter.ts. Import from here instead`
 * — prose, in a JSDoc block. Counted as a filesystem-path reference it made
 * authAdapter look held by code, and it was the ONLY thing satisfying that
 * module's fspath control, so the control passed on a sentence.
 *
 * Five modules in the `held` bucket were held by nothing but a comment.
 */
function isCommentedOccurrence(line, idx) {
  const trimmed = line.trimStart();
  if (/^(\/\/|\/\*|\*\/|\*|--|#)/.test(trimmed)) return true;
  const slash = line.indexOf('//');
  if (slash !== -1 && slash < idx && line[slash - 1] !== ':') return true;
  const dash = line.indexOf('--');
  if (dash !== -1 && dash < idx) return true;
  const hash = line.indexOf('#');
  if (hash !== -1 && hash < idx) return true;
  return false;
}

/** Lines of `text` where any needle appears, split by whether it is a comment. */
function occurrences(text, needles) {
  let real = false;
  let commented = false;
  for (const line of text.split('\n')) {
    for (const n of needles) {
      const i = line.indexOf(n);
      if (i === -1) continue;
      if (isCommentedOccurrence(line, i)) commented = true;
      else real = true;
    }
    if (real) break;
  }
  return { real, commented };
}

/**
 * Evidence that `mod` is depended on, split by how.
 *
 * The distinction between `import` and `fspath` is the whole point: a module
 * path literal is an import-graph edge, while the same string inside
 * `readFileSync(...)` or a route manifest is a dependency that no import graph
 * can see. They are counted apart so a reader can tell which kind they are
 * looking at rather than being handed one merged number to trust.
 *
 * `mention` is the third thing, and it is the one this file got wrong: a name
 * written into a comment is neither. It is counted separately and never held.
 */
function evidenceFor(mod, corpus) {
  const noExt = mod.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
  const base = path.basename(mod);
  const baseNoExt = path.basename(noExt);
  const dir = path.dirname(mod);
  const isIndex = baseNoExt === 'index';

  // Module specifiers may be relative ('../middleware/authAdapter'), aliased,
  // or extension-swapped ('.js' naming a '.ts' file — the ESM quirk the other
  // gate documents). Matching the tail of the path covers all three.
  const tail = noExt.replace(/^(server|client\/src|shared)\//, '');
  const importPats = [noExt, tail];
  if (isIndex) importPats.push(dir, dir.replace(/^(server|client\/src|shared)\//, ''));

  const out = { import: [], fspath: [], config: [], doc: [], mention: [] };

  for (const { rel, text } of corpus) {
    if (rel === mod) continue;
    if (!text.includes(baseNoExt) && !(isIndex && text.includes(path.basename(dir)))) continue;

    const kind = kindOf(rel);

    // An import specifier that RESOLVES to this module.
    //
    // Two earlier attempts got this wrong and both are why the resolution is
    // done properly here rather than by string matching:
    //
    //   1. A malformed "import ... from '...'" regex reported 2 importers for
    //      surfaceViews.ts, which 100 files import.
    //   2. Extracting literals and tail-matching them reported 6, because a
    //      relative specifier — `from '../surfaceViews'` — does not contain the
    //      module's repo-relative path at all. No amount of suffix comparison
    //      can connect the two.
    //
    // Both passed a control that only asked "any reference at all?". The floors
    // in CONTROLS exist because of that. The only correct method is to resolve
    // each specifier against the directory of the file it appears in, exactly
    // as the bundler does, and compare resolved paths.
    let isImport = false;
    for (const raw of text.matchAll(/['"`]([^'"`\n\s]{2,200})['"`]/g)) {
      const spec = raw[1];
      if (!spec.startsWith('.') && !spec.startsWith('@/') && !spec.startsWith('@shared/')
          && !spec.startsWith('server/') && !spec.startsWith('client/') && !spec.startsWith('shared/')) continue;
      // A literal ending in `.ts`/`.tsx` is a FILESYSTEM PATH, never an import
      // specifier — TypeScript rejects those extensions in module specifiers.
      // Without this the security test's
      // `path.join(repoRoot, 'server/middleware/authAdapter.ts')` was scored as
      // an import-graph edge, which is precisely the kind of reference that
      // control exists to prove the import graph CANNOT see.
      if (/\.(ts|tsx)$/.test(spec)) continue;
      let resolved;
      if (spec.startsWith('@/')) resolved = path.posix.join('client/src', spec.slice(2));
      else if (spec.startsWith('@shared/')) resolved = path.posix.join('shared', spec.slice(8));
      else if (spec.startsWith('.')) resolved = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
      else resolved = path.posix.normalize(spec);
      resolved = resolved.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
      // `./x` may name x.ts or x/index.ts — both are this module if they land here.
      if (resolved === noExt || (isIndex && resolved === dir)) { isImport = true; break; }
    }

    // The path as data: readFileSync, path.join segments, manifests, argv.
    // Prose in a comment is NOT that, and is bucketed as `mention` instead.
    const hit = occurrences(text, [mod, noExt]);

    if (isImport && kind === 'code') out.import.push(rel);
    else if (kind === 'doc') { if (hit.real || hit.commented) out.doc.push(rel); }
    else if (hit.real) { if (kind === 'config') out.config.push(rel); else out.fspath.push(rel); }
    else if (hit.commented) out.mention.push(rel);
  }
  return out;
}

function loadCandidates() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'scripts/ci/unreferenced-modules-baseline.json'), 'utf8'),
  );
  return raw.modules;
}

/**
 * Modules whose status is known WITHOUT this checker, used to test it.
 *
 * `expect: 'referenced'` entries must come back with evidence. If the checker
 * reports them clean it is broken, and the run fails — which is the only way a
 * result from this file is worth anything.
 */
/*
 * `minImport` is what makes a control a test rather than a formality. An
 * earlier version asserted only "referenced vs clean", so the checker could
 * report 2 importers for a file that 100 files import and still pass. A
 * control that cannot fail on a 50x undercount is not measuring anything.
 * These floors are set from counts obtained independently with ripgrep.
 */
const CONTROLS = [
  {
    mod: 'server/middleware/authAdapter.ts',
    expect: 'referenced',
    minFspath: 1,
    // `maxImport: 0` is the control on the `.ts`-literal fix. Nothing imports
    // this module — that is the entire reason it is the flagship example in
    // this file's header. Before the fix the checker reported import 2, taking
    // the security test's `path.join(repoRoot, '...authAdapter.ts')` for an
    // import edge, so the header and the output contradicted each other and
    // the fspath floor was being met by an unrelated comment elsewhere.
    maxImport: 0,
    why: 'read via fs.readFileSync by server/__tests__/security/auth-db-contract-smoke.test.ts, which asserts its export shape — invisible to every import graph',
  },
  {
    mod: 'server/middleware/apiValidation.ts',
    expect: 'referenced',
    // The control on the comment fix. Its only appearance outside docs/ is one
    // sentence of JSDoc prose in server/utils/expressQuery.ts. Counting that as
    // a filesystem-path dependency put this and three other modules in the
    // `held by code` bucket on the strength of somebody writing their name down.
    maxFspath: 0,
    why: 'named ONLY in a JSDoc sentence in server/utils/expressQuery.ts — a mention, not a dependency',
  },
  {
    mod: 'server/routes/chat-actions.ts',
    expect: 'referenced',
    why: 'mounted from a route MANIFEST of path strings, not an import literal (register-advanced-platform-routes.ts)',
  },
  {
    mod: 'client/src/concept2cure/v2/surfaceViews.ts',
    expect: 'referenced',
    minImport: 60,
    why: 'the v2 renderer map; ripgrep counts 100 files importing it',
  },
  {
    mod: 'server/services/ana/AnaToolExecutor.ts',
    expect: 'referenced',
    minImport: 20,
    why: 'the AnA tool executor; ripgrep counts 153 files naming it',
  },
];

const corpus = buildCorpus();

if (CONTROLS_MODE) {
  console.log(`\n[prove-module-unused] corpus: ${corpus.length} text files\n`);
  console.log('CONTROLS — the checker must agree with what is already known:\n');
  let failed = 0;
  for (const c of CONTROLS) {
    if (!fs.existsSync(path.join(repoRoot, c.mod))) {
      console.log(`  SKIP  ${c.mod} (no longer present)`);
      continue;
    }
    const ev = evidenceFor(c.mod, corpus);
    const total = ev.import.length + ev.fspath.length + ev.config.length + ev.doc.length
      + ev.mention.length;
    const got = total > 0 ? 'referenced' : 'clean';
    const reasons = [];
    if (got !== c.expect) reasons.push(`expected ${c.expect}, got ${got}`);
    if (c.minImport && ev.import.length < c.minImport)
      reasons.push(`import ${ev.import.length} < floor ${c.minImport} — UNDERCOUNTING`);
    if (c.minFspath && ev.fspath.length < c.minFspath)
      reasons.push(`fspath ${ev.fspath.length} < floor ${c.minFspath} — missing path references`);
    // Ceilings catch OVERCOUNTING — a comment or a non-specifier literal being
    // scored as a dependency. A checker with only floors can only fail one way.
    if (c.maxImport !== undefined && ev.import.length > c.maxImport)
      reasons.push(`import ${ev.import.length} > ceiling ${c.maxImport} — OVERCOUNTING, a non-import literal is being scored as an import edge`);
    if (c.maxFspath !== undefined && ev.fspath.length > c.maxFspath)
      reasons.push(`fspath ${ev.fspath.length} > ceiling ${c.maxFspath} — OVERCOUNTING, prose is being scored as a path dependency`);
    const ok = reasons.length === 0;
    if (!ok) failed++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${c.mod}`);
    if (!ok) for (const r of reasons) console.log(`        ${r}`);
    console.log(`        import ${ev.import.length} · fspath ${ev.fspath.length} · config ${ev.config.length} · doc ${ev.doc.length} · mention ${ev.mention.length}`);
    console.log(`        why: ${c.why}`);
    if (ev.fspath.length) console.log(`        fspath e.g.: ${ev.fspath.slice(0, 2).join(', ')}`);
    console.log('');
  }
  console.log(failed === 0
    ? 'All controls agree. Results from this checker are worth reading.\n'
    : `${failed} control(s) DISAGREE — the checker is wrong. Do not trust its output.\n`);
  process.exit(failed === 0 ? 0 : 1);
}

const candidates = loadCandidates().filter((m) => fs.existsSync(path.join(repoRoot, m)));
const results = candidates.map((mod) => ({ mod, evidence: evidenceFor(mod, corpus) }));

const isHeld = (e) => e.import.length || e.fspath.length || e.config.length;
const clean = results.filter((r) =>
  !isHeld(r.evidence) && !r.evidence.doc.length && !r.evidence.mention.length);
const docOnly = results.filter((r) =>
  !isHeld(r.evidence) && (r.evidence.doc.length || r.evidence.mention.length));
const held = results.filter((r) => isHeld(r.evidence));

if (JSON_MODE) {
  console.log(JSON.stringify({
    corpusFiles: corpus.length,
    candidates: candidates.length,
    proposedForDeletion: clean.map((r) => r.mod),
    docOnly: docOnly.map((r) => ({ mod: r.mod, docs: r.evidence.doc, mentions: r.evidence.mention })),
    held: held.map((r) => ({ mod: r.mod, ...r.evidence })),
  }, null, 2));
} else {
  console.log(`\n[prove-module-unused] corpus ${corpus.length} files · ${candidates.length} candidates\n`);
  console.log(`  no reference of ANY kind          : ${clean.length}`);
  console.log(`  named only in docs or comments    : ${docOnly.length}`);
  console.log(`  held by code / fs-path / config   : ${held.length}`);
  console.log(`\nRun --controls first. Run --json for the per-module evidence.\n`);
}
