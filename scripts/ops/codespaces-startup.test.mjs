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
  const runtime = 'postgresql://fake_app:DIFFERENT_FAKE_PASSWORD@ep-diagnostic-pooler.neon.tech/neondb?sslmode=require';
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
  assert.match(post, /No database is provisioned or switched/);
});
