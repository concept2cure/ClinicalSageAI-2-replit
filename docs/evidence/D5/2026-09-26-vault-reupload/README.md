# D5: a same-bytes re-upload rewrote a Vault record and recorded only the new values

**Row:** D5 (§11.10(e): a change must not obscure what was recorded).
**Workstream:** the AnA client-files lane (`…01DiJJAk`). **Date:** 2026-09-26.
**Source:** VR-05 in `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`, handed
to this lane in `49293661` (`docs/work-orders/README.md`, "→ `…01DiJJAk` …
from `…01KnUGoX`'s Vault-against-Veeva mapping").

## The defect

`ingestVaultDocument` writes a Vault version with `INSERT … ON CONFLICT
(program_id, document_code, version) DO UPDATE … WHERE the hash matches`.
Different bytes were already refused (409 `VERSION_CONTENT_CONFLICT`). For the
**same** bytes, the update rewrote the governed row:

| Column | What a retry did |
|---|---|
| `classification` | Omitted by the retry, it was reset to `INTERNAL`. The Vault client never sends one, so re-uploading a CONFIDENTIAL document declassified it. |
| `retention_policy`, `parent_document_id`, `supersedes_id` | Omitted, they were nulled. |
| `s3_key`, `storage_version_id`, `storage_provider`, `file_name` | They moved to the retry's fresh copy. The admitted copy stayed in storage, referenced by nothing. |
| audit | A second `vault.document.ingest` row carried the new values and never the old. |

Reproduced on PostgreSQL as the runtime role (`app_service`, RLS on), through the
real route and service. A CONFIDENTIAL document with a retention policy was
re-uploaded unchanged, and afterwards read `INTERNAL`, had no retention policy,
and pointed at a different stored copy (`red/db-vault-reupload.txt`).

## The fix

`server/services/vault/vault-reupload.ts` (new) and the ingest's upsert:

- **The recorded row is read first.** It is read `FOR UPDATE` at (program, code,
  version), in the admission's transaction.
- **An omitted field keeps its recorded value.** Classification falls back to
  the recorded one before `INTERNAL`.
- **Write-once fields stay put.** Retention policy, lineage and file name change
  only NULL → value (`COALESCE(recorded, retry)`).
- **The record keeps its stored copy.** Only a record with no
  `storage_version_id` (it predates the storage provider) takes the retry's
  pointer, as one unit. These are the transitions VR-06's planned trigger
  allows.
- **A retry that changes something is audited.** It writes one chained
  `vault.document.reupload` row whose `changes` list each field's `from` and
  `to`. The fields covered are title, type, classification, policy, lineage,
  storage handle and the proposed placement.
- **A retry that changes nothing records nothing.** It writes no audit row.
- **The duplicate copy is removed.** `stored.committed` now means "a committed
  record holds this copy", so a retry's fresh copy goes through the ingest's one
  discard path (`vault-ingest-discard.ts`). That path deletes only a copy no
  record references.
- **The response says what happened.** The route answers 200 rather than 201
  when the bytes were already recorded, since nothing was created, and returns
  `reupload: { unchanged, changes }`.

**Nothing a user could do is removed.** Changing a title or type by
re-uploading still works; it is now recorded with the old value. Replacing it
with a governed Edit details is VR-05's remaining half: its route
(`project-vault.ts`) and surface (`Vault.tsx`) belong to the Vault surface's
lane. The plan's working-agreement note applies to that change, not this one.

## Evidence

| File | Result |
|---|---|
| `red/pglite-vault-ingest-conflict.txt` | 1 failed, 9 passed. The shipped ON CONFLICT clause, extracted from the service and run on PGlite: a retry replaced `s3_key` (k1 → k2), `storage_version_id`, `file_name`, and nulled `retention_policy`, `parent_document_id` and `supersedes_id`. The legacy-adoption case passes before and after; it is the control. |
| `red/db-vault-reupload.txt` | 2 failed, 1 passed, on PostgreSQL as `app_service`, run against HEAD's service, discard helper and route. A plain retry turned CONFIDENTIAL into INTERNAL, nulled the retention policy and moved the storage handle. A retry with a new title wrote no record of the change. |
| `green/pglite-vault-ingest-conflict.txt` | 10 passed. |
| `green/db-vault-suites.txt` | 102 passed across 13 files: every `tests/db/vault-*`, `document-catalog*` and `chat-upload*` suite, including the refused-bytes discard, placement, program ownership, passage search and the new `vault-reupload.dbtest.ts`. |
| `green/unit-vault-ingest-paths.txt` | 193 passed across 17 files that drive the ingest (route, service, AnA filing, authoring file-to-vault, eSTAR retention). |

Gates: ESLint is unchanged against HEAD on every changed file.
`vault-ingest.service.ts` keeps its 2 warnings, and the new files have 0.
`ci:tenant-isolation`, `ci:discarded-audit-write` and `ci:unkeyed-request-tables`
pass.

## Also in this change: the catalog recall suite had gone stale

`tests/db/document-catalog-recall.dbtest.ts` failed at HEAD with or without this
change. `69f93d988` (P0-12) made `file_chat_upload_to_vault` wait for a person:
without `ToolContext.humanConfirmed`, which only `POST /governed-action` sets,
the tool returns a `HUMAN_CONFIRMATION_REQUIRED` proposal. The suite still
called it as AnA alone and expected a filing. CI's database job is skipped
while the Test job is red, so this went unseen. The case now asserts both
halves: on AnA's word alone the call is a proposal and nothing is filed; with
the person's confirmation the document is filed and becomes catalogable.

## Not done here

- **Edit details.** The governed writer for title, type and classification,
  with a reason, and the Vault surface control for it. It is VR-05's other half
  (`editVaultDocumentMetadata`, `POST …/documents/:documentId/details`).
  Once it lands, a re-upload can stop changing descriptive fields at all.
- **`supersedesId` / `parentDocumentId` on the ingest body.** These are still
  accepted as bare UUIDs (`server/routes/vault-ingest.ts:122-123`); no client
  sends them. Refusing them is in VR-05's list. It is left for the Edit details
  change, which defines how lineage is set.
- **VR-06's trigger.** This change makes the ingest compatible with it; the
  trigger itself is unclaimed.
