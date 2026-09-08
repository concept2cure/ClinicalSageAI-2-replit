#!/usr/bin/env node
/**
 * CI Guard: ESLint warning ratchet — the count may only shrink.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `npm run lint` exits 0 as long as nothing is an ERROR, and this repo carries
 * ~6.7k WARNINGS — most of them rules deliberately demoted to 'warn' so an
 * upgrade or a plugin adoption could land without a 120-file cleanup in one PR
 * (see the eslint.config.js comments that promise exactly this ratchet). At
 * that volume the lint step is a green light bolted over a wall of noise: a
 * change that introduces fifty new `no-undef` warnings — each one a crash at
 * runtime — reports the same green as a change that introduces none. The
 * 2026-08 market-readiness assessment flagged this precisely: the backlog is
 * tolerated, but only frozen; nothing was watching the direction of travel.
 *
 * This guard watches the direction. It runs the SAME invocation as the CI
 * "Run ESLint" step (`eslint .` from the repo root, so the flat-config ignore
 * list is the single source of scope) and compares the total warning count
 * against scripts/ci/eslint-warning-baseline.json. More warnings than the
 * baseline fails the build and names the rules that grew. Fewer passes, with
 * a nudge to regenerate so the gain is locked in — the same convention as
 * check-phantom-tokens.mjs, check-shell-css-collisions.mjs and
 * check-orphaned-stylesheets.mjs: shrink is a pass plus "regenerate so the
 * ratchet holds", never a failure.
 *
 * The ratchet is on the TOTAL. Per-rule counts are recorded for reporting —
 * "which rules grew" is the first question a red build asks — but a +1/−1 swap
 * inside the same total passes, with the shift printed so it is at least
 * visible. Errors are not this guard's job: `eslint .` itself exits 1 on any
 * error and the "Run ESLint" step already fails on that.
 *
 * ── Fail closed ───────────────────────────────────────────────────────────────
 * An ESLint crash or config error (exit 2, or no parseable JSON) is a guard
 * FAILURE, never a pass. A lint step that cannot run reports nothing, and
 * reporting green over unexamined ground is the exact failure this directory
 * of guards exists to prevent. Same for a missing or hand-mangled baseline.
 *
 * Usage:
 *   node scripts/ci/check-eslint-warning-ratchet.mjs                  # gate
 *   node scripts/ci/check-eslint-warning-ratchet.mjs --list           # per-rule counts
 *   node scripts/ci/check-eslint-warning-ratchet.mjs --write-baseline # regenerate
 *
 * Test seams (same pattern as check-dependency-risk.mjs / NPM_AUDIT_JSON —
 * a full `eslint .` takes minutes, so the self-test injects the report):
 *   ESLINT_RATCHET_REPORT_JSON  path to a pre-generated `eslint --format json`
 *                               report to use instead of spawning ESLint
 *   ESLINT_RATCHET_BASELINE     baseline path override
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TAG = '[ci:eslint-warning-ratchet]';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE_FILE =
  process.env.ESLINT_RATCHET_BASELINE ||
  path.join(repoRoot, 'scripts/ci/eslint-warning-baseline.json');
const SELF = 'node scripts/ci/check-eslint-warning-ratchet.mjs';

/** Messages ESLint reports without a ruleId (rare outside fatal parse errors). */
const NO_RULE = '(no ruleId)';

function fail(lines) {
  console.error(`\n${TAG} FAIL — ${lines[0]}`);
  for (const l of lines.slice(1)) console.error(l);
  process.exit(1);
}

/**
 * Produce the ESLint JSON report — by running the CI step's own invocation.
 *
 * `eslint .` from the repo root, exactly as `npm run lint` does, so the
 * flat-config `ignores` block in eslint.config.js is the one and only
 * definition of what is in scope. Restating the scope here (a file list, a
 * glob) is how two gates drift into counting different worlds.
 *
 * `--output-file` rather than stdout capture: the JSON for thousands of
 * warnings runs tens of megabytes, and a maxBuffer overflow would surface as
 * a truncated-JSON parse failure — indistinguishable from a real crash.
 */
function produceReport() {
  if (process.env.ESLINT_RATCHET_REPORT_JSON) {
    let raw;
    try {
      raw = fs.readFileSync(process.env.ESLINT_RATCHET_REPORT_JSON, 'utf8');
    } catch (e) {
      fail([`injected report unreadable: ${e.message}`]);
    }
    return parseReport(raw, 'injected report');
  }

  const eslintBin = path.join(repoRoot, 'node_modules', 'eslint', 'bin', 'eslint.js');
  if (!fs.existsSync(eslintBin)) {
    fail([
      'node_modules/eslint/bin/eslint.js not found.',
      '  A guard that cannot run the linter cannot vouch for the count. Run `npm ci` first.',
    ]);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-warning-ratchet-'));
  const outFile = path.join(tmpDir, 'report.json');
  console.log(`${TAG} running \`eslint . --format json\` (the CI lint step's exact scope; takes a few minutes)…`);
  const proc = spawnSync(
    process.execPath,
    [eslintBin, '.', '--format', 'json', '--output-file', outFile],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  // Exit 0 = clean, 1 = lint problems found (errors and/or warnings) — both
  // mean ESLint RAN and the report is authoritative. Exit 2 = config error or
  // crash; anything else (signal, spawn failure) is a crash too. Fail closed:
  // a linter that did not run has counted nothing, and "nothing" must never
  // read as "no new warnings".
  if (proc.error) fail([`could not spawn ESLint: ${proc.error.message}`]);
  if (proc.status !== 0 && proc.status !== 1) {
    fail([
      `ESLint exited ${proc.status === null ? `on signal ${proc.signal}` : `with code ${proc.status}`} — config error or crash, not a lint result.`,
      '  This guard fails closed: a lint run that crashed has counted nothing.',
      proc.stderr ? `\n  ESLint stderr:\n${proc.stderr.trimEnd().split('\n').map((l) => `    ${l}`).join('\n')}` : '',
    ]);
  }

  let raw;
  try {
    raw = fs.readFileSync(outFile, 'utf8');
  } catch {
    fail([
      `ESLint exited ${proc.status} but wrote no JSON report.`,
      '  Fail closed: without a report there is no count to ratchet.',
    ]);
  }
  return parseReport(raw, `eslint exit ${proc.status}`);
}

function parseReport(raw, origin) {
  let report;
  try {
    report = JSON.parse(raw);
  } catch (e) {
    fail([
      `ESLint output is not valid JSON (${origin}): ${e.message}`,
      '  Fail closed: a truncated or crashed lint run must not pass the ratchet.',
    ]);
  }
  if (!Array.isArray(report)) {
    fail([
      `ESLint output is not a results array (${origin}).`,
      '  The `--format json` report is an array of file results; anything else is a',
      '  crash or an error envelope, and this guard fails closed on it.',
    ]);
  }
  return report;
}

/** total warnings, per-rule warning counts, and (for reporting only) error counts. */
function countWarnings(report) {
  const rules = new Map();
  let total = 0;
  let errors = 0;
  let files = 0;
  for (const result of report) {
    const messages = result?.messages;
    if (!Array.isArray(messages)) {
      fail(['a result entry has no messages array — malformed report, failing closed.']);
    }
    let sawWarning = false;
    for (const m of messages) {
      if (m.severity === 2) { errors += 1; continue; }
      if (m.severity !== 1) continue;
      const rule = m.ruleId ?? NO_RULE;
      rules.set(rule, (rules.get(rule) ?? 0) + 1);
      total += 1;
      sawWarning = true;
    }
    if (sawWarning) files += 1;
  }
  return { total, rules, errors, files };
}

const report = produceReport();
const current = countWarnings(report);
const sortedRules = [...current.rules.entries()].sort(
  (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
);

if (process.argv.includes('--write-baseline')) {
  // Keys alphabetical so a regeneration diffs as count changes, not a reshuffle.
  const rulesObj = Object.fromEntries(
    [...current.rules.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  );
  fs.writeFileSync(
    BASELINE_FILE,
    JSON.stringify(
      {
        $comment:
          'ESLint warning ratchet — the totalWarnings count may only SHRINK. Produced by ' +
          '`eslint .` (the CI lint step\'s exact scope) counting severity-1 messages. ' +
          'The gate fails when the total exceeds this number and names the rules that grew. ' +
          'Regenerate with `' + SELF + ' --write-baseline` ONLY after fixing warnings, so the ' +
          'gain is locked in — never to make room for new ones. Per-rule counts are for the ' +
          'red-build report; the ratchet is on the total.',
        $generated: new Date().toISOString().slice(0, 10),
        totalWarnings: current.total,
        ruleCount: current.rules.size,
        rules: rulesObj,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `${TAG} baseline written — ${current.total} warning(s) across ${current.files} file(s), ` +
      `${current.rules.size} rule(s).`,
  );
  process.exit(0);
}

if (!fs.existsSync(BASELINE_FILE)) {
  fail([
    'baseline missing. Generate it with:',
    `  ${SELF} --write-baseline`,
  ]);
}

let baseline;
try {
  baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
} catch (e) {
  fail([`baseline is not valid JSON: ${e.message}`]);
}
const baseTotal = baseline?.totalWarnings;
const baseRules = baseline?.rules;
if (!Number.isInteger(baseTotal) || baseTotal < 0 || typeof baseRules !== 'object' || baseRules === null) {
  fail([
    'baseline is malformed — totalWarnings must be a non-negative integer and rules an object.',
    `  Regenerate it: ${SELF} --write-baseline`,
  ]);
}
const baseRuleSum = Object.values(baseRules).reduce((n, c) => n + c, 0);
if (baseRuleSum !== baseTotal) {
  fail([
    `baseline is internally inconsistent — rules sum to ${baseRuleSum} but totalWarnings says ${baseTotal}.`,
    '  A hand-edited baseline is exactly the drift this gate exists to catch.',
    `  Regenerate it: ${SELF} --write-baseline`,
  ]);
}

if (process.argv.includes('--list')) {
  for (const [rule, count] of sortedRules) console.log(`  ${String(count).padStart(6)}  ${rule}`);
  console.log('');
}

const grown = sortedRules
  .map(([rule, count]) => ({ rule, count, base: baseRules[rule] ?? 0 }))
  .filter((r) => r.count > r.base)
  .sort((a, b) => (b.count - b.base) - (a.count - a.base) || a.rule.localeCompare(b.rule));
const shrunk = Object.entries(baseRules)
  .map(([rule, base]) => ({ rule, base, count: current.rules.get(rule) ?? 0 }))
  .filter((r) => r.count < r.base);

console.log(
  `${TAG} ${current.total} warning(s) across ${current.files} file(s), ` +
    `${current.rules.size} rule(s) (baseline ${baseTotal}).` +
    (current.errors > 0
      ? ` ${current.errors} error(s) also present — the Run ESLint step owns those.`
      : ''),
);

if (current.total > baseTotal) {
  console.error(
    `\n${TAG} FAIL — ${current.total - baseTotal} more warning(s) than the baseline allows ` +
      `(${current.total} > ${baseTotal}). Rules that grew:\n`,
  );
  for (const { rule, base, count } of grown) {
    console.error(`  ${rule}  ${base} → ${count}  (+${count - base})`);
  }
  console.error(
    `\n  Every count here was frozen so the backlog could be paid down, not added to —\n` +
      `  6.7k warnings is already a green light bolted over a wall of noise, and a new\n` +
      `  one is invisible in it without this gate. Fix the new warnings (run\n` +
      `  \`npm run lint\` for file:line detail, or \`${SELF} --list\`\n` +
      `  for per-rule counts). Do NOT regenerate the baseline to make room; it moves\n` +
      `  in one direction.\n`,
  );
  process.exit(1);
}

if (current.total < baseTotal) {
  console.log(
    `\n  ${baseTotal - current.total} fewer warning(s) than baseline — ratchet down so the gain is locked in.\n` +
      `  Regenerate the baseline in this same change:\n` +
      `    ${SELF} --write-baseline`,
  );
} else if (grown.length > 0) {
  // Same total, different mix: a new warning hiding behind a fixed one. The
  // ratchet's contract is the total, so this passes — but say what moved.
  console.log(`\n  Rule mix shifted within the same total (new warnings offset by fixes):`);
  for (const { rule, base, count } of grown) console.log(`    ${rule}  ${base} → ${count}  (+${count - base})`);
  for (const { rule, base, count } of shrunk) console.log(`    ${rule}  ${base} → ${count}  (−${base - count})`);
}

console.log(`${TAG} OK — warning count did not grow.`);
