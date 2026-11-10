# Retention: the code that may delete stored bytes is named (P-107 item 3, FD3 (c))

2026-11-10. Session `…01KnUGoX3g`. Plan package F1. Completes `scripts/ci/check-vault-document-writers.mjs`.

## The decision this pins

P-107 item 3 (`docs/LAUNCH_DEFINITION_OF_DONE.md`): "Retention is FD3 (c). No version is destroyed during a tenant's
life; retention may only tombstone."

## What already exists

| Piece | Path | What it does today | What it does not do |
|---|---|---|---|
| Record guard | `migrations/20260926_vault_documents_record_immutability.sql` | Refuses a delete of a Vault version and a change to its identity, bytes pointer, hash or lineage | Nothing outside the database |
| Retention sweep | `server/jobs/retentionCron.ts` | Archives, then tombstones (`deleted_at`), with a chained audit row; refuses destruction | It never touches the bytes |
| Writers gate | `scripts/ci/check-vault-document-writers.mjs` (`ci:vault-document-writers`, CI) | Names every file that issues `UPDATE vault.documents`; an unnamed writer or a stale entry fails | It said nothing about the bytes |
| Byte store | `server/services/storage/storage-provider.ts` (`delete(vaultVersionId, orgId)`), `s3-provider.ts`, `local-provider.ts` | Deletes one version's object for its own organization, and refuses another organization's | It cannot know whether a record still points at the version |

The assessment recorded in the plan (§3a, 2026-11-10): retention holds today, and "nothing names who may delete
stored bytes". The bytes sit outside the database. A new caller of the store's `delete` would pass the record guard,
the retention sweep and every database test, and leave a governed record pointing at nothing.

Searches run: `\.delete\(` with two or more arguments across `server/` and `scripts/`; `DeleteObjectCommand`,
`DeleteObjectsCommand`, `deleteObject(`; `getStorageProvider`, `getStorageProviderFor`, `byteStore(`.

## What changed

The existing gate gains a second list, `ALLOWED_BYTE_DELETERS`, and a second scan. No new gate, script or CI step.

A file is a deleter of stored bytes when it calls a `delete` with two or more arguments whose first is not a string
literal (the store's signature: a version and an organization), or names an S3 delete command. Ten files do today,
and each is named with which bytes it deletes:

| File | Which bytes |
|---|---|
| `server/services/vault/vault-ingest-discard.ts` | An upload the Vault refused or failed to record. Deleted only after the database says no record points at the version; kept when that cannot be answered |
| `server/services/tenant/tenant-offboarding.ts` | A tenant's bytes at offboarding, after the purge has committed. The one ceremony that ends a tenant's records |
| `server/routes/moduleIntegrationRoutes.ts` | Compensation: an attachment whose record was not written |
| `server/services/ectd/rendered-leaf-files.ts` | Compensation: a rendered leaf whose row was not inserted |
| `server/services/ai-gateway/providers/org-placement-writer.ts` | Compensation: an encrypted derivative whose custody change rolled back |
| `server/services/ana/upload-object-store.ts` | Compensation: an AnA upload whose rows were never committed |
| `server/services/storage/s3-provider.ts` | The S3 store's own `delete`, reached only through the callers above |
| `server/services/submission-bundle-storage.ts` | A bundle zip never stored on its package. A stored bundle is never deleted |
| `server/services/s3-storage.ts` | `deleteDocument` of the earlier evidence-store helper. It has no caller |
| `server/services/anthropic-files.ts` | Not the byte store: the copy of an upload held at the model provider's Files API |

None deletes the bytes of a recorded Vault version during a tenant's life. A new one fails the gate until a person
adds it with its reason. A named file that stops deleting fails too, so the list cannot keep an entry nobody reviews.

## What this does not cover

- A file removed from the local store's directory with `fs` directly. The local provider's own `delete` is reached
  only through the callers named above.
- S3 Object Lock and noncurrent-version retention. P-107 gives those to the D1 lane with the AWS account.
- `server/services/s3-storage.ts` `deleteDocument` is left as it is. It has no caller; removing it is a separate
  change.

## Evidence

- `01-red.txt`: the gate as it stood, run on a tree where an unnamed job deletes a version's bytes, exits 0. The
  changed gate on the same tree exits 1 and names the file.
- `02-green.txt`: the selftest (14 cases: 7 that stood, 7 new) and the gate on this repository.

The selftest's new cases: an unnamed store delete; one written over several lines with a call as its organization;
an unnamed S3 delete; a named deleter that sends an S3 delete; a stale entry; a route registration, a Map delete, a
one-table delete and an HTTP delete of a templated address, none of which is a store delete; a test file.
