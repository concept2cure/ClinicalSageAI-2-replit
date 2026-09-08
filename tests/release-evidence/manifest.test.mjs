import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DISCLAIMER, sha256, validateManifest, verifyArtifactFiles } from '../../scripts/release-evidence/lib.mjs';

const commit = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const hash = 'c'.repeat(64);
const roles = ['engineering', 'security', 'regulatoryQA', 'operations', 'legal'];
const evidenceKinds = { tests: 'test-results', securityScan: 'security-scan', blankDatabase: 'blank-database', upgrade: 'upgrade', productionBoot: 'production-boot', browserSmoke: 'browser-smoke' };
const policy = {
  requiredJobs: [{ workflow: 'CI', job: 'test' }],
  requiredAutomatedEvidence: Object.entries(evidenceKinds).map(([key, artifactKind]) => ({ key, artifactKind })),
  humanApprovalRoles: roles,
};

function validManifest() {
  const summary = { total: 1, passed: 1, failed: 0, skipped: 0, unknown: 0 };
  const result = key => ({ status: 'passed', count: 1, artifactId: key, summary: structuredClone(summary) });
  return {
    schemaVersion: '1.0.0',
    policy: { version: '1.0.0', sha256: hash },
    repository: { url: 'git@example/repo', commit, tree, dirty: false },
    runtime: { node: 'v20', npm: '10', platform: 'linux', architecture: 'x64' },
    fingerprints: { dependencyLockSha256: hash, migrationSetSha256: hash, schemaSha256: hash },
    artifacts: Object.entries(evidenceKinds).map(([id, kind]) => ({ id, kind, path: `${id}.json`, sha256: hash, commit, tree, status: 'verified' })),
    workflows: [{ workflow: 'CI', job: 'test', required: true, conclusion: 'success', headSha: commit, runId: 1 }],
    automatedEvidence: Object.fromEntries(Object.keys(evidenceKinds).map(key => [key, result(key)])),
    knownDeviations: [],
    humanApprovals: roles.map(role => ({ role, status: 'unapproved', signer: null, signedAt: null, signature: null, authorizationEvidence: null })),
    disclaimer: DISCLAIMER,
  };
}

const expected = { commit, tree, policy, policySha256: hash };
test('accepts exact automated evidence while approvals remain blank', () => assert.deepEqual(validateManifest(validManifest(), expected), []));

for (const [name, mutate, match, override] of [
  ['wrong commit', m => { m.repository.commit = 'd'.repeat(40); }, 'checked-out commit'],
  ['missing job', m => { m.workflows = []; }, 'required policy workflow CI/test is missing'],
  ['skipped job', m => { m.workflows[0].conclusion = 'skipped'; }, 'is skipped'],
  ['failed job', m => { m.workflows[0].conclusion = 'failure'; }, 'is failure'],
  ['stale artifact', m => { m.artifacts[0].commit = 'd'.repeat(40); }, 'is stale'],
  ['changed lockfile', () => {}, 'changed dependencyLockSha256', { fingerprints: { dependencyLockSha256: 'e'.repeat(64) } }],
  ['changed migration set', () => {}, 'changed migrationSetSha256', { fingerprints: { migrationSetSha256: 'e'.repeat(64) } }],
  ['changed policy', () => {}, 'release policy is missing or changed', { policySha256: 'e'.repeat(64) }],
  ['unsigned human approval', m => { m.humanApprovals[2].status = 'approved'; }, 'must remain blank and unapproved'],
  ['fabricated signed approval', m => { Object.assign(m.humanApprovals[2], { status: 'approved', signer: 'Example', signedAt: '2026-01-01', signature: 'not-a-governed-signature', authorizationEvidence: 'claimed' }); }, 'must remain blank and unapproved'],
  ['unknown result marked passed', m => { m.automatedEvidence.tests.summary.unknown = 1; m.automatedEvidence.tests.summary.passed = 0; }, 'cannot pass with failed, skipped, or unknown'],
  ['skipped result marked passed', m => { m.automatedEvidence.tests.summary.skipped = 1; m.automatedEvidence.tests.summary.passed = 0; }, 'cannot pass with failed, skipped, or unknown'],
  ['result without artifact', m => { m.automatedEvidence.tests.artifactId = 'absent'; }, 'does not reference a verified artifact'],
  ['wrong artifact kind', m => { m.artifacts[0].kind = 'security-scan'; }, 'tests must reference a test-results artifact'],
  ['duplicate approval role', m => { m.humanApprovals[1].role = 'engineering'; }, 'human approval role engineering must appear exactly once'],
]) {
  test(`rejects ${name}`, () => {
    const manifest = validManifest();
    mutate(manifest);
    assert.match(validateManifest(manifest, { ...expected, ...override }).join('\n'), new RegExp(match));
  });
}

test('re-hashes artifact files during validation', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'release-evidence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'evidence'));
  await writeFile(path.join(root, 'evidence', 'result.json'), 'primary evidence');
  const manifest = { artifacts: [{ id: 'tests', path: 'evidence/result.json', sha256: sha256('primary evidence') }] };
  assert.deepEqual(await verifyArtifactFiles(manifest, root), []);
  await writeFile(path.join(root, 'evidence', 'result.json'), 'changed evidence');
  assert.match((await verifyArtifactFiles(manifest, root)).join('\n'), /content hash changed/);
  manifest.artifacts[0].path = '../outside.json';
  assert.match((await verifyArtifactFiles(manifest, root)).join('\n'), /escapes the repository/);
});
