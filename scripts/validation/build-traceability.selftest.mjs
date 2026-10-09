#!/usr/bin/env node
/**
 * Self-test for build-traceability.mjs — makes the gate FAIL on the case it
 * exists to catch, then confirms it passes on the real tree.
 *
 *   1. A fabricated OQ result whose step cites URS-FAKE-999 (defined nowhere)
 *      must make the builder exit 1 and name the step.
 *   2. The real tree must build (exit 0) and produce the matrix.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const builder = path.join(HERE, 'build-traceability.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-selftest-'));
const fakeDir = path.join(tmp, 'OQ-FAKE');
fs.mkdirSync(fakeDir);
const fake = path.join(fakeDir, 'result.json');
fs.writeFileSync(
  fake,
  JSON.stringify({
    protocolId: 'OQ-999',
    app: 'FAKE',
    appLabel: 'Fake app',
    executedAt: new Date().toISOString(),
    counts: { pass: 1, fail: 0, deviation: 0, 'not-executed': 0 },
    steps: [{ id: 'OQ-FAKE-01', title: 'cites an undefined requirement', urs: ['URS-FAKE-999'], status: 'pass' }],
  }),
);

const neg = spawnSync(process.execPath, [builder, '--extra-results', fake, '--out', path.join(tmp, 'out-neg')], { encoding: 'utf8' });
const negOut = neg.stdout + neg.stderr;
if (neg.status === 0 || !/URS-FAKE-999/.test(negOut)) {
  console.error('SELFTEST FAILED: the builder accepted a step citing an undefined requirement');
  console.error(negOut);
  process.exit(1);
}
console.log(`negative case: builder exited ${neg.status} and named URS-FAKE-999 — the gate fails when it should`);

const pos = spawnSync(process.execPath, [builder, '--out', path.join(tmp, 'out-pos')], { encoding: 'utf8' });
if (pos.status !== 0 || !fs.existsSync(path.join(tmp, 'out-pos', 'TM-001-TRACEABILITY-MATRIX.md'))) {
  console.error('SELFTEST FAILED: the builder does not pass on the real tree');
  console.error(pos.stdout + pos.stderr);
  process.exit(1);
}
console.log(`positive case: builder exited 0 on the real tree (${pos.stdout.trim().split('\n').pop()})`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('build-traceability selftest: OK');
