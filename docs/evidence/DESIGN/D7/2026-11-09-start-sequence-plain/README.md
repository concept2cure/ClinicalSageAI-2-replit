# D7: "Start sequence NNNN" is a secondary with no spark (2026-11-09)

**Package:** D7. **Lane:** L9, RIM system build-out (`011e42…`). Asked by the coordinating session on 2026-11-09,
after the P-86 C3 walk found it. It rides the next D7 commit.

## What already exists (RULE 3)

- **The two controls that start a sequence**, both on Submission Center's Sequences tab (`SubmissionCenter.tsx`):
  - the empty state's "Start sequence 0000";
  - `NextSequenceControl`'s "Start sequence NNNN", beside the type select.

  Both were `sp-primary sc-btn` (the retired name for the orange primary) with the AnA spark (`I.sparkles`).
- **The design system's button vocabulary** (`app-v2.css`):
  - `.btn` alone is borderless;
  - `.btn.ghost` is "the hairline secondary, the workhorse";
  - `.btn.primary` / `.sp-primary` is "the view's ONE orange action".
- **The view's one orange action** is the header's "New submission" (D7-A1).
- **The rules:**
  - D0 §7 check 2: one orange fill per view.
  - D0 §8.1: the spark marks a request to AnA. Starting a sequence asks nothing of AnA. It posts
    `POST /api/submissions/:id/sequences` directly.

## The change

- Both controls are `btn ghost`, with no spark, and the code comments say why.
- **A departure from the request's wording, found by the walk.** The coordinating session wrote `btn`, and the first
  walk used it. In the running app, a bare `btn` has no border, so "Start sequence 0000" read as a line of text, and
  in the empty state it is the only action. `btn ghost` keeps the request's point: not orange, and no spark. It also
  reads as a button.

## Proof

- **Tests** (`submissionCenterCreate.test.tsx`), written first:
  - `red.txt`: both new cases fail on `sp-primary sc-btn`.
  - `green.txt`: 8 of 8.
  - The case reads both places, the empty submission's 0000 and the next sequence's 0001. It checks the class, that no
    `svg` is inside the button, and that the only orange fill in the view is "New submission".
- **Mutations**, each red on its own case, each file restored:
  - `mutation-M1`: the next sequence's button is orange again;
  - `mutation-M2`: the empty state's button carries the spark again.
- **Running app** (`found/`, `capture.cjs`, `probes.json`), on D7-A2's throwaway database and biotech demo:
  - the empty state at 1440 and 390, light and dark;
  - 0000 started from the button once;
  - the next sequence's control at every size and theme.

  The probes read:
  - the class `btn ghost` and no spark on every capture;
  - each button hit by `elementFromPoint` at its centre;
  - one orange fill in the work area, "New submission";
  - no overflow and no script error.

  The submission was emptied first by P-86's own retirement act, signed by the person who did not create the
  sequence (`D7-SEQUENCE-RETIREMENT/2026-11-09/06-screen/capture.cjs`, phase `sign`).
- **Gates** (`gates.txt`): css-selector-shadowing, design-system, internals-in-copy, one-product,
  undefined-css-classes, empty-state-honesty, surface-text-ramp and token-cascade are OK.
- **ESLint** (`lint.txt`): `SubmissionCenter.tsx` 5 = 5, `submissionCenterCreate.test.tsx` 1 = 1, `capture.cjs` 0.
- **Suites:** the 92 Submission Center, Dispatch, Validation, Shadow Review, Builder and sequence files, 999 of 999
  pass on the committed code (`suite.txt`).

## Seen, not changed here

- **"Declare sequences filed before this platform"** (`FiledElsewhereBaseline.tsx`, `sc-btn`) also reads as text in
  the same view. It is the filed-elsewhere baseline's control, and is reported to the coordinating session.
