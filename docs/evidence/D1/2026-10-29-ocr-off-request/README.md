# D1: OCR off the upload request (MR-08 Stage 3 steps 1(b) and 4–6, 2026-10-29)

`docs/work-orders/MR-08-vault-upload-safety-and-document-control.md` Stage 3, steps 1(b), 4, 5 and 6.

A scanned PDF was OCR'd page by page inside the upload request. A long one held the response open past any load balancer's timeout, so the person saw a failure while the server kept working, and a retry raced the first attempt. `01-red.txt` shows the shape: with OCR taking 30 s, the upload took 36.5 s.

Now the request reads a text layer only, within a size and time budget. What needs OCR, or more, is recorded as still being read, and a sweep reads it once, off the request.

## What already exists

Searches run: `extraction_pending`, `processing sweep`, `vaultProcessing`, `OCR`, `ocrPdfToText`, `pdfOcrBudget`, `AUTOMATIC_PDF_OCR_BUDGET`, `withConversionSlot`, `backfillVaultChunks`, `processPendingSources`, `pendingCount`, and `server/jobs/*`. Deleted history: nothing under those names.

- **`extractDocumentText`** (`server/services/ocr/extractDocumentText.ts`) is the one extractor. Ingest called it with no OCR budget, so OCR read every page in the request.
- **The Data Room** bounds its own OCR with `AUTOMATIC_PDF_OCR_BUDGET`. Its `processPendingSources` is a script-run backfill over `cre_evidence_sources`, a different store, on no timer.
- **`backfillVaultChunks`** chunks Vault versions that already have text, run by a script per tenant. Its tenant-scope pattern (the organisation's UUID in a full tenant scope) is what the sweep reuses.
- **`chunkDocumentForIngest`** is the one chunking path. The sweep calls it, so passages carry page spans exactly as at ingest.
- **`taskDueSweep`** is the pattern for a self-guarding, idempotent interval sweep started from `server/index.ts`.
- **`withConversionSlot`** (OPS-13) is the one limiter, and the sweep's OCR runs inside it.
- **`readVerifiedVaultBytes`** is the one verified reader. The sweep reads through it, so a stored file that does not match its recorded hash is never read as the version.
- **No Vault processing sweep, pending state or pending count existed.**

## What changed

| Piece | Where |
|---|---|
| `ocr: false` reads a text layer only. A scanned PDF or an image comes back `ocrDeferred`. | `extractDocumentText.ts` |
| The request's budget: up to 20 MiB, within 10 s, text layer only. Otherwise the version is pending, and why. | `server/services/vault/vault-inline-extraction.ts` |
| Ingest records `extraction_pending`, answers `extraction: 'extracted' \| 'pending' \| 'failed'`, and nudges the sweep. A same-bytes re-upload never sets a read version back to pending, and never erases its text. | `vault-ingest.service.ts`, `recordExtractionOutcome` (`document-catalog.service.ts`), `pendingExtractionOutcome` (`document-catalog-core.ts`) |
| **The sweep.** It runs every 15 s and on a nudge, reads each organisation in its own tenant scope, and claims each document with an advisory lock, then re-reads it. It reads through the verified reader, with OCR inside a conversion slot. The text, outcome and a chained `vault.document.extracted` row are written in one transaction, then the passages are indexed. An unreadable file is recorded `extraction_failed` with the reason. | `server/jobs/vaultProcessingSweep.ts`, started in `server/index.ts` |
| Search returns `pendingCount`, which the Vault states | `vault-search.ts` (`countPendingInScope`), `project-vault.ts`, `Vault.tsx`, `VaultLibraryResults.tsx` |
| The upload row and the catalog record say a version's text is still being read | `useVaultUpload.ts`, `VaultUploadStaging.tsx`, `VaultCatalogRecord.tsx` |
| AnA cannot catalog a version still being read; it is told why | `catalogableDocument` (`document-catalog-eligibility.ts`) |

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | On HEAD, on real PostgreSQL 16 (`RLS_ENFORCE=on`, `app_service`), all 7 cases fail. The upload of a scanned PDF took 36.5 s, because OCR ran in the request. There is no pending state, no pending count and no sweep. |
| `02-green.txt` | **The sweep suite on real PostgreSQL 16:** 8 of 8, including a same-bytes re-upload of a version already read. **The 34 dbtests that touch ingest, extraction, search or the catalog:** 346 of 346. **Unit and client:** 2,402 of 2,429 across 161 files; the 27 failures are the four files red without this change. **Type check:** `tsc` exits 0. Tests whose fixtures assumed the old behaviour were updated, and each says why: <ul><li>`document-catalog.dbtest`'s opaque scan is pending at ingest and failed after the sweep;</li><li>two search journeys and two route harnesses build the catalog table the search now reads;</li><li>a backfill mock resolves to a status.</li></ul> |
| `03-mutation.txt` | Seven mutations, each caught: <ul><li>the request runs OCR again;</li><li>no claim, so every sweep reads every pending version;</li><li>no audit row;</li><li>a same-bytes re-upload resets a read version to pending;</li><li>a same-bytes re-upload erases its text;</li><li>search does not count what it cannot see;</li><li>an unreadable file is left pending.</li></ul> |

## Decisions recorded here

- **Born-digital files are still read, and chunked, in the request.** The work order moves all chunking to the sweep. Keeping inline reading for a text layer keeps the filing suggestion that depends on it, and keeps the passages immediate. Only what needs OCR, is over 20 MiB or takes over 10 s moves.
- **The sweep reads within the platform's one automatic OCR budget** (`AUTOMATIC_PDF_OCR_BUDGET`, as the Data Room does), and records the coverage in the audit row. The work order's acceptance ("page count 300") assumes an unbounded read. A bounded one says how much it read.
- **The sweep makes no estate-wide read of the Vault.** The Vault's row security admits a program through the organisation's UUID. The system scope lists organisations only, and each is read in its own tenant scope, as the chunk backfill reads it. That is one indexed query per organisation per run. A definer function for discovery is the step if the tenant count grows. It was not added, because whether it can read a table under forced row security depends on the deployed owner's privileges.
- **The search's pending count is a select-list subquery on the count's own statement.** The search therefore still issues two statements, the count and the page, and they still share one WHERE clause. Two existing tests pin both.
- **A scoped client is scoped only inside a transaction** (`poolInstrumentation.ts`). The claim is held on a session, the re-read goes through the scoped pool, and every write is in a transaction.

## Not done here

- **Re-proposing a filing once the text is read.** The placement writer (`placeVaultDocument`) files for a person or an agent; a system re-proposal is not one of its shapes. Done the same day, beside it in the placement service: `../2026-10-29-filing-from-read-text/`.
