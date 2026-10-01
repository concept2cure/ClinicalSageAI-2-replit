/**
 * Reads GitHub Actions workflows and runs their steps outside GitHub, for the
 * contract tests under tests/ci/. A workflow's shell step or github-script step
 * is executed as written in the YAML, so a test pins what the step DOES, not
 * only what it says.
 *
 * Shell steps run under the shell the runner would use (`shellFor`) with a
 * temporary PATH in front, so a test supplies a fake `semgrep`, `git` or `npm`
 * and chooses its exit code. HOME points into the temporary directory, so
 * nothing a step writes to its "global" git config reaches the developer's.
 *
 * Whether a job or step RUNS is decided by evaluating its `if:` the way the
 * runner does (workflow-expression.ts) for a named scenario — a push to the
 * trunk, a pull request, a tag push, a dispatch — never by matching its text.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { load as loadYaml } from 'js-yaml';
import { evaluateIf, type StatusFns } from './workflow-expression';

export const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Where the workflows are read from. CI_CONTRACT_WORKFLOWS_DIR points the suite
 * at another copy — the evidence re-runs it over an earlier commit's workflows
 * (`git archive <sha> .github/workflows`) to show each test failing there.
 */
const WORKFLOWS_DIR = process.env.CI_CONTRACT_WORKFLOWS_DIR ?? path.join(ROOT, '.github/workflows');

export type Step = {
  name?: string;
  id?: string;
  uses?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
  shell?: string;
  'continue-on-error'?: unknown;
};
export type Job = {
  name?: string;
  if?: string;
  needs?: string | string[];
  env?: Record<string, string>;
  permissions?: Record<string, string>;
  container?: string | { image?: string };
  defaults?: { run?: { shell?: string } };
  steps?: Step[];
  'continue-on-error'?: unknown;
};
export type Workflow = {
  on?: Record<string, unknown>;
  env?: Record<string, string>;
  defaults?: { run?: { shell?: string } };
  jobs: Record<string, Job>;
};

export const workflowFiles = (): string[] =>
  fs.readdirSync(WORKFLOWS_DIR).filter((f) => /\.ya?ml$/.test(f));

export const readWorkflow = (file: string): Workflow =>
  loadYaml(fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8')) as Workflow;

/** The step a test is about, by name prefix; fails loudly when it has moved. */
export function stepNamed(wf: Workflow, job: string, prefix: string): Step {
  const step = (wf.jobs[job]?.steps ?? []).find((s) => (s.name ?? '').startsWith(prefix));
  if (!step) throw new Error(`job ${job} has no step named "${prefix}…"`);
  return step;
}

const TRUNK = 'concept2cure-v2';
type EventFilter = {
  branches?: string[];
  'branches-ignore'?: string[];
  tags?: string[];
  paths?: string[];
  'paths-ignore'?: string[];
  types?: string[];
};
const coversTrunk = (f: EventFilter): boolean =>
  !f['branches-ignore']?.includes(TRUNK) && (!f.branches || f.branches.some((b) => b === '**' || b === '*' || b === TRUNK));

/**
 * True when EVERY push to concept2cure-v2 triggers the workflow. A `paths` or
 * `paths-ignore` filter means some pushes do not, so it does not count.
 */
export function triggersOnTrunkPush(wf: Workflow): boolean {
  const push = wf.on?.push as EventFilter | null | undefined;
  if (push === undefined) return false;
  if (push === null) return true;
  if (push.paths || push['paths-ignore']) return false;
  if (!push.branches && push.tags) return false;
  return coversTrunk(push);
}

/** True when every pull request to concept2cure-v2, opened or updated, triggers the workflow. */
export function triggersOnEveryPullRequest(wf: Workflow): boolean {
  const pr = wf.on?.pull_request as EventFilter | null | undefined;
  if (pr === undefined) return false;
  if (pr === null) return true;
  if (pr.paths || pr['paths-ignore']) return false;
  if (pr.types && !['opened', 'synchronize', 'reopened'].every((t) => pr.types?.includes(t))) return false;
  return coversTrunk(pr);
}

/** True when the event the scenario describes triggers the workflow on every occurrence. */
export const triggersOn = (wf: Workflow, s: Scenario): boolean =>
  s.event === 'pull_request' ? triggersOnEveryPullRequest(wf) : s.event === 'push' && !s.ref.startsWith('refs/tags/') && triggersOnTrunkPush(wf);

/** `continue-on-error` as the runner reads it; an expression counts as on (the test cannot know it is off). */
export const continuesOnError = (v: unknown): boolean => v !== undefined && v !== null && v !== false && v !== 'false';

const asList = (needs: string | string[] | undefined): string[] => (needs === undefined ? [] : Array.isArray(needs) ? needs : [needs]);

/** Every job a job depends on, directly or through another job. */
export function transitiveNeeds(wf: Workflow, job: string, seen = new Set<string>()): Set<string> {
  for (const n of asList(wf.jobs[job]?.needs)) {
    if (seen.has(n)) continue;
    seen.add(n);
    transitiveNeeds(wf, n, seen);
  }
  return seen;
}

/** The event a workflow is asked about: what `github.*` and `inputs.*` say. */
export type Scenario = { label: string; event: string; ref: string; inputs?: Record<string, string> };
export const TRUNK_PUSH: Scenario = { label: `push to ${TRUNK}`, event: 'push', ref: `refs/heads/${TRUNK}` };
export const PULL_REQUEST: Scenario = { label: `pull request to ${TRUNK}`, event: 'pull_request', ref: 'refs/pull/1/merge' };
export const TAG_PUSH: Scenario = { label: 'v* tag push', event: 'push', ref: 'refs/tags/v1.0.0' };
/** workflow_dispatch: boolean inputs reach `github.event.inputs` as the strings 'true' / 'false'. */
export const dispatch = (inputs: Record<string, string>): Scenario => ({
  label: `workflow_dispatch ${Object.entries(inputs).map(([k, v]) => `${k}=${v}`).join(' ')}`,
  event: 'workflow_dispatch',
  ref: `refs/heads/${TRUNK}`,
  inputs,
});

function contexts(wf: Workflow, job: string, s: Scenario, extra: Record<string, unknown>): Record<string, unknown> {
  const event =
    s.event === 'workflow_dispatch' ? { inputs: s.inputs ?? {} } : s.event === 'pull_request' ? { action: 'synchronize', pull_request: { number: 1 } } : {};
  const github = {
    event_name: s.event,
    ref: s.ref,
    ref_name: s.ref.replace(/^refs\/(heads|tags)\//, ''),
    ref_type: s.ref.startsWith('refs/tags/') ? 'tag' : 'branch',
    actor: 'a-developer',
    repository: 'concept2cure/ClinicalSageAI-2-replit',
    event,
  };
  const env = { ...(wf.env ?? {}), ...(wf.jobs[job]?.env ?? {}) };
  return { github, env, vars: {}, secrets: {}, matrix: {}, runner: { os: 'Linux' }, inputs: s.inputs ?? {}, steps: {}, needs: {}, ...extra };
}

export type StepResult = { outcome: string; conclusion: string; outputs: Record<string, string> };
const PASSED: StepResult = { outcome: 'success', conclusion: 'success', outputs: {} };
const SKIPPED: StepResult = { outcome: 'skipped', conclusion: 'skipped', outputs: {} };
const stepStatus = (failed: boolean): StatusFns => ({ success: !failed, failure: failed, cancelled: false });

/**
 * Whether a step runs in a scenario, given whether an earlier step has failed
 * the job and the earlier steps' results (any step not listed passed).
 */
export function stepRuns(
  wf: Workflow,
  job: string,
  step: Step,
  s: Scenario,
  so: { failed?: boolean; steps?: Record<string, StepResult> } = {},
): boolean {
  const known = so.steps ?? {};
  const steps = new Proxy(known, { get: (t, k) => (typeof k === 'string' && k in t ? t[k] : PASSED) });
  const ctx = contexts(wf, job, s, { steps });
  ctx.env = { ...(ctx.env as Record<string, string>), ...(step.env ?? {}) };
  return evaluateIf(step.if, { status: stepStatus(so.failed ?? false), contexts: ctx });
}

export type JobResult = 'success' | 'failure' | 'skipped';

/**
 * Walks a job's steps in order, as the runner does, with `failing` (if given)
 * failing when it runs. Returns the steps that ran and the job's result. A step
 * with continue-on-error records outcome failure, conclusion success and does
 * not fail the job; a job with continue-on-error does not fail the run, and the
 * jobs after it proceed — both modelled as a passing job.
 */
export function simulateSteps(wf: Workflow, job: string, s: Scenario, failing?: Step): { ran: Step[]; result: JobResult } {
  const def = wf.jobs[job];
  const results: Record<string, StepResult> = {};
  const ran: Step[] = [];
  let failed = false;
  for (const step of def?.steps ?? []) {
    const runs = stepRuns(wf, job, step, s, { failed, steps: results });
    if (runs) ran.push(step);
    const fails = runs && step === failing;
    const conclusion = fails && !continuesOnError(step['continue-on-error']) ? 'failure' : 'success';
    const r = !runs ? SKIPPED : fails ? { outcome: 'failure', conclusion, outputs: {} } : PASSED;
    if (step.id) results[step.id] = r;
    if (r.conclusion === 'failure') failed = true;
  }
  return { ran, result: failed && !continuesOnError(def?.['continue-on-error']) ? 'failure' : 'success' };
}

/**
 * Which jobs run in a scenario. `given` fixes the result of a job that runs
 * (default: it passes). Job conditions as the runner reads them: with no status
 * function a job needs every job in its `needs` to have succeeded; failure() is
 * true when any ancestor failed; always() runs it whatever happened above.
 */
export function simulateJobs(wf: Workflow, s: Scenario, given: Record<string, JobResult> = {}): Record<string, JobResult> {
  const out: Record<string, JobResult> = {};
  const visit = (job: string): JobResult => {
    if (out[job]) return out[job];
    const direct = asList(wf.jobs[job]?.needs);
    const needs = Object.fromEntries(direct.map((n) => [n, { result: visit(n), outputs: {} }]));
    const status: StatusFns = {
      success: direct.every((n) => needs[n].result === 'success'),
      failure: [...transitiveNeeds(wf, job)].some((n) => out[n] === 'failure'),
      cancelled: false,
    };
    const runs = evaluateIf(wf.jobs[job]?.if, { status, contexts: contexts(wf, job, s, { needs }) });
    out[job] = runs ? (given[job] ?? 'success') : 'skipped';
    return out[job];
  };
  for (const job of Object.keys(wf.jobs)) visit(job);
  return out;
}

/**
 * The shell the runner gives a `run:` step, as argv: `bash -e` when none is
 * named (no pipefail), `bash --noprofile --norc -eo pipefail` for `shell: bash`,
 * `sh -e` for `shell: sh`. Anything else throws.
 */
export function shellFor(wf: Workflow, job: string, step: Step): string[] {
  const named = step.shell ?? wf.jobs[job]?.defaults?.run?.shell ?? wf.defaults?.run?.shell;
  if (named === undefined) return ['bash', '-e'];
  if (named === 'bash') return ['bash', '--noprofile', '--norc', '-eo', 'pipefail'];
  if (named === 'sh') return ['sh', '-e'];
  throw new Error(`no runner shell mapping for "${named}"`);
}

export type StepRun = { status: number | null; out: string; argv: string[] };

/**
 * Runs a workflow `run:` script under `shell` (default `sh -e`). `fakes` maps a
 * command name to the body of a shell script that stands in for it; every fake
 * appends its arguments to $FAKE_ARGV so the test can read how it was called.
 */
export function runShellStep(
  script: string,
  env: Record<string, string>,
  fakes: Record<string, string>,
  shell: string[] = ['sh', '-e'],
): StepRun {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-step-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const argvFile = path.join(dir, 'argv');
  for (const [name, body] of Object.entries(fakes)) {
    const file = path.join(bin, name);
    fs.writeFileSync(file, `#!/bin/sh\necho "${name} $*" >> "$FAKE_ARGV"\n${body}\n`);
    fs.chmodSync(file, 0o755);
  }
  fs.writeFileSync(path.join(dir, 'step.sh'), script);
  const r = spawnSync(shell[0], [...shell.slice(1), path.join(dir, 'step.sh')], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      HOME: dir,
      RUNNER_TEMP: dir,
      GITHUB_WORKSPACE: dir,
      FAKE_ARGV: argvFile,
      ...env,
    },
  });
  const argv = fs.existsSync(argvFile) ? fs.readFileSync(argvFile, 'utf8').trim().split('\n') : [];
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: r.status, out: `${r.stdout}${r.stderr}`, argv };
}

export type ScriptRun = { failed: string[]; outputs: Record<string, string>; logs: string[] };

const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor as new (
  ...args: string[]
) => (...a: unknown[]) => Promise<unknown>;

/**
 * Runs an actions/github-script `script:` the way the action does: as the body
 * of an async function given `github`, `context` and `core`. A throw counts as
 * a failed step, as it does on the runner.
 */
export async function runGithubScript(
  script: string,
  deps: { github: unknown; context: unknown; env?: Record<string, string> },
): Promise<ScriptRun> {
  const run: ScriptRun = { failed: [], outputs: {}, logs: [] };
  const core = {
    setFailed: (m: string) => run.failed.push(m),
    setOutput: (k: string, v: string) => {
      run.outputs[k] = v;
    },
    info: (m: string) => run.logs.push(m),
    warning: (m: string) => run.logs.push(m),
  };
  const saved = { ...process.env };
  Object.assign(process.env, deps.env ?? {});
  try {
    await new AsyncFunction('github', 'context', 'core', script)(deps.github, deps.context, core);
  } catch (err) {
    run.failed.push(`threw: ${(err as Error).message}`);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  return run;
}

/** A GitHub API stub whose listWorkflowRuns answers from a fixed list (or throws). */
export function actionsApi(runs: Array<Record<string, unknown>> | Error) {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    github: {
      rest: {
        actions: {
          listWorkflowRuns: async (params: Record<string, unknown>) => {
            calls.push(params);
            if (runs instanceof Error) throw runs;
            const wf = String(params.workflow_id);
            return { data: { workflow_runs: runs.filter((r) => r.workflow === undefined || r.workflow === wf) } };
          },
        },
      },
    },
  };
}
