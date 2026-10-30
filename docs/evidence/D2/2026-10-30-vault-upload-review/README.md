# Complete the Vault upload review fixes (D2, 2026-10-30)

## What already exists

- `client/src/concept2cure/v2/useVaultUpload.ts` is the canonical ingest hook, used by the Vault and retained upload consumers. It sends each file sequentially and reports stored or refused rows and a batch note. Its transport catch incorrectly asserts no filing occurred even after every byte was sent.
- `client/src/concept2cure/v2/vaultIngestTransport.ts` owns XMLHttpRequest and progress. It currently discards whether the complete body was sent when no reply arrives.
- `client/src/concept2cure/v2/surfaces/Vault.tsx` owns the staged list and selection for each upload attempt. It previously retained selected rows' prior refusal statuses as a retry began.
- `client/src/concept2cure/v2/surfaces/VaultUploadStaging.tsx` owns staged fields, statuses, progress, retry controls and the batch live announcement. A refused row queued for retry retains refusal wording until its turn starts.
- `client/src/concept2cure/v2/surfaces/vaultUploadManifest.ts` owns CSV parsing, validation, matching, patches, summaries and export. A File-only line currently counts an empty patch as applied; output has no UTF-8 BOM and summaries list every issue without a bound.
- `client/src/concept2cure/v2/surfaces/VaultUploadManifestControls.tsx` owns browser FileReader, download and applying patches. It checks busy only before reading, retains a prior note during uploads and mounts live regions only with content.
- Existing tests are `useVaultUpload.test.tsx`, `vaultUploadStaging.test.tsx`, `vaultUploadManifest.test.ts` and `vaultUploadManifestPanel.test.tsx` under `client/src/concept2cure/v2/__tests__`.
- Searches covered upload/Upload, manifest, transport, statuses, unknown outcomes, routes and consumers. `git log --all --diff-filter=D -- 'client/**/*Upload*' 'client/**/*upload*'` found historical removed legacy upload surfaces, not another retained canonical implementation. The progress and manifest implementations from the handoff are already on origin (`0bf201133`, `26bd6cacc`); the later fixes are absent.

## Design

Extend these owners: preserve complete-send uncertainty through transport and hook as an unknown refused outcome, and distinguish it in row/batch copy. Retrying stays explicit and byte-identical ingest is governed by the existing server idempotency contract. The existing Vault upload-attempt owner clears only selected pending rows' old statuses before calling the hook, so queued retries read as waiting; fresh refusals and unknown results from the current attempt remain visible immediately, including while the next file uploads. Refuse empty manifest patches, state actual applied counts with the manifest filename, bound issue lists, and export a UTF-8 BOM. After FileReader returns, require the current panel to remain idle before applying fields. Keep status/alert regions mounted and clear prior notes as an upload begins. No new surface, dependency or server write path.

## Verification

- `01-red.txt`: all nine new controls fail against the original product source at `47ce1d3d9`: complete-send uncertainty with/without progress reporting, queued retry wording/colour, File-only no-op, actual count/CSV filename, bounded issue lists, BOM, delayed reader while uploading, and persistent regions/clear-on-upload.
- `02-green.txt`: all **51 tests across five focused files pass**, including eleven added controls and the existing hook, staging, manifest and manifest-panel suites. Existing expectations now follow the chosen CSV filename and UTF-8 BOM; the previous dropped-connection test explicitly stops at a partial send.
- Independent review caught an overbroad first correction that hid a fresh failure as waiting while the next file uploaded. The old direct-prop retry check was replaced with actual Vault integration cases: two prior failures then a queued retry, and fresh refusal/unknown results while the next file is held. The fresh-refusal test was observed failing before correction; final tests cover both failure kinds.
- Direct ESLint on the six source owners and new/updated staging tests reports **zero errors**. Existing warning sites remain in `Vault.tsx` and `useVaultUpload.ts`; no new warning site was added. Root runs the warning ratchet, compiler, broader tests and release gates separately.
- HTTP and XMLHttpRequest replies in UI tests are synthetic; no hosted authenticated journey is claimed. The FileReader race uses the real reader to obtain content and holds only its completion callback. Unknown writes are never retried automatically or counted as confirmed receipts.

## Result

A complete send without a reply says **not known whether recorded** and tells the person to reload the Vault and check. A refusal queued for retry says it is waiting while another file is sent. Manifest application never calls an empty patch applied; it names the chosen CSV, reports the actual count and bounds displayed details to ten per list while retaining totals. Downloads carry the UTF-8 BOM. Delayed reads consult current rows/folders and refuse mutation during an upload; announcements remain mounted and prior notes clear when uploading starts.


## Adjacent follow-up

`useVaultUpload` already treats an HTTP 2xx with missing/malformed JSON as a success without adding a document ID. That pre-existing receipt-validation gap is separate from this no-reply recovery slice and remains open; this evidence does not claim complete governed ingest-receipt validation.

## Browser verification

`browser-check.json` records 24 component-browser checks at 1440px and 390px in light/dark themes: permanent live regions, no-op CSV refusal, actual applied summary and selected filename, UTF-8 BOM download, distinct busy unknown/active/waiting rows, and distinct settled unknown/refused outcomes. Eight screenshots are included. Actual staging/manifest code and canonical CSS run with synthetic files/status props; this is not a hosted authenticated journey. No page errors or horizontal overflow were observed.
