import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const downloader = path.join(root, 'scripts/ops/fetch-verapdf.sh');
const primary = 'https://repo.maven.apache.org/maven2';
const secondary = 'https://repo1.maven.org/maven2';
const suffix = '/org/verapdf/apps/cli/1.30.2/cli-1.30.2.jar';
const payload = Buffer.from('deterministic download fixture\n');
const checksum = createHash('sha256').update(payload).digest('hex');

// Control only the transport response; run the real shared shell, sha256sum,
// cleanup, permissions and rename. These tests need neither network nor npm.
const controlledCurl = `#!${process.execPath}
const fs = require('node:fs');
// Model curl creating a new file under the image's ordinary umask; an existing
// mktemp candidate retains its 0600 mode until the real helper changes it.
process.umask(0o022);
const args = process.argv.slice(2);
const url = args.at(-1);
fs.appendFileSync(process.env.FETCH_TEST_LOG, JSON.stringify({ url, args }) + '\\n');
const response = JSON.parse(fs.readFileSync(process.env.FETCH_TEST_RESPONSES, 'utf8'))[url];
if (!response) process.exit(99);
const outputIndex = args.indexOf('-o');
if (outputIndex < 0) process.exit(98);
const output = args[outputIndex + 1];
if (!output.startsWith(process.env.FETCH_TEST_DIR + '/runtime/')) process.exit(98);
if (response.payload !== undefined) fs.writeFileSync(output, Buffer.from(response.payload, 'base64'));
process.exit(response.exit);
`;

function runDownload(t, responses, { existing, version = '1.30.2', pin = checksum } = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'verapdf-download-test-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const bin = path.join(work, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'curl'), controlledCurl, { mode: 0o755 });
  const responsePath = path.join(work, 'responses.json');
  fs.writeFileSync(responsePath, JSON.stringify(Object.fromEntries(
    Object.entries(responses).map(([origin, response]) => [origin + suffix, response]),
  )));
  const logPath = path.join(work, 'calls.jsonl');
  const destination = path.join(work, 'runtime', 'verapdf-cli.jar');
  if (existing) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, existing);
  }
  const result = spawnSync('/bin/sh', [downloader, version, pin, destination], {
    encoding: 'utf8',
    timeout: 5000,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FETCH_TEST_RESPONSES: responsePath,
      FETCH_TEST_LOG: logPath,
      FETCH_TEST_DIR: work,
    },
  });
  assert.equal(result.error, undefined, result.error?.message);
  const calls = fs.existsSync(logPath)
    ? fs.readFileSync(logPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    : [];
  const leftovers = fs.existsSync(path.dirname(destination))
    ? fs.readdirSync(path.dirname(destination)).filter((name) => name.includes('.download.'))
    : [];
  assert.deepEqual(leftovers, [], 'partial downloads must be removed');
  return { ...result, calls, destination };
}

const good = { exit: 0, payload: payload.toString('base64') };
const absent = { exit: 22 };
const corrupt = { exit: 0, payload: Buffer.from('wrong bytes').toString('base64') };

function assertPinnedFile(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readFileSync(result.destination), payload);
  assert.equal(fs.statSync(result.destination).mode & 0o777, 0o644, 'the application user must read the verified JAR');
}

function assertNoFile(result) {
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(result.destination), false, 'a rejected payload must never be installed');
}

test('verified canonical Central download installs readable bytes without using the fallback', (t) => {
  const result = runDownload(t, { [primary]: good, [secondary]: absent });
  assertPinnedFile(result);
  assert.deepEqual(result.calls.map(({ url }) => url), [primary + suffix]);
});

test('canonical Central HTTP refusal falls back to the same pinned artifact at official repo1', (t) => {
  const result = runDownload(t, { [primary]: absent, [secondary]: good });
  assertPinnedFile(result);
  assert.deepEqual(result.calls.map(({ url }) => url), [primary + suffix, secondary + suffix]);
});

test('an interrupted partial download is removed before a verified fallback is installed', (t) => {
  const result = runDownload(t, {
    [primary]: { exit: 18, payload: Buffer.from('partial bytes').toString('base64') },
    [secondary]: good,
  });
  assertPinnedFile(result);
  assert.equal(result.calls.length, 2);
});

test('both official endpoints being unavailable fails closed', (t) => {
  const result = runDownload(t, { [primary]: absent, [secondary]: absent });
  assertNoFile(result);
  assert.equal(result.calls.length, 2);
});

test('a successful corrupt canonical response fails integrity immediately without falling back', (t) => {
  const result = runDownload(t, { [primary]: corrupt, [secondary]: good });
  assertNoFile(result);
  assert.deepEqual(result.calls.map(({ url }) => url), [primary + suffix]);
  assert.match(result.stderr, /pinned SHA256 check/);
});

test('a successful corrupt fallback response is never installed', (t) => {
  const result = runDownload(t, { [primary]: absent, [secondary]: corrupt });
  assertNoFile(result);
  assert.equal(result.calls.length, 2);
});

test('transport failure preserves an existing retained destination', (t) => {
  const existing = Buffer.from('previous retained bytes');
  const result = runDownload(t, { [primary]: absent, [secondary]: absent }, { existing });
  assert.notEqual(result.status, 0);
  assert.deepEqual(fs.readFileSync(result.destination), existing);
});

test('integrity failure preserves an existing retained destination', (t) => {
  const existing = Buffer.from('previous retained bytes');
  const result = runDownload(t, { [primary]: corrupt, [secondary]: good }, { existing });
  assert.notEqual(result.status, 0);
  assert.deepEqual(fs.readFileSync(result.destination), existing);
});

test('malformed release and checksum pins are refused before any network or file write', (t) => {
  for (const options of [{ version: '../1.30.2' }, { pin: 'invalid' }, { pin: 'a'.repeat(63) }]) {
    const result = runDownload(t, { [primary]: good, [secondary]: good }, options);
    assertNoFile(result);
    assert.equal(result.status, 64);
    assert.deepEqual(result.calls, []);
  }
});

test('both endpoint attempts retain HTTPS restrictions and finite retry and request budgets', (t) => {
  const result = runDownload(t, { [primary]: absent, [secondary]: good });
  assertPinnedFile(result);
  for (const { args } of result.calls) {
    for (const [flag, value] of [
      ['--proto', '=https'], ['--proto-redir', '=https'], ['--retry', '2'],
      ['--retry-max-time', '60'], ['--connect-timeout', '10'], ['--max-time', '30'],
    ]) assert.equal(args[args.indexOf(flag) + 1], value, flag);
    assert.ok(args.includes('--retry-all-errors'));
    assert.ok(!args.includes('-k') && !args.includes('--insecure'));
  }
});
