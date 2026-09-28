# SEC-A-3: HTML uploaded as report.pdf ran in the app when opened from Project files

**Finding:** periodic review 2026-09-28, editor family, security lens (high).
Confirmed by its verifier (`../../verification.md`).

## What was wrong

Three things together:
- **Upload.** The vault's upload filter checked the extension. The signature
  check tested the bytes against the *declared* type, which the uploader
  writes, and `text/html` passes as text. Nothing tied the two checks
  together. So `report.pdf` declared `text/html`, with HTML inside, was
  admitted and stored as `text/html`.
- **Download.** The download served the stored type back.
- **Viewer.** The editor's Project files rail framed a file whenever its title
  ended in `.pdf` or the served type said pdf, and it kept the served type
  (`blob.type ? blob : …`). The frame had no `sandbox`. The HTML ran in the
  app's origin, as whoever clicked Open.

## The change

- **Client: the bytes decide.**
  - The viewer reads the response as bytes. `pdfViewerBlob`
    (`client/src/concept2cure/v2/editor/pdfBytes.ts`) returns a blob typed
    `application/pdf` only when the bytes begin `%PDF`.
  - Anything else is downloaded, and the message says why. A file named or
    typed as PDF that is not one is told so.
- **The frame stays unsandboxed, on measured evidence (`browser/`).**
  - Headless Chromium 141 shows its error page instead of the PDF viewer in a
    frame with any `sandbox` value: empty, `allow-same-origin`,
    `allow-scripts allow-same-origin`, and every token at once.
  - The frame `csp` attribute stops the viewer's own script.
  - HTML bytes typed `application/pdf` go to the PDF viewer (0 pages), never
    to the HTML parser.
  - So the frame is made safe by what it is given, and the reason is written
    at the frame.
- **Server: the name binds the type.**
  - `verifyDeclaredTypeForName` (`server/utils/fileSignature.ts`) holds a
    known extension to the types it may be declared as, and to the signature
    its bytes must carry. A `.pdf` must be declared `application/pdf` and
    begin `%PDF`. Case and parameters are ignored.
  - `assertUploadSafe` runs it after the signature check, for every origin,
    and refuses a mismatch with 400 `FILE_TYPE_MISMATCH`. Every vault admission
    passes through `assertUploadSafe`: the HTTP ingest, AnA's filing tool and
    the platform's own exports.
  - `text/html` is not blacklisted. It stays valid for a name that says HTML.
  - Nothing this refuses was accepted before because of the new rule alone.
    `application/octet-stream`, for example, was already refused ("no
    signature check defined").

## Shown failing first

Tests:
- `client/src/concept2cure/v2/editor/__tests__/projectFilesViewer.test.tsx`
  (new, 6);
- `server/routes/__tests__/vault-ingest-type-binding.test.ts` (new, 3). The
  real route, ingest service and upload check run; only the database and
  storage are mocked;
- 8 added to `fileSignature.test.ts`, and 3 to `uploadSafety.test.ts`.

Results:
- `red-vitest.txt`: 15 of 52 fail on the unfixed code.
  - The viewer framed HTML named `.pdf`.
  - It framed `%PDF` bytes as `text/html`.
  - `POST /api/vault/ingest` answered 201 to `report.pdf` declared
    `text/html`.
- `green-vitest.txt`: 52 of 52, and 43 neighbouring suites (every upload
  guard, templates, attachments, vault ingest and download, eSTAR, chat
  uploads). The lead re-ran the four suites in the shared tree: 52 of 52.
- `mutants.txt`: 10 mutants, all caught. The case-sensitivity mutant survived
  the first pass; a refusal for `REPORT.PDF` declared `text/html` was added.
- `eslint.txt`: no warnings added. `typecheck.txt`: whole project, 0 errors.

## Not done here

- **Firefox and Safari were not measured.** Rendering with PDF.js, which is
  already a dependency, would allow a frame with no script at all. That is a
  product decision.
- **Rows stored before this fix keep their stored type.** The viewer is now
  safe regardless. A one-off query can find rows whose extension disagrees
  with `mime_type`.
- **AnA's vault filing accepts extensions outside vault-ingest's allowlist,
  `.html` included.** `admitVaultDocument` should apply the same list.
- **Two upload paths call `verifyFileSignature` directly and skip the name
  check.** They are `server/routes/chat/upload.ts:115` and the authoring image
  upload in `authoring.router.ts`.
- **One duplicated map.** `CLAIMED_EXTENSION_MIME` in
  `server/api/templates/routes.ts` repeats the new table's canonical column,
  and should use it.
- **The deployed site's CSP** (INF-04, no `script-src` on the SPA) remains the
  missing backstop for this class of bug.
