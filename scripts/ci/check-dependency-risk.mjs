#!/usr/bin/env node
/**
 * Lockfile audit gate backed by the reviewed dependency-risk ledger.
 *
 * This deliberately is not an allowlist. A scan finding must have a matching
 * ledger decision, and exceptions additionally require named approval and a
 * live expiration. Unknown advisories and scanner failures fail closed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
// DEPENDENCY_RISK_LEDGER / DEPENDENCY_RISK_LOCKFILE / DEPENDENCY_RISK_PACKAGE_JSON
// are test-fixture overrides: the self-test proves the script's logic against
// fully synthetic state instead of re-validating the committed repo state.
// CI callers of the real gate must not set them.
const ledger = JSON.parse(readFileSync(process.env.DEPENDENCY_RISK_LEDGER || new URL('docs/security/dependency-risk-ledger.json', root)));
const lockBytes = readFileSync(process.env.DEPENDENCY_RISK_LOCKFILE || new URL('package-lock.json', root));
const packageLock = JSON.parse(lockBytes);
const packageJson = JSON.parse(readFileSync(process.env.DEPENDENCY_RISK_PACKAGE_JSON || new URL('package.json', root)));

function fail(message) {
  console.error(`Dependency risk gate: ${message}`);
  process.exit(1);
}

if (ledger.schemaVersion !== 1 || !Array.isArray(ledger.findings)) fail('invalid ledger schema');
if (ledger.lockfileVersion !== packageLock.lockfileVersion) fail('ledger lockfileVersion is stale');
if (ledger.rootPackageVersion !== packageJson.version) fail('ledger root package version is stale');
if (ledger.lockfileSha256 !== createHash('sha256').update(lockBytes).digest('hex')) {
  fail('ledger lockfileSha256 is stale');
}

const now = new Date(process.env.DEPENDENCY_RISK_NOW || Date.now());
for (const finding of ledger.findings) {
  if (!finding.advisory || !finding.package || !finding.severity || !finding.action || !finding.owner) {
    fail('every ledger row requires advisory, package, severity, and action');
  }
  if (!['fixed', 'unreachable', 'mitigated', 'exception'].includes(finding.disposition)) {
    fail(`${finding.advisory} has an invalid disposition`);
  }
  if (!finding.evidence?.packagePaths?.length || !finding.evidence?.entryPoints?.length ||
      !finding.evidence?.runtimeProof?.length) {
    fail(`${finding.advisory} lacks package-path, entry-point, or runtime proof`);
  }
  const installed = packageLock.packages?.[`node_modules/${finding.package}`];
  if (installed?.version !== finding.installedVersion) {
    fail(`${finding.advisory} installed version does not match the lockfile`);
  }
  const direct = Boolean(packageJson.dependencies?.[finding.package] || packageJson.devDependencies?.[finding.package]);
  if ((direct ? 'direct' : 'transitive') !== finding.dependencyType) {
    fail(`${finding.advisory} direct/transitive status does not match package.json`);
  }
  if (!['fixed', 'exception'].includes(finding.disposition)) {
    if (!finding.reviewDate || !finding.expiresAt) fail(`${finding.advisory} decision is not time bounded`);
    if (new Date(finding.expiresAt) <= now) fail(`${finding.advisory} decision expired`);
  }
  if (finding.disposition === 'exception') {
    const approval = finding.approval;
    if (!approval?.owner || !approval?.approvedBy || !approval?.approvedAt || !finding.expiresAt) {
      fail(`${finding.advisory} is an unreviewed exception`);
    }
    if (new Date(finding.expiresAt) <= now) fail(`${finding.advisory} exception expired`);
  }
}

let report;
let scannerVersion = 'injected-test-report';
if (process.env.NPM_AUDIT_JSON) {
  report = JSON.parse(readFileSync(process.env.NPM_AUDIT_JSON, 'utf8'));
} else {
  const versionProc = spawnSync('npm', ['--version'], { encoding: 'utf8' });
  if (versionProc.status !== 0) fail('could not capture npm scanner version');
  scannerVersion = versionProc.stdout.trim();
  const proc = spawnSync('npm', ['audit', '--audit-level=high', '--json'], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  try { report = JSON.parse(proc.stdout); }
  catch { fail(`npm audit returned invalid JSON: ${proc.stderr || 'no diagnostic'}`); }
}
if (process.env.NPM_AUDIT_OUTPUT) {
  const evidence = {
    scanner: { name: 'npm audit', version: scannerVersion },
    runtime: { node: process.version },
    command: 'npm audit --audit-level=high --json',
    lockfileSha256: ledger.lockfileSha256,
    report,
  };
  writeFileSync(process.env.NPM_AUDIT_OUTPUT, JSON.stringify(evidence, null, 2) + '\n');
}
if (report?.error || (report?.message && !report.vulnerabilities)) {
  fail(`scanner unavailable: ${report.error?.summary || report.message}`);
}
if (!report?.vulnerabilities || !report?.metadata?.vulnerabilities) {
  fail('scanner response omitted vulnerability metadata');
}

const decisions = new Map(ledger.findings.map(row => [row.advisory.toUpperCase(), row]));
const blocking = [];
const observed = [];
const advisoryId = url => url?.match(/GHSA-[a-z0-9-]+/i)?.[0]?.toUpperCase();

function covered(packageName, path = new Set()) {
  // `path` is the current DFS chain, not a global visited set: two siblings
  // reaching the same reviewed leaf (a diamond, npm audit's normal shape for a
  // shared transitive) must both be allowed to check it. Only a package that
  // appears on its own causal chain — a true cycle — fails closed here.
  if (path.has(packageName)) return false;
  path.add(packageName);
  try {
    const vulnerability = report.vulnerabilities[packageName];
    // A via-string naming a package the report does not list is a malformed
    // or truncated scanner response; treat the unknown as unreviewed.
    if (!vulnerability) return false;
    let hasRelevantCause = false;
    for (const via of vulnerability.via || []) {
      if (typeof via === 'string') {
        hasRelevantCause = true;
        if (!covered(via, path)) return false;
        continue;
      }
      if (!['high', 'critical'].includes(via.severity)) continue;
      hasRelevantCause = true;
      const id = advisoryId(via.url);
      const decision = id && decisions.get(id);
      observed.push({ id, packageName, severity: via.severity });
      // A row marked fixed must not continue to appear against the exact graph.
      // Only an evidence-backed current decision can cover an observed finding.
      if (!decision || decision.package !== packageName ||
          !['unreachable', 'mitigated', 'exception'].includes(decision.disposition)) return false;
    }
    return hasRelevantCause;
  } finally {
    path.delete(packageName);
  }
}

for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
  if (['high', 'critical'].includes(vulnerability.severity) && !covered(name)) blocking.push(name);
}
if (blocking.length) fail(`unreviewed Critical/High finding(s): ${[...new Set(blocking)].join(', ')}`);

console.log(`Dependency risk gate: PASS; ${observed.length} Critical/High advisory occurrence(s), all reviewed.`);
console.log(`Scanner: npm audit ${scannerVersion}; Node ${process.version}; lockfile ${ledger.lockfileSha256}`);
for (const item of observed) console.log(`  ${item.id} ${item.packageName} ${item.severity}: ${decisions.get(item.id).disposition}`);
