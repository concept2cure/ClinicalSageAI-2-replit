# D4 / D5: the last trunk Lint red. Reporting's governed PDFs and the PDF runtime gate

**Row:** D4 (CI is the OQ evidence base), with D5 (a governed export must be a faithful copy whose recorded hash can
be checked). **Lane:** `…session_01JNRgCKWRqqJxZ1cJCyxoor`, claimed on the board before the change. The three writers
belong to the Reporting lane `…015oLV2v` (landed 15:06 and 16:06 UTC today) and were edited under the founder's
instruction of 2026-10-01. The edit is disclosed on the board.

## The decision

`ci:check-pdf-runtime` failed on `server/services/report-os/pdf/{writer,run-pdf,bundle-pdf}.ts`, three new `pdf-lib`
writers outside `server/services/pdf-converter.ts`. The gate offered two remedies:

1. **Route through the canonical converter.** Rejected. `pdf-converter.ts` converts a **DOCX** through LibreOffice
   (with a browser fallback). A report run is structured data, so this would mean generating a DOCX only to convert
   it: two new failure modes (no LibreOffice in the task, layout drift) and no gain.
2. **Approve by name, with the reason.** Taken, but not as a rubber stamp. The gate exists for output that is
   "deterministic, audit-bound". Audit-bound already held: the route records the sha256 of the bytes it sends on the
   chain *before* sending them and refuses the export otherwise (`routes/report-os.ts` `sendRecordedPdf`).
   Deterministic did **not** hold, which is what approval would have hidden:

   - `pdf-lib` stamps the wall clock into `/CreationDate` and `/ModDate` and its own name into `/Producer` at
     `PDFDocument.create()`. Two renders of one export differed, so a recorded hash could never be re-verified by
     rendering again.
   - The file's metadata named a time no page of it printed (the pages print the export time).

   `writer.ts` `stampExportIdentity` now sets the metadata at construction: created and modified at the recorded
   export time, the export id as the subject, the platform as the producer. An export time that is not a time
   refuses, and nothing is rendered. This is the same construction the gate already accepts for the Data Origins
   report. The converter's `makeDeterministic()` does the job for output it does not control, by overwriting dates
   with a placeholder. Here the writer controls its metadata, so it states the true time.

Approving the writers exposed a second problem in the list: **five approvals had gone unused**. `routes/report-os.ts`
(its rendering moved into the three writers today), `routes/authoring.router.ts` (since `9a960a4b3`),
`routes/submission-ops.ts` (since `3e90a2b68`), `documentQuality/pdfValidationAttachment.ts` and `tools/index.ts`
(no PDF import in either) are approved files that import no PDF library. Each was a standing pre-approval for whatever
PDF generation was added there next. They are removed, and the gate now fails an approval whose file no longer
generates PDF. The canonical service is exempt by name, because it renders through LibreOffice rather than a library.
Before scanning, the gate also runs its two rules on constructed cases, so a pattern that stops matching fails the
gate instead of passing everything.

## Proof

| File | |
|---|---|
| `red/A-gate-on-trunk.txt` | Trunk's gate on trunk: the three writers, exit 1. |
| `green/A-gate-after.txt` | Exit 0. |
| `red/B-mutation-unused-approval-readded.txt` | `routes/report-os.ts` re-approved: the unused-approval rule names it, exit 1. |
| `red/C-mutation-writer-unapproved.txt` | `run-pdf.ts`'s approval removed: reported as a new entry point, exit 1. |
| `red/D-mutation-detector-blinded.txt` | The import pattern narrowed to `pdfkit` only: the built-in probe stops the gate, exit 1. |
| `red/E-export-identity-before-fix.txt` | The new `export-identity.test.ts` on the unchanged writers: 4/4 fail. The metadata reads the moment of rendering (`20:09:45`) instead of the export time (`10:00:00`), and two renders of one export differ. |
| `green/E-reporting-pdf-suites.txt` | `server/services/report-os/pdf/`: 17/17. That is the 12 existing faithful-copy cases unchanged, the 4 new cases, and the refusal of an export time that is not a time. |
| `red/F-revert-proof-stamp-disabled.txt` | With `stampExportIdentity` made a no-op, the 5 new cases fail and the 12 existing ones pass. |

ESLint is clean on the four changed TypeScript files, and `npm run typecheck` returns 0 errors.

## Found while doing it

The gate does not see `require('pdfkit')`. One file uses it: `server/routes/analytics-routes.ts` `GET /api/analytics/export`.
That route is mounted, no screen calls it, and it records nothing. Its `type=predictive` branch returns hard-coded
figures as though computed, to every tenant, as JSON, CSV or PDF ("Overall Survival, predicted effect size 0.42, CI
0.35–0.49, reliability High"; "a minimum sample size of 150 participants per arm"). It is handled in the next commit,
which also closes the blind spot.
