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

const tsc = spawnSync(
  'npx',
  ['tsc', '--noEmit', '-p', 'tsconfig.json'],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=6144' },
    maxBuffer: 64 * 1024 * 1024,
  }
);

const stderr = tsc.stderr || '';
const stdout = tsc.stdout || '';
const combined = stdout + stderr;

const errorCount = (combined.match(/error TS/g) || []).length;

console.log(`[ci:typecheck-no-regression] errors found: ${errorCount}`);

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
