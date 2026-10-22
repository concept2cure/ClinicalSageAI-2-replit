# Backend integration with canonical accf8c6ba

The assembly increment was initially qualified on `4b0e3ff1e`. Canonical
`concept2cure-v2` advanced to `accf8c6ba` before publication. This evidence covers
the merged authoring writer and adjacent import/governance services. The root
workstream owns rebase continuation, final compiler/build and publication.

## Merge review

The auto-merged canonical document creator retains its new structural
`AuthoringPool`, `AuthoringCreateTransactionState`, truthful uncertain/committed
creation recovery, connection disposal, and optional `afterInsert` ownership /
binding callback. Its seeding loop still calls the single transaction-owned
`insertSectionSeedTx`, which retains verified import genesis provenance and
CREATE metadata. Single-section creation keeps the same shared writer and
transactional placement/evidence rollback.

Incoming protocol/IVD materialization and retained workflow governance remain
intact. Assembly preserves parent provenance and existing sections; it does not
reclassify imported machine prose, transfer adoption/approval, change source
scope or reuse the separate legacy section-generation store. The optional
`programInOrganization` locking arguments preserve previous defaults. Assembly
still checks fresh actor/project/document access, reserves the writable parent
and recomputes the exact template/target plan before append.

Two related canonical outcome requirements needed a bounded assembly fix:

- A transport error before or after COMMIT was followed by ROLLBACK and clean
  connection release. Three actual HTTP RED cases retain both failures plus
  the privacy failure below. Assembly now discards a client with an uncertain
  COMMIT result, sends no rollback/retry and returns no success or section data.
- If project access was revoked immediately after a confirmed COMMIT, the
  precomputed private plan/sections still returned 200. Fresh project/document
  admission now runs after COMMIT before content returns. A failed handoff
  returns the existing generic 503 with no private data; the saved sections
  remain and the known parent must be inspected.

The post-COMMIT checks use the checked-out client in fresh autocommit reads.
Holding that client while asking the shared pool for another connection would
wait for itself in a one-slot pool. The final HTTP fixture rejects any such
reentrant pool query. Ordinary success cases still pass under that constraint.

## Actual results and final delta

The combined canonical run passed **127 cases in ten files**: the six assembly
and related files, incoming authoring creation-outcome tests, workflow source
materialization, workflow release/adoption governance, and the actual
production-built cold import of the release graph. This run used the initial
post-COMMIT shared-pool read variant and is explicitly pre-final.

The only later production delta switches those two post-COMMIT reads to the
existing checked-out client. The corresponding test delta enforces one-slot
pool behavior. The complete affected **33 HTTP cases passed again** on those
final bytes. These are repeated affected cases, not 33 additional unique cases.
Scoped lint passed four changed/integrated files with **zero errors/warnings**.

`verification.json` records process exits, counts and qualifications;
`source-pins.json` records final source SHA-256 values. Raw logs are JSON encoded
without text normalization and carry their original byte counts and SHA-256
identities. Final production/test freeze: **2026-10-17 23:18:26 UTC**. The earlier
freeze and initial compiler/build belong to the pre-final state, as tracked by
the root release evidence.

PGlite executes actual authorization, lineage, revision, audit and transaction
SQL on one connection. The failure injection models transport uncertainty and
pool resource availability; it does not establish native socket-loss behavior,
concurrent PostgreSQL scheduling, deployed RLS, provider responses or human
review. No new dependency/schema/store/editor was introduced.
