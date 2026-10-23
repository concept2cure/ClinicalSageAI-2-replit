# Company-settings session continuity

W1 / D2. Discovery source `035ee6854`, branch `concept2cure-v2`.
Design: `docs/design/COMPANY_SETTINGS_SESSION_CONTINUITY_2026-10-23.md`.
Feature implementation `a3acbbbb1` is published on `concept2cure-v2` at
`093711f4c44f77b0d36f483ca318de08cbe5be91`. Normal push hooks passed, including
whole TypeScript with zero errors on that exact publication revision. All 102 selected inputs
match the fresh remote. `code-publication.json` and `code-push.txt` retain the
accepted-ref and gate proof. No production deployment is claimed.

## What already exists

The existing `useCompanyDocumentSettings.ts` owns profile/letterhead drafts,
reads, mutations, imports and downloads. Its bearer-derived identity loses a
draft on ordinary token refresh. Existing `useCompanyResource.ts` and
`useCompanyLegalResource.ts` own panel reads/actions and legal forms; their raw
token owners and form keys do not distinguish refresh from account replacement.
Their APIs, registry, capability checks and receipt rules are retained.

`editor/authoringCurrentRead.ts` and `authService.captureSessionReadGuard` already
own the canonical account/session distinction, reused by Authoring and
Reporting. This completion reaches that implementation from company settings.
Current company tests and Reporting's real-session test pattern supply the
fixtures. Code, current claims and deleted-history searches found no competing
company session implementation. See the design for exact paths and boundaries.

Independent review identified `v2/apiCall.ts` as the existing canonical response
normalizer. Its narrowly optional owner callback replaces an initial duplicated
company JSON wrapper, preserving every ordinary three-argument call. The design
records this one reviewed exception to the initial 14 boundary pins; the other
13 remain protected. No generic mutation verdict or server API changes.

`__tests__/authoringCreationHostRecovery.test.tsx` already exercises real canvas
and working-list readers with canonical session/header/recovery assertions, but
its direct mounts omit the auth provider required by those unchanged hosts.
The final catch-up corrects this existing fixture with the real provider and
controlled bootstrap transport; no native host or auth implementation changes.
`host-fixture-correction-scope.json` and the archived fixture retain provenance.

## Completed behavior

The existing settings and shared legal forms now use the canonical auth owner.
Ordinary bearer refresh preserves unsaved profile/letterhead fields, reasons,
imports/logo and applicable open forms. Actual account/session/role-snapshot
replacement withdraws private state and capabilities, rejects retained handlers
before dispatch and suppresses old response, JSON/blob, FileReader, error and
finally continuations. Captured path/version/unmount and admission visits prevent
old A-to-B-to-A callbacks from becoming current again.

The existing submission legal parent rereads current permissions before reopening
its forms. Its library synchronously masks withdrawn private state, and its
search/query/filter ownership includes the canonical account as well as the
filing. Existing place/copy receipts, conflicts, unknown outcomes, reasons,
signature ceremonies and original bytes remain unchanged.

## Qualification scopes

- `final-results.json` and `primary-test-scope.json`: **180 passed / 19 files**,
  zero failures/skips, on `a3acbbbb1`. `final-start.json`/`final-finish.json`
  establish stable selected source pins. The requested workbench path was
  incorrect; the actual missing editor suite is run separately, with no
  overlapping aggregate claim.
- `workbench-results.json`/`workbench-scope.json`: separately **25 passed /
  1 file**, zero failures/skips, for the existing canonical editor-access
  consumer on the same unchanged feature source.
- `lint-final.json`: company-owned client source/test files have zero errors,
  zero warnings and zero warning growth against discovery source `035ee6854`.
- `independent-review.json`: read-only CLEAR after correcting first-render
  masking, canonical query ownership and captured admission withdrawal.
- `boundary-comparison.json`: 13 protected boundaries match discovery exactly;
  only the approved optional `apiCall` handoff guard changed. Its original
  three-argument normalization assertions remain in the passing primary run.
- `qualified-source-manifest.json` pins selected company source, canonical
  owner/auth/API inputs and tests; it is not a full dependency closure.
- `incoming-backfill-results.json`: separately, **27 passed / 3 files** for
  reviewed incoming Vault source-offset preservation at `f0ec738b1`. This does
  not add to the company count or inherit the upstream 219-case qualification.

`observed-red-and-intermediate-scopes.json` preserves the original two observed
settings failures, the parent authoring run and intermediate fixture failures,
with explicit missing baseline-hash limits. `parent-mask.json` additionally
retains a 9-pass/1-fail private-field observation. `admission-red.json` has two
intended retained-action/pending-receipt failures, with pre-correction source
pins and an unchanged test hash in `admission-before.json`. No source rollback
or reconstructed RED result is claimed. Overlapping worker runs in
`worker-verification.json` retain their own source timing and are not summed.

## Canonical catch-up

`qualification.json` records the reviewed market-identity merge: **135 passed /
9 files**, stable selected inputs, production build and full TypeScript with
zero errors at `d18f3f34a`. These counts remain separate from company and
upstream historical cohorts. The initial standalone build/compiler receipts
at `a3acbbbb1` are retained as `initial-*`.

The later Authoring source-start/eSTAR merge is independently CLEAR
(`incoming-source-start-review.json`). All 82 previously selected inputs stayed
exact, but two prior Authoring actor/access consumer results are historical
because their producers changed. `source-start-integration.json` qualifies
**391 passing cases in 13 files** from the retained 14-file attempt, plus the
separately corrected **38 passed / 1 file** host fixture. The failed whole
attempt is never relabelled as green. Its 38 setup failures and the provider-only
23-pass/15-fail URL-interception attempt remain archived. All 40 original
assertion lines are unchanged. The actual vendored eSTAR template input is
present and hash-recorded; these controlled route checks establish no human or
agency acceptance.

The final production build passed at `fc6f213ab`. Commit `84025f505` changes only
the reviewed host fixture and design; it does not change the built production
code. `final-source-union.json` pins 102 selected current inputs, not a full
dependency closure. The normal pre-push hook ran whole TypeScript with zero
errors on the exact publication revision `093711f4c`; `code-publication.json` records that
accepted push. Earlier qualification snapshots keep their original pending
publication fields and source epochs rather than being silently rebound.

## Limits

These are local mounted-client tests using real canonical auth behavior and
synthetic HTTP/file transports. They do not establish live-browser, hosted CI,
production deployment or agency acceptance. Separate
`CompanyCorrespondenceDraft`, `CompanyCorrespondenceVariants` and
`CompanyFilingIdentityReview` ownership remains outside this completion; the
parent continuity fixtures isolate those components. Reporting's legal chooser
paging and sealed-document successor policy remain separate needs.

The underlying `apiRequest` can consume a refusal body before rejecting; the
optional `apiCall` guard suppresses that obsolete error at catch projection.
This does not claim to prevent every internal transport body read.

Ownership checks qualify company dispatches and company result/body/file
handoffs around the existing canonical transport. That transport may decode a
cloned 401 and raise its global session-ended event before returning to the
guarded helper. Transport-wide session-end handling is unchanged; delayed
session-end events across account replacement are not qualified here. This is
a source-review boundary, without a functional RED or vulnerability claim.
