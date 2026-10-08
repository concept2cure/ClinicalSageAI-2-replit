# P-19: every program a client can open has its project record

Product decision P-19 (`docs/LAUNCH_DEFINITION_OF_DONE.md`). Row D2. QA browser walk of 2026-10-08.

## Finding

BX-256 and Vorelinib have no `projects` row (the "dossier anchor"). HLV-333 has row 11. For the two
unanchored programs, `GET /api/concept2cure/projects/:id/schedule-of-events` answers
`404 PROGRAM_UNANCHORED`. The Plan tab says "This program has no schedule record". AnA's project
context finds no project, and the Vault asks the administrator to link one.

## Reproduced: yes

- `01-repro-qa-db.txt`: read-only queries on `c2c_qa`. All 12 programs the seed wrote are
  unanchored. All 8 created through the wizard (`createdVia = v2-new-project-wizard`) are anchored.
  Organisation 1 has exactly one workspace, so intake's rule is unambiguous there.
- `03-qa-copy-after-deploy-migrate.txt` (first block): the real
  `resolveProgramProjectAnchor({strict:true})` on `c2c_qa` returns `null` for BX-256 and Vorelinib,
  and `11` for HLV-333.
- `browser/before-*.png`: the Plan tab on the running QA app (:5078). The schedule read returns 404,
  and the panel says "This program has no schedule record".

## Cause

| # | What | Where |
|---|---|---|
| 1 | The GA demo seed inserts `regulatory_programs` directly and never writes the anchor. It was added on 2026-07-16 (`5cb3596da`). The anchor arrived on 2026-08-14 (`0b38f7f1e`), which taught intake to write it and left the seed alone. BX-256, Vorelinib (BX-512), BX-099, BX-301 and BX-420 come from this seed. The device programs come from other `ga-demo.d` modules. | `scripts/seed/ga-demo.d/80-programs-tlf-pdev.mjs:266` |
| 2 | The anchor migration's backfill only links an existing `projects` row to a program by an unambiguous code or name match. It never creates a row. QA provisioning also runs the migration set *before* the seed (`provision.sh`: migrate, then `db:seed`), so the backfill ran while those programs did not exist yet. | `migrations/20260814_projects_regulatory_program_anchor.sql:160-183` |
| 3 | Intake had the same defect, though it did not reach QA. When `ensureProgramProjectAnchor` could not choose a workspace, it returned a skip (`PENDING_ANCHOR_COLUMN`, `NO_CLIENT_WORKSPACE`, `AMBIGUOUS_CLIENT_WORKSPACE`). The route still committed the program, unanchored, with a 201. | `HEAD:server/services/c2c/program-project-anchor.ts:139,188,212,220`; `HEAD:server/routes/c2c/projects.ts:881-888,994` |

So the program was not "created after the anchor existed by an intake that forgot it". Intake
anchors every program whose organisation's workspace is unambiguous (8 of 8 in QA). The QA programs
came from a creation path that is not intake. Intake's own gap (row 3) is a different way to reach
the same state, and every production organisation with several workspaces, none marked as its own,
can reach it.

## Fix

1. **Intake refuses instead of skipping.** `requireProgramProjectAnchor`
   (`server/services/c2c/program-project-anchor.ts:251-276`) wraps `ensureProgramProjectAnchor` and
   throws `ProgramAnchorUnavailableError` when there is no anchor. It runs inside the creation
   transaction (`server/routes/c2c/projects.ts:934`), so the rollback takes the program, its scaffold,
   its submission spine and its audit row with it. The catch (`projects.ts:1034`, helper
   `sendProjectRecordRefusal`) answers:
   - `409 PROJECT_RECORD_UNAVAILABLE` (reason `NO_CLIENT_WORKSPACE` or `AMBIGUOUS_CLIENT_WORKSPACE`),
     with a plain sentence and the correlation id;
   - `503 PENDING_STORE` for an absent anchor column, through the route's existing `pendingStore`.

   The detail goes to the log. Schema names never reach the screen. The 201 always carries
   `projectAnchorId`. The skip fields are gone, from the response and from the sealed audit payload.
   POST /api/c2c/projects is the only program-creation path in `server/`; nothing else inserts
   `regulatory_programs`.
2. **Backfill in the migration set.** The new file is
   `migrations/20261008_program_project_anchor_backfill.sql`. Its entry is `C2C_MIGRATION_FILES[359]`
   of 363 (`scripts/db/migration-set.mjs:3060`). That is directly after
   `20261006_document_data_dispositions.sql` and before the final steps: the uuid tenant isolation, the
   child-table parent scope, and the tenant sweep. It runs after 20260814 (column, plus its code/name
   link, which runs first), 20260923 (every organisation gets a workspace), 20260926b (the same-org
   key) and 20261001b (one anchor per program). It is `INSERT … SELECT … WHERE NOT EXISTS (any
   projects row naming the program) … ON CONFLICT DO NOTHING`. It creates no table and drops nothing
   (Rule 1).
3. **The seed path.** `scripts/seed-ga-demo.mjs` runs the same migration file in its own transaction,
   just before COMMIT. There is one statement and no second copy of its rules.
4. **Client.** The wizard's `meta.projectAnchorSkipped` branch could no longer fire and has been
   removed (`client/src/concept2cure/v2/surfaces/Projects.tsx`). The 409's message reaches the
   existing failure banner through `ApiRequestError`, like any other refusal.

### Column values the backfill writes (intake's, per `ensureProgramProjectAnchor`)

| column | value | source |
|---|---|---|
| organization_id | the program's | stated |
| client_workspace_id | the organisation's own workspace (`metadata.defaultForOrganization`, lowest id), otherwise its only workspace. **With none, or with several and none marked, no row is written**, and a NOTICE names the organisation. | intake's rule, restated |
| name, code | the program's, verbatim | stated |
| type | `'regulatory'` | intake's constant |
| status | `'active'` | intake's constant. Nothing ever mirrors program status into `projects.status` |
| priority | the program's; `'medium'` when it has none | stated, or the column's and intake's default |
| created_by_id, owner_id | the program's `created_by` when it is the integer form intake writes and that user exists; **otherwise NULL** | stated. Seeds wrote an e-mail, and these columns grant project ownership (`project-sharing-access.ts`), so they are not inferred |
| regulatory_program_id | the program | |
| parent_project_id, path | NULL | as intake writes them |

It never crosses organisations. The workspace is chosen only among the program's own organisation's
workspaces, and the same-org foreign key (20260926b) would refuse a mismatch. A program that only
*another* organisation's row names is left alone and named in a NOTICE (the 20261001b remedy
applies), so no program ends up with two anchor rows.

## Red, then green

| Test | Red (before) | Green (after) |
|---|---|---|
| `server/routes/c2c/__tests__/projects-create-anchor.pglite.test.ts` (new). The real route on PGlite: the program resolves strict to its row; the marked workspace is used; ambiguous or absent workspace is refused with nothing left behind; a failed anchor write rolls the program back. | 3 failed / 3 passed against HEAD's intake (`red/01`) | 6/6 (`green/01`) |
| `server/routes/c2c/__tests__/projects-create.test.ts`: two new refusal cases (absent column gives 503; ambiguous gives 409; both roll back with no audit row). The 10 success queues gained the anchor's statements. Before, the preflight read an empty mock row as "no column" and skipped. The "audit row cannot be written" case was really failing on the anchor preflight. | 2 failed / 24 passed with HEAD's two source files swapped in (`red/02`) | 26/26 |
| `tests/schema-contract/program-project-anchor-backfill.pglite.test.ts` (new). The anchor files in set order, replayed twice: BX-256-shaped row anchored and strict-resolvable; creator rule; marked or only workspace; no guess between several; legacy code link not duplicated; foreign anchor not doubled; tenant-correct; a second deploy is a no-op. | 8 failed / 2 passed with the statement absent (`red/03`) | 10/10 (`green/03`) |
| `tests/db/c2c-project-persistence.dbtest.ts`: real PostgreSQL, `RLS_ENFORCE=on` (see below) | 8 refused 409 with the original fixture (`red/04`). With the fixed fixture, 1 failed / 11 passed against HEAD's intake (`red/05`) | 12/12, and 12/12 on re-run (`green/04`) |
| `tests/golden-journeys/device-510k-estar.journey.test.ts` step 2: now expects the refusal and nothing written, where it used to expect "201 with anchor skipped" | failed on the new intake until updated | passes |
| Consolidated: 44 files covering intake, the anchor and every reader (`PROGRAM_UNANCHORED`, `resolveProgramProjectAnchor`, project-intake), the migration-set contract tests (tenant sweep, uuid isolation, apply path, deploy mechanism, constraint replay), the CER journey, the IND seed test, and the wizard and schedule client tests | (n/a) | **44 files, 817 tests** (`green/02`); `apply-c2c-migrations-manifest` 9/9 |

The first green attempt of the backfill test caught a deploy-breaking bug. PostgreSQL does not
guarantee that `created_by ~ '^[0-9]+$'` is evaluated before `created_by::integer` in a join
condition, so a seeded e-mail value raised 22P02. On every database holding seeded programs, that
would have failed every deploy. The cast now sits inside a CASE, and the file says why.

### The persistence dbtest (lead's report)

With the intake fix in place, `tests/db/c2c-project-persistence.dbtest.ts` failed 8 cases with **409**
(not 500): `NO_CLIENT_WORKSPACE`. Its fixture inserts an organisation directly, with no workspace.
No in-product path produces that shape: signup, setup and the boot seed all write the workspace in the
same transaction (`ensureOrganizationDefaultWorkspace`), and 20260923 repairs any other organisation
on every deploy. On HEAD the suite passed by creating unanchored programs, which is the P-19 defect.

The fixture now gives its organisation its workspace through that same writer. The writer's caller
list in `server/` is pinned (`organization-default-workspace.test.ts`), which is why intake does not
call it. The suite also gains two cases:

- the created program resolves strict to its row, in the organisation's own workspace;
- an organisation with two unmarked workspaces is refused 409, and nothing is written.

## deploy-migrate (Rule 1)

- `05-deploy-migrate-fresh2.txt`: `concept2cure-ri_qa_fresh2`, migrated with HEAD's set. Run 1
  anchored 8 programs, run 2 anchored 0, and both exited 0. Run 3 (runtime role identifiable)
  re-applied the grant ceiling. See the note there about the 3 grant failures that followed runs 1–2:
  they came from the invocation, not from this file, which grants nothing.
- `03-qa-copy-after-deploy-migrate.txt`: a `pg_dump` copy of `c2c_qa`. The shared QA database was
  not written. On run 1, 20260814 linked 1 legacy project by code (BX-204) and 20261008 anchored 11
  programs. Run 2 did 0 and 0. After it there are 0 unanchored programs, 0 rows crossing an
  organisation, and 0 programs with two anchors. BX-256 resolves to 19, Vorelinib to 23 and HLV-333
  to 11. From organisation 15, all three resolve to `null`.
- `06-seed-path.txt`: `npm run db:seed` on a second copy anchors all 12 seeded programs inside the
  seed's own transaction.

## Browser after-check

A private instance on :5081 (same environment as the :5078 launcher; port, origins and log changed),
pointed at the backfilled copy and signed in as raj.patel (manager). It was stopped afterwards.
`browser/after-results.json`, `browser/schedule-panel-text.txt`:

- BX-256 and Vorelinib: the schedule read returns **200**. The panel reads "No schedule generated"
  with the *Generate schedule* action, not "This program has no schedule record".
- A program created through the New Project wizard: **201**, `projectAnchorId: 25`,
  `projectAnchorCreated: true`. Its Plan tab: schedule read **200**, "No schedule generated".

The "before" pictures are the same pages, read-only, on the running :5078 instance over `c2c_qa`:
**404**, "This program has no schedule record".

## DB tier, gates, lint

- `08-db-tier.txt`: the full `vitest.db.config.ts` tier (150 files) on fresh2 after the migration, three times.
  No failure in any run touches projects, programs or the anchor. Run 1: 3 grant-ceiling failures, caused by the
  deploy-migrate invocation; they pass after run 3 re-applied the ceiling. Run 2: a shared-fixture collision in 2 files,
  which pass on re-run. Run 3: 16 user-administration 500s in 6 files that carry other fixers' in-flight edits
  (`tenant-users.ts`, `mdx-admin.ts`, `membership-change.ts`).
- `09-gates-lint-tsc.txt`: `ci:migration-set-order`, `ci:migration-drop-safety` (+ selftest),
  `ci:migration-deploy-path`, `ci:migration-reachability`, `db:sync-manifest:check` and the other
  pre-push gates pass. `ci:untracked-imports` fails on an untracked file from another change
  (`insights-canvas-routes.ts` imports `report-engine`). No changed file gained an ESLint warning.
  The scoped tsc shows no diagnostic in a changed file.

## Not verified

- Production data. How many live programs are unanchored, and how many organisations have several
  workspaces with none marked (which the backfill leaves, and intake now refuses), is unmeasured.
  Every deploy's NOTICE lines will report both, by organisation id.
- The shared `c2c_qa` database was not backfilled, by instruction. It still shows the defect until a
  deploy-migrate runs there.
- The :5078 QA instance does not run this server change.
- The whole repository test suite and a full tsc were not run.
