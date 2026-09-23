/**
 * Self-test for the OQ harness — proves the verdict machinery fails when it
 * should, against the real server (dev-login must be available):
 *
 *   - a step whose expectation is false is recorded as `fail`, not pass;
 *   - a step that declares a deviation is recorded as `deviation`;
 *   - a step depending on a failed step is `not-executed`;
 *   - the bundle (result.json + execution record) is written and the counts
 *     are right.
 *
 * Evidence goes to a temporary directory, never to docs/evidence.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oq-harness-selftest-'));
process.env.VALIDATION_EVIDENCE_ROOT = tmp;
const { createRun } = await import('./harness.mjs');

const run = await createRun({ app: 'SELFTEST', appLabel: 'Harness self-test', protocolId: 'OQ-000', protocolTitle: 'Harness self-test', needsBrowser: false });

await run.step({ id: 'ST-01', title: 'a true expectation passes', action: 'GET /healthz', expected: '200' }, async ({ api, expect }) => {
  const r = await api('GET', '/healthz', undefined, { anonymous: true });
  expect(r.status === 200, `healthz ${r.status}`);
  return 'ok';
});
await run.step({ id: 'ST-02', title: 'a false expectation FAILS', action: 'GET /healthz', expected: 'deliberately wrong: 418' }, async ({ api, expect }) => {
  const r = await api('GET', '/healthz', undefined, { anonymous: true });
  expect(r.status === 418, `healthz returned ${r.status}, not 418 (this failure is the point)`);
});
await run.step({ id: 'ST-03', title: 'a declared deviation is a deviation', action: 'none', expected: 'n/a' }, async ({ deviation }) => {
  deviation('selftest: deliberately not executable');
});
await run.step({ id: 'ST-04', title: 'depends on the failed step', action: 'none', expected: 'not executed', dependsOn: ['ST-02'] }, async () => 'must not run');
await run.step({ id: 'ST-05', title: 'a thrown error is a fail', action: 'none', expected: 'fail' }, async () => {
  throw new Error('selftest: runner error');
});

const result = await run.finish();
const want = { 'ST-01': 'pass', 'ST-02': 'fail', 'ST-03': 'deviation', 'ST-04': 'not-executed', 'ST-05': 'fail' };
const got = Object.fromEntries(result.steps.map((s) => [s.id, s.status]));
const bundleOk = fs.existsSync(path.join(tmp, 'OQ-SELFTEST', 'result.json')) && fs.existsSync(path.join(tmp, 'OQ-SELFTEST', 'OQ-000-execution-record.md'));
const ok = bundleOk && Object.entries(want).every(([k, v]) => got[k] === v) && result.counts.fail === 2 && result.counts.pass === 1;
fs.rmSync(tmp, { recursive: true, force: true });
if (!ok) {
  console.error('HARNESS SELFTEST FAILED', { want, got, counts: result.counts, bundleOk });
  process.exit(1);
}
console.log('harness selftest: OK — false expectation → fail, deviation → deviation, dependent → not-executed, thrown → fail; bundle written');
