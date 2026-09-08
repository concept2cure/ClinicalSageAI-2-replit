# WORK ORDER 11 — AnA Visibility and Canvas Width

**Paste this entire block into Claude Code.**

**Branch:** `concept2cure-v2` only. No new branches. No new files.
**Verified against:** commit `499f096`

---

## What This Is

Three instrumentation fixes to the conversation surface. This is not a feature build.
Every piece of data these fixes display **already exists on the client** and is being
dropped at an adapter function. The renderers for two of the three already exist and
are permanently dead.

**Scope discipline:** Do not add a surface. Do not add a service. Do not add a route.
Do not add a markdown file except the single proof report named at the end. Do not
refactor `ConversationThread.tsx` beyond the changes named here.

---

## Step 0: Branch Check

```bash
git branch --show-current
git pull origin concept2cure-v2
```

Stop if this fails.

---

## The Finding (read this before editing)

`client/src/concept2cure/v2/V2App.tsx` lines 195–198 already contain this comment:

> *"…dropped here — useAnaChat captured the tools, rounds, lens and drafts, and the
> rail rendered a single line of body text — so AnA could run three deterministic
> engines across two rounds and the person waiting saw the word 'Thinking…'"*

That bug was found and fixed **in the rail**. `V2App.tsx:199-207` now builds a full
`activity` record and `Shell.tsx:969` renders `<AnaActivity />` from it.

**The identical bug still exists in `ConversationThread.tsx`**, which is the primary
conversation surface and the destination `ownsConversation` surfaces route ⌘K asks to.
It is worse there: the waiting state is three animated dots.

Do not treat this as new work. Treat it as applying an existing fix to the surface
that was missed.

---

## FIX A — The thread must report what AnA is doing

**File:** `client/src/concept2cure/v2/surfaces/ConversationThread.tsx`

### A1. `toTurn` drops the activity record

`toTurn` at line 26 maps `AnaChatMessage → CtTurn` and carries only `answer`,
`thinking`, `grounding`, `executedActions`, `pendingSignoffs`.

It drops `toolCalls`, `statusPhase`, `streaming`, `detectedLens`,
`detectedDocumentType`, and `generatedDraft.title` — every field
`AnaActivityProps` needs.

Extend `CtTurn` (in `client/src/concept2cure/v2/fixtures/conversation-thread-data.ts`)
with one optional field:

```ts
/** The turn's real activity record, rendered by <AnaActivity />. */
activity?: AnaActivityProps;
```

Populate it in `toTurn` using the **same mapping V2App.tsx:199-207 already uses**.
Do not invent a second shape. Import `AnaActivityProps` from `../AnaActivity`.

Follow the existing house rule in this file: unpopulated fields are omitted, never
fabricated. If `hasReportableWork` (the helper at `V2App.tsx:212`) is the right guard,
reuse the concept — do not duplicate the function; either export it from `V2App.tsx`
or inline the same three-line condition with a comment pointing at the original.

### A2. Render it inside the turn

In `AnaTurn` (line 60), render `<AnaActivity {...turn.activity} />` when present.
Place it **above** `turn.answer`, matching the ordering in `Shell.tsx` and the
component's own docblock ("the progress before the words").

### A3. Replace the three-dot waiting state

Line 754 currently renders, while `busy`:

```tsx
<div className="ct-typing"><span /><span /><span /></div>
```

Three dots for a run that can execute many tools across multiple rounds over minutes.

Replace with an `<AnaActivity streaming phase={...} toolCalls={...} />` fed from the
in-flight message — the last message in `anaChat.messages` when `streaming` is true.
`AnaActivity` already handles the streaming case: it self-expands, shows the phase
line, and shows tool rows as they land (`AnaActivity.tsx:156-215`).

If the in-flight message has neither a phase nor any tool calls yet, `AnaActivity`
returns `null` by its own guard at line 157 — in that case only, keep the dots as the
fallback. Do not render both.

### A4. The dead inline tool renderer

`AnaTurn` lines 78–85 render `turn.tools` with a `.ct-tool` row. `toTurn` never sets
`tools`, so this renderer has never once appeared — the same defect class this file's
own comments caught twice before (the deleted proposal block, the dropped signoffs).

`AnaActivity` renders tool calls itself, so this renderer is now redundant. **Delete
it**, and delete `tools?: CtToolCall[]` from `CtTurn` if nothing else reads it. Grep
first:

```bash
grep -rn "CtToolCall\|turn\.tools\|\.ct-tool" client/src --include=*.tsx --include=*.ts
```

If `CtToolCall` has no other consumer, remove the interface and its `.ct-tool` CSS
rules in `app-v2.css`. Follow the file's precedent: delete rather than wire, and leave
a short comment saying why.

**Do not** add a second tool-row renderer beside `AnaActivity`. One authority.

---

## FIX B — The work dock must not be truncated

**File:** `client/src/concept2cure/v2/styles/app-v2.css`

Line 2698:

```css
.c2c-v2 .ct-side-work{width:384px;...max-height:52%;...}
```

`max-height: 52%` cuts the live work panel — progress, queue, tools, outputs, context —
to roughly half the column, so a multi-round run scrolls its own history out of view
inside a fixed box while the artifacts rail below sits mostly empty.

Change the split so the work dock takes the space it needs and the artifacts rail takes
the remainder:

- work dock: `flex: 1 1 auto; min-height: 0;` with a modest `max-height` only when the
  artifacts rail has content
- artifacts rail: `flex: 0 1 auto`

If artifacts are empty, the work dock gets the full column. Verify by scrolling a
completed multi-tool turn — the earliest tool row must still be reachable.

---

## FIX C — The canvas is too narrow

**File:** `client/src/concept2cure/v2/styles/app-v2.css`

Line 2576:

```css
.c2c-v2 .ct-col{max-width:768px;...}
```

768px is a defensible reading measure, but combined with the fixed 384px side dock it
leaves the conversation as a narrow strip on a 1440px+ display, with dead margin on
both sides.

**Do not remove the measure cap.** Long-form regulatory prose is unreadable at 1400px
line length. Widen it in steps instead:

```css
.c2c-v2 .ct-col{max-width:768px;...}
@media (min-width:1600px){ .c2c-v2 .ct-col{max-width:860px;} }
@media (min-width:1920px){ .c2c-v2 .ct-col{max-width:940px;} }
```

Then handle the real complaint — the dock cannot be gotten out of the way at will.
`panelCollapsed` already exists in `ConversationThread.tsx` and already drives
`.ct-side[data-collapsed]`. Confirm:

1. the collapse control is visible without hunting for it, and labelled
2. the state persists across surface navigation (localStorage, same pattern as any
   existing persisted UI preference in this repo — grep for one, do not invent a new
   storage key convention)
3. collapsed leaves the conversation genuinely full-width, not full-width-minus-a-stub

**Do not** build a drag-resize handle. Collapse plus the stepped measure is enough.

---

## Step 1: Verify

```bash
npm run typecheck
```

Must be zero. The baseline is zero and stays zero.

```bash
# A1/A2: activity is mapped and rendered
grep -n "activity" client/src/concept2cure/v2/surfaces/ConversationThread.tsx | head -20

# A3: dots are no longer the only waiting state
grep -n "ct-typing" client/src/concept2cure/v2/surfaces/ConversationThread.tsx

# A4: dead renderer gone
grep -rn "turn\.tools\|CtToolCall" client/src --include=*.tsx --include=*.ts

# B/C: widths
grep -n "ct-col\|ct-side-work" client/src/concept2cure/v2/styles/app-v2.css
```

Run the existing suites that touch this surface — do not write new ones unless a
change breaks an existing test:

```bash
npx vitest run client/src/concept2cure/v2/__tests__/conversationArtifactPanel.test.tsx
npx vitest run client/src/concept2cure/v2/__tests__/conversationThreadSignoff.test.tsx
npx vitest run client/src/concept2cure/v2/__tests__/composerAttachWorks.test.tsx
```

---

## Step 2: Human Verification — this is the acceptance gate

Claude Code does not close this work order. JM does, by watching a real turn.

Report back with the exact commands to run the app locally, then stop.

JM will confirm, on one real question that invokes at least one tool:

| # | Observation | Pass |
|---|---|---|
| 1 | Within ~2s of sending, a phase line appears in the thread — not dots | |
| 2 | Each tool AnA runs appears as a row, as it runs | |
| 3 | Tool rows survive after the answer lands (the turn keeps its record) | |
| 4 | The work dock scrolls to the first tool row of a long run | |
| 5 | Collapsing the dock gives the conversation the full width | |
| 6 | Collapsed state survives navigating away and back | |
| 7 | At 1920px the conversation no longer reads as a narrow strip | |

If any row fails, the work order is open. Do not commit a proof report claiming
completion on an unverified row.

---

## Step 3: Proof Report

**One file only:** `docs/reports/wo11-ana-visibility-proof-<YYYY-MM-DD>.md`

Contents:
- files changed, with line ranges
- the `toTurn` mapping, before and after
- what was deleted and the grep proving it had no other consumer
- typecheck result
- test results
- the seven-row table above, filled in by JM, not by you
- anything still broken, named plainly

---

## Step 4: Commit

Only after JM confirms the seven rows.

```bash
git add -A
git commit -m "WO-11: render AnA's real activity in the conversation thread; free the work dock; widen the canvas"
git push origin concept2cure-v2
```

---

## Hard Rules

- `concept2cure-v2` only
- No new files except the one proof report
- No new surfaces, services, routes, or storage-key conventions
- `AnaActivity` is the single tool-transparency renderer — do not build a second
- Machine room untouched: editor, artifacts, provenance, review, submission, vault
- Fail closed, never fabricate — unpopulated fields stay omitted
- Do not propose the next task. Stop at Step 2 and wait.
