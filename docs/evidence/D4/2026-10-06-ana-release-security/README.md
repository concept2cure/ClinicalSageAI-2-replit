# Anna release-security remediation

Workstream W3 / launch row D4. This record addresses release security checks
that block Anna qualification and staging; it does not assert live model or
regulatory expert acceptance.

## Exact-head diagnosis

GitHub Actions CI run `37498480047`, Security Scan job `112389039861`, checked
published commit `775bde8adbe03a9d150f6cbb2a65a41c9912d66d`. The npm audit artifact
archive SHA-256 matches GitHub's recorded digest
`50e5fc3e6bb0973265b2fcb516bdfa8885c2a2ff97bd09bb87aa8860c893ffb9`.
`exact-head-security-ci.json` records step outcomes and dependency log excerpts;
`npm-audit-ci-775bde8.json` preserves the unmodified scanner result envelope.

Both dependency scans failed on newly reported vulnerable versions. The npm
gate also rejected Jest wrappers with one reviewed High cause and a separate
Moderate cause. No new scanner suppression or advisory exception is proposed.
Trivy config, secret-history scanning, and security-contract tests passed on
this head. A green config step does not establish complete Helm coverage: its
logs report absent chart dependencies for two chart directories.

## Narrow dependency rationale

| Existing package | Before | Patched | Reason and graph |
|---|---|---|---|
| compression | 1.8.1 | 1.8.2 | Premature-close zlib memory leak; direct production HTTP middleware dependency. |
| proxy-addr | 2.0.7 | 2.0.8 | IPv4-mapped IPv6 trust-subnet spoofing; Express parent range `^2.0.7` permits the patch. |
| source-map-js | 1.2.1 | 1.2.2 | Indexed source-map offset CPU exhaustion; all three parent ranges are `^1.2.1`. |
| shell-quote | 1.9.0 | 1.11.0 | Line-terminator injection after a comment token; dev-only gel parent range `^1.8.1` permits the fix. |

Compression 1.8.2 adds **destroy 1.2.0** as a transitive production dependency.
This is the maintainer's required stream-cleanup implementation for the security
fix, not a new application capability. Its published integrity is recorded in
the npm-generated lockfile. The complete graph diff changes only the manifest
root, these four packages, and this required helper. The compatible transitive
fixes are pinned through the existing `overrides` mechanism to prevent an older
vulnerable version from reappearing through another parent.

Primary advisory references checked 2026-10-06:

- https://github.com/expressjs/compression/security/advisories/GHSA-vc2v-76pw-4v95
- https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h
- https://github.com/advisories/GHSA-68fv-2mgg-jv7q
- https://github.com/ljharb/shell-quote/security/advisories/GHSA-pqg4-j6r4-53mv

## Gate threshold correctness

The existing policy is High/Critical only: `npm audit --audit-level=high`, the
gate's top-level severity filter, and both Trivy actions' `CRITICAL,HIGH`
thresholds establish it. The correction traverses **every** linked branch,
validates nodes and advisory severity metadata, and requires a reported High or
Critical cause for a High/Critical wrapper. A valid Moderate-only sibling no
longer requires a High/Critical ledger decision. Hidden unreviewed High causes,
missing nodes, cycles, malformed entries, and High wrappers without High causes
remain blocked. No reported severity is rewritten.

The red tests and exact CI replay precede remediation. A second red test
demonstrates that a Critical advisory hidden under exclusively Moderate
wrapper labels must still block. The final traversal inspects all reported
advisory causes rather than trusting a wrapper's summary severity. Its output
counts unique advisory/package/severity occurrences, avoiding repeated DFS
visits being reported as additional findings.

## Verification and limitations

- `green-dependency-risk-self-tests.txt`: **32 passing tests**. Includes direct
  and transitive uncovered causes, missing nodes, malformed advisory metadata,
  true cycles, unchanged-set resealing, and four actual package regressions.
  Five date-integrity regressions reject invalid clocks, invalid or impossible
  expiry dates, malformed review dates, and malformed approval timestamps;
  all five fail before the correction (`red-date-integrity-tests.txt`).
- `security-runtime-regressions.txt`: **28 passing tests** across real HTTP
  client-address/rate-limit behavior, production compression middleware,
  production text-only PPTX generation, and blocking Trivy-step contracts.
- `green-live-dependency-risk-gate.txt` and
  `npm-audit-patched-live-envelope.json`: actual registry scan and ledger gate.
  This scan is distinct from the labeled offline replay.
- `mechanical-reseal.txt` and `patched-audit-review.json`: the final observed
  High/Critical advisory set and reviewed installed versions exactly match
  the existing three active decisions. Only the seal timestamp, scanner
  version, and lock digest change. No risk row, expiry, owner, disposition,
  approval, advisory range, or suppression changes.
- `green-vulnerability-behavior-tests.txt`: spoofable trust subnets are denied;
  shell quoting rejects all four line terminators after a comment; excessive
  indexed source-map offsets are rejected promptly; actual aborted compressed
  HTTP responses destroy the real zlib stream. The initial source-map fixture
  expected normalization, but the patch correctly rejects the input instead;
  the evidence retains that contract correction and the benign fixture's
  added source content. All four original vulnerable versions failed their
  behavioral probes before installation.
- `pinned-trivy-scanner.json`: the scratch Trivy v0.70.0 executable matches
  the official release checksum, the same scanner version used by CI.
  `trivy-fs-patched.json`, its summary, log, and exit record retain the actual
  scan with a fresh vulnerability database. `--list-all-pkgs=false` changes
  only output inventory verbosity; it does not skip packages or suppress
  findings. Existing `.trivyignore` entries are applied unchanged. The local
  filesystem scan includes the simultaneous Anna workstream edits; it is not
  a published-commit CI result.
  `trivy-fs-first-success-full.json` preserves the first successful scan's
  complete unmodified inventory report. A second use of its workspace cache
  faulted in bbolt's mapped database page (`trivy-fs-cache-rerun-fault.txt`,
  exit 2); the final scan with a freshly downloaded database in `/tmp`
  completed with **0 High/Critical findings, 0 secrets, exit 0**. The cache
  fault is a scanner execution failure, not a vulnerability result; no
  suppressions or security thresholds were changed to obtain the final scan.
- The normal ESLint configuration ignores these existing `.mjs` scripts.
  Forced lint returns no errors and the same three existing console warnings;
  no new complexity warning remains.

The plain npm audit remains nonzero: **75 vulnerability wrapper entries**
(31 High, 43 Moderate, 1 Low, 0 Critical). The four remediated package findings
are absent. The only direct High/Critical advisory occurrences remaining are
the existing **image-size (two) and dev-only braces (one)** unreachable
decisions. Their reachability evidence is rechecked here; a reviewed
disposition does not mean the installed dependency graph is vulnerability-free.
The production braces tree remains empty, and the PPTX reachability guard and
real generator test still exclude image-size from the runtime module graph.

Existing owner fields still identify a team. An accountable human must own
re-review before the unchanged deadlines: braces **2026-11-05**, image-size
**2026-11-25**. This session does not invent that identity or accept risk on
their behalf. New-head CI, complete rendered Helm coverage, production-image
staging, qualified human review, and live Anna/model acceptance remain separate
release obligations.
