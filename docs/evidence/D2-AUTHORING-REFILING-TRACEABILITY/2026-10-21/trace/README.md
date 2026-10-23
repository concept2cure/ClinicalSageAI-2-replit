# Complete retained authoring filing derivation

## What already exists

The authoring filing service already writes a chained
`authoring.document.file_to_vault` receipt after admission; the canonical audit
writer and `audit/chain-row.ts` already own payload/link/seal recipes. The
submission materializer already stages verified Vault bytes, alias identity
and independent approval/current-version facts. The governance manifest is
already outside the agency backbone. This increment joins these existing paths
with a read-only receipt projection, without another identity or content store.

## Historical implementation proof, 2026-10-21

`composed-red.json` retains two meaningful failures (12 passes, one TODO) where
the actual filing/materializer path did not carry retained derivation.
`governance-red.json` retains an initial harness setup failure; it is not the
feature RED. After the fixture used the existing audit DDL/migration,
`governance-clean-red.json` failed on the missing actual governance projection
(one failed, four passed). `initial-green.json` then passed 42 tests across
three suites, with one retained historical version-supersession TODO.

These receipts retain original source pins and raw gzip hashes. They precede
the later canonical catch-up and contract clarifications, so final integrated
qualification is in the parent packet, not inferred from these historical runs.

## Contract and limits

The projected facts require exactly one tenant-scoped filing candidate for the
native Vault UUID, exact captured program and staged SHA-256, valid source
resource/target identity, canonical payload hash and canonical link verification.
A configured HMAC key requires a valid seal. `no-key` explicitly states that
HMAC authenticity is not proved. This is one-link verification, not a claim
that the entire tenant audit chain was walked.

Future receipts retain captured source version and sections digest. Old missing
values remain null. The sections digest does not cover the full document
header; `exportCorrelationId` is not an export-history row ID. Today's editable
body is never consulted. Absent, unverified and unavailable results remain
separate, without positive source facts. The artifact hash describes the
retained input before packaging normalization, not shipped PDF/A leaf bytes.

The real writer and PGlite SQL/chain verification are exercised. Owner-level
corruption, in-memory object storage and the composed HTML-to-PDF stand-in are
declared fixture seams. No native locking, faithful Chromium rendering,
provider transport, human acceptance or agency delivery is qualified here.
