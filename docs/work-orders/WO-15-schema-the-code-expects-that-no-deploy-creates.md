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

## Finding 2 — `project_charters` is 27 columns; the code selects 48

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
> declared in `shared/schema/project-charter.ts`, so `drizzle-kit push` creates
> them at install-fresh step 2. Verified present on a canonically provisioned
> database. Any deployed database has them.
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

## Finding 5 — `c2c_template_specs.doc_types` reaches no populated database

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

## Finding 7 — one table, two column names, and four of nine writes always fail silently

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
