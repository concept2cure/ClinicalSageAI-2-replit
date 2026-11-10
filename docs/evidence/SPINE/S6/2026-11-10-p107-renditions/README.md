# P-107 item 3: a Word version of a Vault document is read as a PDF rendition

2026-11-10. Vault parity lane (S6). Written by a worker of the lane; reviewed, extended and committed by the lead session.

## The decision

`docs/LAUNCH_DEFINITION_OF_DONE.md`, P-107 item 3 (decided 2026-11-08 under the founder's delegation):

> **Renditions:** each version gets a PDF rendition through the existing converter (`pdf-converter.ts`), bound to the
> source version's SHA-256 and shown in the viewer. A rendition is never filed in place of its source.

Before this work the Vault's viewer framed a PDF and downloaded anything else, so a Word version could not be read
in the Vault.

## What already exists

Searched before anything was designed (RULE 3). Each piece, by path, with what it does and does not do.

| Piece | Path | What it does today | What it does not do |
|---|---|---|---|
| The converter | `server/services/pdf-converter.ts` (`convertDocxToPdf`) | Makes a PDF from Word (.docx) bytes with LibreOffice (`libreoffice --headless … --convert-to pdf:writer_pdf_Export`), normalises the PDF's Info metadata, and returns the bytes and their SHA-256. It runs inside one of the process's conversion slots (`server/services/conversion-slots.ts`). It fails by throwing: the program is not installed (spawn `ENOENT`), a non-zero exit, a timeout (60 s), or no output file | It converts Word only: the input is written as `.docx` and exported with Writer's filter. Its other backend renders HTML, which an uploaded file does not have. Its one caller, `server/services/authoring/authoring-export.ts`, gives it Word files this platform built. It had never been given an uploaded file |
| The busy answer | `server/lib/api-response.ts` (`respondIfConverterBusy`) | The one mapping of a converter with no free slot: 503 `CONVERTER_BUSY` with `Retry-After` | |
| The verified reader | `server/routes/c2c/project-vault.ts` (`readVerifiedVaultBytes`) | Reads a version's bytes from the store recorded on its row and refuses them unless they hash to `vault.documents.content_hash`. The download, the seal's verify and closing archive (`readSealedBytes`) and the folder export read through it | |
| The download | `server/routes/c2c/project-vault.ts`, `GET /api/c2c/project-vault/:id/documents/:documentId/download` | Admits the caller through the project gate, looks the version up under the project and the organization with the data-disposition predicate, reads through the verified reader, writes a chained `vault.document.download` row (`recordVaultDownload`) before a byte leaves, and sends the file with `X-Content-SHA256` | It had no way to send anything but the stored file |
| Data disposition | `server/services/document-data-disposition/eligibility.ts` (`vaultBinaryAvailableSql`) | Withholds a version's file at read time when a disposition names it. The bytes stay in the store | |
| The object store | `server/services/storage/` (`IStorageProvider`: `put`, `get`, `delete`, `list`; local disk and S3) | The Vault's ingest stores each version under `{organization}/{program}/versions/{random id}`; the row keeps the id (`storage_version_id`) | An object is found by the id on a Vault row. Nothing finds an object no row names |
| The tenant purge | `server/services/tenant/tenant-offboarding.ts` (`eraseStoredObjects`) | Erases the stored objects of the Vault rows it deleted (`purge_tenant_vault_records` returns each row's `storage_version_id`) | It does not erase an object no Vault row names |
| The viewer | `client/src/concept2cure/v2/editor/vaultPdfViewer.tsx` | The one place the client frames anything. It fetches through the download above and frames only bytes that begin `%PDF`, typed `application/pdf` | It showed PDFs only |
| The Vault's viewer | `client/src/concept2cure/v2/surfaces/VaultVersionViewer.tsx` | View on a version row (`VaultVersions.tsx`) and Open on a seal's holding (`VaultSeals.tsx`) | It offered View only for a file named as a PDF |
| The files rail's viewer | `client/src/concept2cure/v2/editor/ProjectFilesPanel.tsx` | The same viewer on the editor's Project files rail and Project home's Evidence | Not changed here (see "Not done here") |
| "Rendition" elsewhere | `server/services/authoring/authoring-file-to-vault.ts` | Files an editor document's PDF or Word export into the Vault as a version. There the PDF is the record | It is not a reading copy of a Vault version. Not touched |
| "Preview" elsewhere | `server/services/vault/document-catalog-preview.ts` | A check of catalog facts against a source's text | It is not a preview of a file. Not touched |
| P-112 (zip, compress, combine) | `server/services/pdf-compression-service.ts`, `server/services/vault/vault-archive-builder.ts` | Compression with Ghostscript; the folder export and the seal's archive | `.design/claude-convergence/COORDINATION.md` shows the market-readiness session holding no file; P-112 items 2 to 4 are this lane's, later. Nothing of P-112 was touched |

No rendition, preview or thumbnail of a Vault file existed.

Searches run:

- `grep -rIl -i rendition` over `server`, `client`, `shared`, `migrations`, `db`, `scripts`: 33 files before this
  work. None is a reading copy of a Vault version. They are the editor's exports filed into the Vault and what
  follows them (data disposition's count of them, approval carry-over), the eCTD packager's derivations, a
  plain-text export, and signature and lifecycle text that uses the word;
- `git log --all --diff-filter=D --name-only | grep -i -E "rendition|preview"`: no line. **The clone is shallow
  (`git rev-parse --is-shallow-repository` is `true`, 626 commits), so history older than that was not searched;**
- `git ls-files | grep -i -E "preview|viewer|thumbnail"`, narrowed to Vault, PDF and Word names;
- `grep -rn pdf-converter` and `grep -rln "soffice|libreoffice"` for the converter's callers;
- `grep -rln getStorageProvider`, and the readers of `storage_version_id`, for who writes and erases stored objects;
- `grep -rn recordVaultDownload` and `vault.document.download` for who writes and reads the download row.

## What changed

**The server.** `GET …/download?rendition=pdf` returns the PDF rendition of the version.

- `server/services/vault/vault-pdf-rendition.ts` (new file in the Vault's folder): `makeVaultPdfRendition` makes the
  rendition from the bytes it is given, through `convertDocxToPdf` with the LibreOffice backend, or says why there is
  none. It writes nothing: it reaches no store and no database.
- `server/routes/c2c/project-vault.ts`: four lines in the download handler, after the verified reader has returned
  the bytes, and one helper beside `recordVaultDownload` (`sendVaultPdfRendition`). Nothing else in that file.

How each required property holds:

| Property | How |
|---|---|
| Bound to the source's SHA-256 | The rendition is made in the same request, from the bytes the verified reader just returned, and only when they hash to the version's recorded SHA-256. The response names that hash (`X-Rendition-Source-SHA256`) and the rendition's own (`X-Rendition-SHA256`). It carries no `X-Content-SHA256`: the bytes sent are not the record's. The service checks the hash itself as well (`CONTENT_HASH_MISMATCH`), and refuses a version with no recorded hash (`RENDITION_SOURCE_UNBOUND`) |
| Refused exactly as the source | The branch sits after every check of the source handler, so a refused source never reaches it. Same status and body, nothing converted, nothing recorded |
| A file the converter cannot convert, or a missing converter, is said as that | `RENDITION_NOT_SUPPORTED` (409), `RENDITION_LINKS_OUTSIDE_FILE` (409), `RENDITION_CONVERTER_UNAVAILABLE` (503), `RENDITION_FAILED` (422, also when the converter returns no bytes or bytes that are not a PDF), `CONVERTER_BUSY` (503 with `Retry-After`). Each is JSON with a sentence. The source download is unchanged |
| A PDF source gets none | `RENDITION_NOT_NEEDED` (409). The bytes decide, as in the viewer |
| Only a PDF is asked for | Any other `?rendition=` value is `RENDITION_FORMAT_UNSUPPORTED` (400), after the source's own checks |
| Never filed, placed, sealed or exported | It is never stored and never a Vault row. Only the download reaches the module (a test scans the server for any other importer) |
| Viewing is recorded as the source download is | Through `recordVaultDownload`, before a byte leaves; refused with `AUDIT_WRITE_FAILED` when the row cannot be written |

**Three things differ from the shape the task expected. Each is a finding, not a preference.**

1. **The rendition is not kept.** The expected shape kept it in the object store under a key made from the source's
   SHA-256. A copy kept that way is named by no Vault row. The tenant purge erases the objects Vault rows name, so it
   would leave that copy behind; a data disposition withholds a version by its row, and would not reach it either.
   Made per request, there is no second copy to purge, withhold or go stale. The cost is a conversion on every view:
   about 1.5 to 2 seconds here for a one-page file, in one of the process's two conversion slots.
2. **Only Word (.docx) has a rendition.** The existing converter converts nothing else. A workbook, a presentation,
   a legacy `.doc` and a text file are answered `RENDITION_NOT_SUPPORTED`, and the viewer downloads them as before.
3. **A Word file that links to content outside itself is not converted, hyperlinks included.** While converting,
   LibreOffice requests what an uploaded file links to. Measured here (`04-linked-content-probe.txt`): a linked
   image named by an external relationship was requested over HTTP, also when the relationship was typed as a
   hyperlink, and also when its `TargetMode` was written with a character reference. An upload could so make the
   server call an address inside its own network. The converter had only ever been given files this platform built,
   so this is new with renditions. `vault-pdf-rendition.ts` therefore opens the file within the archive limits
   (`server/services/archive/safeZip.ts`) and refuses it when any relationship part carries a `TargetMode` other
   than `Internal`, is not plain UTF-8 XML, or carries a DOCTYPE, or when two entries share a name. A Word file
   with an ordinary web link in it is refused too, because the type does not stop the request. This closes the
   route that was measured. It is not the whole control (see "Not done here", 1).

**The client.**

- `client/src/concept2cure/v2/editor/vaultPdfViewer.tsx`: `fetchVaultRendition` asks the same route with
  `?rendition=pdf`. A response is framed only when the Vault marks it as a rendition, names the source it was made
  from, and its bytes begin `%PDF`. `PdfFrame` then says what it is in place of the hash line: "PDF rendition of
  *title*, made from the source file with SHA-256 … This is a copy for reading, not the filed document. Download the
  version for the source file. Rendition SHA-256 …". The frame is titled "*title* — PDF rendition". Also: a note
  built from the Vault's sentence no longer ends with two full stops.
- `client/src/concept2cure/v2/surfaces/VaultVersionViewer.tsx`: a version named `.docx` is offered **View as PDF**.
  The hook's `view` takes the file name as an optional fourth argument:
  - with it, a Word version is asked for as its rendition only;
  - without it (how `VaultVersions.tsx` and `VaultSeals.tsx` call it today), the version is fetched first, and when it
    is a Word file its rendition is fetched and framed, with **Download the source** beside it, which saves the bytes
    already fetched. When there is no rendition, the Word file is handed to the browser as before and the note says
    why in the Vault's words.

No new table, column, route file, mount, screen or AnA tool. No migration.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The new tests on the unchanged code: 32 failed, 17 passed, and the service's suite (41 tests) could not load because its module did not exist. The 17 are guards that are true of the unchanged code too; they are listed |
| `01b-mutation.txt` | Guards seen failing. A: with the rendition made before the verified reader, five of the route's twelve refusal guards fail. B: each rule of the outside-content check taken out in turn, and the test that then fails |
| `02-green.txt` | The new tests on the changed code: 90 passed, 0 failed (41 service with the converter stubbed, 4 with the real converter, 28 route, 12 viewer, 5 on PostgreSQL 16 as the runtime role with RLS on, through the real ingest and download routes) |
| `03-suites.txt` | The existing suites over the changed files, none edited: 34 files, 373 tests (viewer, download, seals, archives, converter); 2 files, 31 tests (archive limits); 4 files, 90 tests on PostgreSQL (versions, seals, folder export, project access). And the gates, each OK |
| `04-linked-content-probe.txt` | What LibreOffice requested while converting hand-written Word files, and that it requests nothing with `BlockUntrustedRefererLinks` set |
| `05-converter-red.txt` | The real converter on trunk, given a Word file with a linked picture: it called the listener |
| `06-converter-green.txt` | The same test after the converter's change: nothing requested, the PDF written |
| `running-app-rendition.png`, `running-app-refused.png` | The rendition framed in the Vault; a Word file with a web link refused in words |

LibreOffice is installed where this ran (24.2.7.2), so the real conversion ran. Where it is not, the two real
conversions skip, and the PostgreSQL test expects the Vault to say so (503).

ESLint warnings, before and after: `project-vault.ts` 6 at HEAD and 6 in the working tree (the download handler
was already over the complexity limit at 21 and is 22, the same one warning); the two client files 0 and 0; the
new files 0. `check-eslint-warning-ratchet.mjs --since HEAD`: no file changed its count. `ci:sql-interpolation`:
count unchanged.

## Added by the lead session (2026-11-10)

- **The converter no longer requests linked content.** `server/services/pdf-converter.ts` writes
  `BlockUntrustedRefererLinks=true` into the profile it makes for each run, and does not start LibreOffice when that
  cannot be written. `05-converter-red.txt`: the real converter on trunk requested a linked picture from a loopback
  listener, also when the relationship was declared a hyperlink. `06-converter-green.txt`: with the setting it
  requests nothing and still writes the PDF (`server/services/__tests__/pdf-converter.linked-content.real.test.ts`).
  This protects every conversion, not only renditions. The Vault's own refusal stays as a second layer.
  The converter's other suites are unchanged by it: 19 files, 274 tests pass. Two files (9 tests) fail the same way
  with trunk's converter in this container, because the reporting PDF fonts are not installed here.
- **The audit row says what left.** `recordVaultDownload` takes an optional `rendition` (`format`, `sha256`), and a
  rendition's row carries it beside the source's hash. A source download's row names no rendition. Red first in
  `server/routes/__tests__/vault-download-rendition.test.ts`, and asserted on PostgreSQL in
  `tests/db/vault-pdf-rendition.dbtest.ts`.
- **Opened and used in the running app** (`running-app-rendition.png`, `running-app-refused.png`). Two Word files
  were added to a demo project's Vault. The first showed "View as PDF" on its version, and the pane framed "SP-014
  stability protocol v1.0 — PDF rendition" with the note naming the source's SHA-256, "a copy for reading, not the
  filed document", and the rendition's own SHA-256. The second holds a web link: the Vault answered "This Word file
  links to content outside the file, so the Vault does not convert it. The version itself can still be downloaded."
  and framed nothing. Seen while there: the pane is narrow inside the record panel, as it is for a PDF version.

## Not done here

1. **A Word file with a web link has no rendition yet.** The refusal `RENDITION_LINKS_OUTSIDE_FILE` covers every
   relationship that names something outside the file, ordinary hyperlinks included, and most real documents hold
   one. It can be narrowed now that the converter itself blocks linked content (see "Added by the lead session"),
   but that would leave hyperlink relationships resting on the converter's setting alone: a picture can be linked
   through a relationship declared as a hyperlink. Whether to accept that, or to convert a copy with its link
   targets taken out, is a security decision for the coordinator, and it is not made here.
   Not verified: whether the deployed task can reach internal addresses at all, and whether LibreOffice requests
   anything by a route the probe did not try. LibreOffice parsing an uploaded file is itself a risk the platform had
   not taken before; it deserves a security review before renditions reach customers.
2. **The audit trail's reading of the row.** The row now says a rendition left (see "Added by the lead session").
   `server/routes/audit-trail-ledger.routes.ts` still words every such row "Downloaded"; it could say "Viewed as a
   PDF rendition".
3. **A Word version is fetched twice on the Vault's Versions list.** `VaultVersions.tsx` does not pass the file name
   to `view`, so the Word file is fetched, then its rendition: two requests and two download rows for one click.
   Passing the name makes it one request, and it also changes what the pane offers (no source file beside the
   rendition, nothing handed over on a refusal), which five of this suite's cases pin. The lead tried it and put it
   back; it needs those cases rewritten with it.
4. **The Project files rail and Project home's Evidence still download a Word file.** `ProjectFilesPanel.tsx` calls
   `downloadVaultFile` only. Reaching the rendition there is the same few lines as in `VaultVersionViewer.tsx`.
5. **Keeping a rendition** needs a record of it that the tenant purge and a data disposition can follow. The
   smallest is three guarded, nullable columns on `vault.documents` (the rendition's store id, its store and its
   SHA-256), with `purge_tenant_vault_records` returning the store id and `eraseStoredObjects` erasing it. That is a
   schema change and edits to files outside this work, so it was not made.
6. **Workbooks, presentations, `.doc`, `.rtf`** have no rendition. The converter would have to take them.
8. **`tsc` was not run** (the lead session runs it).
9. Seven of the route's refusal guards (the caller, the project, the version's row, and the lookup statement) pass
   on the unchanged code and were not seen failing: no mistake was put in ahead of those refusals.
10. A conversion that passes the converter's 60 seconds is answered `RENDITION_FAILED`, the same words as any other
    failed conversion. Large Word files were not timed.
