# D4: the editor's canvas says "Nothing to edit yet" only when the document list answered and is empty (2026-11-13)

**Found by** the CSR lane (`017CFk…`), as ED-01 in its ranked editor list. While `/api/authoring/docs` was pending or
had failed, the canvas said "Nothing to edit yet. Create the first document for this project and its sections open
here." and offered **New document**. A person whose list had not arrived, or could not be read, was invited to create
a duplicate of a document that only had not been shown.

## What already exists (RULE 3)

- **`client/src/concept2cure/v2/editor/useScopedDocuments.ts`.** Reads the project's working documents and returns
  `docs` with `docsState` (`loading`, `ready`, `error`). A failed read returns an empty list with `error`, never a
  stale list.
- **`client/src/concept2cure/v2/editor/DocumentWorkbench.tsx`, the outline's list.** Already follows `docsState`:
  "Loading documents…", then "Couldn’t load documents", then, for an empty list, "No documents yet" with **New
  document**, or "Nothing at this stage … Clear the filter to see the rest" with **Show all documents** when a stage
  filter is on. The line above the outline already reads "reading documents…" and "documents not read".
- **The same file, the canvas with no section open.** One `EmptyState` keyed on `activeDoc` and `docs.length` only.
- **`client/src/concept2cure/v2/dataConnect.tsx` `EmptyState`.** `busy` marks a panel standing in for content still
  loading. `tone="error"` renders `ErrorState`, which takes `retry` and deliberately forwards no create action: "a
  'create' CTA over a failed read would invite writing into a store that just refused to answer".
- **`client/src/concept2cure/v2/__tests__/documentAuthoringSaveLabelNoDoc.test.tsx`.** Already pins the empty
  project's canvas ("Nothing to edit yet") and its Save control.

Nothing new is added: no route, read, screen or component.

## The change

With no document open, the canvas now follows the list read, as the outline beside it does:

| The list read | The canvas says | It offers |
|---|---|---|
| Still running | "Loading documents…" | Nothing |
| Failed | "Couldn’t load documents. The document list did not answer, so nothing is shown or offered here." | **Try again**, which reads the list again |
| Answered, empty, a stage filter on | "Nothing at this stage. This project has no approved documents. Clear the filter to see the rest." | **Show all documents** |
| Answered, empty, no filter | "Nothing to edit yet. Create the first document for this project and its sections open here." (unchanged) | **New document** (unchanged) |

The outline's failed-read panel said "…and retry" with nothing to press. It gains the same **Try again**. With a
document pinned, that list is the only place the failure shows.

Nothing a screen showed is removed (P-122). The empty project's canvas and its **New document** are unchanged.

## Red, then green

- **Red at HEAD** (`red-at-head.txt`), 3 new cases in `documentAuthoringSaveLabelNoDoc.test.tsx`:
  - "says the documents are loading while the list is being read, and offers no New document";
  - "says the list could not be read when the read failed, with Try again, and never 'Nothing to edit yet'";
  - "with a stage filter on, says nothing is at that stage and offers the rest, not a first document".
- **Green.** That file, 5 of 5. Every client suite that renders the editor (`DocumentAuthoring`,
  `DocumentWorkbench`, `DocumentCanvas`), in three batches: 87 files, 1,117 of 1,117, run before the outline's
  **Try again** was added. After it: the named file, 5 of 5, and the 23 of those files that assert on a failed or
  pending read, 323 of 323.
- **Lint.** ESLint warnings per file equal trunk's (`DocumentWorkbench.tsx` 12 and 12; the test 0 and 0).

## In the running app

`ed01.cjs`, trunk `cd5f9c95a7` plus this tree, 1440 px, LMN-201's editor, signed in as the organisation's
administrator. "Before" ran the same server with trunk's `DocumentWorkbench.tsx`. The probe holds the list read for
nine seconds, then fails it with 503, then sets the stage filter to "approved" (LMN-201's documents are all drafts).

| | Before (`ed01-before.json`) | After (`ed01-after.json`) |
|---|---|---|
| **While the list is being read** | Canvas: "Nothing to edit yet … Create the first document", **New document**. Outline: "Loading documents…" (`before-while-reading.png`) | Canvas: "Loading documents…", no button (`after-while-reading.png`) |
| **After a failed read** | Canvas: "Nothing to edit yet", **New document**. Outline: "Couldn’t load documents" (`before-failed-read.png`) | Canvas: "Couldn’t load documents. The document list did not answer, so nothing is shown or offered here.", **Try again** (`after-failed-read.png`). Pressed: the list is read again and LMN-201's document opens |
| **Stage filter "approved"** | Canvas: "Nothing to edit yet … Create the first document", **New document**. Outline: "Nothing at this stage" (`before-filter-approved.png`) | Canvas: "Nothing at this stage. This project has no approved documents. Clear the filter to see the rest.", **Show all documents** (`after-filter-approved.png`). Pressed: the filter reads "all" and the document opens |
| **The read answers** | A section opens | The same |

**Seen, not changed here:**
- **The outline's failed-read sentence still says "Sign in to your tenant and retry."** The same sentence is used on
  other screens (their suites assert it), so its wording is one change across the product, not this one.
- **Two panels state the same failure** when the outline is open (the outline's and the canvas's). Each is the only
  one in view in some layout (outline closed, or a document pinned), so both stay.
- **The CSR lane's second point, "a reviewer who sees only shared documents is invited to create a duplicate".**
  The cases above remove the invitation while the list is unread, failed or filtered. Whether **New document** is
  offered to a person who may not create one is the creation refusal's question (ED-16) and is taken with it.
