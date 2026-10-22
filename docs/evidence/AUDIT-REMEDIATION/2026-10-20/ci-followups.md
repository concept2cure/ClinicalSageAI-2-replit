# Hosted CI follow-ups — 2026-10-20

These remedies address observed failures on published commit `67d96c0601538412789a20da005244432fbacdb2` in [CI run 39497902777](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/39497902777). The results below qualify local follow-up files; they do not change that commit's hosted results.

## What already exists

The client reachability guard already rejects missing, undocumented, uncited or reachable withheld modules and enforces a zero-module unreachable baseline. The IND safety card was retained at `tests/fixtures/withheld/indSafetyReportCard.ts`; the released IND lifecycle remains the reachable surface. The obsolete production-path exemption survived that move. Existing source and all-local-ref deletion history were checked before removing it.

The dependency-risk gate already compares fresh lockfile audit findings with individually reviewed ledger occurrences. Its existing reviewed set contains three HIGH leaf occurrences. Existing lock entries, dependency ranges, package history and the canonical reseal mechanism were inspected before patching. No adjudication, finding evidence, threshold or scanner exception was changed.

## Observed failures and bounded remedies

| Hosted provenance | Failure | Remedy and local verification |
| --- | --- | --- |
| [Lint job 118887617414](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/39497902777/job/118887617414), step 108, `npm run ci:check-client-reachability` | Withheld exemption named the deleted production safety-card path. | Remove that one stale entry and correct descriptive baseline metadata. Actual guard exit 1 → 0; count remains 0 and modules remain empty. Nine real-guard controls went from 6 passed/3 failed to 9 passed, including rejection of a recreated retired path, new unreachable modules and invalid exemptions. The retained-card companion remains 20/20 with fixture/test bytes unchanged. |
| [Security Scan job 118887617586](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/39497902777/job/118887617586), steps 7 and 12; audit artifact 12297944689 | `follow-redirects` 1.16.0: CVE-2026-111755 / GHSA-8r9p-f939-6h3c and CVE-2026-111756 / GHSA-q3jh-wrc6-jgq8. | Lock-only compatible patch to 1.16.1. Loopback archive probes reproduce two old-version leaks, verify two patched protections and retain four benign redirect positives. |

A fresh audit after the redirect patch discovered a newly reported Vite HIGH, GHSA-587h-7wmj-h5pm, plus GHSA-698v-4r3x-3vcv and GHSA-r825-w8mm-5pxw. This was not the original hosted HIGH. The unexpected fourth HIGH stopped resealing until Vite was compatibly patched from 6.4.3 to 6.4.4.

Only the two existing lock entries' version, resolved URL and integrity fields changed; archive integrity was verified. `package.json` and dependency/peer/engine declarations are unchanged. Fresh `npm run ci:dependency-risk` then passed with exactly the existing three reviewed HIGH occurrences, with none new or missing. The canonical reseal changed only generated timestamp, scanner npm version and lockfile hash. `npm run test:dependency-risk` passed 36/36. The coordinated install subsequently contains follow-redirects 1.16.1 and Vite 6.4.4; root owns subsequent whole-project qualification.

Actual Trivy 0.70.0 filesystem scanning with `--severity CRITICAL,HIGH --exit-code 1` passed with zero blocking vulnerabilities and zero secret findings, using existing exceptions. Its database was updated at `2026-10-20T13:14:22.737606427Z`. Reachability strict lint improved from 1 error/7 warnings to 0 errors/7 warnings; pinned Semgrep 1.177.0 (`p/default`, `p/ci`, no baseline) found zero findings/errors in the new guard controls.

## Frozen source pins

SHA-256, before publication of these follow-ups:

| Path | SHA-256 |
| --- | --- |
| `scripts/ci/check-client-reachability.mjs` | `6672bf7396c3321aca29b1286c60c1b1a57c71d0c8584219c4c8fa8cffc1e8e0` |
| `scripts/ci/client-reachability-baseline.json` | `0bd0e70c97643a311b7ea320e2a6ba5cf2a9ed53e91d43bba0649b79aa48054e` |
| `scripts/ci/__tests__/client-reachability-withheld.test.mjs` | `9060914b8175097167a58094c430413ac64689f4db435ef128130b850ac00380` |
| `package-lock.json` | `7153128c3fb8850fa4bb3a8e13af8d3b48e0855014d27fdc61d1e93f938304c3` |
| `docs/security/dependency-risk-ledger.json` | `d53259c895a844e89472aad25679df1f4cbb4c82b7a75a3fdbacebb052b82f29` |

The unchanged manifest SHA-256 is `a5ca393c8923bde7985b7080931cc6ec98ac13ccf59430f8e526904f26a5b7f7`.

## Hosted qualification limits

At the final snapshot around `2026-10-20T22:11Z`, exact-67d Test (118902685010) and Coverage (118902685012) were still running. Integration (118902685045) remained running, but its native-database step had already failed: 22 failed/180 passed files, 40 failed/2176 passed/43 skipped tests, and three failed-suite headings. Concrete diagnostics include complaint fixtures missing required `patientHarm`, signature fixtures missing `determinationDate`, and native fixtures requiring an explicit runtime/key or database setup. These require separate diagnosis; they are not classified as the previously retained 96 unit failures. No final hosted unit-identity comparison or all-CI-green claim is made.

CodeQL, Semgrep, authenticated browser smoke, security contracts, full-history secret scanning, blank-database provisioning and both production boot checks passed on 67d. Build/release aggregates remain unqualified while upstream checks fail or run. Local scan success is not a hosted rerun.
