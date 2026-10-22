# F18/D08 native request database binding

The inbox, badge, receipt operations and preference endpoints previously used
the notification service's default pool, rather than explicitly passing the
request's pinned client. The production runtime pool is instrumented:
`runtime.ts` calls `instrumentPool`, and `poolInstrumentation.runQueryScoped`
reads the active verified AsyncLocalStorage tenant scope and applies its
transaction-local session variables when RLS enforcement is on. The canonical
HTTP authentication boundary establishes that scope through
`establishRequestTenantScope`. Therefore the prior default-pool calls do not
establish an authenticated production delivery outage.

The original negative control substitutes a raw, uninstrumented PostgreSQL
connection with no tenant variables. Under the local fixture's ENABLE and FORCE
RLS, it sees empty/zero and refuses writes. That establishes the explicit
request-client contract and missing-context behavior, not failure of the full
authentication/ALS chain. The target resolver already used the pinned client.

All HTTP operations in `mdx-notifications.ts` now use `requestPgClient(req)`:
list, unread count, creation, read-one, read-all, archive and preference read/
upsert. The service accepts the minimal query interface shared by request and
governed executors. Receipt writes return their affected notification identity;
the result does not require `rowCount`, which the request-client type does not
promise. Returned notification fields and aggregate counts are validated before
being treated as a successful read. Missing request context throws the existing
typed context error; no HTTP path falls back to the singleton. Existing
background/default executor compatibility and live recipient/preferences
policies are preserved.
This removes the inbox's implicit dependency on ambient ALS while retaining
the correct instrumented-pool behavior for supported default-executor callers.

## Native before/after evidence

`server/routes/__tests__/notification-request-binding.dbtest.ts` runs through
the actual Express router and PostgreSQL using `vitest.db.config.ts`; that
project does not mock `pg`. It uses the explicitly created, local synthetic
`c2c_audit_remedies` database and its actual applied policies. The runtime role
is `app_service`, checked to have both `rolsuper=false` and
`rolbypassrls=false`. All three relevant tables are checked to have both ENABLE
and FORCE RLS. The singleton negative-control connection has enforcement on,
blank tenant/org variables and a non-bypass role. The request client has the
authenticated tenant pinned and deliberately exposes only rows.

`notification-native-binding-red.log`: 7 request-contract failures and 1 raw
negative control before explicit pinning; this run intentionally substitutes
the uninstrumented connection and must not be described as a full-auth
production regression. `notification-native-binding-green.log`: all 8 pass after it,
covering positive own-tenant list/count, creation, per-recipient read/archive,
truthful read-all counts/idempotency, foreign refusal, preference write/read/
effect/isolation and missing-context refusal with no singleton calls.

`notification-native-binding-corrected-green.log`: all 9 pass, including the
existing real `instrumentPool` plus `runWithTenantScope` on a non-bypass native
PostgreSQL pool. That control positively creates and reads through the default
notification executor across an async continuation in a verified tenant scope,
excludes the foreign row, and rejects a missing ALS scope. It confirms the
original runtime binding works; no runtime pool correction was needed.

Fixtures refuse a non-synthetic database name or pre-existing notification
population. Sentinel notices/receipts are removed afterwards; affected existing
synthetic preferences are snapshotted and restored, and a temporary second
membership is removed. No new schema, DDL, role, dependency or real production
database transaction was used.

`notification-binding-compatibility-green.log`: 46 passing tests in 5 files,
including SQL-backed recipient/navigation policy and actual tray/preferences
flows. `notification-binding-lint.log` is clean. Whitespace checks pass.
`notification-binding-requestdb-gate.log` and
`notification-binding-sql-fragment-gate.log` pass; the service's established
18 fixed SQL-fragment allowance is unchanged and was not increased.

## Scope limit

This native proof covers explicit HTTP pinning and the instrumented default
executor under verified ALS. Default-executor producers are not confirmed
delivery gaps merely because they omit an explicit query argument: task and
collaboration HTTP callbacks inherit their authenticated request scope,
including async continuations; scheduled schedule reviews use the canonical
scheduled-once system scope; scheduled report delivery supplies its transaction
client. AnA execution inherits its verified route/run scope. Caller inspection
found no additional confirmed missing-context producer in those paths, so no
broad producer rewrite was performed. Detached/unverified custom invocations
remain outside this proof and fail closed through the runtime instrumentation.
