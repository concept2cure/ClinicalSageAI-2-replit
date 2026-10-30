# D2: CSR draft control, slice 1. The review panel offers alternatives and lets the person take chosen paragraphs

Launch row D2, workstream W1 (Authoring). Design: `docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md` (slice 1). Founder direction of 2026-10-29: the person stays in control of AnA's drafting in the canvas and the editor, with options, and can accept, deny or edit.

This slice **completes the existing review panel** and **reaches the existing proposal door** from it. It adds no route, store, schema, model, CSS or surface. The server is unchanged.

## What already exists

The full inventory, with paths and what each piece does and does not do, is the design doc's "What already exists" section. The pieces this slice builds on:

- `server/routes/authoring.router.ts` `POST /sections/:id/ai/draft`. One gateway call per request. It parks one single-use candidate (`draft-candidate-store.ts`), runs its own answer check and files its own turn record (`turn-record-draft.ts`, which holds the draft in `outputs.drafts`). Nothing in this route changes; an alternative is one more call to it.
- `POST …/ai/draft/accept`: the whole-section accept, with source spans, `draft_modified_on_accept` and the audit row. It is unchanged and stays the whole-alternative path.
- `client/src/concept2cure/v2/surfaces/AuthoringAiDraft.tsx`, `editor/useAuthoringDraftReview.ts` and `editor/authoringDraftTransport.ts`: the one panel, its request lane and its state. Before this slice there was one candidate, a raw textarea and whole-section accept only. "Draft again" overwrote the candidate.
- `editor/DocumentWorkbench.tsx` `EditorBridge.propose` applies the governed-write gate (`anaInsertGate.ts`), the section and saved-base checks, and a scoped receipt (`editorProposalReceipt.ts`, `proposalLifecycle.ts`). It was handed only to embedding hosts. **The workbench's own draft panel could not reach it.**
- `editor/suggestions.ts` `proposeReplacement` (`replace` and `insert-empty`) and its tracked-change marks (`authorId`, `sourceRecord`, `applicationId`).
- On save, `machine-claim-verify.ts` verifies accepted AnA words against the named turn record.
- `editor/textDiff.ts` with `v2/RedlineText.tsx`, and `editor/AuthoredHtml.tsx` with `renderSafeMarkdown.ts`. These existed and are now used by the panel.

Searches:
- In the working tree: `alternative`, `variant`, `option`, `regenerate`, `redraft`, `revise`, `rewrite`, `refine`, `compare`, `diff`, `redline`, `tracked`, `suggestion`, `accept`, `reject`, `candidate`, `stream`, `derivedFrom` and `parentDraft`, across client, server routes and services, shared and migrations.
- Deleted files: `git log --diff-filter=D --name-only -- client server shared` on a blob-less clone of the full `concept2cure-v2` history (16,464 commits; the working clone is shallow). The hits are in `deletion-search.txt`. None offered alternatives or per-paragraph acceptance, and each has a canonical successor today (`EditorCanvas.tsx` → the one TipTap canvas; the old diff viewers → `textDiff`/`RedlineText`; the old track-changes extensions → `suggestions.ts`). Nothing was restored.

## What changed

| File | Change |
|---|---|
| `client/src/concept2cure/v2/editor/draftAlternatives.ts` (new, pure) | Approaches (the existing tone vocabulary) and their labels. Draft paragraphs and the saved section's text blocks. Shared-word pairing. The proposals: `insert-empty` for an empty section, `replace` per paired paragraph. Refusal wording. The AnA author with the alternative's turn record. A delegate to the workbench bridge. The review-state steps (show, arrive, clear). |
| `client/src/concept2cure/v2/editor/DraftAlternatives.tsx` (new) | The alternatives radio group with a polite arrival status. Compare with the saved section or another alternative (`RedlineText`). The choice by paragraph: rendered paragraphs, a pairing select, a per-paragraph redline, "Add N chosen paragraphs as tracked changes", and the lifecycle state per receipt. |
| `client/src/concept2cure/v2/editor/useAuthoringDraftReview.ts` | `generateAlternatives`: the existing transport three times in one guarded attempt. Each alternative shows as it arrives, and a failure says how many arrived. `showAlternative`. Every end of a review clears the alternatives. |
| `client/src/concept2cure/v2/editor/authoringDraftTransport.ts` | Optional state fields: `alternatives`, `shownAlternative`, `pendingApproaches`. |
| `client/src/concept2cure/v2/surfaces/AuthoringAiDraft.tsx` | "Draft three alternatives", composition of the new parts, and wording of the existing controls when a set is shown. |
| `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` (+9 lines) | Hands the panel the bridge it already builds, and the saved section's content and `updated_at`. |

## Part 11 lineage effect

- **The whole alternative:** the existing accept, unchanged. It records source spans, machine and author lineage, `draft_modified_on_accept`, the revision and the audit row.
- **Chosen paragraphs:**
  - No candidate is consumed and nothing is saved. Each chosen paragraph is a tracked change by `ana`, with `data-source-record` set to that alternative's turn record, under the governed-write gate and the saved-base check.
  - The person accepts, rejects or edits each one in the editor. Each decision row names the turn.
  - On save, AnA's unchanged words verify against that turn record and are credited with the serving model. Words the person typed are tracked as theirs.
  - **These paragraphs carry no source citations.** The panel says so before the click (design slice 7 is the follow-up).
  - There is no audit-level `draft_modified_on_accept` on this path; the span-level split is the record.

## Proof

- **Red first**: `red-summary.txt`, `red.log.gz`. 12 of 12 new tests failed against the unchanged panel and workbench ("Draft three alternatives" not found). The failures are against the existing surfaces, not a missing module.
- **Green**: `green-summary.txt`, `green.log.gz`. 24 of 24 tests in 3 files:
  - `client/src/concept2cure/v2/__tests__/authoringDraftAlternatives.test.tsx` (9)
  - `client/src/concept2cure/v2/editor/__tests__/workbenchDraftParagraphs.test.tsx` (4, in the real workbench and TipTap editor)
  - `client/src/concept2cure/v2/editor/__tests__/draftAlternatives.test.ts` (11)
  - They cover three requests, one per tone; arrival one at a time without taking focus; focus moving to the shown alternative only when the pressed control leaves; kept edits per alternative; whole accept sending the shown `draftId`; the redline comparison; a partial failure ("Drafted 1 of 3"); no provider as a refusal with nothing drafted; Discard clearing the retained review; and, in the editor, `del`/`ins` by `ana` with the right `data-source-record` for a paired replacement and an empty-section addition. An unqualified record leaves the editor untouched. No PATCH and no accept is sent.
- **Regression**: `regression-summary.txt`, `regression.log.gz`. 485 of 485 tests in 24 files: the existing panel, assembly, inputs, termination, attribution, remedies, bridge and gate, source-first flow, proposal lifecycle, suggestions, canvas and conversation-canvas, editor and a11y sweep.
- **Mutations**: `mutations.json`, `mutate.py`, run from the repo root. 14 of 14 were killed, and each file was restored and checked by SHA-256. On the first run, M11 (Discard keeps the alternatives) survived: the screen hid the stale state. The Discard test now asserts the retained review is cleared, and it kills M11.
- **Lint**: `lint.json`. 14 warnings against a baseline of 14 taken before any edit, with no new rule and no new file warning. The panel function's existing complexity warning went from 43 to 46. Its length went from 300 to 308 lines, so the logic was moved into the new modules.
- **Scoped tsc**: `tsc-scoped.json`. 0 errors over the nine files and their import graph. A canary with two deliberate type errors fails with exactly those two, so the check is live.
- **Gates**: `gates.txt`. `ci:canvas-path` and its self-test pass; the self-test shows the gate fails per cut link. `ci:single-native-canvas`, `ci:check-editor-integrity`, `ci:design-system`, `ci:check-shell-css-collisions`, `ci:surface-text-ramp`, `ci:launch-scope` and `audit:repo-health:ceiling` all pass.
- **`ci:lineage-save-gate` fails** on `server/services/csr/csr-narrative-store.ts` (unguarded writer). That file is the CSR lane's (`3b576cab9`, `b265d6fc0`), and this slice touches no server file. The failure is handed on, not fixed here (`gate-lineage-save-gate.log`).
- **Reviews applied**:
  - Accessibility: native radios, checkboxes and selects; labels with `htmlFor`; `aria-describedby`; polite status and alert. Dimmed text uses the `--text-300` token, not opacity.
  - Microcopy: every refusal names its remedy, and a disabled control says why.
  - Part 11: nothing is saved; the reason for change stays at save and at accept.

## Not run

- Human acceptance in a browser (keyboard and screen-reader pass).
- A live provider: production drafting is PQ-gated (`approved-models.ts`, PQ-DRAFT-001).
- The full `eslint .` ratchet and the full `tsc -p tsconfig.json`; those run at push.

## Source identity

`sources-before.sha256` holds the four existing files before any edit. `sources.sha256` holds every file of this slice as filed.
