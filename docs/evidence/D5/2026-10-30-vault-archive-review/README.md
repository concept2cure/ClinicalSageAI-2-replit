# D5: complete the Vault archive security review (2026-10-30)

## What already exists

Searches: `archive`, `sendStagedArchive`, `readArchiveAuditExtract`, `folder_id`, `placement_status`, `canReadAuditTrail`, `vault.document.exported`, and `actorRef` across the routes, Vault services and tests. Deleted-history search: `git log --all --diff-filter=D -- 'server/**/*archive*' 'server/**/*filing*' 'tests/db/vault*'`; no deleted implementation of these archive safeguards was found.

- `server/services/vault/vault-archive-builder.ts` stages verified bytes once and produces one checksummed archive. Both archive routes already use it.
- `server/services/vault/vault-seal-archive.ts:readArchiveAuditExtract` reads and projects the canonical chained history, but carries named actors and IP addresses to readers who cannot read Audit trail.
- `server/services/audit/audit-api-authority.ts:canReadAuditTrail` is the existing authority for names/IPs. `actorRef` is already emitted by both history sources.
- `server/routes/c2c/project-vault.ts` already records the archive hash atomically before streaming, but records no export event on each document; its local sender assumes the response stayed open, and both builds are unlimited per user.
- `server/services/vault/vault-folder-export.ts` reuses the tree rows, but filters only `folder_id` (unlike the tree's placement-status rule), and silently omits a planned row missing from the second query.
- `tests/db/vault-folder-export.dbtest.ts` and `tests/db/vault-data-room-seal.dbtest.ts` exercise actual routes, verified local storage and PostgreSQL under `app_service` and enforced RLS. They are extended rather than replaced.

## Design

Use the Audit trail authority once at each archive entry and pass explicit `namedActors` into the shared extract; default to references without IPs. Describe the projection in the manifest, index and audit extract. Keep signed seal content unchanged. Move the existing sender to `vault-archive-delivery.ts`, check closed responses before headers/streams, and clean up. The same module owns one simultaneous in-process build per organization/account across both routes, released in `finally` after the build (downloads are not serialized). Refuse unidentified actors. Record a `vault.document.exported` chained row per actual file, in the same transaction as the aggregate archive event, including the archive and file hashes. Withheld documents receive no exported row. Promote the tree's folder predicate to `cabinetFolderOf`; both the tree/Unfiled and the export use it. Refuse any planned row missing from the storage read, and label suggested filings explicitly in the index.

## Verification

- `01-red.txt` and compressed original logs: database 11 failed/17 passed, planner 3 failed, shared extract 4 failed/1 passed. The three extra existing seal cleanup failures are distinguished from new controls.
- `02-green.txt`: all 28 actual PostgreSQL tests and 45 focused unit tests pass; no added ESLint warnings or errors.
- `03-mutations.json` plus nine compressed logs: removing the closed-response branch, duplicate-build guard, safe release token, identity reduction, placement predicate, missing-row refusal, per-document audit loop, either route guard, or caller authority causes the corresponding assertions to fail. Mutations run through in-memory test transforms and do not alter live source.
- Root publication gates and release receipt follow separately. No production dependency, schema, signed seal content or permission expansion.

The build guard is process-local and serializes building only, across both archive endpoints for the same organization/account. It does not claim a cluster-wide quota. Privileged audit readers retain the original history; reduced copies identify their projection and preserve the canonical reader's chain verdict.
