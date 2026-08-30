/**
 * Self-test for the dependency-risk gate and its reseal tool.
 *
 * Every test except the single, clearly labeled integration test at the
 * bottom runs against FULLY SYNTHETIC ledger + lockfile + manifest fixtures
 * (via the DEPENDENCY_RISK_LEDGER / DEPENDENCY_RISK_LOCKFILE /
 * DEPENDENCY_RISK_PACKAGE_JSON overrides). The suite proves the scripts'
 * logic; it must NOT go red merely because the repo's package-lock.json
 * changed — that conflation is what broke the "prove fail-closed" CI step on
 * every Dependabot bump.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const gateScript = new URL('../check-dependency-risk.mjs', import.meta.url);
const resealScript = new URL('../reseal-dependency-risk-ledger.mjs', import.meta.url);
const repoRoot = new URL('../../../', import.meta.url);

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const report = vulnerabilities => ({
  auditReportVersion: 2,
  vulnerabilities,
  metadata: { vulnerabilities: { high: 1, critical: 0 } },
});

function unreachableRow(advisory, overrides = {}) {
  return {
    advisory,
    advisoryUrl: `https://github.com/advisories/${advisory}`,
    package: 'image-size',
    severity: 'high',
    installedVersion: '1.2.1',
    dependencyType: 'transitive',
    disposition: 'unreachable',
    action: 'keep the vulnerable parser outside the runtime module graph',
    owner: 'Fixture Owner',
    reviewDate: '2026-08-01',
    expiresAt: '2099-01-01T00:00:00.000Z',
    evidence: {
      packagePaths: ['fixture > pptxgenjs > image-size'],
      entryPoints: ['POST /export-pptx'],
      runtimeProof: ['image-size never enters the module cache'],
    },
    ...overrides,
  };
}

/**
 * Build a synthetic ledger + lockfile + manifest trio in a temp dir. The
 * ledger is sealed to the fixture lockfile, never to the repo's.
 */
function fixture({ findings, lockPackages, manifest } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dependency-risk-'));
  const pkg = manifest ?? { name: 'fixture', version: '9.9.9', dependencies: { pptxgenjs: '^4.0.1' } };
  const lock = {
    name: 'fixture', version: pkg.version, lockfileVersion: 3,
    packages: lockPackages ?? {
      'node_modules/pptxgenjs': { version: '4.0.1' },
      'node_modules/image-size': { version: '1.2.1' },
    },
  };
  const lockPath = join(dir, 'package-lock.json');
  const pkgPath = join(dir, 'package.json');
  const ledgerPath = join(dir, 'ledger.json');
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  const ledger = {
    schemaVersion: 1,
    generatedAt: '2026-08-01T00:00:00.000Z',
    scanner: { name: 'npm audit', npmVersion: '0.0.0-fixture', command: 'npm audit --audit-level=high --json', input: 'package-lock.json' },
    lockfileVersion: lock.lockfileVersion,
    lockfileSha256: sha256(readFileSync(lockPath)),
    rootPackageVersion: pkg.version,
    findings: findings ?? [unreachableRow('GHSA-w3rx-r6r6-pgpr'), unreachableRow('GHSA-5p2g-fcmc-qvqq')],
  };
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
  return { dir, lockPath, pkgPath, ledgerPath };
}

let auditCounter = 0;
function runScript(script, auditBody, fx, extraEnv = {}) {
  const auditPath = join(fx.dir, `audit-${auditCounter++}.json`);
  writeFileSync(auditPath, JSON.stringify(auditBody));
  return spawnSync(process.execPath, [script.pathname], {
    encoding: 'utf8',
    env: {
      ...process.env,
      NPM_AUDIT_JSON: auditPath,
      DEPENDENCY_RISK_LEDGER: fx.ledgerPath,
      DEPENDENCY_RISK_LOCKFILE: fx.lockPath,
      DEPENDENCY_RISK_PACKAGE_JSON: fx.pkgPath,
      ...extraEnv,
    },
  });
}
const runGate = (auditBody, fx, extraEnv) => runScript(gateScript, auditBody, fx, extraEnv);
const runReseal = (auditBody, fx) => runScript(resealScript, auditBody, fx);

// The two-advisory occurrence set the default fixture ledger covers.
const coveredAudit = () => report({
  'image-size': { severity: 'high', via: [
    { severity: 'high', url: 'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr' },
    { severity: 'high', url: 'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq' },
  ] },
});

// ─── Gate logic, on synthetic fixtures ──────────────────────────────────────

test('passes a reviewed unreachable advisory', () => {
  const fx = fixture();
  const result = runGate(report({ 'image-size': { severity: 'high', via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr' }] } }), fx);
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /unreachable/);
});

test('passes the npm transitive wrapper for a reviewed advisory', () => {
  const fx = fixture();
  const result = runGate(report({
    pptxgenjs: { severity: 'high', via: ['image-size'] },
    'image-size': { severity: 'high', via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq' }] },
  }), fx);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /GHSA-5P2G-FCMC-QVQQ image-size high: unreachable/);
});

test('passes a diamond: two wrappers sharing one reviewed transitive', () => {
  // npm audit's normal shape for a shared vulnerable transitive. A shared
  // visited-set implementation misreads the second branch as a cycle and
  // blocks a fully reviewed advisory; only a true cycle may fail here.
  const fx = fixture();
  const result = runGate(report({
    midA: { severity: 'high', via: ['image-size'] },
    midB: { severity: 'high', via: ['image-size'] },
    appwrap: { severity: 'high', via: ['midA', 'midB'] },
    'image-size': { severity: 'high', via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr' }] },
  }), fx);
  assert.equal(result.status, 0, result.stderr);
});

test('fails closed on a true via cycle', () => {
  const fx = fixture();
  const result = runGate(report({
    ouro: { severity: 'high', via: ['boros'] },
    boros: { severity: 'high', via: ['ouro'] },
  }), fx);
  assert.equal(result.status, 1); assert.match(result.stderr, /unreviewed Critical\/High/);
});

test('fails closed on a via-string naming a package absent from the report', () => {
  // A truncated or malformed scanner response must not read as reviewed.
  const fx = fixture();
  const result = runGate(report({ appwrap: { severity: 'high', via: ['ghost'] } }), fx);
  assert.equal(result.status, 1); assert.match(result.stderr, /unreviewed Critical\/High/);
});

test('fails closed on a new high advisory', () => {
  const fx = fixture();
  const result = runGate(report({ surprise: { severity: 'critical', via: [{ severity: 'critical', url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }] } }), fx);
  assert.equal(result.status, 1); assert.match(result.stderr, /unreviewed Critical\/High/);
});

test('fails closed when the scanner is unavailable', () => {
  const fx = fixture();
  const result = runGate({ message: 'registry denied request' }, fx);
  assert.equal(result.status, 1); assert.match(result.stderr, /scanner unavailable/);
});

test('fails closed on an expired exception', () => {
  const fx = fixture({
    findings: [unreachableRow('GHSA-w3rx-r6r6-pgpr', {
      disposition: 'exception', action: 'temporary isolation',
      expiresAt: '2026-01-01T00:00:00.000Z',
      approval: { owner: 'Fixture Owner', approvedBy: 'Named Reviewer', approvedAt: '2025-12-01T00:00:00.000Z' },
    })],
  });
  const result = runGate(report({}), fx, { DEPENDENCY_RISK_NOW: '2026-08-28T00:00:00.000Z' });
  assert.equal(result.status, 1); assert.match(result.stderr, /exception expired/);
});

test('fails closed when the ledger seal does not match the lockfile', () => {
  // The stale-seal failure the reseal tool exists to repair.
  const fx = fixture();
  writeFileSync(fx.lockPath, JSON.stringify({
    name: 'fixture', version: '9.9.9', lockfileVersion: 3,
    packages: { 'node_modules/pptxgenjs': { version: '4.0.1' }, 'node_modules/image-size': { version: '1.2.1' }, 'node_modules/left-pad': { version: '1.3.0' } },
  }, null, 2) + '\n');
  const result = runGate(coveredAudit(), fx);
  assert.equal(result.status, 1); assert.match(result.stderr, /lockfileSha256 is stale/);
});

// ─── Reseal tool, on synthetic fixtures ─────────────────────────────────────

test('reseal refuses a new advisory and writes nothing', () => {
  const fx = fixture();
  const ledgerBefore = readFileSync(fx.ledgerPath, 'utf8');
  const audit = coveredAudit();
  audit.vulnerabilities.surprise = { severity: 'critical', via: [{ severity: 'critical', url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }] };
  const result = runReseal(audit, fx);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /REFUSED/);
  assert.match(result.stderr, /NEW finding not covered by the ledger: GHSA-AAAA-BBBB-CCCC against surprise \(critical\)/);
  assert.equal(readFileSync(fx.ledgerPath, 'utf8'), ledgerBefore, 'a refused reseal must not modify the ledger');
});

test('reseal refuses when a covered finding vanishes from the audit', () => {
  // Exactness cuts both ways: a finding that disappeared needs its row
  // updated by a human (e.g. disposition "fixed"), not a silent reseal.
  const fx = fixture();
  const ledgerBefore = readFileSync(fx.ledgerPath, 'utf8');
  const audit = report({ 'image-size': { severity: 'high', via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr' }] } });
  const result = runReseal(audit, fx); // GHSA-5p2g row is no longer observed
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /ledger row no longer observed: GHSA-5p2g-fcmc-qvqq against image-size/);
  assert.equal(readFileSync(fx.ledgerPath, 'utf8'), ledgerBefore);
});

test('reseal refuses when a covered finding\'s installed version changed', () => {
  const fx = fixture();
  const ledgerBefore = readFileSync(fx.ledgerPath, 'utf8');
  writeFileSync(fx.lockPath, JSON.stringify({
    name: 'fixture', version: '9.9.9', lockfileVersion: 3,
    packages: { 'node_modules/pptxgenjs': { version: '4.0.1' }, 'node_modules/image-size': { version: '1.2.2' } },
  }, null, 2) + '\n');
  const result = runReseal(coveredAudit(), fx);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /installed version changed for GHSA-w3rx-r6r6-pgpr image-size: ledger reviewed 1\.2\.1, lockfile now has 1\.2\.2/);
  assert.equal(readFileSync(fx.ledgerPath, 'utf8'), ledgerBefore);
});

test('reseal refuses when the scanner is unavailable', () => {
  const fx = fixture();
  const ledgerBefore = readFileSync(fx.ledgerPath, 'utf8');
  const result = runReseal({ message: 'registry denied request' }, fx);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /scanner unavailable/);
  assert.equal(readFileSync(fx.ledgerPath, 'utf8'), ledgerBefore);
});

test('reseal rebinds an unchanged finding set and the gate passes again', () => {
  const fx = fixture();
  // Dependabot-style churn: the lockfile gains an unrelated package while the
  // reviewed findings (advisory + package + installed version) are unchanged.
  const churnedLock = {
    name: 'fixture', version: '9.9.9', lockfileVersion: 3,
    packages: {
      'node_modules/pptxgenjs': { version: '4.0.1' },
      'node_modules/image-size': { version: '1.2.1' },
      'node_modules/left-pad': { version: '1.3.0' },
    },
  };
  writeFileSync(fx.lockPath, JSON.stringify(churnedLock, null, 2) + '\n');
  assert.equal(runGate(coveredAudit(), fx).status, 1, 'precondition: churn makes the seal stale');

  const result = runReseal(coveredAudit(), fx);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /reseal: OK — 2 reviewed High\/Critical occurrence\(s\)/);

  const resealed = JSON.parse(readFileSync(fx.ledgerPath, 'utf8'));
  assert.equal(resealed.lockfileSha256, sha256(readFileSync(fx.lockPath)));
  assert.equal(resealed.lockfileVersion, 3);
  assert.equal(resealed.rootPackageVersion, '9.9.9');
  assert.notEqual(resealed.generatedAt, '2026-08-01T00:00:00.000Z');
  assert.notEqual(resealed.scanner.npmVersion, '0.0.0-fixture');
  assert.match(resealed.scanner.npmVersion, /^\d+\./);
  // A reseal must not touch the reviewed rows themselves.
  assert.deepEqual(resealed.findings, JSON.parse(JSON.stringify([unreachableRow('GHSA-w3rx-r6r6-pgpr'), unreachableRow('GHSA-5p2g-fcmc-qvqq')])));

  const gateAfter = runGate(coveredAudit(), fx);
  assert.equal(gateAfter.status, 0, gateAfter.stderr);
});

// ─── Integration: real repo state (DELIBERATELY repo-coupled) ───────────────

test('integration: committed ledger seals the committed package-lock.json', () => {
  // This is the ONE test that validates repo state instead of script logic:
  // the committed ledger's lockfileSha256 / lockfileVersion /
  // rootPackageVersion / installedVersion pins must match the committed
  // lockfile and package.json. When this fails after a dependency bump, run
  // `npm run ci:dependency-risk:reseal` (it refuses if the finding set
  // actually changed). The audit report is reconstructed from the ledger's
  // own active rows so the test needs no network; live-scan coverage is the
  // `ci:dependency-risk` workflow step's job, not this suite's.
  const realLedger = JSON.parse(readFileSync(new URL('docs/security/dependency-risk-ledger.json', repoRoot), 'utf8'));
  const vulnerabilities = {};
  let high = 0, critical = 0;
  for (const row of realLedger.findings) {
    if (!['unreachable', 'mitigated', 'exception'].includes(row.disposition)) continue;
    const entry = vulnerabilities[row.package] ??= { severity: row.severity, via: [] };
    entry.via.push({ severity: row.severity, url: row.advisoryUrl ?? `https://github.com/advisories/${row.advisory}` });
    if (row.severity === 'critical') critical++; else high++;
  }
  const dir = mkdtempSync(join(tmpdir(), 'dependency-risk-'));
  const auditPath = join(dir, 'audit.json');
  writeFileSync(auditPath, JSON.stringify({ auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: { high, critical } } }));
  const env = { ...process.env, NPM_AUDIT_JSON: auditPath };
  delete env.DEPENDENCY_RISK_LEDGER; delete env.DEPENDENCY_RISK_LOCKFILE; delete env.DEPENDENCY_RISK_PACKAGE_JSON;
  const result = spawnSync(process.execPath, [gateScript.pathname], { encoding: 'utf8', env });
  assert.equal(result.status, 0, `${result.stderr}\nThe committed ledger no longer seals the committed lockfile; run: npm run ci:dependency-risk:reseal`);
  assert.match(result.stdout, /PASS/);
});
