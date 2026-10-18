# D2 Data Room processing recovery contract

14 October 2026. Control-tower approved local implementation slice on `concept2cure-v2`, baseline `87b27c897c5d1be20b0527009bcaf425ebbf3af6`. Scope: the existing capture-processing service, its callers, current status projections and a bounded operator wrapper. This moves D2 source integrity/readability/recovery. It does not close D2's staging/release evidence or introduce a new ingestion store, queue, index, product surface or scientific approval.

## Invariants

1. A committed capture remains pending/recoverable until its derived write commits. Successful in-memory extraction, storage or capture is not successful persisted text processing.
2. Processing admits only the current, undeleted, same-organization client_document and its recorded original upload, live project/workspace and data/binary/lineage eligibility. Both original SHA-256 values must be independently valid and agree with the exact bytes. Source/upload IDs, original path association and nullable scope are checked, never guessed or rebound to a duplicate upload.
3. Claim, completion and failure-state writes are attempt-token fenced. Lease expiry/takeover, supersession, disposition, original identity/scope change or project deletion prevents the old attempt from committing or erasing newer completed work.
4. Derived text/catalog/provenance fields and completed state commit together. Readable completion requires nonblank persisted text; failed extraction is a named failed outcome even when recording the failure succeeds.
5. Retry status is durable where the database permits. When persistence or failure journaling is unavailable, pending state or an expired lease is the recovery signal; logging is not a guarantee of durable failure recording.
6. Retry is bounded and idempotent. Healthy same-identity readable captures are not recreated. A same-byte upload/adopt may repair unfinished current processing, without replacing original provenance or minting a second capture/audit event.

## Core API and state

Preserve `processCapturedSource(orgId, sourceId, input, opts?)` and current input fields. Add optional `preExtracted`, `expectedWorkspaceId` and full database injection for tests. Do not make callers supply/repoint the canonical original upload ID. The core reloads the source and its original upload and uses the canonical verified loader. A private Buffer snapshot is taken before hashing or any async work.

`ExtractedCapture` may add byte-binding fields `sourceSha256` and `extractionRevision: 'capture-extraction:v1'`. The real `extractCapture` stamps these from its private bytes. Reuse a pre-extracted result only with matching binding/revision and valid readable/failure shape; a missing or mismatched binding is not trusted. No model or browser attestation creates this binding.

```ts
type SourceProcessingStatus =
  | 'completed' | 'already_complete' | 'extraction_failed'
  | 'retryable_failure' | 'blocked' | 'stale_source'
  | 'busy' | 'retry_not_due' | 'retry_exhausted';

type SourceProcessingResult = {
  ok: boolean;          // true only for completed/already_complete readable state
  processed: boolean;   // same durable readable-completion meaning
  status: SourceProcessingStatus;
  reasonCode?: string;  // stable safe code; no raw private path/provider error
  extracted?: ExtractedCapture;
};
```

An expired/stale token uses `stale_source` with a distinct attempt-stale/lease-expired reason; the attempt result never overwrites a newer source's status. Unexpected import/processor rejection after an entry caller's capture COMMIT returns a truthful `retryable_failure`/PROCESSING_UNAVAILABLE outcome, while preserving the committed captured/adopted/edit receipt. Pre-COMMIT admission/capture/audit errors retain their rollback/error behavior.

Metadata key: `dataRoomProcessing`, schema version 1, stage `derived_capture`, processor revision `data-room-processing:v1`. It records exact original digest/upload/path/program/workspace binding; running/completed/failed/blocked state; UUID attempt token, monotonic attempt count; claimed/lease/retry/completed timestamps; retryability and safe reason. Merge only this key and the existing intended derived provenance/catalog fields; preserve capture identity, unrelated metadata, declared version/facts and original actor/audit history.

DB-time lease: 15 minutes. Automatic retries: at most 3 attempts with 1-minute then 5-minute backoff for retryable failures. Explicit `retryFailed` allows a further attempt per selected source without resetting history or bypassing identity/disposition. Extraction failure is not automatically retried forever. Future/malformed state is blocked, not laundered into a fresh zero-attempt record. A healthy legacy extracted/nonblank record may be reported already_complete without fabricating a new processing history. A legacy extracted/null/blank row remains a repair candidate.

The low-level writer requires a valid claimed binding; unguarded writes cannot create successful processing. Entry callers migrate from direct recordSourceProcessing to orchestration. A supplied query-only executor may support dry-run selection; apply must use an explicit full transactional database or the canonical pool, never select through one fixture and write through another global database.

## Transaction and eligibility discipline

Use short READ COMMITTED claim/final/failure transactions. For a program capture: BEGIN → existing disposition program advisory lock → source/upload ROW EXCLUSIVE table reservations → fresh live-project/source/upload admission and required row locks. Reserve impact tables before reading dispositions; never invert the existing withdrawal lock order. Organization-wide withdrawal from another program must serialize with the same source/upload reservations. Hold live project rows as required so deletion cannot pass between admission and commit.

Original bytes are loaded/verified and extraction runs outside long-held transactions. Recheck currentness, exact original identity/association, nullable scope with null-safe comparisons, original upload eligibility, recorded lineage, attempt token and unexpired lease at commit. Use the database's actual acceptance clock (`clock_timestamp()`), not a transaction-start timestamp surviving a lock wait. Completion and failure/renewal writes both respect the same token fence. Source supersession has its own row update, so program locks alone are insufficient.

Admit only a recorded original still available for binary use. Retained extracted data may remain readable after keep_data, but processing does not reopen the withdrawn original or silently substitute a new duplicate blob. Wrong caller bytes or stale work must not poison healthy newer committed text/state.

Successful recovery clears obsolete extraction-error prose. PostgreSQL updates the existing Data Room full-text expression index with the derived-text write; there is no separate asynchronous Data Room indexing stage. Vault passage/embedding backfill remains its own canonical service.

## Sweep and operator contract

Extend the existing bounded sweep. Default dry-run; limit is a strict positive safe integer from 1 to 500. Optional exact source and explicit retryFailed are validated before I/O. Ordinary candidates exclude superseded/deleted/withdrawn/ineligible sources and include pending/unattempted, legacy extracted-but-missing-text, due retryable failures below the bound and expired claims.

Permanently blocked, busy/not-due and exhausted rows must not consume runnable slots ahead of newer pending work. Report bounded diagnostic samples/counts separately, so an empty runnable set is not described as all processed. Exact-source selection can explain stale/blocked/busy rather than silently returning an empty success. Malformed timestamps/metadata must not crash the entire sweep or become immediately due by coercion.

Preserve examined/processed/unreadable/dryRun compatibility fields; add completed/failed/blocked/skipped and per-source status/reason items, with separate diagnostic counts. processed/completed count only committed readable completions, never persisted extraction failures. Report scope/caps explicitly; no claim that a limited run inspected the entire tenant.

Core-owned `processPendingSourcesForTenant` resolves the numeric organization's UUID through the existing audited system lookup, then enters canonical tenant scope and respects tenant access/lifecycle posture. Apply requires allowed background work; dry-run may inspect read-only posture but cannot write/claim/load files/extract. Unknown/denied tenant posture is a refusal.

CLI owner adds `scripts/process-data-room-captures.mjs` and focused tests, reusing that wrapper. Strict decimal `--org`, optional `--source`, `--limit 1..500`, `--retry-failed`, `--apply`; reject duplicate/unknown args before DB imports. Default report-only. No scheduler or actual customer repair is authorized by this code slice. Distinct usage/fatal/unresolved/clean outcomes and safe source IDs/reason codes; no raw filenames/private paths or provider errors in operator output.

## Entry results and current views

Upload retains top-level attachment availability status; add Data Room processing/readability separately. Newly created captures are pending until the derived stage commits. Duplicate current checksum paths invoke the same safe processing orchestration where needed; they preserve original source/upload identity. Adoption and spreadsheet saves preserve capture/audit/edit transactions and committed receipts when later processing fails. Conversation-only files stay outside CRE processing.

Integration addendum: after an acknowledged capture COMMIT or duplicate-path ROLLBACK, adoption and spreadsheet callers release their owned transaction client before awaiting the processor's separate short transactions. Release is exactly once; pre-commit or ambiguous-commit failures retain the existing rollback and byte-retention behavior. This prevents a saturated connection pool from retaining all capture connections while every processor waits for another.

The existing paged source read gains an actual nonblank persisted-text flag and a sanitized processing summary. Never derive text availability from extractionStatus, words, character count or metadata alone. Keep data availability/currentness separate from binary availability. Superseded sources remain historical and do not supply current grounding; retained eligible text can remain usable when its original is unavailable.

Project Home/editor share status and grounding helpers; Vault reuses its existing readState projection. The summary whitelists approved state/reason/retry timing, not whole private metadata or raw extraction errors. Missing legacy availability without actual loaded text remains unknown, not guessed readable. Unknown/future processing metadata does not promote completion. A stale attempt response cannot regress newer authoritative readable state. A retry-needed label does not promise a scheduled worker. Existing refresh rereads status; it does not imply repair.

Read-side addendum: an optional sanitized `leaseExpired` flag may report a valid running lease against the source SELECT's database clock. It is an observation used for the existing retry-needed label, never browser-time authority to claim work. Persisted text availability remains independent of this timing observation.

## Adjacent withdrawal freshness addendum

The authorized genuine PostgreSQL fixture reproduced a withdrawal confirmation recording pre-recovery impact after waiting for recovery's program lock: the write transaction's SERIALIZABLE snapshot was established by authorization before the wait. This is a synthetic local finding, not a demonstrated customer incident.

Authorize the race-fixture owner to make a narrow correction in `document-data-disposition/service.ts` and a canonical service regression fixture. Confirmation writes use READ COMMITTED, preserve existing program/impact/disposition lock order, reserve the additionally read `authoring_export_history` table in SHARE mode, and reauthorize after reservations while holding the exact owned live program row FOR SHARE. The impact hash, blocker, reason, activation, append-only and chained-audit controls remain mandatory. Read-only previews retain REPEATABLE READ. Recovery-first confirmation must see fresh impact and refuse an obsolete preview with STALE_PREVIEW; a refreshed authorized confirmation can succeed with the current count.

Narrow the existing comment that claims every contributing store is locked: audit-history archival has a separate authorized path. No global audit or program table lock is added. This does not qualify concurrent cold-history archival, deployed roles or all unrelated governance workflows. Preserve the failed race, rerun genuine connections and relevant existing canonical disposition tests, and independently review the final change before reporting green.

Final held-out review addendum: the lead temporarily owns the sweep/store helpers and canonical recovery fixture to close reproduced selector/parser coherence and same-token identity mutations. SQL timestamps must round-trip to the canonical UTC representation rather than accept PostgreSQL's normalized hour/leap-second inputs; failed stages require a nonnull approved reason. Malformed states stay diagnostic and cannot consume runnable slots. Finalization verifies the current stage identity as well as the source/upload identity and token. Preserve the four independent reds, promote them to canonical cases, rerun independent cases, and requalify genuine PostgreSQL source hashes after the store change.

## Ownership and sequencing

- Core owner internal_data_management: canonical processor and narrowly needed same-subsystem helpers, core/state SQL tests and existing DB processing test. No entry-route, CLI or client edits.
- Caller owner filing_code_audit: chat upload/durability tests, adoption processing branch/tests in projects.ts, derived upload service/tests. Own projects.ts first; explicitly hand it back before the read-side owner edits its nonoverlapping source projection. No production admission bypass to make incomplete test fixtures pass.
- Read owner ana_code_audit: source search/adapted types, source DTO/projection only after the projects.ts handoff, existing Vault readState and Project Home/editor helpers/tests. A small shared pure status/summary module is permitted; no duplicate processing admission/state authority.
- CLI owner internal_data_management/d2_recovery_cli: operator script/argument runner and focused tests, consuming the core tenant wrapper. No duplicated candidate SQL or repair writes.
- Lead: AnA spreadsheet result wording only, evidence/status/report/bundle, final integration review; preserve prior D2 integrity and D7 files.
- Independent reviewers: state/lock/identity adversaries and caller fixture review. No overlapping implementation. All work stays on the canonical branch; no new deps, schema or external calls.

## Proof and release limits

Observe the five existing failures against the old processor before changes, then promote them into canonical green fixtures. Add original/duplicate route post-capture failures, mismatched bytes/source/upload hashes/path/scope, blocked/missing/corrupt original, private Buffer mutation, nonblank completion/FTS, expiration/takeover/late success/late failure, supersession/disposition/ancestor change, bounded retries/diagnostics, dry-run no-load/no-write and truthful status/grounding cases.

Use actual service SQL and selected real capture/FTS/disposition migrations in embedded PGlite for sequential state behavior, plus real entry route/service and rendered view fixtures. Actual independent PostgreSQL connections are required before claiming production multi-instance race or tenant-role/RLS qualification. Existing gated DB tests are extended but cannot be called passed if their disposable endpoint is unavailable. Record exact commands, runtime, schema/role posture, baseline fixture failures, scoped type/lint results and limitations.

This slice does not run a live backlog repair, activate a scheduler, reapprove scientific facts, qualify a statistical method or transmit an agency filing. Complete local evidence is reviewable; deployment and broader launch acceptance remain separate.
