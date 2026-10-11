# Commit-time signature target binding

Baseline: b11199c26c7719aaab46e49963fdc4e4c453c849. Only target branch:
concept2cure-v2. This contract accompanies the cumulative seal/review/signature
repair. Publication and qualification are recorded separately in
../2026-10-09-direct-integration/DELIVERY_RECORD.md.

## Existing integration, not another signing system

The status route and AnA signed-status handler already call
server/services/artifact-signed-act.ts / commitSignedArtifactAct inside their
transaction. This patch changes that shared function. It does not change the
UI, route registration, signature ceremony, model, database schema or audit
writer. The earlier source-qualification refusals remain intact.

## Admission and write contract

1. Positive integer organization, actor, artifact, project and version selectors
   must be consistent. Only review-to-approved and approved-to-locked are
   accepted. A lock must cover the current approved version.
2. The expected update must match the canonical act's status-only fields. The
   function derives the actual changes itself; an injected content, organization,
   identity or wrong-version field is not a permitted mutation.
3. Read the head on the caller's transaction with FOR UPDATE, matching primary
   key, external artifact ID, organization and project. Compare content, version,
   lifecycle, publication metadata and the observed updatedAt value. An absent or
   changed target refuses rather than rebinding to another document.
4. Recompute SHA-256 from current text. A populated head hash must be correct.
   A null optional head hash does not disable exact text/version binding.
5. Read the current stored version on that same transaction with FOR SHARE,
   scoped to artifact, organization and version number. Require the exact cached
   version primary key, target tuple, content and recomputed hash. Missing,
   moved, modified or substituted versions refuse. Version number and version-row
   primary key remain distinct.
6. A caller that saw no version must still see no version. An intervening row
   requires a fresh signing attempt. The existing guarded insert remains the
   fallback for genuinely versionless imports; it binds the checked head.
7. For approval, run the existing assignment-bound review quorum through the
   same transaction immediately before the status write. A failure propagates;
   a negative verdict uses the existing ARTIFACT_CHANGED refusal family.
8. The compare-and-set update repeats tenant/project/external-ID/content
   conditions, and its returned signed fields are checked. The existing
   version/signature/ledger/snapshot writes remain in the caller's transaction.
   A missing returned signature or snapshot refuses; a newly inserted version
   must return the same organization, artifact, version, text and hash.

## Limits that must not be overstated

The row-lock order is head, stored version, audit chain. The checked version is
not scientifically qualified merely because its bytes/hash match. A fresh
quorum check catches changes already visible at that check, but its existing
reads do not serialize later review assignments, decisions, contradictions,
source lifecycle or ownership changes. Full multi-writer locking/invalidation
must cover those writers too; this patch does not do so.

The timestamp comparison is not an ABA-proof workflow revision or a durable
review nonce. A null head hash is allowed only because text and the stored
version are still independently bound. No new authority, competence, current
membership, source-applicability or regulatory-currency determination is added.

No scientific-source-review writer/consumer is implemented, and receipt-less
legacy sealing remains an open defect in its separate service. No full IND,
Part 11, release or production qualification is asserted.

## Test scope

111 identical cases run against the preceding cumulative source and this patch.
The complete production signed-act and review modules execute. SQLite performs
predicate evaluation and real local commit/rollback. An explicit test adapter
replaces Drizzle/schema; signer and audit services are doubles. FOR UPDATE and
FOR SHARE are recorded as requests, not executed by SQLite. The fixture audit
pair is not the production cryptographic ledger. No concurrent PostgreSQL, RLS,
HTTP, browser, reauthentication or scientific-review test has run here.

The repository-runnable test wrapper uses this same isolated harness. It is not
presented as a PGlite integration test. The two existing native PGlite signing
suites now use valid SHA-256 fixtures instead of placeholder hashes. The direct
commit fixture uses complete Drizzle-shaped objects and canonical status changes.
The mock route suite supplies the transaction-time reads for successful approval
and lock. These compatibility changes were applied to exact baseline source
blobs and syntactically checked; their native runners could not run in this
execution environment. No assertion was removed or weakened.

Reference for the intended PostgreSQL lock behavior:
`https://www.postgresql.org/docs/current/explicit-locking.html`
This reference is design rationale, not execution evidence.
