# Production dependency justifications

AGENTS.md: *"No new production dependency without a written justification doc
in `docs/`."* This file is that document for dependencies added under the
security workstream. One entry per package; an entry is added in the same
change that adds the package, and removed when the package is.

## `@aws-sdk/client-kms` — added 2026-09-20 (W3b, row D5)

| | |
|---|---|
| Version | `3.1106.0`, pinned exactly to the version of `@aws-sdk/client-s3` already installed, so the two clients share one `@smithy/*` transitive set. The lockfile diff is +127 lines and adds no new transitive package family. |
| Purpose | The `kms` arm of `CONCEPT2CURE_SIGNER_MODE` (`server/services/signature/kms-signer.ts`): `SignCommand`, `VerifyCommand`, `GetPublicKeyCommand` against the RSA key `docs/SOP_KEY_MANAGEMENT.md` describes. Nothing else imports it. |
| Why not something lighter | The alternative is a hand-rolled SigV4 client for the KMS REST API. That is more code, our own crypto-adjacent code, and a second implementation of what the S3 client already carries. The SDK is the vendor's contract; the adapter is tested against its real command classes with a fake `send`. |
| Runtime reach | Dynamically imported (`await import('@aws-sdk/client-kms')`) only when the posture resolves to `kms`, so a `dev`/`hmac` process never loads it. Credentials come from the default AWS provider chain (task role); no secret is held in this repository. |
| Advisory scan | `npm run ci:dependency-risk:reseal` re-ran `npm audit --audit-level=high` after the install: **finding set unchanged** (the two pre-existing `image-size` advisories, both recorded unreachable). Ledger resealed to lockfile `d2c4511f…` in `docs/security/dependency-risk-ledger.json`. |
| Owner | Founder (as for every ledger row until a named security owner exists — see `WO-07-dependency-risk-decision.md` §Ownership). |
| Removal condition | If the signer moves to a different HSM provider, this package and `kms-signer.ts` go together. |
