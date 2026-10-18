# Current-document template assembly: backend evidence

W1 / D2, canonical `concept2cure-v2`. The approved contract is
[`AUTHORING_ASSEMBLY_BUILD_2026-10-17.md`](../../../../../design/AUTHORING_ASSEMBLY_BUILD_2026-10-17.md).
This evidence covers the server-owned append plan and canonical section writer.
The parent workstream owns editor/browser checks and direct publication.

## Result and boundaries

The existing authenticated authoring router now previews and commits one or all
missing template sections into the exact current document. Existing section rows
and parent template/provenance fields remain unchanged. Organization templates
retain their recorded prose; global and builtin reference structures remain empty
where no prose exists. Normalized duplicates, stale document/template snapshots,
unsafe order indexes, sealed records, current access denials, module/applicability
conflicts and prohibited regional filing scope refuse before committing changes.

One transaction-owned section seed writer serves document starts, single-section
creation and assembly. Content, lineage, genesis revisions, CREATE audit rows and
chained audit evidence commit together. Failure on the second section rolls back
the earlier new section, its evidence and the parent reservation timestamp.
Existing single-section placement still shifts indexes when inserting between
sections; those shifts also roll back on evidence failure.

Each new builtin section retains its selected template/guidance and assembly
snapshot in CREATE metadata. Recorded guidance reads verify that receipt even
when the parent document has a different template identity. No parent provenance
or template identity is replaced.

Generation and acceptance use the separate existing retained AnA candidate path.
This backend does not generate prose, infer source qualification, accept a model
draft, approve content, file a document or create another editor/store.

## Actual checks

The final pinned run passed **54 tests in six files**:

- 30 actual HTTP cases use the real authoring router, signed JWTs, fresh actor /
  organization / project / document permission services, canonical authoring
  migrations, revision/audit/lineage SQL and embedded PostgreSQL. They cover
  append preservation, one/all selection, a repeated old fingerprint, independent
  second-section lineage/revision/audit failure, source and target staleness,
  Viewer/current-account/private-project/revoked-grant/frozen refusal, foreign
  identities, null/overflow indexes, malformed normalized structure, selected
  builtin guidance, preparation restrictions, bound market scope, all four
  regional draft mappings, and a real global-reference transaction.
- Three focused canonical single-create cases reproduce and then prevent
  evidence failures leaving a newly committed section and moved indexes behind.
- Eight recorded-guidance cases verify exact selected template identity and
  fail closed on malformed/mismatched assembly receipts.
- Two pure planning cases cover the actual 295-section Module 5 outline and
  every existing builtin outline: **305 templates / 4,308 planned sections**.
  This does not claim those rows were all persisted or drafted.
- Eight existing single-section placement cases and three existing scoped
  saved-guidance cases remain green.

Scoped ESLint passed **13 files, zero errors and zero warnings**. Exact source
hashes, commands, log hashes and the successful process exits are in
`verification.json` and `source-pins.json`. Raw UTF-8 logs are JSON encoded so
their complete bytes and SHA-256 identities remain reviewable without whitespace
normalization. Earlier 46-case / 52-case candidate runs are retained separately;
their counts are not added to the final 54 as unique coverage.

The official repository compiler then identified eight unknown SQL-row field
accesses in the new HTTP fixture. Explicit types for the known section, CREATE
metadata and parent-template projections corrected those test annotations.
Production bytes, SQL and assertions did not change. The affected **30 HTTP
cases passed again**, with zero scoped lint errors/warnings. Original 54-case
source pins are retained in `54-case-source-pins.json`; current pins include the
typing-only correction. The root workstream retains the complete compiler RED
and subsequent official compiler result.

## Retained failures and corrections

- `initial-single-create-red.json`: two actual failures and one passing control
  against the original creator. Genesis or audit failure left the new section
  committed and changed an existing index from 100 to 101.
- `header-snapshot-red.json`: changing organization-template `guidance_content`
  after preview incorrectly returned 200 instead of refusing 409. Persisted
  templates now hash the complete locked header plus resolved sections.
- `large-outline-red.json`: the inherited from-draft 200-section cap rejected
  the actual 295-section Module 5 template. Append assembly uses the existing
  server-resolved template roster, independently of the unrelated from-draft
  limit. It retains nonempty/identity/duplicate/order validation.

An early HTTP fixture omitted required `template_type`; a later guidance test
used the nonexistent `/sections/:id/guidance` path. Those fixtures were corrected
to the canonical column and `/guidance/:sectionId` route. Neither is presented
as a product regression or a passing release check.

PGlite provides one connection. These tests exercise actual transaction and
authorization behavior, but do not establish native PostgreSQL concurrent lock
scheduling or full deployed RLS behavior. The HTTP fixture mounts the existing
authoring router and its JWT middleware directly; the assembly service's own
fresh permission checks run for real. No live provider, human review or deployment
was used. Lost-response recovery still requires checking the known saved parent;
the server does not promise durable cross-tab request idempotency.

## Reproduce

From the repository root, use Node 22 and run:

```sh
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/vitest run \
  server/routes/__tests__/authoring-assembly.pglite.test.ts \
  server/services/authoring/__tests__/assembly-section-transaction.pglite.test.ts \
  server/services/authoring/__tests__/assembly-template-guidance.test.ts \
  server/services/authoring/__tests__/assembly-plan.test.ts \
  server/services/authoring/__tests__/create-section-placement.pglite.test.ts \
  server/services/authoring/__tests__/authoring-template-guidance-tenant.pglite.test.ts
```

The three RED receipts are historical evidence; current source intentionally
passes those cases. No provider credentials or external database are required.
