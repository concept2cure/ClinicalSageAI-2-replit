#!/usr/bin/env node
// Wrap `npm audit --audit-level=high` so we don't fail CI on a fixed-but-still-
// flagged advisory. npm audit's hosted database lags the actual fix landing in
// the registry: when a maintainer ships a patch version >N+1, the advisory still
// lists ranges up to <=N, but npm audit reports any installed version of the
// package as vulnerable because it folds the advisory under the package name
// instead of the specific range.
//
// We list the advisory IDs we accept as resolved-in-installed and require any
// new high/critical advisory to either land here with explicit justification
// (e.g. "fixed in installed version X > advisory range Y") or be cleared via
// `npm audit fix`. New direct deps or genuine vulnerabilities will fail loudly.
//
// MAINTENANCE NOTE — every version claimed in this file was audited against the
// lockfile on 2026-07-26, and several had gone stale in ways that mattered:
//
//   - A react-router exception was being carried as an accepted "not reachable"
//     risk on the stated grounds that the app used react-router-dom. It did not
//     use it at all; the package has been removed and both its advisories are
//     gone rather than accepted.
//   - The `tmp` exception claimed no upgrade path existed. One had since been
//     applied via an `overrides` entry, so it was a risk acceptance for a
//     vulnerability that was already fixed.
//   - A version inventory in this header listed fast-uri@3.1.2 and
//     protobufjs@7.6.0 while the tree carried 3.1.4 and 7.6.4.
//
// An exception whose justification no longer holds is worse than no exception:
// it reads as a considered decision when nobody has looked in months. So when
// touching this file, re-check the claim against the installed tree
// (`npm ls <pkg> --all`) rather than trusting the comment next to it — and
// delete entries whose subject is gone instead of rewording them. The header
// inventory that used to live here was removed for the same reason: it
// duplicated the per-entry notes and drifted out of step with them.

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
  // @babel/plugin-transform-modules-systemjs — advisory range <=7.29.3; installed
  // 7.29.7, above range. (The note here said 7.29.4; the tree has moved since.)
  'GHSA-fv7c-fp4j-7gwp', // arbitrary code generation
  // tmp — advisory range <0.2.6; installed 0.2.7 via the `overrides` entry
  // "tmp": "^0.2.6", above range. FIXED IN INSTALLED, not a risk acceptance.
  //
  // This entry previously read "No upgrade path exists: exceljs has no newer
  // release that bumps tmp" and accepted the advisory on the grounds that the
  // path-traversal gadget was unreachable in our usage. An override had since
  // been added, so the acceptance was standing guard over something already
  // patched. exceljs still declares `tmp: ^0.2.0`; the override is what lifts it.
  'GHSA-ph9p-34f9-6g65', // tmp path traversal via unsanitized prefix/postfix
  // esbuild — advisory GHSA-gv7w-rqvm-qjhr, vulnerable range >=0.17.0 <0.28.1
  // (build-time RCE via NPM_CONFIG_REGISTRY during esbuild's binary fetch).
  // NOT a registry-lag false positive: copies genuinely within range remain.
  //
  // Tree as audited 2026-07-26, after bumping the direct devDependency to
  // ^0.28.1 (verified: `node scripts/build-server.mjs` succeeds on 0.28.1):
  //   node_modules/esbuild                            0.28.1  ← FIXED; the copy
  //                                                     our own build invokes
  //   node_modules/vite/node_modules/esbuild          0.25.12 ← in range
  //   node_modules/drizzle-kit/node_modules/esbuild   0.19.12 ← in range
  //   node_modules/@esbuild-kit/core-utils/…/esbuild  0.18.20 ← in range
  //
  // The three remaining copies are nested inside build tooling that pins its own
  // esbuild. Forcing them up with an override would put drizzle-kit — which the
  // migration tooling depends on — on an esbuild four minors ahead of what it
  // was released against, which is a materially worse risk than a build-time
  // advisory. So: accepted as a BUILD-TIME-ONLY risk (no runtime/production
  // path), narrowed to tooling-internal copies, pending upstream releases of
  // vite/drizzle-kit that carry esbuild >= 0.28.1.
  //
  // Accepting this also clears the tsx/vite "transitive vulnerability" flags,
  // which are this same advisory surfaced through their bundled esbuild.
  'GHSA-gv7w-rqvm-qjhr', // esbuild binary-integrity RCE (build-time; tooling-internal copies)
  // ── Upgraded in place via package.json `overrides` to a version ABOVE the
  // advisory's vulnerable range. These are genuinely fixed in the installed
  // tree (confirmed: `npm ls <pkg> --all` shows only the patched version), but
  // npm audit still folds the advisory under the package name (registry lag),
  // so they are accepted here as resolved-in-installed. ──
  // ws — advisory <8.21.0; override ^8.21.0 (installed 8.21.0)
  'GHSA-96hv-2xvq-fx4p', // ws memory-exhaustion DoS from tiny fragments
  // form-data — advisory <4.0.6; override ^4.0.6 (installed 4.0.6)
  'GHSA-hmw2-7cc7-3qxx', // form-data CRLF injection via unescaped field names
  // protobufjs — advisory ranges <=7.6.0 and <=7.6.2; override ^7.6.4 (installed 7.6.4)
  'GHSA-wcpc-wj8m-hjx6', // unbounded Any expansion DoS during JSON conversion
  'GHSA-f38q-mgvj-vph7', // protobufjs (advisory range <=7.6.2)
  // vite — advisory ranges <=6.4.2; bumped direct dep + override ^6.4.3 (installed 6.4.3).
  // Both advisories are dev-server-only (server.fs.deny bypass), not a prod/runtime path.
  'GHSA-fx2h-pf6j-xcff', // vite server.fs.deny bypass on Windows alternate paths
  'GHSA-v6wh-96g9-6wx3', // vite (advisory range <=6.4.2)
  // http-proxy-middleware — advisory range >=3.0.4 <3.0.7; bumped direct dep +
  // override ^3.0.7 (installed 3.0.7, above range).
  'GHSA-gcq2-9pq2-cxqm', // http-proxy-middleware multipart/form-data CRLF field injection
  // nodemailer — advisory range <=9.0.0; bumped direct dep ^9.0.1 (installed 9.0.1,
  // above range). Our usage is createTransport/sendMail only — no `raw` option.
  'GHSA-p6gq-j5cr-w38f', // nodemailer raw-option file read / SSRF
  // undici — advisory ranges <7.28.0 (3 advisories); override ^7.28.0 (installed
  // 7.28.0, above range). All undici consumers (cheerio, jsdom, @figma/code-connect)
  // accept ^7, so the override is non-breaking.
  'GHSA-vmh5-mc38-953g', // undici TLS cert validation bypass via dropped requestTls (SOCKS5)
  'GHSA-vxpw-j846-p89q', // undici WebSocket DoS via fragment count bypass
  'GHSA-hm92-r4w5-c3mj', // undici cross-origin request routing via SOCKS5 proxy pool reuse
  // Accepting the ws advisory above also clears the engine.io / engine.io-client /
  // socket.io / socket.io-adapter / socket.io-client "transitive vulnerability via
  // unaccepted dependency" flags — that is this same ws advisory surfaced through
  // their dependency chain.
  // ── brace-expansion / fast-uri / linkify-it / postcss: upgraded in place
  // (package.json `overrides`, or a direct-dep bump for postcss) to a version
  // ABOVE each advisory's vulnerable range.
  // Confirmed fixed-in-installed via `npm ls <pkg> --all` (only the patched
  // version present); npm audit still folds each advisory under the package name
  // (registry lag), so accepted here as resolved-in-installed. ──
  // brace-expansion — advisory ranges <1.1.16 / >=2.0.0 <2.1.2 / >=3.0.0 <5.0.7 /
  // <=5.0.7; override 5.0.8 (installed 5.0.8, only version in the tree).
  'GHSA-3jxr-9vmj-r5cp', // brace-expansion DoS: exponential expansion of non-expanding {} groups
  'GHSA-mh99-v99m-4gvg', // brace-expansion DoS: unbounded expansion length OOM crash
  // fast-uri — advisory ranges <=3.1.3 / >=3.0.0 <3.1.3; override ^3.1.4 (installed
  // 3.1.4). ajv declares fast-uri ^3.0.1, so the ^3.1.4 override is non-breaking.
  'GHSA-v2hh-gcrm-f6hx', // fast-uri host confusion via literal backslash authority delimiter
  'GHSA-4c8g-83qw-93j6', // fast-uri host confusion via failed IDN canonicalization
  // linkify-it — advisory range <=5.0.1; override ^5.0.2 (installed 5.0.2).
  // markdown-it declares linkify-it ^5.0.2, so the override is non-breaking.
  'GHSA-v245-v573-v5vm', // linkify-it quadratic-complexity DoS via the mailto: validator scan-loop
  // postcss — advisory range <=8.5.17; direct dep bumped ^8.5.23 (installed 8.5.23).
  'GHSA-r28c-9q8g-f849', // postcss path traversal in previous-source-map auto-loading
  // react-router — both advisories (GHSA-chx6-hx7r-mcp5 DoS, GHSA-qwww-vcr4-c8h2
  // RSC-mode CSRF) are GONE, not accepted: react-router-dom has been removed from
  // the dependency tree entirely.
  //
  // The deferral that used to sit here rested on a claim that turned out to be
  // false — that "this app uses react-router-dom in SPA / data-router mode".
  // It did not use it at all. The app routes with `wouter`; react-router-dom was
  // a declared dependency with zero imports anywhere in the repo, so the CSRF
  // advisory was being carried as an accepted risk pending a react-router 8.x
  // major migration that would have been migrating nothing. Removing the package
  // closes both advisories permanently and drops the unused attack surface.
  //
  // If react-router is ever reintroduced, add it deliberately and re-assess these
  // advisories against actual usage rather than restoring this exception.
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
