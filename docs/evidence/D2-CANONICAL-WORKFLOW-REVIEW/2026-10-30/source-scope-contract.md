# Existing editor source ownership: bounded implementation contract

Date: 2026-10-30. D2 / W2. This document proposes the smallest coherent correction to the source-metadata session boundary. It does not authorize production changes until root's independent contract review approves it. The existing regression file remains frozen; this task changes only this contract.

## Evidence and current owners

Root executed the actual `DocumentWorkbench` regression in `editor/__tests__/workbenchSourceSessionOwnership.test.tsx`. `source-session-red.txt` records **one failing replacement-session case and one passing ordinary-refresh control**. After replacement-session prose settled with unchanged document/section IDs, releasing a prior-session catalog JSON body produced a selectable “Prior-session protocol source” button. This proves stale client source-choice publication. It does not establish a backend access bypass.

The existing owners remain authoritative:

- `dataConnect.tsx:354–369`: `DataReadOwner` and private `useDataReadVisit` already provide a captured, sticky retired visit; `useLiveData` tags stored results by that visit and masks them during render, before passive cleanup.
- `editor/DocumentWorkbench.tsx:1304`: one existing `useAuthoringReadSession`, `readKey`/`currentReadKey` and authoritative section/metadata guards; `writerContext`/`currentWriterContext` at `:1420` already encode actor/session/project without document identity.
- `editor/useProjectSourceCatalog.ts:24`: one complete paged metadata catalog; only production caller is Workbench at `:1530`.
- `editor/citationAdmission.ts:25`: one recorded-association reader; only production caller is Workbench at `:1532`.
- Workbench's recorded-section-source reader at `:2916`, existing source mutations at `:3024–3215`, and `citationsApi` at `:5505` are the consumers to fence.
- `editor/ProjectFilesPanel.tsx:448`: existing program-keyed wrapper and sole inner implementation own vault tree/search, selection, viewer, pending open, source library and IND-library UI. Production hosts are Workbench (`:6113`) and `surfaces/ProjectHome.tsx:233`.
- `editor/DataRoomSourcesPanel.tsx:95`: existing program-keyed wrapper, search/page/retry state and `useLiveData` read. Its only production caller is ProjectFilesPanel at `:508`.
- Import/assembly already use `useSourceIntake`, `useSourceAssemblyTarget`, their original owner guards and the authoring attempt ledger. Those are outside this correction.

## Approved surface of the proposed change

No new auth subscription, read engine, store, endpoint, request-body field, source eligibility rule, permission, database change or editor instance is introduced. Extend the existing owners below. Export the existing read-visit helper/type rather than copy its implementation.

```ts
// dataConnect.tsx: visibility change to the existing definitions only
export interface DataReadVisit { key: string; path: string | null; retired: boolean }
export function useDataReadVisit(path: string | null, owner?: DataReadOwner): {
  visit: DataReadVisit | null;
  current: () => boolean;
};

// Existing signatures remain valid for current tests/other compatibility callers.
useProjectSourceCatalog(programId: string | null, owner?: DataReadOwner)
useDocumentCitationAdmission(documentId: string | null, programId: string | null, owner?: DataReadOwner)

interface ProjectFilesPanelProps { /* current props */ readOwner?: DataReadOwner }
// DataRoomSourcesPanel's current prop type gains the same optional readOwner.
```

The helper's identity/current semantics remain unchanged. A real owner/visit change must retrigger the read; a new inline callback/object with the same valid visit must not cause an effect loop. Hooks must not make their retry function change identity on each state publication. Any dependency exception must explain why the canonical visit, rather than the fresh wrapper object returned each render, is the trigger.

## 1. Supply the existing Workbench owner once

Derive a stable project-level `DataReadOwner` in Workbench from the **existing** `writerContext`, `currentWriterContext` and `readSession`. Its key is the actor/session/project identity already encoded by `writerContext`; `current()` requires that original context still match and `readSession.sameRevision()` remain true. Reuse that owner for the project catalog and ProjectFilesPanel. Do not include document, section, rail, title, status or an ordinary refreshed bearer in the project-level key.

Use the existing `readKey`/`currentReadKey` for document-specific source admission and section reads. It is acceptable to derive a document-level `DataReadOwner` from the same already-captured `readSession`; it must not call `useAuth`, `useAuthoringReadSession` or subscribe to auth again. Include the document identity for recorded associations and document-scoped receipts, and the exact section identity for section-scoped reads/receipts.

Be mindful of declaration order: Workbench's `aliveRef` is currently declared below the metadata hooks. Do not invoke a newly supplied owner guard that reads that ref before initialization. Async callbacks declared after it can continue checking real mount lifetime as well as their captured owner.

## 2. Bind catalog and admission publication to the canonical visit

Both hooks call the existing `useDataReadVisit` with their exact logical read identity and supplied owner. Keep all current program/document validation, generation counters, complete-page behavior and explicit error states.

- Store the producing visit alongside each result. Return an empty loading/idle view synchronously whenever the stored visit differs or its captured `current()` is false. An old error must not appear under a replacement owner either. Do not wait for an effect to clear actionable source data.
- The existing load effects depend on the canonical visit in addition to their current identity/epoch inputs. Check captured currentness before dispatch and after response/body work, including every catalog page. Generation checks still prevent overlapping retries/page loads. Late successful and failed results from retired visits do nothing.
- Retry belongs to its captured visit and logical read identity. A retained old retry callback cannot invalidate the replacement read, remint authority, publish an old empty state or start another request. Ordinary current retry keeps existing behavior.
- Admission's `admit(sectionId, sourceId)` is also an original-visit callback. It must check currentness before enqueueing and inside the state updater, and require the previous ready result to carry that same visit/document scope. An old successful POST cannot append an association to replacement-session state.
- With no optional owner, preserve the established program/document/generation behavior and public return shape. Do not weaken the explicit `source_details: null` withholding rule, malformed-association refusal or complete-catalog requirement.

No transport mutation, automatic creation/retry, source checksum refresh or new permission check is part of these hooks.

## 3. Fence recorded section sources and source receipts in Workbench

Keep the existing recorded-section-source reader. Add captured session/document/section ownership to its current section/generation fencing, and tag its stored rows/read state so a same-ID session replacement masks them synchronously. The replacement owner's load runs even when the returned authoritative section ID is unchanged. A retained earlier-section load cannot begin a new read and replace `sourcesSectionRef` for the currently selected section.

Every consumer, including the source rail and Workbench's published AnA evidence context, reads the owner-filtered rows and state, never the raw previous-owner storage. Preserve the distinction between failed reads, loading and a confirmed empty list.

For the existing source handlers (`citeSource`, `uncite`, `reresolve`, `refreshAllSources`):

- Check the captured session and exact relevant document/section before dispatch, after awaited response/body work, in catch/finally paths and before any toast, local association/count/selection update, follow-up read or refresh finding publication.
- Reuse the session-aware read identity in the existing citation scope. The ID-only `${program}:${document}:${section}` scope is insufficient after session replacement.
- Do not cancel or relabel a server mutation already dispatched. A result that belongs to an old view is simply not applied to the replacement view. This is UI receipt ownership, not a server-write policy change.
- Document-wide refresh remains document-scoped. A normal section change within the same document need not discard the document's refresh result; if a section reload follows, target the **currently selected** section under the same current document owner, rather than a captured earlier section. Session/document replacement cannot retain the prior view's skipped findings or a stuck busy flag. Tag or derive those source-only auxiliary states by owner; do not reset the entire editor.

Existing source eligibility, immutable-citation behavior, API method/path/body, success/error wording and persisted audit semantics remain unchanged.

## 4. Retire the existing files/data-room view without remounting the editor

Pass the project-level Workbench owner through the existing ProjectFilesPanel. Its existing public wrapper uses the canonical visit plus program identity to key **only its current inner files implementation** and masks the inner view immediately when the supplied owner is invalid. A changed session retires vault tree/search/query/selection/viewer/pull state and mounts the same inner implementation for the new owner. A normal bearer refresh or document/section switch in the same project leaves it intact.

The wrapper/inner boundary must also gate retained file actions and their async presentation with the captured owner. In particular, `useVaultFileActions` checks before dispatch and before `presentOpenedFile`: suppressing only a toast or `showPdf` callback is insufficient because `presentOpenedFile` itself can call `downloadBlob` for non-PDF files (`vaultPdfViewer.tsx:84`). Continue using the existing viewer cleanup to revoke its owned object URL on retirement. Do not edit the shared PDF/download service or change audited file-fetch behavior.

Pass that captured owner into DataRoomSourcesPanel. Extend its existing wrapper/inner boundary rather than create a parallel library. Use the supplied owner on its existing `useLiveData` call; invalid/changed visits mask rows/catalog facts/snippets and retire query/page/selected import state. Current row actions check the captured owner before source study/navigation/import intent. Preserve existing search debounce, current page parser, project/source identity, grounding eligibility and source-intake ownership.

ProjectHome already has the separately corrected session/project-keyed workspace owner. Do not duplicate its auth subscription or expand this correction to ProjectHome. Its current ProjectFilesPanel caller can retain compatibility without the new optional owner because the existing workspace owns that component's lifetime. The files wrapper also retires its nested IND-library view on owner change; do not revise IND template-creation authority or rebuild that library in this patch.

## Production ownership list

The implementation worker may edit only these six existing production files after approval:

1. `client/src/concept2cure/v2/dataConnect.tsx` — export existing visit helper/type; retain semantics.
2. `client/src/concept2cure/v2/editor/useProjectSourceCatalog.ts` — optional owner and tagged/fenced publication/retry.
3. `client/src/concept2cure/v2/editor/citationAdmission.ts` — optional owner, tagged publication/retry and original-visit admission.
4. `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — derive/pass existing owner; fence source-only reads, state and receipt callbacks.
5. `client/src/concept2cure/v2/editor/ProjectFilesPanel.tsx` — optional owner on existing wrapper/inner view and presentation/action currentness.
6. `client/src/concept2cure/v2/editor/DataRoomSourcesPanel.tsx` — optional owner through existing scoped view/live read/actions.

Do not edit production outside this list, add helpers/subsystems, alter tests to obtain green results, run runners/compilers, mutate Git or touch server files. Root owns runner evidence, qualification, audit status updates and direct normal pushes. Escalate a concrete conflict with this contract before widening file ownership.

## Regression/qualification set for root

**Proof boundary:** rerun the frozen `workbenchSourceSessionOwnership.test.tsx`. The prior-session selectable title must be absent after the deferred body is released, a fresh-owner request must occur, and the replacement title must be available. Its ordinary-refresh control must keep the same Tiptap node and catalog read count.

**Existing source owners:** `projectSourceCatalog.test.tsx`, `citationAdmission.test.tsx`, `dataRoomSourceReads.test.tsx`, `editorSourceLibraries.test.tsx`, `sourceUiRules.test.tsx`.

**Files and handoff owners:** `projectVaultSearch.test.tsx`, `projectFilesViewer.test.tsx`, `projectFilesRecovery.test.tsx`, `vaultCitationConfirmation.test.tsx`, `projectFilesSourceAssembly.test.tsx`, `projectFilesAssemblyFlow.test.tsx`, `sourceImportScope.test.tsx`, `sourceImportDialog.test.tsx`, `sourceIntakeOwnership.test.tsx`, `sourceIntakeTransport.test.ts`, `sourceAssemblyOwnership.test.tsx`, `sourceAssemblyReceiverOwnership.test.tsx`, `sourceAssemblyEntry.test.tsx`.

**Editor and shared-read preservation:** `workbenchDocumentAccess.test.tsx`, existing Workbench source/remedy suites, `liveRowsStability.test.tsx`, and the existing DataReadOwner tests selected by root. Preserve real source-read failures, access projections, dirty-buffer leave/ceremony decisions, ordinary refresh and all exact source identity checks. Normal root qualification still includes production build, whole-project TypeScript, zero-warning-growth lint and normal push gates.

The frozen regression proves only the deferred catalog replacement case. Admission/section-read/receipt/files-boundary behavior is a contract expectation until root obtains relevant executed evidence. Do not report those adjacent protections as independently reproduced or qualified merely because the catalog test turns green.
