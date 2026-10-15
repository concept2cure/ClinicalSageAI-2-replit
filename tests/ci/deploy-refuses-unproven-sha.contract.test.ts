/**
 * A production deploy refuses a commit whose CI did not pass, and an image that
 * carries a HIGH or CRITICAL finding.
 *
 * Security audit 2026-09-24, INF-09 (plan P1-12): deploy-aws.yml triggered on a
 * `v*` tag and checked nothing about the commit the tag named — CI could be red
 * at that SHA, or never have run — and it pushed the image it built to ECR with
 * no `trivy image` between build and push. Its own security gate re-ran a few
 * guardrails and Trivy over the source tree, never over the image.
 *
 * The `ci-verdict` job's github-script is run as written against a stub of the
 * Actions API (tests/ci/workflow-harness.ts). Acceptance from the plan: "a
 * deploy of a red SHA refused".
 *
 * A script that refuses is only half of it: the refusal must stop what comes
 * after. So the job and step conditions are evaluated as the runner reads them
 * (workflow-expression.ts): the verdict step failing must fail ci-verdict and
 * leave every build, migrate and deploy job skipped; the image scan failing, or
 * being skipped, must leave the push unrun. A continue-on-error, an always() or
 * a condition that skips the check fails these tests (fix round, mutants.mjs).
 * Evidence: docs/evidence/D6/2026-10-01-tranche-4/P1-12/.
 */
import { describe, expect, it } from 'vitest';
import {
  TAG_PUSH,
  actionsApi,
  continuesOnError,
  dispatch,
  readWorkflow,
  runGithubScript,
  simulateJobs,
  simulateSteps,
  transitiveNeeds,
  type Step,
} from './workflow-harness';

const wf = readWorkflow('deploy-aws.yml');
const TRUNK = 'concept2cure-v2';
const SHA = 'c'.repeat(40);
const REPO = { owner: 'concept2cure', repo: 'ClinicalSageAI-2-replit' };
const OWN = { full_name: 'concept2cure/ClinicalSageAI-2-replit' };
const REQUIRED = ['ci.yml', 'semgrep.yml', 'codeql.yml'];
const context = { eventName: 'push', sha: SHA, ref: 'refs/tags/v1.0.0', repo: REPO, payload: {} };
const FAST = { CI_VERDICT_POLL_SECONDS: '0', CI_VERDICT_WAIT_MINUTES: '0' };

const run = (workflow: string, over: Record<string, unknown> = {}) => ({
  id: 100, workflow, head_sha: SHA, head_branch: TRUNK, event: 'push', status: 'completed', conclusion: 'success',
  head_repository: OWN, html_url: `https://example.test/${workflow}`, ...over,
});
const allGreen = () => REQUIRED.map((w) => run(w));

const verdictStep = (): Step => {
  const step = (wf.jobs['ci-verdict']?.steps ?? []).find((s) => (s.uses ?? '').startsWith('actions/github-script@'));
  if (!step) throw new Error('deploy-aws.yml has no ci-verdict github-script step');
  return step;
};
const verdict = (runs: Array<Record<string, unknown>> | Error, env: Record<string, string> = FAST) =>
  runGithubScript(String(verdictStep().with?.script ?? ''), { github: actionsApi(runs).github, context, env });

describe('INF-09: the deploy reads the CI verdict for the SHA it deploys', () => {
  it('a ci-verdict job, pinned github-script, with read access to Actions only', () => {
    const job = wf.jobs['ci-verdict'];
    expect(job, 'deploy-aws.yml has no ci-verdict job').toBeDefined();
    expect(verdictStep().uses).toMatch(/^actions\/github-script@[0-9a-f]{40}\b/);
    expect(job?.permissions).toEqual({ actions: 'read', contents: 'read' });
  });

  it('every job that builds, migrates, deploys or smoke-tests waits for it', () => {
    const exempt = new Set(['ci-verdict', 'test', 'security-gate']);
    for (const job of Object.keys(wf.jobs).filter((j) => !exempt.has(j))) {
      expect(transitiveNeeds(wf, job).has('ci-verdict'), `${job} does not need ci-verdict`).toBe(true);
    }
  });

  it('passes when CI, Semgrep and CodeQL all passed on the trunk for this SHA', async () => {
    const r = await verdict(allGreen());
    expect(r.failed).toEqual([]);
  });

  it('asks for each required workflow at this SHA, on the trunk, from push events', async () => {
    const api = actionsApi(allGreen());
    await runGithubScript(String(verdictStep().with?.script ?? ''), { github: api.github, context, env: FAST });
    expect(api.calls.map((c) => c.workflow_id).sort()).toEqual([...REQUIRED].sort());
    for (const c of api.calls) expect(c).toMatchObject({ head_sha: SHA, branch: TRUNK, event: 'push' });
  });

  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'skipped', 'action_required']) {
    it(`refuses a SHA whose CI run ended ${conclusion}`, async () => {
      const r = await verdict([run('ci.yml', { conclusion }), run('semgrep.yml'), run('codeql.yml')]);
      expect(r.failed.join(' ')).toMatch(/ci\.yml/);
    });
  }

  it('refuses a red Semgrep at the SHA even when CI is green', async () => {
    const r = await verdict([run('ci.yml'), run('semgrep.yml', { conclusion: 'failure' }), run('codeql.yml')]);
    expect(r.failed.join(' ')).toMatch(/semgrep\.yml/);
  });

  it('reads the newest run: a red re-run after a green one is red', async () => {
    const r = await verdict([run('ci.yml', { id: 101, conclusion: 'failure' }), run('ci.yml', { id: 100 }), run('semgrep.yml'), run('codeql.yml')]);
    expect(r.failed.length).toBe(1);
  });

  it('does not count a green run of another SHA, branch, event or repository', async () => {
    for (const over of [{ head_sha: 'd'.repeat(40) }, { head_branch: 'other' }, { event: 'pull_request' }, { head_repository: { full_name: 'x/fork' } }]) {
      const r = await verdict([run('ci.yml', over), run('semgrep.yml'), run('codeql.yml')]);
      expect(r.failed.length, JSON.stringify(over)).toBe(1);
    }
  });

  it('fails closed when the verdict cannot be read', async () => {
    const r = await verdict(new Error('HTTP 502'));
    expect(r.failed.join(' ')).toMatch(/not a pass/);
  });

  it('refuses when CI has not finished by the deadline', async () => {
    const r = await verdict([run('ci.yml', { status: 'in_progress', conclusion: null }), run('semgrep.yml'), run('codeql.yml')]);
    expect(r.failed.join(' ')).toMatch(/ci\.yml: in_progress/);
  });

  it('refuses a SHA CI never ran on', async () => {
    const r = await verdict([run('semgrep.yml'), run('codeql.yml')]);
    expect(r.failed.join(' ')).toMatch(/ci\.yml: no run/);
  });

  it('waits for a run in progress and passes once it is green', async () => {
    let calls = 0;
    const github = {
      rest: {
        actions: {
          listWorkflowRuns: async (p: Record<string, unknown>) => {
            calls += 1;
            const pending = p.workflow_id === 'ci.yml' && calls <= REQUIRED.length;
            const r = pending ? run('ci.yml', { status: 'in_progress', conclusion: null }) : run(String(p.workflow_id));
            return { data: { workflow_runs: [r] } };
          },
        },
      },
    };
    const r = await runGithubScript(String(verdictStep().with?.script ?? ''), {
      github, context, env: { CI_VERDICT_POLL_SECONDS: '0', CI_VERDICT_WAIT_MINUTES: '1' },
    });
    expect(r.failed).toEqual([]);
    expect(calls).toBeGreaterThan(REQUIRED.length);
  });
});

describe('INF-09: the built image is scanned before it is pushed', () => {
  const steps = wf.jobs['build-push']?.steps ?? [];
  const at = (pred: (s: Step) => boolean) => steps.findIndex(pred);
  const build = at((s) => /docker build/.test(s.run ?? ''));
  const scan = at((s) => (s.uses ?? '').startsWith('aquasecurity/trivy-action@') && s.with?.['scan-type'] === 'image');
  const push = at((s) => /docker push/.test(s.run ?? ''));

  it('build, then trivy image, then push, as three steps', () => {
    expect(build, 'no docker build step').toBeGreaterThanOrEqual(0);
    expect(scan, 'no trivy image step').toBeGreaterThan(build);
    expect(push, 'no docker push step after the scan').toBeGreaterThan(scan);
    expect(steps[build].run).not.toMatch(/docker push/);
  });

  it('the scan blocks on HIGH and CRITICAL, with the repository .trivyignore and no blanket exception', () => {
    const w = steps[scan]?.with ?? {};
    expect(String(w.severity).split(',').map((s) => s.trim()).sort()).toEqual(['CRITICAL', 'HIGH']);
    expect(String(w['exit-code'])).toBe('1');
    expect(w.trivyignores).toBe('.trivyignore');
    expect(String(w['ignore-unfixed'] ?? 'false')).toBe('false');
    expect(steps[scan]?.['continue-on-error']).toBeFalsy();
  });

  it('scans the exact tag the build produced and the push sends', () => {
    const ref = String(steps[scan]?.with?.['image-ref'] ?? '');
    expect(ref).toBe('${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_API_REPO }}:${{ steps.meta.outputs.tag }}');
    expect(steps[build].run).toContain('"$ECR_REGISTRY/$ECR_API_REPO:$IMAGE_TAG"');
    expect(steps[push].run).toContain('docker push "$ECR_REGISTRY/$ECR_API_REPO:$IMAGE_TAG"');
    expect(steps[push].id).toBe('api-push');
  });
});

// The events that deploy: a v* tag, and a dispatch with each half switched on.
const DEPLOYS = [TAG_PUSH, dispatch({ deploy_api: 'true', deploy_frontend: 'true' })];
const DEPLOY_JOBS = ['build-push', 'migrate', 'deploy-api', 'deploy-frontend', 'smoke-test'];

describe('INF-09: a red verdict stops every job after it', () => {
  const gated = Object.keys(wf.jobs).filter((j) => transitiveNeeds(wf, j).has('ci-verdict'));

  it('no job in the deploy has continue-on-error (a failed job would not stop the ones after it)', () => {
    const offenders = Object.entries(wf.jobs).filter(([, j]) => continuesOnError(j['continue-on-error'])).map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  it('no ci-verdict step has continue-on-error (a failed step would pass the job)', () => {
    expect(wf.jobs['ci-verdict']?.steps?.length, 'deploy-aws.yml has no ci-verdict steps').toBeGreaterThan(0);
    const offenders = (wf.jobs['ci-verdict']?.steps ?? []).filter((s) => continuesOnError(s['continue-on-error'])).map((s) => s.name);
    expect(offenders).toEqual([]);
  });

  for (const s of DEPLOYS) {
    it(`${s.label}: ci-verdict runs, and so does its verdict step`, () => {
      expect(simulateJobs(wf, s)['ci-verdict']).not.toBe('skipped');
      expect(simulateSteps(wf, 'ci-verdict', s).ran, 'the verdict step is skipped, and a skipped step passes the job').toContain(verdictStep());
    });

    it(`${s.label}: a failing verdict fails ci-verdict and no build, migrate or deploy job runs`, () => {
      const { result } = simulateSteps(wf, 'ci-verdict', s, verdictStep());
      expect(result, 'the verdict step failed and ci-verdict still passed').toBe('failure');
      const jobs = simulateJobs(wf, s, { 'ci-verdict': result });
      expect(gated.filter((j) => jobs[j] !== 'skipped'), 'these run after a red verdict').toEqual([]);
    });

    it(`${s.label}: with a green verdict the deploy jobs do run (so the check above can fail)`, () => {
      const jobs = simulateJobs(wf, s);
      expect(DEPLOY_JOBS.filter((j) => jobs[j] === 'skipped')).toEqual([]);
      expect(DEPLOY_JOBS.every((j) => gated.includes(j))).toBe(true);
    });
  }
});

describe('INF-09: the image is pushed only after its scan ran and passed', () => {
  const steps = wf.jobs['build-push']?.steps ?? [];
  const scan = steps.find((s) => (s.uses ?? '').startsWith('aquasecurity/trivy-action@') && s.with?.['scan-type'] === 'image');
  const build = steps.find((s) => /docker build/.test(s.run ?? ''));
  const push = steps.find((s) => /docker push/.test(s.run ?? ''));
  // By identity: simulateSteps returns the very step objects of this parse. A
  // name would not do — a step with none (checkout) and a missing scan look alike.
  const ranIn = (s: Parameters<typeof simulateSteps>[2], failing?: Step) => {
    const { ran, result } = simulateSteps(wf, 'build-push', s, failing);
    return { result, scanned: scan !== undefined && ran.includes(scan), pushed: push !== undefined && ran.includes(push) };
  };

  it('build-push has a build, an image scan and a push step', () => {
    expect([build, scan, push].map((x) => x !== undefined)).toEqual([true, true, true]);
  });

  for (const s of DEPLOYS) {
    it(`${s.label}: a failed image scan stops the push and fails the job`, () => {
      const r = ranIn(s, scan);
      expect(r.scanned, 'the image scan does not run').toBe(true);
      expect(r.pushed, 'the push runs after a failed scan').toBe(false);
      expect(r.result).toBe('failure');
    });

    it(`${s.label}: a failed build stops the push`, () => {
      expect(build).toBeDefined();
      expect(ranIn(s, build).pushed).toBe(false);
    });

    it(`${s.label}: when every step passes, the scan and the push both run`, () => {
      expect(ranIn(s)).toMatchObject({ scanned: true, pushed: true });
    });
  }

  it('whenever the push runs, the scan ran too: no condition skips the scan alone', () => {
    expect(scan).toBeDefined();
    for (const s of [...DEPLOYS, dispatch({ deploy_api: 'false', deploy_frontend: 'true' })]) {
      const r = ranIn(s);
      if (r.pushed) expect(r.scanned, s.label).toBe(true);
    }
  });
});
