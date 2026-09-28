#!/usr/bin/env node
/**
 * ESLint ERRORS in the commits being pushed — caught before the push, not by
 * whoever pulls next.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * `ci:eslint-warning-ratchet` lints the whole repo and gates the WARNING total.
 * It counts errors too, prints them, and passes anyway, on the stated grounds
 * that "`eslint .` itself exits 1 on any error and the Run ESLint step already
 * fails on that". Both halves are true, and together they leave a hole: the
 * ratchet is not on the pre-push hook either (it is minutes of work on 1,790
 * files), so on 19 Sep 2026 NOTHING ran ESLint before a push. Two lanes landed
 * the same `no-regex-spaces` error on trunk within an hour —
 *
 *     /if \(persist\) \{[\s\S]*?\n      \}/      ← six literal spaces
 *
 * an idiom anyone matching an indented code block writes by hand — and both
 * times the Run ESLint step went red for the next person to push, who had to
 * bisect somebody else's commit to find out why.
 *
 * ── Why the changed files, and errors only ──────────────────────────────────
 * Errors, because a warning is the ratchet's job and duplicating that here
 * would make two gates own one number. The changed files, because linting four
 * of them costs 1.4 seconds where the repo costs minutes, and the whole class
 * of defect this catches is a lane introducing an error into code it is
 * pushing. It is not a replacement for the CI lint step, which still sees
 * everything; it is the part of it that is affordable at push time.
 *
 * ── Fail closed ─────────────────────────────────────────────────────────────
 * ESLint exiting 2 (config error, crash) or emitting no parseable JSON is a
 * FAILURE, not a pass: a lint that could not run has examined nothing, and
 * reporting green over unexamined ground is what this directory of guards
 * exists to prevent. A push with no comparable upstream ref lints nothing and
 * says so.
 *
 * Usage:
 *   node scripts/ci/check-pushed-lint-errors.mjs            # against the upstream ref
 *   node scripts/ci/check-pushed-lint-errors.mjs --base REF # against an explicit ref
 */

import { spawnSync } from 'node:child_process';
import { changedSince, resolvePushBase } from './lib/push-range.mjs';

const TAG = '[ci:pushed-lint-errors]';
/** Extensions ESLint is configured for here. */
const LINTABLE = /\.(?:m|c)?[jt]sx?$/;

function fail(lines) {
  console.error(`\n${TAG} FAIL — ${lines[0]}`);
  for (const l of lines.slice(1)) console.error(l);
  process.exit(1);
}


const base = resolvePushBase(process.argv.slice(2));
if (!base) {
  console.log(`${TAG} no upstream ref to compare against — nothing to check.`);
  process.exit(0);
}

const all = changedSince(base);
if (all === null) {
  // Used to be `?? ''`: a failed git diff read as "nothing changed" and the gate
  // passed over files it never looked at.
  fail([`git diff against ${base} failed, so the pushed files are unknown.`]);
}
const changed = all.filter(f => LINTABLE.test(f));

if (changed.length === 0) {
  console.log(`${TAG} no lintable files changed against ${base}.`);
  process.exit(0);
}

const proc = spawnSync(
  'npx',
  ['eslint', '--format', 'json', '--no-error-on-unmatched-pattern', ...changed],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);
if (proc.error) fail([`could not spawn ESLint: ${proc.error.message}`]);
// 0 = clean, 1 = problems found; both mean ESLint ran. 2 = config error/crash.
if (proc.status !== 0 && proc.status !== 1) {
  fail([
    `ESLint exited ${proc.status === null ? `on signal ${proc.signal}` : `with code ${proc.status}`}` +
      ' — config error or crash, not a lint result.',
    '  A lint that could not run has examined nothing; this guard fails closed on that.',
  ]);
}

let report;
try {
  report = JSON.parse(proc.stdout);
} catch {
  fail([
    'ESLint produced no parseable JSON report.',
    '  Treated as a failure rather than a pass: see the note above.',
  ]);
}

const errors = [];
for (const file of report) {
  for (const m of file.messages) {
    if (m.severity === 2) {
      errors.push(
        `  ${file.filePath.replace(`${process.cwd()}/`, '')}:${m.line}:${m.column}  ` +
          `${m.message}  ${m.ruleId ?? '(fatal)'}`,
      );
    }
  }
}

if (errors.length > 0) {
  fail([
    `${errors.length} ESLint ERROR(s) in the ${changed.length} file(s) this push changes:`,
    ...errors.slice(0, 40),
    ...(errors.length > 40 ? [`  … and ${errors.length - 40} more`] : []),
    '',
    '  These fail the Run ESLint step in CI. Fixing them here costs a minute;',
    '  finding them there costs whoever pushes next a bisect of your commit.',
  ]);
}

console.log(`${TAG} OK — no ESLint errors in ${changed.length} changed file(s) against ${base}.`);
