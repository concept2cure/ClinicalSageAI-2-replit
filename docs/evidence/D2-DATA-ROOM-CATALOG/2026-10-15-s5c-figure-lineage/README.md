# D2 — a drafted figure the cited Vault version states is `derived` lineage to it (Data Room catalog S5c)

Date: 2026-10-15. Launch row: **D2**.
Design: `docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md`, slice S5.
Founder, 2026-10-15: "Do it all."

## The gap

S5a recorded, in a saved draft's provenance, whether each figure was found in the
sources it cited. The span lineage did not say it. `document_span_lineage` could cite
only an evidence-spine row, so the Data Origins view of a drafted section said who
wrote each clause and nothing about the figure the CSR stated. `usage = 'derived'` had
no writer.

## The change

- **`migrations/20260908_span_lineage_machine_draft.sql`, amended in place with a dated
  header (Rule 1).** It adds a fifth provenance kind, `vault_document`: a `derived`
  span whose reference is the `vault.documents` id and whose `payload_sha256` is that
  version's content hash, with no asserter.
  - `20260908` is the last file to define both CHECKs, so it is amended rather than
    appended to.
  - `20260907` still skips, because the live definition contains
    `accepted_machine_draft`.
  - The change only widens the constraints.
  - `ci:replay-rebuilds-nothing` passes: 0 rebuilt over 9,068 constraints and indexes.
- **`span-lineage.service.ts`.**
  - `replaceVaultFigureSpans` admits a span only for a Vault version of a project of
    this organization with that hash. Otherwise it fails closed, in the caller's
    transaction.
  - `retireStaleFigureSpans` retires a figure span whose figure has moved. Both lineage
    gates call it.
  - The readers return the new kind with its state. `withVaultVersions` looks up Vault
    versions only when a read holds a Vault citation, so a schema without the Vault is
    never touched.
  - The attribution summary credits a figure as "from sources" only where no weaker
    claim covers it. A machine-drafted clause stays machine-drafted, and the support
    claim sits beside the authorship claim.
  - Three readers cast a spine reference to integer inside the join condition. That
    cast now runs only for spine rows, so a uuid reference can no longer make it fail.
- **The draft save** (`authoring-from-draft.ts`, `authoring-documents.ts`) places each
  found figure in the stored section's text, using `figureSpansInContent`.
  - A figure is placed only where its text stands literally, never inside a tag or an
    attribute, and repeats are taken in order.
  - The save records the spans in the section's own transaction, after the sources are
    verified.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | `tests/db/figure-lineage.dbtest.ts` against trunk's code: 3 of 4 fail. There is no writer, and the CHECK refuses the kind. |
| `02-green-real-pg.txt` | On PostgreSQL 16 as `app_service` with `RLS_ENFORCE=on`, 20/20 with the existing lineage suite. A span is recorded. Every reader returns it with its state: current, or unresolved when its version cannot be found. A Vault version's hash is immutable (VR-06), so a citation cannot go stale by its bytes changing. The organization-wide stale read does not fail on the uuid. Another organization's version is refused and nothing is written. The CHECK refuses a span with no reference. |
| `03-migrate-twice.txt` | `deploy-migrate.mjs` twice. |
| `04-replay-rebuilds-nothing.txt` | The replay gate on the migrated database. |

PGlite: the draft suite saves a draft that cites "12 of 30 subjects". The lineage then
holds one `vault_document` / `derived` span over "30 subjects" and none for the
unverified "55%". The clause stays machine-drafted in the summary, and moving the
figure retires the span.

Unit and PGlite: 1,801 tests pass across clinical-regulatory-evidence, authoring, the
lineage suites, biosketch, protocol-consent, compute and `tests/lineage`.

Two failures on trunk are not this slice's. Each was run with this slice's files
restored to trunk, and fails the same way there:

- `draft-authoring-document-tool` "project catalog — source-version truth" (2 tests).
  They call `completeCatalog` with no tenant scope after the 2026-10-14 hardening, and
  they expect a stale catalog row the join now hides.
- `authoring-image-access.pglite.test.ts` fails at its fixture ("relation users already
  exists").

Both are inside the active "trunk green" lane (work-orders row "the Test job's failing
files"), and are left to it.

## Not in this slice

`computed` lineage for a figure inside a document. The engine run is stored and named
since S5b, but no document writer inserts a computed figure into authoring text yet.
The SAP projection is rendered, not saved.
