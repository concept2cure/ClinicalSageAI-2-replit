# Native ReportOS tenant-context verification — 2026-10-14

**8/8 native cases pass** against the fully provisioned local
`c2c_audit_remedies` database on loopback port 55432. No ReportOS implementation
was changed. This is verification of working runtime behavior, not an additional
implementation remedy.

The previous suggestion that global database access necessarily makes these
handlers dead was unsupported: comments in tenantStore/runtime still describe
the earlier observation-only phase, but active `poolInstrumentation.ts` applies
the canonical ALS scope. `runQueryScoped` opens a transaction, sets tenant/org,
role and account settings LOCAL, runs the statement, commits and releases.
Drizzle's global pool access uses that instrumentation. Canonical request
clients remain available where the service accepts an explicit client.

The proof uses the actual runtime module, global Drizzle instance, saved-history
service, LazyRequestDbClient, authMiddleware and HTTP routers. It uses the native
Vitest project's real PostgreSQL setup and production matching `.ts` resolution,
with no mocked database/auth or replaced reporting implementation. Runtime
identity is explicitly asserted as **app_service, NOSUPERUSER, NOBYPASSRLS**.
The actual global pooled query also asserts its own current_user, enforcing mode,
tenant/role/account settings. Certificate/hostname verification is enabled;
PostgreSQL reports **TLS 1.3**. All six tested data tables have both enabled and
**FORCE RLS**: report_runs, report_snapshots, report_run_dependencies,
report_subscriptions, project_memory_entries and projects.

The controls establish:

- A raw non-superuser connection with enforcing RLS and no ALS sees no saved
  report rows. The instrumented application pool with no ALS rejects the query
  as FAIL-CLOSED.
- Under `runWithTenantScope` carrying tenant, role and account, the actual global
  pool and global Drizzle return the owned run and exclude the foreign run.
  These queries deliberately have no organization SQL predicate, so the
  isolation assertion depends on actual FORCE RLS.
- Global saved-history service reads and the same reads through the actual
  canonical lazy request client agree. A foreign-org request within the owned
  tenant's ALS returns no foreign rows.
- Real authenticated GET /api/report-os/runs returns the owned saved run, even
  when a query string names the foreign organization; foreign records are
  excluded. Real middleware establishes the expected tenant, persisted admin
  role, authenticated actor and LazyRequestDbClient.
- Owned run detail, rendered document, dependencies and seal reads return 200.
  The corresponding foreign run IDs return 404.
- Real GET /api/report-os/bundles and /api/insights/subscriptions return the
  owned persisted synthetic containers and exclude foreign containers. These
  handlers use the active global ORM/service paths previously questioned.
- Real GET /api/insights-canvas/overview over the owned open program returns
  200 with the owned program picker entry and computed lead project. A foreign
  program UUID returns the canonical 200/unanchored state with null lead, the
  current organization and no foreign label/project/readiness. It echoes the
  input UUID and does not distinguish a missing UUID from a foreign one.
  Reciprocal saved-run reads for the other authenticated tenant also work.

The uniquely named synthetic prerequisite rows and canonical saved runs remain
in the local fixture database. Their exact IDs are in `fixture-manifest.json`.
Owner writes provision only new synthetic organizations, accounts/memberships,
workspaces, anchored private projects and trusted schedule/container fixtures.
Saved runs and immutable initial snapshots are recorded through the actual
canonical persistReportRun path under the non-superuser application scope.
All rows, snapshots and audit evidence are preserved; no immutability trigger,
RLS policy or retained audit row is disabled/deleted.

The retained fixture is a read proof. Synthetic schedules are disabled, and
trusted bundle records are read fixtures; their provisioning does not qualify
schedule creation/firing or bundle-creation transactions. Synthetic accounts
use native test JWTs, not real customer sign-in, MFA or external identity proof.
The test environment uses the repository's non-production audit-HMAC fallback;
this proof therefore does not qualify production audit-key management or
cryptographic audit-chain verification. No PDF export/finalize, scheduled
delivery, external provider or live agency endpoint is exercised here.

Earlier failed iterations are preserved and labeled accurately. The first was
a fixture SQL parameter-type conflict and ran no cases. The second passed
seven cases but incorrectly expected projectId in the program picker DTO
(the actual field is programId). The third passed seven but incorrectly
required a foreign overview UUID to return 404; the canonical unanchored
exclusion contract described above is 200. Correcting those test assumptions
produced the final eight passing cases without reporting implementation edits.

The completed result is `native-full-context-qualified.txt`; the retained
harness is `reportos-native.dbtest.ts` with `vitest.probe.config.ts`, both under
docs and outside the application tsconfig include. Run from the repo root using
the supported Node 22 runtime, the existing local certificate trust bundle and
the explicitly provisioned synthetic database:

```sh
TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55432/c2c_audit_remedies?sslmode=verify-full&sslrootcert=/workspace/audit/remediation-pg-tls/combined-trust.pem' \
APP_DATABASE_URL='postgresql://app_service@127.0.0.1:55432/c2c_audit_remedies?sslmode=verify-full&sslrootcert=/workspace/audit/remediation-pg-tls/combined-trust.pem' \
NODE_EXTRA_CA_CERTS=/workspace/audit/remediation-pg-tls/combined-trust.pem \
RLS_ENFORCE=on \
node node_modules/vitest/vitest.mjs run --config docs/evidence/AUDIT-REMEDIATION/2026-10-14/native-reportos-proof/vitest.probe.config.ts
```

Each invocation preserves newly named local synthetic fixtures. This proof
establishes positive reads and foreign exclusion on the tested paths; it is not
a claim that every ReportOS operation or the deployed production estate has
been qualified. A broad global-client refactor is not justified by the earlier
no-ALS control or stale comments.
