# C-3: the report-pack register gets its own tables (L1, founder decision P-91)

**Row:** D2 (the launch catalog's Reporting & analytics). **Package:** `Plan: L1`. **Session:** the reporting session
(`session_011HLkYC…`, lane L11). **Date:** 2026-11-08. **Decision:** P-91 in `docs/LAUNCH_DEFINITION_OF_DONE.md`, with
three `approvedAdditions` table entries in `docs/design/one-design-plan.json`. **The question:**
`docs/evidence/reviews/2026-10-11-reporting-coverage/C3-BUNDLE-REGISTER.md`, "Still open: the table".

## What already exists (RULE 3)

Searches run: `persistBundleRecord`, `loadBundleRegister`, `loadBundlesForOrg`, `loadBundleById`, `bundleRecordWhere`,
`REPORT_OS_BUNDLE_SUBCATEGORY`, `report_bundle_record`, `bundle:${` and `bundleRecord` across `server/`, `tests/` and
`client/src/`, plus `report_bundles` in `migrations/`, `db/migrations/` and `shared/schema*` (no table existed).

| Piece | Path | What it did |
|---|---|---|
| The writer | `server/routes/report-os.ts` `persistBundleRecord` | Wrote the pack's manifest, `{"bundleRecord": …}`, as one `project_memory_entries` row per covered project, titled `bundle:<uuid>`, in one tenant transaction with its chained audit event. |
| The register | `loadBundleRows` and `loadBundleRegister` | Paged memory rows, newest first, decoded each, skipped the older copies of a pack in JavaScript, admitted each pack by project access, and stated a lower bound when truncated. |
| Exact-id readers | `loadBundlesForOrg` and `loadBundleById` | The same rows filtered by title, de-duplicated by `dedupeByLatest`. Every export path reads through these: the PDF, the report pack (`export.pdf`, `export.zip`), reservations and admission. |
| Health | `GET /api/report-os/health` `bundles` | `count(*)` of memory rows: copies, not packs. |
| The screen | `client/src/concept2cure/v2/surfaces/InsightsBundlesPanel.tsx` | Reads `GET /bundles`. Its response shape is unchanged, so it is untouched. |

## What changed

- **`migrations/20261108_report_bundle_register.sql`**, in `C2C_MIGRATION_FILES` before the isolation tail.
  - `public.report_bundles`: one row per pack. The manifest is kept whole as `record jsonb`, and a CHECK ties its
    `bundleId` and `organizationId` to the row.
  - `public.report_bundle_runs` and `public.report_bundle_projects`: one row per run or project.
  - All three are `organization_id INTEGER NOT NULL`, `IF NOT EXISTS`-guarded, with no DROP. The sweep at the end of
    the set gives them their policy.
  - The backfill carries each legacy pack once, from its newest copy, `ON CONFLICT DO NOTHING`. A corrupt copy is
    skipped with a NOTICE. A row-count assertion fails the deploy when a pack was neither carried nor reported as
    skipped. The legacy memory rows stay where they are.
- **`shared/schema/report-os.ts`**: the three Drizzle definitions.
- **`server/routes/report-os.ts`**:
  - The writer inserts the pack, its runs and its projects in the same tenant transaction as its audit event. The
    size limit, hash and outcome receipts are unchanged.
  - The register and the exact-id readers read the tables. An id that is not a GUID is answered as absent rather
    than sent to a uuid column.
  - Health counts packs.
  - The memory path is deleted with its sub-category constant.
- **Tests:** a new deploy-path test (PGlite), six route suites moved to the tables, and the real-PostgreSQL report-pack
  test seeding through the register.

## Red first (`red/`)

| File | What it shows |
|---|---|
| (this session) | Before the file existed, the new deploy-path test failed 5 of 5, including "the report-pack register is on no deploy path: expected -1 to be greater than -1". |
| `deploy-path-test-without-the-migration-file.txt` | With the set entry present but the file missing, the four behaviour cases fail (ENOENT). |
| `route-suites-against-the-old-memory-route.txt` | The rewritten bundle-recording suite and the health count, run against the old route: 14 of 23 fail. Health reads `"bundles": 2` for organisation 7's one pack, its two memory copies. |
| `migration-set-order-file-after-the-sweep.txt` | The file placed after the tenant sweep: `ci:migration-set-order` refuses it ("will never be swept"). |
| `migration-drop-safety-drop-table-after-creator.txt` | A later `DROP TABLE public.report_bundle_projects`: `ci:migration-drop-safety` refuses it ("re-adds and re-drops it on every deploy"). |
| (this session) | The RLS case without the sweep: organisation 7 reads both packs (`expected [ …(2) ] to deeply equal [ Array(1) ]`). The isolation is the set's own sweep. |

## Green (`green/`)

| File | What it shows |
|---|---|
| `deploy-path-test.txt` | 5 of 5 pass. In the set, ahead of the tail. Two deploys over legacy rows carry each pack once, from its newest copy, with runs in order and projects, and the manifest whole. A corrupt copy is skipped, not fatal. The legacy rows remain. A manifest naming another pack or organisation is refused. A silently uncarried pack fails the deploy. Under the real sweep a NOSUPERUSER / NOBYPASSRLS role reads and writes only its own organisation's rows, in all three tables. |
| `migration-gates.txt` | `ci:migration-set-order` and `ci:migration-drop-safety` pass with the file in place. |
| `blank-database-provision-and-replay.txt` | A blank database through `install-fresh` and `deploy-migrate`, the CI provisioning pair, then `deploy-migrate` again. The file applies both times, and all three tables have RLS enabled and forced, each with its `tenant_isolation_policy`. |
| `real-postgres-report-pack-export-dbtest.txt` | `tests/db/report-pack-export.dbtest.ts`, 8 of 8, on that database as `app_service` (no superuser, no RLS bypass, enforcement on). The pack is created through `POST /bundles` into the new tables, then exported, refused and reserved through the readers that now read them. |
| `report-os-suites.txt` | All 90 report-os route and service files and the new test: 1,115 of 1,116 pass. The one failure is below. |

A full `tsc --noEmit` reports 0 errors. `ci:eslint-warning-ratchet` reports no file changed its warning count.

## What this does not do

- **The legacy memory rows are not deleted.** RULE 1: nothing here drops data. Nothing reads them any more, and the
  deploy carries any written before this lands.
- **The Bundles screen was not walked in the running app.** Its response is the same shape, and its suites are
  unchanged and pass. The real-PostgreSQL test creates and exports a pack end to end.
- **Not this change's:** `server/services/report-os/canvas/__tests__/suggestion-service.test.ts`, "does not suggest
  regional, prediction or assurance types with no implemented engine", fails identically with every change here
  stashed. Its last change predates this work (`dfb3fd3681`, 2026-10-15). It is handed to the lane that owns the
  canvas suggestions.
