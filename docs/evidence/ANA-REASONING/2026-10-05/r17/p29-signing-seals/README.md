# P-29.2 — the seal the decision was actually about

Rows **D5** and **D1**. Decision **P-29**
(`docs/EXIT_ATTESTATION_DECISION_2026-10-18.md`), increment 2. Round 17.

## What was wrong, and why round 16 did not fix it

Round 16 gated the **freeze**. An **APPROVER e-signature** reaches the same
sealed state — it writes `status = 'APPROVED'`, `frozen_at`, the snapshot and
the signature — with no status precondition and no call to the check. So did
`POST /docs/:docId/sign` at the last cleared step. And the freeze route's own
refusal copy *directs people to e-sign*.

So the path a client actually uses to approve a document passed no check at
all. A gate the product routes around is worse than no gate, because it reads
as coverage. Shown as the red above: 200, where 409 is required, with a
signature row written and the document APPROVED.

This was found by the adversarial review's own decide phase after round 16 had
already shipped, which is the argument for running the review to completion
rather than stopping at the point where it confirms the plan.

## What changed

- **`filingBlocksSeal(client, docId, tenantId, act)`** — the one place the
  three seals ask the question, returning the refusal already built. It runs on
  the sealing transaction, so the answer is the one the seal is about to act on.
- **`POST /e-sign`**, `meaning === 'APPROVER'`: refuse before
  `reverifyAuthoringSigner` (so no re-authentication code is spent), before the
  APPROVED flip, before the snapshot and before the signature row.
- **`POST /sign`**: refuse for **every** meaning, not only the step that seals.
  Whether a signature is the last one is not known until the workflow is
  advanced, which is after the signature is written — and a reviewer's "I
  reviewed this" that attests to text the submission will not carry is a
  defective record on any step. The code says to narrow it to the sealing step
  if evidence shows reviewers blocked by a divergence they cannot clear, and
  not to weaken the refusal.

### The refusal now names something the author can open

`FilingDivergence` carries the contributing section's id and code. The 2.5
Clinical Overview is filed as ONE node assembled from 2.5.1 … 2.5.7, so a
refusal naming only `2.5` sent the author looking for a section whose code no
authoring section has. `signedFilingSectionTexts` had the id and code in hand
and discarded them; they now ride along, and the copy reads
`2.5.1 (filed at 2.5)` — and says it once when the section *is* the node.

### And the remedy it names is performable

`different` is by construction a state in which the **editing** text did not
change, so the editor's Save is disabled (`dirty` requires `editorDirty`). The
copy therefore says "make any edit and save" rather than "save", because a
refusal that prescribes a greyed-out button is a dead end. Enabling a re-file
of an unchanged body is filed as the follow-up; until it lands, this wording is
the honest one.

## One refactor, and why it is in this commit

The `/e-sign` handler was at exactly 100 counted lines, the lint ratchet's
limit, so two added lines broke it. Rather than squeeze the gate onto one line,
the APPROVER flip and its snapshot — two adjacent statements whose **order is
the point**, because the snapshot is of the approved state — were extracted as
`sealForApproverSignature`. The handler is now shorter than it was. Blame on
those lines is 2026-10-08, outside this session's 24-hour hold on another
lane's work.

## Files

- `red.txt` — the 200s where 409s are required, the two controls that pass
  either way, and two false starts: a backtick of mine that ended a template
  literal, and two harness gaps that looked like a live CHECK-constraint
  blocker and were not.
