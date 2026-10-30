# Actual input attachment identity controls

D2 / W2. Test-only contribution to the existing `client/src/concept2cure/mdx/surfaces/__tests__/DossierDrawer.uploadReceipt.test.tsx` owner. Read the root inventory and repository instructions before editing. No production, hook API, receipt parser, transport, store, dependency, Git or qualification commands were changed/run by this worker.

## What already exists

The retained suite already renders the actual DossierDrawer with QueryClientProvider, uses the shared useVaultUpload hook, real multipart/XHR transport and receipt parser, and reads the actual DossierStore. The original three cases prove malformed-success refusal, a complete valid receipt and partial success with unique filenames. Their tests, helpers and assertions remain unchanged. The new controls extend that same owner rather than introducing a mocked successful hook or a parallel upload path.

## Added cases and assertions

The suite now has 14 cases: the original three plus 11 additions. A separate worker owns drop-path cases, including a repeated identical File object, so that proof is not duplicated here.

- Eight table cases cover equal filenames with one confirmed index and one different-size sibling, in both orders, for four response paths: HTTP409 VERSION_CONTENT_CONFLICT; malformed HTTP201 with no document; explicit HTTP503 OUTCOME_UNKNOWN; and a lost reply after the existing fake has reported all upload bytes sent. The last path throws only at the transport seam, allowing the real IngestUnconfirmedError behavior to run. Each case expects exactly the confirmed selection's size and one local attachment/visible row.
- A none-confirmed control combines a known409 refusal and malformed201 for equal filenames. It expects an empty actual store and empty attachment UI.
- An all-confirmed control uses two distinct File objects with identical bytes, a valid201 create followed by a valid200 unchanged receipt, the same returned document ID and coherent reupload metadata. It preserves two confirmed selection outcomes without inventing two fresh same-code records.
- The selection-lifetime control delays the actual XHR reply after the original File has entered FormData. It replaces the array-backed input FileList seam with a same-name, different-size File, then releases the original receipt. The store must retain the original sent file's metadata. This is a controlled live-selection model at the existing jsdom seam, not a native-browser FileList execution claim.

All additions assert actual POST count/order, exact original File references in multipart bodies, project and document code, bearer and organization headers, credentials, no manually supplied multipart Content-Type and no extra retry. Store/visible row assertions are followed by the existing actual Activity-tab check proving no client-authored attachment event. The original hook, parser and local store remain real throughout; only server replies are synthetic.

## Frozen input and producer-compatible fixture correction

The initial test file was 260 lines with SHA-256 `3b18bc511c1401b51a50d95e41cb78265ee7cf701184d18f08fb1b9b177d09d2`. Root froze and ran it before any production edit. Root reported the combined input/drop red run as 11 failed and 6 passed over 17 cases; the worker did not run or independently qualify that result.

While that frozen run was executing, producer review identified one positive reply that could be made more faithful without weakening a control. If a same-code request first receives VERSION_CONTENT_CONFLICT, a later matching-byte selection addresses an already recorded document; its confirmation is HTTP200 unchanged, rather than HTTP201 fresh. Root authorized this one fixture-only correction after preserving the first log and inputs. The confirmed-first case stays201 followed by409. The failed sibling, selected Files, assertions, case count, real transport and every other reply remain unchanged.

The corrected file is 261 lines with SHA-256 `629150ec97a0ade1649d91e475d219c2ffef19606f5f6a088f967d22f2691d5a`. It introduces only a successStatus choice for that reverse409 case and supplies the existing confirmed helper's already supported200 envelope. Root will freeze/rerun this state before production changes; no green or publication result is claimed by this note.

Other malformed/unknown-versus-confirmed orderings establish client correlation under uncertain transport replies. They do not establish whether the unconfirmed request committed, nor claim native replay of those server histories. Current server admission and idempotency remain authoritative and unchanged. Broader project-session lifetime, persistent attachment linkage, native browser behavior, formal OQ and agency acceptance remain outside this test contribution.
