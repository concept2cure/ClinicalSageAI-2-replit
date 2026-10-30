# Vault upload receipts: producer and consumer audit

2026-10-30 · D2 / W2 · canonical baseline `be078603b00397bb86c8244b634aeff3338c5ae0`.

AGENTS.md, CLAUDE.md and `docs/design/VAULT_UPLOAD_RECEIPTS_2026-10-30.md` were read. This audit changes only this evidence file. It executes no test, compiler, browser, database or production request and makes no Git mutation. Findings below are source-traced; test files were inspected, not executed. Root owns contract approval, fail-first proof, implementation and publication.

## What already exists

| Owner | Current responsibility and relevant limit |
| --- | --- |
| `client/src/concept2cure/v2/useVaultUpload.ts` | Single shared upload/check-in hook, multipart fields, per-file progress/status, batch outcome and existing unknown-result wording. Its current 2xx branch does not confirm a receipt before returning success. |
| `v2/vaultIngestTransport.ts:43` | Authenticated XHR, upload progress and complete-send/no-reply distinction. It returns response status and a JSON decoder; it does not interpret a saved-document receipt. |
| `v2/surfaces/Vault.tsx:1215–1279` | Actual staged upload and check-in callers. Opens returned document IDs, refreshes after succeeded files and removes check-in offers after a succeeded filename. |
| `v2/surfaces/VaultUploadStaging.tsx:139–169` | Actual stored/refused/unknown row text and live announcement. Unknown state already asks for reload/check without asserting failure to save. |
| `mdx/surfaces/pathway/PathwayPanes.tsx:794–852` | Actual DossierDrawer attachment caller. Uses the shared hook and adds local attachment metadata only for filenames in `outcome.succeeded`. |
| `mdx/store/dossierStore.ts:157` | Existing local attachment list, without a client-fabricated governed audit event. An attachment-list entry is not an independent server receipt. |
| `server/routes/vault-ingest.ts:274–285` | Returns producer outcome as `success: true, document, filing`, with optional reupload; 201 for a newly recorded version, 200 for a recorded same-bytes row. |
| `server/services/vault/vault-ingest-types.ts` | Actual producer types, including full document record, filing and optional reupload change/difference records. |
| `vault-ingest.service.ts:460–764` | Current target/source authorization, locked version planning, exact-byte idempotency, atomic document/audit writes and actual recorded receipt. |
| `vault-reupload.ts`, `vault-version-checkin.ts`, `vault-filing.service.ts` | Existing allowed reupload repairs/differences, assigned check-in version, inherited filing and taxonomy label lookup. These remain server-owned. |

Client paths in abbreviated rows are under `client/src/concept2cure/`; server service paths are under `server/services/vault/`. Production search finds two current hook consumers: Vault and DossierDrawer. Comments referring to a former third MDX upload caller do not establish another current call site. Etmf's direct ingest/artifact workflow remains separately inventoried and is not made safe merely by correcting the shared hook.

## Producer-compatible confirmation boundary

The route sends the service's actual document/filing outcome after the transaction and its awaited post-commit work. A correct client must treat an undecodable or malformed affirmative response as an **unconfirmed write**, since it cannot infer rollback from a bad receipt.

| Field consumed by the hook/UI | Actual producer | Recommended confirmation rule |
| --- | --- | --- |
| Envelope | Route always returns an object with `success: true` for accepted outcomes. | Require a non-array object and literal `success === true`. HTTP status alone is insufficient. Preserve non-2xx handling separately. |
| `document.id` | Database UUID of the recorded version (`vault-ingest.service.ts:738`). | Require a saved UUID, not an arbitrary nonblank label. Do not guess it from filename, check-in target or later tree order. |
| `document.programId` | Exact requested `args.programId` (`:739`). | Require exact requested program identity; do not normalize a foreign or missing scope into the current project. |
| `document.version` | Assigned/stored version (`:743`); first upload normally 1.0, check-in assigned by server. | Require a nonblank string. Do not synthesize a number, enforce an invented numeric format or infer version advancement from HTTP 2xx. |
| `document.documentTitle` | Actual stored title, including on same-bytes reupload (`:741`). | Require a nonblank string; do not replace missing recorded title with requested filename/title while calling the receipt confirmed. |
| `filing.folderId` | String taxonomy key or null. Keys such as `module-3`, `eng` and `qms` are not UUIDs. | Require string/null with coherent placement. Never apply UUID validation to folder IDs. |
| `filing.folderLabel` | `folderLabel()` returns a string, including **`''` for absent/unknown label** (`vault-filing.service.ts:491`); public type also permits null. | Accept string/null, including empty string. Existing display fallback to a confirmed folder ID remains valid. A nonblank-label requirement rejects real producer output. |
| `filing.placementStatus` | Current service produces `confirmed`, `suggested` or `unfiled`, then reports the stored row. | Require the known discriminator before using it. Confirmed/suggested must identify a folder; unfiled must not claim one. Unknown values cannot silently become suggested. |
| `filing.needsReview` | Receipt is `doc.placement_status === 'unfiled'` (`vault-ingest.service.ts:762`). Suggested placement is **false**, though it still needs confirmation as filing. | Require boolean and consistency with the reported status. Do not coerce `'false'` to true or require `needsReview: true` for suggested placement. |
| `document.extraction` | Always emitted as `extracted`, `pending` or `failed` (`extractionStateOf`, `:751`). | If optional compatibility is retained, absence makes no extra extraction claim; any supplied value must be a recognized enum. Null/object/arbitrary string must not suppress the pending-text caveat under a confirmed receipt. |
| `reupload` | Omitted for a new version; when present, object with boolean `unchanged`, `changes[]`, `differs[]`. | Supplied null/primitive/array is malformed. Validate used metadata before any success/status/outcome publication. Do not require every valid reupload to be unchanged. |
| `reupload.changes` | Audited records `{ field, from: string|null, to: string|null }`. `unchanged` is exactly `changes.length === 0`. | Validate supplied array/records and boolean/array coherence. A change must not be interpreted as “nothing changed.” Unknown unrelated extra object properties can be ignored. |
| `reupload.differs` | Unapplied requests `{ field, recorded: string|null, requested: string }`. Current fields: title/type/classification or folder/kind/CTD section (`vault-reupload.ts:127`). | Require an array of objects with usable typed fields before the hook calls `.some`. A malformed difference must not throw through the batch loop. Current known fields drive the existing Edit details/Move advice. |

Unused document receipt fields (code, type, file name/size/MIME/hash, processing status, text/count/timestamps) and unused filing fields (view, evidence kind, CTD section, confidence/rationale) are provided by the producer but need not become extra mandatory client gates solely because they exist. Validate the fields the client uses to make confirmation/placement/reupload/extraction claims; accept unrelated future properties. Keep the existing public hook outcome and server method/path/body/auth/progress/version/audit behavior.

No new endpoint, parser module, recovery engine or model is needed. Correct the existing hook's successful-response interpretation and reuse its existing `unknown: true` failure result. That result must add no succeeded/recorded/filing/already-recorded/new-version/conflict entry, retain the file, continue the sequential batch and settle `uploading=false` without automatic retry or “nothing was saved” claims.

## Real reupload and check-in semantics

**Same bytes do not necessarily mean every stored field was unchanged.** The service's conflict update preserves title/type/classification/filing, fills permitted missing storage/retention/lineage values and computes audited before/after changes (`vault-ingest.service.ts:518–552`, `:655`). A genuine repair can therefore return `reupload.unchanged: false` with nonempty changes. `differs` describes requests not applied; it is independent of whether an allowed repair occurred. A normal no-change retry has `unchanged: true, changes: []`, and may still have nonempty differs.

The hook currently ignores `unchanged`/`changes`, and both `alreadyRecordedText` (`useVaultUpload.ts:147`) and stored-row text (`VaultUploadStaging.tsx:145`) categorically say “nothing changed.” Neutral “already recorded with these bytes” copy at those existing sites preserves valid repair receipts without adding another outcome flag. Requiring `unchanged: true`, refusing valid changed repairs or silently mapping changed repairs to unchanged copy is not producer-compatible. Existing DB tests in `tests/db/vault-reupload.dbtest.ts:138–207` cover no-change and unapplied-difference behavior; this audit did not execute them or find a changed-repair execution case there.

A check-in names a version UUID, not a new code/version (`useVaultUpload.ts:195`). The service plans/rechecks the current head, inherits filing and assigns the version. The returned version ID need not equal the requested predecessor ID. Preserve refusal/conflict semantics and do not require that equality. An accepted check-in requires its own confirmed receipt before the current UI removes the retained file offer or opens a recorded version.

## Concrete current risks and consumer consequences

1. **P1 candidate, source-traced: malformed 2xx is reported stored.** `uploadOne` at `useVaultUpload.ts:237` catches JSON failure as null and still returns `ok: true`; it never checks envelope success, program or a mandatory document identity. The upload loop at `:386–414` then publishes stored status and succeeded entries. An empty response can be presented as an Unfiled record, and a malformed check-in can remove its offer because Vault tests `outcome.succeeded.includes(file.name)` (`Vault.tsx:1270`). Requires root fail-first execution before calling it reproduced.
2. **P2 candidate, source-traced: malformed optional metadata can abort the batch.** `alreadyRecordedOf` assumes `differs.some` and each `d.field` are safe (`useVaultUpload.ts:140`). `{ reupload: { differs: {} } }` or a null array element can throw after the transport catch. The outer finally clears uploading, but the promise rejects, later files are not processed and no normal unknown outcome is returned. Filing/version/title values are otherwise coerced or rendered from unchecked data. Validate before interpreting; reuse the same unknown-result branch for these receipts.
3. **Visible propagation: Vault and device workflow trust shared success.** Vault opens only returned IDs, but refreshes on any succeeded file and removes check-in offers on succeeded filename. DossierDrawer builds `Set(outcome.succeeded)` and calls `DossierStore.attachFile` for original files matching those names (`PathwayPanes.tsx:842–852`); a false success therefore creates an actual visible local attachment entry. It does not create an additional server audit entry, and this audit makes no claim that a local list entry proves a filed submission attachment.
4. **Independent follow-up, source-traced and unproved: duplicate filenames.** Even with correct receipt validation, two File objects with the same name and a mixed valid/refused or valid/unknown outcome collapse into one succeeded-name Set in DossierDrawer. Both original files are then locally attached. The attachment picker is multiple-file and has no Vault staging duplicate-name gate (`PathwayPanes.tsx:972–1004`). This is an existing filename-to-file correlation problem, distinct from malformed receipts. Record it for separate caller-level fail-first proof; do not widen this receipt contract or change the public outcome silently. Vault's one-file check-in does not have that ambiguity.

## Bounded caller regressions and fixture maintenance

- **Actual Vault staging:** extend an existing real Vault + `stubIngestXhr` fixture. Send a malformed affirmative receipt followed by a valid receipt in the same batch. Require an unknown/refused row and reload/check instruction for the first; no stored/recorded/new-version claim, target navigation or conflict offer for it; the second still records normally. Inspect the real `vault-stage-live` announcement, not just the helper outcome.
- **Actual check-in offer:** reuse `vaultCheckInVersion.test.tsx`'s real 409 → offer → check-in interaction. Return malformed 2xx to check-in. The file offer remains available; no new-version success/open is claimed. A later explicitly chosen valid check-in receipt can complete the normal workflow. Do not turn uncertainty into an automatic retry.
- **Actual DossierDrawer:** use its real Attachments input and shared hook/transport, with normal QueryClient wrapping as in `mdx/surfaces/__tests__/DossierDrawer.history.test.tsx`. Malformed 2xx must not call/add a local attachment; a valid receipt does. A partial batch should add only confirmed distinct-name files. Do not mock `useVaultUpload` to manufacture the desired outcome. Keep duplicate-name mixed-outcome proof a separate follow-up.
- **Positive producer compatibility:** retain actual hook controls for confirmed/suggested/unfiled filing, assigned check-in version, unchanged reupload with differences, valid changed-repair reupload, empty folder label and pending extraction. Include malformed optional metadata with a later valid file to prove continuation.
- **Shared XHR fixture:** `_ingest-xhr-fake.ts` already exercises actual transport and complete-send progress; keep transport behavior unchanged. A fake that calls `reply.json().catch(() => null)` serializes decoder failures into JSON null, so use a raw XHR body fixture if proof specifically requires invalid JSON text rather than a null receipt.
- **Maintenance paths:** `v2/__tests__/useVaultUpload.test.tsx` currently returns `document: {}` and synthetic non-UUID IDs; `vaultUploadReview.test.tsx`, `vaultUploadStaging.test.tsx`, `vaultUploadManifestPanel.test.tsx`, `vaultCheckInVersion.test.tsx` and `vaultOpensUploadedDocument.test.tsx` omit producer scope/identity/title/version/filing in many positive receipts. Add truthful producer fields only; retain assertions and failure fixtures. Existing missing-ID case at `vaultOpensUploadedDocument.test.tsx:124` currently expects “Recorded as v1.0”; that assertion must intentionally change to unknown, beyond merely keeping navigation absent. Keep the separate recorded-ID-not-in-refreshed-tree case valid and its warning assertion intact.

## Source SHA-256 pins

```text
b4938a58852be61cffb9e9582ec8ac41504ec99377d0fcfa82c99e5b77ec2bf5  client/src/concept2cure/v2/useVaultUpload.ts
420be6b1ca6c22ff5367a70aa484356ee62b1733b21de0675cebeaaaec030e8f  client/src/concept2cure/v2/vaultIngestTransport.ts
b0cfd0a045b9cc644910d7477e190fed00932e5c147e06520daea24090825d89  client/src/concept2cure/v2/surfaces/Vault.tsx
44c175d1edd6781f515d16d2149fe1f0fac8f8e1168defb8f8e568e09c0fb5c7  client/src/concept2cure/v2/surfaces/VaultUploadStaging.tsx
7aaa36a2843af27ccedd317b1aca3eae12f32718b9ff1ff4c9514f1c8f964a87  client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes.tsx
da488d82c39784ef5b2f415871ef079e45513d8b8aba973148d366a010bad415  client/src/concept2cure/mdx/store/dossierStore.ts
9f8e4cf8e31582692c980b3b4a7e30f12a2a60e2bbb65a25bddbebaa63d4eae3  server/routes/vault-ingest.ts
0c0e1ebfe157378d59e199c476875cca216643cd287a01080d2958c368db2434  server/services/vault/vault-ingest-types.ts
1929d3425df21becf45023427f9063fefa5518ecec5b2db4352448ab966dd3fe  server/services/vault/vault-ingest.service.ts
e366f3ab5ee389a1dd19281306f9cebeb0b226a6759d55610a5dc96381a14489  server/services/vault/vault-reupload.ts
5ce519ff22474ed2f43ece518c871133f78a2278121ea8d5c7a9423a0de1f30f  server/services/vault/vault-filing.service.ts
5242cd969cb9ec791c59f64f529ccbf5cf3d19aee72ee9b8ea1d8832d0f0bc1f  client/src/concept2cure/v2/__tests__/vaultOpensUploadedDocument.test.tsx
eb530627c69e4c69c02482e562df8d6c08ad5e437f98ab437bdf481f48da8083  client/src/concept2cure/v2/__tests__/vaultCheckInVersion.test.tsx
10a65b88aa3d3bb95ecf329f60184f4d419715dc3c57ce02dee7a035186bd80f  client/src/concept2cure/v2/__tests__/useVaultUpload.test.tsx
c898ec65466714cb1445e0d81428a8194874ec191bba2d652187778aa5b1e5cb  client/src/concept2cure/v2/__tests__/vaultUploadStaging.test.tsx
f4894947b511d5d3ee6ff2592dcb32406a1ec6c24416a7ae0778608bcf486039  client/src/concept2cure/v2/__tests__/vaultUploadManifestPanel.test.tsx
a26a1354055e8aaf4277496486f5214217be56b300a331d47cf39e1088467710  client/src/concept2cure/v2/__tests__/vaultUploadReview.test.tsx
```
