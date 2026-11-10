# AnA consolidation: preserve the acceptance gate's review disposition

Repository: `concept2cure/ClinicalSageAI-2-replit`  
Branch: `concept2cure-v2`  
Baseline: `d83cc1f586e690bf7834ce9d8327c154105e6022`  
Plan: F1; launch row D2 repair evidence, not closure.  
Completes: `server/services/memory-consolidation-job.ts`.

## What already exists

- `server/services/memory-consolidation-job.ts`: existing tenant-scoped conversation-summary promotion, acceptance call, embedding, transaction/duplicate guard and counters. This is the only production file changed.
- `server/services/ana-ri/memory-acceptance.ts`: the canonical accepted/rejected/pending_review decision, human-review flag, lexical contradiction check and confidence score. It is unchanged and executes in 12 of this batch's behavioral cases.
- `server/services/client-intelligence-memory.ts` and `server/services/intelligence/project-intelligence-service.ts`: existing active-status project-memory readers found through connected search. No recall filter is relaxed.
- `tests/services/ana/memory-consolidation-outcomes.test.cjs`: the prior 32-case job suite, extended in place, not replaced by a second implementation.
- `server/services/__tests__/memory-consolidation.pglite.integration.test.ts` and `tests/db/scheduler-jobs-under-rls.dbtest.ts`: existing SQL and RLS/scheduler suites. Expectations that encoded automatic activation of unvalidated summaries are corrected; two PGlite cases are added.
- `server/db/withTenantConnection` and `server/db/scheduledOnce.ts`: existing tenant scopes and scheduler lease, unchanged.

Connected reads covered the current branch, job, gate, coordination record and ledger; searches covered pending_review, projectMemoryEntries.status and memoriesConsolidated. No hold on the production path appeared in the inspected coordination record. Full original files were verified against their Git blob hashes before changes. Container Git access failed on DNS, and Vitest, PGlite and pg were not installed. The full checkout, deleted-history audit and native dependency runtime were unavailable; this is not a successful history audit.

## Reproduced defect and repair

The caller checked rejection, then used only has_contradiction to choose between pending_review and active. It therefore activated noncontradictory candidates even when the real gate returned pending_review and human_review_required=true. The prior reporting repair documented but deliberately did not change that gap.

The caller now retains every explicit pending_review decision. Active storage requires an accepted decision, an explicit false human-review flag and an explicit false contradiction flag. Review-required or incompletely cleared flags remain pending; an unavailable acceptance disposition fails the attempt before embedding or writes. Rejection still prevents storage. The existing quarantined counter now covers every stored review-required entry, not just contradictions.

**Operational consequence:** the current job declares conversation summaries unvalidated. Under the unchanged scoring, even all six populated fields plus a KNOWN label cannot reach automatic acceptance. Non-rejected summaries are therefore durably stored pending review rather than silently activated. This does not erase conversations, change the separate working-memory path, grant a human verification, or change any confidence threshold. Authorized review/release and its user-interface reachability still need acceptance testing; this patch does not create or certify that workflow.

Content, source marker, organization/project attribution, confidence and embedding behavior are preserved. The stale-row scan and insertSummaryOnce transaction/duplicate guard are byte-for-byte unchanged. Retrying an already stored pending summary still uses the existing marker guard. A failed write is not counted as successful quarantine; failed commit acknowledgement remains unconfirmed. No historical active records are modified, reviewed, reclassified or backfilled.

No new production file, service, route, tool, database table, model, license grant or document-specific workflow is introduced. This is the one shared AnA consolidation job for all project types.

## Executed verification

The same 52-case Node suite executed the complete baseline and repaired job:

| Implementation | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Baseline | 37 | 15 | 0 |
| Repaired | 52 | 0 | 0 |

The existing 32 cases remain, with the one test that preserved the known pending-review bypass corrected to require quarantine. Twenty cases were added: twelve execute the unchanged production gate and job together, and eight exercise controlled disposition combinations. Actual source modules are transpiled and executed, not copied into substitutes. Database responses, tenant scopes, transaction acknowledgements, scheduler, embedding and logging remain controlled collaborators. These results do not execute SQL, RLS, locks, a provider or a browser.

Cases cover raw/structured summaries, all six fields with KNOWN labels, genuine and false-positive contradictions, rejection/duplicates, conflicting flags, absent dispositions, embedding/write/commit failures and mixed-tenant scheduling. The real gate's returned content and confidence are compared to the stored values.

Production and both modified TypeScript test files transpiled without syntax diagnostics. The Node test runner passed its syntax check. These are not whole-repository semantic typechecks. The updated PGlite/RLS suites and two new PGlite cases were NOT executed. Full build, pre-push gates, native integration, hosted chat and authorized review/release acceptance remain open.

`execution.json` records all baseline/repaired file identities and runtime/log hashes. `case-results.tsv` records each outcome. `raw-results.tar.xz` holds actual before/after TAP logs and syntax/dependency results, not CI output.

## Reproduction and publication

```sh
node --test tests/services/ana/memory-consolidation-outcomes.test.cjs
C2C_CONSOLIDATION_SOURCE_ROOT=/path/to/baseline node --test tests/services/ana/memory-consolidation-outcomes.test.cjs
npx vitest run server/services/__tests__/memory-consolidation.pglite.integration.test.ts
```

The baseline snapshot needs both production modules. The Node suite uses installed TypeScript; C2C_TS_PATH can select an existing installation. No dependency was installed and no database was connected. Run the existing PostgreSQL/RLS scheduler suite with the repository's configured database-test harness, not against a production database.

Publish against the current tree using an expected-head, non-force update of concept2cure-v2, verify the changed-file set, then read back the remote ref and source. Direct connector writes do not execute local pre-push hooks. No PR, alternate branch, reset, migration or backfill. Rollback is an ordinary revert. This receipt alone does not prove publication.
