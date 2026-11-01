# D2: a new document opened in the editor with a false warning, a redundant notice and a refused request (2026-10-31)

Found by creating a document in the editor in Chromium, as RULE 4 asks ("a screen is not done until it was opened in the running app and used"). The document was BX-204's Investigator's Brochure, from the IB template: 15 sections.

## What the person saw (`editor-before.png`)

1. **A false warning in the outline.** "These sections are stored in an order that differs from their section codes, and they assemble and export in the stored order. Reorder them if the stored order is not deliberate." The document had just been created from its template, in the template's order: `title_page confidentiality_statement table_of_contents 1 2 3 4 4.1 …`.
2. **A notice to open what was open.** "Document created. Open created document" appeared above the document it named, which was already open. The toast had already said it was created.
3. **A refused request on every new document** (`02-before-console.txt`): `403 POST /api/realtime-collab/rooms` and `403 PUT …/awareness`.

## What already exists

- **The structure check** (`shared/regulatory/section-code.ts`, `sectionStructureIssues`). The server runs it on every document read (`server/services/authoring/authoring-document-read.ts`), and `DocumentWorkbench.tsx` shows its verdict above the outline. `compareSectionCode` sorts numeric segments before words.
- **The creation notice** (`AuthoringCreateExport.tsx`, `CreationRecoveryNotice`). Its `created` state carries a receipt with the new document's id. `sourceDocumentStartFlow.test.tsx` needs the notice when the created document did not open, because an unsaved-changes prompt held it back.
- **Presence** (`AuthoringCollab.tsx`, `POST /api/realtime-collab/rooms`). The server refuses a section that is not the named document's (`collab-authorization.ts`). The editor already computes the active section only when it belongs to the active document (`readableSourceSectionId`).

## Causes and fixes

| # | Cause | Fix |
|---|---|---|
| 1 | Words sort after numbers, so every title page sorted after the last numbered section, and every template that opens with front matter was "out of order". | Only outline codes are ordered. Front and back matter coded by name (`title_page`, `table_of_contents`, `references`) stays where the document puts it. Numbered sections out of order among themselves are still reported, and the suggested order keeps the front matter in place. |
| 2 | The notice did not know which document was open. | It steps aside when its receipt is the open document. It is still offered when the created document did not open. |
| 3 | On switching documents, the previous document's section id rode along for one render, and the server refused the pair. The join succeeded 200 ms later. | Presence takes the section only once it is the open document's. |

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | Two new structure cases fail before the fix: the IB's front matter, and numbered sections out of order with the front matter kept in place. |
| `01b-red-created-notice.txt` | "offers to open the created document only while it is not the one open" fails before the fix. |
| `editor-before.png`, `02-before-console.txt` | Trunk's code: the warning, the notice and the two 403s. |
| `editor-after-create.png` | With the fixes: no warning and no notice, and the document starts about 80 px higher. |

**Also run.**
- The structure tests and every suite that reads them: 68 of 68.
- `sourceDocumentStartFlow.test.tsx`, which needs the notice when the created document did not open, passes.
- Live, a document created with another one open: 5 room joins, 0 refused, a clean console.
- The 38 suites that touch presence: 487 of 495 pass. The 8 failures happen on trunk without this change (`savedAssemblySourcesFlow`, `workbenchDraftParagraphs`, `authoringConversationScopeLive`) and are handled with the other stale expectations.
