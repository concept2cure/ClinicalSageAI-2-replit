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
 *   1. `terraform test` on terraform/environments/production with the AWS
 *      provider mocked (tests/boot_contract.tftest.hcl). No account needed.
 *   2. Reads the rendered API task definition out of the test's final state,
 *      and fails unless its family is the one the pipeline inspects.
 *   3. Runs the preflight step's own shell against it (`aws` stubbed).
 *   4. Checks the revision the preflight checked is the one that rolls: the
 *      step publishes its ARN; migrate and deploy-api derive from it.
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
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TF_DIR = path.join(repoRoot, 'terraform', 'environments', 'production');
const TEST_FILE = 'tests/boot_contract.tftest.hcl';
const WORKFLOW = path.join(repoRoot, '.github', 'workflows', 'deploy-aws.yml');
const PREFLIGHT_STEP = 'Preflight — task definition must carry the production boot contract';
const TAG = '[terraform-preflight-proof]';

const args = process.argv.slice(2);
const tdJsonArg = args.includes('--td-json') ? args[args.indexOf('--td-json') + 1] : null;
const noInit = args.includes('--no-init');

let failures = 0;
const fail = (msg) => { failures += 1; console.error(`${TAG} FAIL — ${msg}`); };
const ok = (msg) => console.log(`${TAG} ok — ${msg}`);

/** The preflight step, as the pipeline runs it: its shell and its env. */
function loadPreflight() {
  const wf = loadYaml(fs.readFileSync(WORKFLOW, 'utf8'));
  for (const [jobName, job] of Object.entries(wf.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      if ((step.name ?? '').startsWith(PREFLIGHT_STEP)) {
        const env = { ...(wf.env ?? {}), ...(job.env ?? {}), ...(step.env ?? {}) };
        return { jobName, run: step.run, env, needs: [].concat(job.needs ?? []), wf };
      }
    }
  }
  console.error(`${TAG} FAIL — no step named "${PREFLIGHT_STEP}" in deploy-aws.yml; nothing to check against.`);
  process.exit(1);
}

/** Run the preflight shell with `aws` answering from a file. */
function runPreflight(pre, tdFile) {
  const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-preflight-'));
  // The step's only AWS call is `aws ecs describe-task-definition … --query
  // taskDefinition`; answer it from the rendered file and nothing else.
  fs.writeFileSync(path.join(shimDir, 'aws'), '#!/usr/bin/env bash\ncat "$TD_JSON"\n', { mode: 0o755 });
  const outputFile = path.join(shimDir, 'github_output');
  fs.writeFileSync(outputFile, '');
  const res = spawnSync('bash', ['-c', pre.run], {
    encoding: 'utf8',
    env: {
      ...process.env, ...stringEnv(pre.env), TD_JSON: tdFile, GITHUB_OUTPUT: outputFile,
      PATH: `${shimDir}:${process.env.PATH}`,
    },
  });
  res.githubOutput = fs.readFileSync(outputFile, 'utf8');
  fs.rmSync(shimDir, { recursive: true, force: true });
  return res;
}

/**
 * The revision the preflight checks is the revision that rolls. The step
 * publishes the ARN it checked; migrate derives from that ARN, exports it, and
 * deploy-api derives from it and refuses if the family moved. Structural, read
 * off the workflow itself, because a runtime check of deploy-api would need AWS.
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
  const reg = migrate.steps.find((st) => (st.name ?? '').startsWith('Register migration task definition'));
  if (reg?.env?.CHECKED_API_TD_ARN !== '${{ steps.preflight.outputs.api_td_arn }}' || !/--task-definition "\$CHECKED_API_TD_ARN"/.test(reg?.run ?? '')) {
    problems.push('the migration task definition is not derived from the checked ARN');
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
  else ok('the revision the preflight checked is the one migrate and deploy-api derive from (ARN pinned end to end)');
}

function stringEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([, v]) => typeof v !== 'object').map(([k, v]) => [k, String(v)]));
}

/** `terraform test`, then the rendered task definitions from its final state. */
function renderTaskDefinitions() {
  if (!noInit) {
    const init = spawnSync('terraform', ['init', '-backend=false', '-input=false', '-no-color'], { cwd: TF_DIR, encoding: 'utf8' });
    if (init.status !== 0) {
      console.error(init.stdout, init.stderr);
      console.error(`${TAG} FAIL — terraform init failed.`);
      process.exit(1);
    }
  }
  const t = spawnSync('terraform', ['test', '-json', '-verbose', `-filter=${TEST_FILE}`], {
    cwd: TF_DIR, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024,
  });
  const lines = t.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const summary = lines.find((l) => l.type === 'test_summary');
  if (t.status !== 0 || !summary || summary.test_summary.status !== 'pass') {
    for (const l of lines) if (l['@level'] === 'error') console.error(`  ${l['@message']}`);
    console.error(`${TAG} FAIL — terraform test did not pass (${summary ? summary.test_summary.status : 'no summary'}).`);
    process.exit(1);
  }
  const s = summary.test_summary;
  ok(`terraform test: ${s.passed} passed, ${s.failed} failed, ${s.errored} errored`);

  const state = lines.find((l) => l.type === 'test_state' && l['@testrun'] === 'renders_the_boot_contract');
  if (!state) {
    console.error(`${TAG} FAIL — no state for run "renders_the_boot_contract"; cannot read the rendered task definition.`);
    process.exit(1);
  }
  const walk = (m, out = []) => {
    (m.resources ?? []).forEach((r) => out.push(r));
    (m.child_modules ?? []).forEach((c) => walk(c, out));
    return out;
  };
  const tds = walk(state.test_state.root_module).filter((r) => r.type === 'aws_ecs_task_definition');
  return Object.fromEntries(tds.map((r) => [r.name, {
    family: r.values.family,
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
    rendered = renderTaskDefinitions();
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
    fs.writeFileSync(tdFile, JSON.stringify(td, null, 2));
  }
  if (td.family !== pre.env.ECS_API_TASK_FAMILY) {
    fail(`rendered family "${td.family}" is not the family the pipeline inspects ("${pre.env.ECS_API_TASK_FAMILY}")`);
  } else {
    ok(`rendered family matches the pipeline's ECS_API_TASK_FAMILY (${td.family})`);
  }

  // 3. The preflight itself.
  const res = runPreflight(pre, tdFile);
  process.stdout.write(res.stdout);
  process.stderr.write(res.stderr);
  if (res.status !== 0) fail(`deploy-aws.yml's preflight refused the task definition (exit ${res.status})`);
  else ok("deploy-aws.yml's preflight accepted the task definition");
  if (res.status === 0) {
    if (res.githubOutput.includes(`api_td_arn=${td.taskDefinitionArn}\n`)) ok(`the preflight published the revision it checked (${td.taskDefinitionArn})`);
    else fail(`the preflight accepted but did not publish api_td_arn=${td.taskDefinitionArn} (got ${JSON.stringify(res.githubOutput)})`);
  }

  if (tdJsonArg) return;

  checkRevisionPinning(pre);

  // Where the preflight sits: it has to run before the production migration.
  const migrateJob = Object.entries(pre.wf.jobs).find(([, j]) => (j.steps ?? []).some((s) => (s.name ?? '').startsWith('Register migration task definition')));
  if (migrateJob) {
    const [mName, mJob] = migrateJob;
    const needs = [].concat(mJob.needs ?? []);
    const runsBefore = pre.jobName === mName
      ? (mJob.steps.findIndex((s) => (s.name ?? '').startsWith(PREFLIGHT_STEP)) <
         mJob.steps.findIndex((s) => (s.name ?? '').startsWith('Register migration task definition')))
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
