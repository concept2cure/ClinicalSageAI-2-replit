# P0-10a (DP-02, High): research-administration signs are now electronic signatures

Row **D6**. Plan item P0-10 part a (`docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` §1). Date 2026-10-01.

## What was wrong

Eleven routes on nine research-administration routers wrote a `command='sign'` ledger pair from a session alone. The pair is `audit_logs` plus `c2c_ana_actions`, and a ledger reader takes it as a signature. These routes asked for no password and no second factor. They took no declared meaning and wrote no `electronic_signatures` row. Each route used its own private `governed()` helper with `'sign'`.

| Route | Ledger target |
|---|---|
| `POST /api/biosketch/biosketches/:id/finalize` | `biosketch:<id>` |
| `POST /api/committees/agenda/:id/finalize` | `committee-agenda:<id>` |
| `POST /api/coverage-analysis/analyses/:id/finalize` | `coverage-analysis:<id>` |
| `POST /api/dmsp/plans/:id/finalize` | `dms-plan:<id>` |
| `POST /api/effort-certification/:id/certify` | `effort-certification:<id>` |
| `POST /api/export-control/reviews/:id/determine` | `export-control:<id>` |
| `POST /api/grants/awards/:id/closeout/finalize` | `grant-award:<id>` |
| `POST /api/grants/subawards/:id/execute` | `grant-subaward:<id>` |
| `POST /api/grants/nce/:id/approve` | `grant-nce:<id>` |
| `POST /api/other-support/documents/:id/certify` | `other-support:<id>` |
| `POST /api/research-agreements/agreements/:id/execute` | `research-agreement:<id>` |

This was reproduced at HEAD `681d19d5` against the deploy-shaped PostgreSQL 16, with RLS enforcing and the runtime role. A body of `{ reason }` alone got 201 and a `sign` ledger row. A wrong password also got 201. A full request still wrote no `electronic_signatures` row. See `red/dbtest-against-HEAD-routes.txt`.

## What is true now

All eleven routes now go through one helper, `signGovernedAct` in `server/routes/governed-signed-act.ts`. It composes the canonical pieces in the QMS approval's order (`routes/mdx-qms.ts`):

1. **Caller identified.** Otherwise 401 `AUTH_REQUIRED`.
2. **Every component present.** That means reason (the `governedReason` floor), meaning and password. Otherwise 400 `ESIGNATURE_COMPONENT_MISSING`, naming the missing fields.
3. **Meaning in the closed vocabulary.** It must be one of `GOVERNED_SIGN_MEANINGS`, otherwise 400 `SIGNATURE_MEANING_REQUIRED` or `SIGNATURE_MEANING_UNKNOWN`. This is checked before the password, so a refused meaning spends no guess.
4. **Signer re-verified with `reverifySigner`.** This uses the production wiring: the password, the second factor whenever one is enrolled, the account lockout and the account standing. A refusal returns its own status and code: 401 `PASSWORD_VERIFICATION_FAILED`, 400 `MFA_TOKEN_REQUIRED`, 401 `MFA_VERIFICATION_FAILED`, 423 `ACCOUNT_LOCKED`, and so on. No connection is opened before this passes.
5. **Domain write.** BEGIN, then the tenant context, then the domain write. A coded domain error refuses with the route's own status; anything else is a 500 with no error text.
6. **Ledger pair and signature row.** The `sign` ledger pair (`recordGovernedAction`) and the `electronic_signatures` row (`persistGovernedSignSignature`) are written on the same client.
   - The row records the factors step 4 verified (`password` or `password+mfa`), the declared meaning, the reason, and the signer's printed name.
   - The manifest carries the ledger ids and what was decided (`act`).
   - The binding is the ledger chain hash, with its basis named. These record types have no content-digest derivation, and the row says so.
7. **COMMIT.**

The limiter in front of each route is `signedActAttempts`, the canonical per-signer limit (`middleware/signing-attempt-limiter.ts`, which the protocol signing routes also mount). It allows 10 credential checks per signer per 5 minutes, as one budget across all eleven routes.

The NCE approval keeps its own `authority` field, which is now also recorded in the signed payload. The committee determination keeps its approve-privilege and CITI-training gates in front of the ceremony, so an unauthorized caller is never asked for a password.

**Client call sites:** none. `grep` of `client/src` finds no caller of any of these routes. `ResearchAdmin.tsx` says the committees, coverage and grants sections are "not connected yet". No surface needed `EsignModal` wiring. The request body matches what `EsignModal.onSign` collects (`meaning`, `reason`, `password`, with its `totp` sent as `mfaToken`, as `postQmsApproval` does). A future surface can therefore use the modal as `SopRegister.tsx` does.

## Red / green

Test: `tests/db/research-admin-sign-ceremony.dbtest.ts`, 37 cases.

**What the test uses for real:**
- the production gate (`authMiddleware` with a signed access token)
- the runtime role through `APP_DATABASE_URL`, with `RLS_ENFORCE=on`
- `reverifySigner` with bcrypt, the lockout, standing and TOTP
- the real ledger and signature writers

**What it stubs:**
- Each route's domain write. A stub records that it ran, so "writes nothing" covers the domain write too.
- The attempt limiter. Its pass-through records which scope guarded which request, so mounting is still proven. The limiter itself has its own suite.

| Case (× 11 routes unless noted) | Red: HEAD routes (`681d19d5`) | Green: fixed |
|---|---|---|
| `{ reason }` only → 400 `ESIGNATURE_COMPONENT_MISSING`, no ledger/audit/signature row, domain write not run, attempt limit in front | 201, ledger row written (11/11 fail) | pass 11/11 |
| wrong password → 401 `PASSWORD_VERIFICATION_FAILED`, nothing written | 201, ledger row written (11/11 fail) | pass 11/11 |
| password + meaning → 201, one `sign` row, one audit row whose `ana_action_id` is that row, one `electronic_signatures` row (signer, meaning, `password`, reason, manifest ids). All three rows have the same `xmin`, so they were written in one transaction | ledger written, no signature row (11/11 fail) | pass 11/11 |
| meaning `endorsed` → 400 `SIGNATURE_MEANING_UNKNOWN`, nothing written, no password guess counted (1 route) | 201 (fail) | pass |
| valid credentials, then the domain refuses → 409 `INVALID_STATE`, nothing written (1 route) | pass (regression guard; the old order also wrote nothing) | pass |
| signer with TOTP enrolled, password only → 400 `MFA_TOKEN_REQUIRED`, nothing written (1 route) | 201 (fail) | pass |
| signer with TOTP, password + current code → 201, signature row `password+mfa`, `second_factor_verified = true` (1 route) | no signature row (fail) | pass |
| **Total** | **36 failed, 1 passed** | **37 passed** |

`ci:sign-ceremony` (`npm run -s ci:sign-ceremony`):
- **At start (`red/ci-sign-ceremony-at-start.txt`):** OK, 24 baselined sites. The nine files carry 11 unceremonied sites (`red/ci-sign-ceremony-list-at-start.txt`).
- **Now (`green/ci-sign-ceremony.txt`):** the nine files report **0 now** against baselines of 1, 1, 1, 1, 1, 1, 3, 1, 1. That is **11 sites fixed**.
- **Remaining sign site:** the one left is in `server/routes/governed-signed-act.ts` and is `ok` (`green/ci-sign-ceremony-list.txt`).
- **Why the gate still exits 1:** the baseline is exact and still holds the nine entries. The control tower removes them; `--write-baseline` was not run. The same output also lists files fixed by other lanes working in the tree at the same time: CMC, BLA, IRB, IACUC, IBC, consent, deviations and RIM. Those are not this item's.

## Commands

```
export TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable'
export APP_DATABASE_URL='postgresql://app_service:local-testdb-app-service-password@127.0.0.1:5432/c2c_testdb?sslmode=disable'
export RLS_ENFORCE=on NODE_OPTIONS=--max-old-space-size=3072
npx vitest run --config vitest.db.config.ts tests/db/research-admin-sign-ceremony.dbtest.ts
npm run -s ci:sign-ceremony
npm run -s ci:sign-ceremony:list
npm run -s ci:sign-ceremony:selftest      # 13 passed
npm run -s ci:server-error-leaks          # OK, no file gained a site
npm run -s ci:tenant-resolvers            # OK, no new local resolvers
npm run -s ci:client-ip-single-source     # OK
node scripts/ci/check-lineage-save-gate.mjs   # OK
npx vitest run server/services/ana/__tests__/ana-cannot-sign.test.ts tests/ci/export-governance-guard.test.ts   # 35 passed
npx eslint <the eleven files>             # 0 errors; 1 pre-existing warning (committees.ts CommitteeError unused, also at HEAD)
```

**How red was taken:** the nine route files were overwritten with `git show HEAD:<file>`. The final test file was run against them, and then the fixed files were restored from a scratch copy; `cmp` confirmed each restore. No git command changed the index, tree or refs.

## Fixtures left in the shared database (by design)

An `electronic_signatures` row cannot be deleted (`trg_electronic_signatures_immutable`). It references its organization and its signer, so three fixtures are permanent and reused across runs:
- organization `93210` (`dbras-research-admin-signing`)
- users `dbras-signer@example.invalid` and `dbras-mfa-signer@example.invalid`

Each green run appends 12 signature rows, on targets numbered from a per-run base. The suite deletes its `audit_logs` rows (trigger disabled in the owner's transaction, as `signing-lockout.dbtest.ts` does), its `c2c_ana_actions` rows and its committee fixtures.

## Not done here (residuals)

- **A second helper for the same ceremony.** P0-10b is in progress in the same tree: IRB, IACUC, IBC, RIM, consent, deviations and BLA. Its routes import `signDomainAct` and `respondSigned` from `server/routes/domain-sign-ceremony.ts`. That file was uncommitted and in flux while this item ran: at 03:10 UTC it held 310,918 lines of one repeated block, and later it was absent. CLAUDE.md requires zero duplication, so one helper must be migrated onto the other before both land. They also differ in body shape and refusal codes:
  - **This helper:** `password`/`mfaToken`, `ESIGNATURE_COMPONENT_MISSING` and `reverifySigner`'s own codes. This is the QMS contract the item names.
  - **P0-10b's helper:** a `reauth: { password, totp }` envelope and `REAUTH_*` codes.

- **Separation of duties.** Authorship is not modelled for these record types (`resolveTargetAuthors` returns "not modelled"), so an independence check would refuse every signature. Modelling authorship per type is a follow-up for whoever owns these modules.
- **Signing authority (§11.10(g)).** No signing-role allowlist was added beyond what each route already had (committees: RBAC `approve`). Any member who can reach the route and re-enters their own password can sign.
- **Content binding.** It is the ledger chain hash, labelled as such. No content digest is derivable for these types yet. Effort certification's `contentHash` is in the signed payload and manifest, but it is not the row's bound digest.
- **5xx bodies.** `fail()` in `export-control.ts`, `grants.ts`, `other-support.ts` and `research-agreements.ts` still sends `err.message` in a 500 for their non-signing routes. Those sites are baselined in `ci:server-error-leaks`, and fixing them would move that baseline. The signing path does not go through them: `signGovernedAct` answers its own 500s with `serverError`.
