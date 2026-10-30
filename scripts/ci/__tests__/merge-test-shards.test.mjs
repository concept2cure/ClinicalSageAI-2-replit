/**
 * The sharded Test verdict refuses every way a sharded suite can be green while
 * having run less than the suite (scripts/ci/merge-test-shards.mjs; MR-02
 * Stage 3, 2026-10-30).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateShards, relativeFile } from '../merge-test-shards.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../merge-test-shards.mjs');
const RUNNER = '/home/runner/work/ClinicalSageAI-2-replit/ClinicalSageAI-2-replit';

const vitestReport = (files, { failed = 0 } = {}) => ({
  success: failed === 0,
  numTotalTests: files.length * 2,
  numPassedTests: files.length * 2 - failed,
  numFailedTests: failed,
  testResults: files.map((f) => ({ name: `${RUNNER}/${f}`, status: 'passed' })),
});
const jestReport = (ok = true) => ({ success: ok, numFailedTests: ok ? 0 : 1 });
const COLLECTED = ['tests/a.test.ts', 'server/x/__tests__/b.test.ts', 'client/y/__tests__/c.test.tsx', 'shared/__tests__/d.test.ts'];
const healthy = () => [
  { index: 1, vitest: vitestReport(COLLECTED.slice(0, 2)), jest: jestReport() },
  { index: 2, vitest: vitestReport(COLLECTED.slice(2)), jest: jestReport() },
];
const run = (over = {}) => evaluateShards({ total: 2, shards: healthy(), collected: COLLECTED, shardJobsResult: 'success', ...over });

test('two healthy shards covering every collected file once are green, with counts summed', () => {
  const v = run();
  assert.equal(v.ok, true, v.problems.join('; '));
  assert.equal(v.merged.success, true);
  assert.equal(v.merged.testResults.length, 4);
  assert.equal(v.merged.numTotalTests, 8);
  assert.equal(v.summary.ran, 4);
});

test('a shard that delivered nothing fails the Test, never shrinks it', () => {
  const v = run({ shards: healthy().slice(0, 1) });
  assert.equal(v.ok, false);
  assert.match(v.problems.join('\n'), /shard 2\/2 delivered no results/);
  assert.match(v.problems.join('\n'), /2 collected file\(s\) ran in no shard/);
  assert.equal(v.merged.success, false);
});

test('a collected file no shard ran fails, by name', () => {
  const v = run({ collected: [...COLLECTED, 'tests/forgotten.test.ts'] });
  assert.equal(v.ok, false);
  assert.match(v.problems.join('\n'), /1 collected file\(s\) ran in no shard: tests\/forgotten\.test\.ts/);
});

test('a file run by two shards fails', () => {
  const shards = healthy();
  shards[1].vitest = vitestReport([...COLLECTED.slice(2), COLLECTED[0]]);
  const v = run({ shards });
  assert.equal(v.ok, false);
  assert.match(v.problems.join('\n'), /tests\/a\.test\.ts ran in shard 1 and again in shard 2/);
});

test('a file run that vitest does not collect fails', () => {
  const shards = healthy();
  shards[0].vitest = vitestReport([...COLLECTED.slice(0, 2), 'tests/stray.test.ts']);
  assert.match(run({ shards }).problems.join('\n'), /1 file\(s\) ran that vitest does not collect: tests\/stray\.test\.ts/);
});

test('a failed test in any shard, Vitest or Jest, fails the Test', () => {
  const vitestFail = healthy();
  vitestFail[1].vitest = vitestReport(COLLECTED.slice(2), { failed: 1 });
  assert.match(run({ shards: vitestFail }).problems.join('\n'), /shard 2\/2: Vitest reports failure \(1 failed/);
  const jestFail = healthy();
  jestFail[0].jest = jestReport(false);
  assert.match(run({ shards: jestFail }).problems.join('\n'), /shard 1\/2: Jest reports failure/);
});

test('a missing or unreadable report in a delivered shard fails', () => {
  const shards = healthy();
  delete shards[0].jest;
  shards[0].jestError = 'missing';
  delete shards[1].vitest;
  shards[1].vitestError = 'unreadable (Unexpected token)';
  const text = run({ shards }).problems.join('\n');
  assert.match(text, /shard 1\/2: Jest report missing/);
  assert.match(text, /shard 2\/2: Vitest report unreadable/);
});

test('green reports still fail when the shard jobs did not conclude success', () => {
  for (const result of ['failure', 'cancelled', 'skipped']) {
    assert.match(run({ shardJobsResult: result }).problems.join('\n'), new RegExp(`concluded "${result}"`));
  }
});

test('nothing collected is not a pass', () => {
  assert.match(run({ collected: [] }).problems.join('\n'), /collected no test files/);
});

test('paths from another runner checkout compare as repository-relative', () => {
  assert.equal(relativeFile(`${RUNNER}/server/a/__tests__/x.test.ts`, '/somewhere/else'), 'server/a/__tests__/x.test.ts');
  assert.equal(relativeFile('/repo/tests/y.test.ts', '/repo'), 'tests/y.test.ts');
});

test('the CLI writes the merged reports and exits 1 on a missing shard', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-shards-'));
  const write = (i, v, j) => {
    const d = path.join(dir, 'shards', `test-results-shard-${i}`);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'vitest.json'), JSON.stringify(v));
    fs.writeFileSync(path.join(d, 'jest.json'), JSON.stringify(j));
  };
  const collected = path.join(dir, 'collected.json');
  fs.writeFileSync(collected, JSON.stringify(COLLECTED.map((f) => ({ file: `${RUNNER}/${f}` }))));
  write(1, vitestReport(COLLECTED.slice(0, 2)), jestReport());
  write(2, vitestReport(COLLECTED.slice(2)), jestReport());
  const args = ['--shards', '2', '--dir', path.join(dir, 'shards'), '--out', path.join(dir, 'out'), '--collected', collected];
  execFileSync(process.execPath, [SCRIPT, ...args], { env: { ...process.env, SHARD_JOBS_RESULT: 'success' }, stdio: 'pipe' });
  const merged = JSON.parse(fs.readFileSync(path.join(dir, 'out', 'vitest.json'), 'utf8'));
  assert.equal(merged.success, true);
  assert.equal(merged.testResults.length, 4);
  assert.ok(fs.existsSync(path.join(dir, 'out', 'jest.json')));

  fs.rmSync(path.join(dir, 'shards', 'test-results-shard-2'), { recursive: true });
  assert.throws(
    () => execFileSync(process.execPath, [SCRIPT, ...args], { env: { ...process.env, SHARD_JOBS_RESULT: 'success' }, stdio: 'pipe' }),
    (err) => err.status === 1 && /shard 2\/2 delivered no results/.test(String(err.stderr)),
  );
});
