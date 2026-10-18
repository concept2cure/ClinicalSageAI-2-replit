# Protocol request connection and scoped signer dependencies

The Protocol HTTP consumers explicitly use the canonical pinned request
connection. Both `/api/protocol-dev` index/full projections and
`/api/protocol-development` list/detail/completeness reads pass that executor
through every document, child-register, design and signature read. All normal
governed mutations share the existing `governedScoped` transaction. Finalization
evaluates completeness on the same transaction that locks and finalizes the
protocol, rather than reading its child state through another connection.

The shared signature ceremony accepts an optional
`transactionPool: RequestConnectable`, supplied by the canonical
`requestConnectable(req)`. Its query executor supplies fresh authority and
signer re-verification; its connection supplies separation of duties, the
domain write, chained ledger and signature write on one transaction. The
canonical request owns release. No `Pool` cast, fabricated `rowCount`, policy
bypass, new connection lifecycle, schema change or dependency was introduced.

Shared helper contracts now also accept a scoped executor:

```ts
checkSigningAuthority(userId, organizationId, executor?: RequestSqlClient)
signerReverificationDeps(executor?: RequestSqlClient)
```

The dependencies retain the existing policy, bcrypt comparison, encrypted
TOTP implementation, accepted clock windows, consume-once rule, account
standing and lockout threshold. Password/status/MFA/lockout reads and failed
attempt/TOTP consumption writes use the supplied executor. Existing callers
retain their prior defaults. These additions let other canonical signing
consumers adopt the same request scope without reimplementing factor policy.

The service helpers likewise retain legacy default execution. An invocation
that owns a valid tenant pool scope can continue using those defaults; current
AnA request/tool-run instrumentation supplies such a scope. The raw unscoped
control below is a fail-closed connection check, not evidence that an entire
authenticated request or every legacy caller failed before this remedy.

## Executed native evidence

[Native proof log](protocol-native-request-proof.txt) executes eight cases
against the fully provisioned PostgreSQL database using an actual application
role. It asserts `rolsuper=false`, `rolbypassrls=false`, and deployed FORCE RLS
on `protocol_documents`, `protocol_sections`, `users` and
`organization_users`. Its unscoped control uses the canonical RLS startup
options and reads no tenant rows.

The HTTP cases use production authentication with signed fixture tokens and
synthetic organizations/accounts/programs. They exercise actual governed
creation, list/detail/index/full workspace projection, completeness,
objectives/eligibility/visit writes and a recorded version. Foreign record and
foreign program requests remain refused. Native signer cases establish fresh
membership authority, real bcrypt verification, a durable wrong-password
counter, actual encrypted MFA enrolment, successful TOTP verification and
replay rejection. The finalization case uses password plus TOTP and reads back
the finalized version, signer name, verified authentication method and signed
workspace manifestation.

The additional foreign-account case names a synthetic account belonging only
to the other organization. On the current request executor it yields no
password hash or MFA enrolment, verifies no TOTP, refuses a failed-attempt write
with zero returned identities, and refuses signer re-verification. The owner
assertion confirms that its counter and consumed-step state remain unchanged.

Six optional-executor statements address shared `users` identity by the
authenticated signer's established id: lockout read, expired-lock reset,
failed-attempt increment, encrypted TOTP state read, consume-once step update
and enrolment-state read. The canonical signing factory receives that principal
from authenticated server context, not a request-body target, and receives the
same verified request executor. The shared identity row carries no organization
column; deployed membership/account FORCE RLS still applies to each query.
Native positive factor checks and the foreign-account refusal above establish
that this contract functions without bypassing those policies.

Each statement has its own exact `tenant-isolation-safe:` rationale; there is
no file-wide allowlist or regression-budget increase. The stale historical MFA
comment saying `users` had no RLS policy was corrected. SQL, factor policy and
application behavior did not change in this guard remedy.
[The original six guard findings](protocol-account-query-guard-before.txt) and
[passing guard result](protocol-account-query-guard.txt) preserve that review.

This is local engineering evidence with synthetic study text, fixture secrets
and the declared test environment. It does not qualify clinical conclusions,
production signing keys, live agency acceptance or deployment. Initial fixture
setup failures and old mock argument mismatches are not counted as product
regressions. No assertions were weakened to claim those failures as green.

[Focused suite log](protocol-request-unit-qualified.txt) executes 335 passing
tests across 12 files. It covers the existing signature refusal/SoD/atomic
rollback cases, read-connection admission, current program authority,
study-design associations, normalized projections, the canonical
re-verification policy and default MFA behavior. Fixtures were updated to
represent the newly explicit pinned connection and dependency arguments;
they still require the ledger and signature to receive the exact same
transaction client, with no raw request-client release.

[Scoped lint](protocol-native-source-lint.txt) reports zero errors and six
size/complexity, existing console and style warnings.
[SQL interpolation guard](protocol-native-source-sql.txt) passes without a
baseline increase. Whole-repository type checking belongs to the integration
run; this workstream did not run a competing full type check.

## Commands

Native suite (owner URL provisions synthetic records; application URL executes
the RLS proof):

```sh
npx vitest run --config vitest.db.config.ts tests/db/protocol-request-connection.dbtest.ts
```

Focused default project:

```sh
npx vitest run \
  server/services/part11/__tests__/reverify-signer.test.ts \
  server/services/part11/__tests__/one-signing-authority-policy.test.ts \
  tests/services/mfaService.test.ts \
  server/routes/__tests__/protocol-dev.routes.test.ts \
  server/routes/__tests__/protocol-program-scope.routes.test.ts \
  server/routes/__tests__/protocol-signatures.routes.test.ts \
  server/routes/__tests__/protocol-development-error-containment.test.ts \
  server/services/protocol-development/__tests__/pdev-view-assembler.pglite.integration.test.ts \
  server/services/protocol-development/__tests__/protocol-signature.pglite.integration.test.ts \
  server/services/protocol-development/__tests__/protocol-program-scope.pglite.test.ts \
  server/routes/__tests__/protocol-development-study-design.test.ts \
  server/routes/__tests__/protocol-write-authority.routes.test.ts
```

## Changed production files

- `server/routes/protocol-dev.routes.ts`
- `server/routes/protocol-development.ts`
- `server/services/protocol-development/pdev-protocol-index.ts`
- `server/services/protocol-development/pdev-view-assembler.ts`
- `server/services/protocol-development/protocol-development-service.ts`
- `server/services/part11/governed-signature-ceremony.ts`
- `server/services/part11/resolve-signer-role.ts`
- `server/services/part11/signing-authority-gate.ts`
- `server/services/part11/reverify-signer-deps.ts`
- `server/services/account-standing.ts`
- `server/services/auth-security-service.ts`
- `server/services/mfaService.ts`
