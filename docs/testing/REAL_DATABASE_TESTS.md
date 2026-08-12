# Real-database tests (`*.dbtest.ts`)

How to run, read, and add tests that execute against an actual PostgreSQL
server — and why they live in their own vitest project rather than alongside
everything else.

---

## The defect this exists to end

`tests/setup.ts` installs a process-wide `vi.mock('pg')`:

```ts
// tests/setup.ts:47
vi.mock('pg', () => ({ Pool: vi.fn(function () { return mockPool }) }));
```

It is the setup file for the default vitest project, so it applied to all ~1,600
test files. For unit tests that is correct — they should not need a database.

It was also in force in the CI job named **Integration Tests**, which starts a
real PostgreSQL service, applies migrations to it, and then ran the suite under
that mock. `new Pool().query(...)` resolved to `{ rows: [], rowCount: 0 }`
without a packet ever leaving the process.

The consequence is worse than "no coverage". An empty result set is
indistinguishable from a query that was never sent, so:

- a broken tenant predicate returned `[]` and read as "no rows for this tenant";
- SQL referencing a column that does not exist never raised, because it never
  ran;
- schema drift could not be detected by any test;
- and the job was green in every one of those cases.

Separately, no CI job ran a single test with `RLS_ENFORCE=on` — the mode
production hard-requires — so behavior that only appears under enforcement had
no coverage at all.

## The split

| | Default project | Real-database project |
|---|---|---|
| Config | `vitest.config.ts` | `vitest.db.config.ts` |
| Setup | `tests/setup.ts` (mocks `pg`) | `tests/setup.db.ts` (does not) |
| Files | everything else | `*.dbtest.ts` |
| Command | `npm test` | `npm run test:db` |
| Database | none — stubbed | a real server, required |
| `RLS_ENFORCE` | unset | `on` |

`**/*.dbtest.ts` is in the `exclude` list of every mocked config, so the two
projects cannot overlap. The mock is not weakened anywhere; it is scoped.

## Running them

```bash
# any disposable PostgreSQL will do — CI uses the pgvector/pgvector:pg15 service
export TEST_DATABASE_URL='postgresql://postgres@localhost:5432/concept2cure-ri_test'
npm run test:db
```

The suite **fails** rather than skips when the database is missing, unreachable,
or still set to the unit-test placeholder URL. A
`describe.skipIf(!process.env.DATABASE_URL)` would reproduce the original defect
exactly — green output, nothing executed, no signal — so it is deliberately not
available.

## What is covered today

**`tests/db/pg-mock-scoping.dbtest.ts`** — the regression test for the defect
itself. Asserts `pg` is not a mock, that a value only a real backend can compute
comes back, that state written by one pool is visible to another, and that the
fail-closed configuration checks fire. If the mock is ever reintroduced into this
project, these fail loudly instead of passing silently.

**`tests/db/rls-tenant-isolation.dbtest.ts`** — tenant isolation, executed.
Against a live server with the canonical `0021_enable_rls_everywhere.sql` policy
installed and `RLS_ENFORCE=on`:

- the policy genuinely filters `SELECT` / `UPDATE` / `DELETE` for the
  non-superuser role that `scripts/db/provision-app-role.mjs` mints;
- `WITH CHECK` refuses an `INSERT` that would plant a row in another tenant;
- an unscoped connection sees **nothing**, not everything (fail-closed);
- `RLS_ENFORCE=off` compiles the policy to a no-op, as the rollout knob intends;
- a **superuser/owner** connection is *not* filtered — the mechanism that makes
  all 787 policies inert while the app connects as the owning superuser, and
  therefore the reason the role split is a prerequisite rather than a nicety;
- `assessRlsCatalogPosture` reports that difference correctly when run against a
  real `pg_roles` catalog rather than the hand-written rows the existing unit
  test feeds it.

These are the regression harness for the role split. When the runtime is pointed
at `APP_DATABASE_URL`, this suite is what proves it took.

## Adding a test

1. Name the file `*.dbtest.ts` and put it under `tests/db/` or any
   `server/**/__tests__/` directory.
2. Import `databaseUrl` from `tests/setup.db`. **Never** import `tests/setup` —
   that would reinstall the `pg` mock and quietly stub every query in the file.
   `ci:db-test-isolation` fails the build if you do.
3. Use `createScratchSchema()` from `tests/db/harness.ts` for anything that
   needs tables or a non-superuser role. It builds a uniquely-named schema, can
   mint the runtime role with the real provisioning script, and drops both in
   `destroy()` — the suite is safe to run against a database that already holds
   application tables and leaves nothing behind.
4. Scope session settings with `withSession()`, not bare `pool.query('SET …')`.
   GUCs live on a *connection*: a `SET` through the pool followed by an assertion
   through the pool may land on two different connections and test nothing. For
   the same reason `withSession` issues `RESET ALL` on both sides — a released
   client otherwise carries the previous test's tenant scope into the next
   checkout, which is exactly how the first draft of these tests produced a
   false pass.

## The guards

| Guard | What it fails on |
|---|---|
| `npm run ci:db-test-isolation` | a mocked config that stopped excluding `*.dbtest.ts`; a db test importing `tests/setup`; `tests/setup.db.ts` mocking `pg`; or **no db tests existing at all** — a guard with nothing to check reports green forever |
| `npm run ci:check-unrun-tests` | a `*.dbtest.ts` matching no runner's include globs. It reads the globs out of both configs rather than restating them |
| `tests/setup.db.ts` (runtime) | `pg` being mocked when the suite boots — the static guards' backstop |

## Known limits

This project currently covers the database layer directly: RLS behavior, role
posture, and the policy's agreement with its migration. It does **not** yet
drive HTTP routes against a fully provisioned schema, so route-level SQL is
still only covered by the mocked suite. That is the next increment — the harness
here is what makes it possible.
