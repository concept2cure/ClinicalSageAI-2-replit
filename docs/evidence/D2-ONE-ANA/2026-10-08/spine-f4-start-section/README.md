# Spine F4 — an unstarted section can be started

Launch row **D2** (one AnA, the filing spine). Design: `docs/design/FILING_SPINE.md` §6 row 7, §7.2 F4; `docs/design/WORKFLOW_DECISION_2026-10-08.md` §3 step 2 ("Clicking an unstarted section starts it") and §6 week 2.

Line numbers are from the working tree after the change.

## What was wrong

- The editor shows the governed filing outline. A node with no section in the open document was dimmed, and a click on it only toasted "`<code> <label>` — no draft yet in this document." (`DocumentWorkbench.tsx`, the outline's `onClick`). Nothing created the section. The outline named the work and gave no way to begin it.
- The F0 gate listed this as the red hop `outline-node-to-started-section` (`tests/ui/filing-path-reachability.baseline.json`).

### Found in review of the first version of this change, and fixed here

- **Wrong document.** The outline is the project's governed filing (`useFilingOutline`, read from `/api/c2c/documents?projectId=`). A project holds many authoring documents, and only one of them is the filing's editing copy (`authoring_documents.c2c_document_id`; `server/services/authoring/authoring-documents.ts:153-224` resolveBinding: "one filing, one editing copy"). The first version offered "Select to start it" in any open document. With an AnA draft or another working document open, one click created that filing node's section in the wrong document, with a genesis revision and a CREATE audit row. Its text could never reach the filing, because only the bound copy's sections are committed into the filing's slots (`server/services/c2c/commit-section-to-filing.ts:115`, exact `section_key = code`).
- **Wrong module.** The same defect seen from a module 3 working document: a module 2 node (`2.5`) was created inside it.
- **Wrong status word.** An approved document was described as "frozen".
- **A code that differs only in case.** The server refuses `3.2.S.1` as a duplicate of a stored `3.2.s.1` (`server/services/authoring/section-placement.ts:66-67`, trim and upper-case). The client binds by exact code, so the node stayed unstarted and every click posted again into the same 409.
- **No busy state.** While a create ran, a click on another node was dropped without a word, and the row said nothing.
- **Accessible name.** The row's name read like a plain navigation row. A keyboard or screen-reader user was not told that it creates a section, or why it cannot.

## What changed

- `client/src/concept2cure/v2/editor/startOutlineSection.ts` (new):
  - `postOutlineSection` (`:44`) posts to `POST /api/authoring/sections` with `{ doc_id, code: node.key, title: node.label, content: '' }`. This is the route "New section" (`surfaces/AuthoringCreateExport.tsx`) and the open-in-editor handoff (`authoringHandoff.ts`) already use. No second create path and no server change: the route already refuses a frozen or approved parent (403), refuses a code already taken (409 `SECTION_CODE_EXISTS`), and writes the genesis revision and the CREATE audit row. A refusal is shown in the server's words: "`<code>` was not started — `<server message>`".
  - `startOffer` (`:114`) decides, in one pure function, whether a start is offered. The tooltip, the accessible name and the click's guard all read it, so they cannot disagree. No start, and the reason said, when:
    - no document is open;
    - the document is approved or frozen ("This document is approved, so no section can be added.", the real status);
    - the filing was not read;
    - the document list did not say what the document is bound to (unknown is not "yes");
    - the document is not the filing's editing copy: "This outline belongs to `<filing>`, and this document is not its editing copy, so a section started here would not reach the filing. Open “`<copy title>`” to start it." The copy is named when it is in the list;
    - the document already holds a section whose code differs only in case or spaces (`:150`). That is said, not posted.
  - `unstartedRowProps` (`:184`) gives the row its tooltip, an accessible name that says "Start this section in this document" or the reason it cannot, `aria-disabled` when it cannot, and `aria-busy` while its create runs.
  - `useStartOutlineSection` (`:243`) returns the click handler, which also carries `offerFor` and `startingKey`. A refused offer toasts "`<code> <label>` was not started. `<why>`" and posts nothing (`:266`). A click on another node while a create runs answers "Starting 3.5 — select 2.5 again when it opens." (`:269`). The rest is as before: create, re-read, open through the workbench's `requestLeave` (the unsaved-work guard still holds), put the cursor in the editor. A 409 re-reads so the node binds to the section someone else started.
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx`:
  - `:138` `AuthDoc` gains the optional `c2c_document_id` (null when unbound, absent when the list did not say).
  - `:1706` `const startNode = useStartOutlineSection({ activeDoc, filing: filing.document, docs, sections, … })`.
  - `:3442` and `:3454` an unstarted row spreads `unstartedRowProps(startNode, node)` (title, accessible name, disabled and busy state).
  - `:3476` the unstarted row's click calls `startNode(node)`. The unread branch is unchanged: it never starts anything.
  - ESLint: 14 warnings, the same as HEAD.
- Only the outline row's click reaches this. AnA does not call it.
- `tests/ui/filing-path-reachability.baseline.json`: the `outline-node-to-started-section` entry is removed. The list only shrinks. The `review-tab-to-document` and `placed-document-to-sequence` entries were removed by the concurrent F7 and F10 work; this change touched only the F4 entry.

### Not changed, and why

- **The module check the review proposed** (offer a start only when the node's first digit matches `activeDoc.module`) was not added. Once a start is offered only in the filing's editing copy, every node of that outline belongs in that document: the bound copy holds the whole filing, M1 to M5, and its sections are committed into the filing by code whatever its `module` column says. A module check would refuse M1, M2, M4 and M5 nodes in the one document where they belong. The case the review found, a module 3 working document taking a module 2 node, is refused by the binding check and has its own test.

## Shown

`red/outlineStartsSection.txt` is the test against the HEAD workbench (no F4). `red/outlineStartsSection-first-version.txt` is the same test against the first version of this change, before the review fixes. `green/` is the final code.

| Test (`client/src/concept2cure/v2/__tests__/outlineStartsSection.test.tsx`) | HEAD | First version | Final |
|---|---|---|---|
| clicking `3.5` in the filing's copy posts `{ doc_id, code: '3.5', title, content: '' }`, opens it, puts the cursor in it; accessible name says it starts a section | fails (no start) | fails (no accessible name) | passes |
| a 403 refusal shows the server's words and opens nothing | fails | passes | passes |
| a 409 re-reads and the node binds to the other person's section | fails | passes | passes |
| an approved document says "approved", is `aria-disabled`, posts nothing | fails | fails ("The document is frozen") | passes |
| an AnA draft open (not the filing's copy): a click posts nothing and names the copy, “Quality module” | fails | **fails: 1 POST** | passes |
| a module 3 working document: clicking module 2 node `2.5` posts nothing | fails | **fails: 1 POST** | passes |
| the list did not say what the document is bound to: nothing offered | fails | fails | passes |
| `3.2.S.1` with a stored `3.2.s.1`: said, not posted | fails | fails | passes |
| while `3.5` is being created its row is `aria-busy`; a click on `2.5` is answered, not dropped | fails | fails | passes |

| Gate | Before (red) | After (green) |
|---|---|---|
| `tests/ui/filing-path-reachability.test.ts` › the hops on the code › `outline-node-to-started-section` | fails on the HEAD workbench: "an unstarted node only toasts" (`red/filing-path-reachability.txt`) | passes, 21 of 21 (`green/filing-path-reachability.txt`) |

The gate also failed during this change, on an intermediate shape where the row called `outlineStart.start(node)`: "the outline never posts to /api/authoring/sections". The handler is named `startNode` again, so the gate can follow it into the helper.

Also run (`green/related-suite.txt`): every test file that imports or mocks `DocumentWorkbench`, `DocumentAuthoring` or the helper (42 files with the new test and the gate). `npm run -s ci:canvas-path` passes. `npx eslint`: `DocumentWorkbench.tsx` 14 warnings (HEAD 14); the helper and the test 0. A targeted `tsc` over the three files reports nothing in them.

## The binding, landed in the same change

The outline can only offer the start in the filing's copy if the client knows which document that is. The slice's report asked for the field; it was added before commit:

- `server/routes/authoring.router.ts`: `GET /api/authoring/docs` and `GET /api/authoring/docs/:docId` return `c2c_document_id`, read through `to_jsonb(d)`, so a deployment without the column answers null ("unbound") rather than failing.
- `client/src/concept2cure/v2/editor/DocumentCanvas.tsx`: the canvas passes the field to the workbench (`docsForWorkbench`). Before this it dropped it, so the pinned document always read as "binding not known".

| Test | Against HEAD | After |
|---|---|---|
| `server/routes/__tests__/authoringFromDraft.pglite.integration.test.ts` › two POST /docs for one program (PGlite, real router): the bound copy lists and reads `FILING_B`; the unbound document and the AnA draft read `null` | fails: `expected undefined to be 'doc_ind_33333333'` | 12 of 12 pass |
| `client/src/concept2cure/v2/__tests__/documentCanvasFilingBinding.test.tsx`: the canvas hands the workbench `c2c_document_id` for a bound document and `null` for an unbound one | fails, both cases (field missing) | 2 of 2 pass |

Both red runs swapped in the HEAD file and restored it.

## Not done

- Starting a section is one click with no confirmation. It creates an empty section with a genesis revision and an audit row, the same act as "New section". Nothing on this surface removes a section started by mistake.
- No visible "start" text on the row. The tooltip, the accessible name and the dimmed row with its "required" chip carry it. A visible affordance needs a CSS rule outside this slice's files.
- A section whose code differs only in case is reported, not repaired. Renaming the code of a bound document's section is refused by the server (`CODE_LOCKED_TO_FILING`), so the repair is not one this surface can make.
- A new section's text reaches the governed filing on its first save (`commitSectionToFiling`), as for any authored section.
