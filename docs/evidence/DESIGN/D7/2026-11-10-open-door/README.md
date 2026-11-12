# Every way of opening a controlled document opens it where its text lives (2026-11-10)

Package **D7**. The Quality sweep's commit **C5**: findings `sop-open-door`, `product-editor-ask-leaves-quality`, and the
client half of `product-route-task-notice-refused`, each confirmed by an independent skeptic. One more defect was found
walking it.

## What already exists (RULE 3), and what changed

| Path | Before | After |
|---|---|---|
| `quality/SopRegisterRow.tsx` | The row's "Open document" opened the personal training reader: an overlay titled "Read and acknowledge" with its own "Edit controlled text". An effective document of any type showed "Read and acknowledge" as its next step, including a Form or a Specification, which the server refuses ("This document type is not controlled read-and-understood training", `training-content.ts:62`). | "Open" on every row, calling the register's own `openDocument`. "Read and acknowledge" appears only on an effective document that carries read-and-understood training (`QMS_TRAINABLE_DOCUMENT_TYPES`, the gate "Training" already used). An effective Form's next step is "Open". |
| `quality/SopRegister.tsx` periodic-review panel | Opened the training reader ("Open the document to read it") | Opens through `openDocument` |
| `quality/SopRegister.tsx` notice target | A reviewer's or approver's notice for a document under review opened the editor, which cannot sign | It opens the review route (`QmsRoutePanel`) when it is the viewer's turn (`myTurn`). A training notice still opens the reader, and anything else opens the editor as before. |
| `quality/ControlledDocumentWorkbench.tsx` | Passed Quality's `onAsk` to the one editor. An ask from inside the editor skipped the editor's unsaved-work decision and sent only the text, losing the document, section and saved-version origin. | `onAsk={null}`: the editor takes its own path (the decision, then the conversation with its origin). The wrapper no longer takes an `onAsk`, and its two callers stopped passing one. |
| `quality/SopRegister.tsx` `openDocument` (**found on the walk**) | A legacy register entry has its text inline and no editing copy. Past draft, "Open" (and the document number) opened the editor, which answered "This register entry has no editing copy" with a Try again that could not help, so the text was unreachable. | A document with an editing copy opens in the editor. A legacy draft is set up (bound) first, as before. A legacy entry past draft opens its inline controlled text, read-only, where it lives. |

## Acceptance (the running app)

`w7-open.cjs`, `w7-open.log.json`, as the author on QS-SOP-001 (a legacy entry under review):

- More lists Open, Training, Revise, History and Ask AnA.
- Open shows the document's controlled text (`shots/w7-open-legacy-text.png`): Purpose and Procedure, "Recorded
  controlled text · Under review".
- No API or page errors. Before this fix, the same walk recorded two 409s on `/api/mdx/qms/documents/1/editor` and the
  dead end.

## Tests

Red first (`red.txt`):
- the four C5 cases: Open under More; no acknowledgement on a Form; the periodic-review row's door; a reviewer's notice
  opening the route;
- the legacy entry, red against the previous `openDocument`;
- the editor owning its asks, red with a host `onAsk`.

Green (`green.txt`): 32 files, 352 tests. `qmsGovernedActions`' periodic-review case now expects the editor, not the
reader.

## Not done here

- The reader is still Quality's opaque full-screen overlay, titled "Read and acknowledge" even when it opens a
  document under review for reading. The sweep's C16 moves it into the product's one drawer and titles it by what it
  is for.
- "Edit controlled text" inside the reader (`dialogs-3`) is a second edit path. Routing it through bind changes which
  text is the controlled text for an unbound document, so it waits for a decision (the sweep's plan, "would NOT do").
- The 422 a reviewer's notice can still meet on the server (`notification-record-target.ts`) belongs to the
  notifications owner.
