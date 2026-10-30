# Independent producer/consumer convergence review

D2 / W2, 2026-10-30. Read-only review of canonical commit `1ce6adc681c984f1669715d37fda774f11203059` against the local candidate inventory. No source/test edit, qualification run, Git mutation or server write performed by this reviewer.

## What already exists

The revised inventory is recorded in the design and packet README. The newly canonical `v2/vaultIngestReceipt.ts` is the sole retained upload receipt parser; `useVaultUpload.ts` owns batch outcomes, `vaultIngestTransport.ts` owns XHR/JSON parsing, and the existing route/service owns admission. The canonical plural receipt suite and explicit `ingestReceipt` helper already exercise their contract. The local private parser must be removed during convergence rather than retained beside this owner. No engine or new capability is needed.

## Verdict

Approve convergence onto the canonical parser and semantics, plus the bounded correction that new-version outcomes/copy derive from the validated receipt title rather than a previously selected title. Preserve null as null in the outcome, and use truthful generic recorded-document copy when a title is null or only whitespace. Do not fall back to a filename or the request title as though that were what the server recorded. No additional parser or producer change is justified by this audit.

The distinction is defensive response-authority consistency: the current ordinary HTTP201 check-in INSERT binds `args.documentTitle` at service line571 and the receipt returns `doc.document_title` at line741, so its title normally equals the submitted title. This review does **not** establish a native check-in whose saved title diverged from that request. A deliberately divergent valid receipt is an appropriate consumer control because a confirmed outcome should report the server reply it actually observed. Nullable/blank title compatibility is supported by the parser and legacy reupload constructor, not a native null-title HTTP201 check-in execution.

## Producer findings to preserve

- The ingest route returns HTTP200 only when `outcome.reupload` exists and HTTP201 otherwise, with literal success and document/filing. The canonical parser's status/envelope coherence is correct.
- `documentCode` is derived from the original selected filename by the hook. Check-in instead sends `supersedesDocumentId`; the server reads the head and assigns the retained code/version. Preserve filename code binding for original uploads and the previous-ID refusal for check-in.
- The returned title comes from `doc.document_title`, never a response fallback to filename. Same-bytes ON CONFLICT deliberately omits title/type/classification/filing from updates, so legacy nullable titles and retained old Unfiled folder IDs can survive admission. `RecordedVersion.document_title` is explicitly string|null, although the exported result interface currently declares string. The runtime constructor, not that narrower interface annotation, determines compatibility.
- Filing `needsReview` is computed from the returned row's `placement_status === 'unfiled'`. It is false for suggested placements. The response can retain a folder ID while explicitly Unfiled; the canonical hook correctly suppresses the folder label in that case. Do not reject such a receipt or infer an auto-filed claim from that retained folder.
- `reuploadChanges` loops a fixed field vocabulary once and appends only unequal before/after values; `reuploadDiffers` similarly loops six fields and emits only unequal requested/recorded values. The canonical vocabulary, uniqueness, max-count and inequality controls match those producers. `unchanged` is exactly changes.length===0.
- A reupload can repair missing storage, retention or lineage while retaining existing bytes/title/filing; it is a successful receipt with unchanged=false and changes, not a new refusal. Preserve updated/recordUpdated and updated-history copy. An unchanged=true receipt may retain its existing nothing-changed wording; the earlier candidate's blanket neutral copy must not erase the canonical distinction.
- Preserve explicit server OUTCOME_UNKNOWN as uncertain on non-2xx, normalized UUID identity, no automatic retry, and all current authentication/progress/multipart boundaries.

## Added test value and fixture boundary

The existing canonical unreadable-json hook test asks the shared fake's json() to throw; that fake catches the throw and serializes null. The local raw empty/HTML/truncated replies reach `sendIngest`'s actual JSON.parse rejection and add distinct transport proof. Consolidating those onto the plural existing suite preserves one hook-test owner. Actual Vault flow tests add consumer proof for no unverified open/refresh, editable unknown rows and retained File/check-in offers; actual MDX drawer tests prove no local attachment or fabricated activity from malformed replies for unique filenames. These supplement rather than replace canonical malformed-body/positive/repaired/null-title tests.

The new MDX receipt fixture already carries documentCode:fileName and is compatible with request binding. The new Vault fixture hardcodes analytical-procedures.pdf, so mixed original-upload positive receipts must explicitly match each selected filename. Never auto-repair malformed inputs in the shared fake. Remove overlapping local controls that incorrectly classify blank legacy titles or a retained Unfiled folder as invalid; retain the canonical positive compatibility assertions and preserve red logs as historical candidate evidence.

## Proof limits and remaining needs

Native `tests/db/vault-reupload.dbtest.ts` proves actual newly created, unchanged same-bytes and check-in responses are accepted by this parser under real route/storage/RLS. Its packet explicitly records that attempts to manufacture a legacy null-title/storage/retained-folder record were refused by the real guard. No trigger/permission bypass or native legacy repair acceptance is claimed. Legacy compatibility here remains constructor-reviewed plus focused unit vectors.

`PathwayPanes.tsx` maps accepted outcomes to local attachments through a filename Set. Mixed equal-filename files can therefore alias a successful and an unconfirmed/refused item. This is source-traced, not reproduced or corrected in the present slice; actual unique-filename drawer controls must not be described as resolving it. The separate direct eTMF ingest caller is also outside this hook correction. Local engineering checks do not establish deployed acceptance, signed OQ or agency readiness.

## Canonical source pins

SHA-256 of Git blobs at the reviewed canonical commit (not mutable working files):

| Path | SHA-256 |
|---|---|
| `client/src/concept2cure/v2/vaultIngestReceipt.ts` | `83af6a73aebfa765329bcd5d8d4b979c2a60502998dd357e7967e9fd915de00a` |
| `client/src/concept2cure/v2/useVaultUpload.ts` | `e23599ab93b0907d33e6a5d26d376cfa1f96604c07e45f8ef0dd842837d1f873` |
| `client/src/concept2cure/v2/vaultIngestTransport.ts` | `420be6b1ca6c22ff5367a70aa484356ee62b1733b21de0675cebeaaaec030e8f` |
| `client/src/concept2cure/v2/surfaces/VaultUploadStaging.tsx` | `a211037fea3140527a5501b0defe6469add550754302a117fa8f70203afd42ad` |
| `client/src/concept2cure/v2/surfaces/Vault.tsx` | `b0cfd0a045b9cc644910d7477e190fed00932e5c147e06520daea24090825d89` |
| `client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes.tsx` | `7aaa36a2843af27ccedd317b1aca3eae12f32718b9ff1ff4c9514f1c8f964a87` |
| `server/services/vault/vault-ingest.service.ts` | `1929d3425df21becf45023427f9063fefa5518ecec5b2db4352448ab966dd3fe` |
| `server/services/vault/vault-reupload.ts` | `e366f3ab5ee389a1dd19281306f9cebeb0b226a6759d55610a5dc96381a14489` |
| `server/services/vault/vault-ingest-types.ts` | `0c0e1ebfe157378d59e199c476875cca216643cd287a01080d2958c368db2434` |
| `server/routes/vault-ingest.ts` | `9f8e4cf8e31582692c980b3b4a7e30f12a2a60e2bbb65a25bddbebaa63d4eae3` |
| `tests/db/vault-reupload.dbtest.ts` | `1db2e6b82ad417cd3a2ef18148208bc2c60948838b8b8f2f1638ee70b325ba01` |
| `client/src/concept2cure/v2/__tests__/_ingest-xhr-fake.ts` | `d7c582159a4a99871d4ca8f823fa2410341dfcc24576ee084e8b15f41700d7ff` |
| `client/src/concept2cure/v2/__tests__/vaultUploadReceipts.test.tsx` | `3192f4362a660d142403b0a40e265dd65e10387bdc3722983739ecfa48706c0f` |
| `docs/evidence/D2/2026-10-30-vault-upload-receipts/README.md` | `ae71b3dc0d6ba1c0d00a98fa57abb86f6bc1e908c739ee35bee0333a12c4bb8a` |
