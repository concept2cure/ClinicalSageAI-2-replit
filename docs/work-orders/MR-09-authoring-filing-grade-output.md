# MR-09 — Authoring: filing-grade output, SSO signing, Vault-grounded drafting

| | |
|---|---|
| Phase | Phase 1 (Stages 1–3) · Phase 2 (Stage 4) · Phase 3 (Stages 5–9) · Backlog (Stage 10) |
| Highest open severity at head | P1 |
| Human testing | Degrades: Authoring journey 3. Export and File to Vault produce plain-text or uncontrolled output (CAT1-02, CAT1-09, CAT1-16). The editor's AI draft ignores the Vault (CAT1-08). Templates are missing (CAT1-20). Editing lacks Word parity (UX-16). The review dialog looks like a signature (UX-17). Also degrades Submission Center journey 4 step 2, placing the approved document (CAT1-18). Not observable with invited password accounts: CAT1-03. Not observable in testing: CAT1-12, CAT1-22, CAT1-23. |
| Owner | engineering (founder decisions gate Stages 1, 3, 5, 6 and 9) |
| Effort | XL in total: M + M + M + M + M + M + S + XL + M + M. The pilot path (Stages 1–4) is M + M + M + M. |
| Depends on | MR-02, MR-08, MR-13 (Stages 3–4); MR-06, MR-16 (Stage 6); MR-10, MR-17 (coordination); F-5, F-10, F-12, F-13, F-16, F-24, F-27; four NEW decisions |
| Findings | 12 total — open 11 · partially fixed 1 · fixed 0 · refuted 0 · unverifiable 0 |
| Basis | cold audit at `92ccdba1`, re-verified at `94b4f9238` on 2026-10-13 — [evidence](../evidence/reviews/2026-10-13-market-readiness/) · [findings register](MR-findings-2026-10-13.json) |

## Goal

A regulatory writer drafts a section from the project's own Vault evidence, and every cited claim traces to a Vault document, version and page. The writer gets it reviewed and signed, including when the company signs in through its identity provider. They export a Word file and a PDF that can go into an FDA eCTD v3.2.2 sequence as they are, carrying:

- document ID, version and status on every page;
- "Page X of Y";
- a table of contents and bookmarks;
- embedded fonts;
- US Letter page size.

Placing the document into a sequence files the same formatted PDF the Vault holds. That is one step: it either completes or leaves nothing behind.

## Why it matters

- **No PDF from Authoring is fileable today.** Every export is a plain-text rendering stamped "Do not file this rendering as the formatted document". The pilot's deliverable is a v3.2.2 sequence, which is made of PDFs. Without this order, the customer converts Word to PDF outside the system, so the file they submit is not the file the export record hashes. Outsourced publishing costs $5k–$25k per sequence, and the pilot replaces one only if this output can be filed.
- **The controlled Word export has no document control.** It has no header, footer, page numbers or TOC, and it is A4. A writer who adds these in Word breaks the SHA-256 the export record attests (§11.10(b)). The file that circulates is then no longer the controlled record.
- **"Draft from sources" ignores the project's Vault.** The editor's AI draft never reads the Vault and searches every project in the organisation, so a program-A draft can cite program-B material. The screen still says "this project's Data Room". The pilot's success criterion is that every factual statement resolves to a Vault citation.
- **What FDA would receive for an authored document is a text rendering.** Placement makes a co-author snapshot, and the packager renders it as text (`renderLeafPdf`). The snapshot is made by two client calls, and a failure between them leaves an orphan filing copy.
- **A customer that mandates SSO cannot sign anything:** not in Authoring, not a Submission release, not a QMS record. The only way around it is "Forgot password", which gives an SSO account a local password the identity provider does not control.

## State at head

| Finding | Status at head | Severity (pilot) | Tester impact | Evidence at head |
|---|---|---|---|---|
| CAT1-02 | STILL_OPEN | P1 | Degrades | `server/services/authoring/authoring-export.ts:552` renders through `renderHtmlToPdfTracked`; neither `puppeteer` nor `puppeteer-core` is installed (`package.json:615` has only `puppeteer-cluster`), so `server/export/renderers.ts:394` falls back to a plain-text PDF headed by `FALLBACK_PDF_NOTICE` (`:458`) |
| CAT1-03 | STILL_OPEN | P2 (P0 if the partner mandates SSO) | Not with invited accounts | `server/routes/sso.ts:922` and `scim.ts:840` store `saml:`/`scim:` placeholder hashes; `server/services/part11/reverify-signer.ts:151-245` admits a signer only on a bcrypt match; `auth.ts:2335` forgot-password has no SSO exclusion |
| CAT1-08 | STILL_OPEN | P1 | Degrades | `server/routes/authoring.router.ts:3842` calls `searchHybrid` over `lumen_data_atoms` with no project; `client/src/concept2cure/v2/surfaces/AuthoringAiDraft.tsx:573` says "this project's Data Room" |
| CAT1-09 | STILL_OPEN | P1 | Degrades | `authoring-export.ts:475-485`: a controlled export is `{ children }` with no header, footer, `PageNumber`, TOC or page size (docx default A4, 11906×16838) |
| CAT1-12 | STILL_OPEN | P2 | No | `client/src/flags/featureFlags.ts:73-81` `ENABLE_LIVE_COEDITING` is compile-time `false`; presence is durable but demotes for good to a per-process `Map` (`server/routes/realtime-collab.ts:307`, `:530-560`) |
| CAT1-16 | STILL_OPEN | P2 | Degrades | `renderDocxWithTemplate` is called only from `server/routes/c2c/templates.ts:296`; authoring export takes no template. The draft-export half is delivered by the working copy (see below) |
| CAT1-18 | STILL_OPEN | P2 | Degrades | `client/src/concept2cure/v2/surfaces/AuthoringPlaceIntoFiling.tsx:276` snapshot, then `:286` a separate `PUT …/leaves`; the leaf renders through `renderLeafPdf` (`server/services/ectd/leaf-source-resolver.ts:502`) |
| CAT1-20 | STILL_OPEN | P2 | Degrades | `server/startup/services.ts:409-422` seeds `template-seeds.ts` at boot, not via `C2C_MIGRATION_FILES`; no 2.3, 2.4, 2.6, 2.7.1, 2.7.2, 2.7.4, CSR (E3) or DSUR template |
| CAT1-22 | STILL_OPEN | P3 | No | `client/src/concept2cure/v2/surfaces/AuthoringRevisionDiff.tsx:40` diffs one section against the previous revision only |
| CAT1-23 | STILL_OPEN | P3 | No | No footnote insert command in `client/src/concept2cure/v2/editor/`; the export already writes `<sup data-note>` as Word footnotes (`server/export/authoring-section-content.ts:379-382`) |
| UX-16 | STILL_OPEN | P2 | Degrades | `RichSectionEditor.tsx:2290,2839`: formatting and structural changes "apply directly and are not tracked"; a 409 save conflict says "reload and reapply" (`DocumentWorkbench.tsx:3037-3044`); no spellcheck or footnotes |
| UX-17 | PARTIALLY_FIXED | P2 | Degrades | `client/src/concept2cure/v2/surfaces/Review.tsx:256` verdict dialog uses `esign-modal` and a lock icon; `:1013-1016` renders an "NN% confidence" badge (the only producer, `server/services/review/authoring-review-board.ts:564`, sends `null`) |

## Already done at head — do not redo

No finding in this order is fixed or refuted at head. The partial deliveries below are in place. Build on them and do not rebuild them.

- **PDF honesty (`a056eb9ea`, `b86baf55e`).** These work alongside each other:
  - the export record carries `rendering` (`authoring.router.ts:6674`);
  - the response sends `X-Export-Rendering` (`:6684`);
  - the client shows an error toast for a fallback (`AuthoringCreateExport.tsx:401-404`);
  - File to Vault refuses a plain-text PDF with 503 `PDF_RENDERER_UNAVAILABLE` (`authoring-file-to-vault.ts:478`).

  These stay as guards after Stage 2.
- **Uncontrolled working copy (`1a8ebb3ae`).** `POST /api/authoring/docs/:docId/working-copy` (`authoring.router.ts:6712`) and `client/src/concept2cure/v2/editor/DownloadMenu.tsx` deliver the "draft Word export" half of CAT1-16. They work at any status, print a DRAFT banner on every page, render no signature manifest, and audit the download before the bytes leave. Do not add a second draft-export path. Stage 5 adds only the template half.
- **Tenant-keyed retrieval (`b1618c69f`) and an always-on passage index (`1d5de6ca6`).** The AI draft refuses to search without the session's tenant key (`authoring.router.ts:3835-3840`). Vault passages are indexed on every ingest with no flag or key. The project-scoped `searchDocumentPassages` (`server/services/vault/document-passage-search.ts:217`) is the target of Stage 3.
- **Review banner.** `Review.tsx:1029` already says decisions on that surface are not electronic signatures.
- **Durable collaboration state.** Presence is stored in `collab_presence` (`db/migrations/20261001_collab_presence.sql`) and CRDT state in `collab_document_state` (`server/services/collab/collab-state.store.ts`). Stage 9 builds on both.

## Work, in order

### Stage 1 — The controlled Word export carries document control (Phase 1 · M · engineering) — closes CAT1-09

The PDF in Stage 2 is derived from this DOCX, so this stage comes first. Its header, footer, TOC and page size then reach both formats from one place.

1. Work on `concept2cure-v2` only, and merge, never rebase. Write the failing test first: `server/services/authoring/__tests__/authoring-export-docx-layout.test.ts`.
   - Call `renderAuthoringExport` (`authoring-export.ts:565`) with:
     - a stub executor `{ query: async () => ({ rows: [], rowCount: 0 }) }`;
     - doc `{ id: 'D1', title: 'Clinical Overview', status: 'APPROVED', version: 4, versionLabel: 'v4.frozen' }`;
     - two sections coded 2.5.1 and 2.5.2;
     - `format: 'docx'` and `signatures: []`.
   - Unzip the result with JSZip, as `server/routes/__tests__/authoringWorkingCopy.test.ts:112-125` does.
   - Assert all of the following:
     - a `word/header*.xml` containing `D1`, `v4.frozen` and `APPROVED`;
     - a `word/footer*.xml` with both a `PAGE` and a `NUMPAGES` field, plus the confidentiality text;
     - a `TOC \o "1-3"` field instruction in `document.xml`;
     - `updateFields` in `word/settings.xml`;
     - `<w:pgSz w:w="12240" w:h="15840"` (Letter);
     - `Times New Roman` as the default run font in `word/styles.xml`.
   - Run it at HEAD and record the red: no header or footer parts, no fields, and `pgSz` 11906×16838.
2. Give the style model a page size in one place:
   - **`server/services/docx/docxFactory.ts`:** add `page: { size: 'letter' | 'a4' | 'legal'; orientation: 'portrait' | 'landscape' }` to `DocxStyle` (`:63`) and `{ size: 'letter', orientation: 'portrait' }` to `DEFAULT_DOCX_STYLE`.
   - **`templateSpecToDocxStyle` (`server/services/templates/templateRenderAdapter.ts:39`):** map `spec.page.size` and `spec.page.orientation`. It ignores both today.
   - **`generateRegulatory`:** set `page.size` in its section properties (`docxFactory.ts:612-623`). It sets none today, so every Template Library DOCX is A4 whatever its spec says.

   Do not create a second style table.
3. Use one running header and footer. Move the header and footer construction out of `generateRegulatory` (`docxFactory.ts:553-590` and `:624-643`) into an exported `runningHeaderFooter(style, { headerLine, footerLabel, banner? })`.
   - It returns `{ headers: { default }, footers: { default } }`.
   - Footer: the label, then `['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES]` when `footerShowPageNumbers`.
   - When a `banner` is passed, it adds the banner as its own bold paragraph in both header and footer.
   - `generateRegulatory` calls it with today's arguments (`headerText ?? title — submissionType`, `footerText ?? 'CONFIDENTIAL'`), so its output is unchanged. Its existing tests must stay green.
4. Thread the new arguments through `server/services/authoring/authoring-export.ts`:
   - Add `versionLabel?: string | null` to `ExportDocRow` (`:24`), and `formatting?: TemplateSpec` to `RenderExportArgs` (`:59`). The default is `normalizeTemplateSpec(DEFAULT_TEMPLATE_SPEC)` (`server/services/templates/templateSpec.ts:150`).
   - In `renderDocx`, derive `const style = templateSpecToDocxStyle(spec)` once.
   - The callers pass `versionLabel` as follows:
     - **Export route** (`authoring.router.ts:6563-6566`): read the latest `frozen_documents.version` for the document (tenant-scoped). This is the label the manifest prints as "Covers: frozen version …", and freeze sets it as `v<version>.frozen` (`:5104`).
     - **Working-copy route** (`:6726`): pass `v${doc.version ?? 1}`.
     - **File-to-vault** (`authoring-file-to-vault.ts`, `DocRow` at `:101`): pass the frozen label when sealed, otherwise `v<version>`.
5. In `renderDocx`, replace the `sections` ternary (`authoring-export.ts:475-485`) with one section that always has:
   - `properties: { page: { size, orientation, margin: style.margins, pageNumbers: { start: 1 } } }`;
   - the headers and footers from `runningHeaderFooter(style, …)`:
     - header line: `<title> · Document ID <id> · Version <versionLabel> · <STATUS>`, with `spec.header.text` appended when it is set;
     - footer label: `spec.brand.confidentialityNotice ?? spec.footer.text`;
     - banner: `args.workingCopy?.banner`.

   Keep the working copy's signature statement (`:451-462`) exactly as it is.
6. Insert a "Table of Contents" paragraph after the title, notice and redline paragraphs (after `:419`), followed by `new docxNs.TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-3' })`. Section headings are already `HEADING_1` (`server/export/authoring-blocks-to-docx.ts:261-264`). Then extend the `Document` at `:464`:
   - add `features: { updateFields: true }`;
   - add `styles: { default: { document: { run: { font: style.fonts.body, size: style.fontSizes.body } } }, paragraphStyles: [Heading1–3 from style.fonts.heading and fontSizes.heading1–3] }`.
7. Re-run the new test (now green), then these, which must all pass:
   - `authoringWorkingCopy.test.ts`: its DOCX assertions unchanged;
   - `authoringExportDocx.test.ts`;
   - `authoringExportSignatureManifest.test.ts`;
   - `authoring-export-xml-figures.test.ts`;
   - the `docxFactory` and Template Library tests.

**Acceptance**
- Failing first: the step 1 test is shown red at HEAD with the values above, then green.
- A controlled DOCX of an APPROVED document has:
  - on every page, a header with title, document ID, frozen version label and status;
  - a footer with the confidentiality text and `PAGE` / `NUMPAGES` fields;
  - a TOC field over Heading 1–3 that Word fills on open;
  - Letter page size;
  - body and heading fonts from `DEFAULT_TEMPLATE_SPEC` in `styles.xml`.
- The header's version equals the manifest's "Covers: frozen version" line. The test asserts both.
- The working-copy DOCX has the same header and footer, plus the bold DRAFT banner at top and bottom, and no signature manifest.
- A Template Library DOCX rendered from a spec with `page.size: 'letter'` has a Letter `pgSz`. This is red at HEAD, where it is A4.
- A File-to-Vault DOCX carries the same header and footer, because it uses the same renderer.

### Stage 2 — PDF from the controlled DOCX, through the LibreOffice already in the image (Phase 1 · M · engineering) — closes CAT1-02

`Dockerfile.optimized:64-76` already installs `libreoffice-writer` and `fonts-liberation`, and `server/services/docx-pdf-pipeline.ts` already runs it, for AnA's tools. The authoring PDF becomes that DOCX converted, so DOCX and PDF of one record cannot disagree.

1. Write the failing test first: `server/services/authoring/__tests__/authoring-export-pdf-render.test.ts`.
   - Call `renderAuthoringExport({ format: 'pdf', … })` on two sections, each with a heading, plus one table.
   - Assert, using `pdf-lib` and `pdfjs-dist` (both already dependencies):
     - `rendering === 'formatted'`;
     - no `FALLBACK_PDF_NOTICE` in the extracted text;
     - one `/Outlines` entry per section heading;
     - a 612×792 media box;
     - "Page 1 of" and the document ID on page 1;
     - a TOC page that lists both section headings.
   - CI runners do not have LibreOffice today: `.github/workflows/ci.yml` installs only `postgresql-client libxml2-utils` in `test` (`:67`). Add `libreoffice-writer fonts-liberation` to that `apt-get` line.
   - Make the test **fail, not skip**, when `CI=true` and `soffice` does not resolve, so the gate cannot pass by not running.
   - Record it red at HEAD (`plain-text-fallback`).
2. Replace `renderPdf` (`authoring-export.ts:498-562`):
   - call `renderDocx(args, shared)` with the same args, `workingCopy` included;
   - write the buffer to `input.docx` in `fs.mkdtemp(os.tmpdir())`;
   - call `runDocxPdfPipeline({ inputDocxPath, outputPdfPath })`;
   - read `finalPdf`, remove the temp directory in `finally`, and return `rendering: 'formatted'`.

   Then clean up behind it:
   - Remove the HTML branch and the `renderHtmlToPdfTracked` import from the authoring path.
   - `server/export/authoring-blocks-to-html.ts` is imported in production only by `authoring-export.ts:508`. When that import is gone, delete the module. Port each test under `server/export/__tests__/` that imports it onto the DOCX renderer: keep the DOCX assertions, and move HTML-only ones onto the PDF's extracted text. Name the replacement (`renderDocx` → `runDocxPdfPipeline`) and its gate (the step 1 test) in the commit.
   - `server/export/renderers.ts` stays for its other callers (`server/workers/ivdr-pack-worker.ts:444`, `server/routes/c2c/templates.ts:306`, `server/services/pdf-converter.ts:186`).
3. Set PDF export options without changing other callers. In `server/scripts/docx_pdf_pipeline.py`:
   - Add an optional `--pdf-export-options <json>` argument. When it is present, convert with `pdf:writer_pdf_Export:<json>` instead of `pdf` (`:67-78`).
   - Pass `{"ExportBookmarks":{"type":"boolean","value":"true"},"UseTaggedPDF":{"type":"boolean","value":"true"},"EmbedStandardFonts":{"type":"boolean","value":"true"}}`.
   - Expose it as `exportOptions` on `DocxPdfPipelineOptions` (`docx-pdf-pipeline.ts:4`).
   - AnA's tools and `masterDocumentBuilder` keep today's default.
   - The JSON form needs LibreOffice 7.4 or later. `node:22-slim` is Debian 12. Record the output of `docker run --rm c2c-app:ci soffice --version` in the evidence.
4. Make sure the TOC is filled. The `docx` library writes the TOC field with no entries. Word fills it on open (`updateFields`), but headless LibreOffice may not. The step 1 test catches an empty TOC. If it is empty, update the indexes during conversion:
   - in `docx_pdf_pipeline.py`, load the document over UNO, call `update()` on each `DocumentIndexes` entry, and `storeToURL` with the `writer_pdf_Export` filter data from step 3;
   - add `python3-uno` to `Dockerfile.optimized` and to the CI `apt-get` line.

   Do not compute TOC entries in TypeScript.
5. Fail closed:
   - Wrap every pipeline failure (no `soffice`, the 120 s timeout at `docx-pdf-pipeline.ts:14`, a non-zero exit) in a `PdfRendererUnavailableError` with code `PDF_RENDERER_UNAVAILABLE`, exported from `authoring-export.ts`.
   - **Export route:** `sendExportFailure` (`authoring.router.ts:6524`) maps it to 503 `{ code: 'PDF_RENDERER_UNAVAILABLE', message: 'The PDF renderer is not available here. Nothing was exported. Word (.docx) export is available.' }`. Rendering runs inside `withSavedDraftSourceReservation`'s transaction, so the `EXPORT` audit row rolls back with it.
   - **Working-copy route** (`:6766`): the same 503.
   - **`renderForVaultFiling`** (`authoring-file-to-vault.ts:423-436`): catch it and `refuse(503, 'PDF_RENDERER_UNAVAILABLE', …)`. Reword `PDF_FALLBACK_REFUSAL` (`:117-119`) so it no longer mentions a plain-text rendering.
   - Keep the guard at `:478`.
   - Delete the PDFKit fallback from the authoring path entirely, so nothing labelled `formatted` can be plain text.
6. Allow at most two `soffice` conversions per process: add a semaphore in `docx-pdf-pipeline.ts`. Further requests queue inside the same timeout.
7. Check fonts and outline with one checker, not two. If MR-10 has landed `server/services/ectd/leaf-pdf-preflight.ts` (`assessLeafPdfConformance`, finding CAT2-11), call it from the test and from the smoke. If not, create that module with its font-embedding and outline rules first, using the signature MR-10's instructions give, and say so on MR-10's claim line in `docs/work-orders/README.md` §0.
8. Gate the production image. Extend `production-image-boot` (`ci.yml:2101`) with a step that runs a new `scripts/ci/image-authoring-pdf-export.mjs` inside `c2c-app:ci`, mounted the way `scripts/ci/image-boot-signin.mjs` is. The script:
   - seeds one APPROVED authoring document with two sections and a table in `c2c_image`, plus its `frozen_documents` row;
   - signs in and calls `POST /api/authoring/docs/:id/export {format:'pdf'}`;
   - requires `X-Export-Rendering: formatted`, a `%PDF-` header, two outline entries, every font embedded, and Letter size.

   Show the step failing on HEAD's image first (`plain-text-fallback`).
9. Client: in `client/src/concept2cure/v2/surfaces/AuthoringCreateExport.tsx` (`:390-430`), show the server's message for a 503 `PDF_RENDERER_UNAVAILABLE`. Keep the `X-Export-Rendering` toast (`:401-404`) as a guard.
10. Update the existing route tests:
    - `server/routes/__tests__/authoringExportPdf.test.ts` (`:16-32`) and `authoringWorkingCopy.test.ts` (`:26-38`, `:99-107`) mock `renderers`. Mock `runDocxPdfPipeline` instead.
    - Assert that the DOCX handed to it carries the DRAFT banner in its header for a working copy, and the signature manifest for a controlled export.
11. Add one line to the testers' known-issues guide: on a local deployment without LibreOffice, PDF export now answers 503 with that message. Install `libreoffice-writer`, or test in the image.

**Acceptance**
- Failing first: the step 1 test and the image smoke step are both shown red at HEAD, then green.
- In the `Dockerfile.optimized` image, `POST /api/authoring/docs/:id/export {format:'pdf'}` on a sealed document returns `X-Export-Rendering: formatted`. The PDF has:
  - no fallback notice;
  - one outline entry per section heading;
  - tables with their rows and columns in order;
  - images present;
  - every font embedded;
  - Letter size;
  - Stage 1's header line and "Page X of Y" on every page;
  - a TOC page listing the headings.
- File to Vault with PDF returns 201, and the Vault copy's SHA-256 equals the `artifactSha256` recorded for that filing.
- With `SOFFICE_BINARY=/nonexistent` and `NODE_ENV=production`:
  - export returns 503 `PDF_RENDERER_UNAVAILABLE` and serves no PDF;
  - no `EXPORT` audit row and no `authoring_export_history` row are written (counts compared before and after).
- A working-copy PDF shows the DRAFT banner on every page.
- `grep -rn "renderHtmlToPdf" server/services/authoring` returns nothing.

### Stage 3 — The editor drafts from the project's Vault (Phase 1 · M · engineering) — closes CAT1-08

1. Write the failing tests first (pglite or `tests/db`), one per acceptance case below. Run each on HEAD and record the red.
2. Scope to the project. In `authoring.router.ts`, add `to_jsonb(d)->>'client_program_id' AS program_id` to the section query (`:3796-3802`).
   - When `program_id` is null, set `retrievalStatus = 'failed'` and `retrievalError = 'This document is not in a project, so no project evidence could be retrieved.'`.
   - Send no evidence block, and never fall back to an organisation-wide search.
3. Use one retrieval path, the one AnA already uses (`server/services/ana/document-passage-tools.ts:136-139`). Replace the `searchHybrid` block (`:3832-3847`) with `searchDocumentPassages({ organizationId: tenantId, organizationUuid: orgUuid, query: searchQuery }, { limit: 5, programId: section.program_id })`.
   - Map each hit to `retrievedChunks` as `{ content: hit.text, title: hit.documentTitle, vaultDocumentId: hit.documentId, pageNumber: hit.pageNumber, chunkIndex: hit.chunkIndex }`.
   - `PassageSearchUnavailableError` becomes `failed` with its message.
   - No hits becomes `empty`. Carry the coverage note in the draft metadata. Export `coverageNote` from `document-passage-tools.ts` and reuse it rather than composing a second sentence.
4. Carry version identity on every hit. Add `documentVersion` and `contentSha256` to `PassageHit` (`document-passage-search.ts:52`), read in the Vault corpus query `ragRouter` runs. That is one place, so AnA's citations get them too.
5. Render each source in the evidence block (`:3858-3870`) as `[SRC-n] "<title>", p. <page>`, omitting the page when it is null.
6. Attribute through the one evidence registry. Add `resolveEvidenceSourceIdsForVaultPassages(orgId, programId, hits)` to `server/services/clinical-regulatory-evidence/retrieval-source-link.ts`.
   - It registers one `cre_evidence_sources` row per Vault document version: `source_type 'vault_document'`, `client_program_id`, title, `checksum` = the Vault content SHA-256, and `metadata { vaultDocumentId, documentVersion }`.
   - Make the insert idempotent with `INSERT … ON CONFLICT DO NOTHING` against a new partial unique index on `(organization_id, (metadata->>'vaultDocumentId'), checksum) WHERE source_type = 'vault_document'`. Create the index in a new `IF NOT EXISTS` migration, added to `C2C_MIGRATION_FILES` before the trailing tenant-sweep entries (`ci:migration-set-order` enforces this).
   - Rows are registered when first retrieved, so there is no backfill.
   - Apply the same data-disposition eligibility the existing resolver applies (`capturedDataEligibleSql`). A Vault document withdrawn from AI use is never registered or cited.
   - Extend `DraftCandidateSource` (`draft-candidate-store.ts:40`) with an optional `vault: { documentId, documentVersion, pageNumber, chunkIndex }`. `sources` is `jsonb`, so this needs no migration.
   - The accept path (`POST /sections/:sectionId/ai/draft/accept`, `:4142`) records the locator with the span, so a citation renders as document, version and page. The accept gate still refuses a source id that was not retrieved.
7. Remove lumen-atom retrieval from this route in the same change (zero duplication).
   - Unfiled Data Room captures reach the Vault through the existing VR-11a filing. They are reported in the coverage note, not searched silently.
   - Tell MR-17's claimant that DATA-06's "Authoring AI draft" consumer is gone.
8. Fix the client copy. In `AuthoringAiDraft.tsx` (`:156-193`, `:289`, `:533`, `:565`, `:573`), say "this project's Vault", and show title, version and page for each source.
9. Coordinate with MR-13. AI-05 changes the same accept handler (the figure block) and the policy for drafting on empty or failed retrieval. Land this stage first, or claim both in one session. Do not implement AI-05's block here.

**Acceptance**
- Program A has an authoring document, and a PDF containing a unique phrase is uploaded to A's Vault. Drafting the matching section returns `retrievalStatus: 'ok'` with a source naming that Vault document id, its version and a page number. This is red on HEAD (`empty`, or atoms only).
- A Data Room upload and a Vault document containing the phrase exist in program B only. Drafting in A retrieves nothing from B. This is red on HEAD, which searches all of the organisation's atoms.
- A document with no `client_program_id` gets `retrievalStatus: 'failed'`, and no evidence block reaches the model (asserted on the gateway request).
- Accepting the draft records span attribution to the Vault document, version and page. An attribution to a document that was not retrieved is refused.
- With passage embeddings off, a keyword match is still found and the response reports `ranking: 'text'`.
- `grep -n "searchHybrid" server/routes/authoring.router.ts` returns nothing.

### Stage 4 — Placing a document into a filing is one server call that files the formatted PDF (Phase 2 · M · engineering) — closes CAT1-18

The `vault_documents` leaf path already stages stored bytes that are hash-checked, PDF-checked and approval-checked (`leaf-source-resolver.ts:613-730`, `vaultVersionNotTransmittable`). File-to-vault already carries the Authoring approval to the Vault version (`authoring-file-to-vault.ts:514`). This stage composes the two. It replaces the client's two-call snapshot orchestration and takes authored leaves off the text renderer. It depends on Stage 2, and on MR-08 for working Vault uploads in production (CAT1-01).

1. Write the failing tests first:
   - **(a) No partial placement.** With the leaf write forced to fail after the document was filed, assert that no new `vault.documents` row, `coauthor_documents` row or leaf remains. Red at HEAD: drive the two client calls with the `PUT` failing, and the snapshot row remains.
   - **(b) The leaf is the formatted PDF.** For a placed APPROVED authored document, assert that the staged leaf bytes are the formatted PDF (outline present, fonts embedded). Red at HEAD: `renderLeafPdf` produces text.
2. Add a service, `server/services/submission-service/place-authoring-document.ts`, exporting `placeAuthoringDocument({ sequenceId, docId, sectionCode, title, lifecycleOp, leafId?, reason }, ctx)`. In order, it does the following:
   1. Read the document (tenant-scoped). Refuse 409 `DOCUMENT_HAS_NO_PROGRAM` exactly as file-to-vault does.
   2. Find or file the Vault PDF. If this document's current content (`sectionsDigest`) is already filed to the Vault as a PDF, reuse that Vault document; the file-to-vault record carries the digest and `vaultDocumentId`. Otherwise call `fileAuthoringDocumentToVault({ format: 'pdf', … })`.
   3. Write the leaf: `upsertLeaf({ sequenceId, sectionCode, title, lifecycleOp, leafId, documentTable: 'vault_documents', documentUuid, reason }, ctx)` (`submission-service.ts:2878`).
   4. If step 3 throws and step 2 filed a new Vault document, revert it with the `revertIngest` compensation file-to-vault already uses, then return the leaf's own error. A failed revert is logged and returned as 500 `PLACEMENT_REVERT_FAILED`, naming the Vault document id, never silently.
   5. Return `{ leaf, vaultDocumentId, approval }`. `approval` is the carry outcome, so the dialog can say that an unapproved version will not transmit.
3. Add the route `POST /api/submissions/sequences/:seqId/leaves/from-authoring` in `server/routes/submissions.ts`, beside `PUT /sequences/:seqId/leaves` (`:1036`). It uses the same limiter, `requireRole(AUTHOR)` and `requireGovernedReason`. Its body schema is `upsertLeafSchema` without `documentTable`/`documentId`/`documentUuid`, plus `docId` (uuid).
4. Client changes in `AuthoringPlaceIntoFiling.tsx`:
   - `place()` (`:266-330`) calls only this route. Keep `needsReconciliation` for an unknown outcome, such as a lost network.
   - Drop the `takeFilingCopy` import. Delete `placeIntoFilingCopy.ts` if nothing else imports it (grep first).
   - `POST /api/coauthor/documents` stays for its other callers, such as the eCTD co-author surface and Module 3 placement. Grep before touching it.
5. Leaves placed before this change still point at `coauthor_documents` and render as text. The existing "Re-place approved version" action (FILING_SPINE F17) uses the new route with `lifecycleOp: 'replace'`, which moves them to the Vault PDF.
6. Update the "Approval at filing" paragraph of `docs/design/FILING_SPINE.md` in the same commit. It should say that authored documents are filed as Vault PDFs, and that transmit checks the Vault version's approval for those bytes.

**Acceptance**
- Failing first: (a) and (b) are shown red at HEAD, then green.
- A successful placement creates or reuses exactly one Vault version and exactly one leaf. A forced leaf failure leaves no new Vault, co-author or leaf rows, and the response carries the leaf's error code.
- `POST /api/submissions/sequences/:seqId/assemble`, for a sequence holding a placed APPROVED document, stages the Vault PDF bytes. The md5 in `index.xml` equals the md5 of those bytes.
- A placed document that is not approved is refused at transmit with the Vault approval reason.
- Placing the same unchanged document twice reuses the Vault document and returns the existing leaf with `unchanged: true`.

### Stage 5 — Templates arrive by migration, and house style reaches the export (Phase 3 · M · engineering) — closes CAT1-20, CAT1-16

1. Write the failing test first. Provision an empty database through the migration set, the way `db:provision` does, without booting the server. Assert that the 20 seed templates and their sections exist. Red at HEAD: they are seeded only at boot (`server/startup/services.ts:409-422`).
2. Generate `migrations/<date>_intelligence_document_templates_v1_seed.sql` once from `SEED_TEMPLATES` (`server/services/intelligence/template-seeds.ts`) and commit the SQL.
   - **Templates:** `INSERT … ON CONFLICT (template_code, version) DO NOTHING`, using the unique constraint at `db/migrations/20260520_document_templates.sql:61`.
   - **Sections:** `INSERT … SELECT t.id … ON CONFLICT (template_id, section_code) DO NOTHING` (`:100`).
   - **Row-count assertion:** end with a `DO $$` block that raises if the version-`'1.0'` row count for the 20 codes is not 20, or if the section count is not the generated total.
   - **Placement:** add the file to `C2C_MIGRATION_FILES` after `20260520_document_templates.sql` and before the trailing tenant-sweep entries.
3. Delete the runtime seeding:
   - the boot call (`services.ts:409-422`);
   - `seedTemplatesIfMissing`, `seedTemplates` and `SEED_TEMPLATES`;
   - the seed route behind the import at `server/routes/regulatory-intelligence.ts:85`.

   Its in-place `UPDATE` is what Rule 1's seed corollary forbids: a correction is a new version row in a new migration. Name the replacement (the migration and the step 1 test) in the commit.
4. Fill the template gaps once the founder names the day-one set (NEW decision below). For an FDA-only launch (F-10) the candidates are:
   - 2.3 QOS (ICH M4Q);
   - 2.4 and 2.6 (M4S);
   - 2.7.1, 2.7.2 and 2.7.4 (M4E);
   - the CSR (ICH E3);
   - the DSUR (ICH E2F).

   The RMP is EU and stays out. For each template:
   - transcribe its headings from the guideline;
   - name the guideline and revision in `source_reference`;
   - have a second person check them against the guideline, and file that check as evidence;
   - ship it in a seed migration with its own row-count assertion.

   Reuse terms follow F-16.
5. Apply house style on export:
   - Accept an optional `templateId` in the bodies of three routes:
     - `POST /docs/:docId/export` (`authoring.router.ts:6539`);
     - `POST /docs/:docId/working-copy` (`:6712`);
     - file-to-vault.
   - Resolve it with `getTemplate(tenantId, id)` (`server/services/templates/templateStore.ts:173`), which is tenant-scoped.
   - An unknown id, or another tenant's, fails with 404 `TEMPLATE_NOT_FOUND` before any audit or export row is written. Never fall back to the default silently.
   - Pass the normalized spec as `formatting`; Stage 1 already consumes it.
   - Record `templateId` and a SHA-256 of the normalized spec in two places: the `logExport` metadata (`~:6672`) and the `WORKING_COPY` audit payload (`~:6748`).
6. Client: `DownloadMenu.tsx` and `FileToVaultDialog.tsx` offer the organisation's active templates (`GET /api/c2c/templates`) as an optional "Formatting" choice. "Default (Letter)" sends nothing.

**Acceptance**
- Failing first: the provisioning test is shown red at HEAD, then green.
- A fresh database provisioned from empty has every seeded template with its sections before the server boots. A scratch copy of the migration with one `INSERT` removed fails at apply with the assertion's message.
- `grep` finds no runtime `INSERT` or `UPDATE` on `intelligence.document_templates`.
- With a `templateId`:
  - the spec's fonts, margins, header and footer text appear in the DOCX and in the PDF;
  - `templateId` and the spec hash are on the export row and on the `WORKING_COPY` audit row;
  - another tenant's `templateId` returns 404 and writes no row.
- Each new template appears in "New document" with its section count.

### Stage 6 — SSO and SCIM accounts sign through their identity provider (Phase 3 · M · engineering; move to Phase 1 if the design partner mandates SSO) — closes CAT1-03

1. The founder decides the signing method and whether SSO accounts may hold a local password (NEW decision below). Record the decision in `docs/LAUNCH_DEFINITION_OF_DONE.md`. The steps below implement the recommended choice: identity-provider re-authentication, and no local password.
2. Write the failing test first: `tests/db/sso-signer.dbtest.ts`. Create a user with `password_hash 'saml:<uuid>'` and an enrolled authenticator. Drive the authoring e-sign route and `submission-sign-release.ts:260` with a step-up grant, expecting success. At HEAD both return 401 `PASSWORD_VERIFICATION_FAILED`.
3. Create `public.signing_step_up_grants`. Columns:
   - `id uuid pk`;
   - `organization_id INTEGER NOT NULL`;
   - `user_id INTEGER NOT NULL`;
   - `intent text NOT NULL`;
   - `record_id text NOT NULL`;
   - `authn_instant timestamptz NOT NULL`;
   - `expires_at timestamptz NOT NULL`;
   - `consumed_at timestamptz`.

   Create it in a new `IF NOT EXISTS` migration in `C2C_MIGRATION_FILES`, before the trailing sweep entries, so the tenant RLS sweep covers it.
4. Add step-up to `server/routes/sso.ts`:
   - **`POST /api/sso/step-up/start {intent, recordId}`:** build the AuthnRequest from a second provider created with `forceAuthn: true` (`createSamlProvider`, `server/services/saml-provider.ts:300`; `@node-saml/node-saml` 5.1.0). The RelayState carries the org, `returnTo` and a single-use nonce.
   - **The existing ACS handler (`:479-`), on a step-up RelayState:**
     - create no new session;
     - require that the validated assertion's NameID or email equals the session user;
     - read `AuthnStatement/@AuthnInstant` from the profile's assertion and require it within 5 minutes;
     - insert a grant with `expires_at = now() + 5 min`.
5. Change `server/services/part11/reverify-signer.ts`:
   - Add `stepUpGrantId` to `SignerCredentials` (`:135`).
   - Give `reverifySigner` a third parameter, `binding: { intent, recordId }`, required whenever a grant is presented.
   - Add `'idp-reauth+mfa'` to `authenticationMethod` (`:44`).
   - When the account's hash starts with `saml:` or `scim:`, verify and consume the grant instead of a password: `UPDATE … SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL AND expires_at > now() AND user_id = $2 AND record_id = $3 RETURNING`. A password presented for such an account is refused.
   - Keep the standing, lockout and authenticator rules unchanged. A failed grant counts toward lockout.
6. Reach every ceremony through one parser. Add `signerCredentialsFrom(body)` to `reverify-signer.ts` and use it at all 14 call sites at HEAD:
   - `server/services/tasking/task-signoff.ts:192`;
   - `server/routes/mdx-qms.ts:583`;
   - `ana-features.ts:2255`;
   - `pccp.ts:272`;
   - `governed-signed-act.ts:204`;
   - `submission-sign-release.ts:260`;
   - `document-lifecycle.ts:130`;
   - `mdx-rbm.ts:1034` and `:1155`;
   - `esignature.ts:287`;
   - `authoring.router.ts:801`;
   - `ana-ri/governed-esignature.ts:98`;
   - `ana-ri/seal-verified.ts:126`;
   - `c2c/actions.ts:306`.

   Then:
   - Add a test that fails when a `reverifySigner(` call site builds its credentials by hand.
   - Persist the method on the signature row and print it in the §11.50 manifest through `describeSignatureMethod` (`shared/part11/signature-method.ts`).
7. Expose `signing.method: 'password' | 'idp'` beside `signingPostureOf` on `/session` and `/me` (`server/routes/auth.ts:362, 660, 870, 1716, 1936`). For `idp`, the signing dialog renders "Re-authenticate with your identity provider", opening `/api/sso/step-up/start` in a popup, then the authenticator code. It shows no password field.
8. In the same change, close the local-password route. `handleForgotPassword` (`auth.ts:2335`) and `handleResetPassword` (`:2453`) return the same generic response but issue no token when `password_hash` starts with `saml:` or `scim:`. Show this failing before the change.
9. Keep these refusals as tests, each answering 401 and counting toward lockout:
   - a stale grant (older than 5 minutes);
   - a replayed grant;
   - a grant for another user;
   - a grant for another record;
   - a password on an SSO account.
10. Coordinate with other orders:
    - **MR-06:** SEC-15 (the SAML MFA AuthnContext check) and CAT1-07 (author ≠ approver) edit the same signing path.
    - **MR-16:** when GTM-13 adds OIDC, its step-up is `prompt=login&max_age=0` writing to the same grant table.

**Acceptance**
- Failing first: at HEAD, a SAML JIT user's signature returns 401 `PASSWORD_VERIFICATION_FAILED`, captured in the new dbtest.
- After the change, the same user signs after step-up. The signature row and the export manifest show `idp-reauth+mfa`.
- Stale, replayed, cross-user and cross-record grants are refused with 401.
- Forgot-password for a `saml:` or `scim:` account issues no reset token.
- The existing password-account signing tests stay green.

### Stage 7 — A review verdict no longer looks like a signature (Phase 3 · S · engineering) — closes UX-17

1. Write the failing component test first. It asserts that the verdict dialog has no `esign-modal` class and no lock icon, and that a review item with `conf: 0.9` renders no "% confidence" text. Both fail at HEAD (`Review.tsx:256`, `:263`, `:1013-1016`).
2. Restyle the dialog (`Review.tsx:252-330`):
   - use the neutral presentation classes `GovernedConfirmDialog` uses (`c2c-confirm-*`, `client/src/concept2cure/_shared/components/GovernedConfirmDialog.tsx:208-226`), and keep `useDialog`;
   - use the kicker "Review decision · audit-logged · not an electronic signature";
   - remove the lock icon.

   Do not add a new dialog primitive.
3. After an "approved" verdict is recorded, offer "Sign as approver". It opens the document's signing panel through `openReviewDocument` (`Review.tsx:159`) and is shown only when the session's signing posture allows it. F-12 decides what approval means; this stage stops the verdict from impersonating a signature.
4. Remove the confidence badge and its data:
   - the badge (`:1013-1016`) and the `.rv-conf` styles;
   - `conf` from `ReviewItem` (`client/src/concept2cure/v2/fixtures/review-data.ts:67`);
   - `conf` from the server board shape (`authoring-review-board.ts:87`, `:564`).

   The only producer sends `null`, so nothing visible is lost, and no model-produced figure can appear later (Rule 2). Check `project-home-data.tsx:157` and `conversation-thread-data.ts:121` for the same badge on launch surfaces, and apply the same rule.

**Acceptance**
- Failing first: the step 1 test is shown red at HEAD, then green.
- The verdict dialog carries no signature styling and states it is not an electronic signature. An approver can reach the signing step from it in one click.
- `grep -rn "rv-conf\|% confidence" client/src/concept2cure/v2/surfaces/Review.tsx` returns nothing.

### Stage 8 — Editor parity for Word-based writers (Phase 3 · XL · engineering) — closes UX-16, CAT1-23

Each item below lands as its own commit with its own failing-first test.

1. **Footnotes (CAT1-23).**
   - Add a footnote mark in `client/src/concept2cure/v2/editor/`, following the pattern of `citationNode.ts`. It serializes as `<sup data-note="…">n</sup>`, the form the export already parses (`server/export/authoring-section-content.ts:379-382`) and writes as Word footnotes (`authoring-export.ts:420-430`; `server/export/__tests__/authoring-footnotes-docx.test.ts`).
   - Add an "Insert footnote" toolbar command in `RichSectionEditor.tsx`.
   - On paste, map Word's `mso-element:footnote` to the same mark. Flip the assertion in `editor/__tests__/pasteFidelity.test.ts:28-36`, which documents the drop today, and show it red first.
2. **Spellcheck.** Set `spellcheck="true"` and a `lang` taken from the document locale on the editor's contenteditable.
3. **Compare on a save conflict.**
   - On a 409 (`DocumentWorkbench.tsx:3037-3044`), fetch the section's current server content.
   - Show theirs against mine with the existing `RedlineText` component.
   - Offer "Keep theirs" and "Apply mine as suggestions", which lays my edits as tracked suggestions on top of their version.
   - Never overwrite blindly, and do not add a second diff engine.
4. **Track formatting and table changes.**
   - Extend the suggestion model (`editor/suggestions.ts`) to formatting marks and to table row and column insert/delete.
   - Export them as Word revisions (`w:rPrChange`, and `w:ins`/`w:del` rows) through the existing revision writer in `authoring-blocks-to-docx.ts`.
   - Freeze must still refuse pending ones.
   - This is the XL part of the stage. Split it into several commits.
5. **Outline.** Add a read-only heading outline in the document rail, matching the TOC Stage 1 writes.

**Acceptance**
- Each item's test is shown red at HEAD, then green.
- A footnote inserted in the editor survives save and reload, and exports as a Word footnote. A pasted Word footnote is kept.
- A simulated 409 shows the diff, and "Apply mine as suggestions" leaves my text as pending suggestions on their version.
- Bolding a phrase and deleting a table row with track changes on produce suggestions, not direct edits. Freeze refuses while they are pending. The DOCX shows them as Word revisions.
- The editor's contenteditable carries `spellcheck="true"`.

### Stage 9 — Live co-editing is switchable per organisation and works across tasks (Phase 3 · M · engineering; after F-27) — closes CAT1-12

1. **Runtime flag.** `ENABLE_LIVE_COEDITING` (`client/src/flags/featureFlags.ts:73-81`) is compile-time. Serve it per organisation from the server's existing feature-toggle service on `GET /session`, read it in the client, and delete the static entry. `ENABLE_COLLAB_CRDT` stays the deployment-level kill switch, and both must be on.
2. **Sync across tasks.** Hocuspocus (`server/services/hocuspocus-server.ts`) syncs only the clients connected to the same task, while production runs `api_desired_count` tasks (`terraform/modules/ecs-fargate/main.tf:323`). Add `@hocuspocus/extension-redis` on the Redis that MR-03 provisions, or route `/collab` to one dedicated task. Persisted state (`collab-state.store.ts`) is already durable.
3. **Fail closed on presence.** `DurablePresenceManager` (`realtime-collab.ts:530-560`) demotes permanently to a per-process roster when the table is missing or a tenant-scope error occurs. In production, report presence as unavailable instead. Keep the fallback only in `development` and `test`.
4. **Soak test.** Run two clients against two app containers behind one proxy, editing one section concurrently for 30 minutes. Then compare the saved section, both clients' final state and the CRDT store. Use the soak to check `@hocuspocus/provider` 4.6.0 against `@hocuspocus/server` 3.4.4 (`package.json:458-459`), and align the major versions if it shows protocol errors.

**Acceptance**
- Failing first, each shown red at HEAD:
  - turning the flag on for one organisation without a rebuild enables co-editing there and nowhere else;
  - the two-task soak diverges.
- After the change, the soak converges with no lost edits.
- With `collab_presence` absent and `NODE_ENV=production`, presence reports "unavailable", not an empty roster.

### Stage 10 — Compare any two versions of a document (Backlog · M · engineering) — closes CAT1-22

1. Write the failing test first. A user picks frozen version 1 and the current text and sees a document-level redline. At HEAD only adjacent revisions within one section are shown (`AuthoringRevisionDiff.tsx:40`).
2. Add a version picker over the frozen versions (`GET /docs/:docId/frozen?version=`, `authoring.router.ts:5468`) and the current state. If no route lists versions, add `GET /docs/:docId/frozen/versions`, which is tenant-scoped and returns `version, frozen_at, frozen_by, content_hash`.
3. Diff per section with the same `RedlineText` view Stage 8 uses for conflicts. Match sections by id, then code, and list added and removed sections.

**Acceptance**
- Failing first: the step 1 test is shown red at HEAD, then green.
- Any two versions, or a version and the current text, can be compared at document level.
- No second diff implementation exists (`grep` for new diff modules).

## Definition of done

- A sealed Authoring document exports as DOCX and as PDF, and both are filing-grade in the production image:
  - document ID, version and status on every page;
  - "Page X of Y";
  - a TOC and bookmarks;
  - embedded fonts;
  - US Letter.

  No authoring path can produce a plain-text PDF, and the image smoke step turns red if one does.
- The editor's AI draft retrieves only the open project's Vault passages and cites document, version and page. Lumen-atom retrieval is gone from that route.
- Placing an authored document into a sequence is one server call. It leaves either a leaf pointing at the formatted Vault PDF, or nothing.
- SSO and SCIM accounts sign by re-authenticating at their identity provider, and the manifest records it. SSO accounts cannot hold a local password.
- Templates reach every database through migrations with row-count assertions, and house style can be selected on export. The review verdict no longer resembles a signature, and no model confidence is shown.
- Each closed finding's `statusAtHead` names its closing commit, and the evidence sits under `docs/evidence/MR-09/`.

## Founder decisions this order needs

- **NEW — page size, PDF target and confidentiality text.**
  - Page size: Letter is recommended, following F-10 (FDA only).
  - PDF target: the FDA PDF specifications for eCTD v3.2.2, not PDF/A.
  - The default confidentiality footer text.

  Blocks the defaults in Stage 1 and the acceptance of Stage 2.
- **NEW — Vault passage embeddings for pilot tenants.** `ana.vault_chunking` sends Vault text to the embedding provider under F-5's data terms. Keyword passage search works without it. This blocks meaning-based ranking in Stage 3, not the stage. F-5, and MR-13's PQ (AI-01), also gate Stage 3 end to end in production.
- **NEW — the day-one template set for the pilot.** Blocks Stage 5 step 4. F-16 governs reuse of the ICH guideline text.
- **NEW — the SSO signing method and local passwords for SSO accounts.** IdP re-authentication is recommended over a signing PIN, and no local password is recommended. F-13 (an authenticator for signers) and F-24 (OIDC and per-org SAML scope) shape the method. This blocks Stage 6. Move Stage 6 to Phase 1 if the design partner mandates SSO.
- **F-12 — what "approval" means, and segregation of duties.** It sets the target of the "Sign as approver" step in Stage 7.
- **F-27 — live co-editing in scope.** Blocks Stage 9.

## Do not

- **Do not add Puppeteer or Chromium, or keep the PDFKit fallback, for authoring.** There is one PDF path: DOCX through LibreOffice. Do not delete `server/export/renderers.ts`, which still has other callers.
- **Do not let a failed PDF render answer 200** or leave an `EXPORT` audit row or an export-history row behind.
- **Do not fall back to an organisation-wide search** when a document has no project, and do not keep `searchHybrid` beside Vault passages "for coverage".
- **Do not fix placement atomicity in the client.** Retries and reconciliation banners are not the fix, and neither is a second leaf writer. Use one server call composing `fileAuthoringDocumentToVault` and `upsertLeaf`.
- **Do not seed or `UPDATE` reference templates at boot or at runtime, and do not append a `DROP`.** A correction is a new version row in a new migration. Every migration in this order is additive and `IF NOT EXISTS`-guarded.
- **Do not accept an identity-provider assertion as a signature credential unless it is fresh, single-use, and bound to the user and the record.** Do not leave forgot-password open for `saml:` and `scim:` accounts.

## How to run this order

- Claim it with one line in `docs/work-orders/README.md` §0 before starting; release it when you stop.
- Name the launch row each stage moves:
  - D7 and D10: filing-grade output and placement (Stages 1, 2 and 4);
  - D2 and D4: Vault-grounded drafting (Stage 3);
  - D5: SSO signing (Stage 6).
- Commit to `concept2cure-v2` only; merge, never rebase.
- Show each acceptance check failing on the current code before the fix, then passing; file that evidence under `docs/evidence/MR-09/<date>/`.
- When a finding closes, update its `statusAtHead` in `docs/work-orders/MR-findings-2026-10-13.json` with the closing commit.
