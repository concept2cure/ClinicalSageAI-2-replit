/** Native DB diagnostics must precede the broad suite without hiding either failure. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { require as tsxRequire } from 'tsx/cjs/api';

// Reuse the same expression and shell semantics as the existing workflow contracts.
const {
  readWorkflow, stepNamed, simulateSteps, simulateJobs, runShellStep, shellFor, TRUNK_PUSH,
} = tsxRequire('../../../tests/ci/workflow-harness.ts', import.meta.url);
const { evaluateIf } = tsxRequire('../../../tests/ci/workflow-expression.ts', import.meta.url);
const wf = readWorkflow('ci.yml');
const job = 'integration-tests';
const steps = wf.jobs[job].steps;
const provision = stepNamed(wf, job, 'Provision a deploy-shaped database');
const native = stepNamed(wf, job, 'Run real-database tests');
const nativeUpload = stepNamed(wf, job, 'Upload real-database test results');
const broad = stepNamed(wf, job, 'Run integration tests');
const broadUpload = stepNamed(wf, job, 'Upload integration test results');
const ready = stepNamed(wf, job, 'Smoke — apply RLS rollout migrations');

test('native verdict and its retained report precede the broad suite', () => {
  assert.ok(steps.indexOf(ready) < steps.indexOf(provision));
  assert.ok(steps.indexOf(provision) < steps.indexOf(native));
  assert.ok(steps.indexOf(native) < steps.indexOf(nativeUpload));
  assert.ok(steps.indexOf(nativeUpload) < steps.indexOf(broad));
  assert.ok(steps.indexOf(broad) < steps.indexOf(broadUpload));
});

test('both suites run when shared preparation and native checks pass', () => {
  const result = simulateSteps(wf, job, TRUNK_PUSH);
  assert.equal(result.result, 'success');
  for (const step of [provision, native, nativeUpload, broad, broadUpload]) {
    assert.ok(result.ran.includes(step), step.name);
  }
});

for (const failing of [provision, native, nativeUpload]) {
  test(`${failing.name} fails the job while the independent broad suite still runs`, () => {
    const result = simulateSteps(wf, job, TRUNK_PUSH, failing);
    assert.equal(result.result, 'failure');
    assert.ok(result.ran.includes(broad));
    assert.ok(result.ran.indexOf(failing) < result.ran.indexOf(broad));
    assert.ok(result.ran.includes(nativeUpload));
    assert.ok(result.ran.includes(broadUpload));
    if (failing === provision) assert.ok(!result.ran.includes(native));
  });
}

for (const failing of steps.slice(0, steps.indexOf(ready) + 1)) {
  test(`shared preparation failure at ${failing.name ?? failing.uses} blocks both suites`, () => {
    const result = simulateSteps(wf, job, TRUNK_PUSH, failing);
    assert.equal(result.result, 'failure');
    for (const step of [provision, native, broad]) assert.ok(!result.ran.includes(step), step.name);
    assert.ok(result.ran.includes(nativeUpload));
    assert.ok(result.ran.includes(broadUpload));
  });
}

test('a broad failure retains the earlier native verdict and fails the job', () => {
  const result = simulateSteps(wf, job, TRUNK_PUSH, broad);
  assert.equal(result.result, 'failure');
  assert.ok(result.ran.includes(native));
  assert.ok(result.ran.includes(nativeUpload));
  assert.ok(result.ran.includes(broadUpload));
});

test('cancellation and missing or failed shared preparation cannot start the broad suite', () => {
  assert.equal(ready.id, 'integration_prerequisites');
  for (const conclusion of ['failure', 'skipped', undefined]) {
    assert.equal(evaluateIf(broad.if, {
      status: { success: false, failure: true, cancelled: false },
      contexts: { steps: { integration_prerequisites: { conclusion } } },
    }), false);
  }
  assert.equal(evaluateIf(broad.if, {
    status: { success: false, failure: false, cancelled: true },
    contexts: { steps: { integration_prerequisites: { conclusion: 'success' } } },
  }), false);
});

test('native and broad failures remain blocking for build and release evidence', () => {
  const results = simulateJobs(wf, TRUNK_PUSH, { [job]: 'failure' });
  for (const aggregate of ['build', 'assemble-release-evidence', 'release-evidence-gate']) {
    assert.notEqual(results[aggregate], 'success', aggregate);
  }
  for (const step of [provision, native, broad]) assert.equal(step['continue-on-error'], undefined);
  assert.equal(wf.jobs[job]['continue-on-error'], undefined);
});

test('native and broad suites retain distinct databases and production RLS', () => {
  assert.equal(broad.run, 'npm test');
  assert.equal(broad.env.DATABASE_URL, 'postgresql://postgres@localhost:5432/concept2cure-ri_test');
  assert.equal(broad.env.TEST_DATABASE_URL, broad.env.DATABASE_URL);
  assert.equal(broad.env.RUN_INTEGRATION_TESTS, 'true');
  assert.equal(native.env.DATABASE_URL, 'postgresql://postgres@localhost:5432/concept2cure-ri_dbtest');
  assert.equal(native.env.TEST_DATABASE_URL, native.env.DATABASE_URL);
  assert.equal(provision.env.DATABASE_URL, native.env.DATABASE_URL);
  assert.match(native.env.APP_DATABASE_URL, /^postgresql:\/\/app_service:.*\/concept2cure-ri_dbtest$/);
  assert.equal(native.env.RLS_ENFORCE, 'on');
  assert.equal(native.env.NODE_ENV, 'test');
});

test('both artifacts upload after failures with the existing pinned action and paths', () => {
  for (const [step, name, path] of [
    [nativeUpload, 'real-database-test-results', 'test-results-db/'],
    [broadUpload, 'integration-tests-results', 'test-results/'],
  ]) {
    assert.equal(step.if, 'always()');
    assert.equal(step.uses, 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');
    assert.equal(step.with.name, name);
    assert.equal(step.with.path, path);
  }
});

for (const [step, code] of [[native, 17], [broad, 19]]) {
  test(`${step.name} propagates the actual shell failure status`, () => {
    const result = runShellStep(step.run, step.env, { npm: `exit ${code}` }, shellFor(wf, job, step));
    assert.equal(result.status, code);
    assert.deepEqual(result.argv, [step === native
      ? 'npm run test:db -- --reporter=verbose --reporter=json --outputFile.json=test-results-db/vitest.json'
      : 'npm test']);
  });
}

test('a failed fresh install cannot execute the deploy migration', () => {
  const result = runShellStep(provision.run, provision.env, {
    psql: 'exit 0', node: 'exit 23',
  }, shellFor(wf, job, provision));
  assert.equal(result.status, 23);
  assert.ok(result.argv.includes('node scripts/db/install-fresh.mjs'));
  assert.ok(!result.argv.includes('node scripts/db/deploy-migrate.mjs'));
});
