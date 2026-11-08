/** Exercise the real npm/tsx launcher without running a database preflight. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../../..');
const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;
const tsxRoot = dirname(dirname(realpathSync(join(root, 'node_modules/.bin/tsx'))));
const sentinel = 'C2C_DEV_ENTRYPOINT=';
const server = `
import assert from 'node:assert/strict';
import { writeFileSync, realpathSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
writeFileSync(join(process.env.C2C_ENTRYPOINT_FIXTURE_DIR!, 'server-ran'), 'executed');
const typescriptValue: number = 42;
const localBin = join(process.env.C2C_ENTRYPOINT_FIXTURE_DIR!, 'node_modules', '.bin');
const localBinPresent = String(process.env.PATH || '').split(delimiter)
  .some(value => resolve(value) === localBin);
assert.equal(process.env.C2C_ENTRYPOINT_SOURCE_RAN, 'yes');
assert.equal(process.env.C2C_ENTRYPOINT_MAIN_RAN, 'yes');
assert.equal(localBinPresent, true, 'npm local .bin must survive the shell');
assert.equal(realpathSync(process.execPath), realpathSync(process.env.C2C_EXPECTED_NODE!));
assert.equal(process.env.NODE_OPTIONS, '--trace-warnings');
assert.ok(process.execArgv.includes('--inspect=0'));
console.log('${sentinel}' + JSON.stringify({ typescriptValue, localBinPresent,
  execPath: process.execPath, nodeOptions: process.env.NODE_OPTIONS, execArgv: process.execArgv,
  sourceRan: process.env.C2C_ENTRYPOINT_SOURCE_RAN, mainRan: process.env.C2C_ENTRYPOINT_MAIN_RAN }));
process.emitWarning('launcher fixture warning', { code: 'C2C_ENTRYPOINT_WARNING' });
`;

function launch(name, preflight) {
  const fixture = mkdtempSync(join(tmpdir(), 'c2c-dev-entrypoint-'));
  try {
    mkdirSync(join(fixture, 'scripts'));
    mkdirSync(join(fixture, 'server'));
    symlinkSync(join(root, 'node_modules'), join(fixture, 'node_modules'), 'dir');
    // Copy the actual two entrypoints; a rewritten test-only command cannot pass.
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({
      name: 'c2c-entrypoint-fixture', private: true, type: 'module',
      scripts: { dev: scripts.dev, 'dev:local': scripts['dev:local'] },
    }));
    writeFileSync(join(fixture, 'scripts/startup.sh'), preflight);
    writeFileSync(join(fixture, 'server/index.ts'), server);
    const env = { ...process.env, NODE_OPTIONS: '',
      C2C_ENTRYPOINT_FIXTURE_DIR: fixture, C2C_EXPECTED_NODE: process.execPath,
      C2C_ENTRYPOINT_SOURCE_RAN: '', C2C_ENTRYPOINT_MAIN_RAN: '',
      npm_config_update_notifier: 'false', npm_config_offline: 'true' };
    const result = spawnSync('npm', ['run', '--silent', name], {
      cwd: fixture, env, encoding: 'utf8', timeout: 30_000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, `${name} must finish normally`);
    return { ...result, serverRan: existsSync(join(fixture, 'server-ran')) };
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

for (const name of ['dev', 'dev:local']) {
  test(`${name} runs real local tsx with the npm path, preflight and runtime flags`, () => {
    const result = launch(name, `
export C2C_ENTRYPOINT_SOURCE_RAN=yes
main() { export C2C_ENTRYPOINT_MAIN_RAN=yes; }
`);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.serverRan, true);
    const lines = result.stdout.split('\n').filter(line => line.startsWith(sentinel));
    assert.equal(lines.length, 1, result.stdout);
    const record = JSON.parse(lines[0].slice(sentinel.length));
    assert.equal(record.typescriptValue, 42);
    assert.equal(record.localBinPresent, true);
    assert.equal(record.sourceRan, 'yes');
    assert.equal(record.mainRan, 'yes');
    assert.equal(realpathSync(record.execPath), realpathSync(process.execPath));
    assert.equal(record.nodeOptions, '--trace-warnings');
    assert.ok(record.execArgv.includes('--inspect=0'));
    assert.ok(record.execArgv.some(arg => {
      const file = arg.startsWith('file:') ? fileURLToPath(arg) : arg;
      return file.startsWith(tsxRoot + sep);
    }), 'the real repository tsx loader must execute the TypeScript fixture');
    assert.match(result.stderr, /C2C_ENTRYPOINT_WARNING/);
    assert.match(result.stderr, /server[/\\]index\.ts/, 'trace-warnings retains the source stack');
  });

  test(`${name} preserves main refusal before executing the server`, () => {
    const result = launch(name, 'main() { return 17; }\n');
    assert.equal(result.status, 17, result.stdout + result.stderr);
    assert.equal(result.serverRan, false);
    assert.ok(!result.stdout.includes(sentinel));
  });

  test(`${name} preserves sourced-preflight refusal before executing the server`, () => {
    const result = launch(name, 'return 23\nmain() { return 0; }\n');
    assert.equal(result.status, 23, result.stdout + result.stderr);
    assert.equal(result.serverRan, false);
    assert.ok(!result.stdout.includes(sentinel));
  });
}
