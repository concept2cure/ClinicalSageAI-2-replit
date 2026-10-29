# P-50: deviations are their own record in Quality (server half)

Row: D2 (launch catalog: QMS). Decision: P-50 in `docs/LAUNCH_DEFINITION_OF_DONE.md`, under the founder's delegation
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
