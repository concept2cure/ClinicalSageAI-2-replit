You are a scoped worker in /home/user/ClinicalSageAI-2-replit, continuing the CSR draft human-control lane.

Read these first:
- docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md: the whole doc, including "Decisions on slice 1's questions" at its end, which bind you.
- The slice-1 commit 7b4a16cf8 and its evidence, docs/evidence/D2-CSR-DRAFT-CONTROL/2026-10-29/.

The lead commits and pushes. You do NOT commit, push, stash or change git state.

Other workers edit the same tree: offboarding custody, fold F5 (device filing), and P-72 slice 0. Another SESSION, outside the lead, is shipping the CSR engine path (CSR_END_TO_END_2026-10-29.md). Re-read any file it changed since 2026-10-28 (`git log --since=2026-10-28 -- <file>`) before editing it, and keep diffs in its files minimal.

When the lead sends "freeze":
- stop editing;
- run nothing heavy;
- reply "frozen";
- wait for "go".

Work compactly: write logs to files and read their tails.

## Slice 3: revise by instruction (design doc slice 3)
The person asks AnA to revise the alternative or candidate they are looking at, with an instruction ("shorter", "follow the SAP wording", "add the per-protocol result", "use the E3 §11.4.1 structure").
- Each revision is a NEW single-use candidate derived from the one shown (`derivedFrom` in the parked generator), never an overwrite. Its checks re-run.
- The person sees revision N against revision N-1 as a redline, and can go back to any earlier one in the session.
- The instruction is recorded in the turn record.
- The model never supplies a number (Rule 2). An instruction asking for a figure the sources and engine tables do not hold must be answered by the existing figure checks, not by the model.
- The files, as the design doc names them:
  - a read-only candidate read in server/services/clinical-regulatory-evidence/draft-candidate-store.ts;
  - a revision prompt in server/services/authoring/authoring-draft-template.ts;
  - the existing POST …/ai/draft route, extended rather than duplicated (keep the authoring.router.ts diff minimal);
  - the client panel and editor/draftAlternatives.ts.

## Slice 4: alternatives for a selected passage (design doc slice 4)
The person selects a passage in the editor and asks for alternatives for just that passage.
- The alternatives come back through the same panel.
- Chosen text lands as AnA's tracked replacement of exactly the selection, through the existing proposal door (EditorBridge.propose / suggestions.ts proposeReplacement), under the existing model gate, saved-base check and quote resolution.
- The files: a selection prop in editor/RichSectionEditor.tsx, which is over 1500 lines, so new code goes in a new module beside it.
- Adding a paragraph after an existing one (decision 8) waits for a suggestions.ts change; if you make that change here, keep it to what decision 8 needs, pinned by tests.

## Rules
- Fail closed; no auto-save, no auto-accept; accepting is never approving.
- Lineage stays honest at span level: model words accepted unchanged are credited to the model, the person's words to the person.
- Red first, then green, then mutations (each restored byte for byte).
- Gates on your files:
  - eslint, with no new warnings;
  - scoped tsc;
  - ci:canvas-path and its self-test;
  - ci:single-native-canvas;
  - ci:check-editor-integrity;
  - ci:design-system;
  - ci:launch-scope-api, if a route changes.
- Apply the accessibility, microcopy, motion and Part 11 skills to the UI you change.
- Evidence goes in docs/evidence/D2-CSR-DRAFT-CONTROL/2026-10-29/slice-3-4/.
- Hand back after slice 3 if it is complete, so the lead can commit it, then do slice 4.

Report each time:
- every file changed;
- red, green and mutation counts;
- gates;
- open questions.
