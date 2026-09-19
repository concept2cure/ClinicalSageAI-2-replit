#!/usr/bin/env node
/**
 * A committed file must not import a module git does not have.
 *
 * ── The defect this exists to catch ─────────────────────────────────────────
 * `.gitignore` carried an unanchored `uploads/` under "Stray runtime
 * artifacts". Unanchored, that matches a directory of that name at ANY depth,
 * so `server/services/uploads/` — source — was silently excluded. `git add -A`
 * skipped it without a word, `git status` showed nothing, and the commit
 * shipped a route importing a module that was not in the repository. Trunk was
 * unbuildable and the author had no way to know.
 *
 * Nothing local could see it. Typecheck, the unit suites and the dbtests all
 * read the WORKING TREE, where the file exists; only the index disagreed, and
 * nothing consults the index. The one available signal — `git add -A` printing
 * nothing — is byte-identical to success.
 *
 * So this guard reads the index. For every relative import in the files a push
 * changes, it resolves the specifier the way the bundler and tsc do and asks
 * git, not the filesystem, whether the target is tracked. A file present on
 * disk and absent from git is exactly the state that passes every other check
 * here and breaks on a fresh clone.
 *
 * ── Scope ───────────────────────────────────────────────────────────────────
 * Relative specifiers only. A bare specifier is a package, which `npm ci`
 * resolves and a missing one fails loudly at install or import; there is no
 * silent-success mode there. Path aliases are left to tsc, which already
 * resolves them and is a separate gate.
 *
 * ── Fail closed ─────────────────────────────────────────────────────────────
 * A specifier that resolves to NOTHING — neither tracked nor on disk — is
 * reported too, under its own heading: that is a broken import whoever wrote it
 * should see, not a tracking problem, and passing over it would be reporting
 * green on unexamined ground.
 *
 * Usage:
 *   node scripts/ci/check-untracked-imports.mjs             # against the upstream ref
 *   node scripts/ci/check-untracked-imports.mjs --base REF
 *   node scripts/ci/check-untracked-imports.mjs --all       # every tracked source file
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TAG = '[ci:untracked-imports]';
const SOURCE = /\.(?:m|c)?[jt]sx?$/;
/** How TS/bundler resolution rewrites a specifier, in the order it tries. */
const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];
const INDEX_SUFFIXES = CANDIDATE_SUFFIXES.filter(Boolean).map(s => `/index${s}`);

function fail(lines) {
  console.error(`\n${TAG} FAIL — ${lines[0]}`);
  for (const l of lines.slice(1)) console.error(l);
  process.exit(1);
}

function git(args) {
  const p = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return p.status === 0 ? p.stdout : null;
}

function resolveBase(argv) {
  const flag = argv.indexOf('--base');
  if (flag !== -1 && argv[flag + 1]) return argv[flag + 1];
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])?.trim();
  if (upstream && git(['rev-parse', '--verify', '--quiet', upstream])) return upstream;
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])?.trim();
  const remote = branch ? `origin/${branch}` : null;
  if (remote && git(['rev-parse', '--verify', '--quiet', remote])) return remote;
  return null;
}

const argv = process.argv.slice(2);
const tracked = new Set((git(['ls-files']) ?? '').split('\n').filter(Boolean));
if (tracked.size === 0) fail(['git ls-files returned nothing — not a repository, or git is unavailable.']);

let files;
if (argv.includes('--all')) {
  files = [...tracked].filter(f => SOURCE.test(f));
} else {
  const base = resolveBase(argv);
  if (!base) {
    console.log(`${TAG} no upstream ref to compare against — nothing to check.`);
    process.exit(0);
  }
  files = (git(['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`]) ?? '')
    .split('\n')
    .map(s => s.trim())
    .filter(f => f && SOURCE.test(f) && tracked.has(f));
  if (files.length === 0) {
    console.log(`${TAG} no source files changed against ${base}.`);
    process.exit(0);
  }
}

/** Relative specifiers in `from '…'`, `import('…')` and `require('…')`. */
const SPECIFIER = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](\.[^'"]*)['"]/g;

/** `./x?raw`, `./x?url`, `./x?worker` — a bundler query, not part of the path. */
function stripQuery(spec) {
  const q = spec.indexOf('?');
  return q === -1 ? spec : spec.slice(0, q);
}

/** The tracked path a specifier resolves to, or null. Mirrors tsc/bundler order. */
function resolveTracked(fromFile, spec) {
  const base = path.posix.join(path.posix.dirname(fromFile), stripQuery(spec));
  const stripped = base.replace(/\.(m|c)?js$/, '');
  for (const cand of [base, stripped]) {
    for (const suffix of CANDIDATE_SUFFIXES) {
      if (tracked.has(cand + suffix)) return cand + suffix;
    }
    for (const suffix of INDEX_SUFFIXES) {
      if (tracked.has(cand + suffix)) return cand + suffix;
    }
  }
  return null;
}

/** Whether the specifier exists on DISK — the difference that makes this a tracking bug. */
function existsOnDisk(fromFile, spec) {
  const base = path.posix.join(path.posix.dirname(fromFile), stripQuery(spec));
  const stripped = base.replace(/\.(m|c)?js$/, '');
  for (const cand of [base, stripped]) {
    for (const suffix of CANDIDATE_SUFFIXES) {
      if (fs.existsSync(cand + suffix) && fs.statSync(cand + suffix).isFile()) return true;
    }
    for (const suffix of INDEX_SUFFIXES) {
      if (fs.existsSync(cand + suffix)) return true;
    }
  }
  return false;
}

const untracked = [];
const missing = [];
for (const file of files) {
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {
    continue; // deleted in the working tree; the diff filter already excludes deletes
  }
  for (const m of src.matchAll(SPECIFIER)) {
    const spec = m[1];
    if (resolveTracked(file, spec)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    (existsOnDisk(file, spec) ? untracked : missing).push(`  ${file}:${line}  →  ${spec}`);
  }
}

if (untracked.length > 0) {
  fail([
    `${untracked.length} import(s) resolve to a file that is on disk but NOT in git:`,
    ...untracked.slice(0, 40),
    ...(untracked.length > 40 ? [`  … and ${untracked.length - 40} more`] : []),
    '',
    '  This builds for you and for nobody else. The usual cause is a .gitignore',
    '  pattern matching a source directory — check `git check-ignore -v <path>`,',
    '  and anchor the pattern with a leading slash if it names a root directory.',
    ...(missing.length > 0 ? ['', `  Also ${missing.length} import(s) resolve to nothing at all:`, ...missing.slice(0, 20)] : []),
  ]);
}
if (missing.length > 0) {
  fail([
    `${missing.length} import(s) resolve to nothing — neither tracked nor on disk:`,
    ...missing.slice(0, 40),
    ...(missing.length > 40 ? [`  … and ${missing.length - 40} more`] : []),
  ]);
}

console.log(`${TAG} OK — every relative import in ${files.length} file(s) resolves to a tracked file.`);
