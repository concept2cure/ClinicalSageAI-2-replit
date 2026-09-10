# WO-15 — schema the code expects that no deploy path creates

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN · **Found by:** WO-1 stage 2, against a live database
**Relates to:** WO-2 (blank-database completeness), WO-3 (tenant isolation), ledger C-29

---

## Why this is separate from WO-1 and WO-2

WO-1 removes duplicate definitions. WO-2 asks whether a **blank** database
provisions what the server queries. Neither covers the five findings below,
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

## Finding 1 — `core.programs` can be permanently missing `org_id`, and the failure is silent

**Severity: highest here.** It is a tenant-isolation guard that fails open into
a deny, so it neither protects nor reports.

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

## Finding 3 — the four charter tables are on no deploy path

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

## Scope

1. **Finding 1 first**, and its two halves are separable: make the missing-psql
   branch of install-fresh step 6 fatal (or provision `core.programs`
   canonically on the deploy path), and put an
   `ALTER TABLE core.programs ADD COLUMN IF NOT EXISTS org_id …` into
   `C2C_MIGRATION_FILES` so existing databases converge — per the WO-1
   convergence rule, editing the `CREATE TABLE` repairs nothing that already
   exists. Separately, `guardQuery` must not render a missing column as a deny.
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
```

Each must succeed on a database provisioned by **`deploy-migrate` alone**, not
only by a complete `install-fresh`. That distinction is the whole work order.

## What is NOT claimed

No production database was observed. Every statement above is measured on a
local PostgreSQL 16 built by `scripts/db/provision-test-db.sh`, plus throwaway
databases used to reproduce the two failure paths. Whether a deployed estate has
already taken the 7-column `core.programs` path cannot be determined from this
repository — and by design nothing would report it if it had, which is itself
part of the finding.
