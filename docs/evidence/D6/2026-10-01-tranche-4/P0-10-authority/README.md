# P0-10, control-tower addition — signing authority on the shared domain ceremony (§11.10(g))

**What was wrong.** Both P0-10 halves moved 21 domain sign routes onto `signGovernedAct`
(`server/routes/governed-signed-act.ts`) and both reported the same residual: the helper re-verified the
signer's identity (password, enrolled second factor, lockout) but never asked whether the signer's role
carries signing authority. Every other signing route does (`/api/esignature/sign`, the QMS approval, the
submission release, PCCP, RBM, the verified seal: `resolveSignerOrgRole` + `isSigningAuthorized`). So a
`viewer` who knew their own password applied a Part 11 signature to an IRB approval or a biosketch.

**What is true now.** Step 3a of the ceremony reads the signer's role from the membership row (never the
token or the body) and refuses a role outside the signing policy with **403 `ESIGNATURE_NO_AUTHORITY`**
before the password is checked, so the refusal spends no guess and writes nothing. The policy is the
platform's one (`server/services/part11/signing-authority.ts`, default `admin`, `approver`, `reviewer`,
overridable by `ESIGNATURE_SIGNING_ROLES`).

| Check | Red | Green |
|---|---|---|
| `tests/db/research-admin-sign-ceremony.dbtest.ts`, "a member whose role carries no signing authority is refused…" (PostgreSQL 16, `app_service`, RLS on) | `red/viewer-signs.txt`: the viewer got **201** with signature row 128 | `green/dbtests.txt`: both P0-10 dbtests, 69/69 |
| `server/routes/__tests__/domain-sign-ceremony.routes.test.ts`, the same case on each of the seven routes | — (added with the fix; the route test mocks the role lookup) | `green/routes-test.txt`: 53/53 |

**Also in this commit.** Both P0-10 dbtests deleted their own `c2c_ana_actions` rows with a bare
`DELETE`; P1-24 makes that table append-only, so the cleanup now runs in the owner transaction with the
table's trigger off for that transaction only (the pattern the suites already use for `audit_logs`),
guarded for a database that predates P1-24. The sign-ceremony baseline loses the 19 files P0-10a and
P0-10b fixed: 24 sites → 3, and `ci:sign-ceremony` reports an exact match.

```
TEST_DATABASE_URL=… APP_DATABASE_URL=… RLS_ENFORCE=on npx vitest run --config vitest.db.config.ts \
  tests/db/research-admin-sign-ceremony.dbtest.ts tests/db/domain-sign-ceremony.dbtest.ts
npx vitest run server/routes/__tests__/domain-sign-ceremony.routes.test.ts
npm run -s ci:sign-ceremony
```
