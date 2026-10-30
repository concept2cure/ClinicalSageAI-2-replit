# Independent device attachment identity contract review

D2 / W2, 2026-10-30. Exact reviewed canonical source: `819029e2c187f2a8d5f092fd3bce836b200977e3`. This reviewer made no production/test edits, ran no qualification/build/compiler/provider/network job and made no Git mutation. The source hashes below are baseline Git blob bytes, so later root/test-worker edits cannot silently change this review's attribution.

## What already exists

Read the inventory and bounded candidate in `docs/design/DEVICE_ATTACHMENT_IDENTITY_2026-10-30.md` and the packet README before review. `DossierDrawer.onAttach` in `PathwayPanes.tsx` is the existing upload caller and the only found attachment reconstruction using `Set(outcome.succeeded)` plus filename matching. `useVaultUpload` already snapshots input, sends sequentially, reports `(index,status)` and validates receipts before terminal `stored`. `vaultIngestReceipt` is the sole parser; `vaultIngestTransport` owns multipart/auth/progress/uncertain-send behavior. `DossierStore.attachFile` updates local display metadata without client-authored audit rows. The actual drawer receipt suite already exercises real hook/XHR/parser/store behavior. The main Vault stages rows using this same indexed callback, while its new-version filename success check operates on one selected file. No alternate uploader, correlation engine or public API is needed.

The parent inventory's deleted-history search and no-deeper-instructions result were read; no replacement owner needs restoration. The correction extends the existing caller rather than duplicating its infrastructure.

## Verdict: approved bounded contract

1. Synchronously capture one ordered `File[]` snapshot before the first await and pass that same snapshot to `attachUpload.upload`. Derive eventual attachment metadata only from that snapshot. The input handler starts `onAttach` then immediately clears `e.target.value`; post-await access to the original `FileList` is not a stable correlation contract. A controlled mutable-list regression proves snapshot behavior without claiming a specific browser's FileList implementation was executed.
2. Keep a **per-batch set of confirmed selection indexes**, updated through the existing `onFileStatus`. Admit only terminal `state === 'stored'`. A filename cannot confirm a sibling with the same name. A `Set<File>` is also insufficient as a general contract: repeated references can still represent distinct selected positions with separate outcomes. Local indexes already express the shared hook's request order precisely.
3. After the batch resolves, update the existing attachment display only for original indexes confirmed stored. Preserve the existing selected order and store prepend behavior; do not invent a deduplication policy or bypass the server's idempotency. Callback progress/start statuses cannot confirm a record; refused/unknown statuses cannot borrow another index's authority. No callback-side write is required before the batch completes.
4. Do not change shared hook outcomes/options, parser, transport, request fields, authentication, default document type, refusal/unknown messages, upload ordering/count, server admission/storage/audit, or local store persistence/audit semantics. Do not introduce automatic retries. The correction requires only the existing caller's correlation logic plus meaningful tests/docs.
5. Preserve valid created and idempotent confirmations. All verified HTTP201 and valid HTTP200 reupload replies produce `stored`; both can legitimately update the local display. HTTP409 content conflict, malformed successful envelopes, explicit server `OUTCOME_UNKNOWN`, and complete-send connection loss produce refused statuses, with uncertainty retained where appropriate.

## Producer and recovery checks

`server/routes/vault-ingest.ts` returns HTTP201 for a created record, or HTTP200 plus reupload metadata when bytes already exist. The sole client parser requires that exact status/envelope coherence, UUID/context/code binding, and used metadata consistency. The hook returns success only after parsing; its per-file status is produced from that verified result immediately before shared batch outcome accumulation.

The transport distinguishes pre-send connection refusal from a complete send whose reply is lost. The hook maps `IngestUnconfirmedError`, malformed 2xx and the server's explicit `OUTCOME_UNKNOWN` code onto its existing uncertain result and reload/check guidance. The new caller must consume only its trusted indexed terminal statuses; it must neither reinterpret these responses nor issue a second POST. Valid nullable legacy titles, retained Unfiled folders, and repaired-versus-unchanged reuploads remain the canonical parser/hook's responsibility.

The store's `attachFile` deliberately appends no `attach` history event. Activity is read independently by `useSectionVersions`. Exact selected-file correlation must preserve that separation: confirming a local attachment is not a browser-authored Part 11 audit entry.

## Meaningful fail-first and merged-state proof

- Drive the actual drawer + real shared hook + multipart XHR seam + parser + local store. Mocking an already accepted hook outcome would miss the authority boundary.
- Use distinct same-name File objects with different sizes/bytes. Cover confirmed/refused and confirmed/unknown in both orders; assert exact posted File identity/order and that only the confirmed selection's metadata is displayed. Keep request count exact to exclude automatic retry.
- Keep positive all-confirmed and negative all-unconfirmed controls. An idempotent positive must use genuine HTTP200 reupload semantics, rather than a fixture impossible under the route contract. Preserve all three existing unique-name controls.
- Replace/clear a controlled original list while a real request is pending; confirm posted files and eventual attachment metadata still come from the captured selection. Label this a controlled lifetime vector, not a native browser implementation claim.
- Check no client activity rows are manufactured, existing refusal/unknown guidance survives, and other dossier/read-only/history/hydration and shared upload/receipt/Vault controls remain green. Pin red source/test inputs before production edits. Root owns appropriate regressions, lint with no warning growth, complete build, whole-project zero-error compiler and every normal direct-publication hook.

## Explicit scope limits and source-traced follow-ups

This is a correction of selected-position correlation inside one current batch. Broader session lifetime is separate: the drawer's post-await continuation carries the starting pathway/target, while the shared in-memory dossier store is keyed by pathway/section and hydration can replace its contents for another project/document. A late upload completion after replacement may therefore populate the current local path without a session token. This is a source-traced concern, not an executed failure or a fix delivered here. Concurrent batches also retain the hook's existing shared uploading/note state; per-batch index sets must remain independent but do not claim to redesign that shared state.

Durable attachment linkage is also separate: `useDossier.fetchDossier` hydrates `attachments: []`, and this caller's attachment addition updates local display metadata. The server persists uploaded Vault bytes/audit, but this contract does not add a durable document-section attachment relation or reload restoration. The direct eTMF ingest caller remains separate. None of these concerns justifies silently extending the reviewed scope or claiming a new persistence/audit capability.

This approval is a source/contract review, not test execution, deployed acceptance, signed OQ, native storage qualification or agency acceptance.

## Exact baseline source pins

| Path | SHA-256 at 819029e2c |
| --- | --- |
| `client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes.tsx` | `7aaa36a2843af27ccedd317b1aca3eae12f32718b9ff1ff4c9514f1c8f964a87` |
| `client/src/concept2cure/v2/useVaultUpload.ts` | `bd24e2c28da897010dac7247de47d73c991cfe3befc57b915eaef1480e68890e` |
| `client/src/concept2cure/v2/vaultIngestReceipt.ts` | `83af6a73aebfa765329bcd5d8d4b979c2a60502998dd357e7967e9fd915de00a` |
| `client/src/concept2cure/v2/vaultIngestTransport.ts` | `420be6b1ca6c22ff5367a70aa484356ee62b1733b21de0675cebeaaaec030e8f` |
| `client/src/concept2cure/mdx/store/dossierStore.ts` | `da488d82c39784ef5b2f415871ef079e45513d8b8aba973148d366a010bad415` |
| `client/src/concept2cure/mdx/hooks/useDossier.ts` | `2d25a59d3a61391a63e20b3c934ae1152afa0146319c19cdd2a2841bf957b68c` |
| `client/src/concept2cure/mdx/hooks/useSectionVersions.ts` | `daaa6dec0f885abf689a4dd4ecf66e0f869e066d694114f71000dd91dc11a169` |
| `client/src/concept2cure/mdx/surfaces/__tests__/DossierDrawer.uploadReceipt.test.tsx` | `851e38f86dff04ba69b630d2dba313feda53ae53d7a0cfdc168624bde4e48111` |
| `client/src/concept2cure/v2/surfaces/Vault.tsx` | `b0cfd0a045b9cc644910d7477e190fed00932e5c147e06520daea24090825d89` |
| `server/routes/vault-ingest.ts` | `9f8e4cf8e31582692c980b3b4a7e30f12a2a60e2bbb65a25bddbebaa63d4eae3` |
| `server/services/vault/vault-ingest.service.ts` | `1929d3425df21becf45023427f9063fefa5518ecec5b2db4352448ab966dd3fe` |
| `server/services/vault/vault-reupload.ts` | `e366f3ab5ee389a1dd19281306f9cebeb0b226a6759d55610a5dc96381a14489` |
| `shared/constants/domain/vault-document-code.ts` | `4d3a659af585ed41b428d8f5b8ef0eb47dd698c72a1d19e845b122780e288eb5` |
