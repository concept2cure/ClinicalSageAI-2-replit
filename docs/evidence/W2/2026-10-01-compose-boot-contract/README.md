# D1 — the self-host and beta Compose stacks can boot, and someone can sign in

**Row:** D1 (commercially deployed), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-10-01. Claimed before the change (work-orders register).
**Found by:** the founder's external-requirements inventory, while costing the
single-server beta option.

## The defect

`docker-compose.yml`, the self-host install, and `docker-compose.beta.yml` both
run the app with `NODE_ENV=production`. Both files say they carry its
fail-closed boot contract through compose's `${VAR:?}` syntax. Neither did:

| Missing                                                                | Effect                                                                                                                                                          |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONCEPT2CURE_SIGNER_MODE`                                             | Boot refused (`signer-mode.ts`).                                                                                                                                |
| `AI_SENSITIVE_DATA_POLICY_MODE`, `AI_PROVIDER_PLACEMENT_APPROVALS`     | Boot refused (`sensitive-placement-policy.ts`).                                                                                                                 |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (no SMTP variable passed at all) | Even a booted server signs no one in: the emailed login code is the mandatory second factor.                                                                    |
| `APP_URL`, `ALLOWED_ORIGINS`                                           | Production's CSRF origin check admits only a hard-coded set of company domains, so sign-in from the stack's own origin returns 403. Reset links have no origin. |
| `AUDIT_TRAIL_ENABLED`, `AUDIT_REQUIRE_ENFORCE`                         | The tamper-proof trail is off, or its failures only warn.                                                                                                       |
| `ANTHROPIC_API_KEY` allowed to be empty                                | Every Authoring draft is refused.                                                                                                                               |

The beta stack also passed `SENDGRID_API_KEY`, which no code delivers mail with.
`.env.beta.example` listed email under "optional", with port 587, which the
mailer does not treat as TLS. Nothing compared either stack with the contract.

## The change

- **`scripts/ci/check-compose-boot-contract.mjs`** (`npm run ci:compose-boot-contract`,
  with `:selftest`). It runs in `ci.yml` as a blocking guardrail.
  - **The required names are not a copy.** They are read from deploy-aws.yml's
    preflight: its `for VAR in … ; do` list, plus `APP_URL`, which the
    preflight checks on its own. That is the list
    `terraform-preflight-proof.mjs` already holds Terraform to, so a variable
    added there is required here on the next run.
  - **Added for Compose:** `ALLOWED_ORIGINS`.
  - **Excused when the vault is on local disk:** `AWS_S3_BUCKET`. The check
    then requires `STORAGE_ACCEPT_LOCAL_DISK=true` instead.
  - **What counts as given.** Each name must be a literal, `${NAME:?…}`, or a
    non-empty default. A bare `${NAME}` or `${NAME:-}` fails, because the
    container would start with it empty.
  - **Pinned values:** `NODE_ENV=production`, `RLS_ENFORCE=on`,
    `AI_SENSITIVE_DATA_POLICY_MODE=enforce`, and the two audit flags `true`.
  - **The HMAC signer** requires `CONCEPT2CURE_SIGNER_ACCEPT_HMAC`.
- **Both stacks** now pass all of these.
  - The signer defaults to `hmac`. Its acceptance is required from the operator
    (`:?`), because accepting a symmetric seal is their decision. KMS key id and
    region are passed through for `kms`.
  - The placement approvals, `APP_URL`, `ALLOWED_ORIGINS` and SMTP have no
    default.
  - `SMTP_PORT` defaults to 465.
- **`.env.beta.example`:** email moves to "required" on port 465, with
  `SMTP_FROM` added. The new required variables are documented, and
  `SENDGRID_API_KEY` is gone.

## The proof

| File                              | Shows                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `red/before-fix.txt`              | The check on the stacks as they were: **22 problems**, 11 in each file.                                                                                                                                                                                                                         |
| `green/self-test.txt`             | The self-test: a complete stack passes. Each of these fails, naming the variable: SMTP absent, a bare `${ANTHROPIC_API_KEY}`, an empty default, `RLS_ENFORCE` defaulting to off, an unaccepted HMAC signer, an S3 vault with no bucket, no `ALLOWED_ORIGINS`. List-form `environment:` is read. |
| `green/docker-compose-config.txt` | Docker Compose v5.1.1 on both files. With every required variable set to a placeholder, `config` resolves (exit 0), and the resolved app settings are listed. Without `SMTP_HOST`, `config` stops and names it (exit 1).                                                                        |
| `server-boot-asserts.txt`         | **The server's own boot assertions** (`assertSignerModeForProduction`, `assertSensitivePlacementConfiguration`, `isEmailConfigured`), run on the environment `docker compose config` resolves. Both stacks as on trunk are **refused on all three**. With this change, **all three accept**.    |

After the change, `npm run ci:compose-boot-contract` reports both stacks
carrying the contract. `check-env-var-docs` passes as on trunk.

## Still asserted, not proven

- **A full container boot.** The image was not built and started here. That
  needs a database migrated by `install-fresh.mjs` and the heavy image
  (LibreOffice and a JRE). The three refusals above are the ones the stacks hit
  first. A later refusal would show in the container's first log lines; none
  is known.
- **TLS.** Neither stack terminates TLS. The header comments now say to put a
  TLS proxy in front, because `APP_URL` must be https.
