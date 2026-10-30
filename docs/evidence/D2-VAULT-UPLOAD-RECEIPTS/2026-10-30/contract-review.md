# Independent contract review: confirm existing Vault upload receipts

Reviewer: `action_order_contract`. Date: 2026-10-30. D2 / W2. **APPROVED with the settled requirements below; no remaining contract blocker.** The bounded production owners are exactly `client/src/concept2cure/v2/useVaultUpload.ts` and `client/src/concept2cure/v2/surfaces/VaultUploadStaging.tsx`. This is contract approval before root's fail-first tests and implementation, not a claim of executed qualification. The reviewer read production/tests and wrote only this document; no runner, compiler, browser or Git command was executed.

## What already exists

The canonical hook constructs the authenticated multipart request, runs one sequential upload at a time and returns per-file outcomes. Its transport distinguishes incomplete send from complete-send/no-reply; the hook already exposes `unknown`, row/live/batch recovery wording and deliberate retry controls. It currently trusts any HTTP 2xx body, including null/undecodable bodies and absent document identity, and malformed reupload arrays can throw after transport returns. Its callers then open/refresh returned documents, dismiss check-in offers or add a device dossier attachment from `succeeded` filenames.

`server/routes/vault-ingest.ts` returns the existing service record: `201 { success:true, document, filing }` without reupload, or `200` with the same fields and `reupload`. The producer's service/types/reupload helpers own storage, exact requested program, assigned version, stored document title, placement, idempotency, write-once repairs and chained audit. Project folders are taxonomy codes, not UUIDs. `folderLabel()` legitimately returns an empty string for no/unknown label. The direct Etmf ingest caller has separate behavior and is outside this fix.

No retained receipt validator exists for this contract. Extend the successful-response branch and the two existing already-recorded copy sites; do not add another upload/receipt engine, recovery ledger, transport, auth subscription, endpoint, dependency or server write.

## Settled minimum receipt contract

Validate before returning `ok:true`, with no coercion, guessed identity, fallback success or mutation of the requested program. A small private local validator or the already installed Zod dependency is sufficient. Do not import server-only modules into the browser. Ignore unrelated extra object keys rather than requiring the full internal server document/audit record.

| Element | Requirement |
|---|---|
| HTTP status | Only **200 or 201** are confirmed producer successes. Another 2xx, even with a plausible body, is unconfirmed. |
| Envelope | A non-null, non-array JSON object with literal `success:true`, plus non-null object `document` and `filing`. |
| Document identity | `document.id` is a UUID string. `document.programId` is a UUID string and **exactly equals the original requested programId**. No coercion, case normalization or fallback to request data establishes the returned identity. |
| Assigned metadata | `document.version` and `document.documentTitle` are nonblank strings. Preserve the reported assigned version and stored title; do not demand numeric versions or equality to a user/file-derived title. No client arithmetic or lineage inference is authorized. |
| Filing fields | Required `folderId` is null or a nonblank string; required `folderLabel` is a string or null, including the legitimate empty string; `placementStatus` is `confirmed`, `suggested` or `unfiled`; `needsReview` is a boolean. Do not demand UUID folders, a nonempty label or a client copy of the taxonomy. The existing label fallback to a nonblank folder code is allowed. |
| Filing consistency | `unfiled` has null folderId and needsReview=true. `suggested`/`confirmed` have a nonblank folderId and needsReview=false, matching the current route producer's stored-status projection. Accept the actual label without attempting to verify it against a local taxonomy. Do not infer a placement from an absent/unknown status. |
| Optional extraction | If supplied, `document.extraction` is exactly `extracted`, `pending` or `failed`; null/unknown/nonstring is malformed. Absence remains compatible: Stored does not claim text extraction. Only an explicit pending state enables reading-text wording. No extra relationships with unused processing/word-count/text flags are required. |
| Reupload/status coherence | **200 requires a valid non-null reupload object; 201 has no reupload marker.** A null or malformed marker is not absence. Keep unknown extra keys, but do not accept a marker that contradicts the status. The service's pre-read admission race can validly return201 without reupload even when the candidate did not create the retained UUID; do not infer or require `admission.created`, compare candidate IDs, or reject that valid receipt. |
| Reupload shape | Required boolean `unchanged`, array `changes` and array `differs`. Each change is an object with a nonblank string field name and `from`/`to` each string or null. Each difference has one of the actual used fields `document_title`, `document_type`, `classification`, `folder_id`, `evidence_kind`, `ctd_section`, plus `recorded` string/null and `requested` string. Null/nonobject entries and malformed arrays are unconfirmed, never allowed to throw out of the batch. `unchanged` agrees with whether changes is empty. Do **not** require unchanged=true. |

Unused service fields such as document code/type, file size/hash, catalog word counts, timestamps, filing view/confidence/rationale and reupload audit internals beyond the minimal shape above need not become required browser receipt fields. This remains acknowledgement validation, not a second audit or policy verifier. Additional fields on otherwise valid objects remain compatible.

## Valid changed reuploads and honest copy

The producer can legitimately return `reupload.unchanged=false` with nonempty audited changes when it fills write-once retention/lineage/storage fields. Treat that as a valid already-recorded receipt. Rejecting it as malformed would break the current producer. Both existing hook batch copy and staging row copy currently say that nothing changed for every reupload; that blanket statement is not supported by this producer.

Root selected the smallest neutral correction: say **already in the Vault with these bytes**, without the blanket nothing-changed claim, at those two existing copy sites. Keep the current metadata/filing difference guidance; these user-requested title/type/classification/folder differences were not applied. No new public outcome flag or parallel result schema is needed. Do not silently count a changed reupload as a fresh upload/new version to obtain different copy.

## Approved stored-title mapping clarification

Before production edits, root identified that the existing new-version result copies the selected row's `opts.newVersionOf.title`. **Approved:** return the validated `document.documentTitle` on private `uploadOne` success and populate the existing public `newVersions.title` from that receipt. This changes no public result shape and remains within the same two production owners. Do not reject a valid check-in because its stored title differs from a stale selected-row title; a positive control should prove that the confirmed stored title is reported.

## Unconfirmed 2xx behavior

A missing, undecodable, malformed or contradictory receipt returns the existing per-file failure with `unknown:true` and `code:null`. Use a short neutral reason explaining that the reply did not confirm a verifiable Vault record; do not reuse a literal no-reply or nothing-saved claim when a malformed reply arrived. Preserve the existing reload-and-check instruction and selected file.

That file publishes no stored status and contributes nothing to succeeded, recorded, filing, alreadyRecorded, newVersions or conflict offers. The next file in a batch still runs, and uploading always settles false. Validation and reupload interpretation must not throw outside this per-file handling. No automatic retry, recovery POST, cancellation/reclassification of a dispatched server mutation or assertion that nothing was saved is permitted. Actual non-2xx refusal/conflict behavior, auth headers, multipart fields, upload progress, assigned version policy and all server/access/audit semantics remain unchanged.

## Smallest implementation and qualification boundary

Keep the private validation and result mapping in the existing hook, currently **426 lines**. Finish at **500 lines or fewer** without a new module, duplicated engine or lint suppression; use a compact local schema and remove the old loose success-body cast/fallbacks it replaces. The only other production change is the existing staging already-recorded sentence. Update stale hook comments that describe bare 2xx as observed success.

Root must demonstrate the real unchanged hook fails first for undecodable/empty/array bodies, false/missing success, invalid/missing UUID/program/version/title, wrong program, unknown/missing/contradictory filing, unexpected2xx, status/marker contradiction and malformed reupload/extraction. Positive controls must include201 fresh upload,200 unchanged and changed reuploads, real assigned new version, empty/null labels, all extraction states/absence, tolerated extra keys and a mixed batch continuing after unconfirmed responses.

Retain actual Vault staging/live unknown output, check-in file/offer retention, no document navigation/refresh on unconfirmed success and the device dossier's no-attachment behavior. Positive fixtures should be completed to the producer-compatible receipt rather than loosening assertions to recover green. Retain actual refusal/conflict/progress/auth/manifest controls. Root owns runners, final source review, source/test hashes, zero-warning-growth lint, build/whole-project TypeScript, normal direct canonical push and remote acceptance evidence. These checks make no claim of deployed acceptance or government filing readiness.

## Reviewed input pins

```json
{
  "AGENTS.md": {
    "sha256": "670a2822ac15ff418c45406ea834c441f7cab8833d348f3fa1d655da89f5ae5a",
    "lines": 114
  },
  "CLAUDE.md": {
    "sha256": "d88a0f27b7d1b89acdb924984e1dae200ec4e36cd1de8ce8127fa27c1bdf5c37",
    "lines": 229
  },
  "docs/design/VAULT_UPLOAD_RECEIPTS_2026-10-30.md": {
    "sha256": "687ffeed69d5bfdfbe7c5972474a76dbca02be119fd880f9486167abce525b96",
    "lines": 29
  },
  "client/src/concept2cure/v2/useVaultUpload.ts": {
    "sha256": "b4938a58852be61cffb9e9582ec8ac41504ec99377d0fcfa82c99e5b77ec2bf5",
    "lines": 426
  },
  "client/src/concept2cure/v2/vaultIngestTransport.ts": {
    "sha256": "420be6b1ca6c22ff5367a70aa484356ee62b1733b21de0675cebeaaaec030e8f",
    "lines": 67
  },
  "client/src/concept2cure/v2/surfaces/VaultUploadStaging.tsx": {
    "sha256": "44c175d1edd6781f515d16d2149fe1f0fac8f8e1168defb8f8e568e09c0fb5c7",
    "lines": 344
  },
  "client/src/concept2cure/v2/surfaces/Vault.tsx": {
    "sha256": "b0cfd0a045b9cc644910d7477e190fed00932e5c147e06520daea24090825d89",
    "lines": 3018
  },
  "client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes.tsx": {
    "sha256": "7aaa36a2843af27ccedd317b1aca3eae12f32718b9ff1ff4c9514f1c8f964a87",
    "lines": 1232
  },
  "server/routes/vault-ingest.ts": {
    "sha256": "9f8e4cf8e31582692c980b3b4a7e30f12a2a60e2bbb65a25bddbebaa63d4eae3",
    "lines": 290
  },
  "server/services/vault/vault-ingest-types.ts": {
    "sha256": "0c0e1ebfe157378d59e199c476875cca216643cd287a01080d2958c368db2434",
    "lines": 114
  },
  "server/services/vault/vault-ingest.service.ts": {
    "sha256": "1929d3425df21becf45023427f9063fefa5518ecec5b2db4352448ab966dd3fe",
    "lines": 798
  },
  "server/services/vault/vault-reupload.ts": {
    "sha256": "e366f3ab5ee389a1dd19281306f9cebeb0b226a6759d55610a5dc96381a14489",
    "lines": 135
  },
  "server/services/vault/vault-version-checkin.ts": {
    "sha256": "65f18d028c655fe847ce9b6550bc3fd7dc048392a51470ffa4bcb8674b3ce2c3",
    "lines": 358
  },
  "server/services/vault/vault-filing.service.ts": {
    "sha256": "5ce519ff22474ed2f43ece518c871133f78a2278121ea8d5c7a9423a0de1f30f",
    "lines": 552
  },
  "client/src/concept2cure/v2/__tests__/useVaultUpload.test.tsx": {
    "sha256": "10a65b88aa3d3bb95ecf329f60184f4d419715dc3c57ce02dee7a035186bd80f",
    "lines": 325
  },
  "client/src/concept2cure/v2/__tests__/vaultUploadReview.test.tsx": {
    "sha256": "a26a1354055e8aaf4277496486f5214217be56b300a331d47cf39e1088467710",
    "lines": 128
  }
}
```
