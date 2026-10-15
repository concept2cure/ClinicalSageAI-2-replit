# Finish the existing human review loop

Approved technical contract, 2026-10-14. Workstream W1 / D2; canonical branch
`concept2cure-v2`, audited at `269d2c18c`. Evidence belongs under
`docs/evidence/D2-WORKFLOW-CONTINUATION/2026-10-14/`.

The existing Authoring review index, Review board, section renderer, task
completion compositor and immutable audit trail remain canonical. The gap is
that a human verdict has no saved-content binding, the direct verdict route
accepts an unassigned reviewer, and queue reads do not apply document ACLs.
The saved-document critique is already bound and is not rebuilt here.

## Content and wire contract

Promote the existing `adoptionSnapshotHash` recipe into
`authoring-content-digests.ts`, retaining its exact framed JSON fields and
bytes: document id/title/module/locale/productCode/version and every saved
section's id/code/title/content, in signing order
`order_index, created_at, id`. Basis: `authoring-full-visible-v1`.
The legacy signature/export `sectionsDigest` stays stable. Shared schemas in
`shared/authoring/peer-review.ts` define this full snapshot and the wire.

GET `/documents/:id/reviews` retains reviews/stats/canApprove and adds
`reviewContext`: verified actorId/organizationId/documentId, the complete
current snapshot, snapshotHash/bindingBasis, the actor's request
`{reviewId, requestedAt, reviewStatus}` or null, and canReview/unavailableReason.
Historic raw verdicts are retained, with standing `pending`, `current`,
`stale` or `unbound`. Only a verified current binding can count as a current
verdict. A missing legacy binding is never backfilled from today's content.
The board and task rail use this same standing rule. A document with no
assigned verdicts does not acquire affirmative peer approval by vacuity.

POST `/documents/:id/review` requires strict input `review_status`, optional
`review_comments`, and `expected: {reviewId, requestedAt, snapshotHash,
bindingBasis}`. No actor or reviewer may be supplied. Reasons remain required
for rejection/changes requested. The server compares the captured request
and full snapshot under the existing parent lock before any verdict, task or
audit write. A changed round or content returns a safe 409. The response
retains the review/tasks envelope and confirms `auditTrail:
{persisted:true,chained:true}`; the UI verifies the returned identity, round,
verdict and binding rather than trusting `success:true` alone.

Add nullable `reviewed_snapshot JSONB`, `reviewed_snapshot_hash TEXT`, and
`review_binding_basis TEXT` to both existing authoring_reviews creators with
idempotent ALTERs for already deployed databases. No new table or store.
The current row remains unique per document/reviewer/tenant. Verdict audit
metadata retains the full reviewed snapshot, request, old and new facts;
re-request records the overwritten verdict/binding before clearing it.
Every re-request rotates the existing current row's UUID id. That id names a
request round, even when two requests share a JavaScript millisecond; the
natural document/reviewer/tenant key still identifies the one current index.
Old round ids survive in immutable verdict/request audits and signature facts.

## Authority and transaction boundary

Use the request-pinned database client, fresh active user/organization/current
membership, existing program/project admission and canonical document ACL.
A section-only grant cannot reveal or review the full document. Object
middleware classifies both review reads and verdicts; service admission also
enforces the invariant independently. Only the currently assigned reviewer
may decide. Resolve requested reviewer ids through current tenant membership;
display names/emails and grants come from authoritative users, never supplied
labels. A forged email cannot create queue ownership.

Extend the existing separation-of-duties author resolver for
`authoring-document`: protected original creator plus immutable
`doc_revisions.created_by`, plus existing immutable CREATE/RENAME/REORDER_SECTIONS
audit actors for saved headings, section identity and order (those writes do
not create prose revisions). Permission grants and machine contributor fields
are not authorship. Request and verdict refuse original authors and historical
human contributors; unknown or failed authorship never implies independence.
Current identity/permission/assignment and snapshot checks precede mutation;
verdict, existing task closure, trail and chained ledger commit atomically.
Preserve task lock ordering, dependency behavior, signature-required tasks,
and historical completed tasks. A peer verdict remains distinct from an
electronic signature. Ordinary final APPROVER signing gains no new general
peer-review prerequisite.

Known-source explicit REVIEWER adoption and its release reread already consume
peer approval. Both must require the same verified full-content review binding;
otherwise a stale verdict could adopt newly edited content. Keep existing
lineage, qualification, signature and immutable adoption evidence requirements.
Adoption and release also ask the canonical independence check again: a reviewer
who subsequently became a content contributor cannot adopt their own work by
reusing the historical verdict, even if edited bytes were later restored.

## Existing UI

DecisionModal reads and displays the full captured snapshot using existing
`AuthoredHtml`, including native tables/figures. It identifies the revision and
request. Both verdict entry points use this read and strict native write
contract; no second renderer or approval route. Pin actor, organization,
document, request and snapshot for the ceremony. Promote the existing Quality
captured bearer/claim consistency check into `utils/authToken.ts` so both
surfaces reuse one implementation. Server authentication remains authoritative.
Late reads/responses cannot update a replacement account/document/round. The
existing ceremony guard protects modal/AnA navigation, and a pending decision
cannot be closed by Escape/backdrop. Show stale/unbound verdicts as earlier
facts with their real recorded status/reason; don't present them as current
approval or erase task history.

## Ownership and proof

Control tower: shared contract, promoted digest/auth helpers, workflow adoption
consumer, integration/evidence/publication. Backend session: existing native
routes, peer-review service, object middleware, both creator migrations and
route/service tests. Governance session: canonical authorship extension and
board ACL/current-standing projection/tests. UI session: Review/rail/standing/
receipts and component tests. No overlapping implementation files.

Prove meaningful stale-content, re-request, author/contributor, unassigned,
foreign/inactive/revoked membership, spoofed identity, private document and
section-only admission cases failing before the repair. Prove audit failure
rolls back verdict and tasks, and signature-gated tasks remain open. Verify
legacy honesty, full-content visible read, malformed/mismatched receipt and
account/document/request races. Run focused migration-backed tests, appropriate
client suites, actual browser light/desktop and dark/phone checks, canonical
zero-error compiler, production build and required publication/security gates.
Local/synthetic evidence does not claim production validation or regulatory
qualification.

TaskTray exact-task navigation and readiness target remediation remain separate
confirmed opportunities. Neither is part of this bounded review repair.
