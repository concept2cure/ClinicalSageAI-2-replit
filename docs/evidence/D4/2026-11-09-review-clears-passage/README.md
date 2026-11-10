# The assembly list's Review replaces an open passage view (D4, 2026-11-09)

**What was decided.** Decision 4 of `docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md`, slices 3–4. It was handed to
D4's holder in `docs/design/ONE_DESIGN_PLAN.md` and listed again in
`docs/evidence/D2-CSR-DRAFT-CONTROL/2026-11-06/slice-2/README.md`.

**The defect.** Two things are true at once:
- the passage view is open on a section;
- the person presses the assembly list's "Review" for that same section.

The panel stayed on the passage. That is a stale view over the section the person asked to review.

## What already exists (RULE 3)

**`onReviewSection`** (`editor/DocumentWorkbench.tsx`). `useAuthoringAssemblyBuild.ts` calls it once a retained
candidate's section has been checked. It asks to open that section in draft review
(`requestLeave({ kind: 'section', draftReview: true })`).

**`draftPassage`** (same file) belongs to its section:
- it is cleared when the active section changes;
- it is cleared when the draft panel closes.

Reviewing the same section changed neither, so the passage stayed.

## The change

`onReviewSection` clears the passage once the request to open that section's draft review is taken. A refused request
(a held structure, a linked target's refusal) leaves the view as it was.

## Verified by making it fail

| File | What it shows |
|---|---|
| `red-at-head.txt` | The new case in `editor/__tests__/workbenchDraftPassage.test.tsx` fails before the change: the passage region is still there. The other 24 cases pass. |
| `green.txt` | After the change, the passage, workbench-assembly and assembly suites pass: 92 of 92. |

**How the case runs.** It uses the real workbench and the real assembly hook. It keeps the options the workbench
gives the hook, and calls `onReviewSection` exactly as the flow does after its check. It opens the passage view on
11.4.1, presses Review for 11.4.1, and expects:
- the section's draft review (`ai-draft-panel`);
- no passage region;
- no draft request.
