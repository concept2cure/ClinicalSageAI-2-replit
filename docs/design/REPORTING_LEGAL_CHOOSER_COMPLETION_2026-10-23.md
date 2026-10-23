# Complete Reporting's existing legal companion chooser

W1 / D2, canonical `concept2cure-v2`; discovery source `9f8cae7f0`.
Evidence: `docs/evidence/D2-REPORTING-LEGAL-CHOOSER/2026-10-23/`.

## What already exists

- `client/src/concept2cure/v2/surfaces/InsightsLegalPackage.tsx` is reached by
  `InsightsBundlesPanel.tsx` for retained report bundles. Its explicit Choose /
  Refresh reads the full company profile and maps all accessible legal records.
  It has no search or paging. This is an unbounded payload/list, not an omitted
  first page. It selects nothing automatically, disables refused versions and
  caps selection at 50, then downloads the existing server ZIP unchanged.
- `surfaces/company-documents/PagedCompanyLegalPicker.tsx` already supplies
  search, kind filtering, 25-row pages and controlled cross-page ID selection to
  `LegalRequirementsEditor.tsx` and `LegalLifecycleEditor.tsx`. Its defaults
  intentionally permit mapping review-needed records. It has no optional
  eligibility reason or selection cap for the reporting use case.
- `server/routes/company-legal-inventory.ts` and
  `server/services/company-documents/legal-inventory.ts` already supply the
  accessible paged exact-version registry, current source refusals, counts and
  current program-access recheck. Ordinary metadata queries page in SQL.
  `profile.ts` currently supplies the full legal registry for the old chooser.
- `surfaces/company-documents/companySession.ts` and
  `useCompanyLegalResource.ts` already provide the canonical account owner,
  monotonic scope lease and guarded paged reads. Normal bearer refresh retains
  that owner; replacement account/role snapshots retire it. Reuse these helpers.
- `InsightsPackageStationery.tsx` already pages published stationery. Reporting
  offers only organization-wide designs without asserting a target context.
  Its optional selection belongs to this archive visit, not a saved preference.
- `server/services/report-os/report-package.ts` and `server/routes/report-os.ts`
  already enforce one to fifty distinct IDs, current access/approval/source/hash,
  size limits, original-byte integrity, existing PDF composition and durable
  export audit. No export policy or server implementation is missing here.
- `insightsLegalPackage.test.tsx` covers nine ordinary/refusal/download cases;
  `companyLegalWorkflows.test.tsx` already covers cross-page picker selection.
  Canonical company and reporting session fixtures exercise actual auth owners.

Inventory covered legal companion/package/library/picker/letterhead names in
client surfaces, routes, services, shared contracts and migrations; reachable
callers, current work-order claims, and deleted history for InsightsLegal,
CompanyLegalPicker, legal-package and report-package names. No deleted or
competing chooser completion was found. The broad Reporting review lane excludes
surface structure; the preceding company-session lane explicitly deferred paging.

## Completion contract

1. Reach the existing paged picker from Reporting's explicit Choose action.
   Request 25 rows from the existing legal-documents endpoint, never the full
   profile. Preserve IDs across search, kind changes and page navigation; refresh
   clears the selection and starts a fresh picker visit. No auto selection.
2. Extend the picker with narrow optional eligibility-reason and max-selection
   props. Reporting supplies its existing own-context legal refusal and cap 50.
   Render refusal reasons and prevent both disabled and retained handlers from
   adding refused or over-limit IDs. Existing callers keep their current defaults.
   Selected IDs remain removable across pages. Server revalidation remains final.
3. Reuse `useCompanySession` / `useCompanyLease` for the report bundle and picker
   visit. Preserve current selections and pending downloads through canonical
   bearer refresh. Account/role/session replacement, bundle changes, refresh and
   unmount retire old callbacks/results, including A-to-B-to-A visits. Guard
   dispatch and response/body/error projection; hide old private state before
   passive cleanup. A late old operation cannot clear the new operation's lock.
4. Keep optional stationery inside the same archive visit. A minimal optional
   parent-current guard on the existing stationery component may protect reads,
   selection callbacks and awaited responses; key it by the captured visit so
   withdrawn choices are not rebound. Preserve its current paging/scope policy.
5. Keep the existing ZIP endpoint/payload, exact returned bytes, duplicate-click
   protection, notices, approval refusal and agency-acceptance disclosure. No
   registry, endpoint, auth engine, ZIP/PDF renderer, dependency or filing policy
   change. Separate correspondence form ownership remains outside this slice.

## Ownership and qualification

Root owns design/evidence, work-order claim, Git, integration and global gates.
One worker owns focused report/picker test additions and fixture corrections;
another owns only the three existing production components above. Publish this
contract and capture baseline source hashes before either implementation edit.
Retain a functional RED for paging and the current-owner boundary, then freeze
the added tests before production edits. Preserve original assertions when
updating fixtures for the existing paged contract and real authenticated session.

Prove search/page/cross-page selection, the aggregate 50-ID bound, row refusals,
refresh/failure behavior, duplicate dispatch, exact ZIP and explicit stationery.
Exercise current-owner dispatch and delayed response/body rejection, same-owner
refresh and bundle/unmount/ABA boundaries using canonical auth fixtures. Run
affected shared-picker/company/reporting regressions and unchanged server legal
inventory/ZIP regressions, lint without warning growth, production build, full
TypeScript and normal push gates. Record exact sources and failed intermediate
runs; distinguish mounted synthetic-HTTP checks from browser/deployment/agency
qualification.
