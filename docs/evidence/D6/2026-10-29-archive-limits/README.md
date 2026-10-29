# D6: one archive limit before any server-side inflate (SEC-17, 2026-10-29)

This completes `docs/work-orders/MR-08-vault-upload-safety-and-document-control.md` Stage 3, steps 1(c), 1(d) and 2, which close SEC-17. Stage 3's other steps are open: the `.xsl`/`.pptx` file types, OCR off the request, and the processing sweep.

DOCX, XLSX, PPTX, EPUB and eCTD packages are ZIP archives. Every reader in this server inflates an entry whole into memory: AdmZip, JSZip, mammoth and exceljs. A file of a few kilobytes that expands a thousand-fold was therefore read at full size. That is a decompression bomb, and anyone could send one: an upload, a letterhead template, a document whose text is extracted, a caller-supplied eCTD package to validate, or a prior-sequence archive to import.

## What already exists

Searches run: `inspectZip`, `safeZip`, `assertZipWithinLimits`, `ARCHIVE_LIMITS_EXCEEDED`, `zipLimits`, `ZIP_LIMITS`, `uncompressed`, `ratio`, and every server import of `adm-zip`, `jszip`, `unzipper` and `yauzl`. Deleted history: `git log --all --diff-filter=D` on `*safeZip*` and `*zip*limit*` finds nothing.

- **No archive limit existed anywhere in the server.**
- `assertUploadSafe` (`server/middleware/uploadSafety.ts`) checks the signature, the name binding and clamd. clamd refuses what exceeds its own scan limits (`FILE_SCAN_INCOMPLETE`), but only where clamd is configured, and only at upload.
- `.zip` intake (`392dcbed6`) opens the archive in the browser, and each file inside is uploaded on its own, so the server never inflates those.
- `validateEctdPackage` caps the caller-supplied buffer at 200 MB compressed (`MAX_ZIP_DECODED_BYTES`) and nothing else.
- The template, document-text and legacy-import readers had no bound at all.

## What changed

| Piece | Where |
|---|---|
| **The one helper.** `inspectZip` reads the central directory, ZIP64 included, without inflating. `assertZipWithinLimits` refuses on what the directory declares, and then on what each entry actually expands to. That second step inflates each entry as a counted stream whose output is discarded, and stops at the entry's declared size or the total limit. | `server/services/archive/safeZip.ts` |
| **Uploads** of a ZIP container (by declared type or by its bytes), with 422 `ARCHIVE_LIMITS_EXCEEDED`, before the scan. Bytes this server produced skip it, as they skip the scan. | `assertUploadSafe`, with `isZipContainer` in `server/utils/fileSignature.ts` |
| **Template extraction**, mapped to 422 on the preview and create routes | `extractTemplateFromFile`, `server/routes/c2c/template-upload.ts`, `templates.ts` |
| **Document text extraction**, before mammoth (DOCX) and exceljs (XLSX). A refused file reads as no text, as any extraction failure does. | `server/services/ocr/extractDocumentText.ts` |
| **eCTD package validation** of a caller-supplied package, mapped to 422. The four callers that validate a package this server assembled pass `origin: 'platform-generated'`, the same word `assertUploadSafe` uses, because a real sequence can exceed any upload limit. | `validateEctdPackage`, `server/routes/ectd-export.ts` |
| **Legacy import detection.** A refused archive lists no files and one error finding, so nothing in it is mapped or imported. | `server/services/legacy-importer/detector.ts` |

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | On HEAD, the five call-site cases fail: each site reads an 8 MiB entry compressed about 1000:1. The four ordinary-file cases pass, and must keep passing. |
| `02-green.txt` | **The helper and its call sites:** 22 of 22. **Every suite that touches a changed path:** 1,173 of 1,197 across 83 files; the 24 failures are listed in `04-baseline.txt`. **The authoring upload suite:** 20 of 20, with its fixture corrected (below). **The two dbtests that upload Office files**, on real PostgreSQL 16: 10 of 11, the one failure also listed in `04-baseline.txt`. **Type check:** `tsc` exits 0. |
| `03-mutation.txt` | Six mutations, each caught: <ul><li>declared sizes trusted (no measured step);</li><li>a climbing name admitted;</li><li>the ratio rule removed (it is what catches an honest bomb at the defaults);</li><li>the ZIP64 extra field not read;</li><li>the upload guard skipping the limit;</li><li>an assembled package held to the upload limit.</li></ul> M4 survived its first run: the ZIP64 test read only the end record, because `archiver` writes 32-bit sizes. A case whose directory carries its sizes in the extra field was added, and the rerun is recorded. |
| `04-baseline.txt` | Without this change, the same 24 tests in the same four files fail: <ul><li>`run-pdf`: fonts;</li><li>`founder-path-lineage`: no PDF renderer here;</li><li>`ectd-package-integrity`: its PDF fixture;</li><li>`smoke`: a source-text assertion.</li></ul> `authoring-stability-table` fails the same way too. None is touched here. |
| `05-ratios.txt` | Realistic spreadsheets of 60,000 rows by 20 columns compress 6:1 to 18:1, well under the 100:1 rule. A clinical data listing is not refused by it. |

## Decisions recorded here

- **A measured inflate replaces the work order's bounded per-entry reader.** One check before any inflate also covers mammoth and exceljs, which a reader of our own cannot reach. Declared sizes can lie, so each entry is inflated once as a counted stream: memory stays at one chunk, and the work stops at the entry's declared size. The bytes a reader later inflates are the same buffer.
- **An archive whose directory cannot be read is refused**, not handed to a reader that may parse it differently. This changed one fixture: `authoring-governed-delete-signed-freeze.test.ts` used the ZIP magic followed by junk as a "Word container". That is now refused as unreadable before the scanner, so the fixture is now a real container.
- **Encrypted entries and compression methods other than stored and deflate are refused.** No reader here inflates them.
- **The legacy importer reports a refusal as a finding, not a 422.** Its route records findings on the import job, as it does for an unreadable ZIP. `server/api/templates/routes.ts` extracts nothing, so it needs no mapping.

## Not done

- **MR-08 Stage 3 steps 3 to 6:** the `.xsl` and `.pptx` types, OCR off the request, the processing sweep, and the honest pending state.
- **The RSS acceptance ("process RSS stays under +64 MB") is not measured.** At the defaults, an honest bomb is refused from its directory, before any inflate. A lying one stops at its declared size. A test that built a 200 MB bomb would itself hold 200 MB.
