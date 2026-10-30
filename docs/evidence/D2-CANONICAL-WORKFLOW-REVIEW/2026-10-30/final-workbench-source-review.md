# Final independent Workbench source review

Reviewer: `project_scope_red_tests`. Date: 2026-10-30. **SOURCE APPROVED at the corrected pinned Workbench; WBS-1 is resolved. Final runtime/build/lint qualification remains pending root's completed evidence.** The shared read helper also passes source review. This report covers `dataConnect.tsx` and `DocumentWorkbench.tsx` only; metadata hooks/files behavior has a separate reviewer. No production/test edits, runner, compiler, browser or Git command were executed. Only this report and its pins were written.

## What already exists

Workbench retains its one canonical editor, real `useAuthoringReadSession`, current read keys, authoritative sections, dirty buffer, leave guard, governed ceremonies, recorded section-source reader and four source receipt handlers. The shared `useDataReadVisit` already owns sticky captured visits and synchronous publication retirement. The patch extends these existing owners; it adds no auth subscription, read engine, endpoint, request body, eligibility rule or editor instance.

## Retained WBS-1 finding and correction

**WBS-1 — readable section membership was missing from the document/section boundary.** The following trace describes the originally blocked Workbench SHA-256 `b1a6e5d61ffd926f1d7e24b7cb77d3d48e61ad64362b206aa45bfbf158d8d6d0`, not the corrected source:

1. `applyDocumentNavigation` changes `chosenDocId` without clearing the selected section (Workbench around line 1709). `activeSectionId` remains A's section until the new document's authoritative sections settle and `loadSections` chooses its section (around line 2225).
2. During the B render, `currentReadKey` and `documentSourceOwner` already identify B. `sectionSourceVisit` at line 1533 nevertheless uses the raw retained A section ID. The resulting B/A canonical visit is current: its guard checks the current B document key and session, without verifying that A's section belongs to B.
3. The source-load effect still calls `loadSources(A-section)`. Its guard at line 2933 accepts raw selected-ID equality, visit currentness and mount lifetime, then dispatches A's `GET /api/authoring/sections/:id/sources`.
4. Hold B's section response and resolve this fresh A source read. The result is tagged with that current B/A visit and `sourcesCurrent` at line 1536 admits it. `moduleContext` around line 2027 publishes its `evidenceSourceIds` with document B and retained section A even though `activeSection` is null. The visible rail's no-section branch does not guard this AnA evidence context.

This is a wrong-document client publication trace, not evidence of backend access bypass. Root reproduced it before the correction: `workbench-membership-red-executed.txt` records **1 failed / 7 skipped**, with `evidenceSourceIds` equal to `['9']` while the next pinned document's sections were pending. The separately retained initial name-filter run selected no tests and is not proof.

The corrected Workbench SHA-256 `e057fa9661a3308dbb9f0cf31335fb03286279727d8435c239c5f9ee4f854bc6` closes that trace within the existing owner:

- `readableSourceSectionId` requires `sectionsCurrent`, exact selected-ID membership and `section.doc_id === activeDocId`. While B's authoritative sections are pending, its value is null; the canonical section visit retires A, source dispatch does not occur, and the published source context has no selected readable section or evidence IDs.
- Recorded-source loading, citation scope, section receipt paths/admission/count changes and citation consumers all use that captured readable ID. A settled current section establishes a fresh canonical visit. Retained A callbacks cannot acquire the later B or A-return visit.
- Document-wide refresh remains on its document visit. The latest loader ref now captures `{ sectionId, load }` together during render, so follow-up uses the current readable section and matching loader without waiting for a passive section-ref update. No follow-up starts while the new document has no readable section.
- The correction does not change the editor instance key, prose/dirty state, save funnel, leave decision, ceremonies or source eligibility. The small cite eligibility predicate refactor preserves the same ready/eligible check.

No blocking source issue remains in this review scope. The final regression log was still running when this verdict was recorded; this source approval does not assert its outcome.

## Other source findings at these pins

- `dataConnect.tsx` matches the contract baseline exactly after removing the two added `export` keywords. Sticky visit retirement, invalid-to-valid same-key behavior, captured callback semantics, owner exception handling and no-owner compatibility are unchanged.
- Project source ownership uses the existing `writerContext` and read session without document/section identity; the files prop receives that owner. Document/section source state uses actual canonical visit objects, so A→B→A cannot revive the first A closures merely because logical IDs match again. Fresh wrapper objects are not effect triggers.
- Source rows, read state, refresh findings and refresh busy state are tagged with their producing visits and masked during render. The AnA evidence context consumes the filtered `sources` and `sourcesState` and now names only the readable section identity. WBS-1's fresh wrong-document source admission is prevented by the authoritative membership check.
- Cite, uncite, per-citation reread and document-wide refresh check captured visits before dispatch and after response/body work, including catch paths. Local queued count/picker/source-state changes check currentness inside state updaters. Methods, paths, bodies, source eligibility, immutable citation handling and existing messages are preserved.
- Document refresh remains document-scoped across ordinary section changes. Its follow-up uses the latest inline readable-section/loader pair rather than the earlier closure or passive selected-section ref. The earlier reviewed current-section positive test passed before the narrow correction; the final preservation run is pending. Session/document departure masks the old busy/findings state, and an old receipt cannot clear a replacement visit's state.
- The delta leaves the canonical editor instance key, prose content, saved-content funnel, dirty/leave bookkeeping, ceremony decisions, intake/assembly owners and access projections unchanged. Its citation scope now includes the existing session-aware read identity. Source correction does not key or reset the whole editor.

WBS-1's history and pre-correction proof remain recorded above; its corrected source now passes review.

## Reviewed execution evidence and limits

Root's retained `receipts-session-red-corrected.txt` records **6 failed / 1 passed** using the actual Workbench and real session guards before this production change. The corrected selector input is separately pinned. Root's `workbench-files-green-first.txt` records **18 passed / 3 suites**, comprising seven Workbench receipt cases, two Workbench catalog/session cases and nine files cases. The Workbench positives cover same-ID replacement-session recorded sources and mutation receipts, old document-refresh busy/findings suppression, a current document refresh after a section switch, and ordinary bearer refresh preserving the editor/catalog read count.

These are reviewed root-run results, not reviewer-run results. They predate the narrow membership correction. The additional executed membership red proves WBS-1; root's combined final source preservation, production build, TypeScript and lint qualification remains separate and was still in progress when this source verdict was recorded. This report claims no final green, build success or zero-warning-growth result until completed evidence is reviewed. Source approval is limited to the current pinned implementation and does not independently qualify every A→B→A retained callback, first-layout context transition, dirty/ceremony path or shared-read case.

