#!/usr/bin/env node
/**
 * Pre-push typecheck: run the canonical typecheck gate when a push could have
 * changed a type, and say plainly when it did not run.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * CI gates on ANY type error (.typecheck-baseline.json is ratcheted to 0). But
 * CLAUDE.md Rule 0 makes concept2cure-v2 the only branch — direct pushes, no PRs
 * — so CI runs only AFTER a push has already landed, and nothing in pre-push
 * typechecked. Twice on 2026-09-19 a red typecheck reached trunk that way, both
 * from tests not updated when a signature tightened, and each time the next
 * person to push had to find and fix someone else's error.
 *
 * ── What it runs ────────────────────────────────────────────────────────────
 * Not tsc. scripts/ci/typecheck-no-regression.mjs --incremental — the same gate
 * CI runs, with the two guards that script earned from real incidents: a tsc
 * that died of OOM once counted as a clean pass, and a tsconfig rejected by a
 * TypeScript upgrade once checked ZERO files for a week while looking like an
 * ordinary failure. A second typecheck implementation here would have neither.
 *
 * --incremental keeps a build-info cache under node_modules/.cache. Measured on
 * this repo: ~300 s cold (once, after an install), ~45 s warm, ~95 s after
 * editing a widely imported file. Verified before this was wired in, by making
 * each case fail: an error in a file the push did not touch is still reported
 * from the cache, and a signature change fails its callers in other files.
 *
 * ── When it runs ────────────────────────────────────────────────────────────
 * When the push changes anything that can change a type:
 *   - a .ts / .tsx / .mts / .cts file, deletions INCLUDED — deleting a module
 *     breaks every importer, which is why the shared helper's lint-oriented
 *     default of ACMR is overridden here;
 *   - a .json file under an included root, because tsconfig sets
 *     resolveJsonModule and imported JSON is typed;
 *   - any tsconfig*.json or package-lock.json;
 *   - package.json, but only when a field that can reach a type changed —
 *     dependencies, devDependencies, optional/peer dependencies, overrides,
 *     `type`, `types`/`typings`, `exports`, `imports`, `typesVersions`, `main`.
 *     Measured before this was narrowed: of the last 38 commits touching
 *     package.json, 33 changed ONLY `scripts`. Each of those ran a typecheck
 *     that could not find anything, and on a branch this busy a slower hook is
 *     not free — it widens the window in which another session's push lands
 *     first and this one is rejected (`cannot lock ref`), which is exactly what
 *     happened four times in a row to the push that introduced this gate.
 * A push of docs or SQL alone skips it and says so. A push whose changed files
 * cannot be determined RUNS it: this is a whole-tree check, and "could not tell
 * what changed" is not evidence that nothing did.
 *
 * Usage:
 *   node scripts/ci/check-pushed-typecheck.mjs              # against the upstream
 *   node scripts/ci/check-pushed-typecheck.mjs --base REF   # against an explicit ref
 *   node scripts/ci/check-pushed-typecheck.mjs --dry-run    # decide, do not run tsc
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedSince, git, resolvePushBase } from './lib/push-range.mjs';

const TAG = '[ci:pushed-typecheck]';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** tsconfig.json `include` roots — the only places a .json import is typed. */
const INCLUDED_ROOTS = ['client/src/', 'server/', 'shared/', 'agents/'];

/** Whether a changed path can change the result of `tsc -p tsconfig.json`. */
export function isTypeRelevant(file) {
  const f = file.replace(/\\/g, '/');
  if (/\.(?:[cm]?tsx?)$/.test(f)) return true;
  const base = f.split('/').pop();
  if (/^tsconfig[\w.-]*\.json$/.test(base)) return true;
  // package.json is handled by packageJsonChangesTypes(), not here: most edits to
  // it are `scripts`, which no type can see.
  if (f === 'package-lock.json') return true;
  if (f.endsWith('.json') && INCLUDED_ROOTS.some(r => f.startsWith(r))) return true;
  return false;
}

/** package.json fields that can change what tsc resolves or how. */
const TYPE_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'overrides',
  'type',
  'types',
  'typings',
  'exports',
  'imports',
  'typesVersions',
  'main',
];

/**
 * Whether package.json changed in a way a type can see, between the merge-base
 * with `base` and HEAD. Unknown — git failed, either side unparseable — counts as
 * YES: this decides whether a check runs, and "could not tell" must run it.
 */
export function packageJsonChangesTypes(base, readAt = readJsonAt) {
  const mergeBase = git(['merge-base', base, 'HEAD']);
  if (!mergeBase) return true;
  const before = readAt(mergeBase);
  const after = readAt('HEAD');
  if (before === undefined || after === undefined) return true; // unreadable
  if (before === null || after === null) return before !== after; // added/removed
  return TYPE_FIELDS.some(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

/** package.json at a revision: the object, null when absent, undefined when unreadable. */
function readJsonAt(rev) {
  const exists = git(['cat-file', '-e', `${rev}:package.json`]);
  if (exists === null) return null;
  const text = git(['show', `${rev}:package.json`]);
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const base = resolvePushBase(argv);

  let reason;
  if (!base) {
    reason =
      'no upstream ref resolves, so the pushed files are unknown — running the whole-tree check';
  } else {
    // ACMRD: deletions matter here in a way they do not for lint.
    const changed = changedSince(base, { diffFilter: 'ACMRD' });
    if (changed === null) {
      reason = `git diff against ${base} failed, so the pushed files are unknown — running the whole-tree check`;
    } else {
      const relevant = changed.filter(isTypeRelevant);
      if (changed.includes('package.json') && packageJsonChangesTypes(base)) {
        relevant.push('package.json');
      }
      if (relevant.length === 0) {
        console.log(
          `${TAG} skipped — none of the ${changed.length} file(s) changed against ${base} can change a type.`
        );
        return 0;
      }
      const shown =
        relevant.slice(0, 5).join(', ') +
        (relevant.length > 5 ? `, +${relevant.length - 5} more` : '');
      reason = `${relevant.length} type-relevant file(s) changed against ${base}: ${shown}`;
    }
  }

  console.log(`${TAG} ${reason}`);
  if (dryRun) {
    console.log(`${TAG} --dry-run: would run typecheck-no-regression --incremental.`);
    return 0;
  }

  const r = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'scripts', 'ci', 'typecheck-no-regression.mjs'), '--incremental'],
    { cwd: repoRoot, stdio: 'inherit' }
  );
  // A spawn failure or a signal is not a pass.
  if (r.error || r.status === null) {
    console.error(
      `${TAG} FAIL — the typecheck gate did not complete (${
        r.error?.message ?? `signal ${r.signal}`
      }).`
    );
    return 1;
  }
  return r.status;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
