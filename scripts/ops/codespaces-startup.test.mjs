import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const root = resolve(import.meta.dirname, '../..');
const startup = resolve(root, 'scripts/startup.sh');
const postStart = resolve(root, '.devcontainer/post-start.sh');
const postCreate = resolve(root, '.devcontainer/post-create.sh');

test('Codespaces shell hooks and startup script have valid bash syntax', () => {
  for (const file of [startup, postStart, postCreate]) {
    const run = spawnSync('bash', ['-n', file], { encoding: 'utf8' });
    assert.equal(run.status, 0, file + ': ' + run.stderr);
  }
});

test('sourcing Codespaces startup retains an injected Neon DSN, not .env or localhost', () => {
  const owner = 'postgresql://fake_owner:FAKE_PASSWORD@ep-diagnostic.neon.tech/neondb?sslmode=require';
  const runtime = 'postgresql://fake_app:DIFFERENT_FAKE_PASSWORD@ep-diagnostic-pooler.neon.tech/neondb?sslmode=require'; // ci-secret-scan-ignore: synthetic DSN for shell environment-retention assertions; no database connection is made.
  const env = { ...process.env, C2C_CODESPACE: '1', CODESPACES: 'true',
    DATABASE_URL: owner, APP_DATABASE_URL: runtime };
  const result = spawnSync('bash', ['-c',
    'source scripts/startup.sh; printf "C2C_OWNER_OK=%s\\n" "$([[ "$DATABASE_URL" == "$EXPECTED_OWNER" ]] && echo yes || echo no)"; ' +
    'printf "C2C_APP_OK=%s\\n" "$([[ "$APP_DATABASE_URL" == "$EXPECTED_APP" ]] && echo yes || echo no)"'], {
    cwd: root, env: { ...env, EXPECTED_OWNER: owner, EXPECTED_APP: runtime },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /C2C_OWNER_OK=yes/);
  assert.match(result.stdout, /C2C_APP_OK=yes/);
  assert.doesNotMatch(result.stdout + result.stderr, /FAKE_PASSWORD/);
});

test('missing Codespaces DSNs stay missing rather than becoming postgres:postgres localhost', () => {
  const env = { ...process.env, C2C_CODESPACE: '1', CODESPACES: 'true' };
  delete env.DATABASE_URL;
  delete env.APP_DATABASE_URL;
  const result = spawnSync('bash', ['-c',
    'source scripts/startup.sh; printf "C2C_OWNER_EMPTY=%s\\n" "$([[ -z "${DATABASE_URL:-}" ]] && echo yes || echo no)"'],
    { cwd: root, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /C2C_OWNER_EMPTY=yes/);
});

test('Codespaces main path gates on the doctor before any legacy mutation', () => {
  const source = readFileSync(startup, 'utf8');
  const fromMain = source.slice(source.indexOf('main() {'), source.indexOf('# Run main if executed'));
  const codespace = fromMain.slice(fromMain.indexOf('if is_codespace; then'),
    fromMain.indexOf('\n    load_env_file'));
  assert.match(codespace, /scripts\/ops\/codespaces-doctor\.mjs/);
  assert.doesNotMatch(codespace, /write_env_file|ensure_native_postgres|ensure_database|DATABASE_URL="\$DEFAULT_DATABASE_URL"/);
  assert.match(source, /if ! is_codespace && \[\[ -f "\$PROJECT_ROOT\/\.env" \]\]/);
  const post = readFileSync(postStart, 'utf8');
  const executableLines = post.split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n');
  assert.doesNotMatch(executableLines, /pg_hba\.conf|sed -i|ALTER USER postgres|export DATABASE_URL/);
});

test('Codespaces local database: the owner credential never reaches the app process', () => {
  const create = readFileSync(postCreate, 'utf8');
  const post = readFileSync(postStart, 'utf8');
  const code = text => text.split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n');
  // The state lives outside the repository, written under umask 077.
  assert.match(create, /C2C_CODESPACE_STATE="\$\{C2C_CODESPACE_STATE:-\$HOME\/\.concept2cure-codespace\}"/);
  assert.match(create, /umask 077/);
  // owner.env is read only inside the subshell that provisions or seeds accounts.
  const ownerReads = code(create + '\n' + post).split('\n').filter(line => /owner\.env/.test(line) && /(^|\s)\.\s|source /.test(line));
  assert.deepEqual(ownerReads.map(l => l.trim()), ['( set -a; . "$C2C_CODESPACE_STATE/owner.env"; set +a; "$@" )']);
  // The app.env the server runs with carries no owner credential.
  const appEnv = create.slice(create.indexOf('cat >"$app_env"'), create.indexOf('EOF', create.indexOf('cat >"$app_env"') + 20));
  assert.doesNotMatch(appEnv, /DATABASE_OWNER_URL|APP_SERVICE_DB_PASSWORD|C2C_OWNER_PASSWORD|^DATABASE_URL=/m);
  assert.match(appEnv, /C2C_DB_MODE=local/);
  // The app is started with every owner/maintenance name the doctor refuses removed.
  const doctor = readFileSync(resolve(root, 'scripts/ops/codespaces-doctor.mjs'), 'utf8');
  const names = doctor.slice(doctor.indexOf('const ownerNames = ['), doctor.indexOf('];', doctor.indexOf('const ownerNames = [')))
    .match(/'([A-Z_]+)'/g).map(s => s.slice(1, -1));
  for (const name of names) assert.match(post, new RegExp('\\b' + name + '\\b'), name + ' must be removed from the app env');
  assert.match(post, /exec env "\$\{C2C_UNSET\[@\]\}" NODE_ENV=development/);
  // The script reports readiness only after /readyz answered.
  assert.match(post, /c2c_app_up \|\| c2c_blocked/);
});

test('Codespaces boot does not seed an admin using owner or app role', () => {
  const source = readFileSync(resolve(root, 'server/db/bootstrap/index.ts'), 'utf8');
  const start = source.indexOf('export async function seedDemoAdminOutsideProduction()');
  const owner = source.indexOf('const ownerUrl = getDatabaseUrl()', start);
  assert.ok(start >= 0 && owner > start);
  const prelude = source.slice(start, owner);
  assert.match(prelude, /C2C_CODESPACE/);
  assert.match(prelude, /CODESPACES/);
  assert.match(prelude, /return;/);
});

test('a running app started without a model key this start holds is restarted, not kept', () => {
  const post = readFileSync(postStart, 'utf8');
  // The keys are compared with the RUNNING server process's own environment, by name.
  const lacks = post.slice(post.indexOf('c2c_keys_app_lacks() {'), post.indexOf('\n}\n', post.indexOf('c2c_keys_app_lacks() {')));
  assert.match(lacks, /\/proc\/\$pid\/environ/);
  assert.match(lacks, /for name in ANTHROPIC_API_KEY OPENAI_API_KEY/);
  assert.doesNotMatch(lacks, /echo "\$\{!name/, 'a key value must never be printed');
  const keep = post.slice(post.indexOf('if c2c_app_up; then\n  C2C_APP_LACKS'), post.indexOf('\nelse\n  c2c_start_app\nfi'));
  assert.match(keep, /if \[\[ -n "\$C2C_APP_LACKS" \]\]; then[\s\S]*c2c_stop_app\s+c2c_start_app[\s\S]*else\s+c2c_log "The app is already running/);
  // What the app itself reports for AnA is printed, not only this shell's key check.
  assert.match(post, /AnA in the running app: /);
});

function healthyAppDecision({ current, missingKeys = '' }) {
  const post = readFileSync(postStart, 'utf8');
  const start = post.indexOf('\nif c2c_app_up; then\n');
  const end = post.indexOf('\nc2c_log "The app is serving.', start);
  assert.ok(start >= 0 && end > start, 'exercise the actual healthy-app decision');
  return spawnSync('bash', ['-c', `
    set -u
    C2C_PORT=5000
    c2c_app_up() { return 0; }
    c2c_app_current() { return ${current ? 0 : 1}; }
    c2c_keys_app_lacks() { printf '%s' "$C2C_TEST_MISSING_KEYS"; }
    c2c_ana_state() { printf ready; }
    c2c_log() { printf '%s\\n' "$*"; }
    c2c_stop_app() { printf 'STOP_CALLED\\n'; }
    c2c_start_app() { printf 'START_CALLED\\n'; }
    ${post.slice(start, end)}
  `], { cwd: root, env: { ...process.env, C2C_TEST_MISSING_KEYS: missingKeys }, encoding: 'utf8' });
}

test('a healthy backend from another or unknown served commit is restarted after a pull', () => {
  const run = healthyAppDecision({ current: false });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /STOP_CALLED\nSTART_CALLED/);
});

test('a healthy backend at the current commit is retained unless it lacks a newly supplied key', () => {
  const current = healthyAppDecision({ current: true });
  assert.equal(current.status, 0, current.stderr);
  assert.doesNotMatch(current.stdout, /STOP_CALLED|START_CALLED/);
  const missingKey = healthyAppDecision({ current: true, missingKeys: 'ANTHROPIC_API_KEY' });
  assert.equal(missingKey.status, 0, missingKey.stderr);
  assert.match(missingKey.stdout, /STOP_CALLED\nSTART_CALLED/);
});

function servedCommitCheck({ head = 'a'.repeat(40), body = JSON.stringify({ commit: 'a'.repeat(40) }), gitStatus = 0, curlStatus = 0 }) {
  const post = readFileSync(postStart, 'utf8');
  const start = post.indexOf('c2c_app_current() {');
  const end = post.indexOf('\n}\n', start);
  assert.ok(start >= 0 && end > start, 'use the actual served-commit helper');
  return spawnSync('bash', ['-c', `
    set -uo pipefail
    C2C_PORT=5000
    git() { printf '%s' "$C2C_TEST_HEAD"; return "$C2C_TEST_GIT_STATUS"; }
    curl() { printf '%s' "$C2C_TEST_VERSION"; return "$C2C_TEST_CURL_STATUS"; }
    ${post.slice(start, end + 3)}
    c2c_app_current
  `], { cwd: root, env: { ...process.env, C2C_TEST_HEAD: head, C2C_TEST_VERSION: body,
    C2C_TEST_GIT_STATUS: String(gitStatus), C2C_TEST_CURL_STATUS: String(curlStatus) }, encoding: 'utf8' });
}

test('served-commit check accepts only an exact complete matching public build stamp', () => {
  assert.equal(servedCommitCheck({}).status, 0);
  for (const fixture of [
    { body: JSON.stringify({ commit: 'b'.repeat(40) }) },
    { body: JSON.stringify({ commit: 'unknown' }) },
    { body: JSON.stringify({ commit: 'a'.repeat(7) }) },
    { body: '{}' }, { body: 'not-json' }, { body: '' },
    { head: 'unknown' }, { gitStatus: 1 }, { curlStatus: 22 },
  ]) {
    const run = servedCommitCheck(fixture);
    assert.notEqual(run.status, 0, JSON.stringify(fixture));
    assert.equal(run.stdout, '', 'build-stamp check does not print process or configuration data');
  }
});

for (const command of ['dev', 'dev:local']) {
  test(`npm run ${command} reaches its local tsx binary after the existing startup gate`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'c2c-startup-path-'));
    try {
      const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
      mkdirSync(join(directory, 'scripts'), { recursive: true });
      mkdirSync(join(directory, 'node_modules', '.bin'), { recursive: true });
      writeFileSync(join(directory, 'package.json'), JSON.stringify({ scripts: { [command]: pkg.scripts[command] } }));
      writeFileSync(join(directory, 'scripts', 'startup.sh'), 'main() { printf "STARTUP_GATE_CALLED\\n"; }\n');
      const binary = join(directory, 'node_modules', '.bin', 'tsx');
      writeFileSync(binary, '#!/bin/sh\nprintf "LOCAL_TSX_CALLED:%s\\n" "$*"\n');
      chmodSync(binary, 0o755);
      const run = spawnSync('npm', ['run', '--silent', command], { cwd: directory,
        env: process.env, encoding: 'utf8', timeout: 15000 });
      assert.equal(run.status, 0, run.stdout + run.stderr);
      assert.match(run.stdout, /STARTUP_GATE_CALLED/);
      assert.match(run.stdout, /LOCAL_TSX_CALLED:--inspect=0 server\/index\.ts/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
}
