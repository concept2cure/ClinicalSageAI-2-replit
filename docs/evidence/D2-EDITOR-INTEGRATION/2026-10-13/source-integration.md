# Sources in the existing editor — D2 / D5 evidence

The source intake extends the existing Authoring store and creator. It creates
no editor, source registry, production dependency or database table.

`POST /api/authoring/import/source` accepts a project, an exact Vault or captured
data-room identity, and a stated reason. The server reads the recorded source,
checks tenant/project/disposition eligibility, reads the original through the
existing verified Vault/upload readers, and compares its SHA-256 with the
recorded edition. Caller-provided titles and origin receipts are ignored.

The canonical `createDocumentFromDraft` transaction reserves and rechecks the
source before writing. Source identity, original checksum, conversion warnings
and the stated reason appear in document provenance and each section's CREATE
audit. The original bytes remain untouched. Repeat intake of the same edition
by the same author reopens their editable draft and retains its edits. A sealed
copy is not reused as an editable draft. Intake uses the existing program
disposition lock and exact source/upload row locks, without new table-wide locks.

Word import reuses `importDocx`, retaining supported headings, lists, tables and
inline PNG/JPEG/GIF figures. Unsupported figures become explicit named gaps.
Uncoded sections get labelled working identifiers, not invented CTD locations.
Other supported readable formats use the existing deterministic text/OCR
extractor and carry explicit layout/table/formula/form-control loss warnings.
Empty, unknown, altered or oversized originals are refused without a saved copy.

Imported originals remain dependencies: the existing rendition reservation and
verification path now checks them even without model excerpt receipts. Removed
or changed source data refuses a new rendition. Retaining extracted data remains
permitted. The disposition impact includes both exact Vault origins and
captured-only origins; active review/approval of a dependent imported document
blocks withdrawal through the existing policy.

Filing an imported working copy preserves its original dependency in the
existing export-history and audit receipt. A different-byte Vault rendition
remains a source, so the original's data withdrawal/supersession is blocked
while that rendition remains data-eligible. Retaining extracted data remains
permitted. This prevents an original's data being removed and reintroduced
through the editor → Vault loop; dependent sources must be reviewed first.

`GET /api/authoring/ind-document-catalog` projects the canonical IND pyramid and
IND section tree: all eight phases, 102 non-module section entries and 93 task
or subtask deliverables. It includes preparation and FDA engagement as well as
Modules 1–5. Canonical form/manual/AI drafting limits are preserved. These are
available work definitions, not invented documents or completion claims.

## Verification

The source workstream's targeted suites comprise 65 checks:

- `server/services/authoring/__tests__/authoring-source-import.test.ts` (12):
  source scope, integrity, native structure and image limits, exact origin,
  draft reuse, source changes, required reason, receipt spoofing and SQL-shaped
  inputs rejected before any query.
- `server/services/authoring/__tests__/ind-document-catalog.test.ts` (3): every
  canonical phase, task deliverable, subtask binding and IND section, including
  form drafting limits. Official forms/signatures, datasets and agency receipt
  deliverables remain importable but are not offered as model-authored prose.
- `server/services/authoring/__tests__/import-source-references.test.ts` (7):
  both original identity kinds, withdrawal/change/malformed refusals, source
  row reservations and no rendition receipt after refusal.
- Existing `saved-draft-source-export.test.ts` (11) and
  `saved-draft-source-reservation.test.ts` (5): existing model excerpt and
  manual document behavior remains covered.
- `server/services/document-data-disposition/__tests__/saved-draft-impact.pglite.integration.test.ts`
  (13): actual SQL counts imports, preserves tenant/project/hash identity,
  blocks active dependent approval and invalidates stale previews.
- `server/routes/__tests__/authoringSourceImport.pglite.integration.test.ts`
  (8): actual HTTP/JWT, canonical migrations, verified stored Vault bytes,
  tenant-checked captured uploads, native Word conversion, canonical creation,
  immutable source origin audit, repeat draft reuse, scope/hash/role/reason
  refusals and complete catalogue response.
- `server/services/authoring/__tests__/authoring-file-to-vault-snapshot.pglite.integration.test.ts`
  (6): real filing orchestration/receipt persistence, the original → imported
  working copy → different-byte Vault rendition → withdrawal refusal, plus
  the existing content/title/order/section drift compensation cases.

The atomic route test deliberately replaces stored bytes and observes
`CONTENT_HASH_MISMATCH`, then injects a database CREATE-audit failure and
observes HTTP 500 with identical document, section, revision and audit counts
before/after. This proves the integrity and atomic-audit doors actually refuse
their intended failure cases. The original file is restored and the temporary
test namespace is removed.

PGlite proves actual SQL and transaction rollback, not concurrent PostgreSQL
connections, production RLS, hosted qualification or live-model behavior. The
control-tower combined suite and build/typecheck evidence are recorded beside
this file.

## SQL interpolation ratchet exception

The CI scanner initially refused the new files because it counts every SQL
template expression, including canonical fixed predicates. The baseline adds
exactly four expressions for `authoring-source-import.ts` and two for
`import-source-references.ts`. Each expression is an existing disposition
eligibility helper called with literal alias `d` or `s`; the helper validates
its identifier and produces a fixed SQL predicate. No project, organisation,
document, source ID, checksum, title, reason or other request value is inserted
into SQL text. All values use bound parameters. Keeping these helpers preserves
the one source-eligibility policy; copying their predicates to evade the gate
would fork that policy. The gate passes with these narrow entries.
