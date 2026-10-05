# A governed draft is checked before the person approves it

Round 3 of the founder-directed AnA reasoning lane (founder, 2026-10-04:
*"Enhance the reasoning layer of ANA"*). Board row: "AnA's reasoning is checked
by an engine…" (`docs/work-orders/README.md`). Supports D5 (what a person
approved, on the record) and D4. Rounds 1 and 2 are in `../2026-10-04/`. This
round closes that map's GRD-2 / FV-FIG-3.

## What was wrong

- **A governed draft was approved with nothing checking it.** These all reached
  a person for approval with no check of their figures, identifiers or
  verdicts:
  - an authoring document AnA drafted (`draft_authoring_document`);
  - a vault write;
  - an artifact from an `ana-action` block.
- **The dialog showed the draft as "sections: 3 items".** Every other string
  was cut at 80 characters, so the person approved text they could not see
  into. A figure AnA invented could reach the record with a person's approval
  on it.
- **The sign-off audit row did not say what the person was shown.** It names
  the command, a hash of the params and the model that proposed them, but
  nothing about the draft's content.

## What changed

| Where | What |
|---|---|
| `server/services/ana/proposal-check.ts` (new) | **`proposalProse`** collects the prose a proposal would store. That is every string under a free-text input field, at any depth (a section's `content`). The field list is `FREE_TEXT_FIELD` in `governed-write-tools.ts`, the same list the approved-model gate uses. HTML is reduced to text by the export pipeline's own `htmlToPlainText`, and depth and length are bounded.<br>**`checkProposal`** runs that prose through the answer engine (`checkAnswer`) against the turn's sources.<br>**`withProposalChecks`** does the same for the proposals `post_done` carries. |
| `server/routes/ana-ri/stream.ts` | **At the hold (`awaitDecision`)**, the proposal is checked against what AnA consulted before she wrote it: the project context, every earlier tool result and web step, and the person's message, read as theirs. The check goes on the held row and on the `approval_required` frame. It is computed in a helper beside `awaitDecision`, so that function's complexity stays where it was. |
| `server/services/ana/run-control.ts` | `PendingToolApproval.check`: one optional type field. |
| `server/routes/ana-ri/post-processing.ts` | A proposal made at the end of a turn carries the same check in `post_done`. That covers `HUMAN_CONFIRMATION_REQUIRED` and `PART11_SIGNATURE_REQUIRED`; a retryable failure does not get one. |
| `server/routes/ana-ri/governed-execution-audit.ts` | **The sign-off row's trace names what the approver was shown:** the engine, the basis, the counts, the texts not found and the verdicts. It keeps at most 20 texts of 200 characters each. The run row clears the full check when the person decides, so the sign-off row is where it survives (21 CFR 11.10(e)). |
| `client/…/ana/AnswerCheckRows.tsx` (new, moved) | **The check's rows**, moved out of `v2/AnaGrounding.tsx` unchanged, so the strip under an answer and the sign-off dialog render one implementation. |
| `client/…/ana/useGovernedAction.ts` | **`PendingSignoff.check`**, read by the strip's own reader (`readAnswerCheck`) from both the live frame and `post_done`. A malformed check is treated as no check. |
| `client/…/ana/GovernedActionSignoff.tsx` | **The dialog shows "What this draft states, checked against this turn's sources"** in the strip's rows, before the reason and the confirm button. A list whose items have names reads by the names ("Efficacy · Safety"), not "2 items". |

The check informs; it does not block. The person decides, and nothing in the
dialog is synthesised: it restates the server's check.

## Proof

- **Red first.**
  - `red-grd2.txt`: the unit, route and dialog suites against the tree before
    the change. The module is missing, and 5 of the other 9 tests fail.
  - `red-grd2-audit.txt`: the sign-off row, 2 of 3 failing.
  - `red-grd2-endofturn.txt`: the end-of-turn path, 2 of 9 failing.

  Each test that passed at once pins a negative (no prose means no check; a
  malformed check is none). Its red is its mutant.
- **Green.** `green.txt`: 232 tests in 15 files. That is round 3's five
  new suites plus the ten suites of the paths it joins (the strip, the
  sign-off dialog, the hold, the confirm tier, round 2's engine).
- **Related suites.** `related.txt`: every suite of the modules rounds 1–3
  touch, 6,013 tests passing. One file fails: the ESG transport suite. It
  needs a `CONNECTOR_ENCRYPTION_KEY` this container does not set, and fails
  the same way, 15 of 15, on an export of trunk `962f15f7f`.
- **Mutants.** `mutants/summary.txt`: 25 of 25 killed on the first run.
  Each mutant reverts one rule. The strip's round-2 mutants (R49, R51–R54,
  R82) targeted lines this round moved, so they are re-targeted here, in the
  rows' new home (S49–S91), and run against both the strip's suite and the
  dialog's.
- **Lint.** `lint.txt`: no touched file gains a warning, and the new files
  have none.
- **Types.** `tsc.txt`: the whole-tree typecheck.

## Edits inside another lane's window

`stream.ts` and `post-processing.ts` were inside row 100's 24-hour window: its
merge `3310d6c62` landed 2026-10-04 21:26. This round's hunks there are
additive insertions between lines `git blame` dates to 2026-09-22 through
2026-10-01. None of row 100's lines changed.

## Not done here

- The sealed turn record keeps the answer's verification, not a held
  proposal's check. The check is on the sign-off row, in summary.
- A draft inserted into a section as a tracked suggestion
  (`InsertIntoOpenSection`) carries no check. That is GRD-missed in round 1's
  map.
- Working memory still has a model "lock" facts from the conversation, unchecked.
  That is FV-missed, and it is next.
