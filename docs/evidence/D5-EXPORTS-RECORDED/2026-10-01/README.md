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
| `GET /api/ana-ri/documents/:artifactId/lineage-dossier.xml` (the dossier as structured metadata) | XML returned, nothing recorded | Recorded, `resourceType` `ana_lineage_dossier`; now an attachment; needs an identified user |

The citation `format=json` responses are ordinary API reads, not files. They
are unchanged. `ExportSourceType` gains `export_csv` and `export_xml`.

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
| `server/routes/__tests__/record-exports-recorded.test.ts`: for each of the four routes (five with the lineage dossier XML, added second: `lineage-xml-red.txt`, 2 of 10 failed), an `EXPORT_GENERATED` row with the organisation, the user and the SHA-256 of the delivered bytes (also in `X-Export-Sha256`); and 503 with no `Content-Disposition` when the row does not persist | 8 failed of 8 (`red.txt`): every file delivered, none recorded | 10/10 (`green.txt`) |

Neighbouring suites pass: `server/routes/__tests__`, `server/routes/c2c`,
`server/services/export`, `server/services/clinical-regulatory-evidence` and
the client lineage suite (385 files, 3,651 tests). Typecheck is clean. ESLint
warnings are unchanged (17 across the touched files, before and after).

## Where the sweep stands

Re-measured on 2026-10-01, after Reporting & analytics joined the launch
catalog. The real route registration was run in production posture
(`scripts/ci/launch-scope-route-inventory.ts --rows`) and joined with every
handler that sends a file. Results:

- **Recorded:** the exports above; the eCTD export; the chat-artifact and
  template exports (`../2026-09-29/`); the audit-trail export; and Reporting's
  report-run PDF, which that lane records and refuses when the record fails
  (`server/routes/report-os.ts`, `REPORT_EXPORT_NOT_RECORDED`).
- **Already-stored documents:** the project-vault download, and the gateway
  transmittal acknowledgement.
- **Closed the same day:** `GET /api/artifacts-center/:artifactId/export`
  (`server/routes/artifacts-center-routes.ts`). It renders approved or signed
  regulatory content as DOCX/TXT, and the Artifacts Center's Export button calls
  it. Before this change it recorded nothing, which made it the most important
  gap in the set: governed content leaving the system unrecorded. Both formats
  now deliver through `sendAuditedDownload`. The record is `resourceType`
  `artifacts_center_export`, with the artifact version and the review or
  signature that authorised the export in its metadata. An identified user is
  required, and the response is 503 `UNAUDITED_EXPORT_REFUSED` with no file when
  the row does not persist. The review gate and the `X-Concept2Cure-*` headers
  are unchanged. Proof: `artifacts-center-export-governance.test.ts` 4 of 9
  failed (`artifacts-center-red.txt`), then 9/9
  (`artifacts-center-green.txt`). The Admin surface's alert no longer doubles
  the full stop on a server message that ends in one.
  `ExportSourceType` gains `export_txt`.

  **Disclosed edits inside other lanes' 24-hour windows,** under the founder's
  instruction of 2026-10-01 to stop deferring:
  `server/routes/artifacts-center-routes.ts` (`1ec8ea494`, `…01KnUGoX`, 00:22
  UTC; that change was to other handlers, and only the export handler is
  touched here) and `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx`
  (`0224f43a0`, `…0194UQPx`, 02:11 UTC; one line in `downloadArtifact`).
