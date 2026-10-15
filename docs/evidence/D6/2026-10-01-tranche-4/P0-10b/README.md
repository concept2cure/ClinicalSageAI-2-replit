# P0-10b (DP-02, High): sign routes outside research administration run the signature ceremony

Plan item P0-10b, security audit 2026-09-24 finding DP-02. Row D6. Date 2026-10-01. Audited at HEAD `9e9a9614`.

## What was wrong

Ten `sign` ledger writes outside research administration were not electronic signatures. A `command='sign'` row in
`audit_logs` + `c2c_ana_actions` reads as a signature to an inspector (21 CFR 11.50, 11.70, 11.200). At HEAD:

| Route | File | Defect at HEAD |
|---|---|---|
| `POST /api/irb/submissions/:id/reviews` (outcome `approved`) | `server/routes/irb.ts` | no re-authentication, no meaning, no `electronic_signatures` row |
| `POST /api/iacuc/protocols/:id/reviews` (outcome `approved`) | `server/routes/iacuc.ts` | same |
| `POST /api/ibc/registrations/:id/reviews` (outcome `approved`) | `server/routes/ibc.ts` | same |
| `POST /api/rim/products/:id/labels` (status `approved`) | `server/routes/rim.ts` | same |
| `POST /api/protocol-consent/forms/:id/approve` | `server/routes/protocol-consent.ts` | same |
| `POST /api/protocol-deviations/deviations/:id/close` | `server/routes/protocol-deviations.ts` | same |
| `POST /api/biopharma/bla/assessments/:id/sign` | `server/routes/biopharma/bla-workbench.ts` | same, and set `signed_by` |
| `POST /api/cmc/batch-records/:id/release` | `server/api/cmc/batchRecordRoutes.ts` | re-authenticated, wrote no `electronic_signatures` row |
| `POST /api/cmc/specifications/:id/approve` | `server/api/cmc/specificationRoutes.ts` | same |
| `POST /api/cmc/{container-closures,reference-standards,impurity-profiles,characterization-studies}/:id/qualify`, `.../manufacturing-processes/:id/validate` | `server/api/cmc/routes.ts` (`qualifyRegisterRecord`) | same |

Reproduced on the deploy-shaped PostgreSQL 16 (runtime role, RLS enforcing) before the fix: the seven signed with a
session alone and with a wrong password, and none of the ten wrote a signature row (`red/domain-sign-ceremony.dbtest.txt`).

## What is true now

- **The seven unceremonied routes run the platform's one signing ceremony**, `signGovernedAct` in
  `server/routes/governed-signed-act.ts`, the module P0-10a introduced for the eleven research-administration routes.
  In order: caller identified; reason, meaning and password all present (`ESIGNATURE_COMPONENT_MISSING` otherwise);
  meaning from the closed vocabulary (`signMeaningRefusal`, before the password is checked); `reverifySigner` with
  production wiring (password, enrolled second factor, lockout, account standing); then BEGIN, the domain write, the
  ledger pair and the `electronic_signatures` row (`persistGovernedSignSignature`) on one client, COMMIT. Each route
  mounts the shared per-signer attempt limit (`signedActAttempts`). A request without credentials writes nothing.
- **IRB, IACUC and IBC reviews and RIM labels sign only when the act is an approval.** A deferral, a tabling or a draft
  label is still recorded under `resolve` / `update`, asks for no password and is not metered as a signing attempt.
- **The three CMC signatures write the row** with `persistGovernedActionSignature` on the ledger's own client, before
  COMMIT, as `module3OperatingSystemRoutes.ts` does: the declared meaning (for a batch release, the disposition's meaning since the fix round below; it was `release` for every disposition, DP-58), the factors
  `verifyReauth` verified, the client IP from `clientIpOf`, and the ledger binding. A signature-row failure rolls the
  release / approval / qualification back.
- **No content hash is claimed that was not computed.** No content basis is registered for any of these record types, so
  every row binds the ledger chain hash under `governed-action-sha256-chain` and its note says so.
- `ci:sign-ceremony`: all ten sites in these files are now ceremonied or gone (`green/gate-scan-worktree.txt`:
  0 unceremonied, against 10 at HEAD in `red/gate-scan-HEAD.txt`, both judged by the gate's own `scanSource`).

### Zero duplication

An interim shared module of mine (`server/routes/domain-sign-ceremony.ts`) was written, then deleted before it left the
working tree, when P0-10a's `signGovernedAct` appeared doing the same job. All ten-plus-eleven domain routes now share
one ceremony. The routes take the QMS / `EsignModal` body shape (`reason`, `meaning`, `password`, `mfaToken`).

### Client call sites (grep of `client/src`, 2026-10-01)

- CMC: `CmcModule.tsx` (specification approve, batch release) and `cmcRegisters.tsx` / `cmcRegisterForms.ts`
  (`qualifyForm`, `qualifyBody`) already collect password, authenticator code and meaning and send `reauth`; the server
  contract is unchanged, so no client change.
- The other seven routes have no client caller (`IrbPackage.tsx`, `Registrations.tsx` and `NdaCockpit.tsx` only read;
  `ProtocolDevWrites.ts` posts deviations and assessments, not closures). Nothing to wire to `EsignModal`; a future
  surface can pass `EsignModal`'s `onSign` fields straight through.

## Red / green

| Check | Red (HEAD) | Green (fix) |
|---|---|---|
| `server/routes/__tests__/domain-sign-ceremony.routes.test.ts` (7 routes x 6-7 cases) | 42 failed, 4 passed (the 4 non-signature guards) | 46 passed |
| `server/api/cmc/__tests__/cmc-sign-signature-row.test.ts` (3 CMC routes x 3) | 6 failed, 3 passed (re-auth refusals HEAD already had) | 9 passed |
| `tests/db/domain-sign-ceremony.dbtest.ts` (real PostgreSQL, app_service, RLS on) | 24 failed, 7 passed | 31 passed |
| `ci:sign-ceremony` scanner over the ten files | 10 unceremonied sites | 0 |
| `ci:sign-ceremony` | OK (24 baselined) | fails only on the shrink check: 10 entries of this item at 0 (plus P0-10a's 9) |
| CMC contract tests (`tests/schema-contract/cmc-{batch-record,specification}-tenant-scope`) | n/a | 22 passed (now also assert no signature row on every refusal) |
| Related suites (70 files: CMC, BLA, IRB, RIM, protocol, consent, deviations, contracts) | n/a | 833 passed (`green/related-suites.txt`) |

Red for the route test and the dbtest was run against a reconstruction of HEAD: the ten files were replaced with
`git show HEAD:<file>`, the suite run, and the fixed files restored and compared byte-for-byte (all restored).

## Commands

```bash
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run \
  server/routes/__tests__/domain-sign-ceremony.routes.test.ts \
  server/api/cmc/__tests__/cmc-sign-signature-row.test.ts \
  tests/schema-contract/cmc-batch-record-tenant-scope.contract.test.ts \
  tests/schema-contract/cmc-specification-tenant-scope.contract.test.ts

TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable' \
APP_DATABASE_URL='postgresql://app_service:local-testdb-app-service-password@127.0.0.1:5432/c2c_testdb?sslmode=disable' \
RLS_ENFORCE=on npx vitest run --config vitest.db.config.ts tests/db/domain-sign-ceremony.dbtest.ts

npm run -s ci:sign-ceremony
```

The dbtest is lane `dbdsc`, organization 93220. Ledger rows and BLA/CMC fixture rows are removed after the run
(verified: 0 left); the 10 `electronic_signatures` rows per green run are permanent by design
(`trg_electronic_signatures_immutable`), against the permanent organization and signer.

## Gates

`green/gates.txt`: `ci:sign-ceremony:selftest`, `ci:client-ip-single-source`, `ci:no-mock-in-prod-routes`,
`ci:server-error-leaks`, `ci:untracked-imports`, `ci:drizzle-tenant-scope`, `ci:session-scoped-rls-bypass`,
`ci:fixture-fallback`, `ci:runtime-ddl` pass. `ci:discarded-audit-write` and `ci:fabricated-identity` crash with ENOENT
on `server/routes/qms.ts`, deleted (uncommitted) by another lane in the shared tree; neither reached these files.
ESLint on every changed file: 0 errors, warning counts equal to HEAD per file (`green/eslint-compare.txt`).

## Residuals

- **Baseline not written** (as instructed). `scripts/ci/sign-ceremony-baseline.json` needs these ten entries removed:
  `server/api/cmc/batchRecordRoutes.ts`, `server/api/cmc/routes.ts`, `server/api/cmc/specificationRoutes.ts`,
  `server/routes/biopharma/bla-workbench.ts`, `server/routes/iacuc.ts`, `server/routes/ibc.ts`, `server/routes/irb.ts`,
  `server/routes/protocol-consent.ts`, `server/routes/protocol-deviations.ts`, `server/routes/rim.ts`.
- **Depends on P0-10a's uncommitted `server/routes/governed-signed-act.ts`.** Commit P0-10b with or after it.
- **No write-role gate** on the IRB, IACUC, IBC, RIM and BLA routers (protocol-consent and protocol-deviations mount
  `requireEditorAccessForWrites`). A viewer who knows their own password can sign there. Proposed change: mount
  `requireEditorAccessForWrites` (server/middleware/orgMembership.ts) on those five routers, as P11-C-1 did for ProtocolDev.
- **Separation of duties is not run** for these record types: authorship is not modelled in
  `separation-of-duties.ts` `resolveTargetAuthors`, so the check would refuse every approval. Same posture as P0-10a.
- **No content binding**: proposing `BINDING_BASIS` entries (batch record, specification, register record, consent
  form) with a digest over the record as signed, in `server/services/part11/signature-persistence.ts`.
- `releasedBy` on a batch release is still client-supplied text stored in `cmc_batch_records.released_by`; the signature
  row's printed name comes from the server (`resolveSignerIdentity`), so the 11.50 manifestation is sound, but the
  column can disagree with it.

## Fix round (2026-10-01, after adversarial verification)

The P0-10 commit `ae36f2c8` carried this item. The verifier found four must-fix defects. All four were reproduced
on HEAD `9a086c0c` before any fix: unit tests run against unchanged code, and the dbtest run on an export of HEAD
(`git archive HEAD`, into the scratchpad) against the shared database, so the working tree was never swapped.

### What was wrong

| # | Defect | Where (HEAD) |
|---|---|---|
| 1 | **Second door, DP-02 (High).** `PATCH /api/{irb/submissions,iacuc/protocols,ibc/registrations}/:id/status` accepted `approved` and wrote it as a `transition` ledger row: no signature, no review record, no reviewer. Mounted behind `authMiddleware` only. An IBC approval set this way also skipped the review's `convened_quorum` record. | `server/routes/irb.ts`, `iacuc.ts`, `ibc.ts` (status routes) |
| 2 | **Second door, DP-02 (High).** `POST /api/cmc/specifications` took `approvalStatus` as any string and stored it. A create with `approved` stored an approved specification with no re-authentication, no ledger sign and no signature row. Its audit row named `'system'` as the actor, and the write-through carried `approved` into Module 3. | `server/api/cmc/specificationRoutes.ts` (`createSpecSchema`, create INSERT) |
| 3 | **No signing authority on the CMC three (High, 11.10(g)).** Batch release, specification approval and register qualification/validation checked identity only (`verifyReauth`). A viewer who knew their own password signed, and since P0-10b that act also carried an `electronic_signatures` row. | `batchRecordRoutes.ts`, `specificationRoutes.ts`, `routes.ts` `qualifyRegisterRecord` |
| 4 | **DP-58 (Medium, 11.50(a)(3)), introduced by P0-10b.** The batch release recorded `meaning: 'release'` for every disposition, so a rejected or conditional batch carried a signature that said "release". The same happened to an approval held at `pending-review` by a failing release test (found while fixing this). | `batchRecordRoutes.ts` ledger and signature payloads |

### What is true now

1. **The PATCH status routes refuse every status a committee determination sets** (IRB: `approved`,
   `modifications_required`; IACUC and IBC: `approved`, `conditional`) with `409 STATUS_SET_BY_DETERMINATION`, and
   write nothing. The message names the replacement route, `POST …/:id/reviews`, where an approval is an electronic
   signature (`signGovernedAct`) and every outcome leaves a review row. Statuses that no determination sets
   (`suspended`, `expired`, `closed`, …) still move through the PATCH, under a `transition` row. Nothing was lost:
   no client calls these PATCH routes (grep of `client/src`), and each refused status has its replacement route.
2. **A specification is created unsigned.** `approvalStatus` accepts only `draft` and `review`, the two values the client
   sends (`cmcSpec.ts` `specCreateBody`). Anything else, `approved` included, is a 400 whose message names
   `POST /api/cmc/specifications/:id/approve`, and nothing is stored. This refuses where the verifier proposed
   silently storing `draft`. A request for an approved spec answered 201 with a draft would tell the caller something
   it did not get. The create's audit row names the session's user. The route sits behind the global `/api` auth gate
   (`server/bootstrap/register-platform-routes.ts`), so a user is always present. A missing actor would be NULL,
   never `'system'`.
3. **The CMC three check signing authority before the password.** New module `server/api/cmc/cmc-signer.ts`:
   - `refusedWithoutSigningAuthority` reads the role from the membership row (`resolveSignerOrgRole`). It checks the
     role against the platform's one policy (`isSigningAuthorized`) and answers `403 ESIGNATURE_NO_AUTHORITY`, writing
     nothing. A failure to read the role is a 500 with no error text.
   - `verifiedReauthFactors` records the factors. Each route wrote that out itself before; it is now shared.

   `verifyReauth` stays in each handler on purpose. `ci:sign-ceremony` proves a `sign` write is ceremonied by finding
   the re-verification in the same handler. A first design that moved it into the helper was refused by the gate on
   all three sites (`green/fix-round/ci-sign-ceremony-helper-design-refused.txt`), so it was not shipped.
4. **The batch-release signature means what the disposition does.** The release evaluation (`evaluateRelease`) is
   pure, so it now runs before the signer is asked for anything. The meaning follows the resulting status:
   - `release` only when this act releases the batch;
   - `responsibility` (the quality unit's, 21 CFR 211.22(a)) for a conditional release, a rejection, or an approval
     held at `pending-review`.

   The disposition and the status stay on the manifest's `act`. The release form offers no separate meaning, so the
   disposition is the signer's declaration. A body that also declares a meaning must declare this one. A contradicting
   one is refused with `400 SIGNATURE_MEANING_CONFLICT`, and an unknown one with `SIGNATURE_MEANING_UNKNOWN`, both
   before the password; neither is substituted. As a side effect the release handler shrank from 149 lines and
   complexity 26 to 128 and 16.

### Red / green (fix round)

| Check | Red (HEAD `9a086c0c`) | Green |
|---|---|---|
| Route, CMC and PGlite contract suites (`red/fix-round/unit-and-contract.txt`) | 18 failed, 92 passed: 6 PATCH doors (`expected 201 to be 409`), 6 CMC viewer/no-member cases (`expected 200 to be 403`), 4 batch meanings (`'release'` on rejected/conditional; conflict not refused), 2 spec create (`approval_status: "approved"` stored; `changed_by: 'system'`) | 119 passed with `module3Linkage.routes.test.ts` (`green/fix-round/unit-and-contract.txt`) |
| Pending-review meaning (`red/fix-round/pending-review-meaning.txt`) | 2 failed (`'release'` on a batch held at pending-review; declared `release` not refused) | in the 119 above |
| `tests/db/domain-sign-ceremony.dbtest.ts`: real PostgreSQL 16, `app_service`, RLS on | 12 failed, 41 passed: viewer signed batch, spec and closure; rejected batch signed `release`; 6 PATCH doors set the status (`expected 201 to be 409`); spec create stored `approved` and `changed_by 'system'` | 53 passed (`green/fix-round/domain-sign-ceremony.dbtest.txt`) |
| Neighbouring suites (72 files: CMC, IRB/IACUC/IBC services, CMC contracts, client CMC/IRB) | n/a | 947 passed (`green/fix-round/related-suites.txt`) |
| ESLint on every changed file, against HEAD | n/a | 0 errors on every file; warnings per file equal to HEAD (`green/fix-round/eslint-compare.txt`) |

The dbtest's viewer cases for the seven `signGovernedAct` routes pass on both sides; that check landed in `ae36f2c8`.
For consent and deviations the viewer is refused earlier, by `requireEditorAccessForWrites`, so the test asserts 403
and nothing written there rather than the ceremony's own code.

### Gates (`green/fix-round/gates.txt`)

Pass: `ci:sign-ceremony` (3 baselined sites, exactly as baselined), `ci:sign-ceremony:selftest`,
`ci:client-ip-single-source`, `ci:no-mock-in-prod-routes`, `ci:server-error-leaks`, `ci:drizzle-tenant-scope`,
`ci:session-scoped-rls-bypass`, `ci:fixture-fallback`, `ci:runtime-ddl`, `ci:fabricated-identity`,
`ci:discarded-audit-write`, `ci:tenant-resolvers`.

`ci:untracked-imports` fails only because `server/api/cmc/cmc-signer.ts` is not yet in git, and on one import of
another lane's (`server/routes/chat/send-message.ts` → `./retrieval-evidence-block`). Commit `cmc-signer.ts` with the
three CMC route files.

### Commands (fix round)

```bash
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run \
  server/routes/__tests__/domain-sign-ceremony.routes.test.ts \
  server/api/cmc/__tests__/cmc-sign-signature-row.test.ts \
  tests/schema-contract/cmc-specification-tenant-scope.contract.test.ts \
  tests/schema-contract/cmc-batch-record-tenant-scope.contract.test.ts \
  server/api/cmc/__tests__/module3Linkage.routes.test.ts

TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable' \
APP_DATABASE_URL='postgresql://app_service:local-testdb-app-service-password@127.0.0.1:5432/c2c_testdb?sslmode=disable' \
RLS_ENFORCE=on npx vitest run --config vitest.db.config.ts tests/db/domain-sign-ceremony.dbtest.ts
```

Red for the dbtest: `git archive HEAD server shared tests scripts migrations db vitest.db.config.ts package.json
tsconfig.json`, extracted into the scratchpad. The new dbtest was copied in, `node_modules` symlinked, and the run made
there. The export was deleted afterwards.

Lane `dbdsc` (organization 93220) now has a second permanent member, `dbdsc-viewer@example.invalid` (role `viewer`).
After the green run: 0 ledger, audit, IRB, IACUC, IBC, specification, batch, closure and BLA rows remain for the
organization. `electronic_signatures` rows are permanent by design.

The shared test database (`/var/lib/postgresql/c2c-local`, behind the 5432 → 55433 proxy) was found stopped at
08:13 UTC, with its socket directory gone. It was restarted with its recorded options (`postmaster.opts`); no data was
changed.

### Residuals (fix round)

- **Determinations that do not set a status.** IRB `deferred`/`disapproved`, IACUC `tabled`/`withdrawn` and IBC
  `disapproved`/`tabled` still reach the status column only through the PATCH, without a review row, because
  `recordReviewTx` records those outcomes and leaves the status alone. Refusing them now would remove the only path.
  Proposed: have `recordReviewTx` (`server/services/{irb,iacuc,ibc}/*-service.ts`) set the status for every outcome,
  then add those outcomes to each route's `SET_BY_DETERMINATION`.
- **Other `verifyReauth` signers with no authority check in the file** (grep, not individually verified):
  - `server/api/cmc/module3OperatingSystemRoutes.ts:601` (Module 3 section approval). Proposed: call
    `refusedWithoutSigningAuthority(res, { userId: actorId, orgId })` from `./cmc-signer` before it.
  - `server/routes/510k-estar-routes.ts:2057`
  - `server/routes/mdx-submission-gateway.ts:215,382`
  - `server/routes/c2c/artifacts.ts:2769`
  - `server/routes/c2c/documents.ts:882`
  - `server/routes/financial-disclosures.ts:319`
  - `server/services/protocol-development/protocol-signature.ts:167` (may gate authority by another mechanism)
- **Stricter create attribution.** Refusing a specification create with no session user (instead of NULL) needs the
  `server/api/cmc/__tests__/module3Linkage.routes.test.ts` harness to carry one: add `req.user = { id: 42 };` to its
  request-context middleware.
- **Spec PUT attribution.** `PUT /api/cmc/specifications/:id` still writes `changed_by = data.changedBy || 'system'`
  (client-supplied text). Proposed: the session user, as the create now does.
- **No role gate on PATCH status** for the IRB, IACUC and IBC routers. A viewer can still move a status that no
  determination sets. Same proposal as above: mount `requireEditorAccessForWrites`.
