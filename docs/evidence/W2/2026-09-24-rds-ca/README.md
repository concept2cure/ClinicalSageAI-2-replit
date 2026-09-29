# D1: the image trusts the RDS certificate authority, 2026-09-24

**Launch row:** D1. Found while closing B1–B3 and B5
(`../2026-09-24-b1-b5/README.md`, "Not done, and why").

**Defect.** Production verifies the database server certificate
(`server/db/ssl.ts`, `rejectUnauthorized: true`, and `sslmode=verify-full` on
the Terraform-composed URLs). Node verifies against its built-in roots.
**Measured:** none of the 108 certificates in AWS's published RDS bundle is a
Node root, by SHA-256 fingerprint or by subject. The image set no
`NODE_EXTRA_CA_CERTS`. The first database connection from a deployed API task,
or from the migrate task that runs the same image, would have failed
verification.

**Fix.** AWS's global bundle is vendored at `assets/rds-ca/global-bundle.pem`,
verbatim, with its SHA-256 in `checksums.txt` and its provenance in
`README.md`, following the DTD vendoring policy. `Dockerfile.optimized` sets
`ENV NODE_EXTRA_CA_CERTS=/app/assets/rds-ca/global-bundle.pem`. `assets/` is
already copied into the image, and `.dockerignore` excludes only `*.md` there.
The variable adds to Node's roots and replaces none.

**Gate.** `tests/schema-contract/rds-ca-bundle.contract.test.ts` checks four
things:

- the `ENV` is set in the production stage, after `assets/` is copied;
- the path is committed and no `.dockerignore` rule reaches it;
- the bytes match `checksums.txt`;
- a fresh Node process started with that exact setting reports all 108
  certificates through `tls.getCACertificates('extra')`, including the
  us-east-1 roots, and those roots are absent from
  `tls.getCACertificates('bundled')`.

**Shown failing first.**

| Mutant | Result | File |
|---|---|---|
| `ENV` line removed | 4 of 4 fail | `mutant-A-env-removed.txt` |
| one byte appended to the bundle | the checksum case fails | `mutant-B-bundle-altered.txt` |
| `.dockerignore` gains `*.pem` | the dockerignore case fails | `mutant-C-dockerignore.txt` |

As committed: 4/4 pass (`green.txt`).

**Limits.** No image was built and no RDS instance was reached from here. That
proof is the first deploy's `/readyz` reporting `schema: ok`. AWS publishes no
checksum for the bundle, so the recorded hash pins what was fetched, not an AWS
attestation.
