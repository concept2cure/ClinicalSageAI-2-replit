# WO-15 — schema the code expects that no deploy path creates

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN · **Found by:** WO-1 stage 2, against a live database
**Relates to:** WO-2 (blank-database completeness), WO-3 (tenant isolation), ledger C-29

---

## Why this is separate from WO-1 and WO-2

WO-1 removes duplicate definitions. WO-2 asks whether a **blank** database
provisions what the server queries. Neither covers the eight findings below,
which share one shape:

> the code names a table or column, the provisioning path that reaches a
> **populated** database does not create it, and every gate is green.

All five were found while archiving dead migrations, by querying a real
PostgreSQL built by `scripts/db/provision-test-db.sh` (install-fresh +
deploy-migrate, 1,228 tables). None is visible from the repository alone.

**The constraint that makes these dangerous** is the one WO-1 keeps
rediscovering: `deploy-migrate.mjs` — the ordered `C2C_MIGRATION_FILES` set — is
the **only automated path that touches a database with data in it**.
`install-fresh` (drizzle push, the `migrations/` overlay, the `*_gcc_*` tree)
runs on fresh installs only. So a table created solely by install-fresh exists
on a developer's laptop and on CI, and may exist on no production database at
all — and `CREATE TABLE IF NOT EXISTS` never repairs a shape that is already
wrong.

---

## Finding 1 — CONFIRMED and FIXED 2026-09-18

> **FIXED by `f52b4fe1`** — "deploy-migrate refuses to declare success when the
> governed-content tree never ran". Correction 1 named the closing move as *"a
> `deploy-migrate` preflight assertion"*, and that is what landed: the readiness
> contract now carries three governed-content sentinels. Re-reproduced today with
> the same PATH shim, and the deploy no longer blesses the database:
>
> ```
> ▶ 1/5 Preflight — database already provisioned?
>   ✓ base schema present (organizations, users, c2c_documents, regulatory_programs)
> ▶ 5/5 Verify readiness contract
>   governed-content tree: 0/3 sentinel(s) present
> ❌ Deploy migration failed: the governed-content tree (db/migrations/*_gcc_*.sql)
>    did not run on this database — missing: identity.organizations,
>    core.program_ownerships, core.programs.org_id.          ← exit 1
> ```
>
> **AND IT CORRECTS THE REPRODUCTION BELOW.** The section states that with `psql`
> hidden `core.programs` "is then the 7-column shape from `044b`", and quotes
> `42703: column "org_id" does not exist`. On a database built that way today the
> `core` SCHEMA does not exist at all and neither does the table — `044b` and
> `000_gcc_bootstrap_core` are themselves `*_gcc_*` files, so nothing creates it
> when the tree is skipped, and the authorization query fails 42P01, not 42703.
> The 7-column state is reachable only where the tree ran once and `069` did not.
> That does not weaken the finding — an absent table is worse than a narrow one —
> but the quoted error is not what a psql-less install produces.

### Original finding, as written

## Finding 1 — a missing `psql` leaves `core.programs` cross-tenant readable, and the deploy says it is fine

**Severity: highest here.** Rewritten 2026-09-10 after a full reproduction. Three
claims in the first draft were wrong, and the two worst consequences were
missing. Corrections are marked ⚠ below rather than deleted, because the wrong
version is quoted in `scripts/ci/duplicate-table-ddl-baseline.json` and in the
first draft of this file.

### Reproduced end to end

Not argued — run. `install-fresh.mjs` with `psql` hidden behind a PATH shim, then
the real `deploy-migrate.mjs`:

```
▶ 8/8 Verify                       (install-fresh)
  tables (public): 777 · RLS policies: 636 · core route tables: 5/5
⚠️  Install finished with 1 incomplete area(s):
   • governed content (Part 11 audit): psql unavailable; 43 *_gcc_* file(s) not applied
❌ Install INCOMPLETE — not reporting success.        ← exit 1

▶ 1/5 Preflight — database already provisioned?       (deploy-migrate)
  ✓ base schema present (organizations, users, c2c_documents, regulatory_programs)
  ✓ 262/262 migration files applied
▶ 5/5 Verify readiness contract
  authoring subsystem: 19/19 · tenant-parentage FKs: 6/6 · tenant_isolation_policy: 19/19
✅ Schema migration complete — safe to roll services.  ← exit 0
```

`core.programs` is then the 7-column shape from `044b`, and:

```
$ SELECT 1 FROM core.programs WHERE id::text=$1 AND org_id::text=$2 LIMIT 1;
ERROR:  42703: column "org_id" does not exist
```

### ⚠ Correction 1 — install-fresh does NOT report success

The first draft's headline was "the failure reports as success", attributed to
step 6's `recordIncomplete` + `return`. But `report()`
(`install-fresh.mjs:1681-1696`) prints `❌ Install INCOMPLETE — not reporting
success.` and returns 1.

**The success report comes from the next command.** `deploy-migrate` exits 0 with
"safe to roll services" on the database install-fresh just refused to bless.
That changes the fix: hardening step 6 does not close the loop on its own,
because `deploy-migrate` has no way to know install-fresh failed. **A
`deploy-migrate` preflight assertion on `core.programs`' shape would.**

### ⚠ Correction 2 — `069` IS on an applier, so `org_id` is not permanently lost

The first draft said `db/migrations/069_gcc_multitenant_rls_expansion.sql` is "on
NO applier". It contains `_gcc_`, so it matches the same glob as `000` — it runs
on install-fresh step 6 and in CI's psql loop, at sort index 33, after `044b`.

Proven by applying the step-6 loop to the broken probe: `43 applied, 0 failed`,
and `org_id`, `programs_org_idx` and `programs_org_fk` all appear. Its
`ADD COLUMN IF NOT EXISTS` **does** repair the column on any re-run with psql
present.

What stays permanently broken is `metadata`, `created_by` and `status NOT NULL`
— those come only from `000`'s `CREATE TABLE IF NOT EXISTS`, which no-ops
forever. And the narrower statement that survives, which is the one that
matters: **nothing on the deploy-only path ever adds `org_id`.** On an estate
where install-fresh ran once from a checkout and only `deploy-migrate` runs
thereafter, the original conclusion holds exactly.

### ⚠ Correction 3 — the route defect is a lie, not lost access

The first draft framed `guardQuery`'s swallowed 42703 as a cross-tenant check
failing open into a deny. The deny is real; the access consequence is smaller.
Source 1 of `PROGRAM_ORG_SOURCES` cannot match on a *healthy* database either:
`core.programs.org_id` is `uuid`, and `programBelongsToOrg` passes
`String(orgId)` where `orgId: number` is a `public.organizations.id` integer
(`organizations` carries both `id integer` and a separate `uuid` column).

So the missing column converts a query that returns zero rows into a query that
throws. **The defect is that the control reports having run when it did not** —
and the `uuid`-vs-`integer` mismatch is a second bug worth fixing in the same
change. See Finding 9 for the general form.

### The two consequences the first draft missed, both worse than the route

**`core.programs` ships with RLS disabled and no policy.**
`db/migrations/20260801_uuid_tenant_isolation_nonpublic.sql` (set index 260)
declares `('core','programs','org_id')` at line 133 and skips it when the column
is absent:

```
[NOTICE] [uuid-rls] SKIPPED core.programs — expected uuid column org_id not found (schema drift)
[NOTICE] [uuid-rls] tenant_isolation_policy applied to 16 non-public uuid-tenant table(s); 13 skipped
```

Probe: `relrowsecurity = f`, zero rows in `pg_policies`. A healthy database
carries `tenant_isolation_policy` on both `core.programs` and
`core.program_ownerships`. **That is a genuinely cross-tenant-readable table**,
not a broken feature. The NOTICE is one line in a 500-line log, is not counted,
and does not affect exit status.

**The resolver every `vault.documents` RLS policy authorizes through raises
42703 at runtime.** `core.get_program_org_id`, installed by set index 225,
applies green — `20260828_program_org_resolution_canonical.sql:41-45` chose
`plpgsql` over `LANGUAGE sql` precisely so it would not validate its relations
at CREATE time, and says so — then:

```
$ SELECT core.get_program_org_id('7ce04f26-...'::uuid);
ERROR:  42703: column "org_id" does not exist
QUERY:  COALESCE((SELECT org_id FROM core.programs WHERE id = p_program_id), ...
```

### And a new ordering hazard, found en route

`069` does `CREATE OR REPLACE FUNCTION core.get_program_org_id` with the **old
two-branch `LANGUAGE sql` body**. So running the gcc loop *after* `deploy-migrate`
silently reverts index 225's canonical three-branch `plpgsql` version and drops
the `regulatory_programs` fallback. Proven on the probe: `lanname` went
`plpgsql` → `sql`. That is exactly the vault-ingest-under-RLS failure index 225
exists to fix, reinstated by any install-fresh re-run that follows a deploy.
`provision-test-db.sh` happens to run them in the safe order; nothing enforces
it.

### Why no test catches any of this

`tests/schema-contract/uuid-tenant-isolation.contract.test.ts:80` hand-creates
`core.programs (id serial primary key, org_id uuid, name text)` before asserting
the policy attaches. It manufactures the column whose absence is the defect, so
it can never detect it.

`core.programs` has two creators:

| File | Applier | Columns |
|---|---|---|
| `db/migrations/000_gcc_bootstrap_core.sql` | install-fresh **step 6** (`*_gcc_*` psql loop) and CI's psql loop | 9 |
| `db/migrations/044b_gcc_lumen_schema_prerequisite.sql` | **`C2C_MIGRATION_FILES` index 11 — deploy-migrate** — and the gcc loop | 7 (no `metadata`, no `created_by`, `status` nullable) |

`org_id` comes from a **third** file, `db/migrations/069_gcc_multitenant_rls_expansion.sql`, which is on no applier at all. Live is `000 ∪ 069` = 10 columns.

On a complete install, step 6 sorts `000_gcc` first, so it wins the
`IF NOT EXISTS` race and 044b is a no-op. **But step 6 is the only non-fatal
step in `install-fresh`.** If `psql --version` fails, `install-fresh.mjs`
records the shortfall and returns — all 43 gcc files skipped — while steps 2–3
have already created every sentinel `deploy-migrate`'s preflight checks. The
deploy then runs happily and **044b creates a 7-column `core.programs` with no
`org_id`**. Re-running install-fresh later never repairs it: no `ALTER TABLE`
touching `core.programs` exists anywhere in the 262-file deploy set.

Reproduced: a database with 044b applied alone, then the product's own queries.

```
-- server/routes/innovation-routes.ts:148
SELECT 1 FROM core.programs WHERE id::text = $1 AND org_id::text = $2 LIMIT 1;
ERROR:  column "org_id" does not exist
```

Six consumers break the same way, two of them on tenant paths:
`server/routes/innovation-routes.ts:148`,
`server/services/innovation/compliance-guardrails-sdk-service.ts:1324`,
`regulatory-delta-radar-service.ts:1191`,
`evidence-confidence-heatmap-service.ts:387`, and
`core.get_program_org_id()` (deploy set index 225) on the `vault.documents`
RLS path.

**Why nothing would tell you.** `innovation-routes.ts`'s `guardQuery`
(`:118-143`) catches every error and returns `null`, which the caller reads as
"no match" — so a missing column presents as a **denied cross-tenant check**
rather than an error. And
`db/migrations/20260828_program_org_resolution_canonical.sql:41-45` deliberately
writes the resolver in `plpgsql` rather than `LANGUAGE sql` so it does **not**
validate its referenced relations at CREATE time — the file says so — which
defers the failure past every check `deploy-migrate` performs, into document
write authorization.

`deploy-migrate`'s `verifyReadinessContract` checks only the authoring
subsystem. `core.programs` is outside its contract entirely. A 7-column estate
deploys green.

**Also worth fixing while there:** `scripts/db/deploy-migrate.mjs:30-31` states
*"It also does not apply the governed-content tree (`db/migrations/*_gcc_*.sql`)"*.
It applies exactly one — 044b, at index 11 — and that one is the file creating
`core.programs`. The comment and the list contradict each other.

## Finding 2 — CONFIRMED and FIXED 2026-09-17

> **Confirmed exactly as written**, and it is the most consequential of the
> nine. Measured on a canonically provisioned database: 27 live columns, 48
> declared, and all 21 named columns genuinely absent.
>
> **AND IT CORRECTS AN ERROR OF MINE.** Finding 3's correction block said the
> charter tables are "declared in `shared/schema/project-charter.ts`, so
> `drizzle-kit push` creates them at install-fresh step 2". The first half is
> true; **the second is false.** `drizzle.config.ts` names only
> `shared/schema.ts`, `shared/schema/ana-intelligence.ts` and
> `shared/schema/report-os.ts`. `project-charter.ts` is re-exported from
> `shared/schema/index.ts`, which is **not** an entrypoint and is not reachable
> from one:
>
> ```
> project-charter.ts reachable from the drizzle entrypoints: false
>   project_charters      on push surface: false
>   charter_sections      on push surface: false
>   timeline_phases       on push surface: false
>   project_commitments   on push surface: false
>   charter_audit_events  on push surface: false
> ```
>
> So the charter tables are outside the push surface entirely. They come from
> install-fresh's step-3 overlay — `0012_project_charter_timeline.sql` for
> `project_charters` (27 columns, the only creator anywhere) and `20260629` for
> the other four. That is *why* the table is frozen: nothing reconciles it, and
> no file in `C2C_MIGRATION_FILES` had ever created or altered it.
>
> The finding-3 fix is unaffected — it is guarded on the table existing, not on
> what created it — but the wrong mechanism is corrected in all three places it
> was written: the migration header, the migration-set entry, and finding 3's
> block above. A wrong reason is how the next person reaches a wrong conclusion.
>
> **What was broken, executed:**
>
> | Surface | Statement | Result before |
> |---|---|---|
> | `charters.ts:403` | `d.select().from(projectCharters)` — unqualified, expands to all 48 | `ERROR: column "pma_config" does not exist` |
> | `pma-workflow-routes.ts:71` | `SELECT pma_config FROM project_charters` | same |
> | `:34` / `:43` | `SET pma_config = $1` / `INSERT … pma_config` | same |
>
> The PMA workflow-progress feature could not work on any database, and every
> charter read raised 42703.
>
> **FIXED** by `migrations/20260917_project_charters_declared_columns.sql`, new
> in `C2C_MIGRATION_FILES` (270): the 21 columns with the types the declaration
> asks for, plus `proj_charter_stage_idx`, the one declared index whose column
> did not exist. Every name and type read off `shared/schema/project-charter.ts`
> — nothing invented.
>
> ```
> BEFORE  columns: 27   select: ERROR: column "pma_config" does not exist
> AFTER   columns: 48   select: resolves     UPDATE pma_config: UPDATE 0
> ```
>
> Applied twice more: idempotent, still 48.
>
> **Not converged, recorded instead:** the 27 columns `0012` already makes use
> `jsonb` and `timestamp` where the declaration says `json` and `timestamptz` —
> `0012`'s own comment (line 94) acknowledges this. Retyping live columns is a
> rewrite with data implications, not an additive fix; it belongs to WO-1's
> schema-authority work. The new columns match the declaration; the old ones keep
> their shapes.
>
> **Also still true and untouched:** `charters.ts:398-401` says `charter_sections`
> "was dropped by `migrations/20260611_drop_charter_staging_tables.sql`; there is
> no section count to return." That table EXISTS (22 columns, verified live) —
> `20260611` is on no applier and `20260629` creates it. The comment is false but
> changing the endpoint's behaviour is a product decision, not a schema fix.

### Original finding, as written


`migrations/0012_project_charter_timeline.sql:10` is the **only** creator of
`project_charters` in the repository, and no `ALTER TABLE project_charters`
exists anywhere. It is frozen at 27 columns.
`shared/schema/project-charter.ts` declares 48.

`server/routes/charters.ts:401-404` issues `d.select().from(projectCharters)` —
an unqualified Drizzle select, which expands to all 48. Live:

```
$ psql … -c "select id, pma_config from project_charters limit 1;"
ERROR:  column "pma_config" does not exist
```

Twenty-one declared columns do not exist: `approval_comment`,
`approved_by_role`, `bla_config`, `content_hash`, `de_novo_config`,
`development_stage`, `fda_branch`, `fda_division`, `ind_config`, `k510_config`,
`locked_at`, `locked_by`, `locked_reason`, `nda_config`, `pma_config`,
`review_requested_by`, `review_requested_at`, `secondary_product_codes`,
`team_assignments`, `therapeutic_area`, `version`.

Sharper still: `migrations/20260611_drop_charter_staging_tables.sql:31` justifies
*keeping* `project_charters` on the grounds that it is "queried via raw SQL,
e.g. `pmaConfig` in `server/routes/pma-workflow-routes.ts`" — and `pma_config`
is one of the 21 that do not exist.

## Finding 3 — CORRECTED 2026-09-11, then FIXED

> **The claim below is half wrong, and the wrong half is the headline.** The
> four tables do NOT fail to exist. `project_charters`, `charter_sections`,
> `timeline_phases`, `project_commitments` and `charter_audit_events` are all
> declared in `shared/schema/project-charter.ts` and all five EXIST on a
> canonically provisioned database. Any deployed database has them.
>
> **CORRECTED AGAIN 2026-09-17:** this block used to say push creates them at
> install-fresh step 2. That is **false**, and the error was mine.
> `drizzle.config.ts` names only `shared/schema.ts`,
> `shared/schema/ana-intelligence.ts` and `shared/schema/report-os.ts`;
> `project-charter.ts` is re-exported from `shared/schema/index.ts`, which is
> **not** an entrypoint and is not reachable from one. The charter tables are
> outside the push surface entirely — they come from install-fresh's step-3
> overlay (`0012` for `project_charters`, `20260629` for the other four). The
> fix below stands unchanged, because it is guarded on the table existing rather
> than on what created it; the reasoning was wrong, not the code. Finding 2 is
> the direct consequence of the real mechanism.
>
> **What is genuinely on no replaying applier is the Part 11 immutability
> enforcement.** Drizzle cannot express a trigger, so
> `charter_audit_events_no_update` and `charter_audit_events_no_delete` come
> only from `migrations/20260629_charter_tables_rebuild.sql`, which runs on
> install-fresh's overlay and nowhere else. Drop either one — a restore, a
> schema tool, a manual intervention — and nothing puts it back: the charter
> audit trail silently becomes mutable, and no gate notices.
>
> **FIXED** by `migrations/20260911_charter_audit_immutability.sql`, a new file
> in `C2C_MIGRATION_FILES` carrying the function and the two triggers verbatim,
> with the trigger installs guarded on `charter_audit_events` existing.
>
> **The first attempt was to list `20260629` itself, and it was wrong.** That
> file is not self-contained: it has five `REFERENCES project_charters(id)`
> clauses and does not create `project_charters` — that table comes from Drizzle
> push, and nothing in the set creates it. Applying the set in order to a
> database that has not been pushed dies at the first FK.
> `tests/schema-contract/tenant-isolation-sweep.contract.test.ts` C-33 does
> exactly that and caught it:
>
> ```
> pass 1: migrations/20260629_charter_tables_rebuild.sql failed
>   — relation "project_charters" does not exist
> ```
>
> The live-database proof of the first attempt had passed, and could not have
> caught this: that database already carried `project_charters` from
> install-fresh, so it could not expose a dependency the set does not satisfy. A
> green migration against a database that happens to be complete is not evidence
> that the set is complete.
>
> The rebuild's other 367 lines also buy nothing. Every table it creates is
> `CREATE TABLE IF NOT EXISTS` against a table push has already made, so on any
> real database that DDL no-ops; the function and the two triggers are the entire
> delta. Carrying the rest would put a second, independent definition of four
> Drizzle-owned tables onto the replaying applier in exchange for nothing. So
> `20260629` stays on install-fresh only.
>
> `migrations/20260611_drop_charter_staging_tables.sql` must never join the set
> either: it DROPs three of the tables, and under RULE 1's unconditional replay
> that would destroy their contents on every deploy, green.
>
> **Proven by making it fail first**, on the canonical database:
>
> | Step | Result |
> |---|---|
> | `20260629` applied to a bare database | `ERROR: relation "project_charters" does not exist`, exit 3 — the C-33 failure reproduced |
> | the new file applied to that same bare database | exit 0, `NOTICE: … triggers NOT installed`, 0 triggers, 0 tables — self-contained |
> | both triggers dropped, then `UPDATE` on a seeded audit row | **succeeded** — hash silently rewritten |
> | then `DELETE` on that row | **succeeded** — audit row destroyed |
> | real `deploy-migrate` run | exit 0, "safe to roll services", both triggers back |
> | `UPDATE` / `DELETE` retried | `ERROR: charter_audit_events is append-only (§11.10(e)); UPDATE blocked` / `DELETE blocked`, row intact |
> | `deploy-migrate` run a second time | exit 0, 2 triggers, probe row survived — replay-safe |
>
> The two middle rows are the finding itself, executed: that is the state every
> deploy-migrate-maintained database is in today.
>
> Gates green at 264 migrations: `ci:migration-set-order`,
> `ci:migration-drop-safety`, `ci:migration-reachability`,
> `ci:duplicate-table-ddl` (no new duplicate definitions — the focused file adds
> no table DDL). `tests/schema-contract/` green across all three shards, 75
> files, 962 tests.
>
> **Not claimed:** this converges no column. It installs enforcement and nothing
> else, so a database whose shape came from push keeps that shape; column
> convergence is still WO-1's problem. Nor does anything yet *report* whether the
> triggers are present — nothing in the repository reads them, verified by
> grepping ts/js/mjs/sql for the trigger and function names. If such a surface is
> ever built it must probe `pg_trigger` and report a third state, not assume this
> migration ran.
>
> The stale comments the original finding lists are still worth fixing and are
> not touched here.

### Original finding, as written

`charter_sections`, `timeline_phases`, `project_commitments` and
`charter_audit_events` are created only by `migrations/0012` and
`migrations/20260629_charter_tables_rebuild.sql`. **Neither is in
`C2C_MIGRATION_FILES`** — the word "charter" does not appear in
`scripts/db/migration-set.mjs` at all. So on a populated database they may not
exist, while `server/routes/charters.ts:467-468` states the commitments route is
"Backed by `project_commitments` (rebuilt by `migrations/20260629`) and
`charter_audit_events` (new in `migrations/20260629`)."

There is a second, executed consequence already in the register
(`docs/audit-2026-07/12-findings-register.md:934`): insert a row into
`project_commitments`, re-run `install-fresh`, and the row is **gone** —
`20260611` drops the table and `20260629` recreates it empty, on every run,
exit 0, invisible to the install's table-count check.

Three stale comments should go with the fix, since they now assert the opposite
of what shipped: `server/routes/charters.ts:398-401` ("was dropped … there is no
section count to return"), `:419-421` ("`charter_audit_events` … was never
migrated"), and four "CONTRACT DEVIATION" notes in
`tests/unit/charters-routes.test.ts`.

## Finding 4 — CONFIRMED and FIXED 2026-09-17

> **FIXED by `15348146`** — "Delete /api/design-risk: 20 endpoints over ten tables
> that exist on no database". The finding below says the C-29 product decision
> blocks any code change and that the honest interim is to unmount the router.
> The decision was made instead, the same way D11d made the IVDR half on
> 2026-08-13: **the rival definition is deleted and the Drizzle shapes are
> canonical.** `server/routes/design-risk.ts`, its service and
> `migrations/20260609_design_risk.sql` are removed, not unmounted, and the
> `CLASSIFIED_OVERLAY_SKIPS` entry is gone with them.
>
> Two things the finding did not have, both measured on a canonically provisioned
> database (install-fresh + deploy-migrate, 963 tables):
>
> * It is **all twenty** endpoints, not only the eight-table ones. `risk_items`
>   and `risk_controls` DO land, in the pushed shape, so those handlers fail on
>   shape rather than absence: `rmf_id` is 42703 and the controls join is
>   `operator does not exist: integer = uuid`.
> * The capability is not lost, because a second implementation already served
>   it: `DesignControls.tsx` reads and writes `/api/design-controls`
>   (`server/routes/design-controls.routes.ts` over `c2c_design_controls`), which
>   is tested and fails closed on 42P01. The ui-v2 registry had been advertising
>   `apiPrefixes: ['/api/design-risk']` on that surface at `readiness:
>   routes-ready` while the component called the other prefix; it now names the
>   prefix it calls.
>
> The eight missing tables were re-confirmed absent at 963 tables before deleting.

### Original finding, as written

## Finding 4 — `/api/design-risk` is mounted and every endpoint fails

`server/bootstrap/register-document-routes.ts:42,259` mounts the router. All 20
endpoints in `server/routes/design-risk.ts` are reachable. None can work:

- Eight tables it queries exist on no database — `design_inputs`,
  `design_outputs`, `design_verifications`, `design_validations`,
  `design_reviews`, `design_changes`, `design_plans`, `risk_management_files`.
  Their only definition is `migrations/20260609_design_risk.sql`, which
  `install-fresh`'s `CLASSIFIED_OVERLAY_SKIPS` expects to fail and which is not
  in `C2C_MIGRATION_FILES`.
- The failure is exact and permanent. `CREATE TABLE IF NOT EXISTS risk_items`
  succeeds as a **no-op** against the pushed shape, and the next statement that
  must name a column raises it:
  `20260609_design_risk.sql:167` → `42703: column "rmf_id" does not exist`.
  Because 42703 is in install-fresh's missing-dependency list, the file is
  deferred and retried across all eight passes and can never resolve — nothing
  in the repository ever adds `rmf_id` to `risk_items`.
  Since each overlay file runs in one transaction, **none** of the file's 30
  statements survives.
- Three further failures are invisible to every gate, because they are column
  errors on tables that DO exist: `design-risk.service.ts:255` (`rmf_id`),
  `:242` (`option` on `risk_controls`), `:262` (`integer = uuid`).
  `scripts/ci/tables-live-schema-baseline.json` can hold the eight missing
  tables but cannot hold these — that gate checks existence.

No client code calls `/api/design-risk`, so this is dead-on-arrival rather than
a visibly broken screen. The blocking decision is ledger C-29's, still open:
*"rename ONE side's tables … or reconcile the models. Owner: whoever owns the
IVD/design-controls roadmap."* The IVDR half of that same decision was made on
2026-08-13; this half was not.

`server/services/regulatory/__tests__/iso-14971-risk.test.ts` is green because
it exercises the engine on in-memory literals and never touches a database.

## Finding 5 — CONFIRMED and FIXED 2026-09-17

> **This finding is right**, and the reflex that has corrected findings 3 and 7
> nearly threw it away. On a canonically provisioned database the table has all
> 16 columns including `doc_types`, which *looks* like the same wrong headline.
> It is not. "Reaches no populated database" means a database provisioned
> **before `20260716` was written** has the table (from `20260531`) and no
> `doc_types`, and no applier will ever add it. A recently provisioned test
> database cannot expose that — the same trap as finding 3.
>
> All four premises verified: no Drizzle definition (zero hits under `shared/`);
> only two SQL creators, both in `migrations/`; neither in
> `C2C_MIGRATION_FILES`; nine runtime references.
>
> **Proven before the fix**, on the canonical database — dropped `doc_types`,
> ran the real `deploy-migrate`:
>
> ```
> ✅ Schema migration complete — safe to roll services.
>    doc_types present: 0
> ```
>
> The applier declared itself done with the column still missing. After listing
> the file: `doc_types present: 1`, and applying it twice more is a no-op.
>
> **THE ABSENCE IS SILENT, WHICH IS WHY IT SURVIVED.** No statement names
> `doc_types` — the INSERT lists twelve columns without it, the UPDATE sets
> four, and every read is `SELECT *` / `RETURNING *`. So nothing raises 42703:
> `row.doc_types` is `undefined` and `templateStore.ts:47` maps that to `[]`,
> because `Array.isArray(undefined)` is false. Every template reports zero
> document types, indistinguishable from a template that genuinely has none.
>
> **FIXED** by listing `migrations/20260716_template_doc_types.sql` in
> `C2C_MIGRATION_FILES` — it is self-contained and its `CREATE TABLE` is
> byte-identical to `20260531`'s modulo comments (verified by normalised diff),
> so it covers both; `20260531` is a strict subset and stays unlisted — and by
> removing the file's now-false `KNOWN_UNLISTED` exemption. The guard fails
> without the listing, naming the file, and passes 9/9 with it.
>
> ### Two things found alongside, neither fixed here
>
> **1. Nothing writes `doc_types`.** Not the INSERT, not the UPDATE, not
> anything else in `server/`, `client/`, `shared/`, `migrations/` or `db/`. The
> only references are the type, the read that defaults to `[]`, the UI that
> renders it, and the migration that adds it with `DEFAULT '[]'`. (The `docTypes`
> hits under `pathway-engines/` and `cerv2-ai-routes` are a different concept —
> `c2c_documents.doc_type` filters.) So the column is **inert on every
> database**: one that has it behaves exactly like one that does not, and the
> template library's document-type chips can never appear. Listing the migration
> does not change that and is not claimed to. Fixing it means either writing the
> column or removing the feature, which is a product decision.
>
> **2. 10 of the 15 `KNOWN_UNLISTED` entries failed that list's stated reason — FIXED 2026-09-17.**
> The stated reason is that such files' *"objects come from `shared/schema.ts`
> via drizzle-kit push and they carry nothing an existing database additionally
> needs"*, and the list's own comment says *"adding one requires the reason
> above to actually hold."*
>
> **CORRECTED 2026-09-17: this block first said "14 of 16". That was a crude
> heuristic and it was wrong in both numbers.** Re-measured properly:
>
> | | |
> |---|---|
> | entries actually in the list | **15** (one of the "16" was a path inside a comment) |
> | reason holds — tables are on the push surface | 2 — `report_definitions`, `onboarding_proposal_runs` |
> | reason holds — `ADD COLUMN` of a Drizzle-declared column | 2 — `apiUsageLogs.model`, `organizationUsers.persona` |
> | clean for a *different*, verified reason | 1 — `authoring_reviews` |
> | **genuinely fail the stated reason** | **10**, covering **16 tables** |
>
> The `authoring_reviews` exception was flagged as a suspected false positive
> and is now confirmed as one: `db/migrations/20260730_authoring_subsystem_schema.sql`
> creates it, that file is in `AUTHORING_SUBSYSTEM_FILES`, and
> `applyAuthoringSubsystem` is called at `deploy-migrate.mjs:319` — so it does
> run on both appliers, exactly as its comment claims.
>
> The 10 that remain, and what they leave unreachable:
>
> | Entry | Tables |
> |---|---|
> | `20260701_protocol_soa.sql` | `protocol_soa_assessments`, `protocol_soa_cells` |
> | `20260702_protocol_budget.sql` | `protocol_budget_items`, `protocol_budget_params` |
> | `20260703_dmsp.sql` | `dms_plans`, `dms_plan_elements` |
> | `20260704_biosketch.sql` | `biosketches`, `biosketch_sections` |
> | `20260704_other_support.sql` | `other_support_documents`, `other_support_entries` |
> | `20260705_export_control.sql` | `export_control_reviews` |
> | `20260705_invention_disclosure.sql` | `invention_disclosures` |
> | `20260705_research_agreements.sql` | `research_agreements` |
> | `20260728_chat_thread_store.sql` | `chat_threads`, `chat_messages` |
> | `20260731c_canonical_documents.sql` | `canonical_documents` |
>
> All 16 are on no push surface, created by no file in `C2C_MIGRATION_FILES`,
> present on a canonically provisioned database, and referenced by live non-test
> code (3–44 references each). Same class as findings 3 and 5, at 16× the scale.
>
> **FIXED**: all ten listed in `C2C_MIGRATION_FILES` (270 → 281) and their ten
> `KNOWN_UNLISTED` exemptions removed. Safe to replay, verified per file rather
> than assumed: zero DROP statements across all ten, every CREATE and ALTER
> `IF NOT EXISTS`-guarded, every table carrying `organization_id`/`org_id`, and
> the only external FK targets `organizations`/`users` — base tables that 39
> files already in the set reference and that the harness provisions through
> `FK_PREREQUISITES`. That is the finding-3 trap checked and cleared:
> `project_charters` failed it because it is not a base table.
>
> Proven by breaking it — dropped `chat_threads`, `chat_messages`, `biosketches`,
> `biosketch_sections` and `export_control_reviews` (five tables across three of
> the ten files) on the canonical database, ran the real `deploy-migrate`, and
> all five came back with their full shapes. Applied again: idempotent.
>
> New gate `tests/schema-contract/known-unlisted-reason-holds.contract.test.ts`
> turns the list's prose rule into an enforced one — red first on exactly the 10,
> now 5/5. It also asserts the *premise* of its one reasoned exception rather
> than the exception itself: if `applyAuthoringSubsystem` ever stops running on
> `deploy-migrate`, the `authoring_reviews` exemption fails with it.
>
> **NOT claimed:** that these tables gained RLS policies. None of the ten defines
> any — the status quo on a provisioned database today, unchanged by listing them.
> C-33 green: the whole set still replays on a bare database.

### Original finding, as written


`c2c_template_specs` has **no Drizzle definition** (zero hits for it in
`shared/`), so `drizzle-kit push` cannot create it. Its only creators are
`migrations/20260531_template_specs.sql` and
`migrations/20260716_template_doc_types.sql`, and **neither is in
`C2C_MIGRATION_FILES`**. The `doc_types` column exists solely because
`20260716:42-43` runs `ALTER TABLE … ADD COLUMN IF NOT EXISTS` on the
install-fresh overlay.

The table is read and written at runtime —
`server/services/templates/templateStore.ts:116,158,166,194,217` — and rendered
by `client/src/concept2cure/v2/surfaces/TemplateLibrary.tsx`.

`tests/ops/apply-c2c-migrations-manifest.test.mjs:254` puts `20260716` in
`KNOWN_UNLISTED`, whose stated rationale is that such files' *"objects come from
`shared/schema.ts` via drizzle-kit push and they carry nothing an existing
database additionally needs."* **Neither half holds for this file.** The same
test's own comment says an entry may be added only "if the reason above actually
holds". `20260531` predates the guard's `RATCHET_FROM = '20260701'` and is
ungoverned entirely.

(The duplicate `CREATE TABLE` in `20260716` is **not** a defect: it is a
deliberate, self-documented, byte-identical defensive guard so the file applies
on a preview branch predating the base table. Verified identical.)

---

## Finding 6 — FIXED upstream; both sub-items re-measured 2026-09-18

> **The main defect is FIXED by `c92c7122`** — "Submission orchestrator runs could
> be started and never advanced". `shared/schema/submissions.ts` now declares
> `createdAt`/`updatedAt`, so push creates them and the trigger's
> `NEW.updated_at` assignment resolves. Verified by executing the exact
> `persistRun` path three times against a provisioned database: step-1 → step-2 →
> step-3, no 42703, `updated_at` set.
>
> **Sub-item A is wrong, and the live state is a third thing.** The finding says
> `20260629_orchestrator_region_check_alignment.sql` is on neither applier "while
> the route accepts all 13" — implying the database holds `044b`'s narrow
> four-value CHECK and rejects the other nine. It holds **no CHECK at all**: push
> creates the table, so the `CHECK (region IN ('US','EU','JP','CA'))` that both
> SQL files declare never runs, and `'us'` lowercase inserts cleanly. The
> alignment migration is indeed on neither applier (0 hits in
> `C2C_MIGRATION_FILES`, not referenced by the port). So the hazard is not a
> route/DB mismatch — it is that the database enforces no region domain at all,
> and any writer that bypasses the route's zod can store anything. Note also that
> the route's enum has 13 values while the service's `RegionCode` type
> (`server/services/module3-extensions.ts:30`) has four.
>
> **Sub-item B is confirmed, and the compliance document was wrong about it.**
> The `steps.run_id` FK is `NO ACTION` live — neither the CASCADE both files
> declare nor the RESTRICT the hardening installs, because that file's `DO` block
> matches `confdeltype = 'c'` only and so no-ops. Proven by execution: a run with
> one step event refuses deletion (`violates foreign key constraint … is still
> referenced`) and the event survives. `docs/compliance/part11-immutability-record-class-policy.md:34`
> asserted `ON DELETE CASCADE` and called RESTRICT "a future change"; the
> protection is already in force and the row understated it in the one direction
> that matters. Corrected 2026-09-18.

### Original finding, as written

## Finding 6 — a trigger writes a column the table does not have, so orchestrator runs can never advance

**Severity: second only to Finding 1, and it is live on every freshly
provisioned environment including this one.**

`submission_orchestrator_runs` has three definitions, and the one that wins is
the one nobody wrote down:

- `migrations/0018_submission_orchestrator.sql:17` (install-fresh overlay #24)
  and `db/migrations/20260725_submission_orchestrator_store_port.sql:63`
  (deploy-migrate index 37) declare **byte-identical** table bodies, both
  including `created_at` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
- `shared/schema/submissions.ts:196` declares neither.

`drizzle-kit push` runs at install-fresh **step 2**, the overlay at step 3, so
push creates the table and 0018's `CREATE TABLE IF NOT EXISTS` is a no-op. Only
0018's indexes, seed, function and **trigger** take effect. Live confirms it:
the FKs carry drizzle's truncated names
(`submission_orchestrator_runs_organization_id_organizations_id_f`), not
PostgreSQL's `_fkey`.

So the table has no `updated_at` — but 0018 installed
`trg_orchestrator_runs_updated_at`, whose function body assigns
`NEW.updated_at`:

```
ERROR:  42703: record "new" has no field "updated_at"
CONTEXT:  PL/pgSQL assignment "NEW.updated_at = NOW()"
          PL/pgSQL function submission_orchestrator_runs_set_updated_at() line 3
```

The trigger is `BEFORE UPDATE` only, so the first `INSERT` succeeds. But
`persistRun` (`server/services/submission-package-orchestrator.ts:1014`) uses
`ON CONFLICT (run_id) DO UPDATE`, which every subsequent step-write and every
resume takes, and `42703` is in its own `SCHEMA_SHAPE_ERROR_CODES` (`:984`), so
it re-throws to the route. **A run can be created and never advanced or
completed.** The same statements succeed against the port shape.

Note the polarity: ledger C-19 fixed this family in the deploy direction and
nothing closed the gap in the other one. The C-19 contract test
(`tests/schema-contract/orchestrator-ledger-hardening.contract.test.ts:39`)
applies the port to a bare PGlite and never applies push, so it exercises only
the shape that works.

Two smaller items in the same family:
`migrations/20260629_orchestrator_region_check_alignment.sql` widens the region
`CHECK` to 13 values and is on neither the port nor `C2C_MIGRATION_FILES`, while
`server/routes/submission-orchestrator.ts:200` accepts all 13; and the
`steps.run_id` FK is `NO ACTION` live, neither the `CASCADE` both files declare
nor the `RESTRICT` that `20260730_orchestrator_run_ledger_hardening.sql`
installs — its `DO` block matches only `confdeltype = 'c'`, so it silently
no-opped. `docs/compliance/part11-immutability-record-class-policy.md:34`
asserts the CASCADE that is not there.

## Finding 7 — CORRECTED 2026-09-11, then FIXED

> **The mechanism is right; the framing is wrong, and the wrong framing
> understates it.** The finding says "whichever shape a database has, four of the
> nine writes fail", as though two lineages were in play. Only one is.
> `scripts/db/deploy-migrate.mjs` refuses an unprovisioned database —
>
> ```
> ✗ This database has not been provisioned — refusing to migrate.
>   Missing base tables: organizations, users, c2c_documents, regulatory_programs
> ```
>
> — so **there is no such thing as a deploy-migrate-lineage database.**
> install-fresh provisions every one of them, its step-3 overlay applies all of
> `migrations/*.sql` including `20260524` (which names the column `notes`), and
> `db/migrations/20260323` runs later as a `CREATE TABLE IF NOT EXISTS` against a
> table that already exists — so it no-ops and converges nothing. install-fresh
> never runs it directly either: step 6 matches only `db/migrations/*_gcc_*`.
>
> So it is not "four of nine, depending". It is **always the same four** — the
> orchestrator's — on **every** database, permanently. Executed against a
> canonically provisioned database:
>
> ```
> ERROR: column "execution_notes" of relation
>        "contradiction_consequence_log" does not exist
> ```
>
> while the consequence-service's `notes` write on the same database resolves
> fine. The write-only claim is confirmed: every one of the 15 references in the
> repository is an INSERT or a comment; nothing ever SELECTs the table, so a
> consequence that was never recorded is indistinguishable from one that was.
>
> **`contradiction_decision_links`** — the finding says it "does not exist at all
> under the deploy-migrate lineage". True of a lineage that cannot exist; it is
> present on every provisioned database. Confirmed live. No change made, but it
> is created only by an install-fresh-only file, so it is not re-asserted by the
> replaying applier — the same class as the charter triggers in finding 3.
>
> **FIXED, in four parts:**
>
> 1. The orchestrator's four INSERTs now name `notes`.
> 2. `db/migrations/20260323` amended **in place** (RULE 1 — no DROP appended):
>    `execution_notes` → `notes`, so the two creators cannot diverge again.
> 3. `migrations/20260911_contradiction_consequence_log_convergence.sql`, new in
>    `C2C_MIGRATION_FILES`, does what the amendment cannot: `ALTER TABLE … ADD
>    COLUMN IF NOT EXISTS notes` plus a guarded backfill, because
>    **`CREATE TABLE IF NOT EXISTS` converges nothing.**
> 4. `detected_by`: `20260323` declared it `TEXT NOT NULL DEFAULT 'system'` while
>    the shape that ships declares plain `TEXT`. **No code writes this column.**
>    The default was removed rather than adopted — it would stamp every finding
>    with an attribution nothing recorded — and
>    `ContradictionFinding.detectedBy` is retyped `string | null`, with
>    `pdev-contradiction-bridge` and the inconsistency route following, because
>    it was typed `string` and read `as string` while being NULL on every row.
>
> **Proven by making it fail first.** A database was built from the
> pre-amendment `20260323` (`git show HEAD:…`), which is the shape the fix exists
> to repair:
>
> | | Before the convergence migration | After |
> |---|---|---|
> | `detected_by` on a seeded row | `system` — nothing recorded this | `system` kept (existing data is not destroyed) |
> | a **new** finding's `detected_by` | `system` | `NULL` — honest |
> | free-text column | `execution_notes = 'LEGACY NOTE TEXT'` | `notes` backfilled, `execution_notes` left in place per RULE 1 |
> | the fixed code's INSERT | `ERROR: column "notes" … does not exist` | `SUCCEEDED, notes=post-fix` |
>
> Applied twice more: exit 0, backfilled text unchanged, the post-fix row not
> clobbered. On the canonically provisioned database the whole file is a no-op,
> as designed — the shape was already correct there.
>
> A new gate, `tests/schema-contract/contradiction-consequence-log-columns.contract.test.ts`,
> PREPARE-plans every consequence-log write extracted from the three service
> sources against the canonical creator. Proven red first: 4 failed / 1 passed,
> naming exactly the orchestrator's four and the real 42703. Now 5/5.
>
> Gates green at 265 migrations; `tests/schema-contract/` green across all three
> shards (76 files, 968 tests); 20 contradiction-related suites, 174 tests, green.
>
> **Not claimed:** the wider divergence below — 14 CHECK constraints, the
> `truth_hierarchy_level` type split, six nullability flips, the
> `timestamptz`/`timestamp` split — is untouched. Only the two divergences that
> change answers were fixed.

### Original finding, as written


`contradiction_consequence_log` names its free-text column **`execution_notes`**
in `db/migrations/20260323_assumption_decision_contradiction.sql:280`
(deploy-migrate index 42) and **`notes`** in
`migrations/20260524_contradiction_engine_schema.sql:118` (install-fresh overlay
#47). install-fresh never runs the first; deploy-migrate never runs the second.

Server code writes both names, from different services:

| Column written | Sites | Works on the deploy shape | Works on the install-fresh shape |
|---|---|---|---|
| `notes` | `contradiction-consequence-service.ts:454,502,557,700` | **42703** | ✅ |
| `execution_notes` | `contradiction-resolution-orchestrator.ts:463,550,595,620` | ✅ | **42703** |

Demonstrated against both shapes. **Whichever shape a database has, four of the
nine consequence-log writes fail** — and all nine sit inside `catch` blocks that
discard the error, four of them with no logging at all. The table is write-only:
nothing in the repository ever reads it.

The wider divergence in this family is not one column name. Between the two
shapes there are **14 CHECK constraints** present on one side and absent on the
other, one column type change (`truth_hierarchy_level` `integer NOT NULL CHECK
BETWEEN 1 AND 7` versus `text`), six nullability flips, five default changes,
and a `timestamptz`/`timestamp` split on every timestamp in the family.
`contradiction_decision_links` does not exist at all under the deploy-migrate
lineage. And `detected_by` is written by no code: it defaults to `'system'` on
one shape and to `null` on the other, so `mapFinding` returns a different answer
depending on how the database was built.

## Finding 8 — two gates cannot see what they were written to catch

Neither is a schema defect; both are reasons the defects above went unreported.

- **`scripts/ci/check-embedding-runtime-canonicality.mjs:87-92`** matches four
  regexes, all OpenAI-shaped (`openai.embeddings.create`, `getOpenAI()...`,
  `model: 'text-embedding-...'`). A HuggingFace embedding call is invisible to
  it. `server/huggingface-service.ts` and its five callers are not baselined and
  not excluded — they simply do not match, so the gate passes and would keep
  passing if ten more were added. A guard written against one provider does not
  govern a second.
- **`scripts/db/install-fresh.mjs:700`** verifies the push surface with a
  `/\bpgTable\(/` regex. The vault tables are declared `vault.table('documents',
  …)` (`shared/schema/vault.ts:70,158`), so the check cannot see them. That
  matters because `drizzle-kit push` emits **no `vault.*` tables at all** —
  measured by running push against a throwaway database with the schema and the
  `vector` extension pre-created: 481 of 481 public tables, zero vault tables.
  The vault schema therefore has no push-side verification of any kind.

`embeddingService.embedForCorpus(text, corpus)`, which
`server/services/embedding-corpus-policy.ts:48` instructs runtime callers to
use, **does not exist** — and `enhancedEmbeddingService.ts`, which that file's
header calls "the single approved runtime that consults it", does not import the
policy at all. The policy and its runtime are unconnected.

## Finding 9 — authorization checks that report having run when they did not

The general form of Correction 3, found by scanning every non-test
`server/**/*.ts` for a `catch` returning a falsy value in an authorization
context. Two real instances, and the repo already contains the model answer.

`server/routes/innovation-routes.ts:109-140` — `guardQuery` wraps every
ownership query and ends `catch { …; return null; }`. **No binding, no logging,
no metric.** It conflates four categories that need different handling:

| Class | Example | Correct handling |
|---|---|---|
| genuine no-match | *no error*, `rows.length === 0` | deny — the only legitimate one |
| caller garbage | `22P02` invalid uuid | deny (already pre-empted by `id::text`) |
| **schema failure** | `42703`, `42P01`, `42501`, `3F000` | **must not deny — the control did not run** |
| **infrastructure** | `08006`, `53300`, `57014`, no pool | **must not deny — and it is transient, so it yields intermittent 404s** |

Two properties make it worse than an ordinary fail-closed guard. The
three-source OR loop in `PROGRAM_ORG_SOURCES` means that with one source broken
the verdict is decided by whichever sources still parse — allow if any matches,
deny if none does. That is not fail-closed, it is fail-whatever. And the deny is
a deliberately indistinguishable 404 (`:97-99`), so a totally broken check is
invisible to operators as well as callers.

**The information needed for the fix already exists and is thrown away.** The
signature is `Promise<Record[] | null>` — the third state is reserved — and every
call site collapses it (`:162`, `:230`, `:250`, `:270`, `:290`).

Second instance: `server/routes/c2c/project-access.ts:286` — `verifyProjectAccess`
ends `catch { return false }`, unlogged, on a cross-tenant project check. That
same file already does it right at `:255`
(`if (isMissingTableError(error)) return fallback; throw error;`).

`server/services/ana/AnaToolExecutor.ts:16515` inherits the defect by calling
`programBelongsToOrg` — deliberately, per its comment at `:16493`, "rather than
a fourth copy" — so fixing `guardQuery` fixes it.

Cleared on inspection, and worth citing as the right shape:
`server/middleware/requirePlatformAdmin.ts:72` and
`server/services/roleBasedAccess.ts:103,147` deny **and log**;
`server/routes/pdev/pdev-routes.ts:128` has no catch at all, so an error becomes
a 500. And `server/middleware/moduleEntitlementGate.ts:189-199` states the
invariant outright — it fails *open* for a billing gate, which is the opposite
direction from a tenant boundary, but its comment is the rule that `guardQuery`
breaks: **"Never silent."**

## Scope

> ### ⛔ 2026-09-10 — the convergence migration proposed below was REVIEWED AND REFUSED
>
> Ten agents across five hazard dimensions, each adversarially verified: **13
> findings refuted, 41 survived.** The proposal does not ship. The three that
> kill it:
>
> **It would have manufactured a green signal.** With `org_id` present, index
> 260 does attach `tenant_isolation_policy` and index 261 does `FORCE` it — the
> deploy log and `\d` both then read as fixed. But `069` (the backfill) and
> `0021` are `indexOf = -1` in `C2C_MIGRATION_FILES`, so on the defect path
> every row has `org_id NULL` — measured, 2 of 2 — and the canonical policy's
> third arm is `OR org_id IS NULL`. **The policy admits 100% of rows to every
> tenant.** Turning "no policy" into "a policy that isolates nothing", while the
> deploy prints success, is precisely the invented result this platform must
> never produce. Anything shipped here either carries the backfill and the
> `FORCE` with it, or says in writing that it delivers a policy and not
> isolation.
>
> **It does not even fix the resolver.** `core.get_program_org_id`'s second
> branch reads `core.program_ownerships`, which is also gcc-only and also
> absent. Adding `org_id` alone converts the `42703` into a `42P01` — the same
> failure wearing a different code.
>
> **It could strand the deploy.** `ADD CONSTRAINT` raises `23503` on a
> partially-converged database, which `EXCEPTION WHEN duplicate_object` does not
> catch; at index 12 with `stopOnFirstFailure` that leaves ~250 migrations
> unapplied. Separately, `SET NOT NULL` is RLS-blind while the `UPDATE` feeding
> it is not — with `app.rls_enforce='on'` the UPDATE matched 0 of 1 NULL rows
> and `SET NOT NULL` then failed, wedging every subsequent deploy. Latent only
> until someone hardens the deploy connection.
>
> Two of my own scoping claims were also wrong: the placement window is
> **12–69**, not 12–224 (`BATCH_START` at index 70 is the binding upper bound),
> and index 225 imposes no ordering constraint at all because plpgsql defers
> resolution.
>
> **And the strategic finding, which is why per-table convergence is the wrong
> shape of fix: 167 tables exist only on install-fresh step 6.** `core.programs`
> is one symptom. Converging it one table at a time treats none of the cause.
> The cause is that step 6 is optional and `deploy-migrate` cannot tell it was
> skipped — so the fix belongs at that boundary (a deploy-migrate preflight
> assertion, per Correction 1), not in 167 ALTERs.
>
> What survived as safe and useful: the file is genuinely idempotent and
> convergent, there is no transaction-nesting problem, no journal drift, no pool
> poisoning, no replay oscillation, and no heavy lock in the normal case. Those
> were real risks and they were checked by execution rather than argued away.

1. ~~**Finding 1 first.** Four separable pieces~~ — **superseded by the review
   above.** The convergence migration is not the first move; the
   `deploy-migrate` preflight assertion is, because it is the only piece that
   scales past one table. Kept below for the constraints it records, which the
   review confirmed or corrected:
   - a convergence migration in `C2C_MIGRATION_FILES` adding `org_id`,
     `metadata`, `created_by` and the `status NOT NULL` posture, plus
     `programs_org_idx` and the guarded `programs_org_fk`. Placement window is
     index **12–224**: after `044b` at 11 creates the table, strictly before
     index 225 reads `org_id`, and before index 260 decides whether to policy
     it. Immediately after 11 is the natural slot.
     `org_id` must stay **nullable with no default** — `069`'s own backfill
     fires only when exactly one organisation exists, so `SET NOT NULL` would
     fail on any zero- or multi-org database, and a default would silently
     mis-assign ownership. The FK must keep `069`'s `information_schema` guard,
     because the `identity` schema is gcc-only and absent on this path.
   - **a `deploy-migrate` preflight assertion on `core.programs`' shape.** Per
     Correction 1 this is the piece that closes the loop: install-fresh already
     exits 1, and `deploy-migrate` is what declares the database fit anyway.
   - making install-fresh step 6 fatal when `psql` is missing. Defensible — no
     supported environment both runs step 6 and lacks psql (CI installs
     `postgresql-client` at `ci.yml:784,862,1006`; the production image has no
     psql but never runs install-fresh, per `deploy-migrate.mjs:20-28`), and
     `--allow-incomplete` already exists as the deliberate opt-out. Note that
     **no CI job exercises the psql-missing branch**, so it has never been
     tested at all.
   - the `069` / index-225 ordering hazard: `069` must stop clobbering
     `core.get_program_org_id`, or the canonical version must be re-asserted
     after any gcc run.
2. **Findings 2 and 3 together** — one convergence migration in
   `C2C_MIGRATION_FILES` bringing `project_charters` to the declared shape and
   putting the four charter tables on the deploy path, plus the three stale
   comments.
3. **Finding 4** needs the C-29 product decision before any code changes. Until
   then, the honest interim is to unmount `/api/design-risk` rather than serve
   20 endpoints that cannot answer.
4. **Finding 5** — list `20260716` in `C2C_MIGRATION_FILES` (it is idempotent by
   construction) and remove the incorrect `KNOWN_UNLISTED` entry.

## Exit criteria

```bash
npm run db:provision-test                     # a database built from empty
npm run ci:tables-live-schema                 # no new absences
# and the one that matters, per finding:
psql "$DATABASE_URL" -c "select org_id from core.programs limit 1"
psql "$DATABASE_URL" -c "select pma_config from project_charters limit 1"
psql "$DATABASE_URL" -c "update submission_orchestrator_runs set status = status"
```

~~Each must succeed on a database provisioned by **`deploy-migrate` alone**.~~
**Corrected 2026-09-10: no such database can exist.** `deploy-migrate.mjs:87`
declares `BASE_SCHEMA_SENTINELS = ['organizations','users','c2c_documents','regulatory_programs']`
and its preflight (`:110-131`) calls `process.exit(3)` if any is missing, so it
refuses an unprovisioned database outright.

The scenario that actually produces these defects is narrower and worth stating
exactly, because it is what the fixes have to survive: **an `install-fresh`
whose later steps did not complete, followed by `deploy-migrate`.** Steps 2-3
create every sentinel the preflight looks for, and step 6 — the `*_gcc_*` psql
loop — is the only non-fatal step in the script. Finding 1 is that path. The
same shape of hazard is documented for step 2 itself at
`install-fresh.mjs:786-805`: a `drizzle-kit push` that aborts mid-loop and still
exits 0.

So the exit criterion is: each command above succeeds on a database where step 6
was skipped and `deploy-migrate` then ran to completion.

## What is NOT claimed

No production database was observed. Every statement above is measured on a
local PostgreSQL 16 built by `scripts/db/provision-test-db.sh`, plus throwaway
databases used to reproduce the two failure paths. Whether a deployed estate has
already taken the 7-column `core.programs` path cannot be determined from this
repository — and by design nothing would report it if it had, which is itself
part of the finding.
