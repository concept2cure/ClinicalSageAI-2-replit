# W2 / D4 — retain processed-source references when saving

Follow-up to source commit `08efd7b3befdb48aea907a28d88df96a8aa95e70`.
That exact source commit passed the full GitHub TypeScript check in
Validate & Audit run 37571381384 and its ESLint step; broader jobs are tracked separately.

## Saved-document contract

`draft_authoring_document` accepts optional per-section `sourceReferences`
copied from the batch source receipts: document ID, SHA-256 and excerpt span.
The shared from-draft service validates identity, count, uniqueness and span
bounds, then re-resolves every reference through the existing organization-
checked catalog reader using the authoring pool. Wrong-project, foreign-tenant,
changed-version, failed-extraction and stale-extraction references refuse
creation before the document transaction. Source/database errors do not expose
driver text. The extraction record's content hash must match the Vault version
both when drafting and when saving.

Only backend-resolved title, project, version, extraction details, availability
and excerpt bounds enter `provenance.projectSourceReferences`. Caller-provided
qualification, text, project and verified-provenance fields are not persisted.
These references are saved in the existing provenance JSONB column and carried
into the section CREATE audit metadata by the existing authoring transaction.
The saved tool receipt returns the retained references. No new tables,
migrations, dependencies, approval bypass or parallel authoring store.

The relation is deliberately **declared references, current at save**. It is
not proof the generator used the references, not claim-level scientific
support, not a whole-source read, and not approval or filing qualification.
Existing machine-draft span attribution remains unchanged. Source qualification
is explicitly `unassessed`. Later source changes require the existing governed
review; this change does not invent an automatic approval-invalidating engine.

## Regression evidence

The existing registered-handler PGlite integration test now applies the real
catalog and disposition migrations and reads actual Vault/catalog records.
It checks durable provenance and CREATE audit metadata, same-organization
wrong-project refusal, foreign-tenant refusal, stale versions, failed extraction,
stale extraction and zero document creation on refusal. Human confirmation
and approved-model gates remain active in the harness.
Parser tests cover identity/span/budget errors and attempts to inject fabricated
source text or qualification. Existing unsourced drafts remain compatible.

Local final regression: **142 passing tests in nine files**, including the real
database source/save checks, catalog service and project scopes, regional and
blueprint drafting, source lineage, batch receipt recovery, and source parsers.
Server build and whitespace checks passed. Pre-commit security scan: zero
violations across 3,073 files. Full TypeScript for this follow-up is run on
GitHub after publication, not substituted with the preceding commit's result.

Post-push validation of `05b5bd06d66df5406460a97e4dff357835b430b1` found seven
TypeScript errors: six test row accesses whose database result type is unknown,
and the new HTTP 409 source/version-conflict refusal missing from the shared
authoring response union. The follow-up explicitly types those test rows and
includes conflict in the canonical refusal type; no baseline or gate is changed.

The correction commit `c81d27101246580aa6576f1efc2b50721427b272` passed
full GitHub TypeScript and ESLint in Validate & Audit run 37572686176.

## Current-version catalog truth

Ultra review reproduced stale-version catalog reads and false successful writes
against the actual services on an in-memory database. The existing catalog
reader deliberately retains the raw join so stale extraction is distinguishable
from absent extraction: a mismatch refuses before legacy backfill or read
receipts. Listing and semantic-search joins require matching hashes; stale
catalogs remain visible as documents needing study, not current summaries.
Both vector and non-vector completion paths require exactly one updated row
before returning success. Existing genuinely uncataloged legacy backfill remains.

Regression evidence includes actual SQL/registered-tool stale-version refusal,
no stale read receipt, project listing counts, unchanged stale summary, and a
source-change race producing zero updated rows. Unit tests cover both write
paths and hash/tenant/project predicates in semantic search. Search predicates
are a query-contract test, not an actual pgvector execution test. Legacy test
fixtures without a hash remain compatible but are not qualified as verified
source evidence; draft/save source reference validation remains strict.

These are W2/D4 source-integrity corrections, not scientific qualification or
a claim that every regulatory filing type is ready for submission.

Final focused regression: 159 passing tests in 12 files. Server build,
canvas-path reachability and whitespace checks passed. Existing contract,
migration, tenant, audit, signature and warning-ratchet preflight gates passed;
full application TypeScript is delegated to GitHub on the published source.
