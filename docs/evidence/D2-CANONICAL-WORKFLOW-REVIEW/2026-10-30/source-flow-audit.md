# Current source-flow catch-up audit

Date: 2026-10-30. Workstream: D2 / W2. Canonical baseline: `concept2cure-v2` at `438287ed102ff9857938276bbe835f0ec1c11a88`; comparison baseline: `eba2d8050d69adc5bb8202378340ea272c398554`.

This is a read-only source audit under `docs/design/CANONICAL_WORKFLOW_REVIEW_2026-10-30.md`. AGENTS.md, CLAUDE.md and the source-flow inventory were read. No production or test changes, runner/compiler executions, database calls or Git mutations were performed by this audit. Test files below were inspected, not executed. Statements about behavior are source traces unless explicitly stated otherwise. Root's action-ordering and ProjectHome ownership work is separate.

## What already exists

| Responsibility | Existing owner |
| --- | --- |
| Source catalog validation and complete metadata pagination | `client/src/concept2cure/v2/editor/projectSourceCatalog.ts`, `useProjectSourceCatalog.ts` |
| Searchable, paged source library beside the document | `editor/DataRoomSourcesPanel.tsx`, `SourceCatalogLine.tsx`, `ProjectFilesPanel.tsx` |
| One import visit, account/session/project/source guard, attempt ledger | `editor/useSourceIntake.ts`, `authoringCreationRecovery.ts` |
| Import preview, captured request, typed outcomes and exact recovery verification | `v2/authoringHandoff.ts` |
| Working-copy import UI and explicit recovery/open actions | `editor/SourceImportDialog.tsx` |
| Scoped selected-source handoff to an existing or new working document | `editor/useSourceAssemblyTarget.ts`, `SourceAssemblyDialog.tsx` |
| Citation association admission and editor consumption | `editor/citationAdmission.ts`, `DocumentWorkbench.tsx` |
| Authoritative current document/session reads | `editor/authoringCurrentRead.ts`, `DocumentWorkbench.tsx`, `surfaces/DocumentAuthoring.tsx` |
| Optional current-owner support for live reads | `v2/dataConnect.tsx:354` (`DataReadOwner`) |
| Import API, atomic creator and source materialization | `server/routes/authoring.router.ts:1490`, `server/services/authoring/authoring-source-import.ts`, `workflow-source-import.ts` |
| Catalog and citation APIs | `server/routes/c2c/projects.ts:1782`, `server/routes/authoring.router.ts:2853` and `:5614`, `server/services/clinical-regulatory-evidence/source-usage.service.ts` |

All client paths in the table are under `client/src/concept2cure/v2/`. These owners should be extended if follow-up work is qualified; there is no need for a second source-management system.

## Improvements published since the comparison baseline

Relevant published commits include `8c86a44a3` (2026-10-23, intake ownership and uncertain-copy recovery), `4d8cf50d0` (2026-10-26, original source ownership through editor handoff), `13bafc62f` (2026-10-26, full CSR and saved-study CRF authoring), and `14b27100d` (2026-10-27, connected biotech authoring/response workflows).

1. **Intake now owns an exact visit.** `useSourceIntake.ts:40` captures the original account object, actor identity, canonical session guard, project-visit guard and copied source selector. Retirement is sticky. Retained fields, preview replies and saved receipts cannot mint a fresh owner merely because a project or source later returns to the same ID. Ordinary adopted token refresh is distinguished from session replacement.
2. **A dispatched creation is accounted for separately from its UI.** `useSourceIntake.ts:155` reuses the existing authoring attempt ledger. Creating, unknown, checking, checked, saved and refused are distinct outcomes. Unknown writes remain held for a read-only check; closing a dialog does not manufacture a failed creation or automatically repeat it.
3. **Recovery requires identity, not resemblance.** `authoringHandoff.ts:419` onward pins recovery to exact document, organization and program IDs, a whole-document current read and recorded import origin. It validates actual persisted sections and creator ownership. Generic inventory does not prove which request created a document and never becomes a fabricated save receipt. A successful check is separate from an explicit Open action.
4. **Workflow previews now pin saved evidence.** The handoff validates source kind/identity, selected CSR sections, numeric target anchor, origin fingerprints and preview-section hashes. Saved protocol, CSR, IVD, study-design CRF and agency-response output share the existing editor path. The UI distinguishes recorded authorship/model information from unavailable information and shows gaps/association requirements.
5. **The server rechecks at the write boundary.** `authoring-source-import.ts:344` reads a coherent workflow snapshot; `:360` reauthorizes the target and rematerializes the source inside creation, compares the expected fingerprint and reserves creator/project/source identity. Existing-copy reuse checks edit permission. Binary import verifies the original file's bytes against the recorded SHA-256 (`:245` onward). These are stronger guarantees than trusting client labels.
6. **Source-first assembly is a scoped handoff.** `useSourceAssemblyTarget.ts:30` captures session/project/source identity. The inventory reader (`:63`) validates exact project, row identity and explicit document/sections projection, offering only unsealed, unlocked whole documents. Open rereads the inventory and rechecks context after host close before navigation; the chooser does not create or overwrite a document itself.
7. **Failure and empty states are substantially clearer.** Complete catalog reads publish no partial citation authority; changing totals, duplicate IDs, malformed page metadata and later-page failures become recoverable errors (`useProjectSourceCatalog.ts:26`). Search/page/project transitions mask old source actions. Readability, original-file availability and grounding eligibility are shown separately. Failed checks do not claim the project has zero sources or that a prior creation failed.

## Remaining finding: source metadata outlives a same-mounted authoring session

**Priority: P2; high-confidence source trace, awaiting executable reproduction.** This is a client response/cache lifetime issue. It is not evidence of a backend authorization bypass or of an unauthorized write.

**Trigger.** Keep the canonical editor mounted with the same program, document and section IDs. Populate its source catalog/recorded citation cache (or leave their response JSON unresolved). Replace the canonical signed-in session, including the same-actor replacement already supported by existing tests. Let the new session's authoritative document/section reads settle with the same readable IDs. Source metadata has no corresponding session boundary.

**Ownership gap.**

- `useProjectSourceCatalog.ts:24` resets and fences replies only for `programId`/retry epoch. Its effect dependencies at `:60` exclude actor/session, and its synchronous publication check at `:62` compares only program ID. A completed old catalog remains ready; a deferred old catalog may still be admitted after replacement.
- `citationAdmission.ts:25` fences recorded associations only by document/program/retry epoch. The document guard at `:58` excludes actor/session. An old association containing source details may therefore remain available to the editor, even if a new authoritative citation read would withhold it.
- `DocumentWorkbench.tsx:1304` correctly gives document sections and metadata a session-aware `readKey`. However, its catalog/admission calls at `:1530` do not receive that owner. `citationScope` at `:1534` contains only program/document/section IDs.
- The independent section-source loader at `DocumentWorkbench.tsx:2916` guards only the section ID. Its read effect at `:2962` likewise omits the read session. This is the same lifetime boundary in another source consumer, not proof that the underlying server read is unscoped.

**Why this can become visible after authoritative reads settle.**

- The main body immediately masks old sections while `readKey` changes (`DocumentWorkbench.tsx:1309`); this existing protection must be preserved.
- On the successful replacement section read, `loadSections` retains the selected section ID if it still occurs in the returned rows (`DocumentWorkbench.tsx:2211`). The source hooks therefore see no ID change.
- Opening Sources does refresh catalog/admission (`:2958`), but leaving Sources open across replacement does not rerun that effect: rail, IDs and the current retry callback identities are unchanged. The source rail gates on `activeSection` and `sourcesState` (`:5943` onward), so it can render the retained source list when the replacement section returns.
- With Sources and “Record a source” kept open, the old catalog titles and eligibility buttons can be rendered at `DocumentWorkbench.tsx:5972–6018`. Without that rail, old choices/admitted metadata still feed the canonical canvas through `citationsApi` at `:5505`. This is more than an unused internal cache, although the concrete UI sequence remains to be executed.
- `DataRoomSourcesPanel.tsx:95` keys its inner owner only by program ID, and `:106` calls `useLiveData` without its available `DataReadOwner`. Same-mounted same-program replacement can preserve its rows, catalog facts and search snippets. Project/search changes are already handled correctly and are not the reported trigger.
- A late citation POST receipt has a related weakness: `citeSource` (`DocumentWorkbench.tsx:3024`) checks only the ID-based `citationScope` after awaiting. With all IDs retained, an earlier session's reply can still toast, admit an association or increment the current local count. Server acceptance for the original dispatched request is a separate fact from permission to apply that receipt to the replacement UI.

**Boundaries on this finding.** Navigating away/remounting or a later explicit source refresh can remove the cache. A denied/newly absent document prevents the normal active-section editor path from rendering. This report specifically concerns the supported same-mounted transition where authoritative reads again admit the same document/section IDs; it does not assume every logout/login retains the editor. `V2App.tsx:1150` does not put session identity in the surface key; its remount epoch is changed for explicit same-surface navigation directives (`:447`).

Source/citation/import APIs independently read server-side organization, requester, source and target facts. Examples inspected: catalog endpoint organization/project checks (`projects.ts:1782`), workflow target/source rechecks (`authoring-source-import.ts:344–405`), citation source scope and cross-project validation (`source-usage.service.ts:216–257`), and current source metadata admission (`authoring.router.ts:5614–5646`). This audit establishes neither server leakage nor permission bypass.

### Smallest useful qualification and canonical reuse

**Existing end-to-end component owner:** `editor/__tests__/workbenchDocumentAccess.test.tsx:191` already replaces the canonical session while keeping one Workbench mounted, waits for replacement-session prose and rejects deferred old sections. Extend that fixture rather than constructing a new editor harness:

1. Return a valid catalog page using `projectSourceCatalog.test.tsx`'s established page shape, plus valid citation and section-source reads. Use a distinctive old-session source title.
2. Open the `sources-rail-open` control, await a completed catalog, click “Record a source” and retain the rail/picker. Replace the session with the fixture's `endSession`/`setToken` sequence while keeping the same IDs.
3. Wait for replacement-session prose to prove the authoritative document read has settled. Assert that old source titles/actions are absent and that a replacement-session source read is performed before ready choices are offered. Current source trace predicts this assertion will fail; it was not run here.
4. Use the same fixture with an unresolved old catalog/citation JSON body. Replace the session, complete replacement document reads, then release the old body and assert it cannot supply choices/associations. Also defer a successful citation POST and assert its old receipt cannot toast/admit/increment the replacement view.
5. Retain the existing ordinary `authService.refreshToken()` control: a real same-session bearer refresh must not retire current reads, drop dirty work or force repeated loads.

**Focused existing owners:** `projectSourceCatalog.test.tsx` covers all-page completion, changed pages and retry; `citationAdmission.test.tsx` covers authoritative null metadata and read retry; `dataRoomSourceReads.test.tsx` covers project/search masking and deferred old-project replies. None of these inspected files tests same-mounted canonical session replacement. Add that case to these owners after the component reproduction determines the affected consumer boundary. `sourceAssemblyOwnership.test.tsx` and `sourceIntakeOwnership.test.tsx` already contain useful account/session/bearer/project-replacement fixtures; their protections should not be rebuilt.

**Likely reuse, not an implemented design:** pass the existing `useAuthoringReadSession`/current-read owner into catalog, admission and source-response publication, and use the existing optional `DataReadOwner` for the live source panel. Guard receipt application with that same captured owner. The read key should survive ordinary canonical token refresh. Do not remount the entire editor indiscriminately: `DocumentAuthoring.tsx` and the editor's current dirty-buffer/leave decision intentionally own unsaved human work.

## Other audit conclusions and limits

- No additional concrete defect was established in the inspected original-visit import/assembly owners. Their existing ownership, recovery and post-close checks are substantial and should remain canonical.
- A generic checked inventory still cannot prove a previous unidentifiable write failed; the current UI explicitly says so. This is a deliberate evidence limit, not a missing automatic retry feature.
- Catalog validation establishes complete paged metadata at the read's reported totals; it is not a claim that every page shares a database snapshot. No inconsistent-catalog runtime example was established in this audit.
- No claim is made that every life-sciences filing workflow, agency-specific rule or deployment has been qualified. This bounded audit evaluated source ownership and failure behavior; it did not execute a browser, server, test suite, migration or production API.

