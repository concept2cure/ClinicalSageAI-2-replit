import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const script = path.join(root, 'scripts/ci/review-semgrep-evidence.py');
const htmlRule = 'html.security.audit.missing-integrity.missing-integrity';

function withFixture(run) {
  const dir = mkdtempSync(path.join(tmpdir(), 'semgrep-evidence-review-'));
  try {
    const file = 'docs/evidence/review/source.html';
    const bytes = 'captured third-party source bytes';
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), bytes);
    const manifest = { schemaVersion: 1, entries: [{ file,
      sha256: createHash('sha256').update(bytes).digest('hex'), kind: 'third_party_html',
      reviewedRules: [htmlRule], reason: 'Reviewed inert third-party snapshot, retained with original provenance.' }] };
    run({ dir, file, bytes, manifest });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

function invoke({ dir, manifest }) {
  const input = path.join(dir, 'review.json');
  const output = path.join(dir, 'excludes.txt');
  writeFileSync(input, JSON.stringify(manifest));
  return { ...spawnSync('python3', [script, '--root', dir, '--manifest', input, '--write-excludes', output], { encoding: 'utf8' }), output };
}

test('the complete current evidence review validates without changing its source bytes', () => {
  const outputRoot = mkdtempSync(path.join(tmpdir(), 'semgrep-current-review-'));
  try {
    const output = path.join(outputRoot, 'excludes.txt');
    const result = spawnSync('python3', [script, '--root', root, '--write-excludes', output], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const entries = JSON.parse(readFileSync(path.join(root, 'scripts/ci/semgrep-reviewed-evidence.json'), 'utf8')).entries;
    assert.deepEqual(readFileSync(output, 'utf8').trim().split('\n'), entries.map(entry => entry.file));
  } finally { rmSync(outputRoot, { recursive: true, force: true }); }
});

test('an exact historical file is emitted as one literal argument', () => withFixture(fixture => {
  const result = invoke(fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(result.output, 'utf8'), fixture.file + '\n');
}));

test('an exact historical probe is emitted without changing its recorded bytes', () => withFixture(fixture => {
  const file = 'docs/evidence/review/probe.ts';
  writeFileSync(path.join(fixture.dir, file), fixture.bytes);
  Object.assign(fixture.manifest.entries[0], { file, kind: 'historical_probe',
    reviewedRules: ['javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring'] });
  const result = invoke(fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(result.output, 'utf8'), file + '\n');
  assert.equal(readFileSync(path.join(fixture.dir, file), 'utf8'), fixture.bytes);
}));

test('a historical probe refuses changed bytes', () => withFixture(fixture => {
  Object.assign(fixture.manifest.entries[0], { kind: 'historical_probe',
    reviewedRules: ['javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring'] });
  writeFileSync(path.join(fixture.dir, fixture.file), 'changed executable content');
  assert.equal(invoke(fixture).status, 1);
}));

test('a historical probe cannot inherit an unrelated rule review', () => withFixture(fixture => {
  fixture.manifest.entries[0].kind = 'historical_probe';
  assert.equal(invoke(fixture).status, 1);
}));

test('changed evidence fails before replacing an existing argument file', () => withFixture(fixture => {
  const first = invoke(fixture);
  assert.equal(first.status, 0);
  writeFileSync(path.join(fixture.dir, fixture.file), 'changed executable content');
  assert.equal(invoke(fixture).status, 1);
  assert.equal(readFileSync(first.output, 'utf8'), fixture.file + '\n');
}));

for (const [name, change] of [
  ['application path', m => { m.entries[0].file = 'server/source.py'; }],
  ['directory or glob', m => { m.entries[0].file = 'docs/evidence/**'; }],
  ['traversal', m => { m.entries[0].file = 'docs/evidence/../../server/source.py'; }],
  ['duplicate path', m => { m.entries.push({ ...m.entries[0] }); }],
  ['unreviewed rule', m => { m.entries[0].reviewedRules = ['javascript.express.security.injection']; }],
  ['missing reason', m => { m.entries[0].reason = ''; }],
  ['missing fingerprint', m => { delete m.entries[0].sha256; }],
]) test('refuses ' + name, () => withFixture(fixture => {
  change(fixture.manifest);
  assert.equal(invoke(fixture).status, 1);
}));

test('a symbolic link cannot replace the reviewed source', () => withFixture(fixture => {
  const source = path.join(fixture.dir, fixture.file);
  rmSync(source);
  const target = path.join(fixture.dir, 'copy.html');
  writeFileSync(target, fixture.bytes);
  symlinkSync(target, source);
  assert.equal(invoke(fixture).status, 1);
}));
