#!/usr/bin/env node
/**
 * Self-test for ci:launch-scope — shows the gate FAILING on the case it
 * exists to catch, per CLAUDE.md ("a gate that has only ever been seen to
 * pass has not been tested").
 *
 * Copies the real surfaces directory to a temp dir, appends an un-allowlisted
 * fixture import to the Vault surface, points the gate at the copy, and
 * requires exit 1 with a 'fixture-free' finding naming Vault. Then confirms
 * the gate passes on the real tree.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GATE = path.join(ROOT, 'scripts/ci/check-launch-scope.mjs');
const SRC = path.join(ROOT, 'client/src/concept2cure/v2/surfaces');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-scope-selftest-'));
const copy = path.join(tmp, 'surfaces');
fs.cpSync(SRC, copy, { recursive: true });
const vault = path.join(copy, 'Vault.tsx');
fs.appendFileSync(vault, "\nimport { SELFTEST_FAKE_ROWS } from '../fixtures/vault-data';\n");

const run = (env) =>
  spawnSync(process.execPath, [GATE, '--json'], { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8' });

const bad = run({ LAUNCH_SCOPE_SURFACES_DIR: copy });
let parsed;
try {
  parsed = JSON.parse(bad.stdout);
} catch {
  console.error('selftest: gate did not emit JSON\n', bad.stdout, bad.stderr);
  process.exit(1);
}
const caught = parsed.findings.some((f) => f.rule === 'fixture-free' && /Vault\.tsx/.test(f.detail) && /SELFTEST_FAKE_ROWS/.test(f.detail));
if (bad.status === 0 || !caught) {
  console.error('selftest FAILED: the gate did not refuse an un-allowlisted fixture import on a launch surface');
  console.error(JSON.stringify(parsed, null, 2));
  process.exit(1);
}
console.log('✅ selftest: gate exits 1 and names Vault.tsx / SELFTEST_FAKE_ROWS on the seeded violation');

// ── Rule 2b: a launch module missing from 20260810's keep-list ─────────────
// The regression found 2026-09-22: 'ectd-publishing' was seeded (so rule 2
// passed) and re-deprecated on every deploy. Remove it from a copy of the file
// and require the gate to name it.
const reconcileSrc = path.join(ROOT, 'db/migrations/20260810_reconcile_module_catalog.sql');
const reconcileCopy = path.join(tmp, '20260810_reconcile_module_catalog.sql');
const stripped = fs
  .readFileSync(reconcileSrc, 'utf8')
  .split('\n')
  .filter((line) => !/^\s*'ectd-publishing',/.test(line))
  .join('\n');
fs.writeFileSync(reconcileCopy, stripped);
const replay = run({ LAUNCH_SCOPE_RECONCILE_FILE: reconcileCopy });
let replayParsed;
try {
  replayParsed = JSON.parse(replay.stdout);
} catch {
  console.error('selftest: gate did not emit JSON for the replay case\n', replay.stdout, replay.stderr);
  process.exit(1);
}
const replayCaught = replayParsed.findings.some(
  (f) => f.rule === 'survives-replay' && /'ectd-publishing'/.test(f.detail),
);
if (replay.status === 0 || !replayCaught) {
  console.error('selftest FAILED: the gate did not refuse a launch module missing from the 20260810 keep-list');
  console.error(JSON.stringify(replayParsed, null, 2));
  process.exit(1);
}
console.log("✅ selftest: gate exits 1 and names 'ectd-publishing' when it is missing from the 20260810 keep-list");

const good = run({});
if (good.status !== 0) {
  console.error('selftest FAILED: the gate does not pass on the real tree\n', good.stdout);
  process.exit(1);
}
console.log('✅ selftest: gate passes on the real tree');
fs.rmSync(tmp, { recursive: true, force: true });
