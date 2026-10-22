/**
 * The new frontend goes live only after the new API is serving it.
 *
 * deploy-frontend once needed only test and security-gate, so it ran in
 * parallel with build-push, migrate and deploy-api: the new index.html was
 * live well before any new API task existed, and stayed live with no end date
 * when migrate failed, deploy-api failed, or the ECS circuit breaker rolled the
 * service back. A client change paired with a route change then failed on
 * every launch surface for as long as that lasted — the concrete case was the
 * Authoring filing bar sending a password to an API that still demanded the
 * retired signing PIN ("PIN required for signature").
 *
 * And only for a commit whose CI is green: since P1-12 (8060c28bc) the job also
 * needs `ci-verdict`, the deploy-time check that the SHA's CI run passed
 * (decision P-3). Every publishing scenario below therefore carries a green
 * verdict, and a red one publishes nothing whatever else succeeded. Until
 * 2026-10-01 these scenarios carried no verdict, which this model reads as
 * `skipped`, so the two publishing cases were red from 08:02 that day.
 *
 * The job conditions are evaluated by the shared runner simulator
 * (tests/ci/workflow-harness.ts, deployJobs), with deploy-aws.yml's own resolve
 * job choosing the target for each scenario. Until MR-03 Stage 4 this file
 * carried its own expression model; it could not read the target that every
 * deploy job's condition now depends on, and one evaluator is enough.
 */
import { describe, it, expect } from 'vitest';
import { RC_PUSH, TAG_PUSH, deployJobs, dispatch, readWorkflow, type JobResult, type Scenario } from '../ci/workflow-harness';

const workflow = readWorkflow('deploy-aws.yml');
const publishes = (s: Scenario, given: Record<string, JobResult> = {}) => deployJobs(workflow, s, given)['deploy-frontend'] === 'success';
const FRONTEND_ONLY = dispatch({ target: 'production', deploy_api: 'false', deploy_frontend: 'true' });
const API_ONLY = dispatch({ target: 'production', deploy_api: 'true', deploy_frontend: 'false' });

describe('deploy-frontend publishes only behind a deployed API', () => {
  it('needs deploy-api and the CI verdict', () => {
    const needs = workflow.jobs['deploy-frontend'].needs;
    expect(Array.isArray(needs) ? needs : [needs]).toEqual(expect.arrayContaining(['deploy-api', 'ci-verdict']));
  });

  const cases: Array<[string, Scenario, Record<string, JobResult>, boolean]> = [
    ['a full release to production, API rolled', TAG_PUSH, {}, true],
    ['a full release to staging, API rolled', RC_PUSH, {}, true],
    ['the migration failed, so the API was not rolled', TAG_PUSH, { migrate: 'failure' }, false],
    ['the API deploy failed or was rolled back', TAG_PUSH, { 'deploy-api': 'failure' }, false],
    ['a frontend-only dispatch (deploy_api=false)', FRONTEND_ONLY, {}, true],
    ['an API-only dispatch (deploy_frontend=false)', API_ONLY, {}, false],
    ['tests failed on a frontend-only dispatch', FRONTEND_ONLY, { test: 'failure' }, false],
    ["the commit's CI is red, on a full release", TAG_PUSH, { 'ci-verdict': 'failure' }, false],
    ["the commit's CI is red, on a frontend-only dispatch", FRONTEND_ONLY, { 'ci-verdict': 'failure' }, false],
  ];

  for (const [label, scenario, given, expected] of cases) {
    it(`${expected ? 'publishes' : 'does not publish'}: ${label}`, () => {
      expect(publishes(scenario, given)).toBe(expected);
    });
  }

  it('the smoke test still runs after a frontend-only dispatch', () => {
    expect(deployJobs(workflow, FRONTEND_ONLY)['smoke-test']).toBe('success');
  });
});
