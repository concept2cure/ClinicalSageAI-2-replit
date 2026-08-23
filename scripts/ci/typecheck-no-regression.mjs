#!/usr/bin/env node
/**
 * CI gate: typecheck error count must not increase above baseline.
 *
 * Mirrors the established `migration-prefix-collisions` baseline pattern.
 * The codebase has a known cohort of pre-existing type errors that
 * predate the RLS rollout. They were invisible until a separate parse
 * error in server/routes/auth.ts:842 was fixed (tsc bails on parse
 * errors and never typechecks anything that transitively imports the
 * broken file). Fixing 2,600 errors at once is out of scope for any
 * single PR; ignoring them is dishonest. The middle path: pin a
 * baseline, fail PRs that grow it, ratchet it down over time.
 *
 * Behavior:
 *   - Default: counts errors, fails if count > baseline (regression).
 *     Notes if count < baseline (PR reduced errors — should call
 *     :write-baseline so the gain is locked in for future PRs).
 *   - --write-baseline: updates .typecheck-baseline.json with the
 *     current count. Run intentionally; commit the result.
 *
 * Baseline file: .typecheck-baseline.json at repo root.
 *
 * The error count is the line count of "error TS" matches in tsc
 * output. Coarse but sufficient — if a PR adds a single new error,
 * the count goes up; we don't need fingerprint-level precision.
 *
 * Usage:
 *   node scripts/ci/typecheck-no-regression.mjs
 *   node scripts/ci/typecheck-no-regression.mjs --write-baseline
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');
const baselinePath = path.join(repoRoot, '.typecheck-baseline.json');


/** Installed TypeScript version, for the config-failure message. Best-effort. */
function tscVersion() {
  const r = spawnSync('npx', ['tsc', '--version'], { cwd: repoRoot, encoding: 'utf8' });
  return (r.stdout || r.stderr || 'unknown').trim();
}

const args = process.argv.slice(2);
const writeBaseline = args.includes('--write-baseline');

if (!fs.existsSync(baselinePath)) {
  console.error(`[ci:typecheck-no-regression] missing baseline file ${baselinePath}`);
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const baselineCount = baseline.errorCount;
if (typeof baselineCount !== 'number') {
  console.error(`[ci:typecheck-no-regression] baseline.errorCount missing or non-numeric`);
  process.exit(1);
}

console.log(`[ci:typecheck-no-regression] running tsc --noEmit (baseline: ${baselineCount})`);

// Heap. tsc OOMs on this project at 6144 MB — reproduced on a 15 GB host, where
// it thrashed for 379 s and then died with "Ineffective mark-compacts near heap
// limit". It completes at 24576. Overridable so a smaller runner can tune it,
// but the default must be a value that actually finishes: a cap that kills the
// compiler is indistinguishable from a clean run to the counter below.
const heapMb = process.env.TYPECHECK_HEAP_MB || '24576';

const tsc = spawnSync(
  'npx',
  ['tsc', '--noEmit', '-p', 'tsconfig.json'],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${heapMb}` },
    maxBuffer: 64 * 1024 * 1024,
  }
);

const stderr = tsc.stderr || '';
const stdout = tsc.stdout || '';
const combined = stdout + stderr;

const errorCount = (combined.match(/error TS/g) || []).length;

// ─────────────────────────────────────────────────────────────────────────────
// Did the compiler actually finish?
//
// THE INCIDENT. This gate counted `error TS` matches and compared them to the
// baseline, and did nothing else. When tsc ran out of memory it died with a V8
// fatal error — a message containing ZERO `error TS` substrings — so errorCount
// came out 0, which is <= a baseline of 0, and the gate printed "OK" and exited
// 0. The gate passed *because* the compiler crashed. It was observed doing this
// in CI on a tree carrying two real TS7016 errors (PR #1180).
//
// tsc's own exit codes: 0 = clean, 1 and 2 = diagnostics reported. Anything else
// — a null status (killed by a signal, which is what OOM looks like), a spawn
// error, or a status > 2 — means the run did not complete and errorCount is
// meaningless rather than reassuring. Fail loudly instead of silently passing.
// ─────────────────────────────────────────────────────────────────────────────
const abnormal =
  tsc.error != null ||
  tsc.status === null ||
  tsc.status === undefined ||
  tsc.status > 2;

if (abnormal) {
  console.error('[ci:typecheck-no-regression] FAIL — tsc did not complete.');
  console.error(
    `  exit status : ${tsc.status === null ? 'null (killed by signal ' + tsc.signal + ')' : tsc.status}`
  );
  if (tsc.error) console.error(`  spawn error : ${tsc.error.message}`);
  console.error(`  heap cap    : ${heapMb} MB (override with TYPECHECK_HEAP_MB)`);
  console.error('  The error count below is NOT trustworthy — the compiler died before finishing.');
  console.error('  Last 40 lines of output:');
  console.error(
    combined.split('\n').slice(-40).map((l) => `    ${l}`).join('\n')
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Did the compiler check anything AT ALL?
//
// THE SECOND INCIDENT. The guard above catches a compiler that died. It does
// not catch a compiler that ran perfectly and checked nothing.
//
// On 2026-08-13 Dependabot bumped typescript 5.6.3 -> 7.0.2 (1b3c154). TS 7
// removed `baseUrl` and `moduleResolution: node10`, both of which tsconfig.json
// used. From that commit tsc rejected the CONFIG and typechecked ZERO FILES —
// while exiting 1 and printing five well-formed `error TS` lines. Every guard
// here passed: the process completed, the status was 1, the count parsed. The
// gate reported "error count 5 exceeds baseline 0" and told the operator to
// either fix the errors or run write-baseline.
//
// Following that advice would have written errorCount: 5 and turned the gate
// permanently green over a typechecker that checks nothing. Nobody ran it, so
// instead the repo simply had no typechecking for a week, and a silently
// deleted endpoint went unnoticed because the gate that existed to catch it
// was inert.
//
// A config diagnostic is categorically different from a type error and must
// never be counted as one. tsc reports them against the tsconfig file itself,
// and they carry the TS5xxx / TS6xxx "option" codes. When any appear, the
// number below describes nothing about the source tree.
// ─────────────────────────────────────────────────────────────────────────────
const configDiagnostics = combined
  .split('\n')
  .filter((line) => /error TS/.test(line))
  .filter((line) => /^\s*tsconfig[\w.-]*\.json\(/.test(line) || /error TS[56]\d{3}:/.test(line));

if (configDiagnostics.length > 0) {
  console.error(
    '[ci:typecheck-no-regression] FAIL — tsc rejected the CONFIG, so NOTHING was typechecked.'
  );
  console.error('');
  for (const line of configDiagnostics) console.error(`    ${line}`);
  console.error('');
  console.error('  This is not a type regression and the error count means nothing here.');
  console.error('  Fix tsconfig.json for the installed TypeScript, then re-run.');
  console.error(`  installed TypeScript: ${tscVersion()}`);
  console.error('');
  console.error('  Do NOT run write-baseline to clear this. Baselining a run that');
  console.error('  checked zero files leaves the gate green over a dead typechecker —');
  console.error('  which is exactly how this went unnoticed for a week in 2026-08.');
  process.exit(1);
}

// A completed run that reports diagnostics must have produced at least one
// parseable "error TS" line. If it did not, the output was truncated or the
// process died mid-write — same class of problem, same refusal to guess.
if (tsc.status > 0 && errorCount === 0) {
  console.error(
    `[ci:typecheck-no-regression] FAIL — tsc exited ${tsc.status} (diagnostics reported) but no "error TS" lines were parsed.`
  );
  console.error('  Output was truncated or the process died mid-write; the count cannot be trusted.');
  process.exit(1);
}

console.log(`[ci:typecheck-no-regression] errors found: ${errorCount} (tsc exit ${tsc.status})`);

if (writeBaseline) {
  const next = { ...baseline, errorCount };
  next._history = Array.isArray(baseline._history) ? [...baseline._history] : [];
  next._history.push(
    `${new Date().toISOString().slice(0, 10)}: ${errorCount}. Updated via --write-baseline (was ${baselineCount}).`
  );
  fs.writeFileSync(baselinePath, JSON.stringify(next, null, 2) + '\n');
  console.log(
    `[ci:typecheck-no-regression] baseline updated: ${baselineCount} -> ${errorCount}`
  );
  process.exit(0);
}

if (errorCount > baselineCount) {
  const delta = errorCount - baselineCount;
  console.error(
    `[ci:typecheck-no-regression] FAIL — error count ${errorCount} exceeds baseline ${baselineCount} (+${delta}).`
  );
  console.error('  Either fix the new errors, or — if intentional — update the baseline:');
  console.error('    npm run ci:typecheck:write-baseline');
  console.error('');
  console.error('  Tail of tsc output (most recent first):');
  const errLines = combined
    .split('\n')
    .filter(line => line.includes('error TS'))
    .slice(-15);
  for (const line of errLines) console.error('    ' + line);
  process.exit(1);
}

if (errorCount < baselineCount) {
  const delta = baselineCount - errorCount;
  console.log(
    `[ci:typecheck-no-regression] OK — error count ${errorCount} is BELOW baseline ${baselineCount} (-${delta}).`
  );
  console.log(
    '  Consider running `npm run ci:typecheck:write-baseline` to ratchet the bar tighter.'
  );
  process.exit(0);
}

console.log(
  `[ci:typecheck-no-regression] OK — error count ${errorCount} matches baseline.`
);
