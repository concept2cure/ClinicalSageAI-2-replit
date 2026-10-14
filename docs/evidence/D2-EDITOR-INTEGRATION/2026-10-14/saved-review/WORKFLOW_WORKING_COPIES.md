# Workflow working-copy reliability

W1 / D2 continuation from `87b27c89` on `concept2cure-v2`, under
[`EDITOR_SAVED_REVIEW_CONTINUATION_2026-10-14.md`](../../../../design/EDITOR_SAVED_REVIEW_CONTINUATION_2026-10-14.md).
The existing source-import route, authoring transaction, document editor and
governed lifecycle remain the implementation paths.

## Reopen an edited source copy

Before the repair, the server correctly reused the exact current author's
imported DRAFT, but the client required its section-code set to equal the
original source preview. Renaming a code or adding/removing a section through
the editor therefore made a successful source import appear unconfirmed.

The tracked HTTP/JWT/PGlite regression performs the actual governed section
PATCH and POST, imports the same source fingerprint again, and passes that
response through the real client reader. Before the change it failed because
the reader returned `null`; the original six route tests still passed.
Additional reader regressions failed on valid changed structure and on missing
ownership/provenance checks: [reuse-red.txt](source-reuse-red.txt) records
12 failures and 12 passes across the two regression suites.

For `reused: true`, the reader now verifies the exact target program, source
selection, fingerprint and retained import provenance, plus actual saved
section/document/tenant ownership and unique nonempty section keys. It admits
the returned saved structure without rewriting it from the preview. For
`reused: false`, the original preview section-set check remains required.
Malformed identity, duplicate keys, foreign scope and changed source evidence
remain refusals.

The HTTP regression verifies the same document ID, renamed code, new saved
review section, unchanged source content/hash and no extra authoring evidence
from reuse. Pure regressions also cover removal and reordering. Together with
the existing intake UI suite, [reuse-green.txt](source-reuse-green.txt) records
35 passing tests across three suites.

## Retained Protocol matrix cells

The canonical Protocol removal writers soft-remove a visit or assessment and
retain its Schedule of Activities cells. The shared export snapshot composes
live endpoints while retaining all recorded cells. Previously the importer
treated every retained cell whose endpoint was absent from the live set as
foreign, refusing a valid source with `WORKFLOW_SOURCE_INVALID`.

The tracked PGlite regressions invoke `removeVisitTx` and
`removeSoaAssessmentTx` themselves. Before the repair both legitimate removal
cases failed with that 409 refusal, while the remaining 19 materializer tests
passed: [protocol-matrix-red.txt](protocol-matrix-red.txt).

The materializer now verifies each referenced endpoint missing from the live
set against its exact organization/protocol and an explicit saved removal.
Missing endpoints, foreign organizations and other protocols still refuse.
The existing canonical exporter composes the live matrix. Retained cells stay
in fingerprint facts and section-origin identities; changing a hidden retained
cell changes the source fingerprint without changing live matrix prose.
Verified retired endpoint identities also contribute to those facts. Sources
with only live endpoints keep their existing fingerprint shape and make no
extra endpoint reads.

[protocol-matrix-green.txt](protocol-matrix-green.txt) records 21 passing tests,
including both removals, retained-fact changes, missing/foreign refusals and
the pre-existing source-scope, model-evidence and corruption checks. The fixture
was updated to match the current canonical span-lineage `usage`/`confidence`
columns before recording the red run; no production lineage policy changed.

## Checks and limits

- Four focused suites: 56 passing tests in total.
- Scoped ESLint: no errors and no added warnings. Its sole warning is the
  unchanged `saveToAuthoring` complexity warning, present in the HEAD file as
  well: [before](source-eslint-before.txt), [after](source-eslint-after.txt).
- Scoped `git diff --check` passes.
- The new endpoint helper contains two fixed SQL literals with bound
  organization ID, Protocol ID and referenced endpoint ID arrays. There are
  no new SQL interpolation sites, migrations, dependencies or routes.
- These checks exercise actual PGlite data, removal services and the existing
  HTTP authoring route. They do not establish native PostgreSQL concurrency,
  production RLS or a live model result. Protocol removal coverage exercises
  the canonical materializer used by preview/create; it does not claim a
  separate end-to-end Protocol HTTP creation run.

The independent read-only review of the saved-document critique implementation
found no unresolved material issue in its project/document authorization,
transaction-scoped citations, accepted-text handling or snapshot pagination.
Overall type/build/release checks remain the control tower's responsibility.
