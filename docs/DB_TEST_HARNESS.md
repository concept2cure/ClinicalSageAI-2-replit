# The live-database test harness

```bash
npm run db:provision-test          # build it (several minutes)
npm run db:provision-test:status   # is it there, and how big
```

Then:

```bash
export DATABASE_URL='postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable'
export TEST_DATABASE_URL="$DATABASE_URL"
export RLS_ENFORCE=on
npm run test:db
npm run ci:tables-live-schema
```

---

## Why this exists

Three things in this repository can only be answered by a real, fully
provisioned PostgreSQL:

- **`ci:tables-live-schema`** — does a table the server queries actually exist
  after provisioning? Its own header explains why the repo cannot answer:
  *"Both compare the repo to itself, and a repository can always answer yes about
  its own text … Only a live database can tell them apart."*
- **The RLS coverage checks** — is a policy attached, and does it filter?
- **`tests/db/*.dbtest.ts`** — the tier that runs with `pg` unmocked, including
  the two-tenant isolation proofs.

CI has had that database since the `blank-db-provisioning` job was written
(`.github/workflows/ci.yml`). A developer did not, so those answers were
reachable only by pushing.

**That gap cost something specific on 2026-09-10.** Retiring the duplicate
`migrations/0010` removed the *only* creator of `contradiction_links` from
install-fresh — and `ci:duplicate-table-ddl` went 51 → 47, `ci:unbacked-tables`
stayed green, and every schema-contract test passed. Nothing in the repository
could see it, because *"does this table exist after a real provisioning run"* is
not a question about the repository. A live database found it in one command.

## What it does

Deliberately the same sequence CI runs, so a local green and a CI green mean the
same thing:

| | Step | Notes |
|---|---|---|
| 1 | `scripts/setup-local-db.sh` | cluster up; idempotent; delegated, not reimplemented |
| 2 | `DROP` + `CREATE` the database | **always from empty** — see below |
| 3 | `scripts/db/install-fresh.mjs` | drizzle push + raw overlay + RLS rollout + governed-content tree |
| 4 | `scripts/db/deploy-migrate.mjs` | the out-of-band C2C set (RULE 1 replay) |

Expect roughly **1,228 base tables**, `✅ Schema migration complete`, and a
readiness contract reporting the authoring subsystem 19/19, tenant-parentage FKs
6/6, and `tenant_isolation_policy` on 19/19.

### It always drops

A database carried forward across runs accumulates tables from DDL no deploy will
ever reproduce — which is the drift being measured. Reusing one would make the
harness lie in the reassuring direction.

## Two things that make the difference between proving something and nothing

### `pgvector` is required

Without `postgresql-16-pgvector`, install-fresh skips ~100 vector-dependent
objects and 11 governed-content files. It **says so** — it does not report
success. But a harness built on that database answers `ci:tables-live-schema`
with ~100 absences that are a missing extension rather than schema defects.

The script refuses to proceed without it. `--allow-incomplete` overrides, and
prints what you are then not entitled to conclude.

```bash
apt-get install -y postgresql-16-pgvector
```

### The non-superuser role, and `RLS_ENFORCE=on`

`install-fresh` provisions `app_service` as
`LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`, but only
when `APP_SERVICE_DB_PASSWORD` is set. The script sets a local-only default so
this cannot be forgotten, and reports the role's posture at the end
(`app_service role: ok`).

This is not housekeeping. **A superuser bypasses RLS unconditionally, and an
owner bypasses it unless the table carries `FORCE`** — so a probe connecting as
the owner passes while proving nothing. `tests/db/rls-tenant-isolation.dbtest.ts`
opens with exactly that account: 787 policies with correct semantics, filtering
nothing, because the application connected as a role that owned every table.

The same trap exists one layer up. The canonical policy's first `USING` clause is

```sql
NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
```

so with `RLS_ENFORCE` unset **the policy passes everything**. An isolation test
that forgets it is green and worthless.

Two further doors the policy opens, worth knowing before writing a probe: it also
grants on `app.current_org_id`, and on
`current_setting('app.current_user_role') = 'app_super_admin'`. A probe that sets
only `app.current_tenant_id` leaves both untested.

## Relationship to CI

This mirrors `blank-db-provisioning` in `.github/workflows/ci.yml`, which runs on
every push and additionally asserts that `deploy-migrate` **refuses** an
unprovisioned database, that it is idempotent, and that RLS covers every
org-keyed table. Running the harness locally does not replace that job; it lets
you get its answers before pushing.
