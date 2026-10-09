# Amazon RDS certificate bundle

`global-bundle.pem` is AWS's published RDS certificate bundle, committed
verbatim. The production image points `NODE_EXTRA_CA_CERTS` at it
(`Dockerfile.optimized`).

## Why it is here

In production the app verifies the database server's certificate
(`server/db/ssl.ts`: `rejectUnauthorized: true`; the owner and app_service URLs
carry `sslmode=verify-full`, `terraform/environments/production/main.tf`).
Node verifies against its built-in root store, and **no RDS certificate is in
it**. On 2026-09-24, none of this bundle's 108 certificates matched a Node root
by SHA-256 fingerprint or by subject. The image installed only Debian's
`ca-certificates`, which are not what Node uses, and nothing set
`NODE_EXTRA_CA_CERTS`. So the first database connection a deployed task made
would have failed verification. Turning verification off is not the fix:
connections from this image carry the application's credentials, and the
migrate task carries the owner's. `scripts/db/connection.mjs` has always said to
supply the RDS CA through `NODE_EXTRA_CA_CERTS`, and nothing did.

## Provenance

| | |
|---|---|
| Source | `https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem`, the URL AWS documents in "Using SSL/TLS to encrypt a connection to a DB instance" |
| Fetched | 2026-09-24, over HTTPS, by the document-fidelity/D1 Claude session |
| SHA-256 | recorded in `checksums.txt` (`sha256sum` format) |
| Contents | 108 certificates, every subject "Amazon RDS …", including the us-east-1 RSA2048, RSA4096 and ECC384 G1 roots; all unexpired on the fetch date, earliest expiry 2061-05-18 |

AWS publishes no separate checksum for this file, so the recorded SHA-256
pins what was fetched, not what AWS attests. Verify the bytes against the
source URL before relying on them in a new environment.

## Updating

AWS adds regional roots and rotates CAs. An update is a normal reviewed change:
new file, new checksum in `checksums.txt`, this table updated, and
`tests/schema-contract/rds-ca-bundle.contract.test.ts` green.
