# HT-01 — a seeded organisation can create a program

Launch row **D2** (a new organisation gets a working launch catalog), workstream
**W1**. Found 2026-10-18 by the market-readiness smoke at `aa4ee1e29`
(`docs/evidence/reviews/2026-10-13-market-readiness/smoke-at-head.md`); fixed and
proved here on `concept2cure-v2` at `d0cde23b9` plus this change.

## The defect

`docs/LOCAL_TESTING.md` has every tester run `db:provision` and then
`scripts/seed-admin.mjs`. Provisioning runs the repair sweep
`migrations/20260923_organization_default_client_workspace.sql` while the
database has no organisations; `seed-admin.mjs` then writes one in raw SQL and
reaches no application code, so it never met `ensureOrganizationDefaultWorkspace`.
The organisation had no client workspace, and every "create program" was
refused with `PROJECT_RECORD_UNAVAILABLE / NO_CLIENT_WORKSPACE` until some later
`deploy-migrate` ran the sweep again. Journey 1 of human testing stopped at its
first write. `scripts/seed-founder.mjs` had the same gap.

Real tenants were never affected. Signup, first-run setup and the boot seed all
call the canonical writer, and every deploy repairs existing organisations.

## The change

- `scripts/seed/organization-workspace.mjs`: `ensureOrganizationWorkspace(db, orgId)`
  **executes the repair migration file itself** (one simple-protocol query, so
  its INSERT and its row-count assertion commit or fail together). It then
  returns the organisation's workspace id, preferring the row marked
  `defaultForOrganization`, which is the same preference as
  `ensureProgramProjectAnchor`. It does not restate the rule (only where an
  organisation has none, marked as its own) as a second INSERT.
- `scripts/seed-admin.mjs` and `scripts/seed-founder.mjs` call it after writing
  the membership.
- **Zero duplication.** `scripts/seed-ga-demo.mjs` and five demo parts
  (`ga-demo.d/60`, `70`, `80`, `94`, `105`) each carried their own
  `INSERT INTO client_workspaces`. The main seeder's INSERT was unconditional:
  it added an unmarked "Default Workspace" beside whatever the organisation
  already had. All six now call the helper. A test pins that no seed script
  INSERTs a workspace of its own.

## Proof — made to fail first

| Check | Before (trunk scripts) | After |
|---|---|---|
| `tests/seed/seeded-organisation-gets-its-workspace.test.ts` (scripts run as written against PGlite carrying the real migration) | **8 failed**, 41 passed: seed-admin and seed-founder leave `[]` workspaces, and six scripts INSERT their own ([unit-before-fix.txt](unit-before-fix.txt)) | 88 of 88 in `tests/seed/` ([unit-after-fix.txt](unit-after-fix.txt)) |
| Fresh PostgreSQL 16 + pgvector, `db:provision` (408/408 migrations), sign in, `POST /api/c2c/projects` on the running app as `app_service` with `RLS_ENFORCE=on` | **409** `NO_CLIENT_WORKSPACE`; 0 workspaces | **201**, program created and anchored; 1 workspace, marked as the organisation's own ([fresh-database-red-green.txt](fresh-database-red-green.txt), script [fresh-database-red-green.sh](fresh-database-red-green.sh)) |
| Re-run `seed-admin.mjs` as the runtime role (`scripts/dev/up.mjs` seeds as `app_service`) | — | no-op; still 1 workspace |
| `node scripts/seed-ga-demo.mjs` on the same database | — | exit 0; reuses workspace 1, adds none; 41 domain modules seeded. The 2 skipped are unchanged by this work (`50-postmarket.mjs` references an undestructured `admin` on trunk; `124` is a schema gap). |

The existing `tests/seed/seed-admin-provisions-but-never-resets-off-machine.test.ts`
gained the `client_workspaces` table and pg's simple-protocol path in its PGlite
mock. Its assertions are unchanged.

Gates run before push: `ci:sql-interpolation`, `ci:runtime-ddl`,
`ci:fixture-fallback`, `ci:fabricated-identity`, `ci:discarded-audit-write`,
`ci:no-mock-in-prod-routes`, `ci:server-error-leaks`,
`ci:session-scoped-rls-bypass`, `ci:migration-drop-safety`,
`ci:migration-set-order`, `ci:migration-deploy-path`, `db:sync-manifest:check`.
All pass. No migration was added or edited (CLAUDE.md Rule 1).
