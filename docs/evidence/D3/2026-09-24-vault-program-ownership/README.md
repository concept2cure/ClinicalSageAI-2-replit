# D3 — the vault's owner and delegates were decided by rows any tenant could write

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-24. **Found by** this lane while filing
`../2026-09-24-rag-pipeline-tenant/`, whose "still asserted" list pointed at the
vault's authorization functions. It was claimed before any fix was written.
**Database:** PostgreSQL 16. The runtime connects as `app_service` (not
superuser, no BYPASSRLS) with `RLS_ENFORCE=on`. The contract asserts that
posture in its first case. See `posture.txt`.

**What this is not:** the row's closing evidence, which is the contract against
staging with the production image, owed with D1.

## The defect

Every `vault.documents` and `vault.document_chunks` policy authorizes through
`core.can_access_program` / `core.can_write_program` → `identity.*`. Those
answer from two inputs, and a tenant could write both.

**1. Who owns a program.** `core.get_program_org_id` read `core.programs`, then
`core.program_ownerships`, and only then the canonical registry,
`public.regulatory_programs` → `organizations.uuid`. Its creator,
`20260828_program_org_resolution_canonical.sql`, kept the GCC tables first on
purpose, "so any environment that does carry core.programs rows keeps its
existing resolution". Both GCC tables take a row from any tenant whose `org_id`
is its own, keyed by **any** program id. Their policy checks the org, not whose
program the id is. So in tenant A's scope:

```sql
INSERT INTO core.programs (id, name, org_id) VALUES (<B's program>, 'planted', <A>);
```

made A the owner of B's program. A read B's documents, and B could no longer
read its own (`red/psql-planted-core-program.txt`). An org-less `core.programs`
row plus a `core.program_ownerships` row did the same.

**2. Who is a delegate.** `identity.org_relationships` holds sponsor → delegate
grants, such as a CRO working a sponsor's submissions. The access functions
honour a live row naming the program's owner as sponsor. The table had **no
RLS**, and `app_service` may insert and update it. With one row naming B as
sponsor and itself as delegate, A read B's documents **and rewrote their
titles**. B's own view then showed the rewritten rows as though nothing had
happened (`red/psql-self-granted-delegation.txt`). A delegate could also turn a
read-only grant it had been given into read-write.

**Reach.** No application code writes `core.programs`,
`core.program_ownerships` or `identity.org_relationships`; only migrations do.
So no HTTP path is known to reach this. It is still the boundary D3 asks about:
any statement that runs as the runtime role, through any future writer, an
injection or a tool, could move it. The mechanism is the one
`../2026-09-24-update-boundary/` found: RLS checked the row's organization and
not the key the row points at.

## The contract

`tests/db/vault-program-ownership.dbtest.ts` is its own file on the shared
two-tenant fixture. Each org gets a `regulatory_programs` row and a
`vault.documents` row. Every statement runs through the application pool inside
a request tenant scope, so `poolInstrumentation` sets `app.current_org_id`
exactly as it does for a request.

| #   | Case                                                                                                                                                        | Unfixed                                   | Fixed |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----- |
| 1   | Posture: `app_service`, no bypass, `app.rls_enforce=on`, A's org GUC                                                                                        | pass                                      | pass  |
| 2   | Each tenant sees exactly its own document (positive control)                                                                                                | pass                                      | pass  |
| 3   | A's `core.programs` row naming B's program does not make A the owner. The plant must land, or the case proves nothing                                       | **fail** — A reads B's                    | pass  |
| 4   | Nor does an ownership row behind an org-less `core.programs` row                                                                                            | **fail** — A reads B's                    | pass  |
| 5   | A cannot grant itself delegate access to B, and cannot rewrite B's document                                                                                 | **fail** — `written`                      | pass  |
| 6   | A grant B makes still reads (feature positive control); the delegate cannot widen it to read-write, a read-only delegate cannot write, and revoking ends it | **fail** — the delegate widened its grant | pass  |

| File                                                                        | Shows                                                                                                                                                                                                     |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `red/unfixed-4-fail.txt`                                                    | **4 fail, 2 pass**, before the fix.                                                                                                                                                                       |
| `red/psql-planted-core-program.txt`, `red/psql-self-granted-delegation.txt` | The same attacks in plain SQL, `SET LOCAL ROLE app_service` with RLS enforcing, rolled back. Script and output.                                                                                           |
| `red/M1-resolver-gcc-first.txt`                                             | Only the resolver reverted: **cases 3 and 4 fail**.                                                                                                                                                       |
| `red/M2-org-relationships-rls-off.txt`                                      | Only the new RLS removed: **cases 5 and 6 fail**. Each half of the fix is load-bearing on its own.                                                                                                        |
| `green/fixed-6-of-6.txt`                                                    | **6 of 6** on `c2c_d3`, after both mutations were reverted.                                                                                                                                               |
| `green/from-empty-22-suites.txt`                                            | A database **provisioned from empty** by `scripts/db/provision-test-db.sh` at this tree (exit 0). Every suite on the shared fixture plus every vault suite: **22 files, 207 of 207**, the new 6 included. |
| `posture.txt`                                                               | Role flags, RLS/FORCE and the runtime's INSERT grant on the five tables, the four new policies, and the live `core.get_program_org_id`.                                                                   |

The red runs and `green/fixed-6-of-6.txt` ran before the one `describe` was split in two for the function-length limit. The case bodies did not change, and the from-empty run is on the split file.

## The fix

- **The canonical registry decides ownership.**
  `20260828_program_org_resolution_canonical.sql` is **amended in place** (Rule
  1), with a dated note. `regulatory_programs` is consulted first, and the GCC
  tables only for an id it does not hold. A `regulatory_programs` row cannot be
  planted over another tenant's: its id is its primary key and its policy keeps
  `organization_id` the writer's own. Nothing that resolved before resolves
  differently, unless the two registries disagreed about the same id, which is
  the case this closes.
- **A grant is the sponsor's to make.** A new
  `migrations/20260924_org_relationships_sponsor_rls.sql`, in
  `C2C_MIGRATION_FILES` just above the final isolation pair, enables and FORCEs
  RLS on `identity.org_relationships`:

  - SELECT: the sponsor and the delegate each see the rows naming them;
  - INSERT, UPDATE, DELETE: the sponsor only, and an UPDATE cannot hand the row
    to another sponsor.

  It uses the same `app.rls_enforce` shadow clause and extracted org GUC as the
  uuid sweep, which cannot express a two-key rule. It converges on every run:
  `ALTER POLICY` when a policy exists, `CREATE` when it does not, and nothing is
  dropped. Applied twice in a row, both clean.

Gates: `ci:migration-set-order`, `ci:migration-drop-safety`,
`ci:migration-reachability` and `ci:migration-prefix-collisions` all OK. The
migration-list contract tests pass (73 of 73, and the manifest test 9 of 9).

## Still asserted, not proven

- **A GCC-only program with an org-less `core.programs` row** can still be
  claimed through `core.program_ownerships`. The product creates no such rows;
  on this database there are none. Closing it means tightening `core.programs`'
  policy (its `org_id IS NULL` arm), which the uuid sweep owns.
- **`identity.organizations` has no RLS and the runtime may write it.** No
  access check reads a column a tenant could usefully change there, but that is
  a reading, not a proof.
- **`app.bypass_rls = 'true'`** short-circuits `identity.can_access_program`,
  and any statement as `app_service` can set a custom GUC. That is the system
  scope's mechanism, pinned by `rls-bypass-does-not-outlive-release.dbtest.ts`,
  and a separate question from this one.
- `core.can_access_program` still returns TRUE when neither
  `identity.can_access_program` nor `auth.can_access_program` exists
  (`../2026-09-24-rag-pipeline-tenant/`). Not live on any provisioned database
  here.
- **Staging.** The row closes there, with the production image, owed with D1.
