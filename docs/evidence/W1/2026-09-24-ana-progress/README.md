# AnA's progress and output — one clean record in every module

**Row:** D2 (launch catalog), workstream W1. This changes AnA's existing surface inside the
launch catalog; it adds no surface, module or model. It does not by itself turn D2 green.
**Asked for by the founder (2026-09-24):** "UI showing steps, 1/5 and visual progress … showing
AnA's progress and then her output in the same or very similar way … consistent across all
modules … I just don't want duplications and more clutter."

## What changed, and what it replaced

| Before | After | Where |
|---|---|---|
| A five-section dock ("AnA at work": Progress, Work queue, Tools, Outputs, Context), each section a collapsible accordion | One quiet panel: **Progress** (her plan, or the phases, on one vertical rail), **Outputs**, **Used in this session** — each section present only when it has something to say | `AnaWorkPanel.tsx`, `AnaWorkSections.tsx`, `anaWorkModel.ts` |
| Five different toggles ("AnA at work" pill, an icon button, "Hide side panel") | One **chip** in every host header — "Step 2 of 5" when AnA declared a plan, "Working"/"Progress" otherwise | `AnaProgressChip` in `AnaWorkPanel.tsx`; `useProgressDock` in `workDock.ts` |
| No plan anywhere in the stream; any "of 5" would have been invented | AnA declares her plan through `update_plan` (pure validation, no side effect); the server emits a `plan` event from the **normalised** result; the chip counts only what she declared | `server/services/ana/turn-plan.ts`, `stream.ts` |
| The server knew which uploads and memory it read and never said | `context_used` event: resolved uploads (content vs name only), unresolved count, the memory items that survived the character budget, and "could not be read" when memory failed | `turn-context-used.ts`, `memory-context-assembler.ts` (`read`) |
| Tool durations and inputs in a separate "Tools" accordion | Behind each step's own chevron in the transcript, Claude-style: muted verb, dark object ("Searching the literature for **estimand**") | `AnaActivity.tsx` |
| Drafts as one line of text ("Drafted X") outside the conversation page | An **output card** with a miniature page of the draft's real text, a type badge and its known save state; in the rail it opens the full conversation on the same thread, where the draft is the document canvas | `AnaOutputs.tsx` |
| The editor had its own copy of the activity record (raw tool payload, raw lens code, prompt-module ids as "Context used"); eCTD and RBM showed "Thinking…" | All five hosts render the one `AnaActivity` through the one mapping `activityPropsFor`; the editor keeps its warnings and next actions and shows evidence through the shared `AnaGrounding` | `DocumentWorkbench.tsx`, `EctdCoauthor.tsx`, `Rbm.tsx`, `RbmSurfaces.tsx`, `ConversationThread.tsx`, `V2App.tsx` |
| The conversation page kept its own dock memory (`c2c-v2-ct-side-dock`) and a second close inside the artifacts panel | One shared memory (`WORK_DOCK_KEY`); the column's one close is the Progress panel's | `ConversationThread.tsx` |

**Deletion rule (CLAUDE.md working agreement).** Nothing user-facing was removed without its
reachable replacement: the editor's local `AnaActivity` → the shared `AnaActivity` +
`AnaGrounding` + the retained warnings/next-actions markup (pinned by `authoringAnaPane.test.tsx`);
the dock's Tools/Work-queue/Context sections → the transcript row disclosures and "Used in this
session" (pinned by `anaActivity.test.tsx`, `anaWorkPanel.test.tsx`); the per-host toggles → the
chip (pinned by `anaRailWorkDock.test.tsx`). The canvas path gate (`ci:canvas-path`) is green.

**Found and fixed on the way.** Every AnA message in the rail carried the class `ana`, which is
also the rail container's class, so each message inherited `height:100vh; overflow:hidden;
border-left` and was clipped to whatever height the column left it (the new output card made it
visible). Renamed to `is-ana` / `is-user`. A settled tool step with no recorded end read a clock
off "now" that kept growing; it now claims no duration.

## Honesty contract (each shown failing first)

Each check below was mutated in the code and the named test was seen to fail, then restored:

| Mutation | Caught by |
|---|---|
| `plan` event emitted for a failed/cancelled `update_plan` call | `turn-plan-and-context.test.ts` (2 failures) |
| Memory items the character budget cut reported as read | `turn-plan-and-context.test.ts` |
| Chip shows a count without a declared plan | `anaRailWorkDock.test.tsx` |
| An unfinished plan step shown as done after the turn ended | `anaWorkPanel.test.tsx` (2 failures) |
| A failed `update_plan` call folded away from the rows | `anaActivity.test.tsx` (survived at first; the test was strengthened, then failed) |
| A settled step without a recorded end given a live clock | `anaActivity.test.tsx` (survived at first; test added, then failed) |

## Verified

| Check | Result |
|---|---|
| New server tests (`turn-plan-and-context.test.ts`) | 21 passed |
| New hook tests (`useAnaChat-plan.test.ts`) | 5 passed |
| Panel, rail, activity, output-card, editor-pane, conversation and hook suites, after the last edit | 25 files, 272 passed |
| Broad run: `client/src/concept2cure/v2`, `components/ana`, `tests/ui`, `server/services/ana/__tests__`, `server/routes/ana-ri` | 5,892 passed, 1 failed, 3 skipped; the one failure was a test written mid-run and passes alone (`broad-vitest.txt`) |
| ESLint warnings on every touched and new file | 84 before, 84 after (the repo ratchet is on the total) |
| `tsc --noEmit -p tsconfig.check.json` | 0 errors |
| `ci:design-system`, `ci:undefined-css-classes`, `ci:canvas-path`, `ci:surface-text-ramp`, `ci:check-shell-css-collisions`, `ci:check-css-selector-shadowing`, `ci:check-phantom-tokens`, `ci:token-contrast`, `ci:ana-surface-context`, `ci:empty-state-honesty`, `ci:internals-in-copy`, `ci:action-overclaim`, `ci:launch-scope`, `ci:gateway-bypass`, `ci:unapproved-model-pins` | pass |
| `ci:duplicate-exported-types` | fails on `DocumentProvenance` and `EligibilityAssessment`, **identically on the base commit without this change**; this change's own collision (`PlanStepStatus`) was renamed `TurnPlanStepStatus` |
| Horizontal overflow at 380 px (rail), 390 px (phone), 1440 px | 0 px in each |

## Screenshots

Real components rendered from a fixture turn in jsdom, measured and painted in Chromium with the
shipped stylesheets (`design-system/colors_and_type.css`, `index.css`, `app-v2.css`,
`authoring-v2.css`, `surface-text-ramp.css`). Fonts are the system fallbacks.

- `conversation-1440-light.png`, `conversation-1440-dark.png` — full-page conversation: chip in
  the header, the settled turn's record opened with one step's inputs shown, the output card, a
  live turn with a failed step in the server's own words, and the Progress panel with its plan,
  Outputs and Used in this session.
- `rail-380-light.png`, `rail-380-dark.png` — the persistent rail every module's asks go to.
- `conversation-390-light.png` — phone width.

## Not done here (named, not hidden)

- **Uploads are not yet passed by id.** Every composer flattens attachments into the text
  "Attached: …" and calls `send(text)` without them, so `file_ids` never reach the server and the
  Uploads row appears only for turns whose uploads were resolved server-side. Passing them also
  turns on the server's PDF-reading path — a governance decision, left to the founder.
- **Eleven AI paths outside the chat stream** keep their own spinners and bars (Batch Draft's
  0%/100% bar, Deep Research's fixed percentages, the Authoring section "AI draft" button,
  Evidence ask, Submission explain / shadow review, onboarding ingest, AnA Command, and two
  workflow-engine runners). Moving each onto the canonical record needs an adapter per endpoint.
- Live staging screenshots are owed with D1.

## Second pass (same day): the plan survives a reload; five in-catalog waits

**The declared plan is persisted with the turn.** `update_plan`'s last validated plan rides the
assistant message metadata (`tool-trace.ts` `plan`, via the post-processing context) and
`loadThread` restores it, so a reopened conversation keeps its rail and its "N of M done". Only
the final list is stored, not when each step changed, so no plan changes are invented on reload
and the transcript says **"Plan · N steps"**, never "Planned".

**Five in-catalog AI waits now show AnA's live record** (the shared `AnaActivity`: what is
running, a pulse, a running clock, one polite live region) instead of a button label that said
nothing to a screen reader. No percentage anywhere; none of these requests can know one.

| Surface (launch app) | File | Live line |
|---|---|---|
| Section "AI draft" — every document type (Authoring) | `surfaces/AuthoringAiDraft.tsx` | "Retrieving Data Room evidence and drafting §…" |
| Validation "Explain the findings" (Submission Center) | `surfaces/SubmissionSeqWorkspaces.tsx` | "Explaining N findings for <region>…" |
| Shadow review (Submission Center) | `surfaces/SubmissionSeqWorkspaces.tsx` | "Reading sequence NNNN as a <lens> reviewer…" |
| Onboarding document read (always on) | `surfaces/OnboardingIngest.tsx` | "Reading your document…" |
| AnA Command run (always on) | `surfaces/AnaCommand.tsx` | "Running <command> — every step runs server-side…" |

AnA Command's post-run step list is left as it is: its engine reports statuses (`skipped`,
`queued`) that the shared rows cannot state without calling them done.

Not moved, and why: Batch Draft, Deep Research, Evidence ask and Orchestration are outside the
launch catalog (flag-off in production; `shared/constants/launch-scope.ts`) — Rule 2 leaves them.

### Verified (second pass)

| Mutation | Caught by |
|---|---|
| The AI-draft wait's live record removed | `authoringAiDraft.test.tsx` |
| The plan not written to the assistant metadata | `turn-plan-and-context.test.ts` |
| The plan not restored by `loadThread` | `useAnaChat-plan.test.ts` |
| A reopened plan labelled "Planned" | `anaActivity.test.tsx` |

Affected suites after the last edit: 30 files, 325 passed. `tsc` 0 errors. ESLint warnings on
the touched files equal to their base.
