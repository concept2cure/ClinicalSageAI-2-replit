# An isolation switch set during one request does not reach the next (D3)

**Date:** 2026-10-08 · **Row:** D3 (tenant isolation) · **Session:** `…01471vSKg1KXj3ijXDiyvXGX`

## The decision, and why it changed

Earlier on 2026-10-08 I decided, as product owner, that tenant isolation must not be switchable off by the runtime login (`app_service`). The work was to honour the three switches (`app.rls_enforce`, `app.bypass_rls`, `app.is_admin`) only for an owner or `BYPASSRLS` role, across every policy, before the pen test.

Measuring first showed that premise was wrong. On PostgreSQL 16, as `app_service` with enforcement on, in tenant 1's scope:

| The session did | It read |
|---|---|
| nothing | tenant 1's program |
| `SET app.current_tenant_id = '2'` | tenant 2's program |
| `SET app.rls_enforce = 'off'` | both |

The tenant selector is itself a session variable, so a session that can run its own SQL reaches any tenant, one id at a time, with or without the switches. The policies (962 of 1,158 read `app.rls_enforce`, plus a `app_super_admin` arm and the `bypass_rls` helpers) protect against code that forgets a tenant predicate. They are not a boundary against injected SQL. Role-gating 962 policies would therefore not have bought the security the decision assumed, and a true SQL-level boundary (per-tenant roles or a signed context) is post-launch design work.

The mapping (four readers and a critic, `d3-session-switch-understand` workflow) found the concrete, live risk instead: **a switch outlives the request.** Production turns enforcement on only in the connection's startup packet (`server/db/rlsEnforcement.ts`). The per-request cleanups reset only the three tenant variables, and nothing reset the switches. So one `SET app.rls_enforce = 'off'` on a runtime connection, from a bug or an injected statement, went back to the pool with isolation off. The next request, from any tenant, then read every tenant's rows.

**Revised decision:** close that leak, gate every writer of the switches, and record the honest threat model. That is what this change does. The record on the board is corrected the same way.

## The change

- **New `server/db/sessionScope.ts`, the one place a pooled connection's scope is set and cleared:**
  - `applySessionScope`: the three tenant variables plus the switch pins (enforcement to this deployment's mode, both bypass switches empty), in one statement;
  - `clearSessionScope`: the tenant variables and both bypass switches emptied, then `RESET app.rls_enforce`, which restores the startup value (`on` in production; proven on PostgreSQL 16);
  - `switchPinTerms`: the pin for a transaction-local scope.
- **Applied wherever a scope is applied:** request scope (`establishRequestTenantScope.ts`, per-user and system), `withTenantConnection.ts`, the instrumented pool's per-transaction statement (`poolInstrumentation.ts`, pinned LOCAL), `governed-tenant-context.ts`, and the router copy in `server/src/routes/stability.router.ts`. Four hand-written copies of the apply/clear become one.
- **Cleared wherever a request connection is released:** `lazyRequestDbClient.ts`, `withTenantConnection.ts`, and the router copy.
- **Gate:** `ci:session-scoped-rls-bypass` gained a second rule. Any write of a switch in server code (`SET`, `SET LOCAL`, `SET SESSION`, `set_config`), tests excluded, must be in a named allowlist with an exact count:
  - `sessionScope.ts`: 5;
  - `innovation-routes.ts` guardQuery: 1;
  - the seven frozen innovation services, at their existing baseline.

  `RESET` is not counted, because it only restores a default.

## Proof

| Check | Red | Green |
|---|---|---|
| `tests/db/isolation-switch-does-not-outlive-request.dbtest.ts`: real PostgreSQL, `app_service`, a one-connection copy of production's runtime pool, the real request client and primitives | `red-against-trunk.txt`: 4 fail with trunk's applier. Tenant B's request reads "A,B" after tenant A's request turned enforcement off; the pool's own statements leak too. The control case shows the leak is real. | `green.txt`: 7/7 |
| Each part load-bearing (`mutations.txt`) | No release clear: the release case fails. No pin on request scope: the poisoned-connection case fails. No LOCAL pin on the pool: the pool case fails. | restored, green |
| Gate selftest: three new red cases and one quiet case | `gate-mutation.txt`: with the new rule removed, all three red cases fail | `gate-selftest-green.txt`: 24 passed; `gate-green.txt` OK at HEAD |
| Every unit suite touching the changed paths (`related-unit-files.txt`, 86 files) | `related-unit-first-run.txt`: 13 in four files pinned the old three-statement SQL | `related-unit-green.txt`: 85 files, 958 passed (1 skipped needs a DB; run separately below) |
| `server/db/__tests__/poolInstrumentation.integration.test.ts` on PostgreSQL | — | 8/8, including its no-leak cases |
| 120 RLS-related `tests/db` suites, same freshly migrated database | `db-suites-trunk.txt`: 16 tests fail on trunk | `db-suites-with-change.txt`: the same 16 fail, plus this change's 7 new passing cases. No new failure. |

The four updated unit suites now pin the single statement exactly, including the switch pins, so they assert more than before. The setup-failure case changed meaning: the apply is one atomic statement, so a failed apply sets nothing and the connection is evicted.

The 16 tests that fail on trunk in this local database are a pre-existing condition of this environment; this change does not touch them.

Typecheck is clean. The pushed-files lint checks pass: no changed file gained a warning.

## Not done, said plainly

- **The threat model in the security documents.** `docs/security/C2C_TENANT_ISOLATION_PROOF.md` and the pen-test scope should state that RLS here is defence against application code, not against SQL the attacker controls. The pen test should therefore target SQL injection directly. That is a documentation change for the security lane; it is recorded on the board.
- **The `app_super_admin` arm** is the system scope's mechanism, used by about 55 runtime call sites. It is a session variable like the others and is pinned by nothing here. It is cleared on release like the tenant variables. Gating who may open the system scope is a separate review.
- **Dev and test with `RLS_ENFORCE` unset** still run every request through the "off" arm, as before. The pin preserves that, because it pins the deployment's mode.
