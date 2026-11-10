# A change's edit records its reason and each field before and after; an approved change is kept (F1, 2026-11-10)

Package **F1** (repairs). These are the two Part 11 defects the review of the change-approval signature left open
(Part 11 review L-2, recorded in `docs/design/ONE_DESIGN_PLAN.md` §3a):

1. **An edit recorded nothing of what it replaced.**
   - `PATCH /api/mdx/qms/changes/:id` edits a change while it is proposed or under assessment.
   - Its audit row named the change and the act only. There was no reason, and no value before or after.
   - 21 CFR 11.10(e) asks that a record's change not obscure what it replaced. Annex 11 §9 asks for the reason for a
     change to GMP-relevant data.
2. **An approved change could be removed.**
   - `DELETE /api/mdx/qms/changes/:id` soft-deleted a change in any state, an approved or closed one included.
   - It asked for no reason. No client calls it.

## What already exists

- **`updateChange`** and **`deleteChange`**, `server/services/qms/changeControl.service.ts`.
  - The edit is guarded to `CHANGE_EDITABLE_STATES` (proposed, under assessment) in the statement itself, since the F1
    repair `c555f4a2a`.
  - **`changeEditRefusal`** says why an edit matched nothing (409 `QMS_CHANGE_CONTENT_FIXED`).
- **The routes**, `server/routes/mdx-qms.ts`:
  - the edit's audit row (`mdx.qms.change.update`);
  - the removal's audit row (`mdx.qms.change.delete`);
  - the link removal, which already requires its reason with `governedReason` and records it.
- **The audit writer**: `recordAuditRow` writes `reason` to `audit_logs.reason`, and `details` to `new_values` inside
  the chained hash.
- **The change lifecycle**: `cancelled` is reachable from proposed, under assessment, approved and in implementation,
  with a reason (the transition route).
- **The edit drawer**: "Edit assessment", `ChangeControl.tsx` (C9), and its write `updateQmsChange`
  (`quality/qmsWrites.ts`).

Nothing new: no route, table or screen.

## What changed

| | Before | After |
|---|---|---|
| The edit's statement | `UPDATE … RETURNING *` | The same guarded update. It reads and locks the row as it was in the same statement (`FROM (SELECT … FOR UPDATE) o`), and returns both sides as JSON, so a date compares as the same text. `updateChange` returns the row with `edits: [{ field, before, after }]`, only for fields whose value changed. |
| The edit's reason | none | `editReason`, at least 8 characters (`governedReason`). Without it the route answers 422 "State why this change request is being edited (a reason of at least 8 characters). Nothing was saved." and reads nothing. |
| The edit's audit row | the act only | `reason`, and `details: { reason, edits }`. The response does not carry `edits`. |
| Removal | any state, no reason | **only while proposed or under assessment**, guarded in the statement, with a `reason` (422 without one). Past that the route answers 409 `QMS_CHANGE_KEPT`: "This change is approved, so it is kept on the record. Nothing was removed. A change is removed only before its approval; after that, cancel it through its lifecycle, with a reason." The audit row keeps the reason. |
| The drawer | Risk, impact assessment, implementation plan, target date | and **"Reason for this edit"** (required), "Recorded on the change's audit trail with each field before and after. At least 8 characters." The governed note says the same. |
| `scripts/ci/sql-interpolation-baseline.json` | `changeControl.service.ts`: 6 | 5. The gate counted one fewer and asks for the lower baseline. |

`mdx-qms.ts` stays at 1,500 lines, the repo-health ceiling. The refusal wording is in the service; two of the
route's comments were shortened.

## Tests

- `server/routes/__tests__/qms-changes.test.ts`:
  - the edit records its reason and each field before and after, and the response carries neither;
  - 422 without a reason, with nothing read or written;
  - the 409 cases send a reason;
  - the removal is guarded to the editable states and records why;
  - 422 without a reason;
  - 409 `QMS_CHANGE_KEPT` for each state past assessment;
  - 404 for another organisation's change.
- `server/services/qms/__tests__/changeControl.pglite.integration.test.ts` (real Postgres):
  - the edit returns `title` and `target_implementation_date` before and after, and not a field set to the value it
    already had;
  - a change approved, in implementation, in verification, closed, rejected or cancelled is not removed, and the
    refusal names it.
- `client/src/concept2cure/quality/__tests__/qmsGovernedActions.test.tsx`: "Save assessment" sends nothing until the
  reason is given, then sends it as `editReason`.

`red.txt`: the 18 cases fail before the change. `green.txt` covers Quality's suites, the change routes (register,
approval signature, project), the change service on Postgres and AnA's wave-4: 33 files and 479 tests. The typecheck
is clean, and so is `ci:sql-interpolation`.

## Walked in the running app

`w27-change-edit-reason.cjs` (`shots/w27-change-edit-reason.log.json`) ran as the approver, with no page errors. Its
API errors are the refusals the walk asks for.

- **The edit** (`shots/w27-edit-reason-1440.png`).
  1. In the change log, "Edit assessment" on CC-C9-268139 (under assessment) opened the drawer with "Reason for this
     edit".
  2. "Save assessment" without a reason kept the drawer open, with the field marked invalid.
  3. With the reason, it saved: "The assessment of CC-C9-268139 was saved."
- **Removal**, through the route, since no client offers it.
  - CC-SIGN-873701 (approved) answered 409 `QMS_CHANGE_KEPT` with the sentence above.
  - A change raised for the walk answered 422 without a reason, then 200 with one. Its audit trail was
    `{ persisted: true, chained: true }`.
- **The persisted audit rows** (`shots/w27-audit-rows.json`, read from `audit_logs` by `w27-audit-rows.cjs`, which
  prints no connection detail).
  - The removal row keeps its reason.
  - Each edit row keeps "Second source added after the supplier audit." and its edits. The first edit has
    `implementation_plan` before and after, and `assessed_by` 1 → 2 (the approver assessed it this time). The second
    has `implementation_plan` only.

Run it from this folder with `NODE_PATH=$(npm root -g) node w27-change-edit-reason.cjs`, then
`node w27-audit-rows.cjs shots/w27-change-edit-reason.log.json` with `DATABASE_URL` set. It needs `WALK_PASSWORD` and
a running server.
