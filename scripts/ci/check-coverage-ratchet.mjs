#!/usr/bin/env node
/**
 * check-coverage-ratchet.mjs — coverage may not go DOWN.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The CI `coverage` job measured coverage and could not fail, twice over: it
 * passed `--coverage.thresholds.{lines,functions,branches,statements}=0` AND
 * carried `continue-on-error: true`. Its own comment said the 70/60/70/70
 * target in vitest.config.ts was "the goal to enforce later", and the GA
 * readiness report listed it as outstanding with the note that the job
 * "measures, it never blocks".
 *
 * That is the shape this repo keeps finding and closing elsewhere — a gate that
 * has only ever been seen to pass. A number nobody can fail is a report, not a
 * gate, and it cannot notice the one thing that actually matters between now
 * and reaching the target: coverage going BACKWARDS.
 *
 * ── Why a ratchet rather than the 70/60/70/70 target ────────────────────────
 * Enforcing the target today would fail every build until thousands of tests
 * are written, so it would be reverted within a day and the job would go back
 * to blocking nothing. A ratchet is enforceable IMMEDIATELY: it pins the
 * numbers the suite actually achieves right now and refuses a drop. Coverage
 * can then only rise, and the target becomes something the baseline walks
 * toward rather than a cliff.
 *
 * Same pattern the repo already uses for eslint warnings, tenant resolvers,
 * writerless stores and typecheck errors: measure, freeze, allow only
 * improvement.
 *
 * ── The tolerance, and why it is not zero ───────────────────────────────────
 * v8 coverage is not bit-stable across runs: dynamic imports, timing-dependent
 * branches and worker scheduling move the last decimal. A zero-tolerance
 * ratchet would flap and be disabled, which is the failure mode this file
 * exists to prevent. TOLERANCE is the smallest slack that absorbs that noise
 * without hiding a real regression — a genuine drop is a whole test file's
 * worth, orders of magnitude larger.
 *
 * Usage:
 *   node scripts/ci/check-coverage-ratchet.mjs                  # enforce
 *   node scripts/ci/check-coverage-ratchet.mjs --write-baseline # re-pin
 *
 * Reads coverage/coverage-summary.json, which vitest writes with
 * `--coverage.reporter=json-summary`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:coverage-ratchet]';
const summaryPath = path.join(repoRoot, 'coverage', 'coverage-summary.json');
const baselinePath = path.join(repoRoot, 'scripts', 'ci', 'coverage-baseline.json');

/** Percentage points of slack. See the note above — this absorbs v8 jitter. */
const TOLERANCE = 0.5;

const METRICS = ['lines', 'statements', 'functions', 'branches'];

function readSummary() {
  if (!fs.existsSync(summaryPath)) {
    console.error(
      `${TAG} ❌ no coverage summary at coverage/coverage-summary.json.\n\n` +
        '  This gate reads the report; it does not produce it. Run the suite with\n' +
        '  --coverage --coverage.reporter=json-summary first.\n',
    );
    process.exit(1);
  }
  const total = JSON.parse(fs.readFileSync(summaryPath, 'utf8')).total;
  const out = {};
  for (const m of METRICS) {
    const pct = total?.[m]?.pct;
    if (typeof pct !== 'number' || Number.isNaN(pct)) {
      console.error(`${TAG} ❌ coverage summary has no numeric total.${m}.pct`);
      process.exit(1);
    }
    out[m] = pct;
  }
  return out;
}

const measured = readSummary();

if (process.argv.includes('--write-baseline')) {
  // Optional one-off slack for seeding from a DIFFERENT environment than the
  // one that will enforce. A gate whose very first run fails gets reverted, and
  // then it protects nothing — which is how the job it replaces ended up unable
  // to fail at all. Recorded in the file so the margin is visible and can be
  // removed once a run in the enforcing environment confirms the numbers.
  const marginArg = process.argv.find((a) => a.startsWith('--margin='));
  const margin = marginArg ? Number(marginArg.split('=')[1]) : 0;
  if (!Number.isFinite(margin) || margin < 0) {
    console.error(`${TAG} ❌ --margin must be a non-negative number`);
    process.exit(1);
  }

  const pinned = {};
  for (const m of METRICS) pinned[m] = Number((measured[m] - margin).toFixed(2));

  const payload = {
    // Recorded so a later reader can tell a deliberate re-pin from a drift.
    recordedAt: new Date().toISOString(),
    tolerance: TOLERANCE,
    measured,
    environmentMargin: margin,
    note:
      'Coverage may not fall below `metrics` minus `tolerance`. Raise them when ' +
      'coverage improves; never lower them to make a red build green — that is ' +
      'the regression this gate exists to catch. `measured` is what the run that ' +
      'seeded this actually reported; `metrics` is that minus environmentMargin, ' +
      'which exists only because the seeding run and the enforcing run may be ' +
      'different machines. Once CI has confirmed its own numbers, re-pin there ' +
      'with no margin so the ratchet sits tight against reality.',
    metrics: pinned,
  };
  fs.writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(
    `${TAG} wrote baseline: ` +
      METRICS.map((m) => `${m} ${pinned[m].toFixed(2)}%`).join(', ') +
      (margin ? ` (measured minus ${margin} pt environment margin)` : ''),
  );
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
  console.error(
    `${TAG} ❌ no baseline at scripts/ci/coverage-baseline.json.\n` +
      '  Seed it once with --write-baseline, and commit it.\n',
  );
  process.exit(1);
}

const baselineFile = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const baseline = baselineFile.metrics ?? {};
/**
 * Slack the baseline was deliberately seeded with because it was measured on a
 * different machine than the one enforcing. A "gain" no larger than this is not
 * an improvement — it is that margin showing up — and reporting it as one would
 * invite a re-pin that silently ratchets on noise.
 */
const seededMargin = Number(baselineFile.environmentMargin) || 0;
const regressions = [];
const improvements = [];

for (const m of METRICS) {
  const was = baseline[m];
  if (typeof was !== 'number') {
    console.error(`${TAG} ❌ baseline is missing "${m}" — re-pin it with --write-baseline.`);
    process.exit(1);
  }
  const now = measured[m];
  if (now < was - TOLERANCE) {
    regressions.push({ m, was, now, delta: now - was });
  } else if (now > was + TOLERANCE) {
    improvements.push({ m, was, now, delta: now - was });
  }
}

const line = METRICS.map((m) => `${m} ${measured[m].toFixed(2)}%`).join(' · ');

if (regressions.length) {
  console.error(`${TAG} ❌ coverage went DOWN:\n`);
  for (const r of regressions) {
    console.error(
      `  • ${r.m}: ${r.now.toFixed(2)}% (baseline ${r.was.toFixed(2)}%, ` +
        `${r.delta.toFixed(2)} pts, tolerance ${TOLERANCE})`,
    );
  }
  console.error(
    '\n  Code was added without tests, or tests were removed. Add the missing\n' +
      '  cover, or — if the drop is genuinely correct (dead code deleted, a file\n' +
      '  excluded on purpose) — re-pin with:\n' +
      '      node scripts/ci/check-coverage-ratchet.mjs --write-baseline\n' +
      '  and say why in the commit. Never re-pin merely to turn a build green.\n',
  );
  process.exit(1);
}

const realGains = improvements.filter((i) => i.delta > seededMargin + TOLERANCE);

if (realGains.length) {
  console.log(`${TAG} OK — ${line}`);
  console.log(
    `${TAG} coverage IMPROVED on ` +
      `${realGains.map((i) => `${i.m} (+${i.delta.toFixed(2)})`).join(', ')}. ` +
      'Re-pin with --write-baseline to lock the gain in.',
  );
} else if (improvements.length && seededMargin > 0) {
  console.log(`${TAG} OK — ${line}`);
  console.log(
    `${TAG} the ${seededMargin} pt environment margin in the baseline is still ` +
      'unspent — this is not an improvement. Re-pin here with ' +
      '`--write-baseline` (no --margin) to tighten the ratchet against the ' +
      'numbers this environment actually produces.',
  );
} else {
  console.log(`${TAG} OK — ${line} (no drop against the baseline)`);
}
