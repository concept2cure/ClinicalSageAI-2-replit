import assert from 'node:assert/strict';
import { Console } from 'node:console';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../../..');
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'TOOLING_RECONCILIATION.json'), 'utf8'));
const oldAnsi = String.raw`/\u001b\[[0-9;]*m/g`;
const defaultReplacement = String.raw`new RegExp(String.fromCharCode(27)+'\\[[0-9;]*m','g')`;
const sha256 = value => createHash('sha256').update(value).digest('hex');

function assertOriginal(record, bytes) {
  assert.equal(sha256(bytes), record.oldSha256, `Original archive hash differs: ${record.path}`);
  assert.equal(bytes.length, record.originalBytes);
}

function minimalUpdate(record, source) {
  return source.replaceAll('console.log(', 'console.info(')
    .replaceAll('let identity =', 'const identity =')
    .replaceAll(oldAnsi, record.ansiReplacement ?? defaultReplacement);
}

function checkSyntax(filename) {
  const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function captureStdout(method, args) {
  const chunks = [];
  const output = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
  const writer = new Console({ stdout: output, stderr: output, colorMode: false });
  writer[method](...args);
  return Buffer.concat(chunks).toString('utf8');
}

const escape = String.fromCharCode(27);
const samples = [
  'plain output\nTests 38 passed (38)', `${escape}[31mTests${escape}[0m 38 passed`,
  `${escape}[1;32mgreen${escape}[m`, `${escape}[;;;mempty numeric codes`,
  `${escape}[31Jcursor sequence`, `${escape}]8;;https://example.invalid${escape}\\hyperlink`,
  '[31m literal text', `${escape}[31mone${escape}[0m ${escape}[42mtwo${escape}[0m`,
  `${escape}[99;1m\r\nTests 2 failed${escape}[0m`, `${escape}[12345mUnicode 日本語 🧬`,
  `${escape}[31Xunmatched ending`, `${escape}[31`,
];

function checkAnsi(record) {
  // Evaluate the exact archived literal and the whitelisted replacement only.
  // Comparing native literals preserves the old grammar independently of construction.
  const original = runInNewContext(oldAnsi);
  const replacement = record.ansiReplacement ?? defaultReplacement;
  assert.ok([defaultReplacement, String.raw`new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')`].includes(replacement));
  const updated = runInNewContext(replacement);
  for (const sample of samples) assert.equal(sample.replace(updated, ''), sample.replace(original, ''));
}

const records = [];
for (const record of manifest.records) {
  const original = fs.readFileSync(path.join(root, record.originalCopy));
  assertOriginal(record, original);
  const updated = Buffer.from(minimalUpdate(record, original.toString('utf8')));
  assert.equal(sha256(updated), record.newSha256, `Beyond-minimal edit in checkpoint: ${record.path}`);
  const current = fs.readFileSync(path.join(root, record.path));
  if (!record.sourceReleasedToRoot) assert.deepEqual(current, updated);
  if (record.restorationProof) {
    const proof = JSON.parse(fs.readFileSync(path.join(root, record.restorationProof), 'utf8'));
    assert.equal(proof.sha256[record.path], record.oldSha256);
  }
  if (record.edits.ansiExpression) checkAnsi(record);
  checkSyntax(path.join(root, record.path));
  records.push({ path: record.path, originalArchiveSha256: sha256(original),
    afterLintCheckpointSha256: sha256(updated), currentSha256: sha256(current),
    currentMatchesLintCheckpoint: current.equals(updated), releasedToRoot: Boolean(record.sourceReleasedToRoot) });
}

const stdoutCases = [
  [JSON.stringify({ fixture: 'ready', count: 20 })], ['column UPDATE permits SHARE lock'],
  ['column UPDATE fails SHARE lock:', '42501'], ['multiple\nlines'],
];
for (const args of stdoutCases) assert.equal(captureStdout('log', args), captureStdout('info', args));

// Demonstrate actual refusal, without mutating any archived file or running history.
const first = manifest.records[0];
assert.throws(() => assertOriginal({ ...first, oldSha256: '0'.repeat(64) }, fs.readFileSync(path.join(root, first.originalCopy))));
const counterfactual = new RegExp(escape + '[0-9;]*m', 'g');
assert.throws(() => assert.equal(samples[1].replace(counterfactual, ''), samples[1].replace(runInNewContext(oldAnsi), '')));

const report = { syntaxCheckedFiles: records.length, archiveHashChecks: records.length,
  minimalCheckpointHashChecks: records.length, ansiCorpusCases: samples.length,
  ansiUpdatedRunners: manifest.records.filter(record => record.edits.ansiExpression).length,
  stdoutCases: stdoutCases.length, corruptArchiveRejected: true, changedAnsiGrammarRejected: true,
  historicalLogsOrManifestsExecutedOrChanged: false, records };
fs.writeFileSync(path.join(directory, 'TOOLING_RECONCILIATION_CHECKS.json'), JSON.stringify(report, null, 2) + '\n');
console.info(JSON.stringify({ syntaxCheckedFiles: report.syntaxCheckedFiles,
  archiveHashChecks: report.archiveHashChecks, ansiUpdatedRunners: report.ansiUpdatedRunners,
  stdoutCases: report.stdoutCases, counterfactualsRejected: 2 }));
