# G10 slice 5: the per-person training view lists who has not yet acknowledged, overdue first

Row: D2 (W1), workstream MR-12 (QMS controlled documents), Stage 4. This is slice 5 of
`docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md` §3.6, "G10, slice 5: the per-person view of outstanding
training" (VEEVA_GAP §5 item 3).

Quality's per-person view, "Training lapsed or lapsing soon", listed only lapses. Someone assigned to a procedure in
force who had never read it did not appear. The Tasks board gave them a task, due on a date, and the Quality view
gave the all-clear: "No one's training has lapsed, and none lapses in the next 60 days." Its subtitle also said
"across the active organization roster". Since slice 3 it reads the people assigned, not the roster.

## What already exists

| Piece | Path | What it does | What it did not do |
|---|---|---|---|
| The per-person read | `readQmsTrainingExpiring`, `server/services/qms/training-compliance.ts`; `GET /api/mdx/qms/training/expiring` (`server/routes/mdx-qms-training.ts`) | The people assigned whose current receipt lapses within the window, or lapsed (G10, slice 3) | No outstanding training; no `kind`; no cap |
| The task resolver | `planTrainingTasks` and `trainingTaskOf`, `server/services/qms/training-task.ts` | For each person assigned: the version they train on next (the one approved for a later day, otherwise the one in force), its due day, and the 14-day grace for someone assigned after it took effect. It writes their Tasks-board task. | Not read by the per-person view |
| The view | `TrainingExpiry.tsx`, its hook `useTrainingExpiring` (`quality/hooks.ts`) | Lists the lapse rows | No other kind; it would not read one |

Searches run:
- `training/expiring`, `readQmsTrainingExpiring` and `TrainingExpiryRow` in `client/`, `server/` and tests;
- `trainingTaskOf`, `planTrainingTasks` and `coveredSince` in `server/services/qms/`.

Nothing new: no route, table, screen or file. The same route and the same view gain the rows the design names.

## What changed

- **`readQmsTrainingExpiring`** also lists `kind: 'due' | 'overdue'` rows: `{ kind, userId, userName, documentId,
  docNumber, title, documentVersion, dueDate, daysLeft, lateAssignment }`.
  - They are read from **`planTrainingTasks`**, the resolver that writes each person's Tasks-board task, so the two
    never disagree on who must train, on which version, by when.
  - A person is overdue on or after the due day, whatever the window. A person is due when the day falls inside the
    window.
  - A person whose training lapsed is listed once, as the lapse.
  - The existing rows gain `kind: 'lapsing'`.
  - The order is overdue, then due, then lapsing, each by its day.
- **The route** caps the list at 500 rows (`QMS_TRAINING_EXPIRY_ROW_CAP`) and says `meta.truncated` when there were
  more.
- **The view**:
  - It is headed **"Training overdue, due or lapsing"**, with the line "Overdue, or due or lapsing in the next 60
    days, for the people assigned to train".
  - It lists "overdue since D" (with an Overdue chip) and "due D (in n days)". For someone assigned after the version
    took effect it adds ", 14 days after they were assigned".
  - The all-clear says what was read: "No one assigned has training overdue, due or lapsing in the next 60 days."
  - At the cap it says "The first 500 rows: there are more than the list shows."
  - A row of an unknown kind, or without its day, makes the read a failure, never a row.

One departure from the design's wording "one resolver and one receipt read; no second query": the outstanding rows
take the task resolver's own receipt read. They come from the same resolver the Tasks board uses, which is the point
of the rule (one answer to "who must train"). The two receipt reads apply the one receipt rule,
`verifiedTrainingReceipt`.

## Tests

- `server/services/qms/__tests__/training-compliance.pglite.test.ts`, on a real Postgres (pglite):
  - A member assigned before the version took effect who never acknowledged it is **overdue**, first, with its due
    day (the effective day) and days since, listed whatever the window.
  - A member who acknowledged is not listed. A member who lapsed is listed once, as the lapse.
  - A member assigned after it took effect is **due 14 days after** they were assigned, within the window only.
  - A member not assigned, suspended, or no longer a member is never listed.
  - The existing G10 cases read the lapse rows.
- `client/src/concept2cure/quality/__tests__/TrainingExpiry.test.tsx`:
  - the heading;
  - overdue, then due, then the lapses, each with its words;
  - the cap line;
  - a row of an unknown kind is a failed read;
  - the all-clear's words.
- `QualityWorkArea.test.tsx` (the heading) and `SopRegisterIdentity.test.tsx` (the fixture's row kind) were updated.

`red.txt`: the new and narrowed server cases and the client cases fail before the change. `green.txt`: Quality's
suites, the register's read-honesty suite, AnA's wave-4, project home's Quality and the training services, 35 files
and 479 tests. The typecheck is clean (it caught a union typed with a plain `Omit`, fixed before commit).

## Walked in the running app

`w26-training-due.cjs` (`shots/w26-training-due.log.json`) ran as the approver, with no API or page errors.

1. **Before.** QS-SOP-001 is effective and assigned to nobody. The section reads "Training overdue, due or lapsing"
   and "No document is assigned for training yet."
2. **Assigning.** Through the row's Training, "Assign a person" offered Ada Author, Quinn Approver and Theo Trainee.
   Theo was assigned with a reason, and the drawer said "1 person is assigned."
3. **After** (`shots/w26-training-due-1440.png`). The section lists "Theo Trainee · QS-SOP-001 Handling of customer
   complaints · v1.0 · due 2026-11-24 (in 14 days), 14 days after they were assigned". Coverage above it reads "0 of
   1 acknowledged".

Run it from this folder with `NODE_PATH=$(npm root -g) node w26-training-due.cjs`. It needs `WALK_PASSWORD`, a running
server, and an effective SOP numbered QS-SOP-001 (`../../DESIGN/D7/2026-11-10-one-drawer/w22b-record-review.cjs`
approves one).

The overdue case cannot be produced in a live walk without waiting for a due day to pass. It is proved on Postgres
above.
