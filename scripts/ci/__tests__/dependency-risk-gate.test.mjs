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
import { createRequire } from 'node:module';

const gateScript = new URL('../check-dependency-risk.mjs', import.meta.url);
const resealScript = new URL('../reseal-dependency-risk-ledger.mjs', import.meta.url);
const repoRoot = new URL('../../../', import.meta.url);
const require = createRequire(import.meta.url);

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

test('passes a reviewed high cause alongside a separately reported moderate-only branch', () => {
  // CI 37498480047: Jest inherited the reviewed braces high finding and a
  // separate moderate js-yaml path. The high threshold must apply to causes,
  // while every linked node is still traversed and validated.
  const fx = fixture();
  const result = runGate(report({
    wrapper: { severity: 'high', via: ['image-size', 'instrumentation'] },
    instrumentation: { severity: 'moderate', via: ['yaml'] },
    yaml: { severity: 'moderate', via: [{ severity: 'moderate', url: 'https://github.com/advisories/GHSA-mmmm-nnnn-pppp' }] },
    'image-size': { severity: 'high', via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr' }] },
  }), fx);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /GHSA-W3RX-R6R6-PGPR image-size high: unreachable/);
});

test('blocks an uncovered high cause even when its wrapper claims moderate severity', () => {
  const fx = fixture();
  const result = runGate(report({
    wrapper: { severity: 'high', via: ['image-size', 'instrumentation'] },
    instrumentation: { severity: 'moderate', via: ['surprise'] },
    surprise: { severity: 'moderate', via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }] },
    'image-size': { severity: 'high', via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr' }] },
  }), fx);
  assert.equal(result.status, 1); assert.match(result.stderr, /unreviewed Critical\/High/);
});

test('blocks an uncovered critical advisory even when every wrapper claims moderate severity', () => {
  const fx = fixture();
  const result = runGate(report({
    instrumentation: { severity: 'moderate', via: ['surprise'] },
    surprise: { severity: 'moderate', via: [{ severity: 'critical', url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }] },
  }), fx);
  assert.equal(result.status, 1); assert.match(result.stderr, /unreviewed Critical\/High/);
});

test('passes a well-formed moderate-only scanner graph without a high decision', () => {
  const fx = fixture();
  const result = runGate(report({
    instrumentation: { severity: 'moderate', via: ['yaml'] },
    yaml: { severity: 'moderate', via: [{ severity: 'moderate', url: 'https://github.com/advisories/GHSA-mmmm-nnnn-pppp' }] },
  }), fx);
  assert.equal(result.status, 0, result.stderr);
});

test('blocks a truncated moderate branch beside a reviewed high cause', () => {
  const fx = fixture();
  const result = runGate(report({
    wrapper: { severity: 'high', via: ['image-size', 'instrumentation'] },
    instrumentation: { severity: 'moderate', via: ['missing-yaml'] },
    'image-size': { severity: 'high', via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr' }] },
  }), fx);
  assert.equal(result.status, 1); assert.match(result.stderr, /unreviewed Critical\/High/);
});

test('blocks a cycle in a moderate branch beside a reviewed high cause', () => {
  const fx = fixture();
  const result = runGate(report({
    wrapper: { severity: 'high', via: ['image-size', 'instrumentation'] },
    instrumentation: { severity: 'moderate', via: ['yaml'] },
    yaml: { severity: 'moderate', via: ['instrumentation'] },
    'image-size': { severity: 'high', via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr' }] },
  }), fx);
  assert.equal(result.status, 1); assert.match(result.stderr, /unreviewed Critical\/High/);
});

test('blocks malformed advisory metadata in a moderate branch', () => {
  const fx = fixture();
  const result = runGate(report({
    wrapper: { severity: 'high', via: ['image-size', 'instrumentation'] },
    instrumentation: { severity: 'moderate', via: [null] },
    'image-size': { severity: 'high', via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr' }] },
  }), fx);
  assert.equal(result.status, 1); assert.match(result.stderr, /unreviewed Critical\/High/);
});

test('blocks a high wrapper with no reported high or critical cause', () => {
  const fx = fixture();
  const result = runGate(report({
    wrapper: { severity: 'high', via: ['yaml'] },
    yaml: { severity: 'moderate', via: [{ severity: 'moderate', url: 'https://github.com/advisories/GHSA-mmmm-nnnn-pppp' }] },
  }), fx);
  assert.equal(result.status, 1); assert.match(result.stderr, /unreviewed Critical\/High/);
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

test('fails closed on a malformed validation clock instead of bypassing expiration', () => {
  const fx = fixture();
  const result = runGate(coveredAudit(), fx, { DEPENDENCY_RISK_NOW: 'not-a-clock' });
  assert.equal(result.status, 1); assert.match(result.stderr, /validation clock is invalid/);
});

test('fails closed on an invalid decision expiry instead of accepting NaN', () => {
  const fx = fixture({ findings: [unreachableRow('GHSA-w3rx-r6r6-pgpr', { expiresAt: 'not-an-expiry' })] });
  const result = runGate(coveredAudit(), fx);
  assert.equal(result.status, 1); assert.match(result.stderr, /expiry is invalid/);
});

test('fails closed on an impossible calendar date in a decision expiry', () => {
  const fx = fixture({ findings: [unreachableRow('GHSA-w3rx-r6r6-pgpr', { expiresAt: '2099-02-30T00:00:00.000Z' })] });
  const result = runGate(coveredAudit(), fx);
  assert.equal(result.status, 1); assert.match(result.stderr, /expiry is invalid/);
});

test('fails closed on a malformed decision review date', () => {
  const fx = fixture({ findings: [unreachableRow('GHSA-w3rx-r6r6-pgpr', { reviewDate: 'not-a-review-date' })] });
  const result = runGate(coveredAudit(), fx);
  assert.equal(result.status, 1); assert.match(result.stderr, /review date is invalid/);
});

test('fails closed on a malformed exception approval timestamp', () => {
  const fx = fixture({ findings: [unreachableRow('GHSA-w3rx-r6r6-pgpr', {
    disposition: 'exception', expiresAt: '2099-01-01T00:00:00.000Z',
    approval: { owner: 'Fixture Owner', approvedBy: 'Named Reviewer', approvedAt: 'not-an-approval-date' },
  })] });
  const result = runGate(coveredAudit(), fx);
  assert.equal(result.status, 1); assert.match(result.stderr, /approval timestamp is invalid/);
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

test('security patch: a mapped IPv6 subnet cannot trust every IPv4 client', () => {
  const proxyaddr = require('proxy-addr');
  assert.equal(proxyaddr.compile('::ffff:10.0.0.0/8')('203.0.113.8', 0), false);
  assert.equal(proxyaddr.compile('::ffff:10.0.0.0/104')('10.2.3.4', 0), true);
  assert.equal(proxyaddr.compile('::ffff:10.0.0.0/104')('203.0.113.8', 0), false);
});

test('security patch: shell quoting rejects line terminators after a comment', () => {
  const shellQuote = require('shell-quote');
  for (const terminator of ['\n', '\r', '\u2028', '\u2029']) {
    assert.throws(() => shellQuote.quote(['echo', 'ok', { comment: 'context' }, `value${terminator}extra`]), TypeError);
  }
  assert.deepEqual(shellQuote.parse(shellQuote.quote(['ordinary value', 'line\nbreak'])), ['ordinary value', 'line\nbreak']);
});

test('security patch: an extreme indexed source-map offset is rejected in a bounded child', () => {
  // The vulnerable implementation spins for the attacker-chosen line offset.
  // Isolate it behind a hard timeout so a regression cannot hang the runner.
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const { SourceMapConsumer, SourceNode } = require('source-map-js');
    assert.throws(() => new SourceMapConsumer({ version: 3, sections: [{
      offset: { line: 1000000000000, column: 0 },
      map: { version: 3, sources: ['input.js'], names: [], mappings: 'AAAA' }
    }] }), /Section offset line must not exceed/);
    const consumer = new SourceMapConsumer({ version: 3, sections: [{
      offset: { line: 0, column: 0 },
      map: { version: 3, sources: ['input.js'], sourcesContent: ['value'], names: [], mappings: 'AAAA' }
    }] });
    assert.equal(SourceNode.fromStringWithSourceMap('value', consumer).toString(), 'value');
  `], { cwd: repoRoot.pathname, encoding: 'utf8', timeout: 3000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});

test('security patch: an aborted compressed response destroys its zlib stream', () => {
  // Real HTTP close and real zlib stream: observes resource cleanup rather
  // than merely asserting that the package version number increased.
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const http = require('node:http');
    const zlib = require('node:zlib');
    const original = zlib.createGzip;
    let stream;
    Object.defineProperty(zlib, 'createGzip', { configurable: true, value(...args) {
      stream = original(...args); return stream;
    }});
    const compression = require('compression')({ threshold: 0 });
    const server = http.createServer((req, res) => compression(req, res, () => {
      res.setHeader('Content-Type', 'text/plain');
      res.write('streamed content '.repeat(2000)); res.flush();
    }));
    (async () => {
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('aborted response left its zlib stream open')), 1500);
          const req = http.get({ hostname: '127.0.0.1', port: server.address().port,
            headers: { 'Accept-Encoding': 'gzip' } }, res => {
            res.once('data', () => {
              assert.ok(stream, 'fixture created a real gzip stream');
              stream.once('close', () => { clearTimeout(timer); resolve(); });
              res.destroy();
            });
          });
          req.on('error', error => { clearTimeout(timer); reject(error); });
        });
        assert.equal(stream.destroyed, true);
      } finally {
        if (stream) stream.destroy();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
    })().catch(error => { console.error(error.message); process.exitCode = 1; });
  `], { cwd: repoRoot.pathname, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});

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
