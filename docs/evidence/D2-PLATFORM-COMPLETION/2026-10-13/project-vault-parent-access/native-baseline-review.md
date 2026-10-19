# Authenticated native parent-access baseline

The final isolated native run at 2026-10-13 23:44:31 UTC executed **12 tests:
five passing controls and seven intended privacy failures, zero skips**.
`native-baseline-red.txt` retains the actual responses and assertions.

This used PostgreSQL 16.15 in the already canonically installed disposable
`platform_ci_native_recheck_20261013` database. Owner connections provisioned
uniquely tagged invented QA fixtures only; actual project and Vault requests
used their mounted authentication middleware and the `app_service` runtime
role with RLS enforcing. The role assertion confirms a non-owner,
NOSUPERUSER/NOBYPASSRLS connection and FORCE RLS on the program table. The
additional catalog file records the inspected RLS posture of the involved
tables. This is not owner-bypass HTTP evidence or a mocked SQL reproduction.

The catalog also found a separate posture gap: `vault.documents` has RLS
enabled but **FORCE is false** in this freshly installed database. The five
other inspected tables have FORCE true. The actual `app_service` role is not
the Vault table owner and has no bypass privilege, so RLS still applies to the
Vault requests reproduced here. Do not describe this as a proof that every
Vault table already has FORCE. Review its canonical policy installer in the
next increment; no owner/schema permission change was made in this baseline.

Passing controls establish the existing policy and usable routes:

- Real sharing admits public project use, private owner and explicit member;
  it refuses an unassigned actor's private project.
- Actual authenticated public, private owner and member detail reads work.
- Authorized public document search works; a relationship created through the
  actual governed API is visible to its permitted actor with both parents.
- A revoked organization membership is already refused **401** by the real
  authentication layer. The earlier mocked-auth probe's organization-check
  failure must not be reported as a native authenticated revocation bypass.

The seven failures are:

| Expected boundary | Native current behavior |
| --- | --- |
| Unassigned same-org actor cannot read private project metadata | 200 with the private QA project |
| Private Vault search refuses before identity/snippet | 200 with private document title and body snippet |
| Portfolio limit 1 considers authorized programs first | Newer private project occupies the returned page |
| Library count and limit consider authorized documents only | Count 4 instead of 1; private document occupies the returned slot |
| A lead downgraded to viewer cannot archive a governed project | 200 and an actual archive audit/history record |
| Public document access does not grant its private counterpart | Relationship returns private document ID/title and private program name |
| Owned target does not authorize a privately bound source through conversation adoption | 201; private A source count increases from 0 to 1; actual capture/adoption audit retained |

`native-probe-fixtures.json` identifies the final unique QA organization,
actors, programs, documents and source. It contains no JWTs or login secrets.
QA rows, original source bytes, created relationship and actual audit history
remain in the disposable database; no schemas, roles, login sessions or
immutable audits were dropped or reset. Two early fixture setup attempts hit
native code-column type/length constraints before any privacy test ran; their
uniquely tagged QA identities remain retained too. Those setup errors are not
the recorded final security result.

The evidence-only `.probe.ts` is outside canonical test globs. Its explicit
config imports the real native configuration and **replaces** the include;
it does not load the mocked-pg setup or append intentional failures to CI.
With Node 22, the owner `TEST_DATABASE_URL` and runtime `APP_DATABASE_URL`
both naming this disposable database:

```sh
node node_modules/vitest/vitest.mjs run --config \
  docs/evidence/D2-PLATFORM-COMPLETION/2026-10-13/project-vault-parent-access/vitest.native-probe.config.ts
```

Exit status 1 is expected on this baseline. Scoped probe/config ESLint has zero
errors and zero warnings. Source digests identify the reviewed code. No
production implementation or canonical test was modified for this baseline.
QA content is invented and unqualified; no model, production HMAC, deployment,
regulatory approval or agency readiness is certified by these results.
