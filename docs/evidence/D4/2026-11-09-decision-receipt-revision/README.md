# The decision receipt names a revision only when there is one (J3 R10, D4, 2026-11-09)

**The finding.** J3 human test R10 (`docs/evidence/HUMAN-TEST/J3/README.md`): the review decision dialog's receipt
read "Revision not recorded". The same words also stood above the saved document before the decision.

## What already exists (RULE 3)

- **`surfaces/ReviewDecisionDialog.tsx`.** It renders the saved document a reviewer decides on (`SavedReviewRead`)
  and the receipt once the decision is recorded (`DecisionReceipt`). Both printed
  `Revision {snapshot.version ?? 'not recorded'}`.
- **`server/services/authoring/authoring-content-digests.ts`, `fullVisibleAuthoringSnapshot`.** It copies
  `authoring_documents.version` into the reviewed snapshot.
- **`authoring_documents.version`.** A nullable text column.
  - A search of `server/` finds no INSERT or UPDATE of it on `authoring_documents`.
  - In the seeded walk database all 35 documents hold NULL.
  - So the words appeared on every authoring document. They read as if something had failed to be recorded.
- **The binding.** The verdict is bound to the saved text by `reviewed_snapshot_hash`
  (`server/services/authoring/peer-review.ts`), and the receipt already says so: "This verdict is bound to the saved
  content and review request shown above."

Nothing new is added, and the server is unchanged.

## The change

`revisionWords(version)` returns "Revision 3", or nothing when the document carries no revision number.

| Where | A document with a revision | A document without one |
|---|---|---|
| Above the saved document | Revision 3 · M2 · en · TEST | M2 · en · TEST |
| The receipt | Revision 3 · Recorded *time* | Recorded *time* |

## Red, then green

**At HEAD** (`red-at-head.txt`), the new case in `__tests__/reviewDecisionBinding.test.tsx` failed. The dialog read:
"Revision not recorded · M2 · en · TEST … Your decision recorded — Approved Revision not recorded · Recorded …".

**After the fix** (`green.txt`), the review suites pass, 142 of 142. The case "still names the revision when the
document carries one" holds the versioned line.

**Gates:** ESLint is clean on both files.
