# Independent contract review: existing editor source ownership

Reviewer: `action_order_contract`. Date: 2026-10-30. **APPROVED with the binding original-visit clarifications below. No blocking scope issue remains.** Approval is limited to the six existing production owners named in `source-scope-contract.md`. It is contract approval, not an implementation or qualification verdict. The reviewer ran no runner, compiler, browser or Git command and changed no production/test source.

## What already exists

`dataConnect.tsx` already provides `DataReadOwner`, sticky `useDataReadVisit` identity and synchronous owner-filtered read publication. Workbench already captures the authoritative session and project/document read keys while preserving its canonical dirty editor. The catalog hook walks all metadata pages; citation admission admits recorded associations and explicitly withholds `source_details: null`. Workbench owns section-source reads and source mutation receipts. ProjectFilesPanel/DataRoomSourcesPanel already have public wrappers around single inner implementations; the files panel owns vault selection, pending presentation and the shared PDF viewer. Source intake, source assembly, governed creation and the authoring ledger remain separate existing owners. None needs replacement.

The retained root red evidence proves one source-catalog publication defect and one passing ordinary-refresh control using actual Workbench/session guards. It does not prove a backend access failure, nor independently reproduce every adjacent receipt/files hazard.

## Scope and implementation contract

The six-file boundary is the smallest coherent correction for the source metadata that reaches the retained editor: export the existing visit helper/type without semantic change; extend its catalog and admission consumers; fence source-only Workbench state/receipts; pass the project owner through the existing files and data-room wrappers. A catalog-only fence would leave other original source associations and file presentation on a different lifetime. No new subscription, engine, store, endpoint, request format, eligibility rule, permission or editor instance is warranted.

I approve the existing project-level owner based on `writerContext` plus the captured session, with document/section scope added only where the operation actually belongs. Project shelf state must survive ordinary document/section switches and bearer refresh. Document-wide refresh findings belong to the document owner, while follow-up section reads must target the currently selected section under that still-current document owner. The full editor and its dirty buffer must not be keyed or reset to accomplish any of this.

The callback and synchronous publication rules in the proposed contract are required, including load dispatch, every page/body completion, errors, retry/admission state updaters, receipt toasts/counts/selection, follow-up reads and source context published to AnA. Fresh wrapper function identities are not load triggers; the canonical visit and actual logical identity are. Existing generation checks still arbitrate overlapping retries.

## Binding original-visit clarifications

1. **Capture the canonical visit identity, not only a string key or latest owner callback.** Project/document/section A→B→A must never revive a callback from the first A visit. An invalid→valid owner with the same key also creates a fresh canonical visit. The existing helper already supplies this sticky retirement; reuse it rather than another read engine. Retained retries/admissions/section loaders and source receipt closures must check their captured visit before changing a generation/ref or enqueueing state. Check again inside state updaters. Tags on stored result/busy/finding state must distinguish the producing visit where equal logical IDs can recur.
2. **Key the files inner implementation by an actual canonical visit boundary.** Using only `readOwner.key` cannot express a new visit under the same key after retirement. Preserve the existing no-owner program compatibility. An invalid supplied visit masks and retires the old inner immediately, and all retained inner actions must keep the original captured guard rather than acquire replacement authority through a mutable latest-owner ref.
3. **Fence the whole file presentation dispatch.** `useVaultFileActions` must check currentness before audited fetch and immediately before `presentOpenedFile`, with the original mount/visit guard retained across awaits. Gating only a toast or `showPdf` leaves non-PDF `downloadBlob` presentation active. Keep the shared download/PDF service and object-URL cleanup unchanged. Cite, plain reference, source-study/navigation/import-intent callbacks also require the captured files/data-room visit; import/assembly's existing deeper owners remain intact.
4. **A receipt fence does not undo a dispatched server write.** Preserve method/path/body, audited semantics, exact source identity and existing messages. Retire stale local receipts and derive fresh source-only busy/findings state so a departed operation neither changes the replacement view nor leaves it permanently busy. Document-wide results remain document-scoped across ordinary section changes; section-scoped receipts do not migrate to another section.

These are precise interpretations of the proposed original-visit requirements, not an expansion beyond its six files. Do not weaken complete-catalog admission, malformed-association refusal, null withholding, source eligibility, access projections or dirty-editor leave/ceremony behavior.

## Qualification requirements

Root should retain the frozen red/positive regression and obtain executed evidence for the adjacent boundaries before describing them as qualified. Deterministic cases should include: deferred old/new catalog and recorded-admission body success/error; old retry/admit after replacement; section A→B→A with delayed source reads and receipts; document A→B→A with document refresh findings/busy state; same-ID actor/session replacement; invalid→valid same owner key; repeated same-visit callback/object rerenders; ordinary refresh and document/section changes preserving the project shelf/editor; and delayed PDF **and non-PDF** file completion after retirement with no new presentation/download. Existing source, files, intake/assembly and editor/shared-read suites named in the contract remain relevant.

Root owns production authorization, implementation review, red/green execution, combined qualification and canonical publication. This approval claims no adjacent behavior has already passed.

## Reviewed source/evidence SHA-256 pins

```json
{
  "client/src/concept2cure/v2/dataConnect.tsx": "51b03e8cf336df448663742c5b31bb4dc9c93f6879b437cc490420fcc6809815",
  "client/src/concept2cure/v2/editor/useProjectSourceCatalog.ts": "d6a89cf30ad47e0bcaf1b05bb098a869b5c6b3d0cb38e923283848485f5cb807",
  "client/src/concept2cure/v2/editor/citationAdmission.ts": "58d88401f947d63a0c7c61954dda8a9076d7f3199c33d7cd8bf0992ed82200c4",
  "client/src/concept2cure/v2/editor/DocumentWorkbench.tsx": "326e0ddcf63bc0de0b28a88b46587b9539b0af0e4a0964ea72abb65ca11d13e9",
  "client/src/concept2cure/v2/editor/ProjectFilesPanel.tsx": "f5e996375e537a42e6ebc056f5e122cfb8a9c424a5223dea96c233185b0e5c98",
  "client/src/concept2cure/v2/editor/DataRoomSourcesPanel.tsx": "72795c57c0eaa9b80392944d8837f43a872ce71f6f184f79e7d8696ee80e1cc3",
  "client/src/concept2cure/v2/editor/authoringCurrentRead.ts": "eeb1c7f6670a9372216bbb844bc11f52632e74e127260a3e9a29d50586a657d7",
  "client/src/concept2cure/v2/editor/vaultPdfViewer.tsx": "8d54497ba729c6a7874b05668154b99c752ade3ec4968af97d47435406b3af04",
  "client/src/concept2cure/v2/editor/ProjectFileActions.tsx": "0168c4be4c6ff9677399bc8fe45c933de925f56509fdf9c46696419f9be0f7d6",
  "client/src/concept2cure/v2/editor/useSourceAssemblyTarget.ts": "648b0b695c8e9b81dc54a3635d4aac7e7ab044b6a36eb4195cdcfe5e60198324",
  "client/src/concept2cure/v2/editor/__tests__/workbenchSourceSessionOwnership.test.tsx": "f4d80c505b74bdefd6d9e2e0361cb1391d959ea83f7297d6de6032401f290a89",
  "docs/evidence/D2-CANONICAL-WORKFLOW-REVIEW/2026-10-30/source-scope-contract.md": "c4da2556f33b78163890c4860726c7e1fdfa56e5bbcf8a86ccf6806c1c1af1ca",
  "docs/evidence/D2-CANONICAL-WORKFLOW-REVIEW/2026-10-30/source-session-red-inputs.json": "ec9511adaea842cc949f4c392a6a3ce4baaa9b6099eaf049ae63e4eb6bc39a6c",
  "docs/evidence/D2-CANONICAL-WORKFLOW-REVIEW/2026-10-30/source-session-red.txt": "431d9b8d86cf16e5be6dbc3c089be5f4b46c3c8b706ac34eb954d751afbfbfec"
}
```
