# 07 — Integration: real-database tests that trailed deliberate product changes

**Gate:** `ci.yml` → Integration (`vitest.db.config.ts`), red on every push run since 2026-09-23.
**Row:** MR-02 Stage 1 (trunk green). **Date:** 2026-10-22.

## What already exists

Nothing was built. Every failure was a test written against behaviour that a later,
deliberate product commit changed; the product code is correct and unchanged. Each test
was brought to the current contract — no assertion loosened, no refusal mocked, no
timeout raised. Where a contract got stricter (drafting title, wave3 seal coverage) the
assertion got stricter with it.

## Method

Provisioned database (`concept2cure-ri_dbtest`, pgvector 0.6.0) under the CI
environment: `RLS_ENFORCE=on`, the `app_service` runtime role, `CI=true`. Each file was
run alone at HEAD (red) and after its change (green). Red/green logs for the HMAC group:
the session scratchpad `red/` and `green/` directories.

## Causes → files (red → green)

| Product change | Files | Red | Green |
|---|---|---|---|
| `loadDoc` FOR UPDATE now selects `program_id` (`e1f3fd425`) — lock-wait observer pattern | protocol-finalization-concurrency | 1 failed / 25 | 25/25 |
| Company letterhead is the last read before PDF render (`68b3dd627`) — observer sentinel | report-pack-export | 3 failed / 8 | 8/8 |
| IRB/IACUC/IBC acts require `determinationDate` (`e2d1ba5f9`) | domain-sign-ceremony | 10 failed / 53 | 53/53 |
| Passage hit carried as `context.text` sliced by `hitWithinText` (`1700adc10`) | vault-passage-search, -keyless, vault-chunking-off | 3 failed | 20/20 |
| Complaint requires `patient_harm` + `severity_assessment` (`8303a7c17`); CAPA writes need a project anchor | capa-governed-transactions, request-parent-boundary, child-table-parent-scoped-rls.cases | 6/12, beforeAll threw, 1/16 | 12/12, 7/7, 16/16 |
| `executeWorkflow` takes the request origin (`fd3147750`) | cross-object-resolver | 2 failed / 9 | 9/9 |
| Launch catalog P-36 / P-32 (Submission Readiness is a verdict, not an app) | entitlement-grants-resolution, signup-launch-catalog | 2 failed / 73 | 73/73 |
| Audit HMAC keys must be ≥ 32 chars; seal coverage reported | submission-digest-access, tenant-source-read-receipt-retention, tmf-assessment-audit-outcomes, adoption-commit-outcome, wave3-critical-history, notification-request-binding | 1 failed each | 11, 6, 11, 4, 17, 19 |
| Tenant purge requires an identified platform scope on the runtime pool (`9c266724f`) | tenant-purge-artifact-records | 1 failed / 3 | 3/3 |
| Drafting title split as `drug - indication` (`1fac924b2`) | drafting-tasks-tenant-scope | 1 failed / 7 | 7/7 |
| A failed lineage write is a named server failure, text withheld (`c1a5c8153`) | content-audit-consumers | 1 failed / 20 | 20/20 |
| Background sweeps filter by tenant lifecycle, cached per org (`31755b90c`) | scheduler-jobs-under-rls | 5 failed / 13 | 13/13 |

Together with `06-jit-off-runtime-pool.md` (the evidence-search timeouts) and the three
files in commit `769d8e096`, every file in the Integration failure list is green locally.
The CI run on the pushed head is the confirming evidence.
