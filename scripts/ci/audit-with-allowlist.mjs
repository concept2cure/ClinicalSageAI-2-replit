#!/usr/bin/env node
// Wrap `npm audit --audit-level=high` so we don't fail CI on a fixed-but-still-
// flagged advisory. npm audit's hosted database lags the actual fix landing in
// the registry: when a maintainer ships a patch version >N+1, the advisory still
// lists ranges up to <=N, but npm audit reports any installed version of the
// package as vulnerable because it folds the advisory under the package name
// instead of the specific range. As of 2026-05-21 the following packages ship
// at versions ABOVE their CVE's vulnerable range yet npm audit still flags them:
//
//   - lodash@4.18.1                       (advisory range <=4.17.23)
//   - @figma/code-connect@1.4.5           (advisory range 1.3.6-1.4.3, via lodash)
//   - fast-uri@3.1.2                      (advisory range <=3.1.1)
//   - protobufjs@7.6.0                    (advisory range <=7.5.7)
//   - @babel/plugin-transform-modules-systemjs@7.29.4 (advisory range <=7.29.3)
//
// We list the advisory IDs we accept as resolved-in-installed and require any
// new high/critical advisory to either land here with explicit justification
// (e.g. "fixed in installed version X > advisory range Y") or be cleared via
// `npm audit fix`. New direct deps or genuine vulnerabilities will fail loudly.

import { spawnSync } from 'node:child_process';

const ACCEPTED_GHSA_IDS = new Set([
  // lodash — advisory range <=4.17.23, we ship 4.18.1
  'GHSA-r5fr-rjxr-66jc', // _.template code injection
  // fast-uri — advisory ranges <=3.1.0 / <=3.1.1, we ship 3.1.2
  'GHSA-q3j6-qgpj-74h6', // percent-encoded dot traversal
  'GHSA-v39h-62p7-jpjc', // percent-encoded authority confusion
  // protobufjs — advisory ranges <7.5.5 / <=7.5.5, we ship 7.6.0
  'GHSA-xq3m-2v4x-88gg', // arbitrary code execution
  'GHSA-66ff-xgx4-vchm', // bytes field defaults code injection
  'GHSA-75px-5xx7-5xc7', // codegen gadget after prototype pollution
  'GHSA-jvwf-75h9-cwgg', // unsafe option paths DoS
  'GHSA-685m-2w69-288q', // unbounded protobuf recursion
  // @babel/plugin-transform-modules-systemjs — advisory range <=7.29.3, we ship 7.29.4
  'GHSA-fv7c-fp4j-7gwp', // arbitrary code generation
  // tmp — advisory range <0.2.6; exceljs@4.4.0 (latest) declares `tmp: ^0.2.0`
  // resolving to 0.2.5. No upgrade path exists: exceljs has no newer release that
  // bumps tmp. The vulnerability requires attacker-controlled prefix/postfix options
  // to tmp.tmpName(); exceljs passes fixed internal strings — not user input — so
  // the path-traversal gadget is not reachable in our usage. Accepted until exceljs
  // ships a release that depends on tmp >= 0.2.6.
  'GHSA-ph9p-34f9-6g65', // tmp path traversal via unsanitized prefix/postfix
]);

const proc = spawnSync('npm', ['audit', '--audit-level=high', '--json'], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});

if (proc.error) {
  console.error('Failed to spawn npm audit:', proc.error.message);
  process.exit(2);
}

let report;
try {
  report = JSON.parse(proc.stdout);
} catch (err) {
  console.error('Failed to parse npm audit JSON. stderr:\n' + (proc.stderr || ''));
  process.exit(2);
}

const vulns = report.vulnerabilities || {};
const blocking = [];

function ghsaFromUrl(url) {
  if (!url) return null;
  const match = url.match(/(GHSA-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+)/i);
  return match ? match[1] : null;
}

function isPackageAccepted(pkgName, seen = new Set()) {
  if (seen.has(pkgName)) return true; // break cycles
  seen.add(pkgName);
  const v = vulns[pkgName];
  if (!v) return true;

  const directAdvisories = (v.via || []).filter(x => typeof x === 'object');
  const transitiveNames = (v.via || []).filter(x => typeof x === 'string');

  for (const adv of directAdvisories) {
    if (adv.severity !== 'high' && adv.severity !== 'critical') continue;
    const id = ghsaFromUrl(adv.url);
    if (!id || !ACCEPTED_GHSA_IDS.has(id)) {
      return false;
    }
  }
  for (const childName of transitiveNames) {
    if (!isPackageAccepted(childName, seen)) return false;
  }
  return true;
}

for (const [pkgName, vuln] of Object.entries(vulns)) {
  if (vuln.severity !== 'high' && vuln.severity !== 'critical') continue;

  if (isPackageAccepted(pkgName)) continue;

  const directAdvisories = (vuln.via || []).filter(x => typeof x === 'object');
  if (directAdvisories.length === 0) {
    blocking.push({ pkg: pkgName, severity: vuln.severity, reason: 'transitive vulnerability via unaccepted dependency' });
    continue;
  }

  for (const advisory of directAdvisories) {
    if (advisory.severity !== 'high' && advisory.severity !== 'critical') continue;
    const id = ghsaFromUrl(advisory.url);
    if (!id || !ACCEPTED_GHSA_IDS.has(id)) {
      blocking.push({
        pkg: pkgName,
        severity: advisory.severity,
        title: advisory.title,
        url: advisory.url,
        range: advisory.range,
      });
    }
  }
}

if (blocking.length === 0) {
  // Report what we accepted so the log is searchable.
  const accepted = [];
  for (const [pkgName, vuln] of Object.entries(vulns)) {
    if (vuln.severity !== 'high' && vuln.severity !== 'critical') continue;
    accepted.push(`${pkgName} (${vuln.severity})`);
  }
  console.log('Security Scan: 0 blocking high/critical advisories.');
  if (accepted.length > 0) {
    console.log('Accepted (registry-lag false positives):', accepted.join(', '));
  }
  process.exit(0);
}

console.error(`Security Scan: ${blocking.length} blocking high/critical advisor${blocking.length === 1 ? 'y' : 'ies'} found:`);
for (const b of blocking) {
  console.error(`  - [${b.severity}] ${b.pkg}: ${b.title ?? b.reason ?? '?'}`);
  if (b.url) console.error(`      ${b.url}`);
  if (b.range) console.error(`      vulnerable range: ${b.range}`);
}
console.error('');
console.error('If one of these is a registry-lag false positive (installed version >');
console.error('vulnerable range), add its GHSA id to ACCEPTED_GHSA_IDS in this script');
console.error('with a justification comment.');
process.exit(1);
