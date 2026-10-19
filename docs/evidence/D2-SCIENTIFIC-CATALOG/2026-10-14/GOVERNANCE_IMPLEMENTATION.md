# Existing catalog write integrity

14 October 2026, local `concept2cure-v2`, baseline HEAD `87b27c897c5d1be20b0527009bcaf425ebbf3af6`. Implements the published `CONTRACT.md` governance boundary only. No typed fact persistence, migration, dependency, provider call, deployment, commit or push.

The existing suggestion writer now snapshots input privately before asynchronous connection acquisition, checks the current persisted actor role and canonical private-project policy on its transaction connection, locks the exact current source, and compares its original-byte/catalog identity and exact stored-text SHA-256 against the text checked before embedding. Legacy key-data values are checked again against that locked text. Withdrawal, a live successor, changed tenant/project, removed original, changed extraction or an absent/failed extraction refuses the write.

Both canonical writers use READ COMMITTED, the existing program-disposition advisory key, then catalog ROW EXCLUSIVE and Vault documents SHARE reservations. Fresh membership/user/organization, live program, project and policy rows are held through the short write; canonical project admission is re-evaluated after obtaining the parent/policy fences. Global document SHARE is an initial contention tradeoff, not a scalability benchmark. Acceptance timestamps use `clock_timestamp()` so a transaction's earlier start time after a lock wait is not reused as the new catalog revision.

Suggestion/review UPDATEs require exactly one RETURNING receipt with exact source identity and record revision before their chained audit commits. Zero affected rows and admission/privilege/persistence errors never become a successful plain-vector fallback. The savepoint fallback covers specifically missing embedding-column/vector-type or unsupported vector operations; other SQL failures propagate and roll back. Chained audit failure also rolls back the catalog mutation.

Human confirmation/correction remains a whole-catalog-record decision. The optional shown-text digest refuses a changed extraction; older clients without it retain their existing revision decision and are audited with `extractionBindingShown:false`. Audit details record source/text/key-data hashes and explicit `legacy_value_presence` / context-not-recorded / scientific-unassessed scope. No human decision or typed approval is fabricated.

The catalog read now admits the current session actor through canonical project policy in a read-only snapshot. Exact recorded document tenant ownership is required in SQL and in the result guard. Historical human attribution remains visible with source-current-use status and a legacy check-scope disclaimer. Retained `keep_data` text is distinct from original-file availability; catalog editing requires the eligible original.

## Owned files and interfaces

- `server/services/vault/document-catalog-governance.service.ts`: required suggestion `expectedExtractedTextSha256`, optional review field of the same name, exact source/receipt/audit integration, `CatalogRecordView` scope and current-use projection.
- `server/services/vault/document-catalog-admission.ts`: shared same-executor actor/membership/private-project admission; preview consumes `{write:true,hold:false}` without DML or row-update locks.
- `server/services/vault/document-catalog-write-integrity.ts`: canonical source fencing/currentness/eligibility/digest and UPDATE receipt helpers.
- `server/services/vault/__tests__/catalog-governance-integrity.test.ts`: sequential admission/SQL orchestration, mutation/snapshot, zero-row/vector/audit and historical-view cases.
- `server/services/vault/__tests__/catalog-write-result.test.ts`: existing completion fixture updated for the strengthened canonical admission and persistence receipt.

Frozen read fields are `extractedTextSha256:string|null`, `checkScope:{kind:'legacy_value_presence',context:'not_recorded',scientificQualification:'unassessed'}`, and `currentUse:{eligible:boolean,reasonCode:string|null,originalFileAvailable:boolean}`. A retained current source may be data-eligible while `SOURCE_ORIGINAL_UNAVAILABLE` prevents editing. Historical `state` never changes into typed-fact acceptance.

## Recorded verification and limits

- `01-governance-red.txt`: initial failure-first 23 cases, **20 failed and 3 controls passed** against the preceding implementation. The failures demonstrated missing final admission/extraction/source fencing, false zero-row success, broad vector fallback and missing historical check-scope/current-use disclosures. These are sequential mock reproductions, not production incident claims.
- `02-governance-green.txt`: final **32 passed across 2 files** under Node 22.23.3. Four follow-on negatives/control cases were added for the independently reviewed recorded-tenant read boundary, canonical private-project denial, private input snapshot and backward-compatible whole-header review.
- `03-governance-lint.txt`: selected five owned files, **zero errors/warnings**.
- `04-governance-types.txt`: selected five owned roots plus imported/ambient dependencies; **zero selected-scope diagnostics**. This is not a whole-repository typecheck.

These fixtures mock the canonical project admission seam and audit seal persistence; they verify the writer/helper orchestration and fresh membership check, not runtime RLS, production grants, actual SQL row locking or parallel-session concurrency. Genuine PostgreSQL SQL/concurrency/role evidence is owned by the independent review worker and must be assessed separately before those stronger claims. Domain scientific qualification and prototype deployment are outside this governance increment.
