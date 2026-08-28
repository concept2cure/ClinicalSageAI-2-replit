#!/usr/bin/env node
/**
 * Assemble release-evidence-input.json inside a CI run.
 *
 * The generator (cli.mjs generate) demands an evidence artifact containing
 * EXACTLY release-evidence-input.json plus the files listed in
 * input.artifacts — anything else trips its dirty-worktree refusal. This
 * script builds that artifact from the run's own primary evidence:
 *
 *   • the verbatim npm-audit lockfile evidence the Security Scan job
 *     produced and gated (the one per-case evidence file CI uploads today);
 *   • GitHub Actions execution records (job and step conclusions, captured
 *     from the Actions API with the run's GITHUB_TOKEN) for the jobs that
 *     produced the remaining automated evidence, in this run and in the
 *     sibling workflow runs (CodeQL / Semgrep / Tier 5) at the same head SHA.
 *
 * The execution-record granularity is declared honestly in
 * knownDeviations — it is rendered in index.md for reviewer disposition,
 * never passed off as per-case result files.
 *
 * FAIL CLOSED: every missing piece — env var, evidence file, job, step,
 * sibling workflow run — throws an AssemblyError with a named reason before
 * anything is written. There is no partial output. A present-but-red piece
 * (e.g. a failed Tier 5 conclusion) is NOT an assembly error: it is emitted
 * honestly and the downstream validator rejects the manifest, which is the
 * gate doing its job.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESULT_KEYS, sha256 } from './lib.mjs';

export class AssemblyError extends Error {
  constructor(reason) {
    super(`release-evidence assembly failed closed: ${reason}`);
    this.name = 'AssemblyError';
  }
}

export const PRIMARY_DIR = 'release-evidence-primary';

/** Conclusions the manifest schema accepts verbatim; anything else is honest 'unknown'. */
const SCHEMA_CONCLUSIONS = new Set(['success', 'failure', 'cancelled', 'skipped', 'timed_out', 'action_required', 'neutral']);
export const normalizeConclusion = value => (SCHEMA_CONCLUSIONS.has(value) ? value : 'unknown');

/** The blank-DB job's steps that constitute the upgrade (deploy-migrate) proof. */
export const UPGRADE_STEPS = [
  'Deploy migration succeeds on the provisioned database',
  'Deploy migration is idempotent (every release re-runs it)',
];

/** Evidence keys backed by a whole-job execution record. Workflow/job names must
 *  stay members of the reviewed policy's requiredJobs — asserted at assembly. */
const JOB_RECORD_EVIDENCE = {
  tests: { workflow: 'CI', job: 'Test', kind: 'test-results', id: 'ci-test-job-record', file: 'ci-test-job-record.json' },
  blankDatabase: { workflow: 'CI', job: 'Blank DB Provisioning + Deploy Migration', kind: 'blank-database', id: 'ci-blank-db-job-record', file: 'ci-blank-db-job-record.json' },
  productionBoot: { workflow: 'CI', job: 'Production Boot Smoke (RLS on, non-superuser role)', kind: 'production-boot', id: 'ci-production-boot-job-record', file: 'ci-production-boot-job-record.json' },
  browserSmoke: { workflow: 'Tier 5 Browser Smoke', job: 'Authenticated app smoke (real browser + DB)', kind: 'browser-smoke', id: 'tier5-browser-smoke-job-record', file: 'tier5-browser-smoke-job-record.json' },
};

/** The (non-policy) CI job that produces and gates the npm-audit evidence file. */
const SECURITY_SCAN_JOB = 'Security Scan';

const jobSummary = conclusion => {
  if (conclusion === 'success') return { status: 'passed', summary: { total: 1, passed: 1, failed: 0, skipped: 0, unknown: 0 } };
  if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'action_required') {
    return { status: 'failed', summary: { total: 1, passed: 0, failed: 1, skipped: 0, unknown: 0 } };
  }
  return { status: 'unknown', summary: { total: 1, passed: 0, failed: 0, skipped: 0, unknown: 1 } };
};

export async function assembleInput(options) {
  const {
    env = process.env,
    policy,
    repo, // { commit, tree } of the checked-out worktree
    fetchJson, // async url => parsed JSON body
    readFileFn = file => readFile(file),
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    now = () => Date.now(),
    log = () => {},
  } = options;
  if (!policy || !Array.isArray(policy.requiredJobs)) throw new AssemblyError('release policy with requiredJobs was not supplied');
  if (typeof fetchJson !== 'function') throw new AssemblyError('no GitHub API client was supplied');

  const required = name => {
    const value = env[name];
    if (!value) throw new AssemblyError(`required environment variable ${name} is missing`);
    return value;
  };
  const repository = required('GITHUB_REPOSITORY');
  const runId = Number(required('GITHUB_RUN_ID'));
  if (!Number.isInteger(runId) || runId <= 0) throw new AssemblyError(`GITHUB_RUN_ID "${env.GITHUB_RUN_ID}" is not a positive integer`);
  const headSha = required('GITHUB_SHA');
  required('GITHUB_TOKEN'); // consumed by the API client; asserted here so a missing token is a named refusal, not an opaque 401
  const workflowName = required('GITHUB_WORKFLOW');
  const auditPath = required('RELEASE_EVIDENCE_NPM_AUDIT');
  const apiUrl = (env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
  const serverUrl = (env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/+$/, '');
  if (!repo?.commit || !repo?.tree) throw new AssemblyError('checked-out commit and tree were not supplied');
  if (repo.commit !== headSha) throw new AssemblyError(`checked-out commit ${repo.commit} does not match GITHUB_SHA ${headSha}`);

  // Every evidence-backing job must still be one the reviewed policy requires;
  // if the mapping drifts, refuse rather than package unpoliced evidence.
  for (const [key, spec] of Object.entries(JOB_RECORD_EVIDENCE)) {
    if (!policy.requiredJobs.some(job => job.workflow === spec.workflow && job.job === spec.job)) {
      throw new AssemblyError(`evidence source for ${key} (${spec.workflow} / ${spec.job}) is no longer in the policy's requiredJobs — realign scripts/release-evidence/assemble-input.mjs with config/release-evidence-policy.v1.json`);
    }
  }

  const listAll = async (base, key) => {
    const items = [];
    for (let page = 1; page <= 10; page += 1) {
      const body = await fetchJson(`${base}${base.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      const batch = body?.[key];
      if (!Array.isArray(batch)) throw new AssemblyError(`GitHub API response for ${base} did not contain "${key}"`);
      items.push(...batch);
      if (batch.length < 100) break;
    }
    return items;
  };

  const findJob = (jobs, workflow, jobName, where) => {
    const matches = jobs.filter(job => job.name === jobName);
    if (matches.length === 0) throw new AssemblyError(`required job "${workflow} / ${jobName}" was not found in ${where}`);
    if (matches.length > 1) throw new AssemblyError(`more than one job named "${workflow} / ${jobName}" in ${where}`);
    const job = matches[0];
    if (job.status !== 'completed') throw new AssemblyError(`required job "${workflow} / ${jobName}" has not completed (status: ${job.status || 'unknown'})`);
    return job;
  };

  const waitSeconds = Number(env.RELEASE_EVIDENCE_WAIT_SECONDS ?? 1800);
  const pollSeconds = Number(env.RELEASE_EVIDENCE_POLL_SECONDS ?? 30);
  const deadline = now() + waitSeconds * 1000;
  const completedRunFor = async siblingWorkflow => {
    for (;;) {
      const runs = (await listAll(`${apiUrl}/repos/${repository}/actions/runs?head_sha=${headSha}`, 'workflow_runs'))
        .filter(run => run.name === siblingWorkflow);
      const completed = runs.filter(run => run.status === 'completed').sort((a, b) => b.id - a.id)[0];
      if (completed) return completed;
      if (now() >= deadline) {
        throw new AssemblyError(runs.length > 0
          ? `workflow "${siblingWorkflow}" run for ${headSha} had not completed within ${waitSeconds}s`
          : `no "${siblingWorkflow}" workflow run exists for ${headSha} (waited ${waitSeconds}s)`);
      }
      log(`waiting for "${siblingWorkflow}" run at ${headSha} (${runs.length > 0 ? 'in progress' : 'not yet created'}); retrying in ${pollSeconds}s`);
      await sleep(pollSeconds * 1000);
    }
  };

  const currentJobs = await listAll(`${apiUrl}/repos/${repository}/actions/runs/${runId}/jobs`, 'jobs');
  const siblingCache = new Map();
  const jobsOf = async workflow => {
    if (workflow === workflowName) return { runId, jobs: currentJobs, where: `this run (${runId})` };
    if (!siblingCache.has(workflow)) {
      const run = await completedRunFor(workflow);
      if (run.head_sha !== headSha) throw new AssemblyError(`"${workflow}" run ${run.id} is for ${run.head_sha}, not ${headSha}`);
      siblingCache.set(workflow, { runId: run.id, jobs: await listAll(`${apiUrl}/repos/${repository}/actions/runs/${run.id}/jobs`, 'jobs'), where: `"${workflow}" run ${run.id}` });
    }
    return siblingCache.get(workflow);
  };
  const jobRecord = async (workflow, jobName) => {
    const source = await jobsOf(workflow);
    return { workflow, job: jobName, runId: source.runId, record: findJob(source.jobs, workflow, jobName, source.where) };
  };

  const records = new Map();
  const workflowJobs = [];
  for (const requiredJob of policy.requiredJobs) {
    const record = await jobRecord(requiredJob.workflow, requiredJob.job);
    records.set(`${requiredJob.workflow}/${requiredJob.job}`, record);
    workflowJobs.push({ workflow: requiredJob.workflow, job: requiredJob.job, conclusion: normalizeConclusion(record.record.conclusion), headSha, runId: record.runId });
  }

  const files = [];
  const artifacts = [];
  const addArtifact = (id, kind, fileName, contents) => {
    const relative = `${PRIMARY_DIR}/${fileName}`;
    files.push({ path: relative, contents });
    artifacts.push({ id, kind, path: relative, commit: headSha, tree: repo.tree, sha256: sha256(contents) });
    return id;
  };
  const wrapRecord = (record, extra = {}) => JSON.stringify({
    source: 'github-actions-api',
    note: 'Execution record captured from the GitHub Actions API for the workflow run(s) at this commit. Job/step conclusions only — not per-case result files; see the manifest knownDeviations.',
    repository,
    workflow: record.workflow,
    job: record.job,
    workflowRunId: record.runId,
    headSha,
    ...extra,
  }, null, 2) + '\n';

  const automatedEvidence = {};
  for (const key of Object.keys(JOB_RECORD_EVIDENCE)) {
    const spec = JOB_RECORD_EVIDENCE[key];
    const record = records.get(`${spec.workflow}/${spec.job}`);
    const { status, summary } = jobSummary(normalizeConclusion(record.record.conclusion));
    const artifactId = addArtifact(spec.id, spec.kind, spec.file, wrapRecord(record, { record: record.record }));
    automatedEvidence[key] = { status, count: summary.total, artifactId, summary };
  }

  // upgrade: the deploy-migrate success + idempotency steps of the blank-DB job.
  const blankDb = records.get(`${JOB_RECORD_EVIDENCE.blankDatabase.workflow}/${JOB_RECORD_EVIDENCE.blankDatabase.job}`);
  const upgradeSteps = UPGRADE_STEPS.map(stepName => {
    const step = (blankDb.record.steps || []).find(candidate => candidate.name === stepName);
    if (!step) throw new AssemblyError(`upgrade evidence step "${stepName}" was not found in job "${blankDb.job}" — the job's step list changed; realign scripts/release-evidence/assemble-input.mjs`);
    return step;
  });
  const upgradeConclusions = upgradeSteps.map(step => normalizeConclusion(step.conclusion));
  const upgradeCounts = {
    total: upgradeSteps.length,
    passed: upgradeConclusions.filter(conclusion => conclusion === 'success').length,
    failed: upgradeConclusions.filter(conclusion => conclusion === 'failure' || conclusion === 'timed_out').length,
    skipped: upgradeConclusions.filter(conclusion => conclusion === 'skipped').length,
  };
  upgradeCounts.unknown = upgradeCounts.total - upgradeCounts.passed - upgradeCounts.failed - upgradeCounts.skipped;
  automatedEvidence.upgrade = {
    status: upgradeCounts.failed > 0 ? 'failed' : upgradeCounts.passed === upgradeCounts.total ? 'passed' : 'unknown',
    count: upgradeCounts.total,
    artifactId: addArtifact('ci-upgrade-step-records', 'upgrade', 'ci-upgrade-step-records.json', wrapRecord(blankDb, { steps: upgradeSteps })),
    summary: upgradeCounts,
  };

  // securityScan: the VERBATIM npm-audit lockfile evidence the Security Scan
  // job produced; pass/fail comes from that job's own gate conclusion.
  let auditBytes;
  try { auditBytes = await readFileFn(auditPath); }
  catch { throw new AssemblyError(`npm-audit evidence file ${auditPath} is missing or unreadable — expected the Security Scan job's npm-audit-lockfile-evidence artifact to be downloaded there`); }
  try { JSON.parse(String(auditBytes)); }
  catch { throw new AssemblyError(`npm-audit evidence file ${auditPath} is not valid JSON`); }
  const securityScanJob = await jobRecord(workflowName, SECURITY_SCAN_JOB);
  const securityVerdict = jobSummary(normalizeConclusion(securityScanJob.record.conclusion));
  automatedEvidence.securityScan = {
    status: securityVerdict.status,
    count: securityVerdict.summary.total,
    artifactId: addArtifact('npm-audit-lockfile-evidence', 'security-scan', 'dependency-audit-results.json', auditBytes),
    summary: securityVerdict.summary,
  };

  // Fail closed rather than emit a partial input: JSON.stringify silently
  // drops undefined values, so a RESULT_KEYS entry this assembler never filled
  // would otherwise leave the input quietly incomplete instead of refused.
  for (const key of RESULT_KEYS) {
    if (!automatedEvidence[key]) throw new AssemblyError(`no automated evidence was assembled for required result "${key}" — realign scripts/release-evidence/assemble-input.mjs with RESULT_KEYS in scripts/release-evidence/lib.mjs`);
  }

  const input = {
    commit: headSha,
    repositoryUrl: `${serverUrl}/${repository}`,
    artifacts,
    workflowJobs,
    automatedEvidence: Object.fromEntries(RESULT_KEYS.map(key => [key, automatedEvidence[key]])),
    knownDeviations: [{
      id: 'RE-DEV-001',
      description: 'tests, blankDatabase, upgrade, productionBoot, and browserSmoke evidence is GitHub Actions execution-record granularity (job and step conclusions captured from the Actions API), not per-case result files; the producing jobs do not yet upload per-case artifacts. securityScan is the verbatim npm-audit lockfile evidence, with pass/fail taken from the Security Scan job that gated it.',
      disposition: 'unreviewed',
    }],
  };
  return { input, files };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, value, i, all) => (value.startsWith('--') ? (acc.push([value.slice(2), all[i + 1]]), acc) : acc), []));
  const outDir = path.resolve(process.cwd(), args.out || 'release-evidence-artifact');
  const token = process.env.GITHUB_TOKEN;
  const fetchJson = async url => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        if (attempt >= 3) throw new AssemblyError(`GitHub API request failed for ${url}: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, attempt * 2000));
      }
    }
  };
  try {
    const policy = JSON.parse(await readFile(path.resolve(process.cwd(), args.policy || 'config/release-evidence-policy.v1.json'), 'utf8'));
    const repo = {
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(),
    };
    const { input, files } = await assembleInput({ env: process.env, policy, repo, fetchJson, log: line => console.log(`[release-evidence] ${line}`) });
    await mkdir(path.join(outDir, PRIMARY_DIR), { recursive: true });
    for (const file of files) await writeFile(path.join(outDir, file.path), file.contents);
    await writeFile(path.join(outDir, 'release-evidence-input.json'), JSON.stringify(input, null, 2) + '\n');
    console.log(`[release-evidence] assembled release-evidence-input.json + ${files.length} primary evidence file(s) into ${path.relative(process.cwd(), outDir) || '.'} for ${repo.commit}`);
  } catch (error) {
    console.error(error instanceof AssemblyError ? error.message : `release-evidence assembly failed closed: ${error.message}`);
    process.exit(1);
  }
}
