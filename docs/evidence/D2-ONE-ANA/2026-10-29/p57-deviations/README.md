# P-57: deviations are their own record in Quality

Row: D2 (launch catalog: QMS). Decision: P-57 in `docs/LAUNCH_DEFINITION_OF_DONE.md`, under the founder's delegation
of 2026-10-29. Slice G16 of `docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md`.

## What already exists

| Piece | Path | What it did before this change | What it did not do |
|---|---|---|---|
| Deviation definition | `qcDeviations`, `shared/schema/qc-schemas.ts` | A rich definition: classification, category, impact, investigation, root cause, CAPA fields, status and approvals. | No migration created the table, so it never existed on any database. `client_workspace_id` was NOT NULL, a CRO workspace key that Quality records do not have. |
| QC deviation routes | `server/routes/qc.routes.ts` (`/api/qc/deviations`, `/:id`, `PUT`, `/impact-assessment`, `/capa`, `/trending`) | Mounted (`register-clinical-intel-routes.ts`). No client caller. | Over `server/storage.ts`, whose in-memory implementation answered 501 or empty, and whose database implementation queried a table that did not exist. |
| Nonconformance register | `qms_nonconforming_products`, `server/routes/mdx-qms-records.ts` | Product- and lot-keyed nonconformances. | Cannot hold a deviation with no product, such as an environmental-monitoring excursion. |
| Classifier | `classify_gmp_deviation`, `server/services/ana/gmpQualitySystemsTools.ts` | A deterministic triage of stated inputs. | Records nothing. Untouched here. |
| CAPA, reminders, signing | `raiseCapaFrom` (`qmsCapaRegister.tsx`); `replaceSourceTask` (`server/services/tasking/source-task.ts`); `signGovernedAct` (`governed-signed-act.ts`) | The shared pieces the other Quality records use. | — |

Searches run:
- `deviation` in `server/routes`, `server/services`, `server/storage.ts`, `shared/schema`, `client/src/concept2cure`;
- `qc_deviations|qms_deviations|gmp_deviation` across `migrations/`, `server/`, `shared/`, `client/src/`;
- `getQcDeviations|createQcDeviation|updateQcDeviation|linkCapaToDeviation|getDeviationTrending|performImpactAssessment`
  outside `server/storage.ts`, where only `qc.routes.ts` called them.

## What changed

- **`migrations/20261029g_qc_deviations.sql`** creates `qc_deviations` as the definition reads, with
  `client_workspace_id` nullable and no foreign key. It is in `C2C_MIGRATION_FILES` before the final sweep pair, and
  public with `organization_id INTEGER NOT NULL`. The Drizzle definition matches.
- **`shared/constants/deviation-lifecycle.ts`**: open, then under investigation, then pending approval, which can send
  it back to investigation. `closed` is reached only by the signed close. The classes, types and categories are listed
  here too.
- **`server/services/qms/deviations.ts`**:
  - recording is open, once per number in an organisation; a second is 409;
  - every move is checked against the map and guarded on the status it was read in;
  - a deviation goes for approval only with its root cause and resolution;
  - the close runs on the signing transaction, only from pending approval with both recorded, and dates and names
    itself.
- **`server/routes/mdx-qms-deviations.ts`**, mounted by `mdx-qms.ts`: `GET`, `POST` and `PATCH` under
  `/api/mdx/qms/deviations`, each write with its audit row, and `POST /:id/close` through `signGovernedAct` with
  approval or responsibility.
- **Reminders.** A deviation's target closure date is a task (`deviationTaskPlan`, `qms-record-tasks.ts`):
  - 7 days' notice;
  - critical deviations critical, major high;
  - the task is completed by the close.
- **Deleted:** the `/api/qc/deviations` routes and both storage implementations. With the table now created, they
  would have been a second writer.
  - Replacement by path: `/api/mdx/qms/deviations` (`server/routes/mdx-qms-deviations.ts`), proven by the tests below.
  - The screen comes in the client half.

## Proof

- **`server/services/qms/__tests__/deviations.pglite.test.ts`** passes 3 of 3, against PostgreSQL in process with the
  set's own migration:
  - recorded open, once per number in an organisation;
  - moves only along the map;
  - for approval only with root cause and resolution;
  - another organisation's record not found;
  - closes only from pending approval, dated and named, never twice, and is not edited after.
  - **Shown failing first:** without the close's pending-approval guard, the close case fails.
- **`qms-signed-decisions.test.ts`**:
  - the close commits in the order BEGIN, the update, the `sign` ledger entry, the signature, COMMIT;
  - without a signature, 400;
  - before pending approval, 409 `DEVIATION_NOT_READY`, and nothing is signed.
- **`qms-governed-writes-audited.test.ts`**: recording a deviation writes `mdx.qms.deviation.create`.
- **Gates:**
  - `ci:migration-set-order` and `ci:migration-drop-safety` pass (442 migrations);
  - `ci:sql-interpolation` passes with `server/services/qms/deviations.ts: 1` baselined, the `SET` list from a fixed
    column map;
  - the warning ratchet reports net -4, from the deleted storage code;
  - `tsc --noEmit` reports no error.

## Client half: the Deviations tab

- **What already existed.**
  - The Quality register kit (`qmsRegisterKit.tsx`, `QmsRecords.tsx`) and its signing row action (`sign`, used by
    disposition and supplier approval).
  - `raiseCapaFrom` and the CAPA column (`capaSources.ts`).
  - Change control's "deviation" link, which picked from the nonconformance register (`ChangeLinkForm.tsx`), because
    there was no deviation register.
  - `capa_records.capa_source_chk` (`migrations/20260504_capa_mdr.sql`) and `CAPA_SOURCES`
    (`shared/schema/capa-mdr.ts`), with no `deviation`. AnA's CAPA tools kept their own copy of that list
    (`server/services/ana/capaMdrTools.ts`).
- **What changed.**
  - **Quality has a Deviations tab** (`qmsDeviationRegister.tsx`):
    - the register shows number, what happened, class, status, detected and target close;
    - counts of open, critical open and past target close;
    - "Record deviation";
    - "Investigate": immediate action, impact, root cause, resolution, target close, and only the status moves in
      `DEVIATION_TRANSITIONS`;
    - "Close", only when pending approval, signed through the shared `EsignModal` with approval or responsibility;
    - "Raise CAPA", as `source: 'deviation'`, with the deviation as its `sourceRefs` entry (`qc_deviation`);
    - its CAPA column, and AnA's register context.
  - **AnA's `quality.open-tab`** takes `deviations`.
  - **Change control's "deviation" link** picks from the deviation register.
  - **A CAPA may be raised from a deviation.** `migrations/20261029h_capa_source_deviation.sql` widens
    `capa_source_chk`, replacing it only while its definition lacks `deviation`, so a replay changes nothing.
    `CAPA_SOURCES` gains `deviation`, and AnA's CAPA tools import the shared list instead of a copy.
- **Proof.**
  - `QmsRecords.test.tsx`: under investigation, the only move offered is pending approval, and there is no Close. The
    investigation sends `PATCH …/deviations/5` with the status, root cause and resolution. Once pending approval,
    Close opens "Close deviation" with approval and responsibility, nothing is sent until the signature, and the
    signature sends `POST …/deviations/5/close`.
  - `ChangeLinkForm.test.tsx` passes 3 of 3: a deviation is picked from `/api/mdx/qms/deviations` with its number and
    title, and a failed read says "deviation register could not be read".
  - `server/services/capa-mdr/__tests__/capa-source-deviation.pglite.test.ts` passes 2 of 2: a deviation source is
    refused before the migration, admitted after it, and an unknown source is still refused. A replay leaves the
    constraint's definition and oid unchanged.
  - **Shown failing first:** offering every status instead of the lifecycle's moves fails the screen case, and so
    does offering Close before pending approval.
  - The Quality client suite, the CAPA services, the QMS and CAPA route tests, and the navigation and CAPA-tool tests
    pass 714 of 714 (65 files).
  - `ci:migration-set-order`, `ci:migration-drop-safety` (444 migrations), the warning ratchet and
    `ci:launch-scope-api` pass, and `tsc --noEmit` reports no error.

## The close is independent of the investigation (2026-10-29)

Before this change, the person who completed an investigation could sign its close. GMP expects the approval of a
deviation's investigation to be independent of it (21 CFR 211.192; ICH Q10 §2.6).

- **The investigation now has an author.** Sending a deviation for approval records who did it:
  `investigation_details = {completedBy, completedAt}`. `updateDeviation` takes the actor, and the PATCH route refuses
  a request without a user (401).
- **The close refuses that person.**
  - `closeDeviation` adds `completedBy <> signer` to its guarded UPDATE.
  - When the guard is what refused, the route answers `DEVIATION_SELF_CLOSE` (403, "another person signs its close";
    nothing is signed).
  - A deviation sent back and resubmitted records the latest sender.
- **The Close form says so** before the password is asked for.
- **Proof.**
  - `deviations.pglite.test.ts`: "is not closed by the person who sent it for approval". User 9 sends it, user 9's close
    is refused, and user 8's close succeeds.
  - Mutation: deleting the `completedBy` guard line fails that case, and only that case. Restoring the line makes it
    pass.
  - `qms-signed-decisions.test.ts`, `qms-governed-writes-audited.test.ts` and `QmsRecords.test.tsx` pass.

## Cancelling a deviation recorded in error (2026-10-29)

A deviation recorded in error, such as a duplicate or an event that was not a departure, is cancelled. It is never
deleted.

- **`cancelled` is a lifecycle end.** It joins `closed` in `DEVIATION_STATUSES` and `DEVIATION_ENDED`, and it has no
  moves. A status PATCH to it is refused, like one to `closed`, and a cancelled deviation is not changed.
- **`POST /qms/deviations/:id/cancel`** is a signed decision (`approval` or `responsibility`), through
  `signGovernedAct`.
  - `cancelDeviation` stores the signer's reason, who and when in `metadata.cancelled`, from any status that has not
    ended.
  - The person who recorded the deviation (`detected_by`) does not sign its cancellation (`DEVIATION_SELF_CANCEL`, 403),
    so no one voids their own record.
  - The task plan closes the deviation's reminder as cancelled.
- **The register.**
  - A "Cancel deviation" row action states both rules before the signing step.
  - The row shows "(cancelled: reason)".
  - The Open KPI counts cancelled deviations apart from closed ones, and the AnA facts carry the reason.
  - Raise CAPA is not offered on a cancelled deviation.
- **Proof.**
  - `deviations.pglite.test.ts`: "is cancelled with its reason by someone other than its recorder…".
    - The recorder is refused, and another tenant gets 404.
    - Someone else cancels, and the reason is stored.
    - A second cancel, a close, an edit, and a PATCH to `cancelled` are each refused.
  - Mutation: deleting the `detected_by` guard fails that case, and only that case. Restoring it makes it pass.

## Not built: a project key on a deviation

Nonconformances gained a project key in 20261029d because the project's Engineering screen reads them by project. No
project surface reads deviations: a GMP deviation belongs to a site, process or batch, and the record carries the
batch and product. A key that nothing reads is not added. It is added with the first project surface that lists a
project's deviations.

