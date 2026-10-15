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
 * This evaluates the job's real `if:` and `needs:` under the GitHub Actions
 * rule that a job with no status function in its condition runs only when
 * every job it needs succeeded, for the scenarios that matter.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflow = yaml.load(fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/deploy-aws.yml'), 'utf8')) as {
  jobs: Record<string, { needs?: string | string[]; if?: string }>;
};

type Result = 'success' | 'failure' | 'skipped' | 'cancelled';
interface Scenario {
  results: Record<string, Result>;
  inputs: Record<string, string>;
}

/** Would `job` run? Models the expression forms this workflow uses. */
function runs(job: string, s: Scenario): boolean {
  const def = workflow.jobs[job];
  const needs = def.needs === undefined ? [] : Array.isArray(def.needs) ? def.needs : [def.needs];
  const expr = String(def.if ?? '').replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  const allSucceeded = needs.every((n) => s.results[n] === 'success');
  const hasStatusFn = /\b(always|success|failure|cancelled)\(\)/.test(expr);
  if (!hasStatusFn && !allSucceeded) return false;
  if (!expr.trim()) return true;
  const js = expr
    .replace(/\balways\(\)/g, 'true')
    .replace(/\bsuccess\(\)/g, String(allSucceeded))
    .replace(/\bfailure\(\)/g, String(needs.some((n) => s.results[n] === 'failure')))
    .replace(/\bcancelled\(\)/g, 'false')
    .replace(/startsWith\(github\.ref,\s*'([^']*)'\)/g, (_m, p) => String('refs/tags/v1.0.0'.startsWith(p) && s.inputs.__tag === 'true'))
    .replace(/needs\.([\w-]+)\.result/g, (_m, n) => JSON.stringify(s.results[n] ?? 'skipped'))
    .replace(/github\.event\.inputs\.(\w+)/g, (_m, n) => JSON.stringify(s.inputs[n] ?? ''))
    .replace(/([!=])=(?!=)/g, '$1==');
  return Boolean(new Function(`return (${js});`)());
}

const GATES = { 'ci-verdict': 'success', test: 'success', 'security-gate': 'success' } as const;

describe('deploy-frontend publishes only behind a deployed API', () => {
  it('needs deploy-api and the CI verdict', () => {
    const needs = workflow.jobs['deploy-frontend'].needs;
    expect(Array.isArray(needs) ? needs : [needs]).toEqual(expect.arrayContaining(['deploy-api', 'ci-verdict']));
  });

  const cases: Array<[string, Scenario, boolean]> = [
    ['a full release, API rolled', { results: { ...GATES, 'build-push': 'success', migrate: 'success', 'deploy-api': 'success' }, inputs: { __tag: 'true' } }, true],
    ['the migration failed, so the API was not rolled', { results: { ...GATES, 'build-push': 'success', migrate: 'failure', 'deploy-api': 'skipped' }, inputs: { __tag: 'true' } }, false],
    ['the API deploy failed or was rolled back', { results: { ...GATES, 'build-push': 'success', migrate: 'success', 'deploy-api': 'failure' }, inputs: { __tag: 'true' } }, false],
    ['a frontend-only dispatch (deploy_api=false)', { results: { ...GATES, 'build-push': 'skipped', migrate: 'skipped', 'deploy-api': 'skipped' }, inputs: { deploy_api: 'false', deploy_frontend: 'true' } }, true],
    ['an API-only dispatch (deploy_frontend=false)', { results: { ...GATES, 'build-push': 'success', migrate: 'success', 'deploy-api': 'success' }, inputs: { deploy_api: 'true', deploy_frontend: 'false' } }, false],
    ['tests failed on a frontend-only dispatch', { results: { ...GATES, test: 'failure', 'build-push': 'skipped', migrate: 'skipped', 'deploy-api': 'skipped' }, inputs: { deploy_api: 'false', deploy_frontend: 'true' } }, false],
    ["the commit's CI is red, on a full release", { results: { ...GATES, 'ci-verdict': 'failure', 'build-push': 'success', migrate: 'success', 'deploy-api': 'success' }, inputs: { __tag: 'true' } }, false],
    ["the commit's CI is red, on a frontend-only dispatch", { results: { ...GATES, 'ci-verdict': 'failure', 'build-push': 'skipped', migrate: 'skipped', 'deploy-api': 'skipped' }, inputs: { deploy_api: 'false', deploy_frontend: 'true' } }, false],
  ];

  for (const [label, scenario, expected] of cases) {
    it(`${expected ? 'publishes' : 'does not publish'}: ${label}`, () => {
      expect(runs('deploy-frontend', scenario)).toBe(expected);
    });
  }

  it('the smoke test still runs after a frontend-only dispatch', () => {
    expect(runs('smoke-test', {
      results: { ...GATES, 'build-push': 'skipped', migrate: 'skipped', 'deploy-api': 'skipped', 'deploy-frontend': 'success' },
      inputs: { deploy_api: 'false', deploy_frontend: 'true' },
    })).toBe(true);
  });
});
