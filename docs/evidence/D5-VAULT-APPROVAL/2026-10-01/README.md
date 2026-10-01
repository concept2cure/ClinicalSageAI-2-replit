# VR-13: review and approve a Vault version with an e-signature, superseding the version before it (row D5)

**Plan item:** VR-13, `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`. **Date:** 2026-10-01.
**Depends on:** VR-06, VR-08, VR-09 and VR-12 (all done). **Founder decisions:** FD4 ships its strict
default: a Vault document must be approved to count as settled, a review sign-off is required, and the
uploader may neither review nor approve. FD6 ships as a refusal: an approved version's details are not
corrected in place.

**State of this record:** the server half is done and verified here. The Vault surface (status chips,
Send for review, Sign as reviewed, Approve with EsignModal) follows in the next commit, which completes
this README.

## The finding

A Vault version had only a filing status, and the Vault counted a confirmed filing as settled, the same as
an approval. The governed lifecycle route had no client caller. It required the caller to supply the
title and type. Nothing superseded an earlier approved version, and nothing stopped the person who
reviewed a version from also approving it.

## The server change

| Piece | File |
|---|---|
| One lifecycle record per Vault version. A unique index on the version the record names. It is created only when no version already has two records; otherwise the migration raises a NOTICE. Replayable, with no DROP. | `migrations/20261001_canonical_documents_vault_version.sql`, `scripts/db/migration-set.mjs` (after VR-03's file) |
| Starting a version's lifecycle (`POST /api/regulatory/documents` naming `sources.vault_documents`): starts are serialized on the version under an advisory lock. A second start returns the first record (200, `created: false`). The record takes its title, type, content hash and program from this organization's row. The body's title, type, `contentHash` and `hasContent` are not read. Another organization's version gets 422 `VAULT_SOURCE_NOT_FOUND`. A version with a later version gets 409 `VERSION_NOT_CURRENT`. | `server/services/regulatory/vault-lifecycle-record.ts`, `server/services/vault/vault-lifecycle.ts`, `server/routes/document-lifecycle.ts` |
| Approval policy (FD4), checked before any credential is asked for. The person who signed the round's review gets 403 `SELF_APPROVAL`. The uploader and the record's creator were already refused (VR-12). A version that is no longer current gets 409 `VERSION_NOT_CURRENT`. | `vault-lifecycle-record.ts` (`vaultApprovalRefusal`) |
| Approving v2 supersedes the earlier steady-state versions (approved, placed, packaged or submitted) in the same transaction. Each move is an ordinary transition: the same gate, the bound chained `audit_logs` row, and a sealed event on that record's own trail. A failure rolls the approval back, including its signature row. | `vault-lifecycle-record.ts` (`supersedePriorVaultVersions`), `vault-version-family.ts` (`readPredecessorIds`, the same link rule) |
| The Vault reads each version's stage and sign-offs. In the version list, each version carries `lifecycle: { canonicalId, stage, review, approval }`. Each sign-off has the printed name and meaning from its `electronic_signatures` row, and the time from the record (UTC). The tree leaf carries `lifecycleStage`. A document's history includes its lifecycle records' audit rows, each naming its version. | `server/routes/c2c/project-vault.ts` |
| Editing the details of a version that is approved or later (placed, packaged, submitted or superseded) gets 409 `APPROVED_VERSION_IMMUTABLE`. | `server/services/vault/vault-metadata-edit.service.ts` |

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| `tests/db/vault-lifecycle.dbtest.ts`, run on PostgreSQL as `app_service` with RLS on, through the real ingest, Vault and lifecycle routes. The signing ceremony is the only stand-in; its own suites pin it. | `red/db-vault-lifecycle.txt`: 6 of 6 fail with trunk's three server files. The start needs a client-supplied title (400), a second start makes a second record, and so on. `red/db-supersession-removed.txt`: with only the supersession call removed, approving v2 leaves v1 approved, and the injected failure no longer rolls anything back (2 of 6). | `green/db-vault-lifecycle.txt`: 6/6, alongside the version, check-in, lifecycle-binding, append-only and immutability DB suites (44 tests) |
| Lifecycle and Part 11 suites | — | 256 unit files, 3295 tests |

Two existing tests changed with the policy:
- `tests/regulatory/document-lifecycle-pipeline.pglite.test.ts` approves through a third person, because
  the reviewer no longer approves.
- `server/routes/__tests__/document-lifecycle-part11-record.test.ts` gives its Vault fixture the columns
  the start reads, and makes a fresh version for each document, because a version has one record.
