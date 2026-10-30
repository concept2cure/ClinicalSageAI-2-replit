# Independent convergence contract review

D2 / W2, 2026-10-30. Review only; no production/test changes, runners, Git mutations or publication performed by this reviewer.

## What already exists

The refreshed inventory in `docs/design/VAULT_UPLOAD_RECEIPTS_2026-10-30.md` and this packet's README was read before review. Canonical commit `1ce6adc681c984f1669715d37fda774f11203059` already supplies `v2/vaultIngestReceipt.ts`, the sole committed receipt parser; the hook calls it and the plural `vaultUploadReceipts.test.tsx` owns its focused client regressions. The existing shared XHR fake has an explicit producer-shaped receipt helper. The route/service retain admission, storage, audit and response construction. The local unpushed private parser is an overlap to remove, not another owner to retain.

`rg -n 'newVersions|VaultUploadOutcome' client/src --glob '!**/__tests__/**'` found the public outcome declaration, internal mapping and internal outcome copy only, all in `useVaultUpload.ts`. No separate production renderer consumes `newVersions.title`. The earlier deleted-history inventory is retained in the refreshed design. No new capability or engine is required.

## Verdict: approved bounded contract

1. Converge exactly onto the canonical parser and canonical hook semantics. Preserve UUID case normalization; original-upload filename/code binding; replacement-ID inequality; HTTP200/reupload and HTTP201/no-reupload coherence; contradictory-error rejection; unique unequal typed reupload rows; explicit server OUTCOME_UNKNOWN handling; and unchanged versus repaired reupload outcomes, row flags and history guidance.
2. Preserve actual producer compatibility. The response constructor returns `doc.document_title`; it can be null in a legacy persisted record. It returns explicit placement, and Unfiled can retain a stale folder ID. The parser accepts these; the hook correctly suppresses folder presentation for explicit Unfiled. The prior local requirement for nonblank title and null folder on Unfiled was overly strict and must not survive conflict resolution.
3. Correct only the check-in title mapping: return the validated receipt `documentTitle` in the private successful upload result, expose the actual value as `newVersions[].title: string | null`, and render that stored title instead of `opts.newVersionOf.title`. Preserve the exact stored null/blank value in the outcome; use a neutral phrase such as "the recorded document" only when generating copy for null or whitespace-only titles. Do not invent a filename title, display a quoted null, or write back a title.
4. Keep request behavior unchanged. The existing check-in request may still send the selected title. The returned stored title is the authority for confirmation copy, including when it differs from that request. Assigned version, returned ID, filing, extraction, auth, multipart fields, transport, no-auto-retry behavior and server governance stay intact.
5. Consolidate overlapping hook tests into the already canonical plural suite and remove the redundant singular suite after migrating its genuinely unique controls. Keep actual Vault and device drawer tests, completing only legitimate positive fixtures with the explicit expected request code. Never auto-repair malformed responses in the fake.

## Required regression meaning

- Sharpen the canonical valid new-version test so request title "Original" and receipt title "Receipt" differ, then expect the actual receipt title in both outcome and confirmation note. Observe this failure against unchanged canonical production before applying the hook mapping fix.
- Add null, empty and whitespace-only title controls proving the outcome retains its exact stored value while confirmation copy uses neutral recorded-document wording without the stale request title. These are response-constructor compatibility controls, not claims of native legacy execution.
- Preserve canonical distinct replacement ID, retained code, assigned version and pending-text assertions. Keep existing valid unchanged/repaired reupload and explicit OUTCOME_UNKNOWN tests and semantics.
- Retain the local suite's unique actual raw empty/HTML/truncated JSON controls at the real XHR/transport seam. The canonical fake's json-throw case serializes null and does not establish actual JSON decoding failure.
- Retain actual Vault/device caller checks proving invalid receipts do not open an unverified record, refresh as confirmed, dismiss a check-in offer or create a local attachment, while later valid files continue in order without automatic retries.
- Re-run current merged client/server regressions, build, zero-error TypeScript and every normal publication hook. Historic candidate counts and gates remain distinct from the final merged-state result.

## Merge and evidence pitfalls

Choosing the local hook wholesale would drop several already canonical protections. Choosing the local staging wholesale would discard the useful known-unchanged versus repaired distinction. Choosing the old local positive fixtures wholesale would omit request code binding and lose explicit canonical helpers. Resolve these paths to the canonical owners first, then apply only the stored-title correction and unique controls.

The canonical native suite proved actual created, unchanged-reupload and check-in responses. A direct legacy-fixture update was refused by the real database guard; the canonical packet explicitly limits nullable-title/retained-Unfiled-folder/repaired-record proof to constructor review and unit vectors. Preserve that precise distinction. No guard or permission should change to manufacture stronger evidence.

The previous local candidate's broad implementation, fixture and test-count assertions are historical after convergence. Update final wording so it does not claim the merged code uses the discarded private parser or blanket neutral reupload copy. This review is a contract approval, not final code verification or launch acceptance.

## Inspected canonical source pins

All pins refer to exact commit `1ce6adc681c984f1669715d37fda774f11203059`, not a moving ref.

| Path | SHA-256 |
| --- | --- |
| `client/src/concept2cure/v2/vaultIngestReceipt.ts` | `83af6a73aebfa765329bcd5d8d4b979c2a60502998dd357e7967e9fd915de00a` |
| `client/src/concept2cure/v2/useVaultUpload.ts` | `e23599ab93b0907d33e6a5d26d376cfa1f96604c07e45f8ef0dd842837d1f873` |
| `client/src/concept2cure/v2/surfaces/VaultUploadStaging.tsx` | `a211037fea3140527a5501b0defe6469add550754302a117fa8f70203afd42ad` |
| `client/src/concept2cure/v2/__tests__/vaultUploadReceipts.test.tsx` | `3192f4362a660d142403b0a40e265dd65e10387bdc3722983739ecfa48706c0f` |
| `client/src/concept2cure/v2/__tests__/_ingest-xhr-fake.ts` | `d7c582159a4a99871d4ca8f823fa2410341dfcc24576ee084e8b15f41700d7ff` |
| `server/services/vault/vault-ingest.service.ts` | `1929d3425df21becf45023427f9063fefa5518ecec5b2db4352448ab966dd3fe` |
| `server/services/vault/vault-reupload.ts` | `e366f3ab5ee389a1dd19281306f9cebeb0b226a6759d55610a5dc96381a14489` |
| `docs/evidence/D2/2026-10-30-vault-upload-receipts/README.md` | `ae71b3dc0d6ba1c0d00a98fa57abb86f6bc1e908c739ee35bee0333a12c4bb8a` |
