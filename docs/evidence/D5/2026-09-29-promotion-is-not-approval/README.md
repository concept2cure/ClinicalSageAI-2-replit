# Promoting an artifact is not an approval, and is not recorded as a signature

**Row:** D5 (Part 11: an approval is an electronic signature, and the audit
trail says what happened). **Session:** `…01P6GWSv`. **Date:** 2026-09-29.
**Source:** the adversarial review of
`docs/evidence/D5/2026-09-28-artifact-approval-signature/`, recorded there as
this lane's next item.

## What was wrong

`promote_artifact` (`server/services/ai-actions/handlers/promote-artifact.ts`),
labelled "Promote to document" in the product, creates the governed document
from a concept2cure artifact under a human confirmation with a reason. It
also did two things it should not:

- **It set the artifact's status to `approved`**, with no signature anywhere.
  Its own `TODO(compliance)` said a signature should be required first. The
  2026-09-23 decision already stopped it recording an approved version, so the
  result was not filable. But the artifact read "approved", and nobody had
  signed it.
- **It wrote a Part 11 audit event with action `signature_apply`** and event
  `artifact_promoted_to_approved`. That records a signature that was never
  applied. It also awaited the write and discarded its outcome (baselined in
  `ci:discarded-audit-write`).

Since 2026-09-28, an artifact is approved by the status route's electronic
signature (`server/services/artifact-signed-act.ts`). A second path to
"approved" with no signature contradicts that.

## The change

A product decision, made under the ownership the founder gave this work:
promotion is not an approval.

- **The artifact's status is not changed.** The promotion is recorded on it:
  `promotedToDocumentId`, when, by whom, the action id and the reason.
- **The document is created as a draft**, with lifecycle `draft` for the
  governed contract, as its row already said. The metadata block that called
  the confirmer the "approver" is now a `promotion` block.
- **The audit entry is honest.** Action `data_modify`, event
  `artifact_promoted`. Its outcome is read: a promotion whose entry was not
  written says so in its warnings. The `ci:discarded-audit-write` baseline
  entry for the file is gone (1 → 0).
- **Already promoted means already promoted**, whatever the status. The
  duplicate check read status `approved`, which a promotion no longer sets.
- **The confirmation gate is unchanged.** It still needs an authenticated
  person with the role, a reason and the confirmation flag, and it still
  refuses an automated actor. Its error codes are unchanged for callers; its
  messages say "confirm", not "approve".

The filing warning is unchanged. It still names the governed Approve action,
now described as an electronic signature.

## Proof

| Case | HEAD | Change |
|---|---|---|
| Four approval-capable roles promote from review | the status becomes `approved` | the status stays `review`, not filable (`not-approved`) |
| Promote a draft nobody reviewed | the status becomes `approved` | stays `draft` |
| The promotion's audit entry | `signature_apply` | `data_modify` / `artifact_promoted`, with the reason |
| The audit entry is not written | nothing said | warned |
| approved → review, then promoted (`artifact-approval-follows-status`) | back to `approved`, unsigned | stays `review` |

The filable cases (an artifact the signed act approved, and edited after
approval) and the gate case are unchanged, and pass both ways.

The evidence files:
- `red.txt`: 8 cases fail against HEAD's handler.
- `green.txt`:
  - the two suites, 10/10 and 12/12;
  - every suite that names `promote_artifact` or the ai-actions framework: 21
    files, 199 of 200 tests. The one failure is trunk's `global-compliance.ts`
    contract, handed on.
  - the gates, the type check and ESLint (no change in warnings).

Two tests pinned the old status, and are updated in this change, each with a
dated note:
- `promote-artifact-approved-version.pglite.test.ts`;
- `artifact-approval-follows-status.pglite.test.ts`.

The first one's audit mock now returns the audit writer's real contract,
`{ persisted, chained }`, instead of `undefined`.

## Still open

- AnA `update_artifact_status` can still set approved or locked with no
  signature. It is inside `…01KiDof7`'s window, and handed on
  (`docs/work-orders/README.md`, item 10).
- `/api/authoring-actions/approve-artifact` and `/lock-artifact` are handed on
  to `…01GJidg5` (item 6).
- No client sends `confirmApproval`, so "Promote to document" is refused
  (400) from every surface today. That is a dead control rather than a Part 11
  defect, and it is recorded for the surfaces' owners, not fixed here.
