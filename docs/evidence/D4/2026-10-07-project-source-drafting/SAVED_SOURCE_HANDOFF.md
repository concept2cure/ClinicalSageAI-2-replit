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
