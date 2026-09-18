#!/usr/bin/env node
/**
 * Self-test for check-undefined-css-classes.
 *
 * A gate that has only ever been seen to pass has not been tested. This builds
 * the three cases it exists to catch — an invented class, a baseline entry with
 * no reason, and a baseline entry that no longer occurs — and asserts each one
 * fails. Every case restores the tree in a finally, so a failure here cannot
 * leave the repo modified.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GATE = path.join(repoRoot, 'scripts/ci/check-undefined-css-classes.mjs');
const BASELINE = path.join(repoRoot, 'scripts/ci/undefined-css-classes-baseline.json');
const TMP_SURFACE = path.join(repoRoot, 'client/src/concept2cure/v2/surfaces/__selftest-scratch.tsx');

const run = () => spawnSync('node', [GATE], { cwd: repoRoot, encoding: 'utf8' });

let failures = 0;
function expectFail(label, needle, out) {
  const combined = (out.stdout ?? '') + (out.stderr ?? '');
  if (out.status === 0) {
    console.error(`  FAIL  ${label} — the gate PASSED on a case it must refuse`);
    failures += 1;
  } else if (needle && !combined.includes(needle)) {
    console.error(`  FAIL  ${label} — refused, but never mentioned "${needle}"`);
    console.error(combined.split('\n').map((l) => `        ${l}`).join('\n'));
    failures += 1;
  } else {
    console.log(`  ok    ${label}`);
  }
}

console.log('[ci:undefined-css-classes:selftest] the gate refuses:');

// 1. A class no stylesheet defines — the incident this gate was written for.
try {
  fs.writeFileSync(
    TMP_SURFACE,
    'export const S = () => <div className="de-backdrop de-dialog">x</div>;\n',
    'utf8',
  );
  expectFail('an invented class name', 'de-backdrop', run());
} finally {
  fs.rmSync(TMP_SURFACE, { force: true });
}

const original = fs.readFileSync(BASELINE, 'utf8');

// 2. A baseline entry with no written reason.
try {
  const b = JSON.parse(original);
  b.allow = [...(b.allow ?? []), { className: 'es-selftest-noreason', reason: '' }];
  fs.writeFileSync(BASELINE, JSON.stringify(b, null, 2), 'utf8');
  expectFail('a baseline entry with no reason', 'without a reason', run());
} finally {
  fs.writeFileSync(BASELINE, original, 'utf8');
}

// 3. A baseline entry for a class that no longer occurs — a baseline that
//    outlives its cases stops describing the tree.
try {
  const b = JSON.parse(original);
  b.allow = [...(b.allow ?? []), { className: 'es-selftest-gone', reason: 'not present anywhere' }];
  fs.writeFileSync(BASELINE, JSON.stringify(b, null, 2), 'utf8');
  expectFail('a stale baseline entry', 'es-selftest-gone', run());
} finally {
  fs.writeFileSync(BASELINE, original, 'utf8');
}

// And still passes on the real tree, restored.
const clean = run();
if (clean.status !== 0) {
  console.error('  FAIL  the restored tree no longer passes — the self-test left damage');
  console.error((clean.stdout ?? '') + (clean.stderr ?? ''));
  failures += 1;
} else {
  console.log('  ok    the real tree still passes afterwards');
}

if (failures > 0) {
  console.error(`[ci:undefined-css-classes:selftest] ${failures} case(s) did not behave.`);
  process.exit(1);
}
console.log('[ci:undefined-css-classes:selftest] OK — every case refused as it must.');
