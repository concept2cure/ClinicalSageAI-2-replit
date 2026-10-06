import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalPqClaims, supportsPassedPq } from '../../scripts/ops/lib/pq-claim-verification.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entry = { id: 'generator', pinnedVersion: 'pin', provider: 'anthropic' };
const output = claims => JSON.stringify({ kind: 'canonical-pq-claim-verification', claims });
const claim = { ...entry, status: 'passed', issues: [] };
test('bridge uses the repository canonical CLI and existing TS loader without a shell', () => {
  let observed;
  const rows = canonicalPqClaims(root, (binary, args, options) => { observed = { binary, args, options }; return output([claim]); });
  assert.equal(supportsPassedPq(rows, entry), true);
  assert.equal(observed.binary, process.execPath);
  assert.equal(observed.args[0], '--import');
  assert.equal(observed.args[2], path.join(root, 'scripts/ops/verify-pq-claims.ts'));
  assert.equal(observed.options.timeout, 15000);
});
test('loader/process failure or malformed/duplicate output cannot verify a passed claim', () => {
  for (const run of [() => { throw new Error('private SDK detail'); }, () => 'not JSON',
    () => output([claim, claim]), () => output([{ ...claim, issues: 'bad' }]), () => JSON.stringify({ claims: [claim] })]) {
    assert.equal(canonicalPqClaims(root, run), null);
    assert.equal(supportsPassedPq(canonicalPqClaims(root, run), entry), false);
  }
});
test('wrong provider/pin, unresolved evidence, absent or pending claim remains blocked', () => {
  for (const rows of [null, [], [{ ...claim, provider: 'openai' }], [{ ...claim, pinnedVersion: 'other' }],
    [{ ...claim, issues: ['missing evidence'] }], [{ ...claim, status: 'pending' }]]) assert.equal(supportsPassedPq(rows, entry), false);
});
test('actual canonical CLI observes all registry claims as pending without approving any model', () => {
  const rows = canonicalPqClaims(root);
  assert.ok(rows?.length >= 16);
  assert.ok(rows.every(row => row.status === 'pending' && row.issues.length === 0));
});
test('plain-node readiness rejects two header-only PASS claims through the canonical checker', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pq-readiness-'));
  try {
    const copy = relative => { const target = path.join(dir, relative); mkdirSync(path.dirname(target), { recursive: true }); copyFileSync(path.join(root, relative), target); };
    for (const relative of ['scripts/ops/ga-readiness-report.mjs', 'scripts/ops/lib/pq-claim-verification.mjs', 'scripts/ops/verify-pq-claims.ts',
      'server/eval/pq/pq-verdict.ts', 'server/eval/pq/verify-pq-record.ts', 'server/eval/pq/output-integrity.ts', 'server/eval/pq/pq-protocol.json',
      'server/eval/doc-quality/gold-tasks.json', 'server/eval/rag/gold-dataset.json', 'server/eval/rag/guidance-corpus-manifest.json']) copy(relative);
    // Isolated authoritative fixture, never a modification to the live registry.
    const registry = path.join(dir, 'server/services/ai-governance/approved-models.ts');
    mkdirSync(path.dirname(registry), { recursive: true });
    writeFileSync(registry, `export const APPROVED_MODELS = [\n  {\n    id: 'claude-opus-4',\n    pinnedVersion: 'pin',\n    provider: 'anthropic',\n    approvedForHighRisk: true,\n    pq: { status: 'passed', reference: 'record-primary.json' }\n  },\n  {\n    id: 'fallback',\n    pinnedVersion: 'pin-fallback',\n    provider: 'openai',\n    approvedForHighRisk: true,\n    pq: { status: 'passed', reference: 'record-fallback.json' }\n  }\n];\n`);
    for (const [id, pinnedVersion, file] of [['claude-opus-4', 'pin', 'record-primary.json'], ['fallback', 'pin-fallback', 'record-fallback.json']])
      writeFileSync(path.join(dir, file), JSON.stringify({ kind: 'pq-record', modelId: id, pinnedVersion, verdict: 'PASS', protocolStatus: 'approved' }));
    symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
    let raw;
    try { raw = execFileSync(process.execPath, [path.join(dir, 'scripts/ops/ga-readiness-report.mjs'), '--json'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { raw = error.stdout; }
    const report = JSON.parse(raw);
    const row = report.rows.find(row => row.id === 'high-risk-model-pq');
    assert.equal(row.status, 'blocked');
    assert.match(row.observed, /0 of 2/);
    assert.match(row.observed, /unverified/);
    assert.match(readFileSync(path.join(dir, 'scripts/ops/ga-readiness-report.mjs'), 'utf8'), /canonicalPqClaims/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
