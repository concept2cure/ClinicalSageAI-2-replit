# An approved change's content is fixed (F1, 2026-11-10)

Package **F1** (a defect in shipped behaviour). It was found while reading ahead for sweep item C9, "a change record can
be read and assessed before anyone signs it". That item adds an "Edit assessment" control for a proposed change or one
under assessment. The client would only have hidden the control after approval. The server would still have accepted
the edit.

## The defect

`PATCH /api/mdx/qms/changes/:id` (`server/routes/mdx-qms.ts`) calls `updateChange`
(`server/services/qms/changeControl.service.ts`). The update was guarded by `status NOT IN ('closed','cancelled','rejected')`,
so it applied to an **approved** change, and to one **in implementation** or **in verification**.

The approval is an electronic signature bound to the change's content. `computeQmsChangeContentDigest`
(`server/services/qms/change-approval-signature.ts`) covers:

- the title, the description, the type, the classification and the risk;
- the reason, the impact assessment and the implementation plan;
- the target date and the controlled-document pointer.

Every one of those fields could be rewritten after the signature. Nothing said so: the edit's audit row carries no
before or after values. A reviewed-learning library version whose approval is re-verified against the live row
(`readReviewedLearningChangeApproval`) would quietly have become unreadable.

The same rule already exists elsewhere. The founder decision P-63 (`docs/LAUNCH_DEFINITION_OF_DONE.md`) says signed
content is not edited in place. The 2026-10-19 Part 11 review, finding L-2
(`docs/evidence/reviews/2026-10-19/part11-ux.md`), prescribes this fix.

## What already exists

- `updateChange`, `getChange`, `CHANGE_TRANSITIONS`: `server/services/qms/changeControl.service.ts`.
- The PATCH route and its error envelope (`clientError`, `server/lib/api-response.ts`): `server/routes/mdx-qms.ts`.
- The approval digest: `server/services/qms/change-approval-signature.ts`.
- Tests:
  - the route suite, `server/routes/__tests__/qms-changes.test.ts`;
  - the PGlite service suite, `server/services/qms/__tests__/changeControl.pglite.integration.test.ts`;
  - the real-database suite, `tests/db/qms-project-records.dbtest.ts`.

Nothing new: no route, table, service or screen. The guard is narrowed in place, and the route says the refusal instead
of "not found".

## The fix

- `updateChange` applies only while the change is **proposed** or **under assessment** (`CHANGE_EDITABLE_STATES`).
  Those are the states in which the assessment is written. The states are bound as a parameter
  (`status = ANY($3::text[])`), so the statement interpolates fewer values. The `ci:sql-interpolation` baseline for
  the file drops from 8 to 6.
- The route reads the change when the guarded update matches nothing:
  - absent: 404, as before;
  - present: **409 `QMS_CHANGE_CONTENT_FIXED`**, carrying the change's state. The words say the state. For an approved,
    implementing, verifying or closed change, they add that its content "is what its approval signed". They end
    "Nothing was saved. To amend it, raise a new change request."
- Raising a new change request is the only way to amend an approved change that adds no new act. There is no
  approved → under assessment move.

## Checked before it was applied

Three independent readers each tried to refute the plan (`review.json`), and none did.

- **Callers.** `updateChange` has one caller, this route. The client never sends PATCH. AnA has no tool that edits a
  change. No demo, seed or validation script edits one after approval. Every other writer of the table touches only
  fields the digest excludes.
- **Design.** It matches P-63 and L-2, and no record designs an edit after approval. Keeping "under assessment"
  editable is right, because the assessment is written in that state.
- **Tests.** The readers found three things the first draft missed, and all three are in this change:
  - the real-database suite edited a change in verification to race a closure, and would have failed CI;
  - the guard as first written added an interpolated value, which `ci:sql-interpolation` refuses;
  - the refusal wording claimed a signature for rejected and cancelled changes, which may never have been approved.

The readers also noted gaps outside this fix, from the same review L-2. They are not in this change:

- an edit while editable records no reason and no before and after values;
- `DELETE /qms/changes/:id` soft-deletes an approved or closed change.

## Tests

| Suite | What it pins |
|---|---|
| `qms-changes.test.ts` | An edit under assessment applies, with the statement's guard and bound states checked. Approved, in implementation, verification, closed, rejected and cancelled each answer 409 with the code and the state. The refusal comes after the tenant read. An absent change is 404. |
| `changeControl.pglite.integration.test.ts` | Against real SQL: proposed and under assessment take an edit. The six other states refuse it and leave the content as it was. The stale-closure race keeps its state and link cases. A content edit can no longer race a closure in verification. |
| `qms-project-records.dbtest.ts` | Against the local PostgreSQL server: the closure race keeps its requirement case and passes (6 of 6). |

`red.txt`: the new cases run against the old service and route. Ten fail, on the edits after approval and on every
409. The old service already refused an edit of a closed, rejected or cancelled change, but answered "not found".

Green: the four change suites, 88 tests. The real-database file, 6 tests. `ci:sql-interpolation` passes.

## Walked through the running server

`w12-change-edit.cjs` (log: `w12-change-edit.log.json`) ran against the app server, restarted on this code, with
`RLS_ENFORCE=on`. It signed in through the real login as the author and as the approver.

1. The author raises a change (201) and edits its impact assessment while it is proposed (200).
2. The author opens the assessment (200) and edits its implementation plan (200).
3. The approver signs the approval with password, meaning `APPROVED` and a reason (200, `approved`).
4. The author edits the implementation plan again: **409**, *"This change is approved, so its content is fixed: it is
   what its approval signed. Nothing was saved. To amend it, raise a new change request."*, with details
   `{ code: QMS_CHANGE_CONTENT_FIXED, status: approved }`.
5. Reading the change back shows the plan as approved: "Planned under assessment."
6. An edit of an absent change answers 404.

Run it from this folder with `NODE_PATH=$(npm root -g) node w12-change-edit.cjs`. It needs `WALK_PASSWORD` and a running
server.
