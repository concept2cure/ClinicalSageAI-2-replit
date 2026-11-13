import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, statSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { resolve, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { docxFixture, pythonCheck } from './codespaces-docx-fixture.mjs';
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

function dependencyStart(state) {
  const post = readFileSync(postStart, 'utf8');
  const start = post.indexOf('echo "No database or AI secret is printed."');
  const end = post.indexOf('\nc2c_blocked()', start);
  assert.ok(start >= 0 && end > start, 'exercise the actual state preparation and dependency branch');
  return spawnSync('bash', ['-c', `
    set -u
    C2C_CODESPACE_STATE="$C2C_TEST_STATE"
    c2c_log() { printf '%s\\n' "$*"; }
    c2c_deps_current() { return 1; }
    pkill() { printf 'STOP_APP_CALLED\\n'; }
    c2c_install_deps() { printf 'INSTALL_REACHED\\n'; }
    ${post.slice(start, end)}
  `], { cwd: root, env: { ...process.env, C2C_TEST_STATE: state }, encoding: 'utf8' });
}

test('post-start creates private state before redirecting its first dependency install', () => {
  const dir = mkdtempSync(join(tmpdir(), 'c2c-cold-start-'));
  try {
    const state = join(dir, 'new state');
    const run = dependencyStart(state);
    assert.equal(run.status, 0, run.stderr);
    assert.ok(existsSync(join(state, 'npm-ci.log')), 'the first install reached its actual log redirection');
    assert.match(readFileSync(join(state, 'npm-ci.log'), 'utf8'), /INSTALL_REACHED/);
    assert.equal(statSync(state).mode & 0o777, 0o700);
    assert.doesNotMatch(run.stdout + run.stderr, /BLOCKED|No such file or directory/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('post-start keeps existing state and restores its private directory permissions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'c2c-existing-start-'));
  try {
    const state = join(dir, 'state'); mkdirSync(state); chmodSync(state, 0o755);
    writeFileSync(join(state, 'retained-marker'), 'preserve-existing-state');
    const run = dependencyStart(state);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(readFileSync(join(state, 'retained-marker'), 'utf8'), 'preserve-existing-state');
    assert.equal(statSync(state).mode & 0o777, 0o700);
    assert.match(readFileSync(join(state, 'npm-ci.log'), 'utf8'), /INSTALL_REACHED/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('post-start holds before stopping or installing when private state cannot be prepared', () => {
  const dir = mkdtempSync(join(tmpdir(), 'c2c-blocked-start-'));
  try {
    const state = join(dir, 'not-a-directory'); writeFileSync(state, 'retained-file');
    const run = dependencyStart(state);
    assert.equal(run.status, 0, 'a blocked hook leaves the editor open');
    assert.match(run.stdout, /BLOCKED: the private local state directory could not be prepared\./);
    assert.doesNotMatch(run.stdout + run.stderr, /STOP_APP_CALLED|INSTALL_REACHED|Not a directory/);
    assert.equal(readFileSync(state, 'utf8'), 'retained-file');
  } finally { rmSync(dir, { recursive: true, force: true }); }
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

function healthyAppDecision({ current, missingKeys = '', docxCurrent = true }) {
  const post = readFileSync(postStart, 'utf8');
  const start = post.indexOf('\nif c2c_app_up; then\n');
  const end = post.indexOf('\nc2c_log "The app is serving.', start);
  assert.ok(start >= 0 && end > start, 'exercise the actual healthy-app decision');
  return spawnSync('bash', ['-c', `
    set -u
    C2C_PORT=5000
    c2c_app_up() { return 0; }
    c2c_app_current() { return ${current ? 0 : 1}; }
    c2c_app_docx_current() { return ${docxCurrent ? 0 : 1}; }
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

// Use a real process environment and the existing helper/keep decision. Only
// the process lookup is supplied: no server, credential or provider is involved.
async function providerKeyDecision({ running = {}, current = {} }) {
  const post = readFileSync(postStart, 'utf8');
  const helperStart = post.indexOf('c2c_keys_app_lacks() {');
  const helperEnd = post.indexOf('\n}\n', helperStart);
  const decisionStart = post.indexOf('\nif c2c_app_up; then\n');
  const decisionEnd = post.indexOf('\nc2c_log "The app is serving.', decisionStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart && decisionEnd > decisionStart);
  const baseEnv = { ...process.env };
  delete baseEnv.ANTHROPIC_API_KEY;
  delete baseEnv.OPENAI_API_KEY;
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    env: { ...baseEnv, ...running }, stdio: 'ignore',
  });
  await once(child, 'spawn');
  try {
    const result = spawnSync('bash', ['-c', `
      set -uo pipefail
      C2C_PORT=5000
      pgrep() { printf '%s\\n' "$C2C_TEST_PID"; }
      c2c_app_up() { return 0; }
      c2c_app_current() { return 0; }
      c2c_app_docx_current() { return 0; }
      c2c_ana_state() { printf ready; }
      c2c_log() { printf '%s\\n' "$*"; }
      c2c_stop_app() { printf 'STOP_CALLED\\n'; }
      c2c_start_app() { printf 'START_CALLED\\n'; }
      ${post.slice(helperStart, helperEnd + 3)}
      printf 'KEY_NAMES=%s\\n' "$(c2c_keys_app_lacks)"
      ${post.slice(decisionStart, decisionEnd)}
    `], { cwd: root, env: { ...baseEnv, ...current, C2C_TEST_PID: String(child.pid) }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    for (const key of [...Object.values(running), ...Object.values(current)].filter(Boolean)) {
      assert.equal((result.stdout + result.stderr).includes(key), false, 'only key names may be reported');
    }
    return result.stdout;
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  }
}

for (const name of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) {
  test(`a corrected ${name} restarts the actual healthy-app decision without revealing either value`, async () => {
    const result = await providerKeyDecision({ running: { [name]: `FAKE_OLD_${name}` },
      current: { [name]: `FAKE_CORRECTED_${name}` } });
    assert.match(result, new RegExp(`KEY_NAMES=${name}\\n`));
    assert.match(result, /STOP_CALLED\nSTART_CALLED/);
  });
}

test('matching provider values retain the running app', async () => {
  const keys = { ANTHROPIC_API_KEY: 'FAKE_MATCHING_ANTHROPIC', OPENAI_API_KEY: 'FAKE_MATCHING_OPENAI' };
  const result = await providerKeyDecision({ running: keys, current: keys });
  assert.match(result, /KEY_NAMES=\n/);
  assert.doesNotMatch(result, /STOP_CALLED|START_CALLED/);
});

test('a newly supplied key still restarts an app whose process lacks it', async () => {
  const result = await providerKeyDecision({ current: { ANTHROPIC_API_KEY: 'FAKE_NEW_ANTHROPIC' } });
  assert.match(result, /KEY_NAMES=ANTHROPIC_API_KEY\n/);
  assert.match(result, /STOP_CALLED\nSTART_CALLED/);
});

test('absent terminal provider keys retain existing running keys without disclosure', async () => {
  const result = await providerKeyDecision({ running: { ANTHROPIC_API_KEY: 'FAKE_RETAINED_ANTHROPIC',
    OPENAI_API_KEY: 'FAKE_RETAINED_OPENAI' } });
  assert.match(result, /KEY_NAMES=\n/);
  assert.doesNotMatch(result, /STOP_CALLED|START_CALLED/);
});

test('empty terminal provider keys preserve the existing absent-key behavior', async () => {
  const result = await providerKeyDecision({ running: { ANTHROPIC_API_KEY: 'FAKE_RETAINED_ANTHROPIC' },
    current: { ANTHROPIC_API_KEY: '' } });
  assert.match(result, /KEY_NAMES=\n/);
  assert.doesNotMatch(result, /STOP_CALLED|START_CALLED/);
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

// 2026-11-10: without a second signer every two-person demo step (QMS approvals, method validation, the RACT's
// approval, review requests) was recorded "not executed", so RBM's "Generate from RACT" was refused on every project.
// The packs route a draft to review before approving it (158323d776), so the approver, never the author, signs.
test('the demo seed is given the approver as its second signer', () => {
  const code = readFileSync(postStart, 'utf8').split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n');
  const start = code.indexOf('DEMO_MANIFEST_ROOT=');
  assert.ok(start >= 0, 'the demo seed step is present');
  const seed = code.slice(start, code.indexOf('demo:seed', start));
  assert.match(seed, /OQ_SIGNER_EMAIL="\$DEMO_APPROVER_EMAIL"/);
  assert.match(seed, /OQ_SIGNER_PASSWORD="\$DEMO_SIGNER_PASSWORD"/);
  assert.doesNotMatch(seed, /OQ_SIGNER_EMAIL="\$(DEMO_SEED_EMAIL|DEMO_AUTHOR_EMAIL)"/);
});

// 2026-11-10, a fresh Codespace: every demo person is an administrator, and with no QMS approver designated only the
// Approver role approves, so the QMS packs' approvals by the second signer were refused (MEMBER_NOT_QMS_APPROVER) and
// the seed never finished. The approver is designated first, through the governed route an administrator uses.
test('the approver is designated as the QMS approver, through the governed route, before the demo seed', () => {
  const code = readFileSync(postStart, 'utf8').split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n');
  const call = code.indexOf('c2c_designate_qms_approver "$DEMO_SEED_EMAIL" "$DEMO_APPROVER_EMAIL"');
  assert.ok(call >= 0, 'the designation is called for the approver, as the seeding administrator');
  assert.ok(call < code.indexOf('npm run --silent demo:seed -- --pack all'), 'before the demo seed');
  const fn = code.slice(code.indexOf('c2c_designate_qms_approver() {'), call);
  assert.match(fn, /\/api\/tenant-users\/" \+ org \+ "\/" \+ person\.id \+ "\/qms-approver"/);
  assert.match(fn, /method: "PUT"/);
  assert.match(fn, /designated: true, reason: "/);
  assert.match(fn, /\/api\/auth\/logout/, 'the administrator signs out, so the session does not hold a slot');
});

// 2026-11-10, the showcase pass, in a Codespace-shaped stack: every report and bundle PDF export answered 503
// REPORT_PDF_FONTS_UNAVAILABLE, a document's "Download, PDF" answered 503 PDF_RENDERER_UNAVAILABLE, and Compile said
// "xmllint not available". Only the production image and CI installed the fonts, LibreOffice and xmllint.
test('the Codespace installs what the document exports need, and a failed install never blocks the start', () => {
  const dir = mkdtempSync(join(tmpdir(), 'c2c-export-tools-'));
  try {
    const bin = join(dir, 'bin'); mkdirSync(bin);
    const calls = join(dir, 'apt-calls');
    const script = (name, body) => { writeFileSync(join(bin, name), `#!/bin/bash\n${body}\n`); chmodSync(join(bin, name), 0o755); };
    const fakeApt = (body) => script('apt-get', `echo "$@" >> "${calls}"\n${body}`);
    script('sudo', 'while [[ "$1" == -* ]]; do shift; done\nexec "$@"');
    const font = join(dir, 'NotoSans-Regular.ttf');
    // Only this directory and the shell's own tools: no libreoffice or xmllint from the machine running the test.
    const tools = join(dir, 'tools'); mkdirSync(tools);
    for (const name of ['bash', 'tr', 'cat', 'touch', 'dirname', 'id', 'sed', 'grep', 'date', 'git', 'env']) {
      const found = spawnSync('bash', ['-c', `command -v ${name}`], { encoding: 'utf8' }).stdout.trim();
      if (found) script(name, `exec ${found} "$@"`);
    }
    const run = () => spawnSync('bash', ['-c', `source "${postCreate}"; c2c_install_export_tools; echo "rc=$?"; echo "missing=[$(c2c_export_tools_missing | tr '\\n' ' ')]"`], {
      cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${tools}`, C2C_REPORT_FONT: font } });

    fakeApt('exit 100');
    const failed = run();
    assert.match(failed.stdout, /rc=0/, 'a failed install returns success: ' + failed.stdout + failed.stderr);
    assert.match(failed.stdout + failed.stderr, /could not be installed/);
    assert.match(failed.stdout, /missing=\[fonts-noto-core fonts-noto-cjk libreoffice-writer libreoffice-common fonts-liberation libxml2-utils \]/);

    writeFileSync(calls, '');
    fakeApt(`if [[ "$1" == install ]]; then touch "${font}"; for t in libreoffice xmllint; do printf '#!/bin/bash\\n' > "${bin}/$t"; chmod +x "${bin}/$t"; done; fi\nexit 0`);
    const installed = run();
    assert.match(installed.stdout, /rc=0/);
    assert.match(readFileSync(calls, 'utf8'),
      /install -y -qq --no-install-recommends fonts-noto-core fonts-noto-cjk libreoffice-writer libreoffice-common fonts-liberation libxml2-utils/);
    assert.match(installed.stdout + installed.stderr, /Document export tools installed/);
    assert.match(installed.stdout, /missing=\[\]/);

    writeFileSync(calls, '');
    const present = run();
    assert.match(present.stdout, /rc=0/);
    assert.equal(readFileSync(calls, 'utf8'), '', 'everything already there: apt is not called');
  } finally { rmSync(dir, { recursive: true, force: true }); }

  const code = readFileSync(postStart, 'utf8').split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n');
  const call = code.indexOf('\nc2c_install_export_tools\n');
  assert.ok(call >= 0, 'post-start installs them: an existing Codespace never re-runs post-create');
  assert.ok(call < code.indexOf('npm run --silent demo:seed -- --pack all'), 'before the long demo seed');
  assert.doesNotMatch(code, /c2c_install_export_tools \|\|/, 'never a blocking step');
});

// Showcase walk, 2026-11-10: with a key the provider refuses and no embeddings key, /readyz names only the search
// lane, and the start printed "ANTHROPIC_API_KEY: BLOCKED ANTHROPIC_KEY_INVALID" followed by "AnA in the running app
// answers and drafts with the Anthropic key". The second line is said only when the drafting call was answered.
test('the start says AnA answers and drafts only when the drafting call with this key was answered', () => {
  const post = readFileSync(postStart, 'utf8');
  const lane = post.slice(post.indexOf('embedding_lane_down|no_embedding_lane)'), post.indexOf('*) c2c_log "AnA in the running app: $C2C_APP_ANA.'));
  assert.match(lane, /if \[\[ "\$\{C2C_DRAFTING_LINE:-\}" == "answered by"\* \]\]; then\n\s+c2c_log "AnA in the running app answers and drafts with the Anthropic key/);
  assert.match(lane, /else\n\s+c2c_log "AnA in the running app cannot answer or draft yet: see the ANTHROPIC_API_KEY lines above\."/);
  assert.match(lane, /Search is off \(\$C2C_APP_ANA\)/);
  assert.equal((post.match(/answers and drafts with the Anthropic key/g) ?? []).length, 1);
});

// 2026-11-10: Compliance reports' "Run attestation" answered 503 in every Codespace, because nothing gave the app an
// attestation signing key. The Codespace mints its own, like its JWT secrets: in app.env when the state is first
// written, and added by a start to an app.env made before this (so an existing Codespace gets one too).
test('the Codespace app has an attestation signing key of its own, on a new and on an existing state', () => {
  const code = readFileSync(postStart, 'utf8').split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n');
  const ensured = code.indexOf('c2c_ensure_attestation_key');
  assert.ok(ensured >= 0 && ensured < code.indexOf('c2c_start_app() {'), 'every start ensures the key before the app starts');
  const dir = mkdtempSync(join(tmpdir(), 'c2c-attest-'));
  try {
    const env = `${dir}/state/app.env`;
    const script = `set -e; export C2C_CODESPACE_STATE=${dir}/state; source ${postCreate}; c2c_write_state; ` +
      `grep -c '^AUDIT_ATTESTATION_KEY=' ${env}; first=$(grep '^AUDIT_ATTESTATION_KEY=' ${env}); ` +
      `c2c_ensure_attestation_key; [ "$first" = "$(grep '^AUDIT_ATTESTATION_KEY=' ${env})" ] && echo kept; ` +
      `sed -i '/^AUDIT_ATTESTATION_KEY/d' ${env}; c2c_ensure_attestation_key; ` +
      `grep -c '^AUDIT_ATTESTATION_KEY=' ${env}; grep -c '^AUDIT_ATTESTATION_KEY_ID=' ${env}; stat -c %a ${env}`;
    const run = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(run.stdout.trim().split('\n'), ['1', 'kept', '1', '1', '600'],
      'minted with the state, kept on a later start, restored to an app.env that lacks it, and still private');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Codespaces opts in to the existing portfolio after all, caches success, and retries failures', () => {
  const dir = mkdtempSync(join(tmpdir(), 'c2c-portfolio-seed-'));
  try {
    const run = spawnSync('bash', ['-c', `
      source "${postCreate}"
      C2C_PORT=5000 DEMO_SEED_EMAIL=synthetic-author@example.test
      npm() { printf '%s\\n' "$*" >> "$C2C_CODESPACE_STATE/calls"; return "$test_npm_rc"; }
      test_npm_rc=1
      c2c_seed_portfolio_org version1
      [[ ! -f "$C2C_CODESPACE_STATE/portfolio-seed.done" ]]
      test_npm_rc=0
      c2c_seed_portfolio_org version1
      [[ "$(cat "$C2C_CODESPACE_STATE/portfolio-seed.done")" == 'version1|synthetic-author@example.test' ]]
      c2c_seed_portfolio_org version1
      [[ "$(wc -l < "$C2C_CODESPACE_STATE/calls")" == 2 ]]
      c2c_seed_portfolio_org version2
      DEMO_SEED_EMAIL=another-author@example.test
      c2c_seed_portfolio_org version2
    `], { cwd: root, encoding: 'utf8', env: { ...process.env, C2C_CODESPACE_STATE: dir } });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const calls = readFileSync(join(dir, 'calls'), 'utf8').trim().split('\n');
    assert.equal(calls.length, 4, 'failed run retries, success caches, source and identity changes reseed');
    for (const call of calls) assert.match(call, /^run --silent demo:seed -- --pack portfolio --base-url http:\/\/127\.0\.0\.1:5000 --email /);
    assert.match(calls[3], /another-author@example\.test$/); assert.match(run.stdout, /did not finish.*re-runs on the next start/);
    const post = readFileSync(postStart, 'utf8'), call = post.indexOf('c2c_seed_portfolio_org "$C2C_DEMO_VERSION"');
    assert.ok(call > post.indexOf('npm run --silent demo:seed -- --pack all'));
    assert.match(post.slice(post.lastIndexOf('\nif ', call), call), /demo-seed\.done.*C2C_DEMO_VERSION/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('document runtime installs the canonical pins in its own venv and reuses a healthy offline cache', () => {
  const fixture = docxFixture();
  try {
    const first = fixture.run();
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.match(first.stdout, new RegExp('SELECTED=' + fixture.selected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const probe = pythonCheck(fixture.selected, 'import docx,lxml.etree,importlib.metadata as m;print(m.version("python-docx"),m.version("lxml"))');
    assert.equal(probe.status, 0, probe.stderr); assert.equal(probe.stdout.trim(), '1.2.0 6.1.1');
    const empty = join(fixture.directory, 'empty'); mkdirSync(empty);
    const cached = fixture.run({ PIP_FIND_LINKS: empty });
    assert.equal(cached.status, 0, cached.stdout + cached.stderr);
  } finally { fixture.close(); }
});

test('document runtime repairs a missing import even when the pinned package metadata still exists', () => {
  const fixture = docxFixture();
  try {
    const first = fixture.run(); assert.equal(first.status, 0, first.stdout + first.stderr);
    const site = pythonCheck(fixture.selected, 'import sysconfig;print(sysconfig.get_paths()["purelib"])').stdout.trim();
    rmSync(join(site, 'lxml', 'etree.py')); rmSync(join(site, 'lxml', '__pycache__'), { recursive: true, force: true });
    assert.equal(pythonCheck(fixture.selected, 'import importlib.metadata as m;assert m.version("lxml")=="6.1.1"').status, 0);
    assert.notEqual(pythonCheck(fixture.selected, 'import lxml.etree').status, 0);
    const borrowed = join(fixture.directory, 'borrowed'), empty = join(fixture.directory, 'empty');
    mkdirSync(join(borrowed, 'lxml'), { recursive: true }); mkdirSync(empty);
    writeFileSync(join(borrowed, 'lxml', '__init__.py'), ''); writeFileSync(join(borrowed, 'lxml', 'etree.py'), 'BORROWED = True\n');
    const isolated = fixture.run({ PYTHONPATH: borrowed, PIP_FIND_LINKS: empty });
    assert.notEqual(isolated.status, 0, 'the probe must not borrow an import from PYTHONPATH');
    assert.match(isolated.stdout, /NO_VERIFIED_INTERPRETER/);
    const repaired = fixture.run(); assert.equal(repaired.status, 0, repaired.stdout + repaired.stderr);
    assert.equal(pythonCheck(fixture.selected, 'import lxml.etree').status, 0);
  } finally { fixture.close(); }
});

test('document runtime follows a changed canonical pin rather than trusting an old cache marker', () => {
  const fixture = docxFixture();
  try {
    const first = fixture.run(); assert.equal(first.status, 0, first.stdout + first.stderr);
    writeFileSync(fixture.requirements, 'python-docx==1.3.0\nlxml==6.1.1\n');
    const updated = fixture.run(); assert.equal(updated.status, 0, updated.stdout + updated.stderr);
    assert.equal(pythonCheck(fixture.selected, 'import importlib.metadata as m;print(m.version("python-docx"))').stdout.trim(), '1.3.0');
  } finally { fixture.close(); }
});

test('document runtime refuses incomplete or ambiguous pins without exporting an unverified interpreter', () => {
  const fixture = docxFixture();
  try {
    for (const body of ['python-docx==1.2.0\n', 'python-docx>=1.2.0\nlxml==6.1.1\n', 'python-docx==1.2.0\npython-docx==1.3.0\nlxml==6.1.1\n']) {
      writeFileSync(fixture.requirements, body);
      const failed = fixture.run(); assert.notEqual(failed.status, 0);
      assert.match(failed.stdout, /BLOCKED:.*requirements/);
      assert.match(failed.stdout, /NO_VERIFIED_INTERPRETER/); assert.doesNotMatch(failed.stdout, /SELECTED=/);
      assert.equal(existsSync(fixture.selected), false);
    }
  } finally { fixture.close(); }
});

test('document runtime installation failure is explicit and can recover on the next start', () => {
  const fixture = docxFixture();
  try {
    const empty = join(fixture.directory, 'empty'); mkdirSync(empty);
    const failed = fixture.run({ PIP_FIND_LINKS: empty });
    assert.notEqual(failed.status, 0); assert.match(failed.stdout, /BLOCKED:/);
    assert.match(failed.stdout, /NO_VERIFIED_INTERPRETER/); assert.doesNotMatch(failed.stdout, /SELECTED=/);
    const retried = fixture.run(); assert.equal(retried.status, 0, retried.stdout + retried.stderr);
    assert.equal(pythonCheck(fixture.selected, 'import docx,lxml.etree').status, 0);
  } finally { fixture.close(); }
});

test('document runtime preserves a verified explicit interpreter and refuses a broken override', () => {
  const fixture = docxFixture();
  try {
    const custom = join(fixture.directory, 'custom interpreter');
    const made = spawnSync('python3', ['-I', '-m', 'venv', custom], { encoding: 'utf8' }); assert.equal(made.status, 0, made.stderr);
    const python = join(custom, 'bin', 'python');
    const installed = spawnSync(python, ['-I', '-m', 'pip', 'install', 'python-docx==1.2.0', 'lxml==6.1.1'], { env: fixture.env, encoding: 'utf8' });
    assert.equal(installed.status, 0, installed.stdout + installed.stderr);
    const selected = fixture.run({ ANA_DOCX_PYTHON: python }); assert.equal(selected.status, 0, selected.stdout + selected.stderr);
    assert.ok(selected.stdout.includes('SELECTED=' + python)); assert.equal(existsSync(fixture.selected), false);
    const named = fixture.run({ ANA_DOCX_PYTHON: 'python', PATH: `${custom}/bin:${fixture.env.PATH}` });
    assert.equal(named.status, 0, named.stdout + named.stderr); assert.ok(named.stdout.includes('SELECTED=' + python));
    const relativePython = relative(root, python);
    const relativeRun = fixture.run({ ANA_DOCX_PYTHON: relativePython });
    assert.equal(relativeRun.status, 0, relativeRun.stdout + relativeRun.stderr);
    assert.ok(relativeRun.stdout.includes('SELECTED=' + root + '/' + relativePython));
    const failed = fixture.run({ ANA_DOCX_PYTHON: join(fixture.directory, 'missing-python') });
    assert.notEqual(failed.status, 0); assert.match(failed.stdout, /NO_VERIFIED_INTERPRETER/);
    assert.equal(existsSync(fixture.selected), false, 'a bad explicit setting is not silently replaced');
  } finally { fixture.close(); }
});

test('document runtime changes restart a same-commit backend while matching runtime retains it', () => {
  const changed = healthyAppDecision({ current: true, docxCurrent: false });
  assert.equal(changed.status, 0, changed.stderr); assert.match(changed.stdout, /STOP_CALLED\nSTART_CALLED/);
  const current = healthyAppDecision({ current: true, docxCurrent: true });
  assert.equal(current.status, 0, current.stderr); assert.doesNotMatch(current.stdout, /STOP_CALLED|START_CALLED/);
});

test('document runtime compares the actual running process interpreter without printing its environment', () => {
  const post = readFileSync(postStart, 'utf8');
  const start = post.indexOf('c2c_app_docx_current() {'), end = post.indexOf('\n}\n', start);
  assert.ok(start >= 0 && end > start);
  for (const [present, value, expected] of [[true, '/verified/python', 'current'], [true, '/old/python', 'stale'], [false, '', 'stale']]) {
    const run = spawnSync('bash', ['-c', `
      set -u
      C2C_VERIFIED_DOCX_PYTHON=/verified/python
      if [[ "$C2C_TEST_PRESENT" == 1 ]]; then env ANA_DOCX_PYTHON="$C2C_TEST_VALUE" sleep 30 & else env -u ANA_DOCX_PYTHON sleep 30 & fi
      pid=$!; trap 'kill "$pid" 2>/dev/null || true' EXIT
      for _ in $(seq 1 50); do
        read -r command <"/proc/$pid/comm"; [[ "$command" == sleep ]] && break; sleep .01
      done
      C2C_TEST_PROCESS_ID=$pid
      pgrep() { printf '%s\\n' "$C2C_TEST_PROCESS_ID"; }
      ${post.slice(start, end + 3)}
      if c2c_app_docx_current; then printf current; else printf stale; fi
    `], { cwd: root, env: { ...process.env, C2C_TEST_PRESENT: present ? '1' : '0', C2C_TEST_VALUE: value }, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr); assert.equal(run.stdout, expected);
  }
});

test('document runtime selected before startup cannot be replaced by an unverified app.env value', () => {
  const directory = mkdtempSync(join(tmpdir(), 'c2c-docx-app-env-'));
  try {
    const bin = join(directory, 'bin'); mkdirSync(bin);
    const sink = join(directory, 'interpreter'), verified = join(directory, 'verified python');
    writeFileSync(join(directory, 'app.env'), 'ANA_DOCX_PYTHON=/unverified/from-app-env\n');
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nprintf "%s\\n" "$ANA_DOCX_PYTHON" "$NODE_ENV" > "$C2C_TEST_DOCX_SINK"\n');
    chmodSync(join(bin, 'npm'), 0o755);
    const post = readFileSync(postStart, 'utf8');
    const start = post.indexOf('c2c_start_app() {'), end = post.indexOf('\n}\n', start);
    const run = spawnSync('bash', ['-c', `
      C2C_PORT=5000; C2C_ORIGINS=http://localhost:5000; C2C_UNSET=()
      C2C_APP_LOG="$C2C_CODESPACE_STATE/app.log"
      c2c_log() { :; }; c2c_app_up() { return 0; }; c2c_blocked() { return 1; }
      ${post.slice(start, end + 3)}
      c2c_start_app
      for _ in $(seq 1 50); do [[ -s "$C2C_TEST_DOCX_SINK" ]] && break; sleep .02; done
      test -s "$C2C_TEST_DOCX_SINK"
    `], { cwd: root, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, C2C_CODESPACE_STATE: directory,
      C2C_VERIFIED_DOCX_PYTHON: verified, C2C_TEST_DOCX_SINK: sink }, encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.deepEqual(readFileSync(sink, 'utf8').trim().split('\n'), [verified, 'development']);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
