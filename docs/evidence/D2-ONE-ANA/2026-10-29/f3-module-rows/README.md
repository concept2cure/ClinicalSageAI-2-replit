# F3 item 3: a module row opens the filing's editing copy, at that module (D2, 2026-10-29)

Lane: `…session_01T2wooCZu46W7msw4TJuuzr`, board row "D2 — F3 item 3". Spec: `docs/design/FILING_SPINE.md` §7.2 F3, item 3: "Module rows open the governed document at that module." The filing-spine status read of 2026-10-22 found it only partly landed. Part A opens the right document. Part B opens it at that module.

## What already exists

An inventory workflow ran four read-only angles at `d019ca3d70`, each claim put to a refuter. It was re-checked at `8b58354a`: no commit since 2026-10-23 changed how a row picks its document.

- **The rows.** `ProjectDossier.tsx` `ModuleRow` / `ModuleCompletion`, on Project home's Author step, drawn from `GET /api/c2c/projects/:id/dossier`.
  - Every row already carries the filing it measures: `documentId`, the `c2c_documents` id, home or market (`server/services/c2c/dossier-read.ts`). The client used it only as a React key.
- **How a row chose its document.** `ProjectHome.tsx` `docForModule` took the newest document whose single `module` tag matched the row. It ignored the binding, and only home CTD module rows were looked up. That gave three wrong opens:
  - The home Module 1 row could open an added market's copy, because F22b creates those copies tagged `M1`.
  - The home copy carries one tag (the server defaults it to `M3`), so it opened from that one row only.
  - An added market's rows had nothing to click.
- **The binding.** `GET /api/authoring/docs` already returns each document's `c2c_document_id`. `CanvasDocumentList.tsx` `toBuiltDocument` dropped it.
- **The idiom.** `docs.find(d => d.c2c_document_id === filing.id)` already finds a filing's editing copy, inline, in two places: the editor's filing pane (`editor/FilingMarkets.tsx`) and the outline's start guard (`editor/startOutlineSection.ts`). No server route returns a filing's copy, and none was built.
- **The binding is not unique in the database** (a plain index, `migrations/20260728_authoring_document_governed_binding.sql`). The server keeps one copy per filing through the alias map, but a deployment without it can hold several.
- **The F22b create path** for a market's copy is `useCreateMarketCopy`, in the editor's filing pane. It is not duplicated here.
- **The editor target** (`setEditorTarget({ docId, programId })`) is how a row opens a document. It is unchanged here.

## What changed

- **`editor/editingCopy.ts` (new).** `editingCopyOf(docs, filingId, bindingOf)` returns `one`, `none` or `several`. More than one bound document is said, never chosen between.
  - The editor's two inline lookups converge onto it.
  - The filing pane now says "N documents are bound to this filing" where it opened the newest of them.
  - The start guard names the copy only when there is exactly one.
- **`BuiltDocument.filingDocumentId`.** The list carries the binding the route already sends.
- **Every dossier row opens the editing copy of the filing it measures.** That covers home rows, document-class rows and an added market's rows, through `copyFor(r.documentId)` on Project home. With no single copy, the row is not a button and says why:
  - no copy (a market's row says where one is made, the editor's filing list);
  - several copies;
  - the documents still reading;
  - the documents could not be read, so its copy is not known (never "none").
- **Tests that encoded the old rule are rewritten:** `projectHomeDocuments` ("the newest of 2 Module 2 documents"), and the chip case in `projectHomeLaunchScope`, whose document is now bound. `projectDossierParity`, `projectDossierDetails`, `dossierMapProgramScope`, `microWireups`, `projectArtifactReadiness` and `projectSectionTracking` take the new prop.

## Red, then green

| | File | Result |
|---|---|---|
| Red at `8b58354a` | `red.txt` | 5 cases, each on its defect: Module 2 opens `doc-25`, an unbound working document; Module 1 opens the EMA copy; the market row is not a button; there is no "none", "several" or "not known" wording |
| Green | `green.txt` | The two files 35/35, the helper 3/3. Every Project home, dossier, outline and filing-path client suite: 37 files, 350 passed. 7 failed, and the same 7 fail at head with these changes set aside (`filingPathNoDeadEnds` 4, `projectHomeTeamResponsibilities` 2, `projectHomeIdentityFacts` 1). Not this change's; handed on below |
| Mutations | `mutations.txt` | 7/7 red |

## Part B: at that module

### What already exists

- **The editor target** (`editorTarget.ts`) carries `docId`, `sectionCode` and `sectionLabel`. There is no module field and no section-id field. A module row is one more sender on it, not a second channel.
- **An exact code.** The workbench opened a `docId` + `sectionCode` target with `openExactDocumentSection`. It reads the document's sections on the editor's own read path, under its guards, and opens exactly one section with that code, or nothing, with a notice. The deep-link suite pins that.
- **The module rule.** `ctdCodeWithin` (`shared/regulatory/section-code.ts`) says whether a code lies under a module ('M3' and '3' both read as '3').
- **Landing.** Once a section id is known, `requestLeave({ kind: 'document', id, sectionId })` selects it and scrolls to it.

### What changed

- **`EditorTarget.sectionWithin`**, optional and set only when sent, so every other target keeps its exact shape. `setEditorTarget({ within })` publishes it, and the reader carries it.
- **`editor/linkedSectionPick.ts` (new, pure).**
  - `pickExactSection` is the existing rule and words, moved.
  - `pickSectionWithin` takes the document's first section, by order, whose code lies under the module. If none is started, it opens the document at its first section and says "No section of Module N has been started in this document yet…". If the read failed, it opens nothing and says so.
  - `linkedSectionPickFor` chooses between them: an exact code wins over a module.
- **One read.** The workbench's `openExactDocumentSection` became `openLinkedSection(docId, pick)`: the same read and guards, choosing through the pick. The target effect calls it in two lines where it had four. Its complexity is head's 32, and the file's warning count is head's 12. A first draft took the effect to 105 lines, past its limit, and the ratchet would have refused it.
- **The row.** A CTD module row (1-5) sends `within: 'M<n>'` with its copy. A device pack's lettered heading is not a CTD code and sends none.

### Red, then green

| | File | Result |
|---|---|---|
| Red at `55673579` | `red-part-b.txt` | 5 cases: no `sectionWithin` on any target, and the editor lands on the document's first section ("Cover letter.") |
| Green | `green.txt` | The deep-link suite 17/17, editorTarget 22/22, the Project home and dossier suites. The wide client run is recorded there |
| Mutations | `mutations-part-b.txt` | 8/8 red, one after a case was added for the precedence it had not pinned |

## Not done

- **The readiness card's market line** (`DossierReadinessCard`) is still words only. The market's own rows in Module completion now open its copy.

## Handed on

- **Trunk's pushed typecheck read 10 errors at `8b58354a`**, none of them this change's: the CSR review loader's type and the public reference seed test. `142c133d` clears them, types only.

- **Three client suites red at `8b58354a`, not this change's.** `filingPathNoDeadEnds.test.tsx` (the F16 gate: a surface it treats as locked is now in the launch scope), `projectHomeTeamResponsibilities.test.tsx` and `projectHomeIdentityFacts.test.tsx`.
