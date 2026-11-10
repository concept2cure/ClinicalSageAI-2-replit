# F1: the document journey's "Open in editor" opens its document (2026-11-09)

**Found by** the D4-7 work on the document journey (`../../D4/2026-11-09-review-journey-engine/`). §D4.J asks for "Open
in editor" to open the document in the editor through `setEditorTarget`. It did not:
- `DocJourney.tsx` `openEditor` was `onNav('document-authoring')` and nothing else, so it opened the editor's document
  list;
- no journey row named its document. The assembler selected `d.id` and sent only the title, module, product code and
  version.

So a person reading a document's lifecycle pressed "Open in editor" and had to find the same document again.

## What already exists (RULE 3)

- **`server/services/authoring/doc-journey-view-assembler.ts`.** It reconstructs the org's current authoring
  document from the audit trail. Every row carries the document's identity, and its query already reads `d.id`.
- **`server/routes/doc-journey.routes.ts`.** `GET /api/doc-journey`. It is unchanged.
- **`client/src/concept2cure/v2/surfaces/Review.tsx` `openReviewDocument`.** This is the editor door the Review board
  uses:
  - it switches the shell to the document's project when that project is not the open one;
  - it calls `setEditorTarget({ docType: null, docId, programId })`;
  - it opens `document-authoring`.
- **`authoring_documents.client_program_id`.** This is the document's project.

Nothing new is added: no file, route or table. The journey reuses the Review board's door, so a second
open-in-editor helper is not written (zero duplication).

## The change

| Part | Now |
|---|---|
| **The assembler** | Each row's `doc` also carries `id` (the document's id) and `programId` (`client_program_id`, or `null` when the document is filed under no project). |
| **The screen** | "Open in editor" calls `openReviewDocument` with that id and project, which opens this document in its project. A row from an older server without the id still reaches the editor. |
| **AnA's context** | The available action reads "‘Open in editor’ opens this document in the editor", where it read "exists as navigation to Document Authoring". |

## Red, then green

- **Red at HEAD:**
  - `red-at-head-journey-server.txt`. `doc-journey-view-assembler.pglite` › "names the document and its project on
    every row" and "says a document filed under no project has none" both fail, because `doc` has no `id` and no
    `programId`.
  - `red-at-head-journey-client.txt`. `docJourneyPreviewIsHonest` › "opens this document, in its project, not the
    editor list" fails, because `setEditorTarget` is never called.
- **Green:**
  - the assembler suite, 7 of 7, and `doc-journey-read`, 11 in total;
  - the client suites that render the journey (`docJourneyPreviewIsHonest`, `anaSeesScreens`,
    `noFabricatedProgramIdentity`), 33 of 33.
- **Lint:** the ESLint warnings per file equal trunk's.

## In the running app

`journey-open-in-editor.png`. The walk stack ran this tree's client, shared and assembler. On the journey of the org's
current document, "C2C-101 (anti-IL-23p19 monoclonal antibody, fictional) — IND × FDA …", "Open in editor" landed on
`/concept2cure/document-authoring?program=c2ed888d…` with that document open in the page placement. The editor bar
read the same title.

The journey is outside the launch scope (`shared/constants/launch-scope.ts`: authoring-engine and doc-journey are
behind the flag). The walk ran it with `LAUNCH_SCOPE_ENFORCE=off`, for this screen only.
