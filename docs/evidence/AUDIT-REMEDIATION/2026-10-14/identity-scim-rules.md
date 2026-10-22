# F16 — Complete the SCIM IP allowlist lifecycle

The active Identity Console now offers Enable/Disable and Remove for each persisted SCIM IP rule. Each control opens the canonical confirmation form, names the target organization and CIDR, explains the effect of removing the last enabled restriction, and requires a reason. A refused write keeps the form and entered reason. Successful writes refresh the list from the server.

The existing platform-admin API remains the only writer. POST, PATCH and DELETE now validate a 3–500 character reason. Every rule mutation and its chained audit row run on the same transaction client; an audit failure rolls the policy mutation back. The audit uses the affected organization's ID, the authenticated actor, the rule ID, before/after values and the reason. No tenant or actor is derived from a display label. Existing callers must include `reason` when changing this security policy.

Evidence:

- `identity-controls-red.log`: the two new frontend suites initially failed on absent controls.
- `identity-scim-backend-red.log`: the new reason/audit/fail-closed contract cases failed against the original endpoint (3 failures, 8 existing passes).
- `identity-scim-green.log`: 31/31 tests in six suites pass after remediation, covering the existing platform-standing guard and enforcement contracts, user-facing confirmations/refusals, and real SQL mutation rollback.
- `identity-scoped-lint.log`: scoped ESLint has no errors; eight existing warning categories remain in the larger admin/identity/API-key files. The new issuer and SCIM route have no lint warnings. `git diff --check` passes.

The PGlite suite applies the real SCIM allowlist migration and checks durable rows after injected audit failures for create, disable and delete. It substitutes the chained-record writer and authentication guard to isolate transaction atomicity; it does not claim deployed RLS or production platform-admin proof. The existing route guard/enforcement suites remain green. No migration, dependency, external setting, commit or deployment was added by this change.

Owned implementation: `client/src/concept2cure/v2/surfaces/IdentityConsole.tsx`, `server/routes/admin/scim-ip-allowlist.ts`. Regression suites: `identityRuleActions.test.tsx`, `scim-ip-allowlist-admin.test.ts`, `scim-ip-rule-atomic.pglite.test.ts`.
