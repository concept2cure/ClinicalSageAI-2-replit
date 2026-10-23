# Live browser verification after the October 23 upstream update

## What already exists

`client/src/concept2cure/v2/surfaces/CompanyDocumentSettings.tsx` renders the existing company identity, letterhead designer, legal inventory and governance controls. `CompanyDocumentsAccountSection.tsx` reaches that same screen from Account. `surfaces/VaultLibraryResults.tsx:VaultVersionPicker` supplies the canonical scoped exact-version search, paging and retry used by legal registration and evidence. This evidence extends their existing browser qualification; it introduces no surface, renderer or search implementation. The broader Vault find metadata filters are outside this run. The deletion-history search `git log --all --diff-filter=D -- '*CompanyDocument*' '*company-document*' '*VaultLibraryResults*'` returned no matching removed implementation. Earlier gap-closure evidence records convergence of the temporary duplicate picker onto the reachable canonical picker above.

## Actual execution and source

The Chromium run began at `2026-10-23T15:07:33.478Z` and passed. It used normal password authentication against the local application on port 5000, existing private onboarding credentials, and `/usr/bin/chromium`. Requests and responses were not mocked. The application had been restarted from the saved startup script after integrating 419 additional upstream commits. Private reproducibility files are:

- `/workspace/.cloud-setup/company-gap-browser-oct23.cjs`
- `/workspace/.cloud-setup/gap-closure/browser-oct23.txt`

At completion the merge was still pending commit: HEAD `c04ed02be9ee821fb5af9a90be7072f28518d310` and MERGE_HEAD `55f75b72fac95a387d3b72e82a1998a08ff5ef96`. The actual 31-file checked-out UI source hash is `aa84ece97d5f8f9eafb7b492b209c586a602386c6695a55d916bd9ab0cd90422` and was unchanged between the beginning and end of the run. This qualifies that working tree; it does not claim the merge had already been committed. `source-manifest.json` records each source file's SHA-256 and the observed Git state. Its aggregate hashes sorted `path + NUL + bytes + NUL`.

## Mounted behavior verified

- Admin Settings reads company data. An unsaved running-header change appears in both visual and readable-text previews. Keyboard focus works and the preview typography scales from Times New Roman 9px at 100% to 18px at 200%.
- The actual unsaved Word proof downloads through the audited renderer. Its OOXML contains `UNSAVED LETTERHEAD PREVIEW` and makes no saved-revision claim. The result records its 10780-byte size and hash. Nothing was saved as company content or attached to a filing.
- Permissions, default-review policy, retained history and named designs load. The policy matches saved state and explains its activation prerequisite. The draft-staging panel reads admitted project choices; no design or permission mutation is performed.
- Legal inventory search returns HTTP 200 and an honest empty result for the unique query. A deliberate offline interval shows an error without an empty-library claim. Retry after reconnection preserves both the query and document-kind filter and succeeds.
- Legal registration reaches the canonical Vault picker. Its unique query returns HTTP 200, an honest empty result and excludes superseded versions. The same query offline shows a refusal; its Retry control preserves the query and succeeds after reconnection. No version is chosen or registered.
- Account opens the reused settings and designer. The company panel measures 477px client width and 477px scroll width, with no horizontal overflow. The designer, canonical picker and Account preview screenshots were inspected.

The saved profile remained unchanged at revision 2. No persisted company mutations were sent. There were zero page errors, failed API responses or unexpected failed requests. Console resource errors came only from deliberate offline requests and Google Fonts blocked by the environment network policy; local fallback fonts rendered the application.

## Limits and retained history

Nonempty-result pagination, a delegated-member login, historical comparison, design review/publication/default activation, permission changes, legal registration/approval and filing transmission were not exercised. The read-only query had no matching versions and this local organization had no retained presentation history or published designs for those actions. Focused automated tests qualify governed mutations, scope changes, pagination and broader Vault metadata filtering separately.

October 18 and October 21 artifacts remain untouched as historical evidence. `smoke-result.json`, `source-manifest.json` and the nine screenshots in this directory are the fresh October 23 proof. This is local browser evidence, not production deployment or agency acceptance.
