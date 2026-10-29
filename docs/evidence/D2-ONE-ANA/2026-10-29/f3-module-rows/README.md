# F3 item 3, part A: a module row opens the filing's editing copy (D2, 2026-10-29)

Lane: `…session_01T2wooCZu46W7msw4TJuuzr`, board row "D2 — F3 item 3". Spec: `docs/design/FILING_SPINE.md` §7.2 F3, item 3: "Module rows open the governed document at that module." The filing-spine status read of 2026-10-22 found it only partly landed. This is part A: the right document. Part B, "at that module", follows.

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

## Not done

- **Part B: "at that module".** The editor opens the copy on its own default section. The editor target can carry a section code, but the editor opens a code only when the copy holds exactly one section with it, and a module row holds a module, not a code. Part B extends the existing target to carry the module and land on the copy's first started section in it.
- **The readiness card's market line** (`DossierReadinessCard`) is still words only. The market's own rows in Module completion now open its copy.

## Handed on

- **Trunk's pushed typecheck read 10 errors at `8b58354a`**, none of them this change's: the CSR review loader's type and the public reference seed test. `142c133d` clears them, types only.

- **Three client suites red at `8b58354a`, not this change's.** `filingPathNoDeadEnds.test.tsx` (the F16 gate: a surface it treats as locked is now in the launch scope), `projectHomeTeamResponsibilities.test.tsx` and `projectHomeIdentityFacts.test.tsx`.
