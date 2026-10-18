# D2 processing recovery: independent contract and race review

Prepared 2026-10-14. Read-only review of application code and the original opt-in five-red-case probe. No implementation, recovery run, external API, provider call, new dependency, branch, or migration was performed for this review. D7 evidence is unchanged. The source manifest beside this document records the files inspected; implementation acceptance is still prospective.

## Conclusion

The existing `cre_evidence_sources.metadata` field can hold a bounded, versioned `derived_capture` stage. A new queue or table is unnecessary for this slice. The contract must provide exact original-byte binding, short transactions that follow existing disposition lock order, and attempt-token fencing on **all** attempt writes. A persisted extraction failure is not readable completion. PostgreSQL must prove the locking and multi-worker behavior; the existing embedded probe does not establish those claims.

The five original red assertions remain useful: missing-text uploads escape the pending sweep; supplied bytes are not bound to source checksum; a retired source accepts derived data; the sweep selects a retired pending source; failed extraction is counted as processed. Their three controls establish limited organization/deletion filtering, pending selection, and same-row text/FTS persistence. The probe executes real production service SQL against PGlite and three actual migrations, while mocking extraction, upload loading, classification, and profiling. Its minimal fixture contains neither uploads nor dispositions. Reviewing its recorded five-red/three-control result is not an independent rerun of those tests.

## Admission and original identity

Use the exact source row as authority for organization, program/workspace, source type, checksum and original storage reference; caller-supplied program, filename or MIME is not authority. Require the owned `client_document`, nondeleted, current (`is_current IS NOT FALSE` preserves current legacy semantics), eligible data and original binary, and a valid SHA-256. Read the source's exact recorded upload association; do not substitute a file found by equal checksum.

Bind the SHA-256 of a private byte snapshot independently to both the source checksum and selected upload checksum. The existing `loadUploadedFile` validates against the upload row but permits a missing digest as `integrity: 'unverifiable'`; that is insufficient for this processing contract. The current source checksum is never repaired from the newly read bytes. Missing/malformed digest, original bytes, or association is a named blocked outcome. A duplicate caller's correct bytes must not mask missing or corrupt recorded original storage.

Compare an authoritative nonnull `stored_artifact_ref` with the selected upload path. If legacy null references are supported, state that explicitly and bind the actual upload path in the attempt without filling the capture's missing identity. Preserve path traversal/tenant checks from the canonical loader. Snapshot the Buffer privately before asynchronous work so a caller cannot change its contents after the digest check. Pre-extracted text may be reused only through a trusted internal extraction result bound to that same digest and extractor revision; an arbitrary string is not verified extraction.

Final admission must compare every expected identity field using null-safe equality: organization/id/type, digest, program/workspace, original reference, recorded file id, selected upload organization/path/digest, and any filename/MIME used to choose extraction behavior. The capture guard allows NULL-to-value initialization of write-once fields; assuming these fields can never change is incorrect. Provenance and metadata are mutable, including `provenance.fileUploadId`. Bind the relevant recorded ancestry fields as well, and execute the shared current lineage/data/binary eligibility predicates at final acceptance. Do not invent ancestry from equal bytes.

A verified snapshot establishes which bytes produced the derived result. It does not prove that the physical file can never change afterward. If future original access fails its digest check, report original availability separately from previously retained derived data.

## Lock order and the acceptance transaction

The existing adopt and derived-workbook writers already establish this order:

1. Begin a transaction and establish the verified tenant context.
2. Take `lockDocumentDispositionProgram` when a program exists. Its advisory key normalizes program UUID case; preserve that helper.
3. Reserve `public.cre_evidence_sources, public.file_uploads` explicitly in `ROW EXCLUSIVE MODE`, in that order, before eligible identity reads or row locks.
4. Lock/read the exact source and upload rows, recheck admission, then perform the conditional attempt write and commit.

Disposition apply takes the same program advisory lock, then all impact tables in `SHARE MODE`, then `document_data_dispositions` in `SHARE ROW EXCLUSIVE MODE`. Source/upload reservations conflict with its impact locks. This matters because upload withdrawal eligibility is organization-wide and a different program can withdraw the same upload/hash. A program advisory lock alone is insufficient; `SELECT ... FOR UPDATE` alone takes a compatible table-level lock and does not reserve against that cross-program decision. Taking a dispositions-table lock first would invert the established order. Null-program recovery still needs the table reservation.

Mirror this order for claim and final completion, and for any processing-metadata failure/renewal transaction that performs admission. Do not hold the transaction across file reads, OCR, classification, or profiling. Use bounded lock/statement timeouts and roll back a failed transaction before retrying. Acquire a real transaction client: `BEGIN` issued through a general pool's separate `query` calls does not establish one connection. The existing injected `exec` only covers sweep selection; full processing tests need the same transactional dependency seam for claim, finalization and failure writes.

Use a fresh current snapshot for admission after any lock wait. Default `READ COMMITTED` with eligibility read after the reservations provides this; stronger isolation requires explicit serialization retry and proof that a pre-lock snapshot cannot accept a newly withdrawn source. Do not assume an earlier pre-read is final authorization. Read-only dry-run observations do not reserve state and may become stale before apply.

Ordinary `createSupersedingSource` does not take the program advisory lock. Its predecessor update takes a source row lock. Therefore the exact currentness/identity condition must be retained in the final source update even with disposition serialization. If processing accepts first and supersession follows, that is a valid ordering; if supersession commits first, processing must refuse the stale result. No recovery path may resurrect `is_current = FALSE`.

## Lease, fencing, and retry semantics

A suggested metadata shape is a versioned object containing stage schema version, processor revision, state, immutable claimed identity, random attempt token, monotonically increasing safe-integer attempt count, and DB-time claimed/lease/next-due/completed timestamps. Include sanitized error code and enough bounded diagnostic detail to explain failure. Pin processor revision in implementation, rather than accepting it from public callers. Do not store extracted text or raw document content twice in the stage.

Parse that object defensively. Unknown schema versions, invalid state transitions, malformed timestamps/tokens or attempt counts are diagnosed and refused; they must not become a fresh attempt with count zero. Missing legacy stage is a supported distinct case. A metadata complete flag alone is insufficient: same digest/revision and coherent actual nonblank persisted text are required. Healthy legacy rows can be reported already readable without manufacturing attempt history.

Claim is one conditional transaction: no valid current lease, eligible state, due time and remaining budget, exact current identity; then install a new token and increment the existing count. Two contenders may both discover a candidate but only one can claim it. A lease expiry permits a replacement attempt. Every completion, retry/failure write, cancellation and renewal must match the currently owned token. The old worker's late catch must not clear the replacement's text, mark it failed, reset its count or replace its stage.

Use DB time for lease decisions. A transaction-start `NOW()` can become stale while waiting on locks; a wall-clock check at the conditional acceptance statement is safer. State the acceptance point precisely: the lease must be valid at the fenced acceptance update, rather than promising a timestamp invariant at a later network-observed commit. Expired workers are refused even before a replacement claims. Renewal, if implemented, must be conditional, bounded in total duration and must not revive an expired token. Otherwise a fixed lease is acceptable with honest duplicate-computation limits.

The proposed 15-minute lease, three automatic attempts and one-/five-minute backoff are reasonable bounded defaults pending document-duration evidence. Explicit retry-failed may permit one additional attempt per selected source without resetting total attempts or bypassing integrity/currentness/withdrawal admission. Do not retry permanently unreadable files indefinitely. Separate runnable due selection from bounded diagnostics for blocked/not-due/exhausted rows; otherwise old blockers can consume the entire limit and starve newer work.

This guarantees at most one accepted derived completion for a current attempt identity; it does not guarantee exactly one OCR execution. A crashed or expired worker can overlap with a replacement outside the DB. Cancellation fences future acceptance but does not prove a third-party extractor stopped immediately. A commit whose response is lost is resolved by reading the durable stage and text for that identity, not by creating another capture or approval.

## Atomic completion and truthful outputs

Commit nonblank extracted text, status/counts/time, permitted version/fact fields, processing provenance, and complete stage together. PostgreSQL's existing expression FTS index follows the same row update transaction; it has no independent Data Room worker to mark complete. A completion audit, if the root contract requires one, must use the existing audit seam in the same transaction. A best-effort log does not establish durable audit.

Update the processing nested metadata key against the current row and preserve unrelated concurrent metadata. Successful retry removes the prior `extractionError` explicitly; the present top-level JSON merge can retain it. Preserve captured checksum/scope/capturer and declared-version/COALESCE fact semantics. Automatic recovery does not reprocess healthy rows. If targeted reprocessing of healthy rows is later supported, failed attempts should preserve the last accepted derived data and clearly mark the unsuccessful newer attempt; do not erase good text merely because a replacement extractor returned empty.

Use explicit outcomes such as completed, already-complete, extraction-failed, retryable-persistence-failure, blocked, stale-source and stale-attempt. `processed`/`ok` compatibility booleans must have published semantics: writing a failure row is not readable completion. Split examined, attempted, completed, failed, blocked and skipped counters. A zero-row acceptance update is not success. Capture, readability, original availability, Vault filing, passage coverage and vector readiness remain separate states.

If the DB fails, a failure-state write can also fail. Preserve the committed pending capture or claim lease as the durable recovery signal and report the uncertainty. Do not promise a durable journal for every outage. The service must return a bounded failure instead of claiming completion from an in-memory extraction result.

## Independent adversarial acceptance sequences

These are prospective fixtures, not claims that the unchanged application has passed them. “No mutation” below means no accepted derived-text/fact/complete-state mutation by the refused attempt; owned fenced diagnostic writes may be permitted by the published contract.

| Case | Controlled sequence | Required observation | Evidence lane |
| --- | --- | --- | --- |
| 1. Competing claims | A and B discover one pending source; pause both before claim and release together. | Exactly one current token, one count increment; loser does no OCR. | Real PostgreSQL, two connections. |
| 2. Expiry and stale completion | A claims, pauses outside transaction; expire its lease; B claims and completes; release A's good result. | A reports stale attempt; B text/stage/count remain intact. | Sequential PGlite state injection plus real PostgreSQL interleaving. |
| 3. Late failure laundering | Repeat case 2, but A throws in extraction/profile/persistence catch after B completes. | A's failure write is fenced and cannot replace B or reintroduce extraction error. | Embedded functional test plus real PostgreSQL. |
| 4. Expired token without B | Expire A; release result with no replacement attempt. | No acceptance under expired ownership; source remains eligible for bounded reclaim. | Embedded DB-time fixture. |
| 5. Supersession in flight | A claims/reads; another connection retires source and creates successor; release A. | Predecessor derived result refused, successor untouched; no resurrection. | Real PostgreSQL, actual supersession service. |
| 6. Same-program withdrawal | A pauses after byte snapshot; apply keep-data, remove-data or supersede through actual disposition service; release A. | No new original-based processing accepted after withdrawal; keep-data retains previously accepted data. | Real PostgreSQL, actual disposition/audit seam. |
| 7. Cross-program withdrawal | Source is in P1; disposition in P2 withdraws the same upload/hash; pause finalization around table reservation. | Valid serial ordering or bounded refusal, never a successful post-withdrawal result; no lock inversion. | Real PostgreSQL, at least two independent sessions. |
| 8. Null-program withdrawal | Repeat cross-program case for a captured source with null program. | Source/upload reservation still protects organization-wide availability. | Real PostgreSQL. |
| 9. Mutable association | A claims file F; modify source's recorded file id, upload path/digest/name/MIME, or null scope/reference before finalization. | Exact final comparison refuses the changed identity. Equal bytes do not substitute a recorded edge. | Embedded identity matrix; real PostgreSQL row wait. |
| 10. Source/upload digest split | Upload digest matches bytes but source differs; source matches but upload digest absent/malformed/different; private input Buffer changed by caller. | Blocked before derivation; no completion. Byte snapshot used consistently. | Functional/embedded matrix with actual SHA-256. |
| 11. Correct duplicate input, bad original | Duplicate caller provides matching correct bytes; stored original is missing/corrupt or withdrawn. | Canonical storage/admission failure remains blocked; supplied bytes do not heal it. | Real filesystem loader fixture plus embedded service. |
| 12. Completion write outage | Capture commits pending; extraction succeeds; final write fails; optional failure write also fails; retry after availability returns. | Capture remains, no false complete; pending/expired lease is due; one later accepted completion and real body FTS. | Embedded injected DB seam, then real PostgreSQL transaction rollback. |
| 13. Lost commit reply | Persist completion and throw a transport-style error before returning; retry exact same identity. | Read durable completion; already-complete/no extra capture, attempt reset, OCR or approval. | Transaction seam with authoritative post-commit read. |
| 14. Partial/malformed stage | Seed complete-with-null-text, invalid/future schema, invalid token/date/count, live lease with impossible state, and healthy legacy nonblank text. | Coherent repairable case handled explicitly; invalid stage diagnosed; no budget reset or fabricated completed history. | Embedded parser/state matrix. |
| 15. Candidate starvation and tenant isolation | Put >limit blockers/not-due/exhausted rows before runnable pending rows; add foreign-org rows and invalid tenant UUID/limits; dry run. | Bounded due work remains selectable; diagnostics bounded; no foreign writes, provider/file extraction or stage mutation on dry run. | Embedded selection; real role/RLS and CLI integration. |
| 16. Atomic failure classification | Empty extraction is persisted as failed; successful retry follows; fail required completion audit, if enabled. | Failure never increments completed; successful retry clears stale error; audit failure rolls back derived+complete state. | Embedded transaction plus actual audit integration. |

## Fixture and release evidence

Expand the minimal embedded fixture with source workspace/original-reference fields, `file_uploads`, the existing disposition schema/predicates, and recorded-ancestry audit shape. Use true SHA-256 for both source and upload and actual canonical paths; the current real-DB pending fixture uses `pending-${fileId}`, which must change when exact source digest binding is enforced. Apply actual capture guard and FTS migrations. Retain the original five red cases, but update their approved expectations only after the contract is published.

Real PostgreSQL fixtures need unique per-run organizations/programs/source/upload identities, owned temporary files and cleanup restricted to those identities. Use independent transaction clients with explicit barriers rather than timing sleeps. Assert runtime role, tenant context, RLS enforcement, actual server identity and query execution; owner fixture provisioning alone does not establish deployed-role behavior. Exercise the full disposition service and its audit/preview freshness, including cross-program lock order. Never run these races against client production data.

Release evidence should separate: parser/selection/token-state tests; the five-red-to-green regression; original upload/duplicate-adopt/derived-save caller reporting; actual stored-byte integrity and body FTS; real PostgreSQL concurrent claims/stale attempt/supersession/withdrawal tests; and CLI dry-run/tenant/limit/failure reporting. Record exact source hashes, commands, Node/PostgreSQL versions, result counts and assumptions. Green PGlite tests alone qualify sequential SQL and trigger behavior, not connection races, deployed RLS, actual OCR quality, provider behavior, live backlog size, or a production concurrency guarantee.

## Sources inspected

- `server/services/clinical-regulatory-evidence/data-room-processing.ts` (shared extractor/writer/sweep, especially lines 170–287).
- `server/services/clinical-regulatory-evidence/evidence-spine.service.ts` (supersession at 78, creation at 125, checksum lookup at 403).
- `server/services/ana/uploaded-file-access.ts` (canonical loader at 238, derived-write transaction around 490–568).
- `server/routes/c2c/projects.ts` (adopt reservation around 1588–1597 and duplicate early return).
- `server/routes/chat/upload.ts` (checksum reuse at 422, early extracted status at 505, derived write at 556, capture response at 632).
- `server/services/document-data-disposition/{program-lock,service,eligibility,recorded-lineage}.ts` (existing lock order and shared admission semantics).
- `migrations/20261001_cre_evidence_sources_capture_immutability.sql` and `migrations/20261008c_data_room_source_text.sql`.
- `docs/evidence/D2-PROCESSING-RECOVERY-STUDY/2026-10-14/{README.md,processing-recovery.probe.mts}`.
- `tests/db/data-room-processing.dbtest.ts`, `tests/setup.db.ts`, and the tenant-scoped Vault chunk backfill seam.
