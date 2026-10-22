/**
 * A release that fails its smoke test is rolled back, and a rollback can be
 * asked for by revision (MR-03 Stage 4, OPS-10 / OPS-23).
 *
 * deploy-aws.yml deployed by task-definition ARN and said, in comments, that
 * rollback was `update-service` to a prior revision. Nothing did it: a release
 * whose /readyz failed through CloudFront stayed rolled, and no input asked for
 * a rollback. Nothing recorded how long the migration took.
 *
 * The job conditions are evaluated as the runner reads them
 * (workflow-harness.ts); the steps that act run as written, against a stub of
 * the AWS CLI that records how it was called.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RC_PUSH, TAG_PUSH, deployJobs, dispatch, readWorkflow, runShellStep, shellFor, stepNamed, type Scenario } from './workflow-harness';

const wf = readWorkflow('deploy-aws.yml');
const FAMILY = 'c2c-production-api';
const arn = (rev: number, family = FAMILY) => `arn:aws:ecs:us-east-1:123456789012:task-definition/${family}:${rev}`;
const DEPLOYS: Scenario[] = [
  TAG_PUSH,
  RC_PUSH,
  dispatch({ target: 'production', deploy_api: 'true', deploy_frontend: 'true', rollback_taskdef: '' }),
];
const REQUEST = dispatch({ target: 'production', deploy_api: 'true', deploy_frontend: 'true', rollback_taskdef: arn(41) });
const EVERY_OTHER_JOB = ['ci-verdict', 'test', 'security-gate', 'build-push', 'promote', 'migrate', 'deploy-api', 'deploy-frontend', 'smoke-test'];

describe('when the rollback job runs', () => {
  it("has one, after deploy-api and the smoke test, in the target's environment", () => {
    const job = wf.jobs.rollback;
    expect(job, 'deploy-aws.yml has no rollback job').toBeDefined();
    expect([job?.needs].flat()).toEqual(['resolve', 'deploy-api', 'smoke-test']);
    expect(job?.environment).toBe('${{ needs.resolve.outputs.target }}');
  });

  for (const s of DEPLOYS) {
    it(`${s.label}: the smoke test failed after a successful roll → it rolls back`, () => {
      expect(deployJobs(wf, s, { 'smoke-test': 'failure' }).rollback).toBe('success');
    });

    it(`${s.label}: the smoke test passed → nothing rolls back`, () => {
      expect(deployJobs(wf, s).rollback).toBe('skipped');
    });

    it(`${s.label}: deploy-api failed (nothing new is serving) → nothing rolls back`, () => {
      expect(deployJobs(wf, s, { 'deploy-api': 'failure' }).rollback).toBe('skipped');
    });
  }

  it('a rollback_taskdef dispatch runs the rollback job alone', () => {
    const jobs = deployJobs(wf, REQUEST);
    expect(jobs.rollback).toBe('success');
    expect(EVERY_OTHER_JOB.filter((j) => jobs[j] !== 'skipped'), 'these run on a rollback request').toEqual([]);
  });

  it('declares the rollback_taskdef input, empty by default', () => {
    const input = (wf.on as { workflow_dispatch?: { inputs?: Record<string, { default?: unknown; type?: string }> } })
      .workflow_dispatch?.inputs?.rollback_taskdef;
    expect(input).toMatchObject({ type: 'string', default: '' });
  });
});

/** A stub `aws`: the revision the service runs, and the image a revision names. */
const awsStub = `case "$*" in
  *describe-task-definition*) echo "\${FAKE_IMAGE-123456789012.dkr.ecr.us-east-1.amazonaws.com/c2c-prod-api@sha256:${'a'.repeat(64)}}" ;;
  *describe-services*) echo "\${FAKE_NOW}" ;;
esac`;
const BASE = { ECS_CLUSTER: 'c2c-production', ECS_API_SERVICE: 'c2c-production-api', ECS_API_TASK_FAMILY: FAMILY, ECS_API_CONTAINER_NAME: 'api' };

describe('what the rollback does', () => {
  const step = stepNamed(wf, 'rollback', 'Return the API service to the revision');
  const run = (env: Record<string, string>) =>
    runShellStep(String(step.run), { ...BASE, REQUESTED_TD_ARN: '', PREVIOUS_TD_ARN: '', FAILED_TD_ARN: '', ...env }, { aws: awsStub }, shellFor(wf, 'rollback', step));
  const updated = (argv: string[]) => argv.filter((a) => a.startsWith('aws ecs update-service'));

  it('after a failed smoke test: returns the service to the revision serving before, and checks it is', () => {
    const r = run({ PREVIOUS_TD_ARN: arn(40), FAILED_TD_ARN: arn(42), FAKE_NOW: arn(40) });
    expect(r.status, r.out).toBe(0);
    expect(updated(r.argv)).toEqual([expect.stringContaining(`--task-definition ${arn(40)}`)]);
    expect(r.argv.some((a) => a.startsWith('aws ecs wait services-stable'))).toBe(true);
  });

  it('on request: returns it to the named revision', () => {
    const r = run({ REQUESTED_TD_ARN: arn(37), FAKE_NOW: arn(37) });
    expect(r.status, r.out).toBe(0);
    expect(updated(r.argv)).toEqual([expect.stringContaining(`--task-definition ${arn(37)}`)]);
  });

  it.each([
    ['a revision of another family', { REQUESTED_TD_ARN: arn(3, 'c2c-production-migrate') }],
    ['something that is not a revision ARN', { REQUESTED_TD_ARN: 'c2c-production-api:7' }],
    ['no revision at all (deploy-api recorded none)', {}],
    ['the revision that just failed', { PREVIOUS_TD_ARN: arn(42), FAILED_TD_ARN: arn(42) }],
    ['a revision with no API container', { REQUESTED_TD_ARN: arn(30), FAKE_IMAGE: 'None' }],
  ])('refuses %s, and changes nothing', (_label, env) => {
    const r = run(env as Record<string, string>);
    expect(r.status).not.toBe(0);
    expect(updated(r.argv)).toEqual([]);
  });

  it('fails when the service does not end on the revision it was sent to', () => {
    const r = run({ PREVIOUS_TD_ARN: arn(40), FAILED_TD_ARN: arn(42), FAKE_NOW: arn(42) });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/not .*:40/);
  });

  it('warns, and still rolls back, when the revision names its image by tag', () => {
    const r = run({ PREVIOUS_TD_ARN: arn(1), FAILED_TD_ARN: arn(2), FAKE_NOW: arn(1), FAKE_IMAGE: 'repo/c2c-prod-api:v1.0.0' });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/::warning::.*by tag rather than digest/);
  });
});

describe('deploy-api records what to roll back to before it moves anything', () => {
  const steps = wf.jobs['deploy-api']?.steps ?? [];
  const capture = steps.findIndex((s) => s.id === 'previous');
  const roll = steps.findIndex((s) => /aws ecs update-service/.test(s.run ?? ''));

  it('reads the serving revision before update-service, and exports it', () => {
    expect(capture, 'no step with id previous').toBeGreaterThanOrEqual(0);
    expect(roll).toBeGreaterThan(capture);
    expect(wf.jobs['deploy-api']?.outputs?.previous_td_arn).toBe('${{ steps.previous.outputs.previous_td_arn }}');
  });

  const runCapture = (now: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-capture-'));
    const out = path.join(dir, 'out');
    fs.writeFileSync(out, '');
    const r = runShellStep(String(steps[capture]?.run), { ...BASE, FAKE_NOW: now, GITHUB_OUTPUT: out }, { aws: awsStub }, shellFor(wf, 'deploy-api', steps[capture]));
    const written = fs.readFileSync(out, 'utf8');
    fs.rmSync(dir, { recursive: true, force: true });
    return { ...r, written };
  };

  it('exports the revision the service runs', () => {
    const r = runCapture(arn(40));
    expect(r.status, r.out).toBe(0);
    expect(r.written).toBe(`previous_td_arn=${arn(40)}\n`);
  });

  it.each(['None', '', arn(4, 'c2c-production-migrate')])('refuses to roll when the serving revision reads as %j', (now) => {
    expect(runCapture(now).status).not.toBe(0);
  });
});

describe('the migration records how long it took, on every way out of the step', () => {
  const step = stepNamed(wf, 'migrate', 'Migrate');

  it('writes start, end and duration to the job summary even when it refuses to run', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-summary-'));
    const summary = path.join(dir, 'summary');
    const r = runShellStep(String(step.run), { IMAGE_DIGEST: '', CHECKED_MIGRATE_TD_ARN: '', GITHUB_STEP_SUMMARY: summary }, {}, shellFor(wf, 'migrate', step));
    const written = fs.existsSync(summary) ? fs.readFileSync(summary, 'utf8') : '';
    fs.rmSync(dir, { recursive: true, force: true });
    expect(r.status).toBe(1);
    expect(written).toMatch(/### Schema migration/);
    expect(written).toMatch(/\| \d{4}-\d\d-\d\dT[\d:]+Z \| \d{4}-\d\d-\d\dT[\d:]+Z \| \d+ s \| 1 \|/);
  });
});
