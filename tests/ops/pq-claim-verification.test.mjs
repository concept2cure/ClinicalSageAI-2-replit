import test from 'node:test';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { productionBuilds, stageQualificationRuntimeAssets } from '../../scripts/build-server.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
    for (const relative of ['scripts/ops/ga-readiness-report.mjs', 'scripts/ops/lib/pq-claim-verification.mjs', 'scripts/ops/lib/readiness-env.mjs', 'scripts/ops/verify-pq-claims.ts',
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


const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function writeJson(dir, relative, value) {
  const file = path.join(dir, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  const text = JSON.stringify(value);
  writeFileSync(file, text);
  return text;
}
function qualificationFixture(dir) {
  writeJson(dir, 'package.json', { type: 'module' });
  const protocol = { protocolId: 'PQ-ISOLATED-FIXTURE', version: '1', status: 'approved', approvedBy: 'Synthetic reviewer', approvedOn: '2026-11-06',
    components: { generation: { required: true, executable: true, criteria: { minSectionCoverage: 1, maxForbiddenHits: 0, minTasksPerDocType: 1 }, criteriaSource: 'isolated test' } } };
  const protocolText = writeJson(dir, 'server/eval/pq/pq-protocol.json', protocol);
  const bankText = writeJson(dir, 'server/eval/doc-quality/gold-tasks.json', { version: 'isolated', tasks: [{ id: 'synthetic-1', docType: 'ind', taskType: 'generation', input: 'Synthetic public input.' }] });
  writeJson(dir, 'server/eval/rag/gold-dataset.json', { items: [] });
  writeJson(dir, 'server/eval/rag/guidance-corpus-manifest.json', { entries: [] });
  const record = { kind: 'pq-record', modelId: 'fixture', pinnedVersion: 'fixture-20261106', provider: 'anthropic', intendedUses: ['narrative_drafting'],
    verdict: 'PASS', protocolId: protocol.protocolId, protocolVersion: protocol.version, protocolStatus: 'approved', protocolSha256: digest(protocolText),
    goldBankVersion: 'isolated', goldBankSha256: digest(bankText), generation: [{ taskId: 'synthetic-1', docType: 'ind', servedModel: 'fixture-20261106',
      servedProvider: 'anthropic', servedModelVerified: true, finishReason: 'stop', cached: false, deterministic: false, sectionCoverage: 1, forbiddenHits: 0 }] };
  const reference = 'docs/evidence/CONTROLLED-PQ/fixture-record.json';
  const recordText = writeJson(dir, reference, record);
  const model = { id: record.modelId, pinnedVersion: record.pinnedVersion, provider: record.provider,
    pq: { status: 'passed', reference, recordSha256: digest(recordText), pinKind: 'provider_snapshot', intendedUses: record.intendedUses } };
  return { model, reference, recordText };
}
async function qualificationBundle(dir) {
  const shipped = productionBuilds(path.join(dir, 'dist')).find(row => row.options.entryPoints.includes(path.join(root, 'scripts/ops/verify-pq-claims.ts')));
  assert.ok(shipped, 'production build must emit the qualification CLI');
  assert.equal(shipped.options.define, undefined);
  await build(shipped.options);
  return { file: shipped.options.outfile, module: await import(pathToFileURL(shipped.options.outfile).href) };
}
function relativeFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const relative = path.posix.join(prefix, entry.name);
    return entry.isDirectory() ? relativeFiles(path.join(dir, entry.name), relative) : [relative];
  }).sort();
}

test('production packaging copies only canonical banks and exact verified registered record bytes, removing stale records', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pq-assets-'));
  try {
    const fixture = qualificationFixture(dir);
    writeJson(dir, 'docs/evidence/CONTROLLED-PQ/private-trace.json', { secret: 'CLIENT_SECRET_MUST_NOT_SHIP' });
    const { module } = await qualificationBundle(dir);
    const plan = module.collectQualificationRuntimeAssets([fixture.model], dir);
    assert.equal(plan.length, 5);
    assert.deepEqual(plan.filter(row => row.reference.startsWith('docs/')).map(row => row.reference), [fixture.reference]);
    stageQualificationRuntimeAssets(path.join(dir, 'dist'), plan);
    const output = path.join(dir, 'dist/runtime-assets');
    assert.deepEqual(relativeFiles(output), plan.map(row => row.reference).sort());
    for (const asset of plan) {
      assert.equal(digest(readFileSync(path.join(output, asset.reference))), asset.sha256);
      assert.ok(!readFileSync(path.join(output, asset.reference), 'utf8').includes('CLIENT_SECRET_MUST_NOT_SHIP'));
    }
    const pending = { ...fixture.model, pq: { status: 'pending', reference: null } };
    const pendingPlan = module.collectQualificationRuntimeAssets([pending], dir);
    // The runtime image can verify the packaged artifacts without any source
    // docs or eval directories. These are synthetic test evidence only.
    rmSync(path.join(dir, 'server'), { recursive: true });
    rmSync(path.join(dir, 'docs'), { recursive: true });
    assert.deepEqual(module.canonicalQualificationClaims([fixture.model])[0].issues, []);
    writeFileSync(path.join(output, fixture.reference), `${fixture.recordText} `);
    assert.ok(module.canonicalQualificationClaims([fixture.model])[0].issues.length > 0);
    stageQualificationRuntimeAssets(path.join(dir, 'dist'), pendingPlan);
    assert.equal(relativeFiles(output).length, 4);
    assert.ok(!relativeFiles(output).includes(fixture.reference), 'revoked or pending registry entry must not leave a stale qualified record');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('qualification assets reject tampering, missing future release evidence, traversal and symlink escape', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pq-invalid-assets-'));
  const outside = mkdtempSync(path.join(os.tmpdir(), 'pq-outside-'));
  try {
    const fixture = qualificationFixture(dir);
    const { module } = await qualificationBundle(dir);
    writeFileSync(path.join(dir, fixture.reference), `${fixture.recordText} `);
    assert.throws(() => module.collectQualificationRuntimeAssets([fixture.model], dir), /content hash mismatch/);
    rmSync(path.join(dir, fixture.reference));
    assert.throws(() => module.collectQualificationRuntimeAssets([fixture.model], dir), /ENOENT/);
    writeFileSync(path.join(outside, 'record.json'), fixture.recordText);
    symlinkSync(path.join(outside, 'record.json'), path.join(dir, fixture.reference));
    assert.throws(() => module.collectQualificationRuntimeAssets([fixture.model], dir), /contained regular file/);
    for (const reference of ['../record.json', '/record.json', 'docs/../record.json']) {
      const model = { ...fixture.model, pq: { ...fixture.model.pq, reference } };
      assert.throws(() => module.collectQualificationRuntimeAssets([model], dir), /Invalid controlled/);
    }
    assert.throws(() => stageQualificationRuntimeAssets(path.join(dir, 'dist'), [{ reference: '../escape.json', bytes: Buffer.from('x'), sha256: digest('x') }]), /integrity verification/);
    assert.throws(() => stageQualificationRuntimeAssets(path.join(dir, 'dist'), [{ reference: 'record.json', bytes: Buffer.from('changed'), sha256: digest('original') }]), /integrity verification/);
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test('the emitted CLI runs in plain Node without tsx and keeps every actual registry model pending', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pq-runtime-cli-'));
  try {
    qualificationFixture(dir);
    const { module } = await qualificationBundle(dir);
    // Use the actual compiled registry, not the synthetic model from the fixture.
    const assets = module.collectQualificationRuntimeAssets(undefined, dir);
    assert.equal(assets.length, 4);
    stageQualificationRuntimeAssets(path.join(dir, 'dist'), assets);
    rmSync(path.join(dir, 'server'), { recursive: true });
    const claims = canonicalPqClaims(dir);
    assert.ok(claims?.length >= 16);
    assert.ok(claims.every(row => row.status === 'pending' && row.issues.length === 0));
    assert.ok(claims.every(row => !supportsPassedPq(claims, row)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
