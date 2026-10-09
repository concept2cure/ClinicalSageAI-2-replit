# Concept2Cure remote verification — published implementation SHA

Verified commit: `b4badf56fbe9038490bae860dc41f812bd966c27`  
Canonical branch: `concept2cure-v2`  
Repository: `concept2cure/ClinicalSageAI-2-replit` (historical repository name; product label is Concept2Cure).  
The runs below are push-triggered attempt 1 for this exact SHA. They do not verify a later test-only or documentation commit.

## Tier 5 browser workflow

[Tier 5 Browser Smoke run 37996641034](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37996641034) completed **success** on 2026-10-09 at **22:02:31 UTC**. Its [Authenticated app smoke (real browser + DB) job 114044297877](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37996641034/job/114044297877) ran 21:58:59–22:02:31 UTC and completed success.

| Actual step | Number | Result | Start–finish UTC, 2026-10-09 | Completed-log evidence |
| --- | ---: | --- | --- | --- |
| Check AnA fresh-install migration ordering | 6 | **Success** | 22:00:31–22:00:36 | `tests/schema-contracts/install-fresh-ana-runs.pglite.test.ts`: **4 tests passed, 1 file passed**. Covers canonical parent before overlay, failed-parent rejection, missing-parent rollback, replay/FK/immutability. |
| Provision the application schema from scratch | 8 | **Success** | 22:01:07–22:01:22 | `node scripts/db/install-fresh.mjs` completed against fresh pgvector PostgreSQL 15. Logs verify **808 public tables, 1,004 RLS policies, 6/6 named-schema tables, 5/5 core-route tables, 19/19 authoring tables, and 8/8 required objects**. The AnA parent `db/migrations/20260917_ana_runs.sql` ran before the overlay. |
| Run the authenticated browser smoke | 9 | **Success** | 22:01:22–22:01:56 | **2 Chromium tests passed (8.4s)**: an authenticated session rendered protected landing/projects surfaces; the same protected route redirected an unauthenticated visitor to login. |
| Run the WO-06 governed golden journey | 10 | **Success** | 22:01:56–22:02:24 | **1 Chromium test passed (11.0s)** for persisted evidence, review, provenance and governed draft export. Logs show denied pre-review DOCX export (403), reviewer assignment/decision persistence, and approved export (200). |

All four required steps actually executed and passed; **none was skipped**. The completed job logs were retrieved after completion; no results from older runs were attributed to this SHA.

Artifact upload step 11 also completed success. Artifact **11647670468**, `tier5-browser-smoke-artifacts`, was created **22:02:26 UTC**, is not expired at verification, and is **96,033 bytes**. Its workflow metadata identifies run 37996641034, branch concept2cure-v2, and the same full SHA. The workflow configures upload of the smoke evidence paths and `ana-bootstrap.log`; the archive contents were not separately inspected.

### Scope and limitations

This is a real Chromium/live application/fresh PostgreSQL workflow with development authentication. It is evidence for the four named checks, not complete IND qualification or overall release clearance.

- Fresh installation classified one historical overlay file as superseded/skipped: `0008_critical_fk_delete_policies.sql`; the guarded replacement `db/migrations/20260730_fk_delete_policies_port.sql` applied before the overlay. This is distinct from the four executed workflow steps, none of which was skipped.
- The smoke runtime uses the PostgreSQL owner/single-role posture. Installer logs require a separate non-owner runtime role and `RLS_ENFORCE=on` for production tenant enforcement; this browser pass does not establish production tenant isolation.
- The browser recipe subsequently logged **372/372 deployment migration files applied**. The fresh installer itself states that the out-of-band deployment set is applied separately.
- Startup logs record unavailable Redis/AnA AI provider, a non-production audit-HMAC fallback, and ClamAV skipped in the non-production environment. Auto-embedding logged provider authentication failures. The passing browser workflow therefore does not establish configured live AI service, operational dependencies, virus scanning, or production audit-chain assurance.

## Wider CI snapshot — not cleared

[CI run 37996641066](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37996641066), exact same SHA/branch/attempt, remains **in progress** with no final run conclusion at the read captured **2026-10-09T22:16:32Z**. Pending work is not reported as passing.

| Job | Job ID | Observed result/status |
| --- | ---: | --- |
| Security Contract Tests | 114044298307 | **Success**, completed 22:01:01 UTC. Logs: security contract step 5 **483 tests/50 files passed**; MCP issuer-binding step 6 **2 passed, 0 failed, 0 skipped**. |
| Security Scan | 114044298588 | **Success**, completed 22:01:24 UTC. Dependency gate reviewed **3 Critical/High advisory occurrences**; dependency-risk/Handlebars selftests **36 passed, 0 failed, 0 skipped**. This is reviewed-risk evidence, not zero-vulnerability evidence. |
| Secret scan (full history) | 114044298663 | **Success**, completed 22:02:02 UTC. Logs: **9,935 commits**, about **593.90 MB**, no leaks found under the configured scan; separate warning records **3 history credentials still listed as live in `.gitleaksignore` (P0-17)**. Passing does not prove revocation. |
| Lint | 114044298539 | **In progress**, with **five completed failed steps** below. ESLint step 123 succeeded; step 124 `Render ESLint findings (failure only)` was active, begun 22:15:40 UTC. |
| Nightly Governance Strict | 114044300978 | **Skipped**. |
| AnA Readiness Tests | Not created yet | **No result**; still awaiting Lint dependency. |
| Test / wider new IND suites | Not created yet | **No result**; still awaiting Lint dependency. New IND remote suite results must be inspected separately from the named AnA readiness job. |

Completed Lint failures observed directly from job steps:

| Step | Number | Start–finish UTC | Result |
| --- | ---: | --- | --- |
| Proof tier — schema contracts + golden journeys + export contracts | 33 | 22:01:05–22:11:48 | **Failure** |
| No hand-rolled error-envelope reads | 51 | 22:12:06–22:12:06 | **Failure** |
| Every in-scope AnA tool reads from its register entry | 58 | 22:12:39–22:12:42 | **Failure** |
| Tenant-isolation in raw SQL | 74 | 22:12:53–22:12:54 | **Failure** |
| requestDb (RLS) adoption | 84 | 22:12:57–22:12:57 | **Failure** |

Lint step 122, `Upload governance audit artifacts`, was **skipped** at 22:13:30 UTC. Detailed failed tests/files and guard causes are not yet available because the active job's log download has returned `BlobNotFound`; no cause or count is inferred. The named AnA/Test jobs have `!cancelled()` conditions in the exact-head workflow and may still execute after failed Lint, but their outcomes are pending.

**Current conclusion:** all four Tier 5 checks are passed on the identified implementation SHA. Wider CI clearance is blocked by actual failures and pending target jobs. Complete IND qualification and broader release clearance remain open.

## Subsequent CI observation — Lint complete, causes available

The original implementation's **Lint job 114044298539 completed failure at 22:21:39 UTC**. Its completed logs are now available and were retrieved. This supersedes the earlier snapshot's unavailable-cause statement; the timestamped earlier snapshot is retained as observed history.

| Failed step | Confirmed completed-log cause |
| --- | --- |
| 33 — proof tier | Suite setup failed in `tests/schema-contract/biopharma-programs-router-columns.contract.test.ts` with PostgreSQL/PGlite error **42701**, duplicate `sponsor_address`. The logged fixture's `CREATE TABLE regulatory_programs` repeats both `sponsor_address` and `ind_type`. Totals: **1 failed / 120 passed files (121)**, **1,366 passed / 6 skipped tests (1,372)**. All six skipped tests belong to the suite whose setup failed; they are not voluntary integration skips. |
| 51 — error-envelope reads | **1 new** hand-rolled read: `concept2cure/components/ana/anaTurnTimeline.ts:214`, rule label `typeof-error-string`. |
| 58 — AnA tool/register enforcement selftest | **17/20 cases behaved**. The real-tree case failed with `review_sop_requirements` missing its `present` block; deliberately mutated controls that delete `search_project_documents` presentation or label model-using `convene_drafting_council` as engine also failed their expected assertions; these are not additional actual production-tree findings. |
| 74 — raw-SQL tenant isolation | **1 new finding above baseline 8**: `server/services/vault/document-chunking-backfill.service.ts#db0501f26bbf:document_chunks`. |
| 84 — requestDb/RLS adoption | **2 new shared-pool routes above baseline 228**: `server/routes/ana-ri/runs.ts` and `server/routes/submissions.ts`. |

Lint's full-project TypeScript step **127 succeeded with 0 errors and `tsc exit 0` at 22:21:34 UTC**; beta-slice TypeScript step **128 succeeded**. These successful compiler checks do not clear the failed guards/proof suite. The Lint job's actual skipped steps are **122** (governance audit artifact upload) and **255** (post-Setup Node.js).

At the subsequent read **2026-10-09T22:22:50Z**, downstream target jobs had been created despite failed Lint, both starting **22:21:41 UTC**:

- **AnA Readiness Tests job 114051449968**: in progress; no completed suite outcome at the subsequent read.
- **Test job 114051450050**: in progress; no completed wider/new IND suite outcome at the subsequent read.

This update remains attributed only to `b4badf56fbe9038490bae860dc41f812bd966c27`. It does not verify the later local test-only follow-up or turn the original CI run green. Complete IND qualification and broader release clearance remain open.

## Completed named AnA readiness result

[AnA Readiness Tests job 114051449968](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37996641066/job/114051449968) completed **success at 22:23:10 UTC**, after running 22:21:41–22:23:10 UTC. Metadata and checkout logs identify the exact implementation SHA `b4badf56fbe9038490bae860dc41f812bd966c27`.

Step **5**, `Run AnA readiness suite`, executed **22:22:49–22:23:08 UTC** and completed success. Its completed logs report **303 tests passed in 4 files**, duration **17.86s**, with no failed or skipped tests reported:

| Executed readiness file | Passed tests |
| --- | ---: |
| `server/services/__tests__/ana-ri.test.ts` | 256 |
| `tests/resolution/ana-orchestrator.test.ts` | 22 |
| `tests/routes/ana-ri-health.test.ts` | 7 |
| `tests/routes/ana-gap-analysis.test.ts` | 18 |

This is the named AnA readiness selection. **It does not run the new IND drafting/qualification suites.** The broader **Test job 114051450050** had no completed suite outcome available at this update. The successful readiness result does not clear the failed Lint proof/guard checks, complete IND qualification, or overall release clearance.

## Additional completed wider CI outcomes

The following outcomes are from the same original CI run and implementation SHA:

| Job | Job ID | Actual completed outcome and scope |
| --- | ---: | --- |
| Blank DB Provisioning + Deploy Migration | 114051450055 | **Failure**. Step **18**, `what a tenant purge cannot reach`, failed; completed logs at **22:23:56 UTC** name the new org-keyed table `stats_computation_runs` as unreachable by tenant purge. Post-Setup Node.js step **34** was skipped. |
| Production Boot Smoke | 114051450066 | **Success**. Logs show `app_service` superuser and bypass-RLS flags both false, and **`/readyz` 200 after 8s at 22:23:52 UTC**. The readiness body explicitly uses deterministic fixed AnA responses, leaves capabilityRegistry pending, and skips Redis/worker. This is boot/runtime-role evidence, not live-model, full-dependency or complete tenant-isolation qualification. |
| Production Image Boot | 114051450095 | **Success**. Steps **3–7** passed: provisioning/production image build, empty TLS PostgreSQL provisioning, **`/readyz` 200 after 9s at 22:27:39 UTC**, login 200 with authenticator requirement, MFA verification 200/access token, and `/auth/me` 200 (`image sign-in: OK`). Failure-only container-log step **8** was skipped. Readiness still reports deterministic AnA, capabilityRegistry pending, and Redis/worker skipped; this proves the named image boot/authentication checks without live-model or full-dependency qualification. |

Integration Tests job **114051449982** remains in progress, but its step **10**, `Run real-database tests (unmocked pg, RLS_ENFORCE=on)`, has actually completed **failure** (observed **22:29:24 UTC**). Later integration step **12** was active; completed-job logs and the failed step's causes/counts were not yet available, so none is inferred.

Broader Test job **114051450050** and Coverage were still active at this update; **no completed test-suite outcome is attributed to them yet**. Overall CI clearance remains blocked by actual Lint, tenant-purge and real-database-test failures.

“New” in guard results refers to each guard’s committed baseline; it does not attribute the reported sites to this implementation.
