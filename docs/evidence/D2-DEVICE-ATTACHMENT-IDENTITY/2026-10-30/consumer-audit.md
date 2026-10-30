# Device attachment consumer and regression audit

D2 / W2, 2026-10-30. Independent static audit at canonical baseline `819029e2c187f2a8d5f092fd3bce836b200977e3`. This reviewer changed no production or tests, ran no qualification command and performed no Git mutation. The control tower owns fail-first execution, final hashes, lint, build, compiler and publication.

## What already exists

The design and evidence README inventory were read before this audit. `DossierDrawer.onAttach` in `mdx/surfaces/pathway/PathwayPanes.tsx` is the only production caller of `DossierStore.attachFile`. There are exactly two production consumers of `useVaultUpload`: that drawer and `v2/surfaces/Vault.tsx`. The Vault already correlates `onFileStatus(index,status)` to stable pending row keys. Search found no other attachment reconstruction using `Set(outcome.succeeded)`. No other parser, uploader, attachment store or status API is needed.

The existing shared hook snapshots the selected input into an ordered array before its first await and sends requests sequentially. It supplies each request's index to progress/status callbacks. Its current public `VaultUploadOptions.onFileStatus` therefore already gives the device caller the correlation it needs. The drawer currently discards that precise identity and later filters the possibly mutable original selection by succeeded filename. Correcting that one caller is sufficient for the bounded equal-name correlation contract.

## Verdict and callback semantics

Approved: snapshot the original ordered `File[]` synchronously, pass it to the shared hook, retain only indexes that receive `state: stored`, and update the existing local store from those original indexes after the batch settles. An index belongs to that invocation only. A filename Set is insufficient, and a File-object Set is also insufficient when the same object occurs at multiple selected positions. Do not infer confirmation from progress or successful HTTP status.

`useVaultUpload.upload` sends `uploading` and progress states, awaits `uploadOne`, then emits exactly one normal terminal status for that index. A successful result becomes `stored` only after `readVaultIngestReceipt` validates project/document identity, request code, HTTP200/201 coherence, filing and reupload metadata. This happens before adding the name/ID to the outcome arrays. Valid HTTP201 creation and HTTP200 already-recorded responses both yield stored. A legitimate same-name positive pair can be a created record followed by an unchanged reupload of the same bytes, with the same returned identity. Different bytes at the same original code/version can legitimately produce VERSION_CONTENT_CONFLICT and must not appear attached.

HTTP refusals, malformed successful replies and actual transport loss do not produce stored. `OUTCOME_UNKNOWN` and complete-send/no-reply preserve their existing uncertain result; known 409/401 refusals retain refusal semantics. Empty or unscoped inputs send nothing and supply no stored callback. The hook contains no retry loop: one sequential upload attempt per selected index, while retry remains a distinct human action. Adding the existing indexed observer does not alter auth, request body, parser, server admission or outcome copy.

## Real caller and audit impact

The picker and drop target share the same `onAttach`. The picker clears its input immediately after starting the asynchronous handler. A stable local snapshot ensures post-await metadata still describes exactly the original objects submitted, independently of a controlled selection replacement/clearing. A mutable array-like fixture can prove this boundary; it should not be labelled a native-browser FileList behavior proof without executing that browser.

`DossierStore.attachFile` prepends display metadata (name, size, kind, who, when, source, live) and notifies subscribers. It deliberately appends no client-authored audit event. The Activity tab reads `useSectionVersions(documentId,sectionId)` from server version rows. Existing read-only and history controls must remain intact: no drawer editing, no write to filing-section text, no fabricated actor/history event, and failed history reads stay visibly failed.

The caller-only correction does not change persistence, published document IDs, section paths, hydration semantics, navigation, receipt parsing, upload permission or any other upload caller. A valid 200 receipt must still count as confirmation; a refused or unknown sibling must never inherit its success. Exact posted File identity, per-selection size/count and no unexpected additional POST are stronger assertions than matching only displayed names.

## Recommended bounded regression cohort

The following 12 existing suites cover the changed owner and immediate interfaces without rerunning unrelated server/native qualification. Broaden only for a relevant incoming canonical change or an observed failure:

- MDX: `DossierDrawer.uploadReceipt.test.tsx`, `DossierDrawer.readOnly.test.tsx`, `DossierDrawer.history.test.tsx`, `PathwayPanes.tabCounts.test.tsx`.
- MDX hooks: `useDossier.hydration.test.tsx`, `useDossier.scope.test.ts`, `usePathwayTabsData.auditKind.test.ts`, `mdxPathwayIdentity.test.ts`.
- Shared/Vault callers: `useVaultUpload.test.tsx`, `vaultUploadReceipts.test.tsx`, `vaultUploadReceiptFlow.test.tsx`, `vaultUploadStaging.test.tsx`.

New actual-caller controls should cover success/refusal and success/malformed pairs in both orders with equal names but different selected sizes; exact multipart objects/order and one attempt each; no-confirmation and all-confirmed controls; valid idempotent HTTP200; controlled selection replacement before response; and no locally invented activity. Existing three receipt controls must retain their assertions. The test author was informed of the actual producer's 201/200 compatibility and reversed local-store prepend order.

## Lint baseline boundary

Static config inspection finds MDX excluded by the broad `client/src/concept2cure/*` ignore, with only v2 explicitly unignored. The normal warning baseline contains no PathwayPanes entry. Ordinary pushed-file lint therefore does not establish an explicit MDX production-file warning count. Root should capture before/after `--no-ignore` ESLint for PathwayPanes and the changed MDX test, alongside all unchanged normal gates. The file is already large; config's general limits are 500 nonblank/noncomment lines, 100 per function and complexity15. This reviewer does not invent exact warning/error counts without running the tool. No ignore, suppression or threshold change is justified by this bounded fix.

## Separate findings and limits

1. **Session lifetime remains separate.** The local store keys pathway/section/label, not program. Hydration clears and rewrites a pathway when program/document/session data changes. A completed old upload closure can still reference an earlier target while the shared store has changed. This is a concrete source-traced lifetime concern; this audit did not execute or fix it. Index correlation must not be claimed to bind a late completion to a currently open dossier/session.
2. **Durable attachment linkage remains separate.** `DossierAttachment` has no Vault document ID, and the hydration adapter currently supplies `attachments: []`. Local attachment rows can disappear on hydration/reload and are not a proven persisted filing-section-to-Vault relationship. Snapshot/index correlation does not establish durable submission evidence linkage or export inclusion.
3. **Presentation of two confirmed duplicate selections remains existing behavior.** If both selected positions receive valid receipts, this contract confirms both positions; it does not silently deduplicate by filename, bytes or returned Vault ID. A future display/persistence policy needs its own contract rather than reusing success-name collapse.
4. **Other workflows retain their own scope.** The direct eTMF ingest caller and broader launch, native database, formal OQ, deployed acceptance and agency transmission remain unqualified by this local drawer correction.

These are scoped follow-ups, not blockers to the approved correlation fix and not claims of executable reproduction. No new engine or expanded write permission is proposed here.

## Baseline source pins

SHA-256 values below refer to exact committed blobs at the baseline above, not moving working-tree files. They are audit input pins, not final qualification evidence.

| Path | SHA-256 |
| --- | --- |
| `client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes.tsx` | `7aaa36a2843af27ccedd317b1aca3eae12f32718b9ff1ff4c9514f1c8f964a87` |
| `client/src/concept2cure/mdx/store/dossierStore.ts` | `da488d82c39784ef5b2f415871ef079e45513d8b8aba973148d366a010bad415` |
| `client/src/concept2cure/mdx/hooks/useDossier.ts` | `2d25a59d3a61391a63e20b3c934ae1152afa0146319c19cdd2a2841bf957b68c` |
| `client/src/concept2cure/mdx/types.ts` | `b9397dba5b24fd39daed6825c6669f9d89b2052dda985352e55f2464dbce9643` |
| `client/src/concept2cure/v2/useVaultUpload.ts` | `bd24e2c28da897010dac7247de47d73c991cfe3befc57b915eaef1480e68890e` |
| `client/src/concept2cure/v2/vaultIngestReceipt.ts` | `83af6a73aebfa765329bcd5d8d4b979c2a60502998dd357e7967e9fd915de00a` |
| `client/src/concept2cure/v2/vaultIngestTransport.ts` | `420be6b1ca6c22ff5367a70aa484356ee62b1733b21de0675cebeaaaec030e8f` |
| `client/src/concept2cure/v2/surfaces/Vault.tsx` | `b0cfd0a045b9cc644910d7477e190fed00932e5c147e06520daea24090825d89` |
| `client/src/concept2cure/mdx/surfaces/__tests__/DossierDrawer.uploadReceipt.test.tsx` | `851e38f86dff04ba69b630d2dba313feda53ae53d7a0cfdc168624bde4e48111` |
| `client/src/concept2cure/mdx/surfaces/__tests__/DossierDrawer.readOnly.test.tsx` | `9978529eb0a2a82d1b22df6fd045c483e40b8497c1262d70842c4622adadb0ae` |
| `client/src/concept2cure/mdx/surfaces/__tests__/DossierDrawer.history.test.tsx` | `070029460def9556be04990f6b7727e34bff5c8938f8b3c55a61cb4ad9de4a65` |
| `client/src/concept2cure/mdx/surfaces/__tests__/PathwayPanes.tabCounts.test.tsx` | `e1fd393f0ff9f6065d6759c042f6f5360b1b4cc2cb2d726f336ad23e75e4fcc4` |
| `client/src/concept2cure/mdx/hooks/__tests__/useDossier.hydration.test.tsx` | `40abadeb0f0b8382c65940cffb699e936e2391028efca09ac6fb609ea4eaaf19` |
| `client/src/concept2cure/mdx/hooks/__tests__/useDossier.scope.test.ts` | `3ab1bd8528c784a3982b6765ffb637074ba9309036e21c4b20d146914977747e` |
| `client/src/concept2cure/mdx/hooks/__tests__/usePathwayTabsData.auditKind.test.ts` | `58a6a1fe152c5efcede21dafc41f7b239cc50000d85d3b6a0f5be98d5084f1c6` |
| `client/src/concept2cure/mdx/hooks/__tests__/mdxPathwayIdentity.test.ts` | `b1826a27b2b4781f789843b4cce9fe90a72e46b40197ee1f5e265e5e4894673a` |
| `client/src/concept2cure/v2/__tests__/useVaultUpload.test.tsx` | `7128cb3f4070490b0ed0479a6d3cf6355c13635fac0b7d5778dd8a30b8993573` |
| `client/src/concept2cure/v2/__tests__/vaultUploadReceipts.test.tsx` | `8fdb26891dde531eda566ba8660ae77268ba25f11cc4d6808f2d1eccf82570d0` |
| `client/src/concept2cure/v2/__tests__/vaultUploadReceiptFlow.test.tsx` | `a97546f715f1e0c200ff6d8c69f600ae02a8702ad85bb546b0743c3baf9576d3` |
| `client/src/concept2cure/v2/__tests__/vaultUploadStaging.test.tsx` | `532d3c9339d732b160ce64bc8f7766ab267bfd8070894d6f1009d776eb14b49f` |
| `eslint.config.js` | `a8e9501b18eae08423ee641348b49a8d3ccc36a10812133569c0ffdb720ef23e` |
