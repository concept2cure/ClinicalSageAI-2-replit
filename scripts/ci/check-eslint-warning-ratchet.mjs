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
 *   node scripts/ci/check-eslint-warning-ratchet.mjs --since <ref>    # which FILES grew
 *   node scripts/ci/check-eslint-warning-ratchet.mjs --since <ref> --gate   # ... and exit 1 if they did
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

/* -- `--since <ref>`: which files gained warnings -----------------------------
 *
 * The ratchet says the total grew and names the rules. It cannot say WHERE,
 * because the baseline records per-rule counts, not per-file ones -- and a
 * per-file baseline for 6.5k warnings across ~1.7k files would be a merge
 * conflict on every branch. So the answer to "which file did this?" was, until
 * now, a manual hunt: check out the old tree somewhere else, lint it, diff the
 * two reports by hand. CLAUDE.md Rule 0 forbids the second worktree that makes
 * that convenient, so in practice nobody did it and red builds were resolved by
 * guessing.
 *
 * This mode does the hunt: for every file changed since <ref>, lint the current
 * bytes and the <ref> bytes and report the per-file delta. It lints only the
 * changed files (seconds, not the minutes a full `eslint .` takes) -- which is
 * sound here because a warning is a property of one file's contents, so a file
 * nobody touched cannot have changed its count.
 *
 * The <ref> bytes are linted from a SIBLING temp file, never by checking the
 * old version out over the working copy: a crash mid-run would otherwise leave
 * the developer's tree silently reverted. The temp name PREFIXES the basename
 * (`__eslint_ratchet_prev__.foo.test.ts`) so every suffix-shaped config glob --
 * `**\/*.test.ts`, `**\/*.tsx` -- and every directory-shaped ignore still
 * matches exactly as it does for the real file. Renaming to a different suffix
 * would lint the old bytes under a different rule set and invent deltas.
 */
function runSinceMode(ref) {
  const git = (args, opts = {}) =>
    spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });

  const resolved = git(['rev-parse', '--verify', `${ref}^{commit}`]);
  if (resolved.status !== 0) {
    fail([
      `\`${ref}\` is not a commit this repository knows.`,
      '  Pass something git can resolve -- a SHA, a tag, `origin/concept2cure-v2`,',
      '  `HEAD~5`. Fetch first if it is a remote ref you have not seen yet.',
    ]);
  }
  const sha = resolved.stdout.trim();

  // ref -> WORKING TREE (not ref -> HEAD): when the gate is red locally the
  // offending edit is usually still uncommitted, and a diff that stopped at
  // HEAD would report "no files changed" on exactly that case.
  const diff = git(['diff', '--name-status', '--no-renames', sha, '--']);
  if (diff.status !== 0) {
    fail([`\`git diff ${ref}\` failed: ${(diff.stderr || '').trim()}`]);
  }

  const LINTABLE = /\.(js|jsx|cjs|mjs|ts|tsx|mts|cts)$/;
  /** @type {{file: string, status: string}[]} */
  const changed = [];
  for (const line of diff.stdout.split('\n')) {
    if (!line.trim()) continue;
    const [status, file] = line.split('\t');
    if (!file || !LINTABLE.test(file)) continue;
    changed.push({ file, status: status[0] });
  }

  if (changed.length === 0) {
    console.log(`${TAG} no lintable file changed between ${ref} and the working tree.`);
    console.log(
      '  If the ratchet is red anyway, the growth came from a file this diff does not\n' +
        '  cover -- widen <ref>, or check that you fetched the ref you are comparing to.',
    );
    process.exit(0);
  }

  console.log(
    `${TAG} --since ${ref} (${sha.slice(0, 9)}) -- ${changed.length} lintable file(s) changed; ` +
      'linting both versions of each...',
  );

  const currentFiles = changed
    .filter((c) => c.status !== 'D' && fs.existsSync(path.join(repoRoot, c.file)))
    .map((c) => c.file);

  const PREV_PREFIX = '__eslint_ratchet_prev__.';
  /** @type {Map<string,string>} temp path -> original path */
  const tempToReal = new Map();
  const cleanup = () => {
    for (const tmp of tempToReal.keys()) {
      try { fs.unlinkSync(path.join(repoRoot, tmp)); } catch { /* already gone */ }
    }
    tempToReal.clear();
  };
  // Cleanup on the ways out that skip `finally`: ^C, and a throw that escapes.
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });
  process.on('exit', cleanup);

  let currentByFile;
  let prevByFile;
  try {
    for (const { file, status } of changed) {
      if (status === 'A') continue; // did not exist at <ref>
      const show = git(['show', `${sha}:${file}`], { maxBuffer: 64 * 1024 * 1024 });
      if (show.status !== 0) continue; // not present at <ref> after all
      const dir = path.dirname(file);
      if (!fs.existsSync(path.join(repoRoot, dir))) continue; // directory itself is gone
      const tmp = path.join(dir, PREV_PREFIX + path.basename(file));
      if (fs.existsSync(path.join(repoRoot, tmp))) {
        fail([
          `refusing to overwrite an existing file at ${tmp}.`,
          "  That path is this mode's scratch name; a leftover means a previous run died.",
          '  Delete it and re-run.',
        ]);
      }
      fs.writeFileSync(path.join(repoRoot, tmp), show.stdout);
      tempToReal.set(tmp, file);
    }

    currentByFile = messagesByFile(lintPaths(currentFiles), (p) => p);
    prevByFile = messagesByFile(lintPaths([...tempToReal.keys()]), (p) => tempToReal.get(p) ?? p);
  } finally {
    cleanup();
  }

  const allFiles = [...new Set([...currentByFile.keys(), ...prevByFile.keys()])].sort();
  const rows = allFiles
    .map((file) => {
      const now = currentByFile.get(file) ?? [];
      const was = prevByFile.get(file) ?? [];
      return {
        file,
        now: now.length,
        was: was.length,
        delta: now.length - was.length,
        nowMsgs: now,
        wasMsgs: was,
      };
    })
    .filter((r) => r.delta !== 0);

  const netGrowth = rows.reduce((n, r) => n + r.delta, 0);

  if (rows.length === 0) {
    console.log(`${TAG} no file changed its warning count since ${ref}.`);
    process.exit(0);
  }

  console.log('');
  let sawApproximate = false;
  for (const r of rows.sort((a, b) => b.delta - a.delta || a.file.localeCompare(b.file))) {
    const sign = r.delta > 0 ? `+${r.delta}` : `${r.delta}`;
    console.log(`  ${sign.padStart(4)}  ${r.file}  (${r.was} -> ${r.now})`);
    if (r.delta > 0) {
      for (const m of newMessages(r.nowMsgs, r.wasMsgs, changedLinesOf(git, sha, r.file))) {
        console.log(
          `         ${r.file}:${m.line}:${m.column}  ${m.ruleId ?? NO_RULE}  ${m.message}` +
            (m.approximate ? '   [position approximate — see below]' : ''),
        );
        if (m.approximate) sawApproximate = true;
      }
    }
  }

  console.log(
    `\n${TAG} net ${netGrowth > 0 ? `+${netGrowth}` : netGrowth} warning(s) across the files ` +
      `changed since ${ref}.`,
  );
  if (netGrowth > 0) {
    console.log(
      '  Those lines are what the ratchet is refusing. Fix them -- do not regenerate\n' +
        '  the baseline to make room.',
    );
  }
  if (sawApproximate) {
    console.log(
      '\n  [position approximate] means the file holds several warnings whose text is\n' +
        '  word-for-word identical, so the count grew but no single one of them can be\n' +
        '  named as the new one. The line shown is the best candidate -- the one your\n' +
        '  diff actually touched. Read the whole function, not just that line.',
    );
  }
  // `--gate`: the same report, as a refusal. Without it this mode is a
  // diagnostic and always exits 0; with it, growth across the changed files is
  // a failure -- the push-time gate (check-pushed-lint-warnings.mjs) runs it so
  // a warning is refused in the lane that wrote it, not found by the next lane
  // to push after CI goes red.
  if (process.argv.includes('--gate') && netGrowth > 0) {
    console.error(`\n${TAG} FAIL -- the changed files gained ${netGrowth} warning(s) (listed above).`);
    process.exit(1);
  }
  process.exit(0);
}

/**
 * The line numbers this file's diff touched, on the CURRENT side.
 *
 * Used only to break ties between identically-worded warnings; an empty set is
 * a degraded report, never a wrong answer.
 */
function changedLinesOf(git, sha, file) {
  const out = git(['diff', '-U0', sha, '--', file]);
  if (out.status !== 0) return [];
  const lines = [];
  for (const line of out.stdout.split('\n')) {
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    for (let i = 0; i < count; i += 1) lines.push(start + i);
  }
  return lines;
}

/** Lint an explicit list of repo-relative paths; returns the ESLint JSON report. */
function lintPaths(files) {
  if (files.length === 0) return [];
  const eslintBin = path.join(repoRoot, 'node_modules', 'eslint', 'bin', 'eslint.js');
  if (!fs.existsSync(eslintBin)) {
    fail(['node_modules/eslint/bin/eslint.js not found. Run `npm ci` first.']);
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-ratchet-since-'));
  const outFile = path.join(tmpDir, 'report.json');
  const proc = spawnSync(
    process.execPath,
    [
      eslintBin,
      '--format', 'json',
      '--output-file', outFile,
      // An ignored file is skipped on BOTH sides identically, so it contributes
      // no delta; the per-file "ignored" warning would otherwise be counted as
      // a real one and invent them.
      '--no-warn-ignored',
      '--no-error-on-unmatched-pattern',
      ...files,
    ],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (proc.error) fail([`could not spawn ESLint: ${proc.error.message}`]);
  if (proc.status !== 0 && proc.status !== 1) {
    fail([
      `ESLint exited ${proc.status === null ? `on signal ${proc.signal}` : `with code ${proc.status}`} -- not a lint result.`,
      proc.stderr
        ? `\n  ESLint stderr:\n${proc.stderr.trimEnd().split('\n').map((l) => `    ${l}`).join('\n')}`
        : '',
    ]);
  }
  let raw;
  try {
    raw = fs.readFileSync(outFile, 'utf8');
  } catch {
    fail([`ESLint exited ${proc.status} but wrote no JSON report -- failing closed.`]);
  }
  return parseReport(raw, `eslint exit ${proc.status}`);
}

/** report -> Map<repo-relative path, warning messages>, keyed through `rename`. */
function messagesByFile(report, rename) {
  const byFile = new Map();
  for (const result of report) {
    const rel = path.relative(repoRoot, result.filePath);
    const key = rename(rel);
    const warnings = (result.messages ?? []).filter((m) => m.severity === 1);
    byFile.set(key, [...(byFile.get(key) ?? []), ...warnings]);
  }
  return byFile;
}

/**
 * Warnings present now that were not present at <ref>.
 *
 * Keyed on rule + message SHAPE, as a multiset. Two normalisations, each for a
 * way the naive key over-reports:
 *
 *  - position is not in the key at all: line numbers move when anything above
 *    them is edited, so matching on it would call every warning in a file whose
 *    top changed "new";
 *  - digit runs are masked, because these rules put a measurement in the text.
 *    `File has too many lines (4695)` and `(4699)` are the SAME warning, one
 *    line longer; keying on the literal string reported both the disappearance
 *    of the old one and the arrival of a new one, so a file that gained 2
 *    warnings listed 6.
 *
 * Which leaves the case those normalisations create. When a file holds many
 * warnings whose text is word-for-word identical — AnaToolExecutor.ts carries
 * TWENTY-FOUR `Async arrow function has a complexity of 17` — the multiset can
 * say one was added and cannot say which. Reporting an arbitrary one is worse
 * than saying nothing: it is a specific line number, and a reader trusts it. So
 * candidates are ranked by how many of the diff's own changed lines fall inside
 * them (from the warning's line to the next same-shaped warning, since a
 * function-level warning is reported at the function's first line and the edit
 * lands in its body), and anything picked without that evidence is flagged
 * `approximate` rather than presented as fact.
 */
function newMessages(now, was, changedLines = []) {
  const shape = (m) => `${m.ruleId ?? NO_RULE} ${String(m.message).replace(/\d+/g, '#')}`;

  const wasCount = new Map();
  for (const m of was) {
    const k = shape(m);
    wasCount.set(k, (wasCount.get(k) ?? 0) + 1);
  }

  const byShape = new Map();
  for (const m of now) {
    const k = shape(m);
    byShape.set(k, [...(byShape.get(k) ?? []), m]);
  }

  const added = [];
  for (const [k, listUnsorted] of byShape) {
    const list = [...listUnsorted].sort((a, b) => a.line - b.line);
    const extra = list.length - (wasCount.get(k) ?? 0);
    if (extra <= 0) continue;
    if (list.length === extra) {
      // Every one of them is new; nothing to disambiguate.
      added.push(...list);
      continue;
    }
    // Rank by changed lines falling between this warning and the next of the
    // same shape — the span a function-level warning actually covers.
    const scored = list.map((m, i) => {
      const upper = i + 1 < list.length ? list[i + 1].line : Number.POSITIVE_INFINITY;
      const score = changedLines.filter((l) => l >= m.line && l < upper).length;
      return { m, score };
    });
    scored.sort((a, b) => b.score - a.score || a.m.line - b.m.line);
    for (const { m, score } of scored.slice(0, extra)) {
      added.push(score > 0 ? m : { ...m, approximate: true });
    }
  }

  return added.sort((a, b) => a.line - b.line || a.column - b.column);
}

const sinceIdx = process.argv.indexOf("--since");
if (sinceIdx !== -1) {
  const ref = process.argv[sinceIdx + 1];
  if (!ref || ref.startsWith("--")) {
    fail([
      "--since needs a git ref to compare against.",
      "  e.g. `" + SELF + " --since origin/concept2cure-v2`",
    ]);
  }
  runSinceMode(ref);
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
      `  one is invisible in it without this gate.\n\n` +
      `  To find WHICH FILES grew — the question this per-rule report cannot answer —\n` +
      `  lint both versions of everything you changed:\n` +
      `    ${SELF} --since origin/concept2cure-v2\n` +
      `  (a SHA, a tag or HEAD~n works too; it takes seconds, not the minutes a full\n` +
      `  \`eslint .\` does, because it lints only the changed files). \`${SELF} --list\`\n` +
      `  gives per-rule counts. Fix the new warnings. Do NOT regenerate the baseline to\n` +
      `  make room; it moves in one direction.\n`,
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
