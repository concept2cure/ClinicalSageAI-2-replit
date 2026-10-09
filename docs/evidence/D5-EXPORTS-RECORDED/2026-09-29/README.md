# D5: a document the system generates is recorded before it is delivered

**Row:** D5 (Part 11 record integrity). **Lane:** `…session_01E8btkB8mcLirW4rNvsMNxK`.
**Date:** 2026-09-29.

## The rule, and where it came from

The owner, on 2026-09-29: generated regulatory documents should be registered
in the database. This lane had judged a set of generators harmless because
they "touched no database". That is backwards. A document the platform
produces must leave a record of who produced which document, when, and
exactly which bytes.

## The sweep

Every route handler in `server/routes`, `server/api` and `server/src/routes`
that sends a file (`Content-Disposition`, `res.download`, `res.attachment`)
was listed: 63 handlers. Each was resolved to its mount and to the production
launch-scope verdict. 18 are served in production. Of those:

| Handler | Finding |
|---|---|
| `POST /api/concept2cure/artifacts/export-docx`, `-pdf`, `-pptx` | **Generated from request content, recorded nothing.** The Conversation Thread's ".docx" button uses export-docx for AnA drafts. **Fixed here.** |
| `POST /api/c2c/templates/:id/render` (docx, pdf) | **Generated from request content, recorded nothing.** No screen calls it yet. **Fixed here.** |
| `/api/biotech-artifacts/*` (ICSR, PSUR, CIOMS…) | Same defect. No longer served in production (`docs/evidence/D2-API-SCOPE/2026-09-29-unrecorded-generators/`). |
| `POST /api/ectd/export/:submissionId` | Already recorded (governed export consequence and audit row, WO-16C). |
| `GET /api/c2c/project-vault/:id/documents/:documentId/download` | Serves a stored vault document. The record exists. |
| `/api/_ops/predicate-intelligence/render-se-docx*` | Operator tooling, authenticated separately. Not a customer path. |
| `POST /api/data-origins/selection.pdf`, `/api/ana/citations/*/export*`, `POST /api/authoring/docs/:docId/export` | Renditions of records that already exist (lineage, citations, an authoring document). The authoring export writes `authoring_export_history` through its service. **Not changed here; see Open.** |

## What changed

- `sendAuditedDownload` (`server/services/export/governedExportConsequence.ts`)
  delivers a binary download through the existing one implementation,
  `createAuditedUnplacedExport`. It writes an `EXPORT_GENERATED` audit row
  with the SHA-256 of the exact bytes delivered. It refuses delivery when that
  row does not persist. It returns the hash in `X-Export-Sha256`. No second
  copy of the audit logic was made.
- The three chat-artifact exports and template render deliver through it. A
  refused record answers 503 `UNAUDITED_EXPORT_REFUSED` and sends no file. The
  Conversation Thread already shows the server's message ("The Word file was
  not produced — …").
- `ExportSourceType` gains `export_pptx`.

| Proof | Red | Green |
|---|---|---|
| `exports-recorded.test.ts`: export-docx and template render each record `EXPORT_GENERATED` with the delivered bytes' SHA-256, and deliver nothing when the row does not persist | 4 failed of 4: files delivered with no record (`red.txt`) | 4/4 (`green.txt`) |

Neighbouring suites pass: `server/routes/c2c`, `server/services/export` and
the v2 client (380 files, 4,056 tests). Typecheck is clean. Net ESLint
warnings are unchanged (11).

## Open

- **Renditions of existing records.** The lineage PDF, citation exports and
  authoring export do not all record the export event. Whether exporting an
  existing record needs an export audit row is a policy call. Many GxP
  systems log it, and it would use the same `sendAuditedDownload`.
- **Placement.** These exports are recorded as audited but unplaced. They are
  not filed into the Vault as documents. The canonical way for a draft to
  become a governed document is still Authoring → Vault. The export record
  proves what left the system; it does not make the file a controlled
  document.
- The 18 handlers whose mount the sweep could not resolve by grep (listed in
  the lane's scratch output) were not judged.
