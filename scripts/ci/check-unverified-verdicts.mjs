#!/usr/bin/env node
/**
 * CI Guard: a verdict reported for a check that did not run.
 *
 * ── The defect, found ten times in one subsystem (WO-16B, 2026-09-10) ─────────
 * Part 11 surfaces that answer a compliance question had two states — passed
 * and failed — for three outcomes. The third, "the check could not run", was
 * collapsed into one of the other two:
 *
 *   /api/decision-lineage/verify-chain     store did not initialise -> INTEGRITY_FAILURE, NON_COMPLIANT
 *   grdhe verifyElectronicSignature        compared nothing          -> valid: true
 *   signed-package export                  lookup threw              -> "superseded or rolled back"
 *   signed audit export                    no row carried a hash     -> chainIntegrity: intact
 *   POST /api/part11/audit-trail           INSERT failed 23502       -> success: true
 *   DOCX AnALedger                         audit query failed        -> <AuditLog count="0">
 *
 * A regulated user acts on a verdict. Both collapses are worse than an error.
 *
 * ── Why this is a new KIND of gate ────────────────────────────────────────────
 * Every other gate in scripts/ci reads source text or a schema. None reads what
 * a surface actually answers. This one makes each surface's dependency fail on
 * purpose — the pool rejects, the request-scoped client rejects — and inspects
 * the payload that comes back. Any verdict token in that payload is unearned by
 * construction, because the check it claims cannot have run.
 *
 * Two halves:
 *   scripts/ci/lib/verdict-inspector.mjs   the payload rule (what counts as a claim)
 *   tests/gates/unverified-verdicts/*.ts   the surfaces, each run over a failing dependency
 *
 * The suite is ordinary vitest so it also runs in the normal test job; this
 * script is the named CI step, and the only place the inspector's own
 * self-test runs. A gate whose rule was never seen to catch anything has not
 * been tested, so the self-test runs first and a rule that misses the shapes
 * WO-16B found fails the gate before any surface is checked.
 *
 * Usage:
 *   node scripts/ci/check-unverified-verdicts.mjs              # self-test, then the suite
 *   node scripts/ci/check-unverified-verdicts.mjs --self-test  # the inspector only
 *   node scripts/ci/check-unverified-verdicts.mjs --list       # the surfaces it covers
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selfTest } from './lib/verdict-inspector.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SUITE = 'tests/gates/unverified-verdicts';
const TAG = '[ci:unverified-verdicts]';
const args = new Set(process.argv.slice(2));

function listSurfaces() {
  return readdirSync(path.join(ROOT, SUITE))
    .filter(f => f.endsWith('.gate.test.ts'))
    .sort();
}

if (args.has('--list')) {
  for (const f of listSurfaces()) console.log(`${SUITE}/${f}`);
  process.exit(0);
}

// 1. The rule must catch what it exists to catch, and accept the honest shapes.
const failures = selfTest();
if (failures.length) {
  console.error(`${TAG} ❌ the verdict inspector failed its own self-test:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${TAG} inspector self-test OK — catches the seven fabricated shapes WO-16B found, accepts the six honest ones`);
if (args.has('--self-test')) process.exit(0);

// 2. Every surface, over a dependency made to fail.
const files = listSurfaces();
console.log(`${TAG} running ${files.length} surface file(s) under ${SUITE}`);
const run = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'vitest.config.ts', '--reporter=dot', SUITE],
  { cwd: ROOT, stdio: 'inherit', env: process.env },
);
if (run.status !== 0) {
  console.error(`${TAG} ❌ a surface asserted a verdict for a check that did not run (see failures above)`);
  process.exit(run.status ?? 1);
}
console.log(`${TAG} ✅ no surface reports a verdict for a check that did not run`);
