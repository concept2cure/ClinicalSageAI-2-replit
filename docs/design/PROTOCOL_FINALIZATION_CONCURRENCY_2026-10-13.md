# Protocol finalization: transaction and concurrency audit

Read-only W1 / D2 audit, informing D7, on `concept2cure-v2`, 2026-10-13.
HEAD during the completed writer census was
`fa5597ffb94832ff617a017f32e9718903106eca`.
No production or test file was changed, no test was executed, and no concurrency
violation is claimed as reproduced. The native cases below are proposed red
tests for the current canonical behavior. Prior CTD supplied-QC paths stay frozen.

## Current release path and actual prerequisites

`server/routes/protocol-development.ts:529` reaches the canonical finalizer
through `signProtocolAct`. The route requires a reason and permits signature
meanings `authorship`, `approval` and `responsibility`. Router writes are subject
to `requireEditorAccessForWrites` (`:76`).

`server/services/protocol-development/protocol-signature.ts:34` delegates to
the existing `signGovernedAct`, rather than maintaining another ceremony.
`server/services/part11/governed-signature-ceremony.ts:165` validates the meaning,
reads persisted membership signing authority, performs reauthentication, then
opens the tenant-stamped transaction. Default signing roles are admin, approver
and reviewer (`part11/signing-authority.ts:23`). The ceremony checks authorship
or independence before calling the finalizer, then records the governed action
and electronic signature on that same client and commits them together
(`governed-signature-ceremony.ts:204`). Those controls should be retained.

`server/services/protocol-development/protocol-development-service.ts:389`
does the following:

1. Locks the protocol parent with `SELECT ... FOR UPDATE`, rejecting finalized
   and superseded states.
2. Computes structural completeness.
3. Reads current sections through the supplied transaction, appends one major
   version snapshot, and updates the parent to finalized.

The structural gate (`protocol-development-logic.ts:119`) requires at least one
recorded required section, all recorded required sections marked complete and
at least one objective. Clinical and IRB protocols need inclusion criteria;
missing exclusion criteria are a warning. Clinical protocols need a visit.
It does not inspect section prose, objective endpoint sufficiency, assessment
coverage, source approval or scientific validity. Blank prose can therefore be
outside what a `complete` status establishes.

Finalization does **not** call review consensus/readiness, require completed
review assignments, resolve blocking review comments or execute the richer
regulatory rule pack. The latter explicitly distinguishes structural completion
from compliance (`protocol-rule-pack.ts:4`). Review-board readiness is a separate
derived result (`protocol-reviews-service.ts:295`); its consensus, dispositions
and unresolved comment count are not a finalization prerequisite today.

Review dispositions are real signed acts. An account-bound assignment can be
signed only by its assigned user as review/approval; a named external reviewer's
decision is recorded by someone taking responsibility. Completed dispositions
cannot be overwritten (`protocol-reviews-service.ts:178`). The disposition locks
its assignment row, but it does not reserve the protocol parent. These are
distinct from an actual jurisdiction's IRB/IEC approval or agency acceptance.

AnA's `finalize_protocol_document` is read-only and points the user to the
workspace signing ceremony (`AnaToolExecutor.ts:12179`). It must remain so.
Authored prose is attributed at mutation time by the existing lineage helpers;
the original finalizer has no additional current-source approval or model-PQ
release gate. The stored-workflow bridge's downstream adoption/release policy
does not automatically supply such a gate to this original protocol service.

## The exact transaction mismatch

`completenessInputFor` (`protocol-development-service.ts:351`) performs five
independent **global `pool.query`** reads: sections/statuses, objective count,
inclusion count, exclusion count and visit count. `finalizeProtocolTx` calls it
after obtaining the parent lock but does not pass its transaction.

Consequently the finalizer's own uncommitted changes are invisible to the
completeness reads on another PostgreSQL connection, and those reads are not
one transaction snapshot with the appended version and signed content. The
read-only `getCompleteness` also currently uses the pool, which is appropriate
for a preview but cannot provide a release reservation.

The existing PGlite signature integration fixture explicitly maps both pool
reads and transaction reads to **one PGlite session**
(`protocol-signature.pglite.integration.test.ts:24`). It proves real SQL and
ceremony behavior in that fixture but cannot establish separate-connection
read-your-own-writes or native lock ordering. Existing sequential finalized-SoA
refusal tests likewise do not establish safety for a request that already read
the old editable state.

## Protected writer census

The production SQL census found the following reachable original-protocol
writers. Template instantiation creates a new, uncommitted parent and sections;
it does not edit an existing finalized protocol.

| Writer | Current reservation/status behavior | What a concurrent finalize can miss |
| --- | --- | --- |
| Synopsis/header (`protocol-development-service.ts:107`, `:132`) | Read editable state without lock, then update parent with no editable-state predicate. | A queued parent update can run after finalization using the earlier state check. |
| Study-design bind/unbind (`:169`, `:205`) | Same unlocked editable check before parent update. | A protected association can change after a stale check. These link fields are not in the current content digest. |
| Section edit (`:218`) | Unlocked joined state/token read, child update and lineage, then parent update at `:257`. | Child prose/status can be staged before finalization and committed afterwards; the parent update preserves finalized status. The optional section timestamp token does not reserve the parent. |
| Objectives/eligibility/visits/team create (`:263`, `:275`, `:286`, `:334`) | Unlocked `loadDoc`/editable check before insert. | A foreign-key wait can finish after finalization without rechecking editable status. |
| Visit edit/remove and SoA assessment remove (`:296`, `:311`, `:323`) | Unlocked state check before child update. | Existing child rows can change without reserving the parent. |
| Minor version snapshot (`:374`) | Unlocked state/version read, section snapshot, version insert, then parent version update. | A queued snapshot can append a stale minor version and overwrite the parent's finalized major version. Version is not itself in the signed content digest. |
| SoA assessment create, cell upsert and clear (`protocol-soa-service.ts:29`, `:41`, `:59`) | `requireProtocolForWriteTx(..., signedContent:true)` only performs an unlocked parent read. | Assessment/cell content can commit after an earlier editable check; a cell clear/upsert can race on an existing child row. |

`requireProtocolForWriteTx` (`protocol-development-service.ts:102`) distinguishes
signed-content writers from supplemental registers. Budget, risk, milestone,
assignment and comment additions use `signedContent:false`. Their existing
tenant boundary remains necessary, but they must not become unintentionally
immutable merely because the signed protocol was finalized. Derivation into a
separate study-design record is likewise not an edit to the signed protocol.

The creating migrations contain foreign keys, but no inspected original-
protocol SQL contains a finalized-content trigger. Foreign keys are not a
replacement for a lifecycle reservation: a child's `KEY SHARE` can wait behind
the finalizer's `FOR UPDATE`, then validate that the parent still exists without
rechecking its editable state. Existing-cell updates/deletes can have no parent
key lock at all. Native tests must observe actual waits rather than assume that
an insert either always bypasses or always blocks the parent lock.

## What the signature actually binds

`server/services/part11/governed-target-binders.ts:31` computes the protocol
digest on the signing client from cover-page fields and synopsis, sections,
objectives, eligibility, visits, SoA assessments/cells and team. It explicitly
excludes workflow statuses, version and timestamps. A reviewer disposition
binds this same protocol content; its version is recorded separately in the act.

The finalization's `protocol_versions.snapshot` currently retains version plus
sections, not a full historical copy of every signed register. Concurrency work
must preserve the existing content-digest recipe so old signatures continue to
rederive; adding workflow status to it would invalidate genuine old signatures.

This distinction matters to the red assertions: a status-only completeness
mismatch can wrongly finalize a structurally incomplete protocol **while its
content digest still matches**. A later prose, header, visit or SoA-content
mutation should change the rederived digest. A stale version write needs a
version/state assertion, since version alone does not change that digest.

The signature manifestation reads signed/withdrawn rows and printed identity
(`protocol-signature-manifestation.ts:59`); it does not rederive current content.
The export fails when the finalized signature store is unavailable, but the
manifestation is not proof that concurrent/current content still matches the
signature. Native evidence must use the canonical binding derivation, not just
a `signed` badge. No historical signature or status should be rewritten to
make such a comparison pass.

## Bounded implementation proposal

Start with the existing protocol service and SoA service, their current route
error mappings and a new native `tests/db/protocol-finalization-concurrency.dbtest.ts`.
No new dashboard, parallel finalizer, provider call or migration is required.

1. Make completeness input loading accept the caller's query client. Finalize
   must read all five inputs through its reserved transaction; preview can pass
   the pool explicitly. Preserve the structural gate's present scope.
2. Use one canonical original-protocol write reservation before any protected
   child lock, child write, lineage write or version snapshot. Lock parent first,
   recheck tenant/deleted/editable state after any wait, then advance its MVCC
   version with an `updated_at = clock_timestamp()` update returning exactly one
   row. The established Authoring reservation in `authoring/document-lock.ts:55`
   demonstrates why both the lock and parent update are needed. It is not the
   implementation for these different protocol tables.
3. For section/cell ids, resolve parent identity without taking a child lock,
   reserve parent, then reread/recheck the live child and its optimistic token
   before DML. Keep a consistent parent-before-child order. New parent creation
   can seed its children inside that uncommitted creation transaction.
4. Apply the reservation to every protected writer in the census, including
   header/synopsis, design association and minor snapshots. Leave supplemental
   register behavior governed by the existing `signedContent:false` boundary.
5. Keep finalize's parent lock through completeness, major snapshot, parent
   state update, audit/action rows and signature binding. A READ COMMITTED
   signer queued behind a writer must inspect the committed content. A stale
   REPEATABLE READ/SERIALIZABLE transaction must fail/retry; the writer's parent
   MVCC update makes PostgreSQL detect that change instead of signing old child
   rows. Map a serialization conflict to a named retryable protocol conflict at
   the existing route boundary, rather than silently retrying a signed act.

The common ceremony currently performs authorship/independence checks before
the finalizer acquires its parent lock. A concurrent edit may therefore change
the author set after that check. The native independence case below should
determine whether the protocol path needs a reservation **before** its
authorship check. If reproduced, add a bounded preparation/reservation hook to
the canonical ceremony and configure it for protocol finalization/review;
retain the existing check-before-finalization-write order, because the version
row written during finalization must not make an independent signer an author.
Review disposition content binding also needs a coherent protocol reservation
if concurrent edits are allowed during review. This should be tested and scoped
explicitly rather than inferred from its assignment-row lock.

Persisting the full signed register snapshot, validating current review
signatures and making source/model/jurisdiction applicability release policy
explicit are further governed-release increments. The concurrency correction
must not claim to implement them or equate structural finalization with full
scientific or regulatory approval.

## Native red-first test design

Use `vitest.db.config.ts` and the real installed PostgreSQL schema, owner access
only for isolated fixtures/observations, and `APP_DATABASE_URL` for all exercised
application transactions. Assert the runtime role is neither superuser nor
BYPASSRLS, and that relevant protocol stores have enforced tenant policies.
Record distinct backend pids for held transaction and independent pool reads.
Use unique org/user/protocol identities, real membership/JWT/password/signing
paths where the public route is exercised, and the actual canonical services.
No provider, invented source approval or scientific qualification is needed.

| Case | Deterministic setup and red assertion | Required green invariant |
| --- | --- | --- |
| Own-transaction incomplete section | Start with committed structurally complete content. On one tenant-stamped signing client, use the real section writer to mark a required section draft, then call the real finalizer on that same client. The independent pool still sees complete status in the old code. Assert refusal and unchanged finalization/version/signature/action state after rollback. | Finalization sees its own draft status and writes no release effects. This is a service transaction-contract case, not a claimed current combined HTTP endpoint. |
| Own-transaction newly completed section | Start with one committed draft required section. Complete it using the real writer on the finalizer's client. | Finalization assesses the new state on that client instead of refusing because a different pool connection saw the old draft. |
| Finalizer first, section/header writer second | Hold parent on a blocker connection. Start actual authenticated finalize and observe its `FOR UPDATE` wait. Start the actual section or header request and observe its later parent-update wait after its unlocked old-state read. Release blocker, await finalization, then await writer. | Writer returns a state conflict, with no content/lineage/version/edit-action effect. Final signature digest still equals canonical current digest. Old code is predicted to commit the queued edit; this must be observed, not reported in advance. |
| Finalizer first, child insertion second | Same parent FIFO barrier, followed by actual assessment/visit/objective/eligibility/team creation. Observe the real insert/FK wait. | The insertion is refused after finalization; no post-sign child appears and digest remains unchanged. Cover the actual FK lock behavior on the installed schema. |
| Existing SoA cell/visit removal after finalization | A second blocker holds the existing child row while the first holds parent. Queue finalize, then the actual cell upsert/clear or visit update/remove until it waits on the child. Release only parent so finalize can commit; then release child. | The writer rechecks finalized parent before child DML and rolls back all effects. Under old code the child wait can outlive the finalization. |
| Writer first, finalizer second | Hold parent, queue real protected writer before finalize and verify waiter order. After release, commit writer before finalizer proceeds. | Finalization includes the committed changed section/SoA/header, and snapshot/bound digest correspond to the content it actually signs. |
| REPEATABLE READ stale child census | Establish signer's old snapshot. A different client uses a real protected child writer and holds its transaction. Let finalizer queue behind that writer's parent reservation, then commit writer. | Signer cannot finalize using old child rows; observe serialization/refusal and no signature/version/action effects. Do not replace this with a sleep-only overlap test. |
| Minor version snapshot queued after finalize | Parent FIFO barrier queues finalization ahead of the real snapshot request. | No stale minor snapshot is appended and finalized major version is not overwritten. Assert state/version, not digest drift alone. |
| Two finalizers and sequential controls | Race two real signatures; separately exercise already-finalized and cross-tenant writes, and allowed supplemental budget/review activity. | Exactly one finalization/signature/major snapshot, expected typed refusals, unchanged tenant boundary and intentional supplemental-register behavior. |
| Independence changes before parent reservation | Queue approval finalization after its current authorship lookup but before parent reservation; commit a genuine governed edit by that signer ahead of it. | Finalization cannot apply an independent approval to content the signer just authored. This is a separate candidate requiring observed native evidence and may expand the ceremony scope. |

Use `pg_stat_activity`, `pg_blocking_pids` and explicit bounded promises to
establish ordering, as the existing workflow native suite does. Barrier queries
may lock fixture rows but must not replace production mutation/signature logic.
Provide enough pool capacity for blockers, request-scoped clients, signing
clients and the current independent completeness reads; a pool-starvation
timeout is not evidence of safe locking. Always release barriers and roll back
held clients in `finally`.

Capture baseline failures before production edits, then rerun the same cases
after the bounded reservation/client-read fix. File exact native SQL/role and
red/green evidence under D2, and run the existing protocol signature, write-
scope, lineage, study-design, export and SoA route suites as relevant regressions.
Until those results exist this document is an implementation plan and static
audit, not a concurrency qualification record.

## Implemented bounded correction and native evidence (2026-10-14)

The original baseline probe retained two native failures and one green control in
`docs/evidence/D2-PLATFORM-COMPLETION/2026-10-13/protocol-finalization/`.
The bounded correction now reserves the original protocol parent before every
protected writer, rechecks current editable state after the wait, advances the
parent MVCC row with `clock_timestamp()` and exact-one-row RETURNING, and reads
structural completeness through the finalizer's actual transaction client.
Section and SoA writers resolve parent identity before child locks and reread
live child/token state after reservation. Supplemental `signedContent:false`
registers retain their existing behavior. The structural rule scope, snapshot
and canonical signature digest recipe are unchanged.

A separate read-only native call against the preserved original org18/doc9/sig12
proved that its genuine historical signature still passed its manifest hash
while the current content digest differed; the old export nevertheless printed
the later prose as Finalized with Electronic signature. The existing generic
integrity verifier explicitly did not rederive this protocol binding. The
current facet now distinguishes `signed` (historical signature binds current
content), `changed` (verified historical signature, changed current content) and
`unverified` (available historical metadata, no verified current binding).
Default reads own one tenant-scoped repeatable-read read-only snapshot; explicit
executors must prove an actual coherent transaction. A private branded context
carries that proof between the existing facet/export services. A signature-store
or snapshot connection failure remains `unavailable`, preserving the rest of the
workspace read instead of promoting missing verification into a pass.

Controlled export of a finalized protocol is held with a named 409 for changed
content or no current live signature, and named 503 when verification is
unavailable. The existing workspace signature line and pure export renderer label
historical/current-binding limitations. No signature is revoked, repaired or
rewritten; the preserved original fixture retains its original source, signature
flags, signed hash and version. The before/after read-only proof is filed under
`docs/evidence/D2-PLATFORM-COMPLETION/2026-10-13/protocol-finalization-repair/`.

The canonical native test file is
`tests/db/protocol-finalization-concurrency.dbtest.ts`, reachable only by the
existing real-PostgreSQL configuration. It uses new isolated active memberships,
restricted runtime and enforced RLS, actual observed parent/child lock queues,
real canonical mutations/governance/reauth/signatures, and real finalize/export
HTTP routes where asserted. Independent API cases use separate genuine fixture
signers so the platform's ten-attempt limit is preserved. A deliberately
out-of-band source change in a newly genuinely signed fixture tests the legacy
export guard; it is distinct from the original retained application-writer race.
Binder-read delivery failure is a bounded injected failure on a native restricted
snapshot, with the503 route mapping checked through the actual Express handler.
This is regression evidence, not PQ or scientific/agency approval.

## Remaining ceremony reservation proof and exact hook

The current ceremony checks authorship/independence before the finalizer takes
its parent lock. The bounded correction above does not close or claim to close
that separate race, and does not establish review, scientific approval or
source/model/jurisdiction prerequisites.

A next native proof should hold the protocol parent, start a genuine independent
approval signer until the existing ceremony completes its current SoD read and
queues its finalization parent lock, then commit a genuine governed section edit
by that pending signer ahead of it. The baseline assertion is that approval must
not independently attest to content the signer just authored. Preserve all real
creation/edit/signature history and check no partial release effects on refusal.

If reproduced, the precise shared-ceremony API is an optional
`prepare(client, meaning)` callback on `GovernedSignatureInput`, called after
BEGIN/tenant context and before `checkMeaningAgainstAuthorship` and domain write.
The protocol finalization route can obtain `lockProtocolForSignatureTx` there.
Do not move SoD after the finalization version write, which would wrongly make
an independent approver an author through the act's own snapshot row.

For signed review disposition, resolve the tenant/live assignment's parent
without a child lock, obtain the same lock-only parent reservation (review may
sign an already finalized protocol), then lock/reread that exact assignment.
Retain the existing assignment lifecycle, assigned reviewer identity, meanings
and canonical independence check. The current `setDispositionTx` locks only the
assignment and the later content binder reads mutable protocol children, so this
requires its own deterministic writer-first/disposition-first native proof
before implementation or a concurrency-closure claim.
