# Remote verification of b4badf56

This receipt concerns only implementation commit `b4badf56fbe9038490bae860dc41f812bd966c27` on `concept2cure-v2`. The three workflow-run API responses independently identify that head SHA. Initial observation 2026-10-09T22:17:10.795Z; completed main-CI receipts added after the 2026-10-09T22:21:53.108Z observation. All timestamps below are UTC log timestamps or explicitly identified metadata/observation timestamps.

| Check | Run / job / step | Concrete result |
| --- | --- | --- |
| Security Scan | CI [37996641066](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37996641066) / [114044298588](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37996641066/job/114044298588) | Job completed **success**; dependency-risk gate, fail-closed tests, PPTX reachability, Trivy exception checks, filesystem scan and configuration scan steps completed success. This does not mean the entire CI run passed. |
| Ordinary full TypeScript | C2C Agent Validate & Audit [37996640994](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37996640994) / [114044298127](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37996640994/job/114044298127) / step 5 | Canonical **stock** `tsc --noEmit`: baseline 0, errors found 0, tsc exit 0. No memory-bounded workers were used. Audit run completed success (metadata updated 2026-10-09T22:05:25Z). |
| Main CI full and beta TypeScript | CI [37996641066](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37996641066) / [114044298539](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37996641066/job/114044298539) / steps 127 and 128 | Both completed **success**. Full stock CLI reported errors 0, baseline 0, tsc exit 0; beta ran stock tsc with tsconfig.beta-slice.json. The earlier five failed steps still make the Lint job fail. |
| Semgrep | [37996641125](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37996641125) / [114044300653](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37996641125/job/114044300653) / blocking step 5 | Job completed **failure**, blocking scan exit 1: **8 blocking findings**. Full inventory scan step 6 and SARIF uploads steps 7/8 completed success; those successful later steps do not override the failed gate. |

Security step 7 began at 2026-10-09T22:00:09.7537975Z; its concrete result at 22:00:12.3910562Z was: `Dependency risk gate: PASS; 3 Critical/High advisory occurrence(s), all reviewed.` At 22:00:12.3912639Z the log identified npm audit 10.9.9, Node v22.23.3, and lockfile SHA-256 `529a8e5889cf500959484df70c561d27746437aa3a4c7d043cd70a5c551e3961`. The gate runs `npm audit --audit-level=high --json` without an omit-dev flag, then validates the exact audit against the committed dependency-risk ledger. The three printed occurrences are all High: braces GHSA-VFJ7-8CJW-P6XM, image-size GHSA-5P2G-FCMC-QVQQ, and image-size GHSA-W3RX-R6R6-PGPR; each retains its existing reviewed unreachable disposition. No Handlebars occurrence is listed among those Critical/High findings. This is a reviewed-risk gate pass, not a claim that every dependency has no advisory.

Security step 8 began at 22:00:12.4074761Z and reported **36 tests, 36 pass, 0 fail** at 22:00:14.2307651Z–22:00:14.2308210Z, including all four new Handlebars semantic tests. PPTX reachability reported PASS at 22:00:14.4019714Z. The exact audit artifact is `npm-audit-lockfile-evidence`, ID **11647187813**, created 2026-10-09T22:00:14Z, with archive digest `sha256:16ceede57cd3209b59c8140caa343659146b9a04109fafd88ba330880a06b584`; artifact metadata binds it to b4badf56. The archive contents were not independently parsed in this monitoring session. Trivy's configuration step succeeded but its log contains Helm render errors for both charts because PostgreSQL/Redis chart dependencies are absent; its success is not evidence that those Helm templates were inspected.

Audit step 5 began at 2026-10-09T22:00:07.5106346Z; at 22:00:07.6582016Z it printed `running tsc --noEmit (baseline: 0)`. At 22:03:10.0454496Z it printed `errors found: 0 (tsc exit 0)`, then confirmed baseline match at 22:03:10.0455471Z. The subsequent Audit lint command is `npm run lint || true`; its successful step metadata is not an enforcing ESLint result.

Semgrep selected gate baseline **661a2c93aff2f7799e8d55f7ab0f92d5ebfcac19**, latest passing canonical-branch Semgrep run **37735466781**, at 2026-10-09T21:59:42.7003179Z. Blocking scan result at 22:02:55.4342590Z–22:02:55.4343197Z: 8 findings, 492 rules, 2,954 targets; scan limited to changes since that baseline. It exited 1 at 22:02:55.8801867Z. The full non-gating inventory scan finished at 22:14:33.4036708Z with 688 findings, 647 rules and 21,132 targets. Semgrep run metadata updated to completed/failure at 22:14:48Z.

The separate **b879e9a9 seven-to-eight comparison** uses its previously recorded finding identities, not the gate's chosen 661a baseline. All seven prior file/rule identities remain, none was removed, and the sole additional identity is the new CMC fixture at line 71. No new finding was reported in the memory helper, canonical gate or worker tests.

| Blocking location | Rule | Compared with b879 |
| --- | --- | --- |
| docs/evidence/QA-2026-10-08/walk2-majors/walk-2/h.mjs:97 | detect-non-literal-regexp | Existing |
| server/services/__tests__/artifact-approval-review-integrity.pglite.test.ts:112 | detect-non-literal-regexp | Existing |
| server/services/__tests__/fixtures/artifact-signed-target-harness.cjs:101 | detect-non-literal-regexp | Existing identity; prior line 100 |
| server/services/ana/__tests__/ind-cmc-leaf-drafting.test.ts:71 | detect-non-literal-regexp | **New** |
| server/services/ana/__tests__/package-ectd-for-region-recorded-identity.test.ts:67 | path-join-resolve-traversal | Existing |
| server/services/clinical-regulatory-evidence/dataset-profile.ts:140 | detect-non-literal-regexp | Existing |
| server/services/part11/__tests__/one-signing-authority-policy.test.ts:96 | detect-non-literal-regexp | Existing |
| server/services/tasking/__tests__/task-project.pglite.test.ts:38 | path-join-resolve-traversal | Existing |

The full rule IDs are `javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp` and `javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal`. The newly reported CMC fixture dynamically compiles its expected provenance suffix. A literal string suffix assertion can preserve its validation intent without dynamic regex construction; no source change or suppression was performed as part of this monitoring receipt.

Main CI Lint job **114044298539**, run **37996641066**, has now completed **failure**. Its stock TypeScript **127** and beta TypeScript **128** both completed **success**, independently observed at **2026-10-09T22:21:53.108Z**. The complete stock step began at 22:18:19.6976184Z; at 22:18:19.8440358Z it printed `running tsc --noEmit (baseline: 0)`, at 22:21:34.7901041Z `errors found: 0 (tsc exit 0)`, and at 22:21:34.7902350Z baseline match. Beta began at 22:21:34.8033393Z and ran `NODE_OPTIONS="--max-old-space-size=4096" tsc --noEmit -p tsconfig.beta-slice.json` at 22:21:34.9202845Z; its next boundary is post-job cleanup at 22:21:36.5595488Z. Both step shells used Bash `-e`; no bounded-worker activation appears in the complete job log.

Main CI ESLint steps 123/124/125 and CI guard self-tests 126 also completed success; the guard self-tests reported 260 passes. They do not override these five actual failed steps:

| Failed step | Concrete completed-log cause | UTC result timestamp |
| --- | --- | --- |
| 33 Proof tier | One failed suite, `tests/schema-contract/biopharma-programs-router-columns.contract.test.ts`; PostgreSQL code 42701, `column "sponsor_address" specified more than once`. The serialized fixture CREATE TABLE repeats sponsor_address and ind_type. 120 other files passed; 1,366 tests passed and 6 skipped. | 22:11:48.0366627Z–22:11:48.1177265Z |
| 51 Error-envelope guard | The gate reports one read above its own baseline: `concept2cure/components/ana/anaTurnTimeline.ts:214 [typeof-error-string]`. | 22:12:06.8374339Z–22:12:06.8375797Z |
| 58 AnA step presentation | `ci:step-presentation:selftest` reports 17/20; its real-tree CLI control fails. Mutation-case output identifies `MISSING review_sop_requirements: no present block` alongside deliberately mutated controls. The chained standalone `ci:step-presentation` command did not run because the preceding selftest failed. | 22:12:40.8391913Z–22:12:42.5554985Z |
| 74 Tenant-isolation SQL guard | One candidate above its own baseline: `server/services/vault/document-chunking-backfill.service.ts#db0501f26bbf:document_chunks`, line 102. | 22:12:54.9173917Z–22:12:54.9325974Z |
| 84 requestDb coverage | Two shared-pool route candidates above its own baseline: `server/routes/ana-ri/runs.ts` and `server/routes/submissions.ts`. | 22:12:57.8938307Z–22:12:57.8981959Z |

These are gate-reported causes on b4badf56. “Above baseline” refers to each guard's committed baseline, not proof that this implementation introduced those sites. No remediation, waiver, baseline rewrite or assertion that the full CI run passed is made here. In particular, the step-58 selftest's deliberate search_project_documents deletion and convene_drafting_council engine mutation are not actual production-tree findings.

The complete retrieved main Lint job log is hash-bound below, **2,578,433 bytes**, SHA-256 `fcc0d8b6d4a10d68974c5da7ea716ec98a8f401379ab3ba5697034db2e416955`. The complete stock/beta step excerpt, including completed-success API receipts and the next post-job boundary, is [remote-main-typecheck-excerpt.txt](./remote-main-typecheck-excerpt.txt).

GitHub's Actions bot subsequently added **912345087bb7b7626ae7557eed61c6c2b38932f4**, parent b4badf56, message `chore(repo-health): auto-refresh baseline after merge [skip ci]`. The commit API confirms that only `docs/reports/repo-health-scan-latest.json` and `docs/reports/repo-health-scan-latest.md` changed. The workflow results above remain results for b4badf56; the automated report refresh does not clear any failed release gate or establish a new verification baseline.

Permanent log evidence:

- [Complete Security Scan job log](./remote-security-scan.txt)
- [Complete Semgrep job log](./remote-semgrep.txt)
- [Complete Audit stock-TypeScript step excerpt](./remote-stock-typecheck-excerpt.txt)
- [Complete main-CI stock/beta TypeScript step excerpt](./remote-main-typecheck-excerpt.txt)
- [SHA-256 and byte counts of all complete retrieved logs](./remote-job-log-hashes.json)

The Audit excerpt excludes the subsequent non-enforcing lint output. Its hash
record covers the complete original job response, including lint. The full main
Lint log is not duplicated here; its hash and concrete failed-step causes are
retained, together with the complete successful compiler-step excerpt.

No repository files were edited. No workflow was rerun or suppressed. The release is not cleared.
