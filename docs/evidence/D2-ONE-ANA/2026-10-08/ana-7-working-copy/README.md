# Slice 7, server half — pull a draft down, marked as what it is

Launch row **D2**, 2026-10-08. Slice 7 of `docs/design/ONE_ANA_ONE_CANVAS.md` (§4.5).

The founder, 2026-10-07: *"I want to be able to pull them down and see them and work with them and edit them."*

## What was wrong

A document AnA had just built could not be downloaded. The export is a Part 11 filing artifact: it refuses anything not frozen or approved, with a 409 (`authoring.router.ts`, the sealed-record gate). That is right for a filing, and it left a person no way to read a draft away from the screen.

## The decision

A CPO decision, under the founder's delegation of 2026-10-07. A **working copy** is a convenience copy, not a record. The authoring store remains the system of record. It is a different act from the export, and it must never pass for one.

## What changed

**`POST /api/authoring/docs/:docId/working-copy`** with `{ format: 'docx' | 'pdf' }`, for any status.

- **What every page says.** The header and footer of every page read "DRAFT — uncontrolled copy · not a controlled record · <id> · v<n> · <status> · downloaded <UTC time> by <user>":
  - in DOCX, in the header and footer parts;
  - in PDF, stamped by the PDF engine on every page. In every environment that engine is the PDFKit fallback, which applies no CSS. Puppeteer, where present, uses its header and footer templates.
- **No signature manifestation.** In its place: "Uncontrolled working copy. No electronic signature applies to this copy…". A copy of a draft can never print a signature as covering it.
- **File name.** It ends `_working_copy`.
- **One audit row, written before the bytes leave.** One `WORKING_COPY` row in `authoring_audit_trail` (chained by the same writer as every authoring act) records the format, version, status, the delivered bytes' SHA-256 (also returned as `X-Artifact-Sha256`), the content digest and the time. It is written inside a transaction **before** the bytes are sent. When it cannot be written, the answer is 503 `WORKING_COPY_NOT_RECORDED` and nothing is sent.
- **No export-history row.** The Exports tab still lists only controlled acts, and "changed since last export" is not re-based by a working copy.
- **Same permission as the export.** The authoring object-authorization class is `export` (`authoringObjectAuthorization.ts`).
- **POST, not GET.** The CSRF middleware skips GET, and a download that writes an audit row must not be triggerable from another site.

The controlled export is unchanged. The same draft is still refused with 409, and a test pins that.

## Shown

| Tests | Before (`red/`) | After (`green/`) |
|---|---|---|
| `authoringWorkingCopy.test.ts` (new, 6), `renderers-fallback.test.ts` (2 new), `authoringObjectAuthorization.test.ts` (2 new cases) | 8 failed, 32 passed | 40 passed |
| The existing export, vault-filing, saved-sources and renderer suites, and `server/services/authoring` | — | 739 passed (53 files) |

The fallback test reads the PDF back with pdfjs. It finds the banner exactly twice on every page of a document of three or more pages, and stamping it adds no page.

## Not done here

- **The client.** The Download menu replaces the three disabled buttons, with Working copy always available and Controlled export enabled only when sealed, with its reason. That is the client half of this slice; it lands with the canvas work.
- **Process.** Before the first beta client uses this:
  - the document-control SOP needs a definition of a working copy, with QA's concurrence;
  - the validation package (D4) needs an OQ case.

  These are process steps, not code.
