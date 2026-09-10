# Migration Legacy Archive

**Archived:** 2025-01-24

## Background

The original 112 migrations had 25+ numbering conflicts (duplicate numbers like 003, 007-015, etc.).
These conflicts occurred during parallel development and can cause unpredictable migration order.

## Conflict Summary

| Number | Files |
|--------|-------|
| 003 | 2 files |
| 007-015 | 3, 2, 2, 2, 2, 2, 2, 2, 2 files |
| 031-035 | 2, 2, 2, 2, 2 files |
| 042-046 | 2, 2, 2, 3, 2 files |
| 060-063 | 2, 2, 2, 2 files |
| 071 | 2 files |

## Resolution Strategy

1. Migrations in `_legacy/` are preserved for reference
2. New migrations use timestamp format: `YYYYMMDD_HHMMSS_description.sql`
3. For fresh deployments, use Drizzle schema push or consolidated baseline

## Commands

```bash
# Fresh deployment (recommended)
npx drizzle-kit push:pg

# View schema diff
npx drizzle-kit generate:pg --schema=shared/schema.ts

# Apply specific migration (if needed)
npx drizzle-kit migrate
```

## Note

Do NOT run migrations from this `_legacy/` folder directly.
They are preserved only for audit and reference purposes.

---

# 2026-09-10 — WO-1: fifteen files that no applier runs

**Archived:** 2026-09-10 · **Work order:** WO-1 (schema authority) · **ADR-0006**

The 2025 wave above was archived for *filename* conflicts. This wave is
archived for a different reason: **nothing executes these files.** Not on a
fresh install, not on a deploy, not in CI.

## How that was established

There are exactly four things that apply SQL in this repository, and each was
checked by name rather than by assumption:

| Applier | What it runs | Touches a populated DB? |
|---|---|---|
| `scripts/db/deploy-migrate.mjs` | the ordered `C2C_MIGRATION_FILES` array in `scripts/db/migration-set.mjs`, plus `AUTHORING_SUBSYSTEM_FILES` | **yes — the only one that does** |
| `scripts/db/install-fresh.mjs` | `drizzle-kit push` from `shared/schema.ts`, then `PRE_OVERLAY_CREATORS`, then a sorted overlay of `migrations/*.sql`, then the authoring subsystem, then `RLS_MIGRATIONS`, then the `db/migrations/*_gcc_*` tree | no — fresh installs only |
| `.github/workflows/ci.yml` psql loop | `db/migrations/*_gcc_*.sql` | no — a CI test database |
| `scripts/db_migrate.sh` | `db/migrations/0[0-9][0-9]_*.sql` | **it has no automated caller.** `.github/workflows/neon-preview-db.yml:92` explicitly declines to run it: *"would re-apply all ~166 migrations from scratch — most aren't idempotent"* |

Every file below is in **none** of the first three. Some are reachable only by
the fourth, which nothing calls.

## And the tables are fine, which was checked rather than assumed

A file being unreachable does not make it safe to archive. Retiring
`migrations/0010_operating_system_foundation.sql` earlier in this same work
order removed the **only** creator of `contradiction_links` from install-fresh,
and every repository-only gate stayed green — `ci:duplicate-table-ddl` went
51 → 47, `ci:unbacked-tables` passed, every schema-contract test passed. A live
database is what caught it.

So each file was checked against a database built from empty by
`scripts/db/provision-test-db.sh` (install-fresh + deploy-migrate, 1,228 tables):

- **31 tables** would lose their last non-archived `.sql` creator. **29 of them
  do not exist on that database at all** — they are tables from files nothing
  runs, so archiving records a fact rather than causing one. The remaining two
  (`billing_budgets`, `billing_alerts`) are in the `drizzle-kit push` surface
  and are live.
- **Every `ALTER TABLE … ADD COLUMN` target in all fifteen files is present
  live** — `organizations.industry_mode`, `audit_logs.created_at`,
  `audit_logs.table_name`, `projects.parent_project_id`, `projects.depth`,
  `projects.path`, and the three `concept2cure_artifacts` version columns.
  Zero missing. They come from `shared/schema.ts` via push, not from these
  files.

## Why the concept2cure files were dead in particular

`drizzle-kit push` runs at install-fresh **step 2**, before the overlay. By the
time any `CREATE TABLE IF NOT EXISTS` in these files could run, push has already
created the table, so the statement is a silent no-op. The live database proves
it: every object *unique* to these files is absent — six triggers, three
functions (`set_tenant_id`, `concept2cure_prevent_message_mutation`,
`concept2cure_prevent_artifact_version_mutation`), the four
`concept2cure_*_tenant_policy` policies (the live tables carry only
`tenant_isolation_policy`, from `migrations/0021_enable_rls_everywhere.sql`), and
indexes such as `c2c_artifact_versions_artifact_idx` and `c2c_sig_type_idx`.
Meanwhile the live `concept2cure_artifacts` carries `ana_thread_id`,
`title_slug`, `citations`, `citation_run_id` and `citations_at`, which appear in
none of these files and all of which are in `shared/schema.ts`.

## The files

| File | Tables it defined a second time | The real creator |
|---|---|---|
| `20260128_concept2cure_foundation.sql` | `concept2cure_conversations`, `_messages`, `_artifacts`, `_artifact_versions` | `shared/schema.ts` (push) |
| `20260128_concept2cure_signatures.sql` | `concept2cure_signatures` | `shared/schema.ts` (push) |
| `20260128_concept2cure_wbs_assignments.sql` | `cro_team_assignments`, `project_tasks`, `project_workflow_stages` | `shared/schema.ts` (push) |
| `20260311_concept2cure_artifacts.sql` | `concept2cure_artifacts`, `_artifact_versions` | `shared/schema.ts` (push) |
| `20260311_concept2cure_provenance_events.sql` | `concept2cure_provenance_events` | `shared/schema.ts` (push) |
| `20260313_concept2cure_submission_snapshots.sql` | `concept2cure_submission_snapshots`, `_review_comments` | `shared/schema.ts` (push) |
| `20260313_phase11_governed_workflow.sql` | `concept2cure_provenance_events`, `_submission_snapshots`, `_review_comments` | `shared/schema.ts` (push) |
| `20260129_add_org_industry_stripe_audit_logs.sql` | `audit_logs` | `shared/schema.ts` (push) |
| `20260129_proof_audit_logs.sql` | `proof_audit_logs` | `shared/schema.ts` (push) |
| `20260209_create_pm_settings.sql` | `pm_settings` | `shared/schema.ts` (push) |
| `20260216_enterprise_4pillar_expansion.sql` | `project_modules`, `project_rules`, `rule_execution_log`, `sentinel_findings` | `shared/schema.ts` (push) |
| `20260319_billing_usage_budgets_alerts.sql` | `api_usage_logs` (+ `billing_budgets`, `billing_alerts`) | `migrations/20260702_usage_model_credit_ledger.sql` for `api_usage_logs`; push for the other two |
| `20260402_supply_chain_tables.sql` | the five `supply_chain_*` tables | `shared/schema.ts` (push) |
| `20260718_bla_assessments_store.sql` | `c2c_bla_assessments` | `migrations/20260604_bla_workbench.sql` (install-fresh overlay #67) |
| `029_strategy_step2.sql` | `strategy_p34_exports` | `db/migrations/030_stability_results.sql` (**deploy-migrate #72**) |

### `029_strategy_step2.sql` is worth reading twice

Its `strategy_p34_exports` declares `export_id`, `fmt`, `tokens_json` and
`created_by`. The live table has none of those — it has `id`, `export_type` and
`tokens`, which is 030's shape, and even the index name live is 030's
(`idx_strategy_p34_exports_process_id`, not 029's `..._proc`). Its other three
tables — `strategy_pat`, `strategy_changes`, `strategy_signoffs` — exist on no
database anywhere and have no other definition in the repository. Nothing reads
any of the four: a repo-wide grep across `.ts/.tsx/.js/.mjs/.py` returns zero
hits.

The same mistake one table over is already a fixed bug:
`server/src/routes/stability.router.ts:1213` records that `stab_exports` was
queried with `tokens_json` / `markdown_content` / `generated_at` — *"All three
were unknown columns, so pushing P.8 content to authoring recorded nothing and
42703'd on every call."*

## Three non-migration SQL dumps went to `sql/_legacy/` in the same change

`server/database/schema.sql`, `server/db/ectd-schema.sql` and
`server/schema/regulatory.sql` are hand-written dumps sitting inside `server/`.
They are on no applier, they have **zero** references from any `.ts`, `.js`,
`.mjs`, `.sh` or `.yml` file, and all 24 tables they define exist on no
database. They were renamed on the way (`server-database-schema.sql` and so on)
because `schema.sql` is too generic a name for a shared archive.
