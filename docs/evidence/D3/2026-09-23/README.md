# D3 — the production boot gate could not see the bypass it exists to catch

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-23. **Database:** the local reference install, provisioned by
`install-fresh` + `deploy-migrate` on this date (977 public tables).

## The defect

`assertRlsCatalogPosture` (`server/db/rlsEnforcement.ts`) is the control that
production boot runs to prove tenant isolation is actually filtering. It asked
two questions:

1. is the runtime role itself exempt (superuser, or `BYPASSRLS`)?
2. is every tenant-keyed table **in `public`** RLS-enabled, FORCEd and policied?

It never asked the third:

3. does the runtime role **own** any RLS-enabled table that is not FORCEd?

PostgreSQL exempts a table's owner from its own policies unless
`FORCE ROW LEVEL SECURITY` is set. So a runtime that connects as the table
owner — the default on a single-role install, and on many managed Postgres
provisions — reads every tenant's rows on such a table with `RLS_ENFORCE=on`, a
correct policy installed, and nothing anywhere reporting a problem.

Question 2 could not catch it, because it reads `table_schema = 'public'` alone
and this product keeps its Part 11 core outside `public`: `vault.documents`,
`identity.users`, `signing.signatures`, `evidence.hash_ledger`.

`scripts/validation/run-iq.mjs` already raises **IQ-DEV-006** on exactly this
condition. The server did not check it, so a deployment could pass boot and
fail its own IQ.

## The evidence

| File | What it shows |
|---|---|
| `red/boot-gate-passes-on-an-open-database.txt` | The gate as it stood, run against this database: **0 failures, boot would proceed.** |
| `red/cross-tenant-read-demonstrated.txt` | A Sponsor A session with `app.rls_enforce=on` reading Sponsor B's row through a correct policy, plus the count of real tables in that state: **117 across 16 schemas, every one owned by the runtime role.** |
| `green/boot-gate-refuses-the-same-database.txt` | The same assessment after the fix, same database, same role: **1 failure, boot refuses**, naming both halves of the remedy. |

The red file was produced by restoring the pre-fix `rlsEnforcement.ts` from
`HEAD` and running the assessment against the live pool; the green file by
running the same script on the fixed file. Nothing was simulated.

## The fix

The assessment now asks the third question, over every non-system schema rather
than `public` alone, and reports it as one readable failure carrying the remedy:
connect as the non-owner runtime role (`APP_SERVICE_DB_PASSWORD` at
provisioning, `APP_DATABASE_URL` for the runtime), or apply
`FORCE ROW LEVEL SECURITY` to the tables listed.

It is keyed on RLS being **enabled**, not on a tenant-column heuristic: an
RLS-enabled table is one somebody decided to police, and a policy that cannot
run is a defect whatever the column is called. A table with RLS off is not
reported, and neither is one the runtime role does not own — for that
connection the policy does run.

`server/db/__tests__/rlsEnforcement.test.ts` pins both directions, including
that the **production posture still passes**: running as the non-owner app role
the catalog query matches nothing and the new check contributes no failure.
Three of those cases were seen to fail with the check disabled.

## What this does NOT close

The 117 tables are still not FORCEd. This change makes an unsafe posture refuse
to boot rather than serve; it does not make owner-connected operation safe,
because it cannot be made safe. The production remedy is the non-owner runtime
role D3 already requires.

Applying `FORCE` to those 117 was considered and deliberately not done here.
The `public` policies carry the
`app.rls_enforce IS DISTINCT FROM 'on'` leading disjunct, so FORCE is inert for
them during a migration; the non-public policies (`vault.*`, `identity.*`,
`signing.*`) use `core.can_access_program(...)` with no such disjunct, and
FORCEing those would block the owner-run migrations and seeds that populate
them. That is a per-policy-family change with its own migration surgery and its
own evidence, not a line to add to a sweep.
