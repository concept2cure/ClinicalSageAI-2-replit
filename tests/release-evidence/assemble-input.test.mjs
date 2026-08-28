/**
 * assemble-input.mjs — fail-closed proofs plus the end-to-end contract.
 *
 * The assembler is the ONLY producer of release-evidence-input.json, so two
 * things must hold and are proven here:
 *
 *   1. FAIL CLOSED — every missing piece (env var, evidence file, job record,
 *      sibling workflow run, policy alignment, RESULT_KEYS coverage) throws an
 *      AssemblyError with a named reason; each refusal is shown actually
 *      firing. A present-but-red piece (a failed job) is NOT an assembly error
 *      and is emitted honestly for the downstream validator to reject.
 *
 *   2. CONTRACT — the assembled output, written into a clean checkout, is
 *      accepted by the REAL `cli.mjs generate` (whose dirty-worktree gate
 *      demands the artifact contain exactly release-evidence-input.json plus
 *      the files listed in input.artifacts) and then by `cli.mjs validate`
 *      against the reviewed policy and schema.
 *
 * The GitHub Actions API is faked at the injected fetchJson seam; everything
 * else (policy, schema, git, cli) is the real thing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assembleInput, AssemblyError, normalizeConclusion, PRIMARY_DIR, UPGRADE_STEPS } from '../../scripts/release-evidence/assemble-input.mjs';
import { RESULT_KEYS } from '../../scripts/release-evidence/lib.mjs';
import { makeRepo, repoRoot, runCli, writeInput } from './helpers.mjs';

const policy = JSON.parse(await readFile(path.join(repoRoot, 'config', 'release-evidence-policy.v1.json'), 'utf8'));

const RUN_ID = 424242;
const SHA = '1'.repeat(40);
const TREE = '2'.repeat(40);

const completedJob = (name, extra = {}) => ({ name, status: 'completed', conclusion: 'success', ...extra });

/** The jobs the real ci.yml run would report, all green. */
function ciJobs() {
  return [
    completedJob('Test'),
    completedJob('Security Contract Tests'),
    completedJob('Blank DB Provisioning + Deploy Migration', {
      steps: [
        { name: 'Provision from scratch', status: 'completed', conclusion: 'success' },
        ...UPGRADE_STEPS.map(name => ({ name, status: 'completed', conclusion: 'success' })),
      ],
    }),
    completedJob('Production Boot Smoke (RLS on, non-superuser role)'),
    completedJob('Build'),
    completedJob('Security Scan'),
    // The assembler's own job is mid-run when it queries; must not confuse it.
    { name: 'Assemble Release Evidence', status: 'in_progress', conclusion: null },
  ];
}

const SIBLING_RUNS = [
  { id: 9001, name: 'CodeQL', status: 'completed', head_sha: SHA },
  { id: 9002, name: 'Semgrep', status: 'completed', head_sha: SHA },
  { id: 9003, name: 'Tier 5 Browser Smoke', status: 'completed', head_sha: SHA },
];

const SIBLING_JOBS = {
  9001: [completedJob('Analyze (CodeQL javascript-typescript)'), completedJob('Analyze (CodeQL python)')],
  9002: [completedJob('Analyze (Semgrep)')],
  9003: [completedJob('Authenticated app smoke (real browser + DB)')],
};

/** In-memory GitHub Actions API for the injected fetchJson seam. */
function fakeApi({ jobs = ciJobs(), runs = SIBLING_RUNS, siblingJobs = SIBLING_JOBS, runId = RUN_ID } = {}) {
  return async url => {
    const parsed = new URL(url);
    const jobsMatch = parsed.pathname.match(/^\/repos\/example\/clinical\/actions\/runs\/(\d+)\/jobs$/);
    if (jobsMatch) {
      const id = Number(jobsMatch[1]);
      if (id === runId) return { jobs };
      if (siblingJobs[id]) return { jobs: siblingJobs[id] };
      return { jobs: [] };
    }
    if (parsed.pathname === '/repos/example/clinical/actions/runs') {
      return { workflow_runs: runs.filter(run => run.head_sha === parsed.searchParams.get('head_sha')) };
    }
    throw new Error(`unexpected API url in test: ${url}`);
  };
}

function baseEnv(overrides = {}) {
  return {
    GITHUB_REPOSITORY: 'example/clinical',
    GITHUB_RUN_ID: String(RUN_ID),
    GITHUB_SHA: SHA,
    GITHUB_TOKEN: 'test-token',
    GITHUB_WORKFLOW: 'CI',
    RELEASE_EVIDENCE_NPM_AUDIT: '/nonexistent/dependency-audit-results.json',
    RELEASE_EVIDENCE_WAIT_SECONDS: '0',
    ...overrides,
  };
}

const AUDIT_JSON = JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} }, null, 2) + '\n';

function options(overrides = {}) {
  return {
    env: baseEnv(),
    policy,
    repo: { commit: SHA, tree: TREE },
    fetchJson: fakeApi(),
    readFileFn: async file => {
      if (file === 'AUDIT') return Buffer.from(AUDIT_JSON);
      const error = new Error('ENOENT'); error.code = 'ENOENT'; throw error;
    },
    ...overrides,
  };
}

const rejectsClosed = (opts, pattern) =>
  assert.rejects(assembleInput(opts), error => {
    assert.ok(error instanceof AssemblyError, `expected AssemblyError, got ${error.constructor.name}: ${error.message}`);
    assert.match(error.message, /^release-evidence assembly failed closed: /);
    assert.match(error.message, pattern);
    return true;
  });

// ── Fail-closed refusals, each shown firing with its named reason ────────────

for (const name of ['GITHUB_REPOSITORY', 'GITHUB_RUN_ID', 'GITHUB_SHA', 'GITHUB_TOKEN', 'GITHUB_WORKFLOW', 'RELEASE_EVIDENCE_NPM_AUDIT']) {
  test(`fails closed when ${name} is missing`, async () => {
    const env = baseEnv();
    delete env[name];
    await rejectsClosed(options({ env }), new RegExp(`required environment variable ${name} is missing`));
  });
}

test('fails closed on a non-numeric GITHUB_RUN_ID', async () => {
  await rejectsClosed(options({ env: baseEnv({ GITHUB_RUN_ID: 'not-a-run-id' }) }), /GITHUB_RUN_ID "not-a-run-id" is not a positive integer/);
});

test('fails closed when the checkout does not match GITHUB_SHA', async () => {
  await rejectsClosed(options({ repo: { commit: '3'.repeat(40), tree: TREE } }), /does not match GITHUB_SHA/);
});

test('fails closed when no policy with requiredJobs is supplied', async () => {
  await rejectsClosed(options({ policy: { requiredJobs: null } }), /release policy with requiredJobs was not supplied/);
});

test('fails closed when an evidence-backing job leaves the reviewed policy', async () => {
  const weakened = { ...policy, requiredJobs: policy.requiredJobs.filter(job => job.workflow !== 'Tier 5 Browser Smoke') };
  await rejectsClosed(options({ policy: weakened }), /browserSmoke .*no longer in the policy's requiredJobs/);
});

test('fails closed when a required job is absent from the run', async () => {
  const jobs = ciJobs().filter(job => job.name !== 'Test');
  await rejectsClosed(options({ fetchJson: fakeApi({ jobs }), env: baseEnv({ RELEASE_EVIDENCE_NPM_AUDIT: 'AUDIT' }) }), /required job "CI \/ Test" was not found/);
});

test('fails closed when a required job appears twice in the run', async () => {
  const jobs = [...ciJobs(), completedJob('Test')];
  await rejectsClosed(options({ fetchJson: fakeApi({ jobs }) }), /more than one job named "CI \/ Test"/);
});

test('fails closed when a required job has not completed', async () => {
  const jobs = ciJobs().map(job => (job.name === 'Build' ? { ...job, status: 'in_progress', conclusion: null } : job));
  await rejectsClosed(options({ fetchJson: fakeApi({ jobs }) }), /required job "CI \/ Build" has not completed \(status: in_progress\)/);
});

test('fails closed when no sibling workflow run exists for this SHA', async () => {
  const runs = SIBLING_RUNS.filter(run => run.name !== 'CodeQL');
  await rejectsClosed(options({ fetchJson: fakeApi({ runs }) }), /no "CodeQL" workflow run exists for/);
});

test('fails closed when a sibling workflow run never completes within the wait budget', async () => {
  const runs = SIBLING_RUNS.map(run => (run.name === 'Semgrep' ? { ...run, status: 'in_progress' } : run));
  await rejectsClosed(options({ fetchJson: fakeApi({ runs }) }), /workflow "Semgrep" run for .* had not completed within 0s/);
});

test('fails closed when the upgrade proof steps disappear from the blank-DB job', async () => {
  const jobs = ciJobs().map(job =>
    job.name === 'Blank DB Provisioning + Deploy Migration' ? { ...job, steps: [{ name: 'Renamed step', status: 'completed', conclusion: 'success' }] } : job,
  );
  await rejectsClosed(options({ fetchJson: fakeApi({ jobs }), env: baseEnv({ RELEASE_EVIDENCE_NPM_AUDIT: 'AUDIT' }) }), /upgrade evidence step .* was not found/);
});

test('fails closed when the npm-audit evidence file is missing', async () => {
  await rejectsClosed(options(), /npm-audit evidence file \/nonexistent\/dependency-audit-results\.json is missing or unreadable/);
});

test('fails closed when the npm-audit evidence file is not JSON', async () => {
  const opts = options({
    env: baseEnv({ RELEASE_EVIDENCE_NPM_AUDIT: 'AUDIT' }),
    readFileFn: async () => Buffer.from('not json at all'),
  });
  await rejectsClosed(opts, /npm-audit evidence file AUDIT is not valid JSON/);
});

test('fails closed when the API response lacks the expected collection', async () => {
  await rejectsClosed(options({ fetchJson: async () => ({ unexpected: [] }) }), /did not contain "jobs"/);
});

// ── Honest emission: red evidence is packaged, not refused ───────────────────

test('a failed required job is emitted honestly, not treated as an assembly error', async () => {
  const jobs = ciJobs().map(job => (job.name === 'Test' ? { ...job, conclusion: 'failure' } : job));
  const { input } = await assembleInput(options({ fetchJson: fakeApi({ jobs }), env: baseEnv({ RELEASE_EVIDENCE_NPM_AUDIT: 'AUDIT' }) }));
  assert.equal(input.workflowJobs.find(job => job.job === 'Test').conclusion, 'failure');
  assert.equal(input.automatedEvidence.tests.status, 'failed');
  assert.deepEqual(input.automatedEvidence.tests.summary, { total: 1, passed: 0, failed: 1, skipped: 0, unknown: 0 });
});

test('an off-schema conclusion is normalized to honest unknown, never invented success', () => {
  assert.equal(normalizeConclusion('startup_failure'), 'unknown');
  assert.equal(normalizeConclusion(null), 'unknown');
  assert.equal(normalizeConclusion('success'), 'success');
});

// ── The end-to-end contract with the real generator and validator ────────────

test('assembled output satisfies cli.mjs generate + validate exactly (evidence set = input + listed artifacts)', async t => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'release-evidence-assemble-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const repo = await makeRepo(base);

  // The audit source lives OUTSIDE the checkout, as it does in CI (a downloaded
  // artifact in the runner temp dir); the assembler copies it into the set.
  const auditPath = path.join(base, 'dependency-audit-results.json');
  await writeFile(auditPath, AUDIT_JSON);

  const runsAtHead = SIBLING_RUNS.map(run => ({ ...run, head_sha: repo.commit }));
  const { input, files } = await assembleInput(options({
    env: baseEnv({ GITHUB_SHA: repo.commit, RELEASE_EVIDENCE_NPM_AUDIT: auditPath }),
    repo: { commit: repo.commit, tree: repo.tree },
    fetchJson: fakeApi({ runs: runsAtHead }),
    readFileFn: file => readFile(file),
  }));

  // Contract details the generator depends on.
  assert.equal(input.commit, repo.commit);
  assert.deepEqual(Object.keys(input.automatedEvidence), RESULT_KEYS, 'all six results, in RESULT_KEYS order');
  assert.deepEqual(
    files.map(file => file.path).sort(),
    input.artifacts.map(artifact => artifact.path).sort(),
    'the file set and the declared artifact list must be identical',
  );
  assert.ok(files.every(file => file.path.startsWith(`${PRIMARY_DIR}/`)));
  assert.equal(input.workflowJobs.length, policy.requiredJobs.length);
  assert.ok(input.knownDeviations.length > 0, 'execution-record granularity must be declared, not passed off silently');

  // Materialize the artifact exactly as the gate workflow would after
  // download-artifact: the input file plus the listed evidence files, nothing
  // else — then run the REAL generator and validator against the checkout.
  await mkdir(path.join(repo.root, PRIMARY_DIR), { recursive: true });
  for (const file of files) await writeFile(path.join(repo.root, file.path), file.contents);
  await writeInput(repo, input);

  const generate = runCli(repo.root, 'generate');
  assert.equal(generate.status, 0, `generate refused the assembled input:\n${generate.stderr}`);

  const manifest = JSON.parse(await readFile(path.join(repo.root, 'release-evidence', 'manifest.json'), 'utf8'));
  assert.ok(manifest.artifacts.every(artifact => artifact.status === 'verified'), 'every packaged artifact must verify against its hash');

  const index = await readFile(path.join(repo.root, 'release-evidence', 'index.md'), 'utf8');
  assert.match(index, /RE-DEV-001/, 'the declared deviation must be rendered for reviewer disposition');

  const validate = runCli(repo.root, 'validate');
  assert.equal(validate.status, 0, `validate rejected the generated manifest:\n${validate.stderr}\n${validate.stdout}`);
});
