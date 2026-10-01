# D5: an export of an existing record is recorded before it is delivered

**Row:** D5 (Part 11 record integrity). **Lane:** `…session_01E8btkB8mcLirW4rNvsMNxK`.
**Date:** 2026-10-01. Follows `../2026-09-29/`.

## Decision

`../2026-09-29/` left a question open: should exporting a record that already
exists also leave an export audit row? The owner delegated the call. The
answer is **yes**. A Part 11 reviewer asks what left the system, who took it
and when, and a rendition of an existing record leaves the system as surely as
a generated document. These exports now use the same `EXPORT_GENERATED` row,
built by the same one implementation (`sendAuditedDownload` →
`createAuditedUnplacedExport`). That row holds the SHA-256 of the exact bytes
delivered, and nothing is delivered when the row does not persist.

## What changed

| Route (served in production) | Before | After |
|---|---|---|
| `POST /api/data-origins/selection.pdf` (the lineage report a reviewer is handed) | PDF returned, nothing recorded | Recorded, `resourceType` `data_origins_selection`, id `table:document:start-end`; needs an identified user (401 otherwise) |
| `POST /api/ana/citations/:artifactId/export.docx` (artifact with its embedded AnALedger) | DOCX returned, nothing recorded | Recorded, `resourceType` `ana_citation_export` |
| `GET /api/ana/citations/:artifactId/export?format=csv` | CSV returned, nothing recorded | Recorded, as above |
| `GET /api/ana/citations/projects/:projectId/export?format=csv` | CSV returned, nothing recorded | Recorded, as above |

The citation `format=json` responses are ordinary API reads, not files. They
are unchanged. `ExportSourceType` gains `export_csv`.

When the record cannot be written, each route answers 503
`UNAUDITED_EXPORT_REFUSED` and sends no file. The lineage screen
(`client/src/concept2cure/lineage/dataOriginsApi.ts`) already shows the
server's message through `serverMessage`. No screen calls the citation
downloads yet.

Not changed, already recorded: `POST /api/authoring/docs/:docId/export` writes
its own export audit row. Its file is also inside another lane's window
(`8767b89b1`, 2026-09-30).

## Proof

| Check | Red | Green |
|---|---|---|
| `server/routes/__tests__/record-exports-recorded.test.ts`: for each of the four routes, an `EXPORT_GENERATED` row with the organisation, the user and the SHA-256 of the delivered bytes (also in `X-Export-Sha256`); and 503 with no `Content-Disposition` when the row does not persist | 8 failed of 8 (`red.txt`): every file delivered, none recorded | 8/8 (`green.txt`) |

Neighbouring suites pass: `server/routes/__tests__`, `server/routes/c2c`,
`server/services/export`, `server/services/clinical-regulatory-evidence` and
the client lineage suite (385 files, 3,651 tests). Typecheck is clean. ESLint
warnings are unchanged (17 across the touched files, before and after).

## Where the sweep stands

Every download served in production now does one of three things: it records
what it delivered, it serves a document that is already stored, or it is
operator tooling. The remaining handlers from the 2026-09-29 sweep are no
longer served in production (`docs/evidence/D2-API-SCOPE/`).
