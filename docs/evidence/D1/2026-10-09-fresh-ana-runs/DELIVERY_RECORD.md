# Fresh-install AnA run dependency repair

Date: 2026-10-09.
Repository: concept2cure/ClinicalSageAI-2-replit.
Branch: concept2cure-v2 only.
Starting commit: c91dba52643166621a33ec7eab4ca2fc143a2c02.
Launch workstream: D1 provisioning; no product or UI expansion.

## Observed failure

Tier 5 Browser Smoke run 37967630759, job 113945869322, failed
"Provision the application schema from scratch" and skipped the authenticated
browser smoke. The installer reported one incomplete area: the raw overlay
could not apply migrations/20261008f_ana_run_events.sql because ana_runs did
not exist. The named-schema re-sweep failed for the same reason.

The existing deploy path applied the event migration successfully later in
that job because its ordered migration set creates ana_runs first. The fresh
installer never walks all of db/migrations, where the parent creator lives.

The later auth_users error was inspected separately. scripts/seed-admin.mjs
upserts users and organization_users first, then catches failure of an optional
legacy auth_users sync. It was not the fatal provisioning error. No new legacy
authentication table or authentication bypass is introduced by this repair.

## Repair

scripts/db/install-fresh.mjs now includes the EXISTING canonical creator,
db/migrations/20260917_ana_runs.sql, in PRE_OVERLAY_CREATORS before the root
migration overlay. Its original transaction/error handling is unchanged.

The parent migration needs organizations and users, already created by the
preceding push step. It is additive and replayable, including the six detach
columns added in place on 2026-10-08. No copy of its schema is introduced.
The event migration, foreign key, guards, purge-function ownership and tenant
policy sweeps are unchanged. No skip classification or --allow-incomplete
exception was added. A failed creator still fails provisioning.

## Regression and workflow coverage

Added tests/schema-contracts/install-fresh-ana-runs.pglite.test.ts:

1. Execute the actual pre-overlay loop, with a query double, and require the
   canonical parent SQL exactly once inside BEGIN/COMMIT before root overlays.
   Removing its list entry must remove its execution (mutation control).
2. Inject a parent-query error and require the installer loop to throw.
3. Execute the real child migration without its parent in PGlite, reproduce
   PostgreSQL error 42P01, and require rollback to leave no event table.
4. Execute the selected canonical parent and real child migrations in PGlite;
   replay both over populated tables without losing rows; require the event
   FK to reject an absent run and the UPDATE/DELETE/TRUNCATE guards to remain.

Only external prerequisite tables are fixtures in these focused SQL tests.
They do not substitute for full provisioning, production RLS, concurrency,
application login or the browser journeys.

.github/workflows/tier5-browser-smoke.yml runs this suite before full
PostgreSQL provisioning and preserves its log in the existing smoke artifact.
pipefail preserves the test exit status. The golden journey still runs after
an isolated first-browser-spec failure, but no longer runs over a failed or
skipped provisioning step. The job does not turn failed provisioning green.

## Validation and publication boundary

Before publication: the new test passed TypeScript syntactic transpilation
with zero diagnostics. The workflow parsed as YAML and its blocking-step,
provisioning ID and golden-journey dependency assertions passed.
The final GitHub diff is inspected before the canonical ref is advanced.

This runtime has no full repository checkout, PostgreSQL server, Vitest or
PGlite installation and cannot resolve GitHub/npm hosts for installation.
Therefore the native suite, full fresh install, browser journeys, semantic
typecheck, full build and local pre-push hook were NOT run locally. Direct
GitHub API publication does not execute a local hook. Native qualification is
provided by the new commit's own GitHub Actions results, not by these local
syntax checks or by the previous commit's results.

Publish directly by non-forced, expected-head-checked update to concept2cure-v2;
no pull request or secondary branch. The commit and subsequent branch read are
the publication receipt. This repair makes no claim of complete IND readiness
or that unrelated CI failures are resolved.

## Reproduction

npx vitest run --config vitest.config.ts tests/schema-contracts/install-fresh-ana-runs.pglite.test.ts

For full qualification, use the existing Tier 5 workflow on its disposable
pgvector PostgreSQL service: fresh provisioning, authenticated browser smoke,
and the governed golden journey must each succeed. Do not point a fresh-install
experiment at a customer database. Roll back code with a reviewed revert on the
canonical branch, not a force reset or schema/data deletion.
