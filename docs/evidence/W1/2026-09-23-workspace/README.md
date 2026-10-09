# D2 regression: self-serve signup failed under production RLS, 2026-09-23

**Launch row:** D2, the launch catalog: a new organisation gets its six apps.
The D6 session found this while running the full real-database suite, and
fixed it with a workflow of three mappers and a critic. The author session of
`a264e291a` was idle, waiting on an owner decision on other work.

## What was wrong

`a264e291a` ("Every organisation gets its own client workspace") added
`ensureOrganizationDefaultWorkspace` to all three organisation creators:
self-serve signup, first-run setup and the boot seed. `client_workspaces` is
RLS-enabled and FORCED. Its `tenant_isolation_policy` admits a row only for the
scope's own tenant, or for `app_super_admin`.

| Creator | Scope its transaction runs in | Result before the fix |
|---|---|---|
| Self-serve signup (`POST /api/auth/signup`) | pre-auth: tenant `'0'`, no role | **Every signup answered 500 AUTH_010** under `RLS_ENFORCE=on`, the only posture production accepts: `42501 new row violates row-level security policy for table "client_workspaces"`. The transaction rolled back, so no organisation was created. The workspace count before the insert was also silently filtered to 0. |
| First-run setup (`POST /api/setup/initialize`) | system scope (`app_super_admin`) | Passed on a real database through the super-admin arm. Its unit test failed on `main` (`tx.select is not a function`): the mock was stale, not the code. |
| Boot seed (`seedOrganizations`) | owner connection with no `app.rls_enforce` | Passed only because enforcement was off on that connection. With enforcement on, it failed with 42501 (reproduced). |

The route logged only Drizzle's "Failed query: insert into client_workspaces …"
text, so the PostgreSQL reason was invisible in the log.

## The fix: one mechanism, in the writer

`server/services/c2c/organization-default-workspace.ts`:
- The `WorkspaceStore` interface gains `enterOrganizationScope(orgId)`.
- `ensureOrganizationDefaultWorkspace` calls it first, before the count as well
  as the insert, after refusing any `orgId` that is not a positive integer.
- Both bindings implement it with the existing canonical helper
  `setTenantContextTx`, a transaction-local `set_config`. The Drizzle binding
  reaches the helper through `queryableFromDrizzle`.
- It sets no role and uses no super-admin bypass; the row passes the policy on
  its own tenant arm.
- The setting ends at COMMIT or ROLLBACK. On the same pooled connection it
  reads `''` after COMMIT, as proved in the dbtest.
- None of the three creators changed. Each inherits the step.
- The organisation and its workspace stay atomic in one transaction, because
  `projects.client_workspace_id` is NOT NULL.

The writer enters whatever tenant it is given, so its callers are pinned. A
unit test fails if anything other than the three creators calls it; it was
shown failing on a rogue caller.

## Evidence

| File | What it shows |
|---|---|
| `dbtest-signup-before-fix.txt` | `tests/db/signup-launch-catalog.dbtest.ts` with HEAD's writer: 8 of 16 fail. These are the six signup cases (500), the pre-auth scope probe and the boot seed under enforcement. |
| `dbtest-signup-after-fix.txt` | 16 of 16 pass, as a NOBYPASSRLS runtime role with `RLS_ENFORCE=on`. They cover a signup under the real routes, exactly one marked workspace for the new organisation, the three creators' scopes, and a refused workspace write that leaves no organisation, user, membership or workspace behind. |
| `mutations-signup.txt` | Two atomicity mutants in `auth.ts`, both killed by the refused-write case: the workspace error swallowed, and the workspace written after the commit. Tokens redacted. |
| `unit-before-fix.txt` / `unit-after-fix.txt` | The writer's unit tests and `setup.test.ts`: 8 fail with HEAD's writer; 33 of 33 pass after. |

`setup.test.ts` now records every statement of the first-run transaction by
table, in order: the organisation, its admin, the tenant step, the workspace
count and the workspace insert. A refused workspace write gives 500 with no
token.

## Still owed

- Staging, with D1: a signup through the deployed stack.
- The route could log the error's `cause` (the PostgreSQL reason), so the next
  refusal is legible. Not done here: that is `auth.ts`'s logging, and the owner
  may want one convention for it across routes.
