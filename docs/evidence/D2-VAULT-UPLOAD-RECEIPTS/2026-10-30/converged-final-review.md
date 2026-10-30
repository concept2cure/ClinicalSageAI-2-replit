# Independent final convergence review

D2 / W2, 2026-10-30. Static source and evidence review only. This reviewer did not modify production/tests, run qualification, mutate Git or publish.

## What already exists

The refreshed design/README inventory, `convergence-contract-review.md`, `convergence-producer-review.md`, `convergence-fixture-review.md`, `convergence-caller-note.md` and `consolidation-test-note.md` were read. The canonical sole receipt parser is `client/src/concept2cure/v2/vaultIngestReceipt.ts`; the shared hook, XHR transport, existing upload surfaces and server admission remain their retained owners. The overlapping private hook parser and singular receipt test have been removed in favor of those owners. No new capability or engine is introduced.

## Verdict: source review approved

Against exact canonical `0ad3a15ceed158232dfb1cb18e543820027c0488` (including the intervening `1ce6adc681c984f1669715d37fda774f11203059` upload receipt implementation), the only production client source difference is the approved `useVaultUpload.ts` correction:

- The successful private result carries the validated receipt title, and `newVersions.title` preserves that exact string or null rather than the selected request title.
- Confirmation copy displays the returned stored title when nonblank and says "the recorded document" for null/blank without inventing a title. The outcome itself retains the original null/blank value.
- The existing reupload documentation now accurately describes `updated` repairs. Runtime reupload behavior and updated/recordUpdated flags remain canonical.

The parser, staging surface, XHR transport, shared explicit fixture helper, Vault caller, device pathway caller, ingest route/service, reupload helper and native reupload test are byte-identical to the reviewed canonical versions. Whole `server`, `shared` and `scripts` diffs against that canonical base are empty. The incoming study/project source, two styles and three affected tests are also byte-identical to that base. No CSR production safeguard is replaced or altered. The local f76 candidate's private validator and broad neutral reupload copy have been superseded rather than retained beside canonical logic.

This preserves filename-code/project identity binding, normalized UUID identity, distinct replacement IDs, actual status/envelope coherence, contradictory-error rejection, unique unequal typed reupload rows, explicit server OUTCOME_UNKNOWN handling, null-title/retained-Unfiled-folder compatibility, truthful unchanged versus repaired history guidance, and no automatic retry. No request shape, authentication, server authority, audit, dependency, schema, baseline or permission changed.

## Test consolidation and meaningful proof

The plural `vaultUploadReceipts.test.tsx` retains all 44 canonical malformed vectors and eight standalone controls, strengthens the stored-title/version check-in control, adds eight unique malformed vectors, and migrates the unique raw-JSON/batch/compatibility/guidance/check-in controls. Static count remains 74. The singular overlapping file is absent. The last lint-only describe split groups the same cases under callbacks below the existing size threshold; its note records the pre-grouping and final input hashes and reports exact body equivalence. I reviewed the final grouping and assertions; no control is suppressed or relaxed.

The actual five Vault caller cases and three device drawer cases continue through the real hook/transport. They preserve exact File identity, selected project/code, saved identity, no false refresh/open, editable unknown rows, retained check-in offer, deliberate retry, mixed unique-filename outcomes and server-owned activity assertions. The isolated missing-ID cases now omit only ID from otherwise complete producer-shaped fixtures, and the existing navigation case explicitly checks no false refresh. None of these tests fabricate a successful hook result.

`converged-title-red.txt` records the intended four stored-title/null/blank failures against unchanged canonical production and 78 passing controls across the three suites. The first converged run records 311 checks/27 suites and a passing production build on its original frozen input. The subsequent wrapper-only regrouping and incoming study merge have a new frozen input, so those earlier counts are not final merged-state qualification. Root owns the current 30-suite regression/build/lint and normal publication gates; their actual final outcomes must be recorded separately before claiming final qualification or publication.

All 39 paths in `final-merged-inputs.json` match the reviewed working files. `converged-final-pins.json` separately records the 46 reviewed source/test SHA-256 pins, canonical comparison hashes and changed reviewed paths. The hook, parser and actual caller input hashes remain unchanged from the root's declared final freeze.

## Evidence boundaries and residual needs

The earlier private-parser candidate contracts, broad copy descriptions and 225/279-case counts in this packet are historical. They do not describe the final converged implementation and must remain explicitly superseded by the convergence record.

A deliberately divergent receipt title is a consumer response-authority control. The ordinary current HTTP201 check-in INSERT normally persists the submitted title; no native title/request divergence or null-title HTTP201 check-in was demonstrated. Canonical native proof covers actual create, unchanged reupload and check-in receipts. The real database guard refused a direct manufactured legacy setup; nullable-title, retained-Unfiled-folder and repaired-record compatibility remains constructor-reviewed plus unit-vector proof. This change does not claim native legacy repair, guard bypass, deployed acceptance, formal OQ, live signatures or agency submission readiness.

The source-traced device attachment filename-Set ambiguity for mixed equal filenames and the separate direct eTMF ingest path remain outside this bounded correction. Neither is fixed or qualified by the unique-filename caller tests here. No blocking source-review issue was found in the approved correction; final runner and publication results remain the control tower's responsibility.
