# AnA document canvas → one editor → the project vault

**Status:** binding design for workstreams WM (server) and WN (client), 2026-09-21.
**Founder's requirement:** "AnA should be able to build a document and it presents in a
canvas that can also be toggled into a full editor that connects to vault and files of the
designated project."

## What exists (read-only survey, 2026-09-21)

- The editor is real: `client/src/concept2cure/v2/editor/RichSectionEditor.tsx` (TipTap),
  mounted by `surfaces/DocumentAuthoring.tsx` over the **authoring store**
  (`authoring_documents` / `authoring_sections`, `server/routes/authoring.router.ts`):
  sections, history, comments, tracked changes, citations, freeze, §11.50 e-sign, export.
- **No AnA tool writes that store.** `generate_document` writes a DOCX file on disk;
  `artifact_draft` stream events are persisted by `ana-ri/post-processing.ts` into
  `concept2cure_artifacts` (a second store) and rendered by `ConversationThread.tsx` as a
  side-panel `ArtifactCard`, not a canvas. The thread's Edit button navigates to
  `document-authoring` with **no document identity**.
- `EctdCoauthor.tsx` mounts the same editor over a **third store** (`coauthor_documents`).
- `DocumentAuthoring.tsx` has no vault connection. Vault → editor exists one way
  (`editorTarget.ts`, vocabulary `k510|pma|cer|ivdr` only). Nothing files an authoring
  document into the vault.

## Decisions (zero duplication, fail closed)

1. **The authoring store is the one document store for the launch catalog.** An AnA-built
   document IS an authoring document (draft status, sections, provenance) in the designated
   project. `concept2cure_artifacts` stops receiving *documents*; it keeps only non-document
   canvases (report canvases) until those are migrated in a later change. `coauthor_documents`
   is untouched here (Submission Center's filing snapshot) and is a later consolidation.
2. **One canvas component, one editor.** The canvas renders an authoring document read-only
   inline in the thread; "Open in editor" hands the SAME document id to `DocumentAuthoring`
   through the one existing channel (`editorTarget.ts`, vocabulary widened to any document
   type or none); "Back to conversation" returns. No second editor, no second preview format.
3. **The editor is project-scoped and vault-connected.** `DocumentAuthoring` gains a Project
   files pane over the vault read model the Vault surface already uses
   (`GET /api/c2c/project-vault/:programId`, search), can cite/insert a vault document into
   the active section through the existing cite-source path, and can file the document into
   the vault through one new server route that composes the existing export and ingest paths.
4. **Provenance is honest.** A document AnA drafted says so (source `ana`, conversation id,
   turn id, the model id the gateway reports), a document a person authored says so, a
   seeded demo document says so. Nothing claims model origin without a model.

## Server contract (WM)

- Extract the create-document and create-section handlers of `authoring.router.ts` into
  `server/services/authoring/authoring-documents.ts` (one function each, router calls them;
  no behaviour change; the router's tests keep passing).
- `POST /api/authoring/docs/from-draft`
  body `{ programId, title, module?, documentType?, sections: [{ code, title, content }],
  provenance: { source: 'ana' | 'seed' | 'import', conversationId?, turnId?, model?, note? } }`
  → `201 { data: { doc, sections } }`; refuses 400 on an empty section list or missing
  programId, 403 without tenant; content is sanitized HTML (the same sanitizer the PATCH
  section route uses). Provenance is stored (a JSON column added by an additive migration
  if none fits; Rule 1 applies) and returned on `GET /docs/:id`.
- AnA tool `draft_authoring_document` (AnaToolDefinitions + AnaToolExecutor): input
  `{ title, module?, documentType?, sections: [{ code, title, content }] }`; requires the
  open project (refuse verbatim otherwise, like `save_document_to_vault`); calls the same
  service; returns `{ status: 'generated', authoringDocId, programId, title, sectionCount }`.
  The stream's `artifact_draft` event carries `authoringDocId` and `programId` when the
  draft was persisted this way; `post-processing.ts` no longer writes a document draft into
  `concept2cure_artifacts` when an `authoringDocId` is present (report canvases unchanged).
- `POST /api/authoring/docs/:docId/file-to-vault` body `{ format: 'pdf' | 'docx', folderId?,
  documentType? }` → exports through the existing export path, ingests through the existing
  `vault/ingest` service (not an HTTP self-call), files through the existing project-vault
  filing service, audits as one governed action, returns
  `201 { data: { vaultDocumentId, folder, sha256, format } }`. Refuses on a document with no
  program, and never files a document that is mid-freeze.
- Tests: route tests for both routes (happy, 400, 403, sanitization), tool test (no project →
  refusal; with project → document exists with sections and provenance), post-processing
  test (no artifact row when authoringDocId present).

## Client contract (WN)

- `client/src/concept2cure/v2/editor/DocumentCanvas.tsx`: renders one authoring document
  (title, provenance line, sections through the existing `AuthoredHtml`) inline in the
  message stream, collapsed to its first section with "Show all", with "Open in editor" and
  "File to vault". Used by `ConversationThread` for any message whose draft carries
  `authoringDocId`; the old ArtifactCard remains only for non-document canvases.
- `editorTarget.ts`: `docType` becomes `string | null` (any registry document type); add
  `returnTo?: { surface: 'conversation-thread', conversationId }`.
- `DocumentAuthoring.tsx`: consumes `returnTo` (a "Back to conversation" control that
  navigates back with the conversation id); adds a **Project files** pane (vault tree for the
  designated project, search, open-in-viewer for PDFs, "Cite in this section" through the
  existing cite-source call, "File this document to vault" through the new route); shows
  provenance on the document header; the empty state names the project and offers "Ask AnA
  to draft" (which opens the conversation with a prefilled prompt) and "New document".
- The thread's existing Edit button carries the document identity (the same defect fixed
  for Vault in `vaultOpenInEditorCarriesDoc.test.tsx`).
- Tests: canvas renders sections and provenance; Open-in-editor carries `docId`;
  DocumentAuthoring reads it and shows Back; Project files pane lists the vault read model
  and cite inserts a reference; File-to-vault calls the route and shows the result honestly
  (error state on failure). Screenshots against the seeded `[Demo · Biotech]` documents.

## Not in this change

Consolidating `coauthor_documents` and `concept2cure_artifacts` into the authoring store;
real-time co-editing; the AI draft of a whole document by the model (the tool exists after
WM; a live run needs a provider key and is evaluated then).
