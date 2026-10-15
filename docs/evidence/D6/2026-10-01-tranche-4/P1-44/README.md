# P1-44 (DP-50, second half): a Report OS delivery says "sent" only when it was recorded

Row **D6**. Plan item P1-44 (`docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md`), finding DP-50. 21 CFR Part 11 §11.10(e). Date 2026-10-01, base `66e82a6d`.

## What was wrong

`POST /api/report-os/deliveries` with `platform_send` wrote the outbound letter through `persistCorrespondenceToPlatform` (`server/routes/report-os.ts`). That helper caught its own error, probed for the tables first and returned `persisted: false` when either step failed. The route then answered **201 with status `'sent'` whatever had happened**. It wrote no chained audit row. The letter, the delivery record and the learning memory were three separate statements on the pool, so a failure partway through left some of them behind.

The same test run turned up three more defects in this path:

- **A delivery with no project was answered and stored nowhere.** A run scoped to a submission, with no project in its lineage and none in the body, skipped the letter. `persistDeliveryRecord` then returned early, and the route still answered 201 `'sent'`.
- **A long delivery could not be listed.** The record was stored as `JSON.stringify(...).slice(0, 20000)`. A message at the schema's own 20,000-character limit cut the JSON, so `loadDeliveriesForOrg` could not parse it, and `GET /deliveries` silently left out a delivery it had answered 201.
- **The helper's other caller had the same defect.** `POST /correspondence/capture` answered 201 (`persistedToPlatform: false`) for a letter that was refused, and still wrote a learning memory describing it.

Reproduced against the real database (PostgreSQL 16, `app_service`, `RLS_ENFORCE=on`). A trigger refused the letter. The API answered `201 {"status":"sent"}` with no `correspondenceId` (`red/02-dbtest-before.txt`).

## What is true now

`POST /deliveries` resolves and checks its target first, before anything is written:

1. **Run and bundle.** The run or bundle must be this org's, or the answer is 404. A bundle's runs are read now, not taken from the bundle's snapshot.
2. **Project.** The project comes from the body, then the run's scope, then the bundle's first run. None gives **422**: "has nowhere to be recorded". A project that is not this org's gives 404.
3. **Submission.** For `platform_send`, the submission must be in that project, or the answer is 404.
4. **E-signature.** The rule in `services/report-os/scheduling/delivery.ts` (`decideDelivery`) is applied to every report carried. See the next section.

Then `recordDelivery` makes all the writes on **one tenant-stamped transaction** (`inTenantTransaction`):

1. For `platform_send`: the letter and its issues (`writeCorrespondence`, which throws instead of swallowing).
2. The delivery record, stored whole.
3. The learning memory, when asked for. It is written through drizzle bound to the same connection (`onTransaction`).
4. The chained row through `writeReportEvent`:
   - `report_os.delivery_sent` for `platform_send`;
   - `report_os.delivery_exported` for `external_pdf_export`.

   The row's resource is `report_delivery:<deliveryId>`. Its details carry the `correspondenceId`, subject, channel and recipient count; the recipients themselves stay in the record.

`'sent'` is answered only after COMMIT. If any of these writes is refused, everything rolls back and the answer is **503 `REPORT_DELIVERY_NOT_RECORDED`**: "could not be recorded with its audit trail, so it was not sent. Nothing was recorded." The body has no `data` and no error text; the reason goes to the log.

`persistCorrespondenceToPlatform` and its `isTableReady` probe are deleted. `POST /correspondence/capture` now writes its letter, issues and learning memory on one transaction. A refused write is **503 `CORRESPONDENCE_NOT_RECORDED`**, with no memory written. A capture with no submission behaves as before: the memory alone, with `persistedToPlatform: false`.

### The e-signature rule: what leaves the platform

Neither channel of `POST /deliveries` transmits anything:

- **`platform_send`** writes an outbound `c2c_correspondence` row inside the platform. Nothing reads outbound rows to send them anywhere: there is no drizzle table for it, and its only other readers are `regulatory-correspondence.ts`, `c2c/actions.ts` and `submission-ops.ts`, which read issues.
- **`external_pdf_export`** writes only a record saying that a report went to outside recipients.
- **The scheduled sweep** (`scheduling/worker-register.ts`) computes and logs. It has no transport.

The bytes that do leave are `GET /runs/:id/export.pdf` and `GET /bundles/:id/export.pdf`. Each is a download by the signed-in user, recorded on the chain with the SHA-256 of the exact bytes before they are sent (DP-50, first half).

The external channel enforces the helper's rule: **a final report delivered on `external_pdf_export` requires an e-signature.** "Final" means the run, or any run in the bundle as it stands now. A report run cannot be e-signed today:

- `POST /api/esignature/sign` signs document versions only.
- The governed sign (`/api/c2c/actions/sign`, `deriveGovernedTargetBinding`) has no `report-run:` target.

So the requirement cannot be met, and the route refuses with **409 `E_SIGNATURE_REQUIRED`** and records nothing. It does not record an unsigned external delivery of a final report. `platform_send` of a final report is allowed: the helper's platform channel has no signature gate.

**Why the PDF download is not gated:** gating it on a signature that cannot exist would remove the finalize → export flow in `client/src/concept2cure/v2/surfaces/Insights.tsx` (lines 965–1025), with no replacement. That is a product decision, not a fix. The download stays recorded with its hash.

## Red / green

Unit test: `server/routes/__tests__/report-os-delivery-recording.test.ts`, 13 cases.

- **Real:** the router, drizzle, and `decideDelivery`.
- **Replaced:** the db facade, the pool, auth and the audit writer.
- **Recorded:** the checked-out connection logs every statement in order.

| Case | Red (HEAD route) | Green |
|---|---|---|
| platform_send: letter, record and `report_os.delivery_sent` on one transaction, then 'sent' | no transaction, no chain row | pass |
| **refused letter → 503, no chain row, no record** | **201 'sent'** | pass |
| refused delivery record → 503, letter rolled back | 500 | pass |
| refused chain row → 503, letter and record rolled back | 201 'sent' | pass |
| learning memory inside the same transaction | written on the pool | pass |
| 20,000-character message: record stored whole, parseable | `SyntaxError: Unterminated string in JSON` | pass |
| no project → 422, nothing written | 201 'sent', stored nowhere | pass |
| final report on platform_send → 201 (no signature gate in-platform) | pass (control) | pass |
| external_pdf_export → 'exported' + `report_os.delivery_exported` on one transaction | no chain row | pass |
| external_pdf_export of a final run → 409 `E_SIGNATURE_REQUIRED`, nothing written | 201 | pass |
| bundle with a run final now → 409 | 201 | pass |
| capture: letter, issues and memory on one transaction | written on the pool | pass |
| capture: refused letter → 503 `CORRESPONDENCE_NOT_RECORDED`, no memory | 201 | pass |

Database test: `tests/db/report-os-delivery-recording.dbtest.ts`, 4 cases. It runs on the shared two-tenant fixture as `app_service` under RLS. A refused write is a real `BEFORE INSERT` trigger, scoped to this run's subject or this tenant's chain action, and dropped in `finally`.

| Case | Red (HEAD route) | Green |
|---|---|---|
| platform_send: letter (`outbound`/`responded`), record and one chained `report_os.delivery_sent` row | 201, **0 chain rows** | pass |
| letter refused by the database → 503, nothing left behind | **201 'sent'**, no `correspondenceId` | pass |
| chain row refused → 503, letter and record rolled back | 201 'sent' | pass |
| external_pdf_export of a final run → 409, nothing recorded | 201 'exported' | pass |

The sibling suites still pass:

- Unit: `report-os-audit-recording`, `report-os-insights.contract`, `report-os-portfolio-empty`, `insights-canvas-portfolio-unavailable` and `scheduling` (50/50).
- Database: `report-os-tenant-from-session` and `report-os-registry-seed` (22/22). These include the existing "own run delivery → 201" and "capture → `persistedToPlatform: true`" cases, now on the transactional path under RLS.

Fixture cleanup was checked after each database run: 0 correspondence rows for the fixture orgs, 0 `report_os.*` audit rows for the fixture tenant, 0 `p144%` triggers.

## Files

- `red/01-unit-before.txt`: the 12 original cases against the unchanged route (11 fail).
- `red/03-unit-before-with-record-case.txt`: all 13 cases against a temporary copy of HEAD's route (12 fail). The copy was deleted after the run.
- `red/02-dbtest-before.txt`: the database test against the unchanged route (4 fail).
- `red/04-eslint-report-os-at-head.txt`: ESLint on HEAD's route, 10 warnings.
- `green/01-unit-after.txt`: 13/13.
- `green/02-neighbour-unit-suites.txt`: 50/50.
- `green/03-dbtest-after.txt`: 4/4.
- `green/04-neighbour-dbtests.txt`: 22/22.
- `green/05-eslint-after.txt`: 8 warnings, all present at HEAD. The deliveries handler's warnings (113 lines, complexity 32) are gone, and the new code adds none.
- `green/06-gates.txt`:
  - `ci:server-error-leaks`, `ci:empty-state-honesty` and `ci:drizzle-tenant-scope` pass.
  - `ci:discarded-audit-write`, `ci:dead-audit-catch` and `ci:fabricated-identity` crash with `ENOENT server/routes/qms.ts`. That is another lane's uncommitted deletion of that file, not this change.

## Commands

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run server/routes/__tests__/report-os-delivery-recording.test.ts
TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable' \
APP_DATABASE_URL='postgresql://app_service:local-testdb-app-service-password@127.0.0.1:5432/c2c_testdb?sslmode=disable' \
RLS_ENFORCE=on NODE_OPTIONS=--max-old-space-size=3072 \
  npx vitest run --config vitest.db.config.ts tests/db/report-os-delivery-recording.dbtest.ts
npx eslint server/routes/report-os.ts server/routes/__tests__/report-os-delivery-recording.test.ts tests/db/report-os-delivery-recording.dbtest.ts
```

## Residuals

- **No report-run signing ceremony.** A final report cannot be delivered on the external channel until one exists. That needs a `report-run:<id>` target bound to the seal's `contentHash` through the canonical sign ceremony, and a `signatureId` accepted and verified on `external_pdf_export`. Proposed as a new plan row.
- **`persistOutboundCorrespondenceRecord`** (`server/routes/regulatory-correspondence.ts:224`) is exported, has no callers, and is a second outbound-letter writer. It is non-transactional and swallows its learning write. It should be deleted (zero duplication). That file is not this item's.
- **`POST /correspondence/capture` duplicates the canonical intake** in `regulatory-correspondence.ts`. The canonical intake has the governed parser, impact, tasks, timeline and an audit row; this route has a keyword matcher and no audit row. It should be migrated onto the canonical intake and deleted, but the intake is a route handler, not a helper, so that needs a change in a file this item does not own.
- **`persistBundleRecord`** has the same `.slice(0, 20000)` cut. A bundle whose record passes 20,000 characters (some dozens of runs, at roughly 300 characters per item) is stored as unparseable JSON and disappears from `GET /bundles`. It was not changed here, because that is the bundle half's path.
