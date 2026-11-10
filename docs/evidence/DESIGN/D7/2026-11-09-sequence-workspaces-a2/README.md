# D7-A2: the sequence workspaces and the one verdict, walked in the running app (2026-11-09)

**Package:** D7 (step D7-A2, `.design/claude-convergence/D7.md` §A.4 steps 8–11). **Lane:** L9, RIM system build-out
(`011e42…`). The file list went to the coordinating session before the first edit. Two commits, one push:
- A2a, steps 8–9: the context row's sequence select, sections, Builder;
- A2b, steps 10–11: the Dispatch verdict, Submission readiness.

It builds on D7-A1 (`d4bd24421`).

## What already exists (RULE 3)

- The one working-sequence control was already one: `SeqPicker` above the per-sequence workspaces, fed by Submission
  Center's `selSeq`. It is not new; its select moves to the context row (`SeqSelect`), and its states stay.
- The one verdict's component is `AnswerLead` with `emphasis="verdict"`, already in `AnswerLead.tsx` with its serif
  headline (`app-v2.css` `.al-lead[data-emphasis="verdict"]`). Nothing used it before this step; D0 §4.4 leaves it to D7.
- The section primitives `.pj-sec`/`.pj-sec-h`/`.sec-sub`, the disclosure `.pj-more`, `btn ghost small`, the page frame
  `.page-inner` with `data-work-area`, and the shared `ProjectBack`.
- The blocker sentences, the gate's three states (cleared / awaiting the dispatch e-signature's own release /
  blocked), the counts and the notes are the server's and DispatchWorkspace's already. Only where they sit and how they
  are set changes.

## The change

**A2a (steps 8–9).**
- **Step 8:** the "Sequence" select joins the context row; its accessible name stays "Working sequence". Builder,
  Validation, Shadow review, Dispatch and Required deliverables are sections. Each `h2` is the subject ("Leaves",
  "Dispatch"…) and the `.sec-sub` is the sequence.
- **Step 9, Builder:**
  - the source cell names the store ("Vault document"), with the key on hover;
  - "not yet determined" is said once above the table, with its count, and quietly on each such leaf;
  - a determined verdict ("not found…", "content changed…") keeps its chip;
  - the row controls are `btn ghost small`;
  - "How documents reach this sequence" is a disclosure with its two doors, and "Copying a leaf from another market's
    sequence comes later" is gone.
- Operation chips were already sentence case (D0's `.rd-chip::first-letter`).

**A2b (steps 10–11).**
- **The one verdict** (`DispatchVerdict`):
  - **Eyebrow:** "Cleared to dispatch?"
  - **Cleared:** "Yes. Sequence NNNN is cleared to dispatch."
  - **Awaiting the dispatch e-signature's own release:** "Only its release signature stands between sequence NNNN and
    dispatch, and the dispatch e-signature applies it.", with the existing explanation as its body.
  - **Blocked:** "Not yet. Four things stand between sequence NNNN and dispatch.", with the server's blocker sentences
    as its body.
  - A record key in a blocker is shown in words ("on this sequence") and is kept out of the page entirely, tooltips
    included (`blockerForDisplay`; the coordinating session's note of 2026-11-09).
  - "Cleared" is the engine's own answer (`gate.cleared === true`), read only once the assessment has answered.
    It is never inferred from an empty blocker list.
  - A gate that is not cleared and lists no reason says "Not yet. The gate has not cleared sequence NNNN for
    dispatch, and it listed no reason."
  - The verdict has no action, so it carries no spark.
- **Around it:**
  - the counts are one quiet line;
  - the governance paragraph is the disclosure "How the dispatch gate works";
  - Dispatch's notes (no Shadow Review, the failed run, separation of duties) are plain lines, their words in their
    tone's colour (`.sc-dispatch` in `submission-v2.css`);
  - "Test package" and "Package and transmit" are section headings;
  - "Validate and compile this sequence" is `btn ghost small` (and the header's "Compile & export" since A1).
- **Step 11, Submission readiness** (`DispatchReadiness.tsx`):
  - `.page-inner` with `data-work-area="dispatch-readiness"` and the back link;
  - the catalog name "Submission readiness" (P-33) is the title for both arms;
  - the kicker ("AnA · dispatch gate · proven, not generated") goes;
  - the foot is the disclosure "How the gate is computed", in words: "a client cannot report zero validation errors to
    talk the gate down" (no `validationErrors:0`).
  - `.dr2`'s own frame, head, eyebrow, kicker, title and sub rules are deleted with their only user.
- **Dead CSS removed:** `.sc-gate`, whose panel is now the verdict. `.sc-seqbar` stays: Required deliverables still
  uses it.

## Proof

- **Running app** (`found/`, `capture.cjs`, `probes.json`). The method is D7-A1's, on the same throwaway database and
  biotech demo: Builder, Validation, Required deliverables, Dispatch, and Submission readiness, at 1440 and 390, light
  and dark, 20 captures:
  - no page overflow on any;
  - no script error;
  - exactly one `data-emphasis="verdict"`, on Dispatch;
  - the verdict reads "Not yet. Four things stand between sequence 0000 and dispatch.", its fourth blocker ending "on
    this sequence".
- **Found and fixed by the walk:** at 390, Submission readiness scrolled sideways by 53 px. A market's door ("Build the
  IND · FDA (US) sequence in Submission Center") is a no-wrap button, and as a flex item's content it set the work
  area's minimum width. It wraps at a phone's width now (`coverage-v2.css`); 0 px after. The defect predates this step
  (the old `.dr2` root carried the same door).
- **Tests:** 59 files, 629 cases, on every test of Submission Center, the workspaces, Dispatch and Submission
  readiness. The cases that waited on the old gate panel's words wait on the verdict's, each for the same state:
  - "Dispatch blocked" → "Not yet.";
  - "Dispatch gate clear" → "is cleared to dispatch";
  - "clear except for the release signature" → "Only its release signature stands…".

  The Builder's source cases now find the store name and the key's title. The "undetermined" case also checks the count
  line, and that no other status shows it.
- **The verdict's pins** (`dispatchWorkspaceHonesty.test.tsx`):
  - a not-cleared gate with no listed reason;
  - a record key in no attribute.

  Three mutations, each red on its own case (`mutation-A2-M1..M3`): the raw key put back in `title`, the no-reason
  arm dropped, "cleared" taken from an empty list. `ci:empty-state-honesty` and `ci:internals-in-copy` are OK.
- **Typecheck** 0 errors. **Gates:** css-selector-shadowing, phantom-tokens, design-system, internals-in-copy,
  one-product, surface-text-ramp, token-cascade, undefined-css-classes and ana-surface-context are OK. ESLint holds
  `SubmissionSeqWorkspaces.tsx` at 8 = 8.

## Seen, not changed here

- The Validation tab carries a second orange fill inside its own body. No A2 step covers it, so it goes to the UI pass.
- At 1440 the context row wraps the scope toggle under the long submission title. That is the row's design (it wraps),
  not an overflow.
