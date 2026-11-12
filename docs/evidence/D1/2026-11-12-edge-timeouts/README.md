# D1 — MR-03 Stage 6 step 2, the edge timings: blocked in this environment, harness prepared (2026-11-12)

Stage 6 step 2 (OPS-17) asks for p50 and p95 of compile, package assemble, sequence assemble and export. It wants them
for an FDA IND sequence of 50 and of 200 leaves, on the production image with Ghostscript and veraPDF. The result
decides whether steps 4–6 are built: 202-and-poll for compile and assemble, and the three screens polling. If every
p95 is under 45 s, those steps are skipped.

**Not measured. No timing exists yet, and none is implied.** `measure-edge-timings.mjs` here has never been run
against a server.

## What was tried, and where it stopped

Session `…01QoxbLbx`, at trunk `547dd420e`, followed `ci.yml`'s `production-image-boot` job: the provision and production
images from `Dockerfile.optimized`, an empty TLS `pgvector/pgvector:pg15`, and the pinned clamd from
`terraform/stack/variables.tf`.

1. Docker ran, and Docker Hub served both `node:22-slim` (by its pinned digest) and the clamav image.
2. Inside the build, `npm ci` failed until the build trusted this session's egress proxy. The documented route
   (`/root/.ccr/README.md`) is `--network host`, the proxy as build arguments, and the proxy's CA in an early layer.
   That was done in a scratch copy of the Dockerfile; the repository's is unchanged.
3. `apt-get` then failed. The environment's network policy refuses `deb.debian.org` (HTTP 403 from the proxy), and the
   image is Debian bookworm: Ghostscript, Java for veraPDF, LibreOffice and `postgresql-client` all come from there.
   No Debian mirror was reachable. `archive.ubuntu.com`, Maven Central (veraPDF) and the npm registry were.
4. Moving this session to the repository's saved environment was declined. This environment was not changed.

## To run it

On a host that reaches `deb.debian.org` (a GitHub runner, or staging's network):

1. Build both images and start Postgres and clamd as `ci.yml`'s `production-image-boot` job does, then boot
   `c2c-app` with that job's `app.env`.
2. Run the script inside the image, as the job runs `scripts/ci/image-boot-signin.mjs`:

   ```
   docker run --rm --network host -w /app \
     -v "$PWD/docs/evidence/D1/2026-11-12-edge-timeouts/measure-edge-timings.mjs:/app/measure.mjs:ro" \
     -e DATABASE_URL=postgresql://postgres@localhost:5432/c2c_image \
     -e BASE_URL=http://127.0.0.1:5199 -e SIGNIN_ORIGIN=https://image-boot.invalid \
     -e MFA_ENCRYPTION_KEY=<the server's> -e SIZES=50,200 -e RUNS=5 \
     c2c-app:ci node measure.mjs
   ```

3. File its output, with the image digest, under `docs/evidence/D1/<date>-edge-timeouts/`.

## What the script does

- Enrols and signs in as `image-boot-signin.mjs` does (its helpers are copied verbatim): a member with an
  authenticator, and the second factor included.
- For each size: a project, an IND submission and its sequence 0000. Then N PDFs of 8 pages uploaded through the
  Vault (and so through clamd), and N leaves placed across Modules 1–5 with a reason.
- Each endpoint is called RUNS times, timed from request to last byte. A 429 is waited out and not timed.
- It prints one JSON line per call, then p50, p95 and max per size and endpoint.

**Not covered:** package assemble (`POST /api/submission-ops/packages/:packageId/assemble`). A package is a separate
model with its own sections; seeding one is a later addition. The PDFs are synthetic text pages, smaller than real
study reports, so the timings are a lower bound for the same leaf count.
