# Quality issues a controlled copy of the version in force, signed and marked, and records it

Row: D2 (W1), workstream MR-12, Stage 8 step 3 (CAT2-24). 21 CFR 820.40 (document controls), ISO 13485 §4.2.4
(obsolete documents) and 21 CFR 11.50 (signature manifestation on the record).

## What already exists

| Piece | Path | What it did before this change | What it did not do |
|---|---|---|---|
| The one renderer | `renderAuthoringExport`, `server/services/authoring/authoring-export.ts` (DOCX through `docx`, PDF through LibreOffice, `pdf-converter.ts`) | Renders a document's sections. A working copy carries a banner on every page. | It had no controlled-copy marking. Its signature section reads `authoring_signatures` only. |
| Authoring's controlled export | `POST /api/authoring/docs/:id/export`; the Download menu in the embedded editor, Quality's only download path | Exports a FROZEN or APPROVED authoring document. A QMS approval sets its authoring document APPROVED. | **On an approved SOP it printed "No electronic signatures are recorded against this document"**, because the QMS approval is in `electronic_signatures`. It had no CONTROLLED COPY marking, number or version. It rendered today's pointer, so it offered only a DRAFT working copy while a revision was open. **It still exported a retired SOP**, whose authoring status stays APPROVED. Its record was not on the QMS ledger. |
| In force and its content | `resolveInForceRelease` (`in-force-release.ts`); `readQmsTrainingReleaseContext` (`current-release-approval.ts`); `qms_document_versions` | Find the version in force, check that its approval stands and that the immutable signed content matches it, and keep that content. | No render path read them. |
| Audited download | `sendAuditedDownload` (`server/services/export/governedExportConsequence.ts`) | Records who, what and the bytes' SHA-256 before sending, and refuses delivery when the record did not persist. Agency response packages already use it. | — |

Searches run:
- "CONTROLLED COPY", "controlled copy", `controlledCopy` and `controlled-copy` across `server/`, `client/src` and
  `shared/`;
- the export, working-copy and file-to-vault routes;
- the Quality register's controls.

## What changed

- **`server/services/qms/controlled-copy.ts`, `renderQmsControlledCopy`.**
  - It finds the version in force: the row while effective, its signed predecessor while a revision is open, and
    nothing once retired.
  - It requires that version's approval to stand and its signed content to verify (`readQmsTrainingReleaseContext`).
  - It requires the reader to be able to read that authored content.
  - It renders that version's own signed sections (`qms_document_versions`) through the one renderer, with
    `controlledCopy`:
    - every page carries "CONTROLLED COPY · SOP-001 v1.0 · effective 2026-09-01 · issued <UTC> to <reader> ·
      uncontrolled when printed";
    - the signature section prints the QMS approval: printed name, UTC time, meaning, the bound content digest and the
      signature record.
  - It refuses with a named reason: `QMS_NOTHING_IN_FORCE`, `QMS_COPY_NOT_AUTHORED`, `QMS_RELEASE_NOT_VERIFIED` or
    `QMS_DOCUMENT_VIEW_DENIED`.
- **`GET /api/mdx/qms/documents/:id/controlled-copy?format=pdf|docx`** (`server/routes/mdx-qms-controlled-copy.ts`,
  mounted by `mdx-qms.ts`) delivers the copy through `sendAuditedDownload`. The copy is not delivered if its record
  does not persist.
- **The renderer** gains `controlledCopy` (banner and manifest). XML is refused for it, as it is for a working copy.
- **Authoring's controlled export and Vault filing of a QMS-bound document are refused**
  (`qmsControlledRenderRefusal`, `QMS_CONTROLLED_COPY_IN_QUALITY`, in `authoringObjectAuthorization.ts`), pointing to
  Quality. Its working copy, marked DRAFT, stays.
- **The register** gains a "Controlled copy" control on every row with a version in force. It downloads the PDF and
  says it was issued and recorded, or gives the server's reason.

## Proof

- **`server/services/qms/__tests__/controlled-copy.test.ts`.**
  - The signed sections are rendered in order, under the title "SOP-001 Complaint handling v1.0".
  - The banner and the manifestation lines are exact.
  - A retired document, an approval whose content changed, and a reader who may not read the content are each refused,
    and nothing is rendered.
- **`server/services/authoring/__tests__/ordinary-authoring-pdf.test.ts`**, "carries the controlled-copy banner on
  every page…".
  - The header and the footer carry the banner.
  - The body prints the approval and not "No electronic signatures are recorded".
  - XML is refused.
- **`server/middleware/__tests__/authoringObjectAuthorization.test.ts`:** the export and the Vault filing of a
  QMS-bound document get a 409 `QMS_CONTROLLED_COPY_IN_QUALITY`, and its working copy passes.
- **Mutations:**
  - removing the middleware branch fails the refusal case;
  - printing the Authoring store instead of the QMS manifest fails the renderer case;
  - both were reverted.
- **Passing:**
  - the Authoring export, working-copy, signature-manifest and freeze-gate route tests;
  - the SopRegister suites;
  - `downloadWorkingCopy` and `authoringCreateExport`;
  - `ci:launch-scope-api` and `ci:sql-interpolation`;
  - `tsc --noEmit`: no error.
