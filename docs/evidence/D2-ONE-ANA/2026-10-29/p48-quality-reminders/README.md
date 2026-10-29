# P-48: a CAPA, a supplier and an internal audit remind the person who owes them

Row: D2 (launch catalog: QMS). Decision: P-48 in `docs/LAUNCH_DEFINITION_OF_DONE.md`, under the founder's direction of
2026-10-29 to offer what Veeva QMS Basics offers a biotech. A Basics QMS reminds an owner before a CAPA, an action, a
supplier audit or an internal audit falls due. Here the registers showed the dates, and nothing reached a person.

This adds no scheduler, store, surface or route. It writes the dates into the one task store, and the one due-date
sweep already notifies from there, the same path a controlled document's periodic review takes since this morning
(`docs/design/QMS_PERIODIC_REVIEW_REMINDERS_2026-10-29.md`).

## What already exists

| Piece | Path | What it did before this change | What it did not do |
|---|---|---|---|
| Task store | `unified_tasks`, `server/services/unifiedTaskService.ts` | One task store. A task shows on its assignee's Tasks screen. `MODULE_CONFIG` has a Quality module. | — |
| Due-date sweep | `server/jobs/taskDueSweep.ts` | Hourly, once per task: a notice when a task comes due (48 hours, or `metadata.remindDaysBefore` days), and one when it goes overdue. | It reads only tasks, so a date that is not a task reminds nobody. |
| Periodic review task | `server/services/qms/periodic-review-task.ts` | One open task per controlled document, keyed by source. It closes the open task and writes the next, or leaves it when unchanged. Best effort after the governed act. | The close-then-write logic lived inside it, so the next record type would have copied it. |
| `emitDeadlineTask` | `server/services/research-compliance/tasking-bridge.ts` | Best-effort writer for research-compliance deadlines. | It hard-codes the Research Compliance module, takes no assignee and closes nothing, so it cannot carry a QMS date to its owner. Not used here. |
| CAPA dates | `capa_records.target_close_date`, `capa_actions.due_date` (`shared/schema/capa-mdr.ts`) | The CAPA register shows the target close date and counts the late CAPAs. An action shows its due date. | No task, so no notice. |
| Supplier and audit dates | `qms_suppliers.next_audit_date`, `.reapproval_date`; `qms_internal_audits.planned_date`, `.auditor_lead_id` (`migrations/20260511_qms_and_labeling.sql`) | The registers show them and count those past due. | No task, so no notice. |
| CAPA writes | `server/services/capa-mdr/capaMdr.service.ts` (`createCapaRecord`, `transitionCapa`, `addCapaAction`, `transitionCapaAction`) | Every caller goes through these: the routes, AnA's tools. | — |

Searches run:
- `emitDeadlineTask`, `taskDueSweep`, `createUnifiedTask`, `unifiedTaskService` and `remindDaysBefore` in `server/`;
- `unified_tasks` in `server/routes/capa-mdr.ts`, `server/services/capa-mdr/` and `server/routes/mdx-qms.ts` (no hits);
- `target_close_date|next_audit_date|reapproval_date|planned_date` in `server/jobs/`.

## What changed

- **The close-then-write is one function**, `replaceSourceTask` (`server/services/tasking/source-task.ts`), taken out of
  `periodic-review-task.ts`, which now calls it. One open task per source record:
  - the same task again changes nothing;
  - a different one closes the open task (completed or cancelled, as the act says), then writes the new one;
  - none closes it.
  - It never throws: a task that did not land is logged, and the governed act stands.
- **CAPA** (`server/services/capa-mdr/capa-tasks.ts`, called from the four service entry points after the act commits):
  - an open CAPA with a target close date owes "Close CAPA-007: …", due that day, with 14 days' notice. It goes to the
    user named as its assignee, otherwise to the person who raised it. A high or critical risk CAPA's task is high
    priority;
  - closing the CAPA, effective or not, completes the task. Reopening it after a not-effective close owes it again;
  - an action item with a due date owes "CAPA-007 action 2: …" to its owner when the owner is a user id, otherwise to
    the person who recorded it, and the task names the owner. Done completes it, and cancelled cancels it;
  - the two private action writers return the parent CAPA's number with the row, which they already read, so the
    task can name it. The response is unchanged.
- **Suppliers and internal audits** (`server/services/qms/qms-record-tasks.ts`, called from the four QMS write routes):
  - a supplier's next audit and its re-approval are a task each, due on their dates, with 30 days' notice, to the
    person who recorded them (the register names no supplier owner);
  - an update that records the audit (`lastAuditDate`) or the approval (`approvalDate`) completes that task, even
    when the next date was not moved. A revoked supplier owes neither;
  - a planned internal audit owes its start, due on its planned date, with 14 days' notice, to its lead auditor. The
    task is completed when the audit starts or closes, and cancelled with the audit or when its date moves.
- `mdx-qms.ts` hands each write's row to the planners as `SupplierTaskSource` or `InternalAuditTaskSource`.

## Proof

- `server/services/tasking/__tests__/source-task.test.ts` passes 4 of 4:
  - the same task again changes nothing;
  - a different one closes the open task, then writes the next under the organisation, the source and the actor;
  - none closes the open task as the act says;
  - a failure is reported and never thrown.
- `server/services/capa-mdr/__tests__/capa-tasks.test.ts` passes 4 of 4:
  - an open CAPA owes "Close CAPA-007: …" to the person who raised it, due on its target date, with 14 days' notice;
  - a closed CAPA owes nothing and completes the task, and a CAPA with no target date owes nothing;
  - an action is owed to a user owner, or to whoever recorded it, with a free-text owner named in the task;
  - done completes the task, and cancelled cancels it.
- `server/services/qms/__tests__/qms-record-tasks.test.ts` passes 4 of 4:
  - a supplier's audit and re-approval are owed with 30 days' notice;
  - recording the audit completes its task even when the next date was not moved;
  - a revoked supplier owes nothing;
  - a planned audit is owed to its lead auditor, and the task ends when the audit starts, is cancelled or moves.
- **Shown failing first:** each of three mutations fails exactly its case (3 failed, 9 passed); restored, all pass:
  - without `replaceSourceTask`'s same-task check;
  - with a closed CAPA treated as open;
  - with a recorded audit not ending the task.
- The QMS and CAPA route tests, the CAPA, QMS and tasking services and `server/jobs` pass 586 of 586 (52 files).
  The periodic review now goes through the shared function, and its callers' tests pass unchanged.
- `tsc --noEmit` reports no error in the changed files.

## Not this change's, seen on trunk

- `server/routes/__tests__/report-os-report-pack-export.test.ts`: 16 of 52 fail with this change stashed. Reporting
  lane.

## Owed

- `server/services/protocol-deviations/protocol-deviations-service.ts` has its own `addCapaActionTx`, a second writer
  of CAPA actions outside `capaMdr.service.ts`. Its actions get no task. Converging it onto the CAPA service is owed
  to whoever owns protocol deviations, under zero duplication.
- A CAPA's assignee: no screen sets `assignedTo` yet, so a CAPA's task goes to the person who raised it.
- A supplier owner: the register names none, so a supplier's tasks go to the person who recorded the date.
- No route moves a CAPA's target close date. When one does, its task follows (the planner compares the date).
- A dbtest against Postgres (no server here).
- `ci:sql-interpolation` misses an interpolation when the call has a type parameter. The first attempt typed the four
  write queries as `query<Row>(…)`, and the gate then counted 2 interpolations in `mdx-qms.ts` instead of 8. The six
  `SET ${setFrags.join(', ')}` interpolations, built from fixed column maps, were still there. The type parameters
  were taken out and the baseline was not lowered. The scanner's pattern should admit `query<…>(` too; that gate
  belongs to the security lane.
