# Final independent device attachment identity review

D2 / W2, 2026-10-30. **Verdict: approved; no blocking source issue found.** Reviewed against exact canonical baseline `819029e2c187f2a8d5f092fd3bce836b200977e3`. This reviewer changed no production/tests, ran no test/build/compiler/lint/provider job and made no Git mutation. Root owns execution, normal compiler/publication gates and canonical acceptance.

## What already exists

The completed design/README inventory and initial contract review identify the existing owners: DossierDrawer.onAttach, shared useVaultUpload with indexed terminal statuses, sole receipt parser, sole XHR transport, local DossierStore metadata, server-owned history and the existing actual input test suite. The final source extends only that caller; it adds no second uploader, parser, correlation engine, screen, dependency, model, public hook API, server route or persistence writer. The shared hook/parser/transport/store and all other pinned producer owners remain unchanged.

## Source correctness and preserved behavior

The sole production diff is within `PathwayPanes.tsx::onAttach`. It synchronously captures `Array.from(files)`, passes that exact ordered array to the shared hook, tracks only `stored` indexes in a per-invocation Set<number>, then filters the captured array by those indexes before the existing attachment metadata write. It no longer rereads a possibly changed selection after await or borrows success by filename. Index correlation also distinguishes repeated references to one File. Different batches receive distinct snapshots and Sets.

Progress/start/refused/unknown statuses cannot insert an index. Empty or unscoped input supplies no confirmed status. The callback does not write attachment metadata early or change hook results; existing sequential requests, terminal validation, refusal/unknown behavior, server admission and no automatic retry remain owned by the shared path. Valid new HTTP201 and idempotent HTTP200 outcomes both produce stored and remain supported. The original store prepend/display policy is retained rather than introducing implicit deduplication.

The underlying store and server-history path are unchanged, so no browser-authored audit event, synthetic governing actor or new persisted attachment relation is introduced. No server/shared/scripts/other runtime source path changed. The new drop test is a test owner only and uses the existing positive receipt helper; it does not create another production seam.

## Fail-first and actual-caller controls

The corrected `red-final.txt` shows **11 failed / 6 passed, 17 cases** against the unchanged original onAttach source. Its production hash matches the baseline, and both final red test hashes match the current qualified tests. Failures correspond to eight input same-name mixed outcomes, two mixed drop outcomes (including a repeated File object), and the controlled selection replacement. The no-confirmation, valid all-confirmed and original unique-name positive/negative controls remain meaningful passing controls.

The reverse VERSION_CONTENT_CONFLICT ordering now uses a valid HTTP200 unchanged confirmation, reflecting an already recorded matching-byte document. The first frozen log is retained; the corrected producer fixture was rerun before production changes. It changes no assertion, selected File or case count. Other malformed/uncertain transport vectors establish client correlation under uncertainty; they do not claim to reconstruct a native server commit history.

The existing input test file retains the entire original baseline file as a byte-identical prefix, preserving its first three tests/helpers/assertions. It now has 14 cases; the complementary drop suite adds 3. Actual drawer/hook/XHR/parser/store paths remain real. Assertions include precise posted File references/order, independent size/row counts, original project/code, auth/credentials and multipart boundary ownership, one POST per selection, positive valid 201/200 behavior, and no locally manufactured Activity rows. Drop controls also assert prevented browser default behavior.

The input lifetime vector deliberately replaces an array-backed FileList seam while the actual request is pending; it proves use of the captured original rather than the replacement. This is a controlled jsdom selection model, **not native-browser FileList liveness qualification**. Similarly, synthetic DataTransfer files drive the actual drop handler and default prevention; they do not qualify browser-native drag/drop infrastructure or a hosted authenticated session.

## Observed root qualification and frozen-source verification

The root-owned `regression.txt` records **171 passed / 13 suites**, and `build.txt` records successful client, server and audit-verifier output. Explicit no-ignore lint records **zero errors and seven existing PathwayPanes warnings**, matching baseline warning count/rules/severity; both changed tests have zero warnings. No suppression, ignore or baseline change is present. These observations are review of retained runner outputs, not independent repeated execution by this reviewer.

All **20 qualification input hashes** currently match. Of the 13 initial critical baseline pins, exactly the approved production caller and extended input test changed; the other 11 remain exact. The additional drop test is the only new source/test path. `final-review-pins.json` records these checks and all **26 reviewed current source hashes**. Source freeze/recheck, whole-project zero-error TypeScript, every normal hook and direct accepted remote-ref proof remain root-owned; the compiler/publication were pending at this review's timestamp.

## Explicit limits and remaining needs

This closes selected-position correlation for current input/drop batches. It does not claim durable section-to-Vault attachment linkage or reload restoration: hydration still uses attachments:[] and the local attachment type has no Vault document ID. It does not add a session token to prevent an earlier upload completion from updating a pathway/section whose in-memory store was replaced by another project/dossier. Those are source-traced concerns recorded in the contract/consumer audit, not executed failures or changes delivered here.

The drawer currently does not render `attachUpload.note`. Tests therefore establish no false local attachment/activity and no extra POST; they **do not prove visible refusal, uncertainty or reload/check guidance in this drawer**. Shared hook copy remains unchanged, but exposing it is a separate recovery-UX need. Concurrent batch shared uploading/note behavior, the separate direct eTMF receipt path, native storage/agency transmission, formal OQ and deployed acceptance are likewise not promoted by this correction.

The reviewed scope is complete and appropriate for the bounded fix. No further source or test change is requested before the normal root gates.
