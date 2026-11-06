import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
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
