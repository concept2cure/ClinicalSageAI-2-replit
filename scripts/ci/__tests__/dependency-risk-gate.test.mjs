import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const script = new URL('../check-dependency-risk.mjs', import.meta.url);
const report = vulnerability => ({ auditReportVersion: 2, vulnerabilities: vulnerability, metadata: { vulnerabilities: { high: 1, critical: 0 } } });
function run(body, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dependency-risk-'));
  const path = join(dir, 'audit.json'); writeFileSync(path, JSON.stringify(body));
  return spawnSync(process.execPath, [script.pathname], { encoding: 'utf8', env: { ...process.env, NPM_AUDIT_JSON: path, ...extra } });
}

function runWithLedger(body, ledger) {
  const dir = mkdtempSync(join(tmpdir(), 'dependency-risk-'));
  const auditPath = join(dir, 'audit.json'); const ledgerPath = join(dir, 'ledger.json');
  writeFileSync(auditPath, JSON.stringify(body)); writeFileSync(ledgerPath, JSON.stringify(ledger));
  return spawnSync(process.execPath, [script.pathname], { encoding: 'utf8', env: { ...process.env, NPM_AUDIT_JSON: auditPath, DEPENDENCY_RISK_LEDGER: ledgerPath } });
}

test('passes a reviewed unreachable image-size advisory', () => {
  const result = run(report({ 'image-size': { severity: 'high', via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr' }] } }));
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /unreachable/);
});

test('passes the npm transitive wrapper for reviewed image-size', () => {
  const result = run(report({
    pptxgenjs: { severity: 'high', via: ['image-size'] },
    'image-size': { severity: 'high', via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq' }] },
  }));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /GHSA-5P2G-FCMC-QVQQ image-size high: unreachable/);
});

test('fails closed on a new high advisory', () => {
  const result = run(report({ surprise: { severity: 'critical', via: [{ severity: 'critical', url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }] } }));
  assert.equal(result.status, 1); assert.match(result.stderr, /unreviewed Critical\/High/);
});

test('fails closed when the scanner is unavailable', () => {
  const result = run({ message: 'registry denied request' });
  assert.equal(result.status, 1); assert.match(result.stderr, /scanner unavailable/);
});

test('fails closed on an expired exception', () => {
  const lock = readFileSync(new URL('../../../package-lock.json', import.meta.url));
  const ledger = {
    schemaVersion: 1, lockfileVersion: 3, rootPackageVersion: '1.0.0',
    lockfileSha256: createHash('sha256').update(lock).digest('hex'), findings: [{
      advisory: 'GHSA-w3rx-r6r6-pgpr', package: 'image-size', installedVersion: '1.2.1',
      dependencyType: 'transitive', severity: 'high', owner: 'Security Engineering',
      disposition: 'exception', action: 'temporary isolation', expiresAt: '2026-01-01T00:00:00Z',
      approval: { owner: 'Security Engineering', approvedBy: 'Named Reviewer', approvedAt: '2025-12-01T00:00:00Z' },
      evidence: { packagePaths: ['root > surprise'], entryPoints: ['worker'], runtimeProof: ['isolated process'] },
    }],
  };
  const result = runWithLedger(report({}), ledger);
  assert.equal(result.status, 1); assert.match(result.stderr, /exception expired/);
});
