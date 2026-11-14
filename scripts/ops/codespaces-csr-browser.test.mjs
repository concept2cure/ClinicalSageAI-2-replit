import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(import.meta.dirname, '../..');
const postStart = resolve(root, '.devcontainer/post-start.sh');

function preparationShell() {
  const source = readFileSync(postStart, 'utf8');
  const start = source.indexOf('if [[ ! -f "$C2C_CODESPACE_STATE/csr-study.done" ]]');
  const end = source.indexOf('\nif [[ -z "${ANTHROPIC_API_KEY:-}" ]]', start);
  assert.ok(start >= 0 && end > start, 'execute the actual prepare-only CSR block');
  // Optional before the repair: failing cases must execute the old package-only branch too.
  const helpers = [...source.matchAll(/^c2c_(?:csr_browser_ready|ensure_csr_browser)\(\) \{[\s\S]*?^\}/gm)]
    .map(match => match[0]).join('\n');
  return `set -uo pipefail\nc2c_log() { printf '%s\\n' "$*"; }\nc2c_sudo() { "$@"; }\n${helpers}\n${source.slice(start, end)}`;
}

function executable(path, source) {
  writeFileSync(path, `#!${process.execPath}\n${source}`);
  chmodSync(path, 0o755);
}

function browserFixture(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'c2c-csr-browser-'));
  const state = join(directory, 'state'), bin = join(directory, 'bin');
  const library = join(directory, 'node_modules', 'playwright');
  const walk = join(directory, 'docs/evidence/DEMO/2026-11-05-csr-lifecycle');
  for (const path of [state, bin, library, walk, join(directory, 'data')]) mkdirSync(path, { recursive: true });
  writeFileSync(join(directory, 'data', 'adsl.xpt'), 'fixture; no public data downloaded');
  writeFileSync(join(library, 'package.json'), JSON.stringify({ name: 'playwright', version: options.version ?? '1.56.1', main: 'index.js' }));
  writeFileSync(join(library, 'index.js'), `
    const fs = require('node:fs'), path = require('node:path');
    const root = process.env.C2C_BROWSER_FIXTURE;
    const mark = name => fs.appendFileSync(path.join(root, 'trace'), name + '\\n');
    exports.chromium = {
      executablePath: () => path.join(root, 'browser'),
      launch: async () => {
        mark('launch');
        if (!fs.existsSync(path.join(root, 'browser')) || !fs.existsSync(path.join(root, 'deps')) || fs.existsSync(path.join(root, 'broken-launch'))) throw new Error('fixture browser unavailable');
        return { close: async () => mark('close') };
      }
    };
  `);
  writeFileSync(join(walk, 'walk.cjs'), `
    const fs = require('node:fs'), path = require('node:path');
    fs.appendFileSync(path.join(process.env.C2C_BROWSER_FIXTURE, 'trace'), 'walk\\n');
    if (process.argv[4] !== 'prepare' || process.env.DEMO_PREPARE_UNTIL !== 'freeze') process.exit(71);
    require('playwright').chromium.launch().then(browser => browser.close()).catch(() => process.exit(72));
  `);
  executable(join(bin, 'npm'), `
    const fs = require('node:fs'), path = require('node:path'), root = process.env.C2C_BROWSER_FIXTURE;
    const args = process.argv.slice(2);
    fs.appendFileSync(path.join(root, 'commands'), 'npm ' + args.join(' ') + '\\n');
    if (args.join(' ') !== 'install --no-save --no-audit --no-fund playwright@1.56.1') process.exit(73);
    const file = path.join(root, 'node_modules/playwright/package.json');
    fs.writeFileSync(file, JSON.stringify({ name: 'playwright', version: '1.56.1', main: 'index.js' }));
  `);
  executable(join(bin, 'npx'), `
    const fs = require('node:fs'), path = require('node:path'), root = process.env.C2C_BROWSER_FIXTURE;
    const args = process.argv.slice(2);
    fs.appendFileSync(path.join(root, 'commands'), 'npx ' + args.join(' ') + '\\n');
    if (args.join(' ') === '--no-install playwright install chromium') {
      if (fs.existsSync(path.join(root, 'fail-browser'))) process.exit(74);
      fs.writeFileSync(path.join(root, 'browser'), 'installed');
    } else if (args.join(' ') === '--no-install playwright install-deps chromium') {
      if (fs.existsSync(path.join(root, 'fail-deps'))) process.exit(75);
      fs.writeFileSync(path.join(root, 'deps'), 'installed');
    } else process.exit(76);
  `);
  for (const name of ['browser', 'deps']) if (options[name] !== false) writeFileSync(join(directory, name), 'present');
  const read = name => existsSync(join(directory, name)) ? readFileSync(join(directory, name), 'utf8') : '';
  return {
    flag: name => writeFileSync(join(directory, name), 'fixture'),
    clear: name => rmSync(join(directory, name), { force: true }),
    read,
    ready: () => existsSync(join(state, 'csr-study.done')),
    run: () => spawnSync('bash', ['-c', preparationShell()], {
      cwd: directory, timeout: 15000, encoding: 'utf8',
      env: { PATH: bin + ':' + process.env.PATH, C2C_BROWSER_FIXTURE: directory,
        C2C_CODESPACE_STATE: state, C2C_CDISC_DIR: join(directory, 'data'), C2C_PORT: '5000',
        DEMO_AUTHOR_EMAIL: 'fictional-author@example.test', DEMO_REVIEWER_EMAIL: 'fictional-reviewer@example.test',
        DEMO_APPROVER_EMAIL: 'fictional-approver@example.test', DEMO_SIGNER_PASSWORD: '',
        C2C_PRIVATE_SENTINEL: 'synthetic-private-value' },
    }),
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

function assertPrepared(fixture, run) {
  assert.equal(run.status, 0, run.stderr);
  assert.equal(fixture.ready(), true, run.stdout + run.stderr);
  assert.match(run.stdout, /CSR study ready/);
  assert.doesNotMatch(run.stdout + run.stderr, /synthetic-private-value/);
}

for (const missing of ['browser', 'deps']) {
  test(`a present Playwright package recovers missing ${missing} through the actual shell preparation`, () => {
    const fixture = browserFixture({ [missing]: false });
    try {
      assertPrepared(fixture, fixture.run());
      assert.match(fixture.read('commands'), /npx --no-install playwright install chromium/);
      assert.match(fixture.read('commands'), /npx --no-install playwright install-deps chromium/);
      assert.doesNotMatch(fixture.read('commands'), /^npm /m, 'present pinned package is retained');
      assert.match(fixture.read('trace'), /launch\nclose\nwalk\nlaunch\nclose/);
    } finally { fixture.cleanup(); }
  });

  test(`a failed ${missing} repair skips preparation and recovers on the next start`, () => {
    const fixture = browserFixture({ [missing]: false });
    try {
      fixture.flag('fail-' + missing);
      const first = fixture.run();
      assert.equal(first.status, 0, first.stderr);
      assert.equal(fixture.ready(), false);
      assert.doesNotMatch(fixture.read('trace'), /walk/, 'no preparation with an unusable browser');
      assert.doesNotMatch(first.stdout, /CSR study ready/);
      fixture.clear('fail-' + missing);
      assertPrepared(fixture, fixture.run());
    } finally { fixture.cleanup(); }
  });
}

test('healthy browser preparation and an already prepared restart install nothing', () => {
  const fixture = browserFixture();
  try {
    assertPrepared(fixture, fixture.run());
    const second = fixture.run();
    assert.equal(second.status, 0, second.stderr);
    assert.equal(fixture.read('commands'), '', 'no package or browser download on the healthy path');
    assert.equal(fixture.read('trace').split('\n').filter(value => value === 'walk').length, 1);
  } finally { fixture.cleanup(); }
});

test('an installed wrong Playwright version is replaced by the existing exact pin', () => {
  const fixture = browserFixture({ version: '1.55.0' });
  try {
    assertPrepared(fixture, fixture.run());
    assert.match(fixture.read('commands'), /^npm install --no-save --no-audit --no-fund playwright@1\.56\.1$/m);
  } finally { fixture.cleanup(); }
});

test('a successful installer is followed by a real launch check before claiming preparation ready', () => {
  const fixture = browserFixture();
  try {
    fixture.flag('broken-launch');
    const failed = fixture.run();
    assert.equal(failed.status, 0, failed.stderr);
    assert.equal(fixture.ready(), false);
    assert.doesNotMatch(fixture.read('trace'), /walk/);
    assert.doesNotMatch(failed.stdout, /CSR study ready/);
    fixture.clear('broken-launch');
    assertPrepared(fixture, fixture.run());
  } finally { fixture.cleanup(); }
});
