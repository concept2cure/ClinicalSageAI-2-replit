#!/usr/bin/env node
// Wrap `npm audit --audit-level=high` so CI does not fail on a fixed-but-still-
// flagged advisory. npm audit's hosted database lags the fix landing in the
// registry: when a maintainer ships a patch, the advisory still lists ranges up
// to the last vulnerable version, but npm audit folds it under the package name
// and reports ANY installed version as vulnerable.
//
// ── Rules for this list ────────────────────────────────────────────────────
// An entry here suppresses a real advisory, so it is a risk acceptance, not
// bookkeeping. Before adding one, establish which kind it is and say so:
//
//   registry lag   the installed version is ABOVE the vulnerable range. Prove
//                  it with `npm ls <pkg> --all` and record the versions.
//   real exposure  an in-range copy IS installed and the risk is accepted for
//                  a stated reason (e.g. build-time only). Record what has to
//                  change for the entry to go away.
//
// Do NOT write a justification about how the package is used without checking
// that it is used that way. Two entries were removed for exactly that:
// react-router was accepted as "used in SPA / data-router mode" when the app
// never imported it, and tmp as "no upgrade path exists" long after an
// override had fixed it. Both read as considered decisions for months.
//
// The scan prints any accepted id npm audit did not flag on that run. Treat
// that list as a work queue: re-verify each and delete it, or confirm the id
// has only dropped out of the advisory database temporarily.
//
// As of 2026-07-26 this list was reduced from 27 entries to 1. Every other
// package had ONLY versions above its advisory range (verified per package
// with `npm ls <pkg> --all`), so those entries suppressed nothing.
//
// RECONCILED with the parallel audit that landed on concept2cure-v2 in #1111
// (5522c1cb). That change reached the SAME findings from the same evidence —
// react-router's justification described usage that did not exist, tmp's
// "no upgrade path" had been overtaken by an overrides entry, and several
// version claims had drifted — but kept the entries and corrected their notes.
// This keeps the removals instead, because a correctly-documented entry that
// suppresses nothing is still a standing risk acceptance nobody will re-check.
//
// The merge was decided by measurement, not preference: against the tree at that
// commit, `npm audit --audit-level=high` reports ZERO high/critical advisories,
// and the scan exits 0 with an EMPTY allowlist. All 32 entries on the base were
// dead. The dependency work in the same range (Pillow bump, react-router
// removal, the tmp override) is what cleared them.
//
// SECOND MERGE, against #1057, which added two more entries. Both were checked
// the way this header requires and both were dropped:
//
//   brace-expansion (GHSA-3jxr-9vmj-r5cp) — `npm ls brace-expansion --all` shows
//     a single copy at 5.0.8, above every vulnerable range, via the
//     "brace-expansion": "5.0.8" override. Registry lag at most; suppresses
//     nothing today.
//
//   react-router (GHSA-qwww-vcr4-c8h2) — the note read "this app routes with
//     wouter and uses react-router-dom only for a couple of auth screens" and
//     referenced "the react-router/react-router-dom ^7.18.1 override in
//     package.json". None of that holds: there is NO react-router import in
//     client/src, server/ or shared/ (the only match is the word inside a code
//     comment), no react-router entry in dependencies, devDependencies or
//     overrides, and `npm ls react-router react-router-dom --all` returns
//     nothing. The package is not installed.
//
// That is the SECOND time this exact advisory has been re-added with a usage
// claim that does not survive checking — #1106 removed the first one, which said
// the app used react-router "in SPA / data-router mode". Twice is a pattern, and
// it is the reason the rules at the top of this file are stated as rules rather
// than left as etiquette: the failure is not carelessness, it is that writing a
// plausible justification is easier than running `npm ls`.

import { spawnSync } from 'node:child_process';

const ACCEPTED_GHSA_IDS = new Set([
  // ── esbuild — the ONLY entry still covering a real exposure ───────────────
  // GHSA-gv7w-rqvm-qjhr, vulnerable range >=0.17.0 <0.28.1 (build-time RCE via
  // NPM_CONFIG_REGISTRY during esbuild's binary fetch).
  //
  // Not a registry-lag false positive: `npm ls esbuild --all` shows 0.18.20,
  // 0.19.12 and 0.25.12 installed alongside 0.28.1, and the first three are
  // inside the range. Accepted as a low, BUILD-TIME-ONLY risk (dev/build
  // tooling, never a runtime path) pending a coordinated bump across
  // vite / tsx / drizzle-kit. Re-check with `npm ls esbuild --all` before
  // renewing this — the moment no in-range copy remains, delete it.
  //
  // KEPT DESPITE BEING UNFLAGGED. The stale report below now names this id:
  // npm audit has stopped reporting the advisory entirely (it currently reports
  // zero high/critical advisories of any kind). That is the "dropped out of the
  // database temporarily" case the report is there to distinguish, and it is why
  // the report is advisory rather than enforcing. The exposure itself is
  // unchanged — three in-range copies remain installed, re-verified with
  // `npm ls esbuild --all` at this commit — so the entry stays. Deleting it on
  // the strength of a quiet scan would be the exact mistake this file's rules
  // warn about, run in the opposite direction.
  //
  // Accepting this also clears the tsx/vite "transitive vulnerability" flags,
  // which are this same advisory surfaced through their bundled esbuild.
  'GHSA-gv7w-rqvm-qjhr', // esbuild binary-integrity RCE (build-time; dep bump pending)

  // ── image-size — REAL exposure, accepted; NO fix is published ─────────────
  // GHSA-w3rx-r6r6-pgpr (ICNS parser DoS) and GHSA-5p2g-fcmc-qvqq (JXL/HEIF
  // parser DoS), vulnerable range <=2.0.2. This is NOT registry lag: the
  // in-range copy IS installed. `npm ls image-size --all` shows exactly one
  // copy, image-size@1.2.1, pulled ONLY by pptxgenjs@4.0.1 (which pins
  // "image-size": "^1.2.1"). There is no version to bump to — the LATEST
  // published image-size is 2.0.2, still inside the advisory range, and 2.x is
  // outside pptxgenjs's ^1.2.1 range anyway, so an override cannot fix it.
  //
  // Accepted as a low, non-request-path DoS: image-size is used by pptxgenjs
  // to read the dimensions of images being embedded into a generated PPTX deck
  // — first-party content on the export path, not an endpoint that parses
  // attacker-supplied ICNS/JXL/HEIF files. The failure mode is an infinite loop
  // in a synchronous export job, not RCE or data exposure.
  //
  // Accepting these two ids also clears the separate pptxgenjs "transitive
  // vulnerability via unaccepted dependency" flag — it is this same image-size
  // advisory surfaced through pptxgenjs's dependency (see isPackageAccepted's
  // transitive recursion below).
  //
  // Remove when image-size publishes a fixed version >2.0.2 AND pptxgenjs
  // widens its range to accept it (or pptxgenjs is dropped/replaced). Re-check
  // with `npm ls image-size --all`.
  'GHSA-w3rx-r6r6-pgpr', // image-size ICNS parser DoS (export-path only; no fix published)
  'GHSA-5p2g-fcmc-qvqq', // image-size JXL/HEIF parser DoS (export-path only; no fix published)
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

// A registry npm could not reach is NOT a clean audit.
//
// `npm audit --json` against an unreachable registry exits 0 and prints valid
// JSON with no `vulnerabilities` key and an `error`/`message` instead:
//
//   { "message": "request to .../security/audits/quick failed, reason: ECONNREFUSED", ... }
//
// spawn succeeded, JSON.parse succeeded, `report.vulnerabilities || {}` swallowed
// the difference, and this gate printed "0 blocking high/critical advisories" —
// on the CI security job AND on the pre-deploy gate in deploy-aws.yml. A proxy
// 407, a rate limit or a registry blip therefore shipped a green security check.
// The stale-entry report below made it look MORE authoritative, cheerfully
// noting that all three accepted advisories were "no longer flagged" — because
// nothing was flagged at all.
//
// Demonstrated: `npm_config_registry=http://127.0.0.1:9/ node <this file>`
// exited 0 with "0 blocking" before this check, and exits 2 with the registry
// error after it.
if (report && (report.error || (report.message && !report.vulnerabilities))) {
  const detail =
    (report.error && (report.error.summary || report.error.detail)) || report.message;
  console.error('npm audit did not reach the advisory database:\n  ' + detail);
  console.error('Refusing to report a clean audit for a scan that did not run.');
  process.exit(2);
}
if (!Object.prototype.hasOwnProperty.call(report ?? {}, 'vulnerabilities')) {
  console.error('npm audit returned no `vulnerabilities` key. Raw keys: ' + Object.keys(report ?? {}).join(', '));
  console.error('Refusing to report a clean audit for a scan that did not run.');
  process.exit(2);
}
if (!report.metadata || !report.metadata.vulnerabilities) {
  console.error('npm audit returned no `metadata.vulnerabilities` summary — the report is not the shape this gate parses.');
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

// ── Stale-entry detection ───────────────────────────────────────────────────
// Every id here suppresses a real advisory, so an entry that no longer matches
// anything is not harmless: it is a standing risk acceptance for a problem that
// may no longer exist, and its justification rots without anyone noticing.
//
// Two entries have already drifted this way. `react-router` was accepted with
// "this app uses react-router-dom in SPA / data-router mode" — the app never
// imported it at all. `tmp` was accepted with "no upgrade path exists" long
// after an override had fixed it. Both read as considered decisions and
// discouraged the check that would have found them.
//
// Reported, not enforced: npm audit's database moves, so an id can drop out
// for a release and return. Failing the build on that would be worse than the
// drift. The point is to make it visible in the log every run.
const flaggedIds = new Set();
for (const vuln of Object.values(vulns)) {
  for (const adv of (vuln.via || []).filter((x) => typeof x === 'object')) {
    const id = ghsaFromUrl(adv.url);
    if (id) flaggedIds.add(id);
  }
}
const staleAccepted = [...ACCEPTED_GHSA_IDS].filter((id) => !flaggedIds.has(id));

function reportStale() {
  if (staleAccepted.length === 0) return;
  console.log('');
  console.log(
    `Note: ${staleAccepted.length} allowlist entr${staleAccepted.length === 1 ? 'y is' : 'ies are'} no longer flagged by npm audit:`,
  );
  for (const id of staleAccepted) console.log(`  - ${id}`);
  console.log(
    'Each suppresses an advisory that no longer matches. Re-verify the justification and remove it,',
  );
  console.log('or confirm the id has only dropped out of the advisory database temporarily.');
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
  reportStale();
  process.exit(0);
}

reportStale();

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
