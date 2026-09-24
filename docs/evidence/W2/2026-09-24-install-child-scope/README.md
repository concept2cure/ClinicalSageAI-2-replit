# A database built from blank installs again

**Row:** D1 (the deploy path: `install-fresh` then `deploy-migrate` on an empty
database). **Workstream:** W2. **Session:** `…01AiwZKG`. **Date:** 2026-09-24.

## What was wrong

`scripts/db/install-fresh.mjs` finishes by running the repository's tenant
coverage gate, `scripts/db/rls-coverage-check.sql`, and it refuses to report an
install complete while that gate names any table.

On 2026-09-24 the gate learned to flag child tables: tables with no tenant
column, row security off, and a foreign key into an RLS-protected parent. It
flagged those in `public` at 20:09 UTC (ledger L201) and those in every schema
at 20:35 (L203). The canonical way a child is scoped is
`db/migrations/20260813_child_table_parent_scoped_rls.sql`, an entry in
`C2C_MIGRATION_FILES`. Only `deploy-migrate` applies that set, and it runs after
`install-fresh`. So on a blank database the installer's own last check found the
children the next step would have scoped, and exited 1:

| Trunk | Installer on a blank database |
|---|---|
| `5066e9862` (after L201/L202) | exit 1, 80 tables (`red/install-fresh-at-5066e9862.txt`) |
| `d46d52515` (after L203) | exit 1, 83 tables (`red/install-fresh-at-d46d52515.txt`) |

L201's commit describes the gate as something "CI runs after install-fresh and
deploy-migrate". CI does run it there (`ci.yml`, "RLS coverage"). The installer
runs it too, and CI runs the installer as a step of its own in three jobs
(`ci.yml` "Provision from scratch", and the two `install-fresh &&
deploy-migrate` blocks). So from `2ddbfb6a6` on, Blank DB, Integration Tests
and Production Boot Smoke each fail at provisioning. The Actions queue had not
reached any of them yet, which is why nothing had reported it.

## The change

1. **The installer applies the child scope**, right after the tenant sweep. It
   already applies `20260801_tenant_isolation_sweep.sql`, another
   `C2C_MIGRATION_FILES` entry, for the same reason. It reads the same file, so
   there is still one canonical child scope. The file skips a table that does
   not exist yet and leaves an already-policied child alone, so
   `deploy-migrate`'s re-run is a no-op.
2. **It applies the uuid half of the final sweep pair first.** A child outside
   `public` is scoped through its parent's own policy. Some of those parents
   (`global_dossier.dossier_instances`) are uuid-keyed and are policied by
   `20260801_uuid_tenant_isolation_nonpublic.sql`. Without that file, the child
   scope skips `ai.risk_assessments` and `global_dossier.dossier_branches` as
   "parent is not scoped". The file is guarded the same way.
3. **`019_gcc_idempotency_ratelimit.sql` no longer creates
   `audit.request_correlations`.** It is amended in place, with a dated
   header note (Rule 1). Nothing reads or writes that table.
   `20260901_drop_dead_audit_tables.sql` drops it on every deploy (L13,
   `ci:dead-audit-tables`). It existed only between the two steps, as a child
   of `core.programs` with row security off: the last table the installer
   flagged. A dead table needs no policy, so it is removed at its creator,
   not scoped or carved out. The drop stays in place for databases installed
   before this change. `ci:dead-audit-tables` and `ci:migration-drop-safety`
   are OK.

If either applied file fails, the install records it as incomplete and
withholds the success banner. It does not pass silently.

## Proof (PostgreSQL 16 + pgvector, local)

| Step | Result |
|---|---|
| Red, both trunk heads above | exit 1 (80 tables, then 83) |
| Green: this change on `d46d52515`, blank database | exit 0; coverage after `install-fresh` alone: 0 rows (`green/install-fresh-with-change.txt`) |
| `deploy-migrate.mjs` twice after it | exit 0, exit 0; coverage 0 rows; `audit.request_correlations` absent |
| Equivalence: trunk's path vs this one, each followed by two deploys (`green/equivalence.txt`) | every `pg_policies` row in every schema identical (1876, 0 diff lines); `relrowsecurity` / `relforcerowsecurity` identical on all 1234 base tables |
| Real-database suites (57 files, 683 tests) | this path, rebuilt from blank: 683/683. Trunk's path: 683/683. One earlier run on this path gave 680/683, with a tenant-0 audit-chain fork (below). It was run while a second database was being installed on the same machine, and the complete schemas are identical: a 53,528-line `pg_dump -s` of each differs only in pg_dump's random session token |

The equivalence check shows that scoping children before the C2C set runs does
not freeze an older predicate onto a parent the set later changes. The final
database is the one the deploy path produces.

## Found on the way, not changed here

- **A blank database's first deploy leaves one child unscoped.** After
  `install-fresh` and ONE `deploy-migrate`, the gate names
  `regulatory_harmonization.export_job_audit_log`, the table L203 set out to
  close. It is scoped only on the second deploy. Its parent `export_jobs` is
  created inside the C2C set and policied by the uuid half of the final pair.
  The child scope runs before that pair, logs "the parent is not scoped …
  skipping", and the pair then policies the parent. The installer cannot close
  this, because the table does not exist at install time. CI cannot see it,
  because its coverage step runs after the idempotency re-run, so after two
  deploys. A coverage check after the first deploy would catch the whole class.
  Handed to the D3 lane.
- **The same shape, older:** `20260828_drop_orphaned_org_guc_policies.sql` drops
  an orphaned `*_org_policy` only where `tenant_isolation_policy` already exists,
  and on four of its five tables that policy comes from the final sweep. The
  first `deploy-migrate` on a fresh install logs "keeping
  project_sections.project_sections_org_policy — canonical
  tenant_isolation_policy is absent" for four tables, and "dropped 1
  policy(ies), skipped 4". The second logs "dropped 5 policy(ies), skipped 0".
  The policies are PERMISSIVE and inert, so this widens nothing. But the
  empty-string cast the file exists to defuse stays armed until the second
  deploy. Handed to the schema-guards lane.
- **The system audit chain can fork under load.** In one of four full-suite
  runs, `licensing-history`'s integrity cases failed because tenant 0's
  `audit_logs` chain forked. Row `chain_seq` 44 (`user_password_reset_failed`,
  written at 20:43:00 by an earlier suite) and row 45 (the first
  `module_packaging` write, 20:43:11) both commit to row 43. `chain_seq` is a
  global sequence, so row 44 was inserted first, yet row 45's writer read the
  head without it. Both writers go through `auditService.logAction`
  (`BEGIN`, advisory lock, head read, insert, `COMMIT`), and the table's policy
  cannot show one tenant-0 row and hide another. So the two writers did not
  contend on the same lock, or row 44's transaction stayed open for more than
  10 s. Not reproduced in the other three runs. An audit chain that
  the verifier reports as broken is a Part 11 §11.10(e) finding whatever the
  cause, so it is handed on with the data rather than written off as flaky.
- **`atom-search` is not failing.** L201 and L202 report the real-database
  suites as 53/54 files and 656/661 tests, with `tests/db/atom-search.dbtest.ts`
  failing on "the pre-existing `search_atoms_hybrid` signature defect". That
  was fixed in `881680d73` (19:01 UTC), an ancestor of both commits. On a
  database built from blank at trunk, it passes 5/5. The database behind those
  numbers predates the fix.
