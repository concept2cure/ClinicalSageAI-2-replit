# Complete existing filing-correspondence form ownership

W1 / D2 on `concept2cure-v2`, synchronized source `62a8d5e7f`.
Evidence: `docs/evidence/D2-COMPANY-CORRESPONDENCE-SESSION/2026-10-23/`.

## What already exists

- `client/src/concept2cure/v2/surfaces/CompanyCorrespondenceDraft.tsx`
  creates a working Authoring draft through the canonical correspondence route,
  validates exact sequence/program/variant receipts, retains safe committed
  recovery identity, blocks uncertain outcomes and opens the identified document.
  Raw bearer-derived ownership resets text and the uncertain-create hold during
  ordinary refresh. Effect generations do not guard retained dispatch/navigation.
- `CompanyCorrespondenceVariants.tsx` already pages the sequence-admitted
  published stationery inventory. Its bearer owner triggers unnecessary reads;
  retained selection, paging and retry handlers have no canonical owner check.
- `CompanyFilingIdentityReview.tsx` already reads current identity hashes and
  records a reviewed company role without rewriting filing identity. It uses a
  raw bearer/profile/variant owner and passive generations. Its role choice can
  outlive replacement, and state-only busy guards do not prevent duplicate clicks.
- `CompanySubmissionDocuments.tsx` / `useCompanySubmissionLibrary.ts` already use
  canonical account ownership, current filing/query leases, masked profile and
  capability reads, and guarded setters. The prior parent continuity tests mock
  all three correspondence children; that does not qualify their actual forms.
- `company-documents/companySession.ts` already supplies `useCompanySession`,
  `useCompanyLease` and `companySetter`. `apiCall.ts` already supports captured
  ownership checks before dispatch, before JSON decoding and after awaited
  handoffs. Reuse them; do not create another authentication/transport engine.
- Existing company correspondence/identity/design routes and services, shared
  contracts and Authoring/Vault services own approval/access, exact creation and
  recovery receipts, provenance and revision/hash checks. Preserve those policies.
- `__tests__/companyCorrespondenceWorkflow.test.tsx` has seven ordinary draft,
  identity and legal-link cases. It does not seed the canonical auth service.
  `_company-session-fixture.ts` already exercises real refresh and account owners.
- `CompanyLegalCommunicationLinks.tsx` has a similar bearer-derived owner, but
  is reached from separate `AgencyInbox.tsx` / `CommunicationCenter.tsx` parents.
  Its historical inventory deliberately includes archived records and agency
  outcomes. It is deferred here, including those parents' record admission; this
  completion does not qualify every correspondence/communication panel.

Inventory covered correspondence/stationery/filing identity/authoring draft and
legal-link aliases, reachable callers, routes/services/shared contracts, current
claims and deleted component/session history. No competing completion or deleted
predecessor was found. Prior company-session and Reporting evidence explicitly
deferred these three forms. Incoming MDX project integration is already published
canonical work and has no overlap with these production components.

## Bounded completion

1. Reuse canonical company ownership and monotonic leases. Ordinary bearer
   refresh preserves form text/title/reasons, selected published stationery,
   identity role, pending operations and unknown-create holds without extra reads.
   Actual account/role/session replacement, filing change or unmount retires old
   handlers/results and removes private state before passive cleanup, including
   filing A-to-B-to-A. Guard all field setters, retries, selection, navigation,
   read/write dispatch and awaited response/body/error projection.
2. Draft form identity is the canonical account and exact sequence/program.
   Changing the selected stationery does not remount the form or erase text,
   a sent-operation lock, confirmed/recovery identity or an uncertain outcome.
   Capture stationery at dispatch, validate the receipt against that captured
   value and prevent retained handlers from an earlier stationery visit sending
   a new request (including A-to-B-to-A). A sent operation may settle under the
   same account/filing even if stationery changes; its stored result remains
   explicitly bound to the choice made when saving. Copy must explain that a
   new selection does not change an already saved draft. Never reinterpret an
   old-variant result as the current selection or silently permit another copy.
3. Preserve the existing creation receipt/recovery/uncertain-outcome policy.
   Add synchronous operation-specific pending locks so duplicate clicks send
   once, and an old finalizer cannot unlock a newer form. Do not replay writes.
   Confirmed and safe recovery navigation must check the captured filing owner
   before setting the editor target or navigating. The generic Authoring check
   link must use the same guard. No idempotency/reconciliation service is added.
4. Identity comparison scope includes sequence, profile revision and stationery;
   current review authority must be checked again by retained save handlers.
   Preserve exact hash/revision payloads and existing receipt validation. The
   published variant chooser retains server admission, paging, explicit default
   and ID selection; accept only a currently loaded published row or default.
5. A minimal optional parent-current callback on the three components may carry
   the existing library admission into their controls. Pass it at the existing
   parent call sites. Withheld parent data hides/disables private forms while
   keeping the same filing's draft in memory, rather than unmounting it on an
   unrelated inventory read. Keep sent draft operations owned by their captured
   account/filing; parent query refresh must not manufacture a different result.
6. No shared auth/resource helper, server route/writer/receipt policy, regulatory
   scope, letterhead renderer, dependency or company legal registry changes.
   No inbox/handoff legal-link or MDX production changes belong to this slice.

## Ownership and proof

Root owns this contract, evidence, work-order claim, Git and global gates. One
worker owns focused tests and the existing seven-case fixture admission; another
owns only the three forms and minimal optional-current parent call sites.
Capture baseline source hashes before edits and functional RED before production
changes: real bearer refresh plus subscribed parent/same-props rerender loses a
draft/hold; a retained old callback dispatches under a replacement account.
Freeze these assertions and preserve every failed intermediate/source scope.

Qualify same-owner pending completion and refresh; account/role/browser-bearer,
filing/variant ABA, unmount, delayed response/JSON, stale navigation/setters,
duplicate dispatch, exact receipt/recovery and uncertain holds. Preserve all
seven existing behavioral cases, updating only canonical auth fixtures as needed.
Include a real-parent integration check of the three children. Run affected
company/legal/Reporting consumers and bounded incoming MDX integration checks,
lint without warning growth, merged build, whole TypeScript and normal push
gates. Verify current source on the remote. Mounted synthetic HTTP/Git proof
does not establish live deployment, authenticated hosted acceptance or agency
acceptance.
