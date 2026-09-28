/**
 * scripts/ops/ecs-one-off-task.sh — the runner for the per-deploy migration and
 * the first provision of an empty database — against a fake `aws`.
 *
 * It cannot be exercised against AWS from CI, and a pipeline step that has
 * never run is a guess. The fake answers each call the script makes from a
 * scenario, and records every call, so each property is checked by running the
 * real script: the task definition it registers, that run-task is called ONCE,
 * that a deadline stops the task and fails, and that a container which never
 * ran is not reported as success.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RUNNER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../ops/ecs-one-off-task.sh');

const SOURCE_TD = {
  family: 'c2c-production-api',
  taskDefinitionArn: 'arn:aws:ecs:us-east-1:111122223333:task-definition/c2c-production-api:7',
  executionRoleArn: 'arn:aws:iam::111122223333:role/exec',
  taskRoleArn: 'arn:aws:iam::111122223333:role/task',
  networkMode: 'awsvpc',
  requiresCompatibilities: ['FARGATE'],
  cpu: '1024',
  memory: '2048',
  revision: 7,
  status: 'ACTIVE',
  containerDefinitions: [
    {
      name: 'api',
      image: 'old',
      portMappings: [{ containerPort: 5000 }],
      healthCheck: { command: ['CMD', 'true'] },
      dependsOn: [{ containerName: 'log-router', condition: 'START' }],
      secrets: [
        { name: 'DATABASE_URL', valueFrom: 'arn:secret:database_url' },
        { name: 'APP_SERVICE_DB_PASSWORD', valueFrom: 'arn:secret:old' },
      ],
      logConfiguration: { logDriver: 'awslogs', options: { 'awslogs-group': '/ecs/api', 'awslogs-stream-prefix': 'api' } },
    },
    { name: 'log-router', image: 'fluent' },
  ],
};

/**
 * A fake `aws`: bash that appends its argv to calls.log and answers from the
 * scenario directory. describe-tasks walks a list of statuses, one per call.
 */
function makeFake(dir, scenario) {
  fs.writeFileSync(path.join(dir, 'source.json'), JSON.stringify(SOURCE_TD));
  fs.writeFileSync(path.join(dir, 'statuses'), (scenario.statuses ?? ['RUNNING', 'STOPPED']).join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(scenario.run ?? { tasks: [{ taskArn: 'arn:aws:ecs:us-east-1:111122223333:task/c2c/abc123' }], failures: [] }));
  fs.writeFileSync(path.join(dir, 'final.json'), JSON.stringify(scenario.final ?? {
    tasks: [{ lastStatus: 'STOPPED', stoppedReason: 'Essential container in task exited', containers: [{ name: 'api', exitCode: 0 }] }],
  }));
  fs.writeFileSync(path.join(dir, 'network.json'), JSON.stringify(scenario.network === undefined
    ? { awsvpcConfiguration: { subnets: ['subnet-a'], securityGroups: ['sg-ecs'], assignPublicIp: 'DISABLED' } }
    : scenario.network));
  const aws = `#!/usr/bin/env bash
D=${JSON.stringify(dir)}
echo "$*" >> "$D/calls.log"
case "$2" in
  describe-task-definition) cat "$D/source.json" ;;
  register-task-definition)
    f="\${3#file://}"; for a in "$@"; do case "$a" in file://*) f="\${a#file://}";; esac; done
    cp "$f" "$D/registered.json"; echo "arn:aws:ecs:us-east-1:111122223333:task-definition/c2c-production-provision:1" ;;
  describe-services) cat "$D/network.json" ;;
  run-task) cat "$D/run.json" ;;
  describe-tasks)
    if [[ "$*" == *"--query tasks[0].lastStatus"* ]]; then
      s=$(head -n1 "$D/statuses"); [ "$(wc -l < "$D/statuses")" -gt 1 ] && sed -i 1d "$D/statuses"; echo "$s"
    else cat "$D/final.json"; fi ;;
  stop-task) echo '{}' ;;
esac
[ "$1" = logs ] && echo "provision log line"
exit 0
`;
  fs.writeFileSync(path.join(dir, 'aws'), aws, { mode: 0o755 });
}

function run(scenario = {}, envOverrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-one-off-'));
  makeFake(dir, scenario);
  const out = path.join(dir, 'github_output');
  fs.writeFileSync(out, '');
  const res = spawnSync('bash', [RUNNER], {
    encoding: 'utf8',
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      ECS_CLUSTER: 'c2c-production',
      ECS_API_SERVICE: 'c2c-production-api',
      SOURCE_TD_ARN: SOURCE_TD.taskDefinitionArn,
      CONTAINER_NAME: 'api',
      FAMILY: 'c2c-production-provision',
      IMAGE: '111122223333.dkr.ecr.us-east-1.amazonaws.com/c2c-prod-api@sha256:' + 'a'.repeat(64),
      COMMAND_JSON: '["npm","run","db:provision"]',
      LABEL: 'provision',
      STARTED_BY: 'test',
      POLL_SECONDS: '0',
      GITHUB_OUTPUT: out,
      ...envOverrides,
    },
  });
  const read = (f) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8') : '');
  const result = {
    status: res.status,
    output: res.stdout + res.stderr,
    calls: read('calls.log').trim().split('\n').filter(Boolean),
    registered: read('registered.json') ? JSON.parse(read('registered.json')) : null,
    githubOutput: read('github_output'),
  };
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

test('registers a one-off definition derived from the CHECKED revision, and exits with the task\'s code', () => {
  const r = run({}, { EXTRA_SECRETS_JSON: '[{"name":"DATABASE_OWNER_URL","valueFrom":"arn:secret:database_url"},{"name":"APP_SERVICE_DB_PASSWORD","valueFrom":"arn:secret:new"}]' });
  assert.equal(r.status, 0, r.output);
  assert.ok(r.calls[0].includes(`describe-task-definition --task-definition ${SOURCE_TD.taskDefinitionArn}`), 'derives from the ARN given, not the family');
  const c = r.registered.containerDefinitions;
  assert.equal(c.length, 1, 'sidecars dropped');
  assert.equal(r.registered.family, 'c2c-production-provision');
  assert.deepEqual(c[0].command, ['npm', 'run', 'db:provision']);
  assert.match(c[0].image, /@sha256:/);
  assert.equal(c[0].portMappings, undefined);
  assert.equal(c[0].healthCheck, undefined);
  assert.equal(c[0].dependsOn, undefined, 'wiring to dropped sidecars removed');
  const secrets = Object.fromEntries(c[0].secrets.map((s) => [s.name, s.valueFrom]));
  assert.equal(secrets.DATABASE_OWNER_URL, 'arn:secret:database_url', 'extra secret added');
  assert.equal(secrets.APP_SERVICE_DB_PASSWORD, 'arn:secret:new', 'extra secret replaces, not duplicates');
  assert.equal(c[0].secrets.filter((s) => s.name === 'APP_SERVICE_DB_PASSWORD').length, 1);
  assert.equal(r.registered.revision, undefined, 'describe-only fields not sent to register');
  assert.match(r.githubOutput, /^task_def_arn=arn:aws:ecs:.*c2c-production-provision:1$/m);
  assert.match(r.githubOutput, /^task_arn=arn:aws:ecs:.*task\/c2c\/abc123$/m);
  assert.match(r.output, /provision log line/, 'the task\'s own log is printed');
});

test('a task that exits non-zero fails the step with that code', () => {
  const r = run({ final: { tasks: [{ lastStatus: 'STOPPED', stoppedReason: 'Essential container in task exited', containers: [{ name: 'api', exitCode: 6 }] }] } });
  assert.equal(r.status, 6);
  assert.match(r.output, /provision log line/, 'the log is printed on failure too');
});

test('run-task is called once, and its own failures are reported when no task starts', () => {
  const r = run({ run: { tasks: [], failures: [{ reason: 'RESOURCE:ENI', arn: 'x' }] } });
  assert.equal(r.status, 1);
  assert.equal(r.calls.filter((l) => l.startsWith('ecs run-task')).length, 1, 'never a second run-task');
  assert.match(r.output, /RESOURCE:ENI/);
});

test('past the deadline the task is STOPPED and the step fails 124', () => {
  const r = run({ statuses: ['RUNNING'] }, { DEADLINE_SECONDS: '0' });
  assert.equal(r.status, 124);
  assert.ok(r.calls.some((l) => l.startsWith('ecs stop-task')), 'the task is stopped, not abandoned');
});

test('a container that never ran (no exit code) is a failure, not success', () => {
  const r = run({ final: { tasks: [{ lastStatus: 'STOPPED', stoppedReason: 'ResourceInitializationError: unable to pull secrets', containers: [{ name: 'api' }] }] } });
  assert.equal(r.status, 1);
  assert.match(r.output, /never ran/);
  assert.match(r.output, /ResourceInitializationError/);
});

test('refuses a mutable image tag, before any AWS call', () => {
  const r = run({}, { IMAGE: '111122223333.dkr.ecr.us-east-1.amazonaws.com/c2c-prod-api:latest' });
  assert.equal(r.status, 1);
  assert.equal(r.calls.length, 0);
});

test('refuses to launch without the API service\'s network configuration', () => {
  const r = run({ network: null });
  assert.equal(r.status, 1);
  assert.equal(r.calls.filter((l) => l.startsWith('ecs run-task')).length, 0);
  assert.match(r.output, /networkConfiguration/);
});
