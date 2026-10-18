# D2 processing recovery: preparation and reproducible failure evidence

Prepared 2026-10-14 against `concept2cure-v2` HEAD `87b27c897c5d1be20b0527009bcaf425ebbf3af6`. This is a study and proposed bounded contract, not an implementation or deployment. Only this evidence package was added for this continuation; its original reproduction ran from scratch files. The earlier D2 storage integrity implementation remains a separate slice. D7 implementation is owned by the lead session.

The immediate repair is to make a committed Data Room capture recoverable until its derived text/catalog write actually commits, and to bind that write to the exact current, eligible captured bytes. Extend the existing Data Room processing service and sweep; do not build another ingestion/index store.

## Executable reproduction

Files:

- [Probe](processing-recovery.probe.mts)
- [Isolated config](processing-recovery.vitest.config.mjs)
- [Observed red evidence](01-red-and-controls.txt)
- [Normal test collection exclusion](02-normal-collection.txt)

Opt-in command, from the repository root with the locked dependencies installed and Node 22:

```bash
NODE_OPTIONS='--max-old-space-size=4096' node node_modules/vitest/vitest.mjs run --config docs/evidence/D2-PROCESSING-RECOVERY-STUDY/2026-10-14/processing-recovery.vitest.config.mjs
```

Observed portable result: **5 proposed contract assertions failed, 3 controls passed**, in 2.38 seconds, matching the original scratch reproduction. These red cases deliberately assert the desired repair against unchanged production processing functions. They are outside the normal repository test collection. The probe is deliberately named `.probe.mts`, not `.test.ts`, and only the adjacent dedicated configuration includes it. **Expected process exit: 1**, because five assertions remain intentionally red. Do not add this config to routine CI or treat its nonzero exit as a newly introduced production regression. The config owns a unique OS temporary cache directory and removes it on process exit; PGlite is in memory and is closed in `afterAll`. The actual run left zero new owned cache directories.

Normal collection verification returned `[]` and exited 0:

```bash
node node_modules/vitest/vitest.mjs list --config vitest.config.ts docs/evidence/D2-PROCESSING-RECOVERY-STUDY/2026-10-14/processing-recovery.probe.mts --json
```

The probe executes the actual `recordSourceProcessing`, `processCapturedSource`, and `processPendingSources`, with their real SQL on in-memory PGlite. It applies the real Vault FTS, Data Room text/GIN, and capture immutability migrations. Only extraction, profiling, filing classification, upload loading, logging, and the shared DB import are mocked. Persistence uses a pg-compatible adapter over embedded PostgreSQL, with one injected write exception. There are no external DB/cloud/model/embedding calls. The upload capture row is a fixture representing the actual route's committed state; the full HTTP upload route is not executed.

| Proposed assertion | Actual current behavior |
|---|---|
| A capture marked extracted whose derived UPDATE failed remains a recovery candidate | Row stays `extracted` with `extracted_text = NULL`; body-only search is false; sweep reports `examined: 0`. |
| Supplied bytes must match the captured source digest before deriving text | Shared processor returns `ok: true` and stores different-document text while the original checksum remains unchanged. This is an internal helper contract gap, not a demonstrated public exploit. |
| A source superseded during processing refuses the stale derived commit | Actual UPDATE returns true on `is_current = false`; the real immutability trigger allows the derived write. |
| Current-source recovery excludes superseded pending rows | Sweep reports `examined: 1` for an otherwise eligible pending fixture with `is_current = false`. |
| Failed extraction is reported as failed rather than readable completion | Sweep reports `processed: 1`, `unreadable: []` while the persisted row says `failed` and has no text. Today `ok` means persistence succeeded, so this last case is an outcome/reporting contract issue. |

Passing controls prove that a genuinely pending row is selected; successful derived persistence makes the body searchable and removes it from the retry set; foreign organization/deleted rows cannot be updated; and an initially pending intake survives the shared processor's persistence exception and remains retryable. No locator/provider is reached by the dry-run controls.

## Exact failure boundary and canonical callers

1. **Chat / Data Room upload:** [upload.ts:505](../../../../server/routes/chat/upload.ts#L505) sets `extractionStatus` from the in-memory extraction *before* creating the capture. `createSource` does not insert extracted text ([evidence-spine.service.ts:197](../../../../server/services/clinical-regulatory-evidence/evidence-spine.service.ts#L197)). The later [derived write at upload.ts:554](../../../../server/routes/chat/upload.ts#L554) catches/logs an exception; it also does not inspect the writer's false return. The capture stands with a success status and no text. Upload still returns `status: ready`, `dataRoom.recorded: true` ([upload.ts:629](../../../../server/routes/chat/upload.ts#L629)). Those fields describe successful storage/capture, but do not reveal failed derived persistence.
2. **Same-bytes upload retry:** [upload.ts:422](../../../../server/routes/chat/upload.ts#L422) resolves the existing checksum/project identity and skips the describe/derived-write block. It can write a separate retrieval atom afterward, but does not repair the capture's text. Re-upload is not a reliable recovery trigger.
3. **Adoption:** creates a pending capture inside the capture/audit transaction, commits, then calls the shared processor ([projects.ts:1616](../../../../server/routes/c2c/projects.ts#L1616), [projects.ts:1627](../../../../server/routes/c2c/projects.ts#L1627)). This correctly survives derived-write exceptions as pending. The route returns `processed` from `done.ok`, which currently means the derived outcome was written, even when that outcome is failed extraction. A duplicate adopt [returns early at projects.ts:1603](../../../../server/routes/c2c/projects.ts#L1603) and does not retry processing.
4. **Derived spreadsheet:** similarly commits pending capture/provenance/audit first, then calls the shared processor, but discards the processing result ([uploaded-file-access.ts:543](../../../../server/services/ana/uploaded-file-access.ts#L543), [uploaded-file-access.ts:563](../../../../server/services/ana/uploaded-file-access.ts#L563)). `captured` remains accurate; readability is not exposed by that result.
5. **Shared processor:** [data-room-processing.ts:213](../../../../server/services/clinical-regulatory-evidence/data-room-processing.ts#L213) accepts arbitrary supplied bytes/program context without reading the source identity or checking the source checksum. Its UPDATE [at line 198](../../../../server/services/clinical-regulatory-evidence/data-room-processing.ts#L198) checks organization, type, id, and deletion only. It has no current-source, exact file association, digest, disposition, or attempt-generation condition.
6. **Sweep:** [data-room-processing.ts:246](../../../../server/services/clinical-regulatory-evidence/data-room-processing.ts#L246) selects only pending rows. It is bounded, oldest-first and dry-run by default, but lacks a production caller/CLI/scheduler in the checked `server/` and `scripts/` code. `opts.exec` injects only the candidate SELECT; the apply path's shared processing writes still use global `pool`. That should be made explicit/full for repair tests, not mistaken for complete injection.

The verified upload loader is useful but not sufficient as the stage identity contract: [uploaded-file-access.ts:294](../../../../server/services/ana/uploaded-file-access.ts#L294) compares bytes with **the upload row's digest**, allows missing digest as `integrity: unverifiable`, and does not bind bytes to the captured source's checksum. Source checksum/path/scope are protected once set; provenance file association remains derived JSON, not protected by the [capture guard's frozen field list](../../../../migrations/20261001_cre_evidence_sources_capture_immutability.sql#L76). Recovery therefore must compare the actual bytes to the capture digest independently and recheck the exact file association at commit.

## The stages that really exist; recovery already present

**Data Room capture → one derived processing UPDATE → PostgreSQL FTS.** The derived UPDATE writes extraction status, text, counts, version declaration and catalog facts together. The GIN index is an expression over that row's text ([20261008c_data_room_source_text.sql:69](../../../../migrations/20261008c_data_room_source_text.sql#L69)); PostgreSQL maintains it in the same transaction. The positive probe demonstrates this. There is no independent Data Room FTS worker or asynchronous index-completion status to invent or repair.

**Upload retrieval prefix atom / embedding:** a separate best-effort upload stage in [upload-retrieval-atom.ts:146](../../../../server/services/chat-uploads/upload-retrieval-atom.ts#L146). It holds a measured 16,000-character prefix and uses organization/source-id `NOT EXISTS` idempotency. This is not a full-document passage index. The existing embedding backfill cannot reconstruct an atom that was never written, and its current [scripts/embed-atoms.ts:36](../../../../scripts/embed-atoms.ts#L36) scans the entire corpus without an organization parameter. Do not call it from this repair or claim it is a tenant-safe Data Room recovery tool. `scripts/cre/generate-atoms.ts` covers CRE-native/CSR atoms, not these client-document upload prefixes.

**Vault catalog/storage/chunks:** existing recovery is canonical for *filed Vault documents*:

- [document-chunking-backfill.service.ts:147](../../../../server/services/vault/document-chunking-backfill.service.ts#L147) and [backfill-vault-chunks.mjs](../../../../scripts/backfill-vault-chunks.mjs) already expose bounded per-tenant dry-run/apply and explicit retry-failed, with named skipped/failed outcomes. They use existing chunk writers and catalog chunk status; no second chunk stack is justified.
- [backfillVaultChunksForTenant:252](../../../../server/services/vault/document-chunking-backfill.service.ts#L252) resolves the organization's UUID under audited system scope, refuses missing tenant identity, then runs in the proper tenant scope. Use the same `tenantStore` mechanism for the Data Room wrapper; do not run unscoped and report an RLS-empty corpus as completion.
- `scripts/backfill-vault-storage.mjs` repairs Vault storage handoff, not capture text. A Vault document with no extracted text is explicitly skipped by the chunk sweep ([line 189](../../../../server/services/vault/document-chunking-backfill.service.ts#L189)); chunking cannot repair extraction.

This slice should repair Data Room derived persistence only. It must report that Vault filing/passage coverage and prefix/vector readiness are separate; neither counts as complete because Data Room processing succeeded.

## Proposed bounded contract for the next implementation

### Identity, admission, and final commit

- One stage called `derived_capture`, implemented only in the existing service. Stable identity: `(organizationId, sourceId, originalSha256, originalStorageRef, fileUploadId, clientProgramId, clientWorkspaceId, processorRevision)`. The source row id/checksum identifies the captured revision; the document's declared `version` is not an attempt id or byte identity.
- Read the exact owned `client_document` row before extraction. Require nondeleted, current (`is_current IS NOT FALSE` for existing null compatibility), valid 64-hex original SHA, correct scope, and existing shared data/binary/recorded-lineage eligibility. Historical/superseded/withdrawn sources are named skips, not silently reprocessed. This is current-source recovery; historical rereading requires an explicit separate contract.
- Use the canonical upload loader for stored bytes, preserve its tenancy/path/disposition checks, and compare `computeSha256(bytes)` against the captured source checksum. Missing/malformed expected identity, missing bytes and mismatches are named blocked outcomes. Do not populate a missing capture digest from bytes during repair, and do not substitute an unrelated/current upload.
- Before final UPDATE, reacquire admission in the existing disposition lock order (program serialization and relevant tables, then exact row) and recheck source/currentness/scope/digest/file association/eligibility. Match the captured expectation and attempt token in the UPDATE. A zero-row match is `stale_source`/`stale_attempt`, never success. Do not hold a DB transaction across OCR/classification.
- Use the shared eligibility predicates from `document-data-disposition/eligibility.ts`; binary availability and data use are distinct. Program/read admission is also required for any eventual interactive retry route. This preparation proposes an operator CLI only, so it adds no public retry endpoint.

### Durability, retries, and idempotency

- New upload captures start `pending` until the derived UPDATE commits, including when extraction already happened in memory. Reuse that extraction without a second OCR call. Alternatively, an atomic capture-plus-derived transaction can satisfy the same invariant, but changing three capture writers broadly is less bounded.
- Keep existing status enum/capture identity intact. A small processing record under existing metadata can hold `processorRevision`, `state`, `attemptId`, attempt count, claimed/lease-expiry/next-retry/completed timestamps, original digest and a sanitized error code. No queue, store or dependency is needed. Publish this exact JSON contract before implementation; stage records must not overwrite other catalog/disposition metadata.
- Claim an attempt atomically, with a lease and compare-and-set on its token. Two workers cannot both own it. A lost worker becomes retryable after lease expiry; an old worker cannot commit over a newer claim. Successful commit writes derived fields **and** success state together. A retry of that exact completed digest/revision is a no-op, not a second source, atom, capture or approval. Preserve declared version and existing COALESCE fact semantics.
- Candidate set: pending/unattempted rows; expired claims; retryable persistence failures when due; legacy `extracted` rows with missing/blank persisted text. Do not sweep every healthy legacy row merely because it has no new stage record. Extraction failures and integrity/missing-file blockers remain visible and require explicit targeted/`--retry-failed` action rather than infinite automatic OCR retries. Bound normal retries (proposed 3 attempts with backoff); report exhausted/blocked rows.
- If the DB is unavailable, recording an error is inherently impossible. A committed pending capture/expired lease is the durable recovery signal; logs supplement it. Never claim that every persistence error was durably recorded. When storage is available, write a named failure outcome without marking the stage complete. Clear the old extraction error on later success; today's provenance merge can retain an earlier `extractionError` when a successful retry has none.
- The derived writer should return a structured outcome (`completed`, `extraction_failed`, `retryable_failure`, `blocked`, `stale_source`, `already_complete`), while preserving existing booleans only with documented meaning during migration. Sweep counters split examined/attempted/completed/failed/blocked/skipped; `completed` requires real persisted nonblank text. An extraction-failure outcome persisted successfully is not readable completion.
- Same-checksum upload and duplicate-adopt paths should invoke the same *ensure-processing* function when the resolved current source has unfinished processing. No duplicate capture or alternate writer; no implicit retry of withdrawn/superseded sources.

### Failure visibility and triggerability

- Add one bounded operator wrapper/CLI around the existing sweep, e.g. `scripts/process-data-room-captures.mjs --org <positive integer> [--source <id>] [--limit 1..500] [--retry-failed] [--apply]`. Dry run is default, spends nothing, writes nothing, and names the selected source ids plus stage/reason. Strictly reject invalid numbers; an empty due set is distinguished from blocked/exhausted/out-of-scope rows.
- Resolve tenant id/UUID and enter the existing audited tenant scope as the Vault backfill does. Keep default apply off; do not add a scheduler in this slice. The operator can first inspect the repair report, then apply within the already authorized operational scope. Capture/supersession audit records are preserved; processing outcomes are system-derived activity, never a new user approval or scientific qualification.
- Expose processing outcome in the existing upload/adopt/derived-save results and Data Room status projection, distinguishing captured/readable/retry-needed. Do not mislabel an error as empty or a successful captured blob as fully indexed. Durable status must come from committed processing, not only in-memory extraction words.
- Audit a processing completion with its exact original digest/source/attempt/revision using the existing audit seam if that is part of the approved contract. If required, commit it with the derived outcome. Do not claim audit durability from a best-effort logging hook.

## Acceptance evidence for the later slice

Promote these opt-in failure cases into canonical tests with approved contracts, then prove red→green. Add original upload-route persistence failure and zero-row-return cases; same-checksum retry; duplicate adopt retry; spreadsheet capture failure visibility; exact source/upload hash and scope mismatch; missing/malformed digest; disposition/supersession after claim; second worker claim/expired lease/stale token; bounded due retry and permanently blocked report; invalid CLI tenant/limit; no provider calls on dry run; successful rerun no-op; stale error cleared; valid FTS body search. Run the existing upload durability and real DB Data Room processing tests too.

The existing pending-sweep DB test uses a synthetic non-SHA source checksum ([tests/db/data-room-processing.dbtest.ts:199](../../../../tests/db/data-room-processing.dbtest.ts#L199)); replace that fixture with its real byte digest when enforcing the source-binding contract. It currently proves upload integrity and text persistence, not canonical source digest binding.

Verification limits: embedded PGlite proves SQL/trigger behavior on a minimal schema and sequential state changes, not deployed role/RLS configuration, independent-connection races, actual OCR or provider behavior, operator authorization, or live backlog size. The proposed claim/lease/disposition lock ordering needs real PostgreSQL multi-connection DB tests before a concurrency claim. No repair was run on client data; the five red assertions remain intentionally unfixed in this preparation.

## Subsequent D2 continuation, 14 October 2026

The bounded [processing-recovery implementation](../../D2-PROCESSING-RECOVERY/2026-10-14/README.md) is now locally verified: 532 focused tests, 21 independent checks and 13 genuine PostgreSQL cases pass. The preparation and its recorded red probe above remain historical evidence against the pinned baseline; they are not the current regression suite and should not be rerun against changed processing code to reproduce the old results. No live client backlog was repaired, and D7 provider/package/agency qualification remains separate.
