# SOP-SEC-001: Electronic Signature and Audit Key Management

**Status:** DRAFT v0.3 (2026-09-23). Production signer mode decided: `kms` (§2a).
DRAFT v0.2 (2026-09-20). v0.1 described a KMS signer that did not
exist in code; this revision describes what `concept2cure-v2` actually does and
marks, per section, what is implemented, partial, or planned. Nothing here has
been executed against a live AWS account yet (no credentials in the build
environment); the live steps are the founder's IQ items in §10.

## 1. Purpose
Establish controls for the cryptographic keys that make electronic records and
signatures in Concept2Cure attributable, tamper-evident and non-repudiable
(21 CFR Part 11 §11.10(c)(d)(e), §11.70, §11.200; EU Annex 11 §9, §14).

## 2. Scope — the keys, by name

| Key | Env var | Protects | Algorithm | Where read | Status |
|---|---|---|---|---|---|
| Audit seal key | `AUDIT_HMAC_KEY` | `audit_logs.hmac_seal`, `audit_events.hmac_seal` (writer deferred, see plan), the release-payload seal `payloadSeal` | HMAC-SHA256 | `server/services/audit/audit-hmac-seal.ts`, `server/services/ectd/sign-payload-seal.ts` | implemented; boot-gated in production (`auditSealPosture.ts`) |
| Audit chain secret | `AUDIT_HMAC_SECRET` | `audit.tamper_proof_log.signature` | HMAC-SHA256 | `server/lib/tamper-proof-audit.ts` | implemented; boot-gated in production |
| MFA secret key | `MFA_ENCRYPTION_KEY` | TOTP seeds at rest | AES-256-GCM | `server/services/mfaService.ts` | implemented; boot-gated in production |
| Connector credential key | `CONNECTOR_ENCRYPTION_KEY` | stored third-party connector secrets | AES-256-GCM | `server/services/connectors/connector-registry.ts` | implemented; throws at load in production when unset |
| **Release signing key (KMS)** | `CONCEPT2CURE_SIGNER_KMS_KEY_ID` (+ `CONCEPT2CURE_SIGNER_KMS_REGION`/`AWS_REGION`) | the release-signature payload digest (`payloadSignature` envelope beside `payloadSeal`) | RSASSA-PKCS1-v1_5 SHA-256 (or RSASSA-PSS SHA-256) in AWS KMS | `server/services/signature/{signer-mode,kms-signer,payload-signer}.ts` | **implemented in code with a fake KMS in tests; unexecuted against live KMS** |

### 2a. Production signer mode — decision (2026-09-23)
Production uses **`CONCEPT2CURE_SIGNER_MODE=kms`**. `hmac` is not used in
production. An HMAC seal is symmetric: anyone holding `AUDIT_HMAC_KEY` can mint
one, so it establishes that the server sealed a payload, not which key custodian
signed it. §11.70 asks that a signature be linked to its record so it cannot be
excised, copied or re-made. An asymmetric key whose private half never leaves
the KMS HSM, and which anyone can verify with the published public key, meets
that for this product's clients. The HMAC seal is still written beside every KMS
signature, so `kms` adds a guarantee and removes none. Decided by the product
owner's delegation, 2026-09-23, recorded here under §9.

`CONCEPT2CURE_SIGNER_MODE` (`dev | hmac | kms`) selects the signer and is
refused at boot in production when unset, `dev`, or incomplete
(`server/services/signature/signer-mode.ts`). `hmac` in production requires
`CONCEPT2CURE_SIGNER_ACCEPT_HMAC=true`, recording that the operator accepts a
symmetric seal (server authenticity) in place of an asymmetric signature.

## 3. Key custody (§11.10(a)) — planned, partially implemented
- **Symmetric keys** (`AUDIT_HMAC_KEY`, `AUDIT_HMAC_SECRET`, `MFA_ENCRYPTION_KEY`,
  `CONNECTOR_ENCRYPTION_KEY`) are provisioned to the task through AWS Secrets
  Manager (`terraform/modules/secrets`). They are never in the database and
  never in the repository. *Status: terraform module exists; the production
  environment has not been applied (row D1).*
- **The release signing key** is an AWS KMS asymmetric RSA key. The private key
  is generated inside KMS and is not exportable. The application's IAM task role
  holds `kms:Sign`, `kms:Verify`, `kms:GetPublicKey` on that key and nothing
  else; no human principal holds `kms:Sign`. *Status: written as infrastructure
  code, not yet applied (2026-09-23). `terraform/stack/release_signing.tf`
  (moved from `environments/production/` on 2026-09-24, when both environments
  began sharing one composition) defines the key and its key policy. Production's
  alias is `alias/fda-signing-key-{YYYY}`. Staging has its own key under
  `alias/fda-signing-key-{YYYY}-staging`, so a staging signature can never be
  made with the production key:
  - account principals may administer the key (the policy's administration
    statement grants no `kms:Sign`) and may Verify and read the public key;
  - only the ECS task role may Sign.
  The API and worker task definitions carry `CONCEPT2CURE_SIGNER_MODE=kms`, the
  alias and the region. `terraform validate` passes. The key exists only once
  the founder runs `terraform apply` (§10).*

## 4. Key generation (§11.10(b)) — written as code, not yet applied
- KMS `CreateKey` with `KeySpec=RSA_4096` (RSA_2048 minimum), `KeyUsage=SIGN_VERIFY`,
  alias `alias/fda-signing-key-{YYYY}`. Record the key ARN, creation date and
  the CloudTrail event id in `docs/evidence/validation/`.
- Symmetric keys: `openssl rand -base64 48 | tr -d '\n='`, ≥32 characters
  (enforced at boot: `AUDIT_HMAC_KEY_MIN_LENGTH = 32`).

## 5. Key rotation (§11.10(c)) — planned
- KMS asymmetric keys do not auto-rotate. Rotation = create the next year's key,
  point `CONCEPT2CURE_SIGNER_KMS_KEY_ID` at it, keep the previous key **enabled
  for Verify only** for the retention period, **and add the previous key to
  `CONCEPT2CURE_SIGNER_KMS_VERIFY_KEY_IDS`** (comma-separated ids, ARNs or
  aliases). Old signatures then verify against the old key.
- How the verifier picks the key, and why the last step is required: it trusts
  only the keys the deployment names — the current key and those listed — and
  never the key an envelope names, because an attacker who can rewrite an
  envelope could point it at a key of their own. Among the trusted keys it picks
  the one whose public-key fingerprint matches the envelope's
  `publicKeySha256` (the alias the posture names and the ARN an envelope records
  never agree as text). **A previous key that is not listed is not trusted**, so
  a release signed under it verifies `failed` — fail closed, never silently
  accepted. Proof: `server/services/signature/__tests__/payload-signer-rotation.test.ts`.
- *Corrected 2026-10-18.* Until then this section said old signatures verify
  against the old key while the code verified against the current key only;
  following this procedure would have made every earlier release verify
  `failed` and blocked its export. KMS signing was not yet executed against live
  KMS, so no real signature was affected
  (`docs/evidence/D5/2026-10-18-kms-verify-survives-rotation/`).
- Symmetric key rotation is **not yet supported in code**: the seal verifiers
  read one key. Rotating `AUDIT_HMAC_KEY` today makes earlier seals report
  `failed`. Until a key-id/epoch column exists, rotation is a documented
  maintenance event, not a routine.

## 6. Audit trail (§11.10(e)) — partially implemented
- Every KMS `Sign`/`Verify`/`GetPublicKey` is logged by CloudTrail. The
  `terraform/modules/compliance-evidence` module writes CloudTrail to an S3
  bucket with Object Lock and KMS encryption. *Status: module exists; not applied.*
- Application-side, every release signature lands in `electronic_signatures`
  (single write path, `server/services/part11/signature-persistence.ts`) and the
  governed action in the sha256-chained `audit_logs`.

## 7. Signature verification — implemented
- **Online:** `verifySignPayloadSignature` rebuilds the canonical input from the
  (digest, organisation) the server holds, refuses an envelope whose stored
  input differs byte-for-byte, and calls the KMS `Verify` API against the key
  the *posture* names (not the key the envelope names).
- **Offline / inspector:** `verifyPayloadSignatureOffline` verifies with the
  published public key (DER SPKI) using node:crypto; the envelope's
  `publicKeySha256` must match the key handed in. An inspector can reproduce
  this with `openssl dgst -sha256 -verify pub.pem -signature sig.bin input.txt`
  where `input.txt` is the envelope's `signedInput`.
- Both paths are exercised in `server/services/signature/__tests__/` and
  `server/services/ectd/__tests__/sign-payload-kms-seam.test.ts` with an
  in-memory RSA KMS; the offline path uses the same signatures the fake
  produced, proving the two agree.
- *Not yet:* publishing the public key at a URL; OCSP does not apply (no
  certificate is issued for a KMS key).

## 8. Disaster recovery — planned
- Multi-Region KMS key with a replica in a second region; RPO 0, RTO under one
  hour. Symmetric keys replicated by Secrets Manager multi-region replication.
- Database restore is drilled by `scripts/ops/dr-restore-drill.sh` and
  `.github/workflows/database-dr-restore-proof.yml`; after a restore, run the
  audit-chain verifier against the restored database and file the output. Inside
  the VPC it runs from the production image, as §10 step 5 shows; against a drill
  database a checkout can reach, `npm run ops:verify-audit-chain` is the same
  verifier.

## 9. Change control
Any change to key policy, rotation schedule or signer mode is a change under
`docs/security/policies/POLICY-CM-003-change-management.md` and is recorded
here with a dated entry.

## 10. Evidence for inspection and the founder's live steps
Steps 1–3 are now one `terraform apply` of `terraform/environments/production`.
It creates the key and the alias `alias/fda-signing-key-2026`, attaches the key
policy and sets the three variables on both task definitions.
1. Create the KMS key (§4); file the `release_signing_key_arn` output and the
   CloudTrail `CreateKey` event.
2. File the applied key policy JSON (`aws kms get-key-policy`). It grants the
   task role `kms:Sign/Verify/GetPublicKey`, and no human principal Sign.
3. Confirm the production task boots with `CONCEPT2CURE_SIGNER_MODE=kms`,
   `CONCEPT2CURE_SIGNER_KMS_KEY_ID` and `CONCEPT2CURE_SIGNER_KMS_REGION`. A
   wrong value refuses to boot, and that refusal is itself evidence. The
   deploy workflow's preflight refuses a task definition with no signer mode
   before it rolls.
4. Sign one release on staging; export it; file the `payloadSignature` envelope
   and an offline `openssl` verification of it.
5. Run the audit-chain verifier against production; file the output under
   `docs/evidence/W3b/<date>/`. The database admits only the ECS tasks
   (`scripts/ops/ecs-one-off-task.sh` says why), and the verifier reads
   `DATABASE_URL`, the owner's credential, which only the database task
   (`c2c-production-migrate`) carries (MR-03 Stage 3, OPS-16). So it runs as a
   one-off task derived from that family, from the deployed image, through the
   runner the migration uses, with an operator's credentials (the GitHub deploy
   role may run only the migrate and provision families):
   ```sh
   ECS_CLUSTER=c2c-production ECS_API_SERVICE=c2c-production-api \
   SOURCE_TD_ARN=<the c2c-production-migrate revision the last deploy checked> CONTAINER_NAME=migrate \
   FAMILY=c2c-production-verify-audit-chain \
   IMAGE=<the deployed API image>@sha256:<digest> \
   COMMAND_JSON='["node","dist/ops/verify-audit-chain.mjs","--json"]' \
   LABEL=audit-chain-verify STARTED_BY=verify-audit-chain \
     bash scripts/ops/ecs-one-off-task.sh
   ```
   Exit 0: every chain verified. 2: the verifier could not check a table, or
   could not reach the database. 124: the deadline passed. Exit 1 is a broken
   chain only when the report printed with it says `"verdict": "broken"` and names
   the first break; an exit 1 with no report means the verifier never ran (the
   runner answers 1 for a container that did not start, and Node for a module it
   cannot load, as in any image built before this one). `npm run build` emits `dist/ops/verify-audit-chain.mjs` beside
   the server (`scripts/build-server.mjs`, since 2026-10-18). Until then the image
   had no runnable copy: `npm run ops:verify-audit-chain` is
   `tsx scripts/ops/verify-audit-chain.mjs`, and the image has neither tsx nor
   `scripts/ops`. That command remains the checkout form, which cannot reach
   this database.

## Revision history
| Version | Date | Change |
|---|---|---|
| 0.1 | (undated) | Original: described KMS custody as if implemented. |
| 0.2 | 2026-09-20 | Rewritten against the code. Names every key and env var; marks each section implemented / partial / planned; adds the signer-mode boot gate, the envelope, offline verification and the live steps still owed. |
| 0.3 | 2026-09-23 | Production signer mode decided: `kms` (§2a). The key, key policy, alias and task-definition variables are written as Terraform (`release_signing.tf`) and validated; not yet applied. §10 steps 1–3 collapse into one apply. |
| 0.4 | 2026-10-18 | §5: a rotated-out key stays trusted for verification by public-key fingerprint (`CONCEPT2CURE_SIGNER_KMS_VERIFY_KEY_IDS`); before this, the rotation step would have failed every earlier release. §8 and §10 step 5: the audit-chain verifier runs from the production image (`node dist/ops/verify-audit-chain.mjs` as a one-off task); the command named before could not run there. |
| 0.5 | 2026-10-22 | §10 step 5: the audit-chain verifier derives from the database task (`c2c-production-migrate`, `CONTAINER_NAME=migrate`). It reads `DATABASE_URL`, and since MR-03 Stage 3 (OPS-16) the API task definition carries no owner credential, so a task derived from it could not connect. |
