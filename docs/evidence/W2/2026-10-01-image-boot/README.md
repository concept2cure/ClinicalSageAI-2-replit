# D1 — the production image boots in a container: blocked by this environment

**Row:** D1. **Date:** 2026-10-01. **Status: blocked**, not done.

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
