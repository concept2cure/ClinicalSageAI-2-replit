# The training all-clear says only what was assessed, and speaks for the reader when the read was their own

Row: D2 (W1), workstream MR-12 (QMS controlled documents), Stage 4. This follows slice 5
(`../2026-11-10-training-outstanding/`) and repairs three findings of the Quality review of 2026-11-10 on its view,
"Training overdue, due or lapsing".

1. **An unreadable document counted as all clear.**
   - Some assigned documents have released text that cannot be read: their signed release is missing, so
     `context.eligible` is false.
   - Such a document gives no row of any kind, no lapse and no outstanding training.
   - With no rows, the view said "No one assigned has training overdue, due or lapsing in the next 60 days", over
     documents it never assessed.
2. **The document cap was silent.** The read covers the first 200 trainable documents (`LIMIT 200`). Past them the
   all-clear spoke for documents it never read.
3. **A member who sees only their own rows was told about everyone.**
   - The route filters to the reader's own rows unless they administer or are a designated QMS approver
     (`scope: 'own'`).
   - The view still said "No one assigned has …" and "for the people assigned to train".

## What already exists

- **The per-person read**: `readQmsTrainingExpiring`, `server/services/qms/training-compliance.ts`, and its route
  `GET /api/mdx/qms/training/expiring` (`server/routes/mdx-qms-training.ts`).
  - The route already says `scope` (`everyone` or `own`) and `truncated` in `meta`.
- **What the read already knows**:
  - `readCurrentReceipts` gives each release its `context.eligible` (in-force-release.ts) and its `coverage.assignees`.
  - It stops at `LIMIT 200`.
- **The view**: `TrainingExpiry.tsx` and its hook `useTrainingExpiring` (`quality/hooks.ts`). The all-clear is
  `nothingLapsing`, which already refuses one when the assignment read failed or is in flight (review C2-2).
- **Who sees everyone**: `seesEveryAssignee` (an administrator, or a designated QMS approver).

Nothing new: no route, table or screen. The read is split inside its own file: `readQmsTrainingView` returns the rows
and what was not assessed, and `readQmsTrainingExpiring` keeps its signature and returns the rows.

## What changed

| | Before | After |
|---|---|---|
| The read | rows only | `{ rows, unassessed, documentsCapped }` |
| `unassessed` | — | the assigned documents whose released text cannot be read. For a reader who sees only their own rows, only the documents assigned to them |
| `documentsCapped` | — | true when the trainable-document read reached its cap (`TRAINABLE_DOCUMENT_CAP`, 200, now a bound parameter) |
| The route's `meta` | `count`, `withinDays`, `scope`, `truncated` | and `unassessed`, `documentsCapped` |
| The view, nothing listed, something not assessed | "No one assigned has training overdue, due or lapsing in the next 60 days." | No all-clear, and "N assigned documents were not assessed: their released text cannot be read." |
| The view, at the cap | the all-clear | No all-clear, and "Only the first 200 trainable documents were read." |
| The view, own rows | "No one assigned has …"; "… for the people assigned to train" | "You have no training overdue, due or lapsing in the next 60 days."; "Your training: overdue, or due or lapsing in the next 60 days" |
| Lapse and outstanding, the same person and document | deduplicated by person and document | by person, document and version, so a lapse on one version does not hide outstanding training on the next |

## Tests

- `server/services/qms/__tests__/training-compliance.pglite.test.ts` (real Postgres):
  - an assigned document whose signed release is gone counts as not assessed, and gives no row;
  - for a reader who sees only their own rows, only the documents assigned to them count;
  - nothing counts when every assigned document was read.
- `client/src/concept2cure/quality/__tests__/TrainingExpiry.test.tsx`:
  - the own-rows wording;
  - no all-clear over unassessed documents or at the cap, each said.

`red.txt`: the four cases fail before the change; the own-reader count fails against the organisation-wide count it
replaces (1, not 0). `green.txt`: the training services and routes on Postgres and Quality's suites, 33 files and 495
tests.

## Walked in the running app

`w29-training-assessed.cjs` (`shots/w29-training-assessed.log.json`) ran with no page or API errors.

- **The approver, the author and the trainee**: `scope: 'everyone'`, `unassessed: 0`, `documentsCapped: false`. Each
  sees Theo Trainee's QS-SOP-001 row, due 2026-11-24, under "… for the people assigned to train"
  (`shots/w29-training-approver-1440.png`).
- **A member who sees only their own rows.** All three walk users are administrators of the walk organisation, so
  none could reach this view.
  - The administrator made Theo a member and withdrew the QMS approver designation, each with its reason.
  - Read as Theo: `scope: 'own'`, the line "Your training: overdue, or due or lapsing in the next 60 days", and Theo's
    own row (`shots/w29-training-trainee-own-1440.png`).
  - Then the walk restored Theo's role and designation, each with its reason.
- **Not walked.** No assigned document in the walk organisation has unreadable released text, and it has fewer than
  200 trainable documents, so neither line shows there. The Postgres and component tests above cover both. Making a
  document unreadable in the running app would mean deleting its signature row, which no route offers.

Run it from this folder with `NODE_PATH=$(npm root -g) node w29-training-assessed.cjs`. It needs `WALK_PASSWORD` and
a running server.
