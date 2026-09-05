#!/usr/bin/env node
/**
 * Reseal the dependency-risk ledger to the current package-lock.json.
 *
 * The ledger (docs/security/dependency-risk-ledger.json) pins
 * lockfileSha256 / lockfileVersion / rootPackageVersion, so every lockfile
 * change — a Dependabot bump, an engines edit — goes stale and turns the gate
 * (scripts/ci/check-dependency-risk.mjs) red until the seal is refreshed.
 * This tool refreshes that seal MECHANICALLY and nothing else:
 *
 *   1. It re-runs `npm audit --audit-level=high --json` against the current
 *      lockfile (or reads NPM_AUDIT_JSON, the same testability override the
 *      gate supports).
 *   2. It verifies the set of observed High/Critical advisory occurrences
 *      (advisory id + package) is EXACTLY the set the ledger's active findings
 *      cover, and that each covered finding's installedVersion and
 *      direct/transitive classification still hold in the new lockfile and
 *      manifest.
 *   3. Only then does it rewrite lockfileSha256, lockfileVersion,
 *      rootPackageVersion, generatedAt, and scanner.npmVersion in place.
 *
 * If anything new appears, a covered finding vanishes, or a covered finding's
 * installed version changed, it REFUSES with a named diff and writes nothing.
 * A reseal must never silently absorb a change to the finding set — that
 * requires a human review and an evidence-backed ledger row first (see
 * docs/security/WO-07-dependency-risk-decision.md).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
// Same test-fixture overrides as the gate; real callers must not set them.
const ledgerPath = process.env.DEPENDENCY_RISK_LEDGER || new URL('docs/security/dependency-risk-ledger.json', root);
const lockfilePath = process.env.DEPENDENCY_RISK_LOCKFILE || new URL('package-lock.json', root);
const manifestPath = process.env.DEPENDENCY_RISK_PACKAGE_JSON || new URL('package.json', root);

function refuse(message) {
  console.error(`Dependency risk reseal: REFUSED — ${message}`);
  console.error('Nothing was written. A reseal only rebinds an unchanged, already-reviewed finding set;');
  console.error('anything else needs a human-reviewed, evidence-backed ledger row first');
  console.error('(see docs/security/WO-07-dependency-risk-decision.md, "Resealing the ledger").');
  process.exit(1);
}

const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
if (ledger.schemaVersion !== 1 || !Array.isArray(ledger.findings)) refuse('invalid ledger schema');
const lockBytes = readFileSync(lockfilePath);
const packageLock = JSON.parse(lockBytes);
const packageJson = JSON.parse(readFileSync(manifestPath, 'utf8'));

// The reseal records the scanner version it sealed with, so capture it even
// when the report itself is injected for tests.
const versionProc = spawnSync('npm', ['--version'], { encoding: 'utf8' });
if (versionProc.status !== 0) refuse('could not capture npm scanner version');
const npmVersion = versionProc.stdout.trim();

let report;
if (process.env.NPM_AUDIT_JSON) {
  report = JSON.parse(readFileSync(process.env.NPM_AUDIT_JSON, 'utf8'));
} else {
  const proc = spawnSync('npm', ['audit', '--audit-level=high', '--json'], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  try { report = JSON.parse(proc.stdout); }
  catch { refuse(`npm audit returned invalid JSON: ${proc.stderr || 'no diagnostic'}`); }
}
if (report?.error || (report?.message && !report.vulnerabilities)) {
  refuse(`scanner unavailable: ${report.error?.summary || report.message}`);
}
if (!report?.vulnerabilities || !report?.metadata?.vulnerabilities) {
  refuse('scanner response omitted vulnerability metadata');
}

// Observed set: every High/Critical advisory occurrence (advisory id +
// package it is reported against). String vias are wrapper chains, not
// occurrences; the package that directly carries the advisory holds the
// object via, which is what a ledger row covers.
const advisoryId = url => url?.match(/GHSA-[a-z0-9-]+/i)?.[0]?.toUpperCase();
const observed = new Map();
for (const [packageName, vulnerability] of Object.entries(report.vulnerabilities)) {
  for (const via of vulnerability.via || []) {
    if (typeof via === 'string') continue;
    if (!['high', 'critical'].includes(via.severity)) continue;
    const id = advisoryId(via.url);
    if (!id) refuse(`observed a ${via.severity} advisory against ${packageName} with no parseable GHSA id (url: ${via.url || 'none'})`);
    observed.set(`${id} ${packageName}`, { id, packageName, severity: via.severity });
  }
}

// Covered set: active ledger rows. A row marked `fixed` must NOT still be
// observed, so it is excluded here — if its advisory reappears it shows up in
// the "new/uncovered" diff below, exactly as the gate would block it.
const active = ledger.findings.filter(row => ['unreachable', 'mitigated', 'exception'].includes(row.disposition));
const expected = new Map(active.map(row => [`${row.advisory.toUpperCase()} ${row.package}`, row]));

const problems = [];
for (const [key, occurrence] of observed) {
  if (!expected.has(key)) {
    problems.push(`NEW finding not covered by the ledger: ${occurrence.id} against ${occurrence.packageName} (${occurrence.severity})`);
  }
}
for (const [, row] of expected) {
  if (!observed.has(`${row.advisory.toUpperCase()} ${row.package}`)) {
    problems.push(`ledger row no longer observed: ${row.advisory} against ${row.package} — a human must update the row (e.g. disposition "fixed") before resealing`);
  }
}
for (const row of ledger.findings) {
  const installed = packageLock.packages?.[`node_modules/${row.package}`];
  if (installed?.version !== row.installedVersion) {
    problems.push(`installed version changed for ${row.advisory} ${row.package}: ledger reviewed ${row.installedVersion}, lockfile now has ${installed?.version ?? 'no installed copy'} — the evidence must be re-reviewed`);
  }
  const direct = Boolean(packageJson.dependencies?.[row.package] || packageJson.devDependencies?.[row.package]);
  if ((direct ? 'direct' : 'transitive') !== row.dependencyType) {
    problems.push(`dependency type changed for ${row.advisory} ${row.package}: ledger reviewed it as ${row.dependencyType}`);
  }
}
if (problems.length) {
  refuse(`the finding set changed, so this is not a mechanical reseal:\n  - ${problems.join('\n  - ')}`);
}

const previousSha = ledger.lockfileSha256;
ledger.generatedAt = new Date().toISOString();
if (ledger.scanner && typeof ledger.scanner === 'object') ledger.scanner.npmVersion = npmVersion;
ledger.lockfileVersion = packageLock.lockfileVersion;
ledger.rootPackageVersion = packageJson.version;
ledger.lockfileSha256 = createHash('sha256').update(lockBytes).digest('hex');
writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');

console.log(`Dependency risk reseal: OK — ${expected.size} reviewed High/Critical occurrence(s), finding set unchanged.`);
console.log(`  lockfileSha256: ${previousSha} -> ${ledger.lockfileSha256}`);
console.log(`  lockfileVersion ${ledger.lockfileVersion}; rootPackageVersion ${ledger.rootPackageVersion}; npm ${npmVersion}; generatedAt ${ledger.generatedAt}`);
console.log('Commit the rewritten ledger together with the lockfile change, then verify with: npm run ci:dependency-risk');
