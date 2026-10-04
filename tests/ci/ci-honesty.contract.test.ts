/**
 * CI honesty: what CI says it checks, it checks on the trunk, and a failure fails.
 *
 * Security audit 2026-09-24, plan P1-12:
 *   INF-02 — security gates ran only on pull requests (which concept2cure-v2
 *            never receives, CLAUDE.md Rule 0) or only in .husky/pre-push (a
 *            client-side hook nothing forces anyone to install).
 *   INF-10 — Semgrep was advisory: job-level continue-on-error, an unpinned
 *            `semgrep/semgrep:latest`, no `--error`, and a step ending `exit 0`.
 *            The PR-only `p/ci` scan crashed on every run ("invalid rule
 *            severity value: MEDIUM", semgrep 1.36.0) and reported success.
 *   INF-24 — Lint, Build, Security Scan, Nightly, db-schema-validation and
 *            neon-preview installed with `npm install`, which resolves and
 *            rewrites the lockfile instead of installing what it pins.
 *
 * Each property is pinned on the workflow files, and the steps are run as
 * written (tests/ci/workflow-harness.ts) so the test proves what they do.
 * Whether a step runs is the runner's reading of its `if:` for a push to the
 * trunk or a pull request (workflow-expression.ts), not a match on its text;
 * a gate "blocks" only if its step, run as written with that gate failing,
 * exits non-zero — so `|| true`, `set +e` or an unguarded pipe is caught.
 * Fix round: docs/evidence/.../P1-12/mutants.mjs applies each such bypass to
 * a copy of the workflows and shows this suite failing on it.
 * Evidence: docs/evidence/D6/2026-10-01-tranche-4/P1-12/.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  PULL_REQUEST,
  ROOT,
  TRUNK_PUSH,
  actionsApi,
  continuesOnError,
  readWorkflow,
  runGithubScript,
  runShellStep,
  shellFor,
  simulateJobs,
  stepNamed,
  stepRuns,
  triggersOn,
  triggersOnEveryPullRequest,
  triggersOnTrunkPush,
  workflowFiles,
  type Scenario,
  type Step,
} from './workflow-harness';

const TRUNK = 'concept2cure-v2';

type Located = { file: string; job: string; step: Step };

/**
 * Every step that runs in the scenario and can fail the run: its workflow
 * triggers on every such event, its job and the step itself run there (their
 * `if:` evaluated as the runner does), and neither has continue-on-error.
 */
function blockingSteps(s: Scenario, files = workflowFiles()): Located[] {
  return files.flatMap((file) => {
    const wf = readWorkflow(file);
    if (!triggersOn(wf, s)) return [];
    const jobs = simulateJobs(wf, s);
    return Object.entries(wf.jobs).flatMap(([job, def]) => {
      if (jobs[job] === 'skipped' || continuesOnError(def['continue-on-error'])) return [];
      return (def.steps ?? [])
        .filter((step) => !continuesOnError(step['continue-on-error']) && stepRuns(wf, job, step, s))
        .map((step) => ({ file, job, step }));
    });
  });
}

const runsNpmScript = (run: string | undefined, script: string) =>
  new RegExp(`npm run (--silent )?${script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'm').test(run ?? '');

/**
 * Runs a gate's step as written, in the shell the runner would use, with a fake
 * `npm` that fails `gate` (or nothing, when gate is null) and passes every other
 * script; node and npx are faked to pass.
 */
function runWithFailingGate({ file, job, step }: Located, gate: string | null) {
  const npm = 'case " $* " in *" $FAILING_GATE "*) [ -n "$FAILING_GATE" ] && exit 1 ;; esac\nexit 0';
  const fakes = { npm, npx: 'exit 0', node: 'exit 0' };
  return runShellStep(step.run ?? '', { FAILING_GATE: gate ?? '' }, fakes, shellFor(readWorkflow(file), job, step));
}

describe('INF-02: the security gates run, blocking, on every push to the trunk', () => {
  // The INF-02 list, with the self-test of each ratchet that has one, and the two
  // security gates found pre-push-only since the audit (CLAUDE.md Rule 1's
  // drop-safety enforcement; upload validation).
  const GATES = [
    'ci:server-error-leaks',
    'check:compliance-claims',
    'ci:discarded-audit-write:self-test',
    'ci:discarded-audit-write',
    'ci:session-scoped-rls-bypass',
    'ci:unauthenticated-fetch:selftest',
    'ci:unauthenticated-fetch',
    'ci:drizzle-tenant-scope:selftest',
    'ci:drizzle-tenant-scope',
    'ci:migration-drop-safety:selftest',
    'ci:migration-drop-safety',
    'ci:upload-guards:selftest',
    'ci:upload-guards',
  ];
  const steps = blockingSteps(TRUNK_PUSH);

  for (const gate of GATES) {
    it(`${gate} runs on a trunk push, and its failure fails the run`, () => {
      const hits = steps.filter(({ step }) => runsNpmScript(step.run, gate));
      expect(hits.length, `${gate} runs on no trunk push (pull-request-only, pre-push-only, conditional or continue-on-error)`).toBeGreaterThan(0);
      const runs = hits.map((hit) => {
        const red = runWithFailingGate(hit, gate);
        const green = runWithFailingGate(hit, null);
        return {
          where: `${hit.file} › ${hit.job} › ${hit.step.name}`,
          invoked: red.argv.some((line) => runsNpmScript(line, gate)),
          exitWhenGateFails: red.status,
          exitWhenAllPass: green.status,
        };
      });
      const blocks = runs.some((r) => r.invoked && r.exitWhenGateFails !== 0 && r.exitWhenAllPass === 0);
      expect(blocks, `a failing ${gate} does not fail its step (|| true, set +e, a pipe?): ${JSON.stringify(runs)}`).toBe(true);
    });
  }

  it('no npm gate in pr-checks.yml is pull-request-only', () => {
    const prOnly = readWorkflow('pr-checks.yml');
    const gates = Object.values(prOnly.jobs)
      .flatMap((j) => j.steps ?? [])
      .flatMap((s) => [...(s.run ?? '').matchAll(/npm run (?:--silent )?([\w:.-]+)/g)].map((m) => m[1]));
    expect(gates.length).toBeGreaterThan(0);
    const missing = gates.filter((g) => !steps.some(({ step }) => runsNpmScript(step.run, g)));
    expect(missing, 'these run on pull requests only').toEqual([]);
  });

  it('Semgrep p/ci runs on a trunk push, blocking, with --error', () => {
    const hit = steps.find(({ file, step }) => file === 'semgrep.yml' && (step.name ?? '').startsWith('Blocking scan'));
    expect(hit, 'the Semgrep blocking scan does not run, blocking, on a trunk push').toBeDefined();
    expect(String(readWorkflow('semgrep.yml').jobs.semgrep?.env?.SEMGREP_CONFIGS ?? '')).toMatch(/--config=p\/ci\b/);
    expect(hit?.step.run).toMatch(/--error\b/);
  });
});

describe('INF-10: Semgrep runs, blocking, on every trunk push and every pull request', () => {
  const wf = readWorkflow('semgrep.yml');
  type Filter = { paths?: unknown; 'paths-ignore'?: unknown } | null | undefined;

  it('triggers on every push to the trunk: no paths or paths-ignore filter', () => {
    const push = wf.on?.push as Filter;
    expect(push, 'semgrep.yml has no push trigger').not.toBeUndefined();
    expect(push?.paths, 'a paths filter skips Semgrep on every other push').toBeUndefined();
    expect(push?.['paths-ignore'], 'a paths-ignore filter skips Semgrep on those pushes').toBeUndefined();
    expect(triggersOnTrunkPush(wf)).toBe(true);
  });

  it('triggers on every pull request to the trunk (it replaces the p/ci job deleted from pr-checks.yml)', () => {
    const pr = wf.on?.pull_request as Filter;
    expect(pr, 'semgrep.yml has no pull_request trigger, so no Semgrep runs on a pull request').not.toBeUndefined();
    expect(pr?.paths).toBeUndefined();
    expect(pr?.['paths-ignore']).toBeUndefined();
    expect(triggersOnEveryPullRequest(wf)).toBe(true);
  });

  for (const s of [TRUNK_PUSH, PULL_REQUEST]) {
    for (const prefix of ['Resolve the baseline', 'Blocking scan']) {
      it(`"${prefix}" runs on a ${s.label}, and its failure fails the job`, () => {
        const hit = blockingSteps(s, ['semgrep.yml']).find(({ step }) => (step.name ?? '').startsWith(prefix));
        expect(hit, `"${prefix}" is skipped on a ${s.label}, or it or its job continues on error`).toBeDefined();
      });
    }
  }
});

describe('INF-10: Semgrep blocks', () => {
  const wf = readWorkflow('semgrep.yml');
  const job = wf.jobs.semgrep;

  it('keeps the job name the release-evidence policy requires', () => {
    const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/release-evidence-policy.v1.json'), 'utf8'));
    expect(policy.requiredJobs).toContainEqual({ workflow: 'Semgrep', job: job?.name });
  });

  it('has no job-level continue-on-error, and its scan steps none either', () => {
    expect(job?.['continue-on-error']).toBeFalsy();
    for (const s of job?.steps ?? []) {
      if (/semgrep scan/.test(s.run ?? '')) expect(s['continue-on-error'], s.name).toBeFalsy();
    }
  });

  it('runs a pinned image: a version and a sha256 digest, never :latest', () => {
    const image = typeof job?.container === 'string' ? job.container : job?.container?.image;
    expect(image).toMatch(/^semgrep\/semgrep:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/);
  });

  it('scans p/default and p/ci in both scans, and the shell is sh -e', () => {
    expect(job?.env?.SEMGREP_CONFIGS).toMatch(/--config=p\/default\b/);
    expect(job?.defaults?.run?.shell).toBe('sh');
    expect(stepNamed(wf, 'semgrep', 'Blocking scan').run).toMatch(/\$SEMGREP_CONFIGS/);
    expect(stepNamed(wf, 'semgrep', 'Full scan').run).toMatch(/\$SEMGREP_CONFIGS/);
  });

  it('checks out full history, so the baseline commit exists locally', () => {
    const checkout = (job?.steps ?? []).find((s) => (s.uses ?? '').startsWith('actions/checkout@'));
    expect(checkout?.with?.['fetch-depth']).toBe(0);
  });

  it('is the only Semgrep: no other workflow runs one', () => {
    const others = workflowFiles()
      .filter((f) => f !== 'semgrep.yml')
      .flatMap((f) =>
        Object.entries(readWorkflow(f).jobs)
          .filter(([, j]) => {
            const image = typeof j.container === 'string' ? j.container : j.container?.image;
            const steps = j.steps ?? [];
            return /semgrep/.test(image ?? '') || steps.some((s) => /semgrep/.test(s.uses ?? '') || /\bsemgrep (scan|ci)\b/.test(s.run ?? ''));
          })
          .map(([job]) => `${f} › ${job}`),
      );
    expect(others).toEqual([]);
  });
});

describe('INF-10: the blocking scan, run as written', () => {
  const step = () => stepNamed(readWorkflow('semgrep.yml'), 'semgrep', 'Blocking scan');
  const env = { SEMGREP_CONFIGS: '--config=p/default --config=p/ci', BASELINE: 'a'.repeat(40) };
  const run = (semgrepExit: number, overrides: Record<string, string> = {}) =>
    runShellStep(step().run ?? '', { ...env, ...overrides }, { semgrep: `exit ${semgrepExit}`, git: 'exit 0' });

  it('passes when Semgrep reports nothing new over the baseline', () => {
    const r = run(0);
    expect(r.status, r.out).toBe(0);
    const scan = r.argv.find((a) => a.startsWith('semgrep '));
    expect(scan).toContain(`--baseline-commit ${'a'.repeat(40)}`);
    expect(scan).toContain('--error');
    expect(scan).toContain('--config=p/ci');
  });

  it('fails when Semgrep finds something the baseline did not have (exit 1)', () => {
    const r = run(1);
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/::error::/);
  });

  it('fails when Semgrep does not finish (exit 2, 7): an unfinished scan is not a pass', () => {
    for (const code of [2, 7]) expect(run(code).status, `semgrep exit ${code}`).not.toBe(0);
  });

  it('fails without scanning when no baseline was resolved', () => {
    const r = run(0, { BASELINE: '' });
    expect(r.status).not.toBe(0);
    expect(r.argv.some((a) => a.startsWith('semgrep '))).toBe(false);
  });
});

describe('INF-10: the full scan for the Security tab fails when it does not finish', () => {
  const step = () => stepNamed(readWorkflow('semgrep.yml'), 'semgrep', 'Full scan');
  const run = (code: number) =>
    runShellStep(step().run ?? '', { SEMGREP_CONFIGS: '--config=p/default --config=p/ci' }, { semgrep: `exit ${code}` });

  it('exit 0 passes; exit 2 fails', () => {
    expect(run(0).status).toBe(0);
    expect(run(2).status).not.toBe(0);
  });

  it('runs after a red blocking scan, so the Security tab is still fed', () => {
    expect(String(step().if)).toMatch(/!\s*cancelled\(\)/);
  });
});

describe('INF-10: the baseline is the newest commit whose Semgrep run passed', () => {
  const step = () => stepNamed(readWorkflow('semgrep.yml'), 'semgrep', 'Resolve the baseline');
  const script = () => String(step().with?.script ?? '');
  const own = { full_name: 'concept2cure/ClinicalSageAI-2-replit' };
  const sha = (c: string) => c.repeat(40);
  const run = (over: Record<string, unknown> = {}) => ({
    id: 1, head_sha: sha('1'), head_branch: TRUNK, event: 'push', status: 'completed', conclusion: 'success', head_repository: own, ...over,
  });
  const push = { eventName: 'push', sha: sha('f'), repo: { owner: 'concept2cure', repo: 'ClinicalSageAI-2-replit' }, payload: {} };

  it('is a github-script step whose sha output the blocking scan reads', () => {
    expect(step().uses ?? '').toMatch(/^actions\/github-script@[0-9a-f]{40}\b/);
    expect(stepNamed(readWorkflow('semgrep.yml'), 'semgrep', 'Blocking scan').env?.BASELINE).toBe(
      `\${{ steps.${step().id}.outputs.sha }}`,
    );
  });

  it('skips a failed run, a pull-request run and a fork run to reach the last green trunk commit', async () => {
    const api = actionsApi([
      run({ id: 9, head_sha: sha('9'), conclusion: 'failure' }),
      run({ id: 8, head_sha: sha('8'), event: 'pull_request' }),
      run({ id: 7, head_sha: sha('7'), head_repository: { full_name: 'someone/fork' } }),
      run({ id: 6, head_sha: sha('6') }),
    ]);
    const r = await runGithubScript(script(), { github: api.github, context: push });
    expect(r.failed).toEqual([]);
    expect(r.outputs.sha).toBe(sha('6'));
    expect(api.calls[0]).toMatchObject({ workflow_id: 'semgrep.yml', branch: TRUNK });
  });

  it('a pull request compares against its base', async () => {
    const pr = { ...push, eventName: 'pull_request', payload: { pull_request: { base: { sha: sha('b') } } } };
    const r = await runGithubScript(script(), { github: actionsApi([]).github, context: pr });
    expect(r.outputs.sha).toBe(sha('b'));
  });

  it('fails closed when the run history cannot be read', async () => {
    const r = await runGithubScript(script(), { github: actionsApi(new Error('HTTP 403')).github, context: push });
    expect(r.failed.join(' ')).toMatch(/not a pass/);
    expect(r.outputs.sha).toBeUndefined();
  });

  it('fails closed when no run ever passed', async () => {
    const r = await runGithubScript(script(), { github: actionsApi([run({ conclusion: 'failure' })]).github, context: push });
    expect(r.failed.length).toBe(1);
    expect(r.outputs.sha).toBeUndefined();
  });
});

describe('INF-24: dependencies install from the lockfile (npm ci)', () => {
  // `npm install` with flags only, ending the command: installs the tree, not one package.
  const BARE_INSTALL = /(^|[\s;&|(])npm\s+(install|i)((\s+-[^\s;&|]+)*)\s*($|[;&|)])/m;

  it('no workflow step installs the dependency tree with npm install', () => {
    const offenders = workflowFiles().flatMap((file) =>
      Object.entries(readWorkflow(file).jobs).flatMap(([job, def]) =>
        (def.steps ?? [])
          .filter((s) => BARE_INSTALL.test((s.run ?? '').replace(/^\s*#.*$/gm, '')))
          .map((s) => `${file} › ${job} › ${s.name ?? s.run}`),
      ),
    );
    expect(offenders).toEqual([]);
  });

  const NAMED: Array<[string, string]> = [
    ['ci.yml', 'lint'],
    ['ci.yml', 'build'],
    ['ci.yml', 'security'],
    ['ci.yml', 'nightly-governance'],
    ['db-schema-validation.yml', 'schema-push'],
    ['neon-preview-db.yml', 'preview_db_test'],
  ];
  for (const [file, job] of NAMED) {
    it(`${file} › ${job} installs with npm ci`, () => {
      const def = readWorkflow(file).jobs[job];
      expect(def, `${file} has no job ${job}`).toBeDefined();
      expect((def.steps ?? []).some((s) => /(^|[\s;&|])npm ci(\s|$)/m.test(s.run ?? ''))).toBe(true);
    });
  }

  it('.npmrc carries legacy-peer-deps, which npm ci reads in place of the flag', () => {
    expect(fs.readFileSync(path.join(ROOT, '.npmrc'), 'utf8')).toMatch(/^legacy-peer-deps=true$/m);
  });
});
