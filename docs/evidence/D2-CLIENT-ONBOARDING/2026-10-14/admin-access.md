# Existing admin capabilities in the active v2 console

D2 / W1 — active `admin-console`, existing backend contracts. No new package,
migration, or production flag widening.

## API-key creation and usage

`AdminAccess` now opens `AdminApiKeyCreate` from its API keys tab. The existing
server API accepts a name, selected read-only scopes, an optional future expiry,
and a positive whole-number request limit. The drawer also requires a reason;
the route accepts it optionally for compatibility with existing HTTP callers
and records it in both the chained payload and the audit reason column.

The raw secret is retained only in drawer state. It is never passed to the
surface context, callbacks, storage, toast, or audit record. The administrator
copies it explicitly, sees clipboard refusal truthfully, and dismisses the
drawer to clear it. Duplicate submissions and dismissal while a mint request is
pending are blocked. A refused request retains entered values. A malformed
successful response requires checking the list before retrying.

The table's Usage action opens `AdminApiKeyUsage` through the row's numeric key
id. It reads the existing admin/organization-scoped usage contract and shows the
server's count, status, prefix and dates. A refused or malformed read produces
an error, never zero requests.

## Atomic lifecycle audit

Before exposure, successful key creation/revocation performed the credential
write first and then called the general best-effort audit recorder. Audit
failure could leave a usable credential with no retrievable chained record.

Both successful lifecycle changes now run on the canonical
`server/db/runtime.ts` transaction helper. The existing service functions enlist
their SQL write on the caller's transaction client, and
`writeChainedAuditRow` writes the audit row on that same client before commit.
Audit refusal propagates, rolls the credential change back, and returns no
secret. Read/validation/timing behavior is unchanged. Refused revocation
attempts change no credential and continue using the general event recorder.

The new audit failure test failed against the preceding implementation: HTTP
201 where 500 was required (`admin-api-key-audit-red.txt`). After the change it
records `BEGIN → CREATE KEY → AUDIT KEY → ROLLBACK`; the response carries no
credential. A corresponding revoke test proves rollback, and a service test
checks that the actual write uses the caller client and stores only the key
hash. These are request/service tests with database/audit recorders, not a new
live PostgreSQL/RLS qualification claim.

## Platform personnel

`AdminPlatformGrants` is reachable in the active Roles + scopes tab. The server's
successful platform-gated grant read controls the form affordances. An
organization administrator denied platform standing sees the refusal and no
elevation controls. The GET contract now returns `grantableRoles`, derived from
the same verified business standing the existing POST guard uses. The UI does
not derive platform or finance authority from organization membership or email.

Grant/revoke actions open governed v2 forms with the stated reason. Grant
creation already commits with its chained record and fails closed; its existing
security tests remain in the validation set. Finance choices are offered only
when the server reports them. The earlier unmounted AdminConsole's optimistic
invented ids, native reason prompt and fixture roles were not adopted.

The existing platform-role withdrawal policy is intentionally preserved:
revocation withdraws access even when the audit recorder is unavailable
(`access-management.ts`, DP-75). The UI reads the returned audit outcome and
states missing or tamper-proof-only recording explicitly, without claiming a
retrievable audit entry exists or silently restoring access. This differs from
credential creation, which cannot issue an untracked secret.

## Checks

- `admin-api-key-ui-red.txt`: the three initial creation checks failed because
  active AdminAccess had no Create API key button.
- `admin-api-key-audit-red.txt`: the fail-closed audit check failed against the
  previous nontransactional route.
- `admin-access-green.txt`: focused active UI, API-key route/service,
  platform-guard and existing admin-honesty tests pass.
- `admin-new-code-lint.txt`: lint command for new/refactored components,
  shared constants, API-key route/service and new tests completed without
  warnings. The unchanged platform grant POST handler's existing complexity
  warning is outside that clean subset; no new warning was introduced there.
- `backend-ui-inventory.md` and `api-scope-classification.txt`: current
  ownership and launch boundaries, with remaining backend-incomplete and
  intentionally excluded capabilities named separately.
