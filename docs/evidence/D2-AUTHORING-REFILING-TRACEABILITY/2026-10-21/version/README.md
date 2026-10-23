# Complete the existing conflict-head hint

W1 / D2; canonical `concept2cure-v2`. Root owns Git and combined qualification.

## What already exists

`vault-version-checkin.ts` already owns numeric explicit-UUID check-in and the
`currentVersionOfCode` helper used by canonical ingest to offer a conflict
remedy. The helper filtered tenant/program/live successors but selected the
newest date when multiple roots or an old fork had multiple heads. The Data
Room's existing “add as version” action consumes that hinted UUID.

The existing PGlite helper fixture executes actual SQL without the program-hash
unique index or lineage trigger, permitting explicit legacy-fork seeds. The
existing race fixture is a declared query-timing seam; ingest-storage invokes
actual ingest with a transaction mock; the route conflict fixture extracts and
executes the shipped UPSERT SQL. These seams are distinct and do not qualify
native multi-connection concurrency or a full HTTP/provider journey.

## Change and checks

The existing helper reads at most two scoped live valid-chain heads and returns
a hint only for exactly one. It no longer selects by creation date. Explicit
UUID check-in, numbering, lineage writes, inherited filing, UI and legacy labels
are unchanged. The SQL-extract and ingest-storage fixtures were run unchanged.
Root owns the separate actual-PGlite-ingest conflict/no-hint integration proof.

| Receipt | Actual result |
| --- | --- |
| `red.json` | 3 failed, 10 passed; exit 1. Independent legacy/numeric roots and an old fork received an arbitrary hint. Production bytes were unchanged. |
| `green.json` | 55 passed across 4 suites; exit 0. Includes unique-head positives, tenant/program/deleted scope and unchanged explicit numeric UUID check-in. |
| `lint.json` | Both changed files, `--max-warnings 0`; exit 0. |

Each receipt retains actual argv, environment selection, UTC start, duration,
exit, before/after hashes of the two owned input files, and the gzip raw-output
SHA-256. Gzip timestamps are zero. `freeze.json` records final owned pins and
the separately observed current hashes of all executed regression test files.
No compiler, build, global scan, Git operation, provider or deployment was run
by this implementation worker.

This correction does not close automatic authoring re-filing or migrate old
hash-labelled versions. The wider constraints remain in `../version-audit.md`.
