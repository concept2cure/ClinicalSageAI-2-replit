# Fresh remote security and stock compiler verification

The published implementation `de61922a9351080fdcd76a231c5abd8182054831` has completed successful Security Scan and ordinary stock TypeScript verification. These observations apply to that exact implementation; they do not clear the overall release or qualify an IND submission.

Repository: `concept2cure/ClinicalSageAI-2-replit`; branch: `concept2cure-v2`; push runs created **2026-10-10T06:31:45Z**, attempt **1**. Both completed full job logs contain the exact checkout SHA from `git log -1 --format=%H`. No older-head result is used as a current-head pass.

| Check | Run / job | Completed result |
| --- | --- | --- |
| Security Scan | [CI 38031251355](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38031251355) / [114152480619](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38031251355/job/114152480619) | Job success; dependency-risk gate PASS |
| Dependency-risk regression tests | Same security job | 36 tests, 36 pass, 0 fail/cancelled/skipped/todo |
| Stock compiler | [Validate & Audit 38031251357](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38031251357) / [114152480600](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38031251357/job/114152480600) | Job success; `tsc --noEmit`, baseline 0, errors 0, compiler exit 0 |

## Security gate scope

At **2026-10-10T06:33:02.3705282Z**, the dependency-risk gate reported three Critical/High advisory occurrences, all reviewed. Its complete list contains the following three High occurrences:

| Advisory | Package | Logged decision |
| --- | --- | --- |
| GHSA-VFJ7-8CJW-P6XM | braces | unreachable |
| GHSA-5P2G-FCMC-QVQQ | image-size | unreachable |
| GHSA-W3RX-R6R6-PGPR | image-size | unreachable |

Handlebars is absent from this complete gate occurrence list. The 36 passing tests include the Handlebars AST injection, Function constructor lookup, inline-script termination and ordinary-rendering regression probes. The separate PPTX image reachability step also passed. This evidence records the exercised dependency-risk decisions; it does not show a vulnerability-free dependency tree. The installation output separately reports **76 vulnerabilities: 2 Low, 43 Moderate, 31 High**.

The scanner identified itself as `npm audit 10.9.9` on Node `v22.23.3`, with lockfile SHA-256 `529a8e5889cf500959484df70c561d27746437aa3a4c7d043cd70a5c551e3961`.

The exact audit evidence artifact is **11661994176**, `npm-audit-lockfile-evidence`, **6451 bytes**, archive SHA-256 `07eb16c9334280b42e20204329eabfc91df0e8ba514843b947fac776cdec8976`. GitHub artifact metadata binds it to run 38031251355 and this implementation SHA. The SBOM artifact is **11661474487**, `sbom-cyclonedx`, **207542 bytes**, archive SHA-256 `58d66a82ba6d4d19f7fc88c75e52db00536b4ca5cb680b86cef6bcfdc0ffa996`. These archive digests are metadata returned by GitHub; they are distinct from decoded job-log digests.

The successful Trivy steps have explicit coverage limits in the fresh log:

- Development/testing dependencies are suppressed; existing ignored/suppressed findings are present.
- Secret scanning warns about a 14 MB clinical-trials JSON file. The warning alone does not establish that the file was skipped.
- Python `site-packages` are unavailable, so Python license detection is skipped.
- Terraform variable values are unavailable and evaluation may be incomplete.
- Helm rendering fails for `charts/concept2cure-app` and `charts/trialsage-cer` because their declared PostgreSQL and Redis dependencies are missing from the charts directory. Successful config-step status therefore does not establish complete Helm coverage.

Trivy exception selftests intentionally emit negative-case FAIL messages, then confirm those cases were caught. The actual repository checks report five attached inline exceptions and three owned, reasoned, dated suppressions. These expected selftest messages are not failed workflow steps.

## Stock compiler scope

The job invokes `node scripts/ci/typecheck-no-regression.mjs`; its fresh log explicitly records ordinary `tsc --noEmit` with baseline **0** at **2026-10-10T06:32:44.1907089Z**. At **2026-10-10T06:35:39.0270942Z**, it reports **0 errors** and **tsc exit 0**, followed by confirmation that error count 0 matches the baseline. The subsequent `npm run lint || true` command is advisory and does not establish an enforced ESLint pass. The completed Validate & Audit run is successful; skipped regulatory/compliance/AI/security-audit jobs provide no qualification evidence.

## Broader CI snapshot

At **2026-10-10T06:50:23.378Z**, fresh main CI run **38031251355** remains **in progress**, with five completed failed steps in Lint job **114152480553**:

| Step | Fresh completed failure |
| --- | --- |
| 33 | Proof tier — schema contracts + golden journeys + export contracts |
| 51 | No hand-rolled error-envelope reads |
| 58 | Every in-scope AnA tool reads from its register entry |
| 74 | Tenant isolation in raw SQL (no regressions) |
| 84 | requestDb (RLS) adoption (no regressions) |

The complete failed-step list was checked at this timestamp; there were no additional failed steps. Lint was still executing step **124**, “Render ESLint findings (failure only).” Its whole-job log was not yet available, so this receipt records fresh failed-step identities without attributing causes from older logs. Main CI compiler steps **127/128** and later broader jobs have no verdict in this snapshot; the completed stock compiler result above is independently evidenced by its own job log.

Security Scan, Security Contract Tests and full-history Secret Scan are completed successfully; Nightly Governance Strict is skipped. See `remote-compiler-main-ci-snapshot.json` for the exact observed job/step state. Historical failures on `88fa1606` are separate evidence and are not substituted for fresh failure causes. These completed failures block overall CI/release clearance while remaining checks are pending.

## Evidence integrity

The retained excerpts reproduce selected original timestamped lines in original order. Each metadata file records their original 1-based line numbers, exact checkout identity, job state and source-log digest. Full logs were fetched only after these fresh jobs completed, using their exact job IDs; no generic older temporary logs were used.

| Fresh full decoded log | UTF-8 bytes | Lines | SHA-256 |
| --- | ---: | ---: | --- |
| Security job 114152480619 | 102801 | 1133 | `f5da0a52bba62a2e6af996ed64adc183d4c47c3f196521af8b9c1591ca4fffa5` |
| Stock compiler job 114152480600 | 1327252 | 10091 | `5e6abb120e64686335a6ba67ebede82f75a3e195c63e0592bc36822741060cda` |

`remote-security-compiler-digests.json` pins the retained metadata, excerpts and this report. The digest is for the UTF-8 decoded text returned by the GitHub connector, not a compressed full-log archive. This receipt does not qualify the scientific sources, model behavior, clinical evidence, filing package or release.
