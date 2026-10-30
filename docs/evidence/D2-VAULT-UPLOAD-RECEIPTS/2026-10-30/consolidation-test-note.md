# Consolidated upload receipt controls

## What already exists

The canonical receipt test owner is `client/src/concept2cure/v2/__tests__/vaultUploadReceipts.test.tsx` (plural), alongside the shared `useVaultUpload.ts` and sole `vaultIngestReceipt.ts` parser. Its canonical 44 malformed vectors and eight standalone controls already establish receipt refusal, unchanged/repaired compatibility and version admission. The overlapping unpushed `vaultUploadReceipt.test.tsx` (singular) repeated much of that contract. This change extends the canonical owner and removes the overlapping singular file. It creates no parser, transport implementation or production capability.

The parent inventory and independently approved convergence contract are at the end of `docs/design/VAULT_UPLOAD_RECEIPTS_2026-10-30.md`. Actual raw-reply cases use the same existing sendIngest XHR seam. No tests, lint, build or qualification runner was executed by this worker; root owns fail-first and final qualification.

## Case mapping for the removed singular file

Each removed malformed-vector label is mapped below. Equivalent canonical vectors keep their original assertions; the consolidated table additionally checks that no stored event occurs, uploading settles, the note is an error, recovery says reload/check, and a rerender does not retry.

| Removed singular label | Retained control in plural owner |
| --- | --- |
| an array instead of a record | array body |
| success false | false success |
| success omitted | missing success |
| document ID omitted | missing document id |
| document ID is not a UUID | placeholder document id |
| program omitted | missing project |
| a different program recorded the file | another project |
| assigned version omitted | added missing assigned version |
| assigned version is blank | added blank assigned version |
| stored title omitted | added missing stored title |
| stored title is blank | Reclassified as producer-compatible legacy text; new null/empty/whitespace check-in controls retain the actual value and require generic copy. No parser narrowing. |
| filing omitted | missing filing |
| folder ID is blank | added blank folder id |
| folder label is not text or null | invalid folder label |
| placement omitted | added missing placement |
| placement is unknown | unknown placement |
| unfiled claims a folder | Reclassified as valid retained legacy folder; existing explicit Unfiled/null-title positive remains and proves no auto-filed claim. |
| placed claims no folder | confirmed placement without folder |
| review flag is not boolean | string review flag |
| unfiled claims no review needed | added unfiled without needed review |
| extraction is unknown | invalid extraction state |
| unexpected accepted status | accepted without the route status |
| 200 without reupload acknowledgement | missing reupload on HTTP200 |
| 201 contradicts a reupload marker | reupload on HTTP201 |
| a change has a nontext before value | added nontext change before value |
| differs is not an array | invalid reupload differences |
| a difference is null | invalid difference row |
| a difference has an unknown field | unknown difference field |
| a difference has no requested value | added missing requested difference value |
| unchanged contradicts an actual repair | true unchanged despite changes |

The two compatibility reclassifications follow the canonical service-constructor audit and reviewed parser contract. The canonical packet explicitly does not claim native legacy-fixture execution: its attempted setup was refused by the real record guard. No guard or parser is relaxed here.

| Removed singular remaining cases | Retained control |
| --- | --- |
| Three undecodable raw replies | Three actual RawReplyXhr empty/HTML/truncated JSON cases, preserving exact unknown outcomes, no stored status, settled uploading and one POST. The canonical fake-json rejection case is also retained. |
| Mixed missing and malformed reupload then confirmed | Dedicated three-file continuation case; malformed 200 reply deliberately retains its invalid differs row while its filename code is independently correct. Only final positive contributes a stored status/identity. |
| Four extraction/folder compatibility controls | Four real-shaped authenticated compatibility cases, retaining absent/extracted/pending/failed extraction, opaque folder, null/empty label, Unfiled and extra-field behaviors; authenticated multipart headers and no manual Content-Type remain asserted. |
| Unchanged=true/false reupload guidance | Two detail/filing-difference controls preserve truthful canonical updated/recordUpdated flags and distinguish real unchanged copy from repaired history guidance. Canonical repaired row UI test remains unchanged. |
| Actual assigned check-in version/title and request fields | Existing retained-code check-in control strengthened: response `Receipt` differs from `Earlier request title`, assigned version is `revision-7B`, outcome/note must use stored title, supersedes ID is sent and client version/code are absent. |
| Unconfirmed check-in | Missing-ID check-in exact-unknown control retained separately from canonical previous-ID replacement refusal. |

Three additional legacy-title check-in cases (null, empty and whitespace) require exact retained `newVersions.title` and generic `the recorded document` copy, without stale request title, stringified null/undefined or blank quoted name. These and the strengthened saved-title control intentionally expose the remaining mapping defect against canonical production before root changes it.

## Static accounting and input

The consolidated owner is 399 lines. It declares **74 cases**: 52 malformed vectors (44 canonical plus eight unique singular vectors), eight original standalone cases (including the strengthened check-in), three raw-JSON cases, one additional mixed batch, four compatibility cases, two reupload-guidance cases, three legacy-title check-ins and one missing-ID check-in. This is a static case inventory, not a passing result.

Only the plural test owner, deletion of its singular duplicate and this note were changed by this worker. No production, Git metadata, fixture engine, dependency, suppression or test runner changed.

SHA-256 of the plural test owner at handoff: `992d27fb409a955b4df9ab6075ffce4e627a0c7ae5e8eb4e581b1c49b12015a3`.

## Approved lint-only grouping

The first consolidated describe callback exceeded the existing max-lines-per-function warning threshold. After root's frozen run completed (root reports 311 passing checks/27 suites and a passing production build), root approved a wrapper-only regrouping into raw replies/batch recovery, compatible metadata/reupload guidance, and legacy title/check-in recovery. Each new describe callback is under 100 lines. Every assertion, case, fixture and test body is unchanged; no suppression or baseline changed. Static case inventory remains 74; the owner is now 405 lines. No runner was executed by this worker.

Final test SHA-256 after the approved grouping: `8fdb26891dde531eda566ba8660ae77268ba25f11cc4d6808f2d1eccf82570d0`. The earlier hash above identifies the input to root's preceding frozen run; root owns requalification of the grouped input.
