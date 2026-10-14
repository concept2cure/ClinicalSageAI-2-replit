# D2 durable exact-source host-admission receipts

14 October 2026. W1/D2 continuation on `concept2cure-v2`, baseline `87b27c897c5d1be20b0527009bcaf425ebbf3af6`. Preserve the completed local increments and their frozen evidence. The lead approves this bounded interface before six implementation/review owners work concurrently. No branch/worktree, dependency, model, provider, public tool/surface, client database operation, deployment, commit or push is included.

## Outcome and boundary

Add one durable, immutable, integer-tenant metadata ledger for exact Vault text admitted unchanged by the existing host budget. Existing offset reads adapt their exact single window to a bounded range manifest. A strict V2 descriptor can represent several disjoint UTF-16 ranges, but this increment does not introduce a new retrieval strategy, whole-document delivery, table/page anchors or authoring/save/export range support. Stored hashes/coordinates can later detect changed extraction; they cannot reconstruct erased source text.

The only checkpoint is `host_budget_admitted`. It records exact source/actor/range/payload identity at a host-controlled admission point. It is not gateway invocation, provider delivery/service, model comprehension, scientific validation, document review or regulatory acceptance. Gateway IDs and turn timeline fields are not promoted into receipts. This is provider-independent data provenance: no API-calling SDK/gateway/host invocation implementation is changed or executed. Future dispatch/replay checkpoints need their own contract.

The new writer path is gated by `ANA_DURABLE_SOURCE_READ_RECEIPTS=1`, off by default. No existing legacy row is backfilled, reinterpreted or rewritten. Existing legacy coverage and governed catalog/preview gates retain their meaning. Scientific preview stays off. Existing source-access guards and same-round refusal withdrawal remain effective.

## Immutable V2 contract

The pure shared DTO `SourceAdmissionReceiptV2` has exactly these server-owned fields:

- `version:2`, `receiptId:string` (server-generated UUID), `checkpoint:'host_budget_admitted'`.
- `organizationId:number`, `actorId:number`, `admittedRole:string` (fresh persisted role), `programId:string`, `documentId:string`.
- `originalSha256:string`, `extractionSha256:string`, `totalChars:number`.
- `ranges:readonly {start:number,end:number,sha256:string}[]`: one to eight sorted, nonoverlapping, nonempty safe-integer UTF-16 ranges bounded by actual text length; each digest is computed from the exact stored slice. Adjacent ranges remain separate; no synthesized joins or fabricated offsets.
- `payloadSha256:string`: hash of the exact unchanged handler string accepted by the host budget, not a provider-adapted/redacted payload.
- `toolUseId:string|null`, `threadId:string|null`: bounded reported serving context, not extra source authority or authenticated conversation proof.

Identity integers are positive int32, UUIDs and SHA256 are validated/canonicalized, role/context are bounded, and unknown/sparse/malformed fields refuse. Take private primitive/range copies before any await; freeze returned values. The fingerprint is canonical over the immutable descriptor (including receipt ID), excluding database acceptance time. Do not store quoted source text, filenames, dossier content, user prompts or model output.

An actual deferred single-window read gains a server-only admission ID and tool-use context synchronously when it is deferred. Repeat verification/writing preserves that ID. IDs are not taken from model/body/result metadata. Direct legacy writer tests and flag-off callers remain compatible. For a V2 write, missing server admission identity refuses; it must not fabricate a new identity on each retry.

## Storage and idempotency

One table: `public.ana_source_read_receipts`. It has `id uuid` PK; `organization_id integer NOT NULL`; `receipt_version smallint` fixed 2; `checkpoint text` fixed host-budget admission; `actor_user_id integer`; `admitted_role text`; `program_id uuid`; `document_id uuid`; `original_sha256 char(64)`; `extraction_sha256 char(64)`; `total_chars integer`; `ranges jsonb`; `payload_sha256 char(64)`; `tool_use_id text NULL`; `thread_id text NULL`; `receipt_sha256 char(64)`; and server `accepted_at timestamptz DEFAULT clock_timestamp()`. The schema owner may choose equivalent SQL types without changing field meanings and must notify peers before doing so.

No FK/cascade from a source, user, programme or project may erase or rewrite this historical metadata when source content changes. Exact tenancy is stamped and verified through canonical admission. Normal UPDATE/DELETE/TRUNCATE refuse in the database, including ordinary owner/runtime tests. Privileged schema administrators are outside an append-only runtime guarantee. The migration is replay-safe with existing populated records and registered before the final two tenant sweeps; no DROP of retained tables/columns or fabricated old hashes.

`appendSourceAdmissionReceipt(q,descriptor)` validates the DTO/fingerprint, INSERTs with a stable ID, verifies exactly one actual returned row, and returns `{receiptId,outcome:'recorded'|'already_recorded'}` only after exact persisted identity agrees. An idempotent retry may reuse an identical row, never UPDATE it. A reused ID with changed actor/source/ranges/payload/fingerprint refuses; inaccessible/foreign conflicts expose no row. Zero/ambiguous/mismatched RETURNING or uncertain COMMIT does not earn an acknowledged new count. Concurrency proof includes two-session identical retry and mismatched retry.

## Existing read settlement integration

The integration owner preserves `writeGuardedLegacyReadReceipt` and its flag-off behavior. Introduce one canonical selected writer for existing settlement. When the durable flag is off, it performs only the previous legacy path. When on, it reuses current source/admission/locking checks and exact unchanged payload validation, constructs the V2 descriptor from actual stored text and fresh role, and appends V2 inside a short transaction. No locks span a provider await.

Viewer/custom read authority must not become governed-write authority. An ordinary legacy receipt INSERT denial must not prevent a valid durable read-admission record: isolate the optional legacy INSERT in a savepoint, and tolerate only the narrowly classified legacy permission refusal. Unexpected legacy integrity/transport errors remain unconfirmed/fail closed. Existing legacy history may remain absent; it must not be counted or described as written. An acknowledged V2 write counts only after real COMMIT; idempotent success is distinguishable from a new row. Do not merge V2 rows into old catalog `getReadCoverage` or full-read/approval gates.

Preserve cancellation before admission/INSERT/COMMIT, current actor/source/extraction checks and locally observed source-refusal classification. A later typed refusal stops subsequent writes and withdraws pending Vault reads in that round through the current callback. Earlier real commits remain history; no receipt outcome falsely asserts rollback. Unknown persistence outcomes are not source-delivery proof. The selected path emits no provider call and requires no new credentials.

The integration owner freezes the added private deferred DTO fields with the shared owner before edits. Root owns any small default-writer selector block if ownership otherwise overlaps. No changes to API SDK adapters, AI gateway, two hosts, model selection or provider invocation are needed here.

## Actor-aware history

`listSourceAdmissionReceiptsForActor(input,{documentId?,receiptId?,limit?})` composes the existing canonical read-scope wrapper. Input is server `{organizationId,userId,projectId?,projectRef?,requestedProgramId?}`. Only the actor's own history in current accessible uniquely anchored programmes is returned; explicit invalid identifiers cannot broaden scope. Apply actor/programme/document/ID filters before SQL count/window/rank/LIMIT. Re-admit scope after queries; unexpected SQL/identity/policy state is unavailable, not an empty authorized page. Stored descriptor fingerprint/shape is checked before projection.

Return `{receipts,total,withheld,actorFiltered:true,checkpoint:'host_budget_admitted',sourceUse:'historical_admission_only',providerDelivery:'unestablished',notice}`. Historical metadata survives source removal and is not a new source read, current-use permission or whole-text/expert coverage. Receipt reads do not expose another actor's thread/tool context. No new public endpoint/tool/panel is added. RLS proves tenant isolation; precise actor/private-project admission is separately enforced and tested in the application facade. Do not claim deployed all-table RLS/privacy qualification.

## Export, purge and legal holds

Classify this metadata as tenant-owned customer data, exported by the existing complete tenant export and erased through the existing governed tenant offboarding flow. Append-only does not mean permanent retention. Register the table in the canonical purge list/door and relevant runtime-role privilege list. A missing table/door must be handled according to the canonical optional-schema rules without a false successful erasure count.

The schema owner installs `public.purge_tenant_source_read_receipts(integer) RETURNS TABLE(receipts integer)` through the existing narrow NOLOGIN/NOBYPASSRLS record-purger role pattern. The function is not executable by PUBLIC. Require the platform purge scope, positive target, persisted `pending_deletion` status and no active tenant legal hold; use explicit short reservations so a hold/status change cannot race the delete. Preserve the outer final-export receipt/retention/reason/audit preconditions and atomic offboarding behavior. Resolve/prove compatible lock order against the receipt writer and existing Vault purge path; no organization FOR UPDATE/source SHARE inversion. No user table name or bypass flag is accepted as purge authority.

For a purge participating in the new ledger, the final tenant-status UPDATE must acknowledge the expected row before audit/COMMIT. A zero or unconfirmed status result rolls back receipt/source erasure. Do not infer successful status transition merely from a successful DELETE or audit call; this narrow safeguard need not change absent-ledger legacy behavior.

Source removal keeps only receipt hashes/coordinates/context metadata, no text body. Tenant purge removes that metadata after the existing export/hold/retention controls. Evidence distinguishes synthetic tenant-table FORCE RLS/runtime proofs, application sharing checks and actual installed-role/whole-offboarding proof.

## Ownership

- source_access_prep: shared V2 DTO/fingerprint/immutable validation module and pure adversarial controls. No writer/store/schema/host/lifecycle edits.
- source_receipts_prep: new receipt migration, new narrow Drizzle declaration and schema/migration replay/immutability controls. Purge door SQL coordinated with lifecycle owner. No existing receipt integration or migration-list edits.
- source_catalog: new append/read ledger helpers, actor history facade, storage/idempotency/projection tests. No shared DTO, existing read helper, migrations, hosts or lifecycle edits.
- source_tools: existing read-receipts.ts/source-read-receipt.ts server admission identity/selected guarded writer integration and focused tests/fixture migration. No SDK/gateway/hosts, shared contract, store, schema or lifecycle edits.
- source_retrieval: tenant export/purge/runtime-role classification integration and tests; coordinate purge-door SQL with schema owner but do not edit its file. No retrieval engine, receipt/schema/host edits.
- source_review: independent held-out expectation corpus and genuine owned PostgreSQL race/role/lifecycle evidence only; no production or other owners' tests.
- lead: contract, migration-applier/necessary schema re-export registrations, CI/evidence coordination, owned fixture lifecycle, docs and downloadable bundle. No API-calling code, keys or provider requests. Resolve shared-file changes centrally.

All current application files stay frozen until their ownership/DTO dependencies are agreed. No two owners edit one file. New infrastructure remains off pending qualification. The existing 2,927-test/119-file and 50/12 independent/PostgreSQL checkpoints remain preserved historical evidence, not overwritten by this continuation.

## Proof and completion

Observe meaningful failures before fixes. Positive controls include active viewer/custom/shared access, exact offset read, retained eligible text, identical retry, disjoint late ranges, normal export and authorized purge. Adversaries include same-length extraction change, source/programme move/withdrawal, revocation/inactivity, spoofed actor/receipt ID, mutable/sparse/out-of-bounds/overlap/range hash, altered payload, zero/mismatched INSERT and commit uncertainty, cancellation, private top-N/actor history, foreign tenant, malformed ledger/fingerprint, ordinary legacy permission denial, disabled flag, migration replay, direct mutation and concurrent purge/hold/status/writer ordering.

Independent controls plus actual PostgreSQL sessions must bind final source/migration hashes, runtime roles/policies and observed barriers. Use only a new owned synthetic loopback fixture, not arbitrary DATABASE_URL. Final source/fixture cleanup and focused combined regression are recorded here. Run required migration order/reachability/tenant/purge/privilege checks appropriate to new storage. No full-repository/deployed/provider/scientific/agency qualification is inferred. Finish the bounded contract; future host dispatch/replay, authoring V2, structural/multilingual retrieval and scientific decisions remain separate.
