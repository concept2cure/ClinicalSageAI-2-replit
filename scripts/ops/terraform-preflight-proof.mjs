#!/usr/bin/env node
/**
 * Does the task definition production Terraform renders pass the deploy
 * pipeline's own preflight — and does its health check actually run?
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * .github/workflows/deploy-aws.yml refuses to roll a task definition that lacks
 * any part of the production boot contract. Until 2026-09-23 nothing ever put
 * the Terraform that CREATES that task definition in front of that preflight.
 * When something finally did, it failed for nine missing variables, RLS_ENFORCE
 * unset and no APP_URL — and the task could not have started anyway (the
 * execution role could not read the secret DATABASE_URL pointed at) or stayed
 * up (its health check called wget, which the image does not contain).
 *
 * This does not restate the pipeline's rules. It extracts the preflight step's
 * shell from deploy-aws.yml, byte for byte, and runs it against the task
 * definition Terraform renders, with a stub standing in for the one AWS call
 * the step makes. If the pipeline's rules change, this checks the new rules.
 *
 * ── What it runs ─────────────────────────────────────────────────────────────
 *   1. `terraform test` on terraform/stack (production's settings) with the AWS
 *      provider mocked (tests/boot_contract.tftest.hcl). No account needed.
 *   2. Reads the rendered API task definition out of the test's final state,
 *      and fails unless its family is the one the pipeline inspects.
 *   3. Runs the preflight step's own shell against it (`aws` stubbed), then the
 *      database-task step's against the rendered migrate definition (MR-03
 *      Stage 3, OPS-16), and both against definitions each must REFUSE: an API
 *      carrying the owner's credential; a database task without it, with
 *      another environment, another secret source, or the API's role.
 *   4. Checks the revisions the preflight checked are the ones that run: each
 *      step publishes its ARN; the migration derives from the database task's,
 *      deploy-api from the API's.
 *   5. Executes the rendered container health-check command against a stub
 *      server that answers by path: live-but-not-ready (/healthz 200, /readyz
 *      503) must pass; /healthz 503 and a closed port must fail. A regex on
 *      the command cannot find a quoting error; running it can.
 *
 * Not here, because each has one canonical check elsewhere: the names the
 * preflight requires are READ from deploy-aws.yml by the Terraform test itself;
 * the image's trust of the RDS CA is tests/schema-contract/rds-ca-bundle.contract.test.ts.
 *
 * Usage:
 *   node scripts/ops/terraform-preflight-proof.mjs            # all of the above
 *   node scripts/ops/terraform-preflight-proof.mjs --td-json <file>
 *        run steps 3 only, against a task definition JSON you supply
 *        ({family, containerDefinitions}); used for the before/after evidence
 *   --no-init   skip `terraform init` (it is already initialised)
 *
 * Exit 0 only when every step holds.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// The one composition production and staging instantiate; its suite tests it
// with production's settings.
const TF_DIR = path.join(repoRoot, 'terraform', 'stack');
const TEST_FILE = 'tests/boot_contract.tftest.hcl';
const WORKFLOW = path.join(repoRoot, '.github', 'workflows', 'deploy-aws.yml');
const PROVISION_WORKFLOW = path.join(repoRoot, '.github', 'workflows', 'provision-database.yml');
// The names each job deploys to (MR-03 Stage 4): the resolve job loads one entry
// into the job's environment at run time; the proof checks production's.
const TARGETS = JSON.parse(fs.readFileSync(path.join(repoRoot, '.github', 'deploy-targets.json'), 'utf8'));
const STAGING_RENDER = 'staging_builds_and_lets_production_read_its_images';
const PREFLIGHT_STEP = 'Preflight — task definition must carry the production boot contract';
const MIGRATE_PREFLIGHT_ID = 'migrate-preflight';
const TAG = '[terraform-preflight-proof]';

const args = process.argv.slice(2);
const tdJsonArg = args.includes('--td-json') ? args[args.indexOf('--td-json') + 1] : null;
const noInit = args.includes('--no-init');

let failures = 0;
/** name (deploy | build) → the rendered IAM policy document of that GitHub role. */
const renderedIam = {};
const fail = (msg) => { failures += 1; console.error(`${TAG} FAIL — ${msg}`); };
const ok = (msg) => console.log(`${TAG} ok — ${msg}`);

/** The preflight step, as the pipeline runs it: its shell and its env. */
function loadPreflight() {
  const wf = loadYaml(fs.readFileSync(WORKFLOW, 'utf8'));
  for (const [jobName, job] of Object.entries(wf.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      if ((step.name ?? '').startsWith(PREFLIGHT_STEP)) {
        const env = { ...TARGETS.production, ...(wf.env ?? {}), ...(job.env ?? {}), ...(step.env ?? {}) };
        const mStep = (job.steps ?? []).find((st) => st.id === MIGRATE_PREFLIGHT_ID);
        const migrate = mStep ? { run: mStep.run, env: { ...TARGETS.production, ...(wf.env ?? {}), ...(job.env ?? {}), ...(mStep.env ?? {}) } } : null;
        return { jobName, run: step.run, env, migrate, needs: [].concat(job.needs ?? []), wf };
      }
    }
  }
  console.error(`${TAG} FAIL — no step named "${PREFLIGHT_STEP}" in deploy-aws.yml; nothing to check against.`);
  process.exit(1);
}

/**
 * Run a step's shell with `aws` answering describe-task-definition from the
 * given definitions, by family: `--task-definition` may name a family or a
 * revision ARN, as the steps use both. Anything else it is asked for fails,
 * as ECS would.
 */
const AWS_SHIM = `#!/usr/bin/env bash
td=""
while [[ $# -gt 0 ]]; do if [[ "$1" == --task-definition ]]; then td="$2"; break; fi; shift; done
td="\${td##*/}"; td="\${td%%:*}"
[[ -f "$TD_DIR/$td.json" ]] || { echo "ClientException: Unable to describe task definition '$td'." >&2; exit 254; }
cat "$TD_DIR/$td.json"
`;
function runPreflight(pre, tds, extraEnv = {}) {
  const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-preflight-'));
  const tdDir = path.join(shimDir, 'td');
  fs.mkdirSync(tdDir);
  for (const td of [].concat(tds)) fs.writeFileSync(path.join(tdDir, `${td.family}.json`), JSON.stringify(td));
  fs.writeFileSync(path.join(shimDir, 'aws'), AWS_SHIM, { mode: 0o755 });
  const outputFile = path.join(shimDir, 'github_output');
  fs.writeFileSync(outputFile, '');
  const res = spawnSync('bash', ['-c', pre.run], {
    encoding: 'utf8',
    env: {
      ...process.env, ...stringEnv(pre.env), ...extraEnv, TD_DIR: tdDir, GITHUB_OUTPUT: outputFile,
      PATH: `${shimDir}:${process.env.PATH}`,
    },
  });
  res.githubOutput = fs.readFileSync(outputFile, 'utf8');
  fs.rmSync(shimDir, { recursive: true, force: true });
  return res;
}

/**
 * The first-provision workflow's own check, run against the rendered database
 * task definition: it must accept what Terraform renders, pin that revision,
 * and hand db:provision the owner URL as DATABASE_OWNER_URL from the SAME
 * secret the migration reads as DATABASE_URL. Its shell, verbatim, with `aws`
 * stubbed.
 */
function checkProvisionSource(td) {
  const wf = loadYaml(fs.readFileSync(PROVISION_WORKFLOW, 'utf8'));
  const job = Object.values(wf.jobs ?? {}).find((j) => (j.steps ?? []).some((st) => st.id === 'source'));
  const step = job?.steps.find((st) => st.id === 'source');
  if (!step) return fail('provision-database.yml has no step with id "source"');
  const res = runPreflight({ run: step.run, env: { ...TARGETS.production, ...(wf.env ?? {}), ...(job.env ?? {}), ...(step.env ?? {}) } }, td);
  if (res.status !== 0) {
    process.stderr.write(res.stdout + res.stderr);
    return fail(`provision-database.yml's source check refused the rendered task definition (exit ${res.status})`);
  }
  const out = Object.fromEntries(
    res.githubOutput.trim().split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
  const dbUrl = td.containerDefinitions[0].secrets.find((x) => x.name === 'DATABASE_URL')?.valueFrom;
  let extra = [];
  try { extra = JSON.parse(out.extra_secrets ?? '[]'); } catch { /* reported below */ }
  if (out.arn !== td.taskDefinitionArn) {
    return fail(`provision source pinned ${out.arn}, not the revision it checked (${td.taskDefinitionArn})`);
  }
  if (!(extra.length === 1 && extra[0].name === 'DATABASE_OWNER_URL' && extra[0].valueFrom === dbUrl)) {
    return fail(`provision source must add DATABASE_OWNER_URL from DATABASE_URL's secret; got ${out.extra_secrets}`);
  }
  ok('provision-database.yml accepts the rendered database task definition and passes the owner URL from the same secret');
}

/**
 * Every AWS call each workflow job makes is one its role allows, and each job
 * assumes the role its OIDC subject can reach.
 *
 * A pipeline that has never run against AWS fails its first deploy on the
 * first AccessDenied, one call at a time. This reads each job's `aws` commands
 * (and those of scripts/ops/ecs-one-off-task.sh when the job runs it), maps
 * each to its IAM action, and checks the rendered policy of the role the job
 * assumes. A CLI call not in the table below FAILS: an unmapped call is an
 * unchecked one. Resource scoping is the module's own test's subject
 * (modules/github-deploy-roles/tests); this checks that the actions are there.
 */
const CLI_TO_IAM = {
  'ecs describe-task-definition': ['ecs:DescribeTaskDefinition'],
  'ecs register-task-definition': ['ecs:RegisterTaskDefinition'],
  'ecs describe-services': ['ecs:DescribeServices'],
  'ecs run-task': ['ecs:RunTask'],
  'ecs describe-tasks': ['ecs:DescribeTasks'],
  'ecs stop-task': ['ecs:StopTask'],
  'ecs update-service': ['ecs:UpdateService'],
  'ecs wait services-stable': ['ecs:DescribeServices'],
  'logs get-log-events': ['logs:GetLogEvents'],
  'ecr describe-images': ['ecr:DescribeImages'],
  's3 sync': ['s3:ListBucket', 's3:PutObject', 's3:DeleteObject'],
  's3 cp': ['s3:PutObject'],
  'cloudfront create-invalidation': ['cloudfront:CreateInvalidation'],
  'cloudfront get-distribution': ['cloudfront:GetDistribution'],
  'ecr batch-get-image': ['ecr:BatchGetImage'],
  'ecr put-image': ['ecr:PutImage'],
  'ecr get-login-password': ['ecr:GetAuthorizationToken'],
  // Needs no permission: every principal may ask who it is.
  'sts get-caller-identity': [],
};
const ECR_LOGIN = ['ecr:GetAuthorizationToken'];
const ECR_PUSH = ['ecr:BatchCheckLayerAvailability', 'ecr:InitiateLayerUpload', 'ecr:UploadLayerPart', 'ecr:CompleteLayerUpload', 'ecr:PutImage'];
const ROLE_FOR_SECRET = { AWS_DEPLOY_ROLE_ARN: 'deploy', AWS_BUILD_ROLE_ARN: 'build' };

function awsCalls(shell) {
  const code = shell.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  const calls = new Set();
  for (const m of code.matchAll(/(?:^|[\s;(|&$])aws\s+([a-z0-9-]+)\s+([a-z0-9-]+)(?:\s+([a-z0-9-]+))?/g)) {
    calls.add(m[2] === 'wait' ? `${m[1]} wait ${m[3]}` : `${m[1]} ${m[2]}`);
  }
  return calls;
}

function checkWorkflowIam() {
  if (!renderedIam.deploy || !renderedIam.build) {
    return fail('the rendered state has no GitHub deploy/build role policies (module.github_deploy)');
  }
  const allowed = (role, action) =>
    (renderedIam[role].Statement ?? []).some((st) => st.Effect === 'Allow' && [].concat(st.Action).includes(action));
  const runner = fs.readFileSync(path.join(repoRoot, 'scripts', 'ops', 'ecs-one-off-task.sh'), 'utf8');
  const problems = [];
  let checked = 0;
  for (const file of [WORKFLOW, PROVISION_WORKFLOW]) {
    const wf = loadYaml(fs.readFileSync(file, 'utf8'));
    for (const [name, job] of Object.entries(wf.jobs ?? {})) {
      const steps = job.steps ?? [];
      const creds = steps.find((st) => String(st.uses ?? '').includes('configure-aws-credentials'));
      if (!creds) continue;
      const where = `${path.basename(file)} job ${name}`;
      const secret = String(creds.with?.['role-to-assume'] ?? '').match(/secrets\.([A-Z_]+)/)?.[1];
      const role = ROLE_FOR_SECRET[secret];
      if (!role) { problems.push(`${where}: assumes ${creds.with?.['role-to-assume']}, which no Terraform role backs`); continue; }
      // The deploy role trusts only jobs in the GitHub environment, the build
      // role only jobs outside it: the subject decides which one STS allows.
      const inEnv = Boolean(job.environment);
      if (inEnv !== (role === 'deploy')) {
        problems.push(`${where}: ${inEnv ? 'runs in' : 'runs outside'} the GitHub environment but assumes the ${role} role, whose trust ${role === 'deploy' ? 'admits only the environment' : 'excludes the environment'}; AssumeRoleWithWebIdentity would be refused`);
        continue;
      }
      const need = new Set();
      for (const st of steps) {
        if (String(st.uses ?? '').includes('amazon-ecr-login')) ECR_LOGIN.forEach((a) => need.add(a));
        const run = String(st.run ?? '');
        if (/\bdocker push\b/.test(run)) ECR_PUSH.forEach((a) => need.add(a));
        // Promotion's copy (MR-03 Stage 4): it reads the source image and pushes
        // it, layer by layer, into this account's repository.
        if (/\bskopeo copy\b/.test(run)) [...ECR_PUSH, 'ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer'].forEach((a) => need.add(a));
        const calls = awsCalls(run);
        if (run.includes('scripts/ops/ecs-one-off-task.sh')) awsCalls(runner).forEach((c) => calls.add(c));
        for (const c of calls) {
          const actions = CLI_TO_IAM[c];
          if (!actions) problems.push(`${where}: \`aws ${c}\` is not in CLI_TO_IAM, so its permission is unchecked`);
          else actions.forEach((a) => need.add(a));
        }
      }
      for (const a of need) {
        checked += 1;
        if (!allowed(role, a)) problems.push(`${where}: needs ${a}, which the ${role} role does not grant`);
      }
    }
  }
  if (problems.length) problems.forEach((p) => fail(`workflow IAM: ${p}`));
  else ok(`every AWS call the deploy and provision workflows make is granted to the role its job can assume (${checked} job×action pairs)`);
}

/**
 * The revisions the preflight checks are the revisions that run. The API step
 * publishes the ARN it checked; the database-task step compares against that
 * revision and publishes its own; the migration derives from the database
 * task's; migrate exports the API's, and deploy-api derives from it and refuses
 * if the family moved. Structural, read off the workflow itself, because a
 * runtime check of deploy-api would need AWS.
 */
function checkRevisionPinning(pre) {
  const { wf } = pre;
  const migrate = wf.jobs[pre.jobName];
  const step = migrate.steps.find((st) => (st.name ?? '').startsWith(PREFLIGHT_STEP));
  const problems = [];
  if (step.id !== 'preflight') problems.push('the preflight step has no `id: preflight`, so nothing can read its output');
  if (step.if !== undefined || step['continue-on-error']) problems.push('the preflight step is conditional or continue-on-error');
  if (migrate.outputs?.api_td_arn !== '${{ steps.preflight.outputs.api_td_arn }}') {
    problems.push(`job "${pre.jobName}" does not export the checked ARN as outputs.api_td_arn`);
  }
  const mPre = migrate.steps.find((st) => st.id === MIGRATE_PREFLIGHT_ID);
  if (!mPre) problems.push(`no step with id ${MIGRATE_PREFLIGHT_ID} checks the database task`);
  else {
    if (mPre.if !== undefined || mPre['continue-on-error']) problems.push(`the ${MIGRATE_PREFLIGHT_ID} step is conditional or continue-on-error`);
    if (mPre.env?.CHECKED_API_TD_ARN !== '${{ steps.preflight.outputs.api_td_arn }}') problems.push(`the ${MIGRATE_PREFLIGHT_ID} step does not compare against the checked API revision`);
  }
  const mig = migrate.steps.find((st) => st.id === 'migrate-task');
  if (
    mig?.env?.CHECKED_MIGRATE_TD_ARN !== `\${{ steps.${MIGRATE_PREFLIGHT_ID}.outputs.migrate_td_arn }}` ||
    !/SOURCE_TD_ARN="\$CHECKED_MIGRATE_TD_ARN"/.test(mig?.run ?? '') ||
    !/CONTAINER_NAME="\$ECS_MIGRATE_CONTAINER_NAME"/.test(mig?.run ?? '') ||
    !/scripts\/ops\/ecs-one-off-task\.sh/.test(mig?.run ?? '')
  ) {
    problems.push('the migration is not derived from the checked database-task ARN (step id migrate-task, via scripts/ops/ecs-one-off-task.sh)');
  }
  const order = (id) => migrate.steps.findIndex((st) => st.id === id);
  if (!(order('preflight') < order(MIGRATE_PREFLIGHT_ID) && order(MIGRATE_PREFLIGHT_ID) < order('migrate-task'))) {
    problems.push(`the steps do not run preflight → ${MIGRATE_PREFLIGHT_ID} → migrate-task`);
  }
  const deploy = Object.entries(wf.jobs).find(([, j]) => (j.steps ?? []).some((st) => st.id === 'register-api-td'));
  if (!deploy) {
    problems.push('no job registers the API revision (id register-api-td)');
  } else {
    const [dName, dJob] = deploy;
    const dStep = dJob.steps.find((st) => st.id === 'register-api-td');
    if (![].concat(dJob.needs ?? []).includes(pre.jobName)) problems.push(`job "${dName}" does not need "${pre.jobName}"`);
    if (dStep.env?.CHECKED_API_TD_ARN !== `\${{ needs.${pre.jobName}.outputs.api_td_arn }}`) problems.push(`job "${dName}" does not take the checked ARN from "${pre.jobName}"`);
    if (!/--task-definition "\$CHECKED_API_TD_ARN"/.test(dStep.run ?? '')) problems.push(`job "${dName}" does not derive the revision it rolls from the checked ARN`);
    if (!/"\$LATEST_API_TD_ARN" != "\$CHECKED_API_TD_ARN"/.test(dStep.run ?? '')) problems.push(`job "${dName}" does not refuse when the family moved after the check`);
  }
  if (problems.length) problems.forEach((pr) => fail(`revision pinning: ${pr}`));
  else ok('the revisions the preflight checked are the ones that run: the migration from the database task\'s, deploy-api from the API\'s (ARNs pinned end to end)');
}

/**
 * The owner's credential is the database task's alone. The rendered pair must
 * pass both steps, and each mutation below must be refused by the step that
 * exists to refuse it, naming what it refused. A gate only seen to pass has not
 * been tested, so the refusals run on every proof, not once for evidence.
 */
function checkDatabaseTask(pre, apiTd, migrateTd) {
  if (!pre.migrate) return fail(`deploy-aws.yml has no step with id ${MIGRATE_PREFLIGHT_ID} in job "${pre.jobName}"`);
  if (migrateTd.family !== pre.env.ECS_MIGRATE_TASK_FAMILY) {
    fail(`rendered database task family "${migrateTd.family}" is not the pipeline's ECS_MIGRATE_TASK_FAMILY ("${pre.env.ECS_MIGRATE_TASK_FAMILY}")`);
  }
  const runMigrate = (api, mig) => runPreflight(pre.migrate, [api, mig], { CHECKED_API_TD_ARN: api.taskDefinitionArn });
  const res = runMigrate(apiTd, migrateTd);
  if (res.status !== 0) {
    process.stderr.write(res.stdout + res.stderr);
    fail(`the ${MIGRATE_PREFLIGHT_ID} step refused the rendered database task (exit ${res.status})`);
  } else if (!res.githubOutput.includes(`migrate_td_arn=${migrateTd.taskDefinitionArn}\n`)) {
    fail(`the ${MIGRATE_PREFLIGHT_ID} step accepted but did not publish migrate_td_arn=${migrateTd.taskDefinitionArn}`);
  } else {
    ok(`the ${MIGRATE_PREFLIGHT_ID} step accepted the rendered database task and published the revision it checked`);
  }

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const withApi = (edit) => { const a = clone(apiTd); edit(a.containerDefinitions.find((c) => c.name === pre.env.ECS_API_CONTAINER_NAME), a); return a; };
  const withMigrate = (edit) => { const m = clone(migrateTd); edit(m.containerDefinitions[0], m); return m; };
  const ownerArn = (name) => migrateTd.containerDefinitions[0].secrets.find((s) => s.name === name)?.valueFrom;
  const cases = [
    ['API', 'an API task definition carrying DATABASE_URL', 'DATABASE_URL',
      withApi((c) => c.secrets.push({ name: 'DATABASE_URL', valueFrom: ownerArn('DATABASE_URL') })), null],
    ['API', 'an API task definition carrying APP_SERVICE_DB_PASSWORD', 'APP_SERVICE_DB_PASSWORD',
      withApi((c) => c.secrets.push({ name: 'APP_SERVICE_DB_PASSWORD', valueFrom: ownerArn('APP_SERVICE_DB_PASSWORD') })), null],
    ['API', 'an API task definition carrying DATABASE_URL_PROD as a plain value', 'DATABASE_URL_PROD',
      withApi((c) => c.environment.push({ name: 'DATABASE_URL_PROD', value: 'postgresql://c2c_admin@db/x' })), null],
    ['database', 'a database task without DATABASE_URL', 'DATABASE_URL',
      apiTd, withMigrate((c) => { c.secrets = c.secrets.filter((s) => s.name !== 'DATABASE_URL'); })],
    ['database', 'a database task whose environment differs (DB_AUDIT_REQUIRED=none)', 'DB_AUDIT_REQUIRED',
      apiTd, withMigrate((c) => { c.environment.find((e) => e.name === 'DB_AUDIT_REQUIRED').value = 'none'; })],
    ['database', 'a database task reading APP_DATABASE_URL from another secret', 'APP_DATABASE_URL',
      apiTd, withMigrate((c) => { c.secrets.find((s) => s.name === 'APP_DATABASE_URL').valueFrom = ownerArn('DATABASE_URL'); })],
    ['database', "a database task on the API's execution role", 'execution role',
      apiTd, withMigrate((_, m) => { m.executionRoleArn = apiTd.executionRoleArn; })],
    ['database', 'a database task with a second container', 'one container',
      apiTd, withMigrate((c, m) => { m.containerDefinitions.push({ ...clone(c), name: 'sidecar' }); })],
  ];
  for (const [step, what, named, api, mig] of cases) {
    const r = step === 'API' ? runPreflight(pre, api) : runMigrate(api, mig);
    const said = `${r.stdout}${r.stderr}`;
    if (r.status !== 0 && said.includes(named)) ok(`refused: ${what} (exit ${r.status}, names ${named})`);
    else fail(`NOT refused as it must be: ${what} (exit ${r.status}${r.status !== 0 ? `, without naming ${named}` : ''})`);
  }
}

function stringEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([, v]) => typeof v !== 'object').map(([k, v]) => [k, String(v)]));
}

/**
 * `terraform test -json -verbose`, read line by line, keeping only the summary,
 * the error lines and the one state this proof reads. Streamed, not buffered:
 * -verbose prints every run's full state, and at 41 runs (2026-10-01) the whole
 * output passed the longest string Node can hold (ERR_STRING_TOO_LONG), which
 * crashed this proof, and with it the CI job that runs it.
 */
function terraformTestLines(wantStates) {
  return new Promise((resolve, reject) => {
    const child = spawn('terraform', ['test', '-json', '-verbose', `-filter=${TEST_FILE}`], { cwd: TF_DIR });
    const kept = { summary: null, states: {}, errors: [] };
    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      const l = JSON.parse(line);
      if (l.type === 'test_summary') kept.summary = l;
      else if (l.type === 'test_state' && wantStates.includes(l['@testrun'])) kept.states[l['@testrun']] = l;
      if (l['@level'] === 'error') kept.errors.push(l['@message']);
    });
    child.stderr.on('data', () => {});
    child.on('error', reject);
    // Both, in either order: the exit status, and readline having emitted the
    // last line (it can still be draining when the process closes).
    const exited = new Promise((r) => child.on('close', r));
    const drained = new Promise((r) => rl.on('close', r));
    Promise.all([exited, drained]).then(([status]) => resolve({ status, ...kept }));
  });
}

/** `terraform test`, then the rendered task definitions from its final state. */
async function renderTaskDefinitions() {
  if (!noInit) {
    const init = spawnSync('terraform', ['init', '-backend=false', '-input=false', '-no-color'], { cwd: TF_DIR, encoding: 'utf8' });
    if (init.status !== 0) {
      console.error(init.stdout, init.stderr);
      console.error(`${TAG} FAIL — terraform init failed.`);
      process.exit(1);
    }
  }
  const t = await terraformTestLines(['renders_the_boot_contract', STAGING_RENDER]);
  const summary = t.summary;
  if (t.status !== 0 || !summary || summary.test_summary.status !== 'pass') {
    for (const m of t.errors) console.error(`  ${m}`);
    console.error(`${TAG} FAIL — terraform test did not pass (${summary ? summary.test_summary.status : 'no summary'}).`);
    process.exit(1);
  }
  const s = summary.test_summary;
  ok(`terraform test: ${s.passed} passed, ${s.failed} failed, ${s.errored} errored`);

  const state = t.states.renders_the_boot_contract;
  if (!state) {
    console.error(`${TAG} FAIL — no state for run "renders_the_boot_contract"; cannot read the rendered task definition.`);
    process.exit(1);
  }
  const walk = (m, out = []) => {
    (m.resources ?? []).forEach((r) => out.push(r));
    (m.child_modules ?? []).forEach((c) => walk(c, out));
    return out;
  };
  const all = walk(state.test_state.root_module);
  // The GitHub roles' rendered permissions, for checkWorkflowIam(): the deploy
  // role as production renders it, and the build role as staging does
  // (production has none: it never builds).
  const iamOf = (s) => walk(s.test_state.root_module).filter((x) => x.type === 'aws_iam_role_policy' && x.address.includes('module.github_deploy'));
  for (const r of iamOf(state)) if (r.name === 'deploy') renderedIam.deploy = JSON.parse(r.values.policy);
  const staging = t.states[STAGING_RENDER];
  if (!staging) {
    console.error(`${TAG} FAIL — no state for run "${STAGING_RENDER}"; cannot read staging's build role.`);
    process.exit(1);
  }
  for (const r of iamOf(staging)) if (r.name === 'build') renderedIam.build = JSON.parse(r.values.policy);
  const tds = all.filter((r) => r.type === 'aws_ecs_task_definition');
  return Object.fromEntries(tds.map((r) => [r.name, {
    family: r.values.family,
    executionRoleArn: r.values.execution_role_arn,
    containerDefinitions: JSON.parse(r.values.container_definitions),
  }]));
}

/**
 * Run the rendered healthCheck command against a stub that answers by PATH
 * (`routes`: path → status; anything else 404), or against nothing when
 * `routes` is null. By path, because the property that matters is WHICH
 * endpoint the check probes: a check on /readyz exits 0 against a stub that
 * answers every path 200, and then replaces every task in production.
 */
async function healthCheckExit(command, port, routes) {
  if (command[0] !== 'CMD') return { error: `health check is not exec form: ${command[0]}` };
  let server = null;
  if (routes !== null) {
    server = http.createServer((req, res) => {
      res.statusCode = routes[new URL(req.url, 'http://stub').pathname] ?? 404;
      res.end();
    });
    await new Promise((r) => server.listen(port, '127.0.0.1', r));
  }
  try {
    // Asynchronously: the stub server lives in THIS process, and spawnSync would
    // block the event loop it needs to answer the probe.
    const [bin, ...rest] = command.slice(1);
    const code = await new Promise((resolve) => {
      const child = spawn(bin === 'node' ? process.execPath : bin, rest, { stdio: 'ignore' });
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve('timeout'); }, 15000);
      child.on('exit', (c) => { clearTimeout(timer); resolve(c); });
    });
    return { code };
  } finally {
    if (server) await new Promise((r) => server.close(r));
  }
}

async function main() {
  const pre = loadPreflight();
  ok(`preflight step found in job "${pre.jobName}" (${pre.run.length} bytes of shell)`);

  let tdFile;
  let rendered = null;
  if (tdJsonArg) {
    tdFile = path.resolve(tdJsonArg);
  } else {
    rendered = await renderTaskDefinitions();
    tdFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-td-')), 'api-td.json');
    fs.writeFileSync(tdFile, JSON.stringify(rendered.api, null, 2));
    ok(`rendered API task definition written to ${tdFile}`);
  }

  // 2. Same family, or the preflight is checking something Terraform did not make.
  const td = JSON.parse(fs.readFileSync(tdFile, 'utf8'));
  // describe-task-definition returns the revision's ARN; the rendered plan has
  // none yet. Give it the shape ECS would, so the step's ARN handling runs.
  if (!td.taskDefinitionArn) {
    td.taskDefinitionArn = `arn:aws:ecs:us-east-1:123456789012:task-definition/${td.family}:1`;
    // Never into the caller's file. --td-json is pointed at filed evidence, and
    // until 2026-09-28 this wrote the synthetic ARN back into it, so running the
    // before/after proof altered the evidence it read.
    if (tdJsonArg) tdFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-td-')), 'api-td.json');
    fs.writeFileSync(tdFile, JSON.stringify(td, null, 2));
  }
  if (td.family !== pre.env.ECS_API_TASK_FAMILY) {
    fail(`rendered family "${td.family}" is not the family the pipeline inspects ("${pre.env.ECS_API_TASK_FAMILY}")`);
  } else {
    ok(`rendered family matches the pipeline's ECS_API_TASK_FAMILY (${td.family})`);
  }

  // 3. The preflight itself.
  const res = runPreflight(pre, td);
  process.stdout.write(res.stdout);
  process.stderr.write(res.stderr);
  if (res.status !== 0) fail(`deploy-aws.yml's preflight refused the task definition (exit ${res.status})`);
  else ok("deploy-aws.yml's preflight accepted the task definition");
  if (res.status === 0) {
    if (res.githubOutput.includes(`api_td_arn=${td.taskDefinitionArn}\n`)) ok(`the preflight published the revision it checked (${td.taskDefinitionArn})`);
    else fail(`the preflight accepted but did not publish api_td_arn=${td.taskDefinitionArn} (got ${JSON.stringify(res.githubOutput)})`);
  }

  if (tdJsonArg) return;

  // 3b. The database task (MR-03 Stage 3, OPS-16): accepted as rendered, and
  // each step refuses the definitions it exists to refuse.
  const mtd = { ...rendered.migrate, taskDefinitionArn: `arn:aws:ecs:us-east-1:123456789012:task-definition/${rendered.migrate.family}:1` };
  checkDatabaseTask(pre, td, mtd);

  checkRevisionPinning(pre);
  checkProvisionSource(mtd);
  checkWorkflowIam();

  // Where the preflight sits: it has to run before the production migration.
  const migrateJob = Object.entries(pre.wf.jobs).find(([, j]) => (j.steps ?? []).some((s) => s.id === 'migrate-task'));
  if (!migrateJob) fail('no step with id migrate-task in deploy-aws.yml; cannot confirm the preflight gates the migration');
  if (migrateJob) {
    const [mName, mJob] = migrateJob;
    const needs = [].concat(mJob.needs ?? []);
    const runsBefore = pre.jobName === mName
      ? (mJob.steps.findIndex((s) => (s.name ?? '').startsWith(PREFLIGHT_STEP)) <
         mJob.steps.findIndex((s) => s.id === 'migrate-task'))
      : needs.includes(pre.jobName);
    if (!runsBefore) fail(`the preflight (job "${pre.jobName}") does not run before the migration (job "${mName}")`);
    else ok(`the preflight runs before the migration (job "${mName}")`);
  }

  // 5. The health check, executed.
  const api = rendered.api.containerDefinitions[0];
  const hc = api.healthCheck?.command;
  const port = Number((api.portMappings ?? [])[0]?.containerPort ?? 5000);
  if (!hc) {
    fail('the API container has no health check');
  } else {
    // Live but not ready is the state a task is in whenever AnA, the schema or
    // the database is down (/readyz 503, latched for AnA). It must stay up:
    // replacing it cannot fix any of those, and the circuit breaker would roll
    // back every deploy. Only a process that cannot answer /healthz is dead.
    const liveNotReady = await healthCheckExit(hc, port, { '/healthz': 200, '/readyz': 503, '/api/health': 200 });
    const dead = await healthCheckExit(hc, port, { '/healthz': 503, '/readyz': 503, '/api/health': 503 });
    const closed = await healthCheckExit(hc, port, null);
    const verdict =
      `live but not ready (/healthz 200, /readyz 503) → exit ${liveNotReady.code}, ` +
      `/healthz 503 → exit ${dead.code}, nothing listening → exit ${closed.code}`;
    if (liveNotReady.error) fail(liveNotReady.error);
    else if (liveNotReady.code === 0 && dead.code !== 0 && closed.code !== 0) ok(`health check runs and discriminates: ${verdict}`);
    else fail(`health check does not behave: ${verdict}`);
  }
}

await main();
if (failures) {
  console.error(`\n${TAG} ${failures} check(s) failed.`);
  process.exit(1);
}
console.log(`\n${TAG} every check holds.`);
