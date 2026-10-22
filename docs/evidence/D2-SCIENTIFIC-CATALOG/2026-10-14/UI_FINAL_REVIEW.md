# Catalog HTTP and panel contract review

14 October 2026. Local canonical `concept2cure-v2`; no production code edits in this review. The reviewer implemented the panel earlier, so this is an owner contract check of the panel and a cross-owner review of HTTP/governance alignment, not an independent assessment of the panel's implementation.

## Review status

Complete for the reviewed HTTP/panel/DTO boundary. The interim static review found `readCatalogRecord` filtering the owned program without filtering the document's own `organization_id`. A mismatched historical document must be refused, rather than returned with `SOURCE_IDENTITY_UNVERIFIED` while exposing its description/key data. The governance owner corrected the read with both the exact SQL ownership predicate and a post-result ownership refusal. A negative test exercises the refusal; final assembled checks passed below.

## Contract checked

| Boundary | Reviewed behavior |
| --- | --- |
| Read DTO | `extractedTextSha256: string \| null`, shared `checkScope` identifying legacy value presence/context not recorded/scientific qualification unassessed, and `currentUse` identifying eligibility/reason/original availability. These are separate from the retained catalog state and attribution. |
| Read actor | The HTTP GET forwards `governedActorId(req)`. Request body identity does not select an actor. |
| Review request | The panel sends `expectedExtractedTextSha256` when the read DTO supplies an extraction digest. HTTP confirm/correct forward that exact field alongside shown byte hash/revision and session actor. |
| Malformed binding | HTTP refuses a supplied nonstring extraction digest (number, null, object or boolean) before the governance service; it does not silently omit it and downgrade the review to a legacy request. |
| Legacy view | An absent extraction digest is omitted from the body. The panel describes the legacy check's coverage; it does not assert a historic automatic pass or recorded label/context check. Existing human names, dates, reason and AnA/model attribution remain visible. |
| Current source use | Withdrawal, supersession, missing original, changed version, unavailable extraction and unverified identity use safe product wording. Current ineligibility does not rewrite the earlier human decision. Confirm/correct controls are withheld for an unavailable source. |
| Decision receipts | A failure envelope is refused even with HTTP 200. Missing or nonmatching recorded-state receipts produce an unknown-outcome notice and do not call the saved callback. |
| Read/error outcome | HTTP read errors retain a failure envelope/status; panel read failures display an error rather than a no-description state. Changed-text refusals display the refusal without claiming a recorded confirmation. |

## Executed checks

Supported Node 22 executable: `/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node`.

The existing panel suite and lead's HTTP boundary suite passed together: **24/24 tests across two files**, exit 0 (14 October, 06:23 UTC). The HTTP suite mocks the governance service and database; the panel suite supplies API responses. They verify boundary behavior, not end-to-end SQL authority, database concurrency, deployed RLS, provider behavior or scientific qualification. Import-time development audit/RLS notices were present; no audit-chain or deployment qualification is claimed.

Panel suite: `client/src/concept2cure/v2/__tests__/vaultCatalogRecord.test.tsx` (15 tests). HTTP suite: `server/routes/c2c/__tests__/vault-catalog-source-review.test.ts` (9 tests).

The panel's final ownership checks passed: ESLint with no warnings, `git diff --check`, and selected-scope TypeScript for its two roots with repository compiler options/ambient declarations (512 loaded sources, zero selected diagnostics). This is not a whole-repository TypeScript pass.

A later interim run included governance while that owner was splitting helpers. UI/HTTP still passed 24 tests, but governance could not transform an in-progress helper line. It is not counted as a final governance result; the owner was notified. Final assembled review will supersede this interim result without describing it as a pass.

## Final assembled disposition

The final assembled run at 06:28 UTC passed **48/48 tests across three files**, exit 0: the 15 panel cases, 9 HTTP cases and 24 governance integrity cases. It includes the added foreign-document ownership refusal, historical human decision preserved after withdrawal, changed extraction review refusal and zero-row persistence refusals. Governance tests mock SQL orchestration and project admission; this run does not qualify genuine PostgreSQL concurrency or deployed RLS.

The read DTO matches the panel's fields and the HTTP writer's exact body key. `keep_data` retains a distinct meaning: current extracted data may remain eligible while `originalFileAvailable` is false and `reasonCode` is `SOURCE_ORIGINAL_UNAVAILABLE`; `canWrite` is false. Static inspection confirms the panel displays the missing-original caveat and withholds review actions based on original availability separately from data eligibility. The review adds no fact-acceptance control, acceptance badge or retrospective extraction/context pass.

The canonical human review audit records `extractionBindingShown` from whether the expected digest was supplied. A legacy caller without it retains whole-record review semantics and does not gain a claim that the shown extraction was bound. Panel no-digest compatibility is covered by its existing confirmation-body test; the audit distinction was statically inspected.

No remaining blocker was found in this reviewed boundary. Broader scientific engine, concurrency, database role and deployment qualification are owned by their separate evidence streams.

Reviewed source SHA-256 snapshot (06:29 UTC):

```text
4e333751f5d24ea064b03f541357adf09852a2ceb9e58876524f3c9f1a160eed  server/services/vault/document-catalog-governance.service.ts
0022f748129fa42a43c3a193cf5fae16d23bd9ad2f6e72eaae489119cde8b360  server/services/vault/document-catalog-admission.ts
3c7917a963b62efd324d6fc0e177d06283bec8bbd3ddcb7600128245963ae804  server/services/vault/document-catalog-write-integrity.ts
4ebc59c956ee0dcedad7058d6524011071597d62ff50bc217420187f3ab2c1c7  server/routes/c2c/project-vault.ts
3dc6538f6701b5e8b03a7709023c31c0178fa76d17ab0a7df2ab814deb14a179  client/src/concept2cure/v2/surfaces/VaultCatalogRecord.tsx
4f9abe1f41125687461e6000504ca8ed3bfeb26b1a95cde638690e3867f683ce  client/src/concept2cure/v2/__tests__/vaultCatalogRecord.test.tsx
fdfafc99d2ff9b4379157e10d3c4d8a837da422471f54616e0557b17a2977aea  server/routes/c2c/__tests__/vault-catalog-source-review.test.ts
eb5cae55d12ad351a60aae520353baaaca293a6419216ea6bfaf05f46b86d0d0  server/services/vault/__tests__/catalog-governance-integrity.test.ts
c44820c058d5258007233cfa72ffeded0c89883cc61dc398983edd58e4024a06  shared/ana/catalog-facts.ts
```

Reproduction: run the three suites above with supported Node 22 and `node_modules/vitest/vitest.mjs run --config vitest.config.ts`. Later implementation changes require the lead's final assembled source/check snapshot; these hashes identify this review only.
