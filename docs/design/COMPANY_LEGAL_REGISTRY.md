# Canonical company legal registry

`public.company_legal_registry` stores one exact legal-document metadata record
per `(organization_id, id)`. The integer tenant key admits the existing tenant
RLS and export sweeps. Each JSON record retains the immutable Vault version,
program, original hash, registration attribution, applicability and lifecycle
evidence. Archiving retains the record; no 500-entry array ceiling remains.
Original PDF bytes and approval stay on the existing Vault lifecycle.
Copied entries derive immutable `sourceOriginal` references from the canonical
ingest audit, never from request data; registration rechecks that reference before
commit. The canonical copy-lineage gate also follows retained ingest provenance
for older copies or copies whose separate registration failed.

`legal-registry.ts` owns reads and transactional deltas. Reads never fall back
to organization settings. Exact-Vault reads include archived entries, preserving
original-byte provenance and recorded revocation. Both ordinary leaf placement
and the existing Vault transmission gate read this canonical registry. Approval,
current-version, content hash, dates, target scope and revocation gates continue
to apply at their existing boundaries.

All profile/registry mutations use `writeProfile`: current company capability,
the locked organization row, expected revision, a reason, safe chained audit,
registry delta and history/lifecycle projections commit together.
Registration and archival recheck current project admission inside that same
transaction before commit. Registration holds the Vault source row and rechecks
its PDF type, current version and exact hash/version; unchanged drafts remain
registrable. A source change or access revocation rolls back the registry,
revision and audit together.

The settings JSON retains presentation and reviewed requirements without a `legalDocuments`
array. Each legal mutation still advances the profile revision. Audit rows carry
only immutable reference facts and canonical record/requirements hashes; private
identity, legal prose, logos and workflow evidence preimages remain out of the
append-only ledger. Database constraints reject malformed records and prevent
rewriting their immutable source identity. Disposal retains the canonical
pending-deletion, legal-hold and platform-role gates.

The existing full profile DTO remains compatible and loads legal inventory by
default. `includeLegal=false` explicitly returns `legalDocumentsIncluded: false`
and no inventory or approval reads. Requirement visibility and references still
use current project admission through metadata-only registry queries. Rendering
a company letterhead loads presentation without the legal inventory.
The dedicated `GET /company-documents/legal-documents` inventory filters and
pages in SQL after current program admission, with honest admitted counts and
facets. Explicit approval filters verify the candidate pool through the existing
Vault verdict before reporting their count; ordinary pages resolve approvals
only for the returned page.

Production cutover is coordinated, not rolling: pause company-document writes,
deploy every API and job worker that reads or writes company legal metadata,
run `20261018_company_legal_registry.sql`, and resume only after canonical
read/write verification. The migration locks organization writes, validates and
copies every legacy record, checks exact JSON equality, then removes the legacy
array without changing the profile revision. Malformed, duplicate or conflicting
input aborts the transaction with the source intact. Replays retain existing
canonical rows. A database trigger refuses every future legacy settings array,
including an empty array or null, so an old worker cannot create a second write
path. There is no dual-read or dual-write transition window.

The company customer-return envelope binds the registry together with retained
presentations, delegated grants, filing identity reviews, named designs and their
referenced canonical template specs. Purge recomputes that exact metadata under
the organization lock. A receipt predating any changed company row cannot
authorize its destruction, even when the settings revision did not change.

Real PGlite tests apply the migration, move 603 records including archived
workflow metadata, replay it, reject malformed/conflicting cutovers without
source loss, exercise immutable references and disposal controls, isolate tenant
and exact-version reads, and enforce ordinary placement/transmission scope.
