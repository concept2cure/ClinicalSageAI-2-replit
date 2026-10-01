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
  COMMIT, as `module3OperatingSystemRoutes.ts` does: the declared meaning (`release` for a batch release), the factors
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
