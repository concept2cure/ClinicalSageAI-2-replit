# Independent review — existing official eSTAR attachment completion

Date: 2026-10-23. W1 / D2. Product branch: `concept2cure-v2`.
Final merged source head supplied by the control tower:
`4c5f2745fa95327721276b85bc8f1a63b8883152`, with the implementation pins below.

Status: bounded local qualification complete; no residual blocking defect found.
The primary Generate action's 44px source correction and the final shared
picker wrapping correction were independently reviewed. Merged automated
qualification and the refreshed post-merge built-CSS browser proof passed for
this reviewed increment. This review's behavioral conclusions remain bounded
to the attachment completion described below; human acceptance is **Not run**.
The first retained layout epoch measured the existing Generate action at
18px wide-screen / 36px narrow-screen; the attachment-only
touch gate did not include it. Root accepted the finding and added only
`minHeight: 44` to the existing action before repeating qualification.

This is an independent source/evidence review. The reviewer changed no
production or test file and ran no tests, global checks or Git commands. The
control tower owns combined qualification, normal push gates and publication.

## What already exists

The design and evidence README identify the existing official panel/export
hook, canonical version picker and program search, FDA template registry and
slot parser, attachment planner/fill, verified Vault byte reader, current actor
access, binary disposition, byte-bound lifecycle approval and export retention.
The implementation composes these paths. It adds no parallel picker, template
registry, approval engine, persistent selection store, migration or dependency.
The review read root `AGENTS.md` and `CLAUDE.md` and the bounded contract in
`docs/design/ESTAR_VAULT_ATTACHMENT_COMPLETION_2026-10-23.md`.

## Review conclusions

- The metadata catalog derives full slot identities from captured,
  checksum-verified FDA bytes. Missing, mismatched and unpinned templates
  refuse by name; an available empty catalog is not invented. Attachment POST
  independently verifies and uses the captured bytes, avoiding a later file
  reread between verification and fill.
- The existing resolver now composes current actor/program access, the exact
  organization/program/UUID, original-byte eligibility, recorded hash and
  canonical `vaultVersionNotTransmittable`. The legal target includes FDA,
  US and the actual submission type. Actual retrieved bytes are hashed and
  admission is repeated after storage. No latest-version substitution occurs.
- The route checks current write authority and selected sources before fill,
  after fill, after retention and before response delivery. A pre-retention
  withdrawal refuses before persistence. A failed checkpoint after persistence
  begins withholds the PDF and reports `OUTCOME_UNKNOWN`; retained history is
  preserved. Authored-source snapshots retain their existing substantive and
  document-class checks and are compared again at route checkpoints.
- The hook requires a one-to-one case-sensitive slot / canonical UUID / exact
  expected SHA-256 receipt, matching requested and attached counts, no
  refusals, valid receipt metadata and the canonical manifest tokens. A
  positive official flag and a PDF base64 delivery envelope are also required
  before the existing download primitive runs. Malformed or partial responses
  hold delivery. The local expected hash and extra caller source metadata do
  not enter the POST payload.
- The hook reuses the canonical uncertain-mutation policy. Typed late
  `OUTCOME_UNKNOWN`, lost responses and uncertain HTTP failures remain
  unconfirmed with recovery guidance. Definite 409/422 refusals remain distinct.
  Existing exports without attachment selections retain their prior behavior.
- Synchronous panel visit identity plus canonical session revision, captured
  account/headers, request generation and mounted checks retire late results
  before download, including A-to-B-to-A changes and the render-to-effect gap.
  The optional selection starts empty, uses the exact program-scoped picker,
  validates current/hash/UUID metadata, blocks incomplete and duplicate
  assignments and retains the existing 150-assignment request ceiling.
- Canonical `isIvdFamily` now routes CDx and IVD to the IVD template family;
  SaMD and medical-device controls retain the device family. The marketing
  attachment chooser does not appear on PreSTAR. Existing PreSTAR
  administrative/applicant-completion behavior and separate draft eCTD
  placement/lifecycle mechanisms remain distinct.
- The shared program search guard now requires boolean `current` metadata;
  the picker maps only `current === true` to a positive current-version claim.
  Existing picker CSS supplies 44px buttons and input without new tokens.
  The existing Generate action now has a 44px minimum height. The final
  picker title span can shrink and wrap long unbroken text, while its action
  retains its width. The built-CSS browser proof confirms these corrections.

The final compiler-driven change to the authored-section loader is a non-null
assertion on `input.programUuid` immediately after
`assertDeviceAttachmentAccess(input)` has rejected a missing program. It
changes TypeScript narrowing only and does not remove or change a runtime gate.

No additional blocking defect was found in the frozen backend, transport,
selection, receipt or diagnostic-family paths. This conclusion is for local
qualification of this bounded increment only.

## Evidence inspected

- `backend-qualification.json` and `backend-green-final.json`: 79 passed,
  zero failed across real-template catalog checks, an actual mounted router,
  real PGlite canonical access/lifecycle/disposition SQL and the existing
  planner. Storage/producer/retention/consequence seams are explicit. The
  mounted route covers truthful delivery metadata, withdrawal during fill,
  manager-to-viewer change during retention, and verified-catalog-to-unpinned
  POST refusal. The SQL fixture covers missing/inactive/private actors,
  missing/unapproved/superseded/retired versions, approval/hash mismatch,
  access/approval changes after byte retrieval, both disposition choices,
  altered bytes/recorded hash and legal target mismatch.
- `ui/red-cdx.*` / `ui/green-cdx.*`: five expected CDx failures before the
  family correction; 79 passing mounted/render cases afterward. The mounted
  cases carry actual product identity through destination reads, the reused
  picker, official POST and displayed server receipt. Existing readiness,
  entitlement, field and PreSTAR controls remain exercised.
- `transport-uncertain-http-{red,green,eslint}.log.gz`,
  `transport-{red,manifest-red,envelope-red,green}.log.gz` and source cases
  cover malformed/missing
  receipts, exact outgoing payload, manifest/delivery metadata, stale contexts,
  session revision, synchronous parent retirement, double activation and
  uncertain HTTP outcomes. The latest inspected log reports 93 passing tests
  across three files, including canonical mutation-outcome tests; its RED
  has five failures / 44 passes. The earlier overlapping GREEN has 102 passes.
- `picker-green-tests.json`: eight passing cases, including four malformed
  current-version metadata cases. The shared find fixture was corrected to
  provide its real boolean metadata contract.
- `ui/layout-initial/component-browser-review.json`: twelve serialized mounted
  DOM layouts, light/dark at 390px/1440px, with no horizontal overflow. It
  truthfully retains four picker touch failures and exposed the primary
  Generate sizing issue. It is an initial epoch, not final geometry evidence.
- `ui/layout-after-touch-change/component-browser-review.json`: retains four
  long-title internal picker overflow failures after touch sizing. The bounded
  follow-up CSS changes only the existing picker title's flex shrinking/text
  wrapping and the action's non-shrinking width.
- `ui/layout-final/component-browser-review.json`: twelve passing layouts
  (picker/selected/receipt, light/dark, 390px/1440px). Every measured control
  and Generate action is at least 44px high; every tested action is reachable;
  page, panel and text/container overflow checks pass. The reviewer inspected
  the numeric report and narrow dark picker/light receipt screenshots. This
  report's SHA-256 is
  `73f6a1a0e51cdadad46f342815d410996144b36cb17ab3a3775d15c9a9d17ebb`.
  This refreshed report identifies merged head `4c5f2745fa95327721276b85bc8f1a63b8883152`
  and post-merge built CSS. Its actual mounted DOM capture preserves selected
  options/input values, awaits the settled Search action, and restores natural
  inner scroll position after hit testing.

These are overlapping qualification epochs and are not added together. The
reviewer also inspected root's final `qualification-regressions-tests.json`
(1062 passed, zero failed/pending/TODO, 64 files), `qualification-checks.json`
(all 21 checks passed, including 16 repository gates), forced lint
(zero errors, 24 existing warnings), the
passing warning ratchet, production build and compiler (zero TypeScript
errors). Their receipts show matching source freezes before and after each
command. The separate `initial-qualification/` retains the earlier compiler
failure rather than replacing it with a claimed success. The final merged
qualification covers the wrapping correction and incoming integration on one
stable source set; refreshed browser geometry uses that build. Normal
commit/push hooks and publication remain root's responsibility.

## Limits

Checkpoint revalidation is not atomic serialization of arbitrary concurrent
native PostgreSQL writers. PGlite with deterministic asynchronous seams does
not prove that broader concurrency property. A withheld late delivery can leave
a retained historical output or recorded consequence for human review; this
review does not claim rollback or automatic recovery. PDF signature/envelope
checks are not complete PDF or native Acrobat qualification. Serialized DOM
and controlled-response fixtures do not establish live-provider behavior or
human acceptance. Applicant choice/review of FDA destinations and substantive
content, native Acrobat completion, agency acceptance, deployment and complete
medical-device/diagnostic readiness are not claimed. Human acceptance remains
**Not run**.

## Exact source and fixture pins

All 23 hashes below were independently recomputed from working files and match
`qualification-source-freeze.json`'s `implementationSource` map at merged head
`4c5f2745fa95327721276b85bc8f1a63b8883152`. This includes the final Generate height,
loader-narrowing and picker-wrapping deltas. The Builder file's final pin
includes the control tower's comment-only integration; its canonical
`mutationUnconfirmed` import/re-export was rechecked.

| Path | SHA-256 |
| --- | --- |
| `client/src/concept2cure/mdx/hooks/__tests__/useEstarExport.attachments.test.ts` | `3ea4cfa7774bbbbbb443c7dfd18adcff70918b726f0fb086a0cfe4422baec9eb` |
| `client/src/concept2cure/mdx/hooks/estarAttachmentReceipt.ts` | `5dfa2a24a68f280a517620eda0fad529dd49c6b07bec64abc7c5e07946fd2299` |
| `client/src/concept2cure/mdx/hooks/useEstarExport.ts` | `4fdb9c519129772009ec74875bc4c0bb34559699525d4ea093c2f25e3c3c44b5` |
| `client/src/concept2cure/mdx/surfaces/OfficialEstarAttachments.tsx` | `551a1ad30b1eb26353e5796644c20a1900f27c95dd7bc5e919c7234dda4a090c` |
| `client/src/concept2cure/mdx/surfaces/OfficialEstarPanel.tsx` | `54df4ec621610566b47e837c3d92b7e02331857f2d5171afe701be9ffac27f9f` |
| `client/src/concept2cure/mdx/surfaces/__tests__/OfficialEstarPanel.attachments.test.tsx` | `6423a6dbb1d05d99d98065dc40e428fe274f521ea57c8fcc2ed18a54025c62a6` |
| `client/src/concept2cure/mdx/surfaces/__tests__/OfficialEstarPanel.render.test.tsx` | `bb7fa9f719e50c39abf52839a124e3cfd206a3afd6a55b579b593c308392ae0b` |
| `client/src/concept2cure/v2/__tests__/vaultSearchSelection.test.tsx` | `aa7be21b7d75d953dc6e1287103d9ec61838c02e932fa54bb5a4d059fb461943` |
| `client/src/concept2cure/v2/__tests__/vaultVersionPicker.test.tsx` | `426a70ff792f2d3995bbf5380ae89dbc600f0835a3a59295d58a6ad7d1172f9c` |
| `client/src/concept2cure/v2/mutationOutcome.ts` | `18060d64763233f38345df7e93a89ef96ea175f338c06d311faf5cec0e113f86` |
| `client/src/concept2cure/v2/styles/vault-picker.css` | `79729c51f8f46fb7b4588607db86105cbba30561aeb2b8f6f07a2f447d60a0d3` |
| `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx` | `1e1daef689d794b0db316d4001d2981c9940352e43fc8d9950e454ed87893ae9` |
| `client/src/concept2cure/v2/surfaces/VaultLibraryResults.tsx` | `590a587bf07e6cd6f3cca56234c65f2dd97af129bb511239722a1c096bc4de4b` |
| `server/routes/510k-estar-routes.ts` | `33763121ae1f072968cd759d78681ff222cc1fc14763082eb9fbd354e0ac02de` |
| `server/routes/__tests__/510k-estar-attachment-export.pglite.test.ts` | `318b60645dc45d7bb1eb4f9509a7508b3c9360b0d32fd7bb39cc518c58b98dbc` |
| `server/routes/__tests__/510k-estar-attachment-slots.test.ts` | `106f3dc1d4a303245937c648ffb68331bba5bf7896a9ccec64178d55a2a941e1` |
| `server/services/pathway-engines/estar/__tests__/estar-attachment-plan.test.ts` | `de8aba43a8ebd3ebde3c8856e7c3af28505469e0dd1efc854d2836206def4c9b` |
| `server/services/pathway-engines/estar/__tests__/estar-vault-attachment-access.pglite.test.ts` | `435e2c95048998a869c582072ff4b1c0a544d1f6a29748964d1e262c12d411d3` |
| `server/services/pathway-engines/estar/estar-attachment-catalog.ts` | `bd70a0f2e83a51de1e255fd59193aad13609ef37101c3d22ce411611c0dabc99` |
| `server/services/pathway-engines/estar/estar-attachment-plan.ts` | `e4757caa794b8012b0adf528459eb062192ec4e2494b02eb3c8b0571fa2954c9` |
| `server/services/pathway-engines/estar/estar-attachment-slots.ts` | `2291cdb0637cf3888f92074db4132a3c4820bb763dd5a2eedb2e0800e253da04` |
| `server/services/pathway-engines/estar/estar-attachment-source-access.ts` | `c7fd6f7dd35140ceba043a4e4a1bb8f84ebf85bcaa075a9481ca31eff7a246be` |
| `shared/regulatory/estar-attachment-manifest.ts` | `cad704de9438f0251cd39d482562701fff6c732180ba5e1e5519a26555a7c633` |
