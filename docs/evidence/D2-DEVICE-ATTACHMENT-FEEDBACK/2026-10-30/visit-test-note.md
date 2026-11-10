# Device upload visit-ownership controls

Test-only authoring, D2 / W2, 2026-10-30. The completed discovery inventory and approved candidate contract in `docs/design/DEVICE_ATTACHMENT_FEEDBACK_2026-10-30.md` were read before authoring. The existing drawer, shared upload hook/XHR seam, receipt parser, store, canonical account guards and shell-project channel remain the owners under test. No duplicate uploader or ownership implementation is introduced.

## Initial frozen test input (before helper correction)

`client/src/concept2cure/mdx/surfaces/__tests__/DossierDrawer.uploadOwnership.test.tsx` contains **12 cases**, in 256 lines. SHA-256:

`4baca06c346e893de5d4d7e5ce9252b996aa3652e9d92216ede3fa6723892f2f`

No production source, existing test suite, fixture helper or other evidence file was edited by this worker. No tests, lint, build, compiler or Git mutation was run. Red/green execution, input snapshots and publication belong to the control tower; the expected failures below are not claimed observed results.

## Meaning of the controls

The suite renders the actual `DossierDrawer` inside the actual `AuthProvider` and a `QueryClientProvider`. `authService.setToken`, its revision guards, the real shell publish channel, the shared hook, `sendIngest`, receipt validation and the local dossier store run unchanged. Only the HTTP/XHR replies are explicit synthetic fixtures. A genuine multipart request is held before its reply, then released after the drawer owner changes.

The ten negative cases cover:

- Replacing section identity, backend document, program (with its shell project) or pathway: four cases.
- Section label A → B → A, retaining the same section id, so label/path retirement cannot be omitted.
- Batched shell A → B → A while drawer props remain unchanged, so equality of the final project id cannot revive an earlier visit.
- Different-actor and same-actor replacement sessions. Both call the real `setToken`, and assert that the captured session revision is retired.
- Closing/reopening the same section and whole drawer unmount/remount: two cases.

For each case, new store hydration deliberately replaces the same pathway location where relevant. After the old reply finishes, both the original section and the replacement section are checked for no late attachment publication; the displayed rows and accessible status/alert messages must also contain no old file result or busy state. The fresh view's input must not remain disabled by the retired request. These controls therefore exercise the actual stale local-write defect on the baseline, rather than failing solely because the new feedback UI is absent.

Every request is checked for one POST, the exact original `File`, original program/code, original bearer and organization header. No automatic retry or new write under the replacement owner is inferred. The fixture permits the already-started request to finish in its original upload path; no cancellation or rollback is claimed.

The two positive cases retain a current visit's valid HTTP 201 response and a valid HTTP 200 unchanged reupload across an ordinary bearer refresh. The refresh case uses **the real `authService.refreshToken()`**, with an explicit synthetic `/api/v1/auth/refresh` reply. It proves the old session guard still has `sameRevision() === true`, its old bearer has `credentialsCurrent() === false`, and the account object remains identical. `setToken` is intentionally not used to simulate refresh, since it always replaces the session revision.

## Qualification boundary

The baseline is expected to fail the ten stale-publication controls and retain the two current-visit positives; only the root runner may establish those counts. No live hosted login, native database/storage admission, actual browser timing, signed OQ, durable dossier association or agency acceptance is established by these component/XHR fixtures. Busy/keyboard/refusal-copy and same-visit tab-preservation checks belong to the separate feedback suite, and the previous 17 attachment-identity controls remain untouched.

## Approved helper synchronization correction

The root's first diagnostic run failed all 12 cases before any XHR: `start` clicked the Attachments tab and queried its file input inside one outer asynchronous act, before React committed the tab. That run and its original input hash remain retained by the control tower; it is not product-red evidence.

The approved correction obtains the input through `showAttachments()` before entering the asynchronous upload act, then fires the change against that committed input and awaits the same original XHR gate. Every other `showAttachments()` call already occurs outside an outer asynchronous act, after its relevant owner transition has completed. No case, assertion, account/project guard, original File check or revision behavior changed.

The corrected frozen suite has **12 cases in 257 lines**, SHA-256 `3b061636b4f21f55c9b5d14720e05d1b28a52147375cf55c2d1718e9ce1397ed`. Root must rerun unchanged production before implementation; this worker ran no tests, lint, build, compiler or Git mutation.

## Approved lint-only type annotation correction

After root observed all 43 focused cases passing across four suites (including these 12 ownership cases), explicit lint reported `RequestInfo` as an undefined identifier in this normally ignored MDX test. The fetch fixture parameter annotation now uses `Parameters<typeof fetch>[0]`, preserving the canonical fetch input type without a lint suppression. No emitted runtime code, cases, assertions, guard behavior or fixtures changed. Root retains the earlier green log/input hashes and will pin the final file for full regression.

The final frozen suite remains **12 cases in 257 lines**, SHA-256 `6ac2a06be7ed8d5e71ea6c66be0177e2da241fceaaec5d8735141bb962463fbc`. This worker ran no runner, compiler, Git operation or production edit.
