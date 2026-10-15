# P1-19b — the signed audit export named no key, and fell back to the JWT secret (DP-11, Medium; the cold half)

**Row:** D5. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` DP-11 ("the export key falls back to
`JWT_SECRET`; a symmetric seal cannot be verified offline by an inspector"). **Plan item:** P1-19 in
`docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` — "its own export key with a key id; an asymmetric
(KMS) export signature an inspector can verify offline". The `audit_logs` half (P1-19a) was closed on 2026-09-25 by
lane `…01KnUGoX` as VR-02 (`3c7fb27c` + `5eb52e22`; `docs/evidence/D5-SIGNED-EXPORT-AUDIT-LOGS/2026-09-25/`). This
folder is the key-id half, built on the cold files only; the two one-line pieces in hot files are written out below
with the windows they wait for.

## What was wrong (at `6eeee017`)

- `server/services/audit/signedAuditExport.ts:141-152` — `getSigningKey()` was
  `AUDIT_EXPORT_SIGNING_KEY || JWT_SECRET_PROD || JWT_SECRET`, resolved at the moment of signing **and** at the moment
  of verifying. The manifest (`:62-135`) carried no key id, so `:631-633` recomputed the HMAC with whatever that
  chain resolved to *now* and compared with `!==`. Three consequences:
  1. An export could not say which key sealed it, so rotating the key made every earlier export fail verification —
     the wrong incentive for a key that must rotate.
  2. A deployment that never set `AUDIT_EXPORT_SIGNING_KEY` sealed every inspector-facing export under the JWT
     secret — the session-token key, reused across a trust boundary — and the manifest looked identical to one sealed
     under a dedicated key. Terraform wires `AUDIT_HMAC_KEY` and `AUDIT_HMAC_SECRET` and not the export key
     (`terraform/stack/main.tf:204-205`), so a production deployment following it is exactly this case.
  3. Nothing at boot required the key: `server/config/environment.ts:297,304` assert the two audit HMAC keys and
     nothing asserts this one. (2) was therefore silent.
- The signature comparison was `!==` (`:633`), not constant-time.

## What is true now

**`server/services/audit/auditExportKeyPosture.ts` (new)** — the one place the export key is read, in the two shapes
the repository already uses for the same problem: the key id and `_PREV` slot of
`server/services/tenant-export/attestation-report.service.ts:99-109` (`_ID` default `'k1'`, `_PREV` / `_PREV_ID`, the
verifier picks a key **by id** and never guesses) and the production posture of
`server/services/audit/auditSealPosture.ts:93-129` (production only, minimum length, the value never echoed, an
injected `env`).

| Export | Line | Does |
|---|---|---|
| `resolveExportSigningKey()` (no id) | `:245` | the key for a **new** export: `AUDIT_EXPORT_SIGNING_KEY` under `AUDIT_EXPORT_SIGNING_KEY_ID` (`'k1'` when unset); outside production, when no dedicated key is set, the JWT secret (`JWT_SECRET_PROD` ahead of `JWT_SECRET`, as the old chain had it) under the id **`'jwt-secret-fallback'`**; in production the posture below is applied at the point of signing, so there is no fallback whether or not the boot call has landed |
| `resolveExportSigningKey(keyId)` | `:245` | the key a manifest **names**: current id, `_PREV_ID`, or `'jwt-secret-fallback'`; `null` for an id nothing is configured under |
| `resolveLegacyExportSigningKey()` | `:262` | the pre-key-id chain, frozen, for manifests with no `signingKeyId`; never on a write path |
| `assertAuditExportKeyPostureForProduction(env)` | `:131` | no-op outside production; in production **REFUSING TO BOOT** when the key is missing or blank, shorter than 32, equal to `JWT_SECRET` or `JWT_SECRET_PROD`, or when the `_PREV` pair is half set, shorter than 32, the JWT secret, the current key, or under the current id. **No accept flag.** Returns the active key id. **Exported and not yet called** from `environment.ts` (deferred, below) |
| `configuredExportKeyIds(env)` | `:105` | the ids the verifier can answer for, for the refusal that names them |

**`server/services/audit/signedAuditExport.ts`**

- The manifest carries **`signingKeyId`** (`:97` type, `:599` stamped), under the version-2 signature like every other
  field — `stableStringify` includes it when present and a legacy manifest has none, so the v1/v2 canonicalization is
  untouched (`signed-audit-export-canonicalization.test.ts` 9/9). The key is resolved before the export's
  `audit_events` row is written (`:537`), so a production deployment without its key refuses before any row.
- Verification (`:646`) resolves the key **by the manifest's own id**: current or `_PREV` (a rotation keeps old exports
  verifiable), `'jwt-secret-fallback'` for an export sealed that way, and a refusal that names the id and the configured
  ids for anything else — never "try the key configured now". A manifest with no key id (every export already issued)
  takes the legacy resolution (`:664`), unchanged, so every one of them still verifies. The result carries
  `signingKeyId` so the caller can say which key vouched.
- The comparison is `crypto.timingSafeEqual` over equal-length buffers (`:170`, `:681`); a signature of the wrong
  length or shape is invalid, not an exception.

**Unchanged:** the export record and its ordering, the route contracts (`POST /api/audit/export/verify` still reads
`valid` / `errors`; the routes' mocked suite is green), both canonicalizers, and the behaviour of every export already
issued (three legacy guards in the new suite, green before and after).

## Evidence

| | File | Result |
|---|---|---|
| red | `red/before-fix.txt` | HEAD `6eeee017`, `signedAuditExport.ts` unchanged, no posture module: **5 of 11** cases fail (`signingKeyId` undefined; verification after rotation fails; a manifest naming a key that is no longer configured is accepted; the fallback is invisible; production signs under the JWT secret and records the export) and `auditExportKeyPosture.test.ts` cannot import. The 6 passing cases are the legacy and wrong-key guards, green by design |
| green | `green/after-fix.txt` | **63 / 63** — the two new suites (12 + 23) and the four the item must keep green: `signed-export-audit-logs.pglite.test.ts` 6, `signed-audit-export-canonicalization.test.ts` 9, `tests/gates/unverified-verdicts/signed-audit-export.gate.test.ts` 6, `server/routes/__tests__/audit-export-tenant-scope.test.ts` 8 |
| lint | `green/lint.txt` | the new module and both new suites lint clean; `signedAuditExport.ts` keeps its one pre-existing warning (`:406` `idx`, `no-useless-assignment`; `:391` at HEAD) |
| gates | `green/gates.txt` | `ci:env-var-docs --strict-no-regression` exits 1 on 27 names, every one read by another lane's file already in the working tree and none `AUDIT_EXPORT_*` (attributed by file in the record). The three new names are read off the injected `env`, which the scan does not match; documenting them in `.env.example` is the deferred half below |

Tests: `server/services/audit/__tests__/signed-audit-export-key-id.test.ts` (the export and the verifier over a pool
double; process.env set and restored per case) and `server/services/audit/__tests__/auditExportKeyPosture.test.ts`
(the posture and the three resolutions over a built env, in the shape of `auditSealPosture.test.ts`).

Re-run:

```
NODE_OPTIONS=--max-old-space-size=1536 npx vitest run \
  server/services/audit/__tests__/signed-audit-export-key-id.test.ts \
  server/services/audit/__tests__/auditExportKeyPosture.test.ts \
  server/services/audit/__tests__/signed-export-audit-logs.pglite.test.ts \
  server/services/audit/__tests__/signed-audit-export-canonicalization.test.ts \
  tests/gates/unverified-verdicts/signed-audit-export.gate.test.ts \
  server/routes/__tests__/audit-export-tenant-scope.test.ts
npx eslint server/services/audit/signedAuditExport.ts server/services/audit/auditExportKeyPosture.ts \
  server/services/audit/__tests__/signed-audit-export-key-id.test.ts server/services/audit/__tests__/auditExportKeyPosture.test.ts
```

## What waits for which window

1. **`server/config/environment.ts`** — hot until **2026-09-27 02:48 UTC** (lane `…01SuVLo2`). The boot call, beside
   `:297` / `:304`:

   ```ts
   import { assertAuditExportKeyPostureForProduction } from '../services/audit/auditExportKeyPosture';
   // Audit EXPORT signing key: the third audit key, the one an inspector's export is sealed under. In
   // production it must be provisioned (>= 32 chars, distinct from the JWT secret) and its _PREV pair, if
   // set, complete and distinct; there is no accept flag. Fires on import (same contract as the asserts
   // above). No-op outside production. See server/services/audit/auditExportKeyPosture.ts.
   assertAuditExportKeyPostureForProduction();
   ```

   Until it lands the refusal happens at the first production export (`resolveExportSigningKey()` applies the same
   posture) rather than at boot — later than it should be, never silent.

2. **`.env.example`** — hot until **2026-09-27 12:15 UTC** (lane `…01E8btkB`). Replace `:814-817` with:

   ```
   # Signs the audit exports an inspector re-verifies (§11.10(e)). REQUIRED in production, >= 32 chars, distinct
   # from JWT_SECRET: the server refuses to start without it (server/services/audit/auditExportKeyPosture.ts) and,
   # until that boot call lands, refuses the first export. Outside production an unset key falls back to the JWT
   # secret and the manifest says so (signingKeyId 'jwt-secret-fallback'). *_ID names the active key (default 'k1')
   # and is stamped into every manifest; the *_PREV / *_PREV_ID pair keeps a rotated-out key so its exports still
   # verify (set both or neither; a different id from the current one).
   AUDIT_EXPORT_SIGNING_KEY=
   AUDIT_EXPORT_SIGNING_KEY_ID=
   AUDIT_EXPORT_SIGNING_KEY_PREV=
   AUDIT_EXPORT_SIGNING_KEY_PREV_ID=
   ```

   `docs/runbooks/env-var-documentation-gate.md:63` already lists `AUDIT_EXPORT_SIGNING_KEY` among the documented
   crypto variables; add "`+ _ID`/`_PREV`/`_PREV_ID`" after it, as the attestation key's entry reads.

3. **Terraform and preflight — W2's (`terraform/stack/main.tf` is lane `…01AiwZKG`'s file; hand-off, not an edit).**
   A `var.audit_export_signing_key` (`length >= 32`, and `!= var.jwt_secret`, `!= var.audit_hmac_key`,
   `!= var.audit_hmac_secret` in the `lifecycle` preconditions at `main.tf:144-151`), an `audit_export_signing_key`
   entry in `module.secrets`, and two `boot_secrets` rows — `AUDIT_EXPORT_SIGNING_KEY` from the secret and
   `AUDIT_EXPORT_SIGNING_KEY_ID` (a plain value, `k1`). `scripts/deploy-prod.sh` preflight: the same three checks the
   posture makes. **Order of operations for the operator:** provision the secret **before** this commit reaches
   production; from this commit a production deployment without it answers `GET /api/audit/export` and
   `/export/signed` with the route's static 500 instead of sealing under `JWT_SECRET`, and once the boot call lands it
   does not start.

4. **The asymmetric (KMS) signature an inspector verifies offline — remains open.** The plan row's acceptance test
   ("an export of a launch-app action verifies offline with the published key") needs an asymmetric KMS key
   (`ECC_NIST_P256` or `RSA_3072`, `SIGN_VERIFY`), `kms:Sign` on the task role, `kms:GetPublicKey` published at a
   stable URL with the key id, a second signature block in the manifest (`{ algorithm, keyId, value }`, the
   attestation shape) beside the HMAC, and a verifier that runs with no server secret. That is a Terraform/W2 item and a
   founder decision (cost, region, key policy), and it overlaps P1-11 (seal-key rotation, key id / epoch). The key id
   landed here is what that signature block will carry.

5. **Still open on P1-19 beyond this half:** DP-12 (the `audit_events` seal writer and a full-field record hash) and
   DP-13 (`old_values` on governed changes; `writeChainedAuditRow` writes NULL at `auditService.ts:302`).

6. **`server/routes/audit-trail-routes.ts`** (another agent may be in it; not edited): the `verification.instruction`
   sentence in `GET /audit/export/signed` says "using the server signing key". Proposed: "using the key named by
   `manifest.signingKeyId` (the current `AUDIT_EXPORT_SIGNING_KEY`, or the `_PREV` key it was rotated from)". The
   `POST /audit/export/verify` response could also surface `result.signingKeyId`; both are one-line follow-ups.

## The boot half, landed 2026-09-30

The two files the cold half waited on had left their windows (last touched 2026-09-28 16:51 by lane `…01Jf7Uu6`), and
so had every deploy file the key has to travel through. A boot refusal with no provisioning behind it would stop every
deploy, so the key was wired end to end in one change:

| Where | What |
|---|---|
| `server/config/environment.ts` | `assertAuditExportKeyPostureForProduction()` beside the two audit HMAC asserts: production refuses to start without a dedicated key, with a short one, or with one equal to either JWT secret; no accept flag |
| `server/routes/audit-trail-routes.ts` | the signed export's `verification` carries `signingKeyId` and its instruction names "the audit export key named by `manifest.signingKeyId`" instead of "the server signing key"; `POST /audit/export/verify` answers which key vouched (`null` for a manifest from before key ids) |
| `terraform/stack/{main,variables}.tf` | `var.audit_export_signing_key` (sensitive, `>= 32`), an `audit_export_signing_key` secret, the `AUDIT_EXPORT_SIGNING_KEY` boot secret on every container, and two plan-time preconditions: not the JWT secret, not either audit HMAC key |
| `terraform/environments/{production,staging}/` | the variable declared and passed to the stack; the tfvars examples say how to mint it |
| `terraform/stack/tests/boot_contract.tftest.hcl` | the test value, the no-secret-in-plain-environment list, and three refusal runs (short; equal to the JWT secret; equal to an audit seal key) |
| `.github/workflows/deploy-aws.yml`, `scripts/deploy-prod.sh` | the name in both preflight lists, with its source file |
| `.github/workflows/ci.yml` | the boot smoke, which starts the server with `NODE_ENV=production`, gets a throwaway key |
| `docker-compose.yml`, `docker-compose.beta.yml`, `.env.beta.example` | required like its siblings (`${…:?}`), so `docker compose up` stops naming it |
| `.env.example`, `docs/runbooks/env-var-documentation-gate.md` | the boot-contract list and the four-line block (`_ID`, `_PREV`, `_PREV_ID`) |
| tests | `server/config/__tests__/environment-audit-export-key.test.ts` (5 cases); `environment.test.ts` and `storage-posture.test.ts` production fixtures given a key; three route cases in `audit-export-tenant-scope.test.ts` (whose harness gained the JSON parser the verify route needs) |

| | File | Result |
|---|---|---|
| red | `red/boot-call-before.txt` | the five environment cases against `environment.ts` without the call: 3 refusal cases fail (the promise resolved), 45 others pass |
| red | `red/terraform-before.txt` | the preflight list and the test name the key, the stack does not provision it: `staging_carries_every_name_the_deploy_preflight_requires` fails its assertion and `refuses_a_short_audit_export_key` fails with "Missing expected failure" |
| red | `red/route-text-before.txt` | the three route cases against the unchanged route: `signingKeyId` absent from both answers |
| green | `green/boot-wiring-after.txt` | 14 suites / 212 tests (every suite that boots production, signs or verifies exports, or serves the export routes), then the environment pair after the block moved to its own file for the 500-line rule: 48 / 48 |
| green | `green/terraform-after.txt` | `terraform test`: 25 passed, 0 failed (22 before, plus the three refusal runs) |
| green | `green/terraform-preflight-proof.txt` | `scripts/ops/terraform-preflight-proof.mjs`: the rendered task definition passes the deploy workflow's own preflight shell, names end to end, every check holds |
| green | `green/validate-and-env-docs.txt` | `terraform validate` of both environment roots with the providers their lock file pins; the env-var documentation gate's 28 pre-existing names, none this change's |

Terraform ran locally as 1.9.8 (the version `terraform-tests.yml` pins) against a filesystem mirror of the providers
downloaded from releases.hashicorp.com, because the registry is not reachable from this container; the lock file the
stack's `init` wrote was moved out of the tree, and the production root's tracked lock file is unchanged.

**Operator ordering.** Provision `TF_VAR_audit_export_signing_key` (`openssl rand -hex 32`) before this reaches an
environment: `terraform plan` now refuses without it, and a task definition without it fails the preflight and would
refuse to boot. **Still open on DP-11:** the KMS asymmetric signature an inspector verifies offline with a published
key and no shared secret (W2 and the founder; overlaps P1-11).

