# D1 — the production image boots in a container: blocked by this environment

**Row:** D1. **Date:** 2026-10-01. **Status:** moved to CI (see _Resumed_ below); done when the `production-image-boot` job is green.

## What was attempted

Every boot proof so far runs the server from source, as `ci.yml`'s
production-mode boot does, or renders task definitions, as
`terraform-preflight-proof.mjs` does. None starts the image
`Dockerfile.optimized` produces. The plan:

1. build the image;
2. provision a database from empty with the image's own provision path;
3. start the production stage as `app_service` with `RLS_ENFORCE=on`;
4. take `/healthz`, `/readyz` and a sign-in as far as the environment allows.

**How far it got.** A Docker daemon was started in the session, and
`node:22-slim` pulled. The session's TLS proxy CA was added to a locally
re-tagged base image only. `Dockerfile.optimized` was not changed.

## Why it stopped

The production stage's first step installs LibreOffice, Ghostscript, OCRmyPDF,
Tesseract, a JRE and libxml2 from Debian. The environment's network policy
refuses `deb.debian.org`, as `blocked-debian-mirrors.txt` shows:

- **Over HTTP:** 405. The proxy carries HTTPS only.
- **Over HTTPS:** 403 Forbidden. The host is not on the allowed list.

Docker Hub separately rate-limited `pgvector/pgvector:pg15` with a 429.

This is the same class of egress refusal D7 already records for `www.fda.gov`
and `admin.ich.org`. It is not a defect in the image, and it was not worked
around.

## To unblock

Allow `deb.debian.org` in the cloud environment's network settings (Network
access → allowed domains, or a broader access level). Then re-run:

    docker build --network host -f Dockerfile.optimized --target production -t c2c-app:local .

The CI image build in `deploy-aws.yml` runs on GitHub's runners, which reach
Debian. That build, and the `check-pdfa-toolchain` step inside it, are
unaffected.

## Resumed, 2026-10-01: the image boots in CI instead

The environment still refuses `deb.debian.org`, and only the founder can change
that setting. GitHub's runners reach Debian, as `deploy-aws.yml`'s image build
does, so the proof now runs there. The new `ci.yml` job, `production-image-boot`:

1. builds both targets the deploy builds, `provision` and `production`, and
   checks that the production image runs as `appuser`;
2. starts an **empty** PostgreSQL 15 with pgvector over TLS;
3. provisions it with the **provision image's own** `npm run db:provision`,
   owner and `app_service` split;
4. starts the **production image** with `RLS_ENFORCE=on` as `app_service`, in
   the posture `production-boot-smoke` runs, and requires `/readyz` and
   `/healthz` to answer 200 (the container log is printed on failure);
5. signs a person in from inside the image (`scripts/ci/image-boot-signin.mjs`,
   which uses the image's own `pg` and `bcryptjs`). Production always asks for
   a second factor, so the script enrols an authenticator the way
   `mfaService` stores one and completes it. A wrong code must be refused.

The job is listed with the posture jobs in
`tests/ci/posture-jobs-run-after-lint-failure.contract.test.ts`, so a red lint
cannot skip it.

**Proven here, before CI:** the same provision path and sign-in, against the
production bundle booted from source in production mode on a freshly
provisioned database (`local/`). The sign-in script was made to fail twice: an
authenticator under a key the server does not hold, and an origin the
deployment does not allow. Both were refused.

**Noted, not changed:** an authenticator secret the server cannot decrypt
answers `500 AUTH_010` at `/api/auth/mfa/verify`, not a 401. It is reachable
only after a key rotation that missed a secret, so it is a key-management
defect, not a sign-in bypass.
