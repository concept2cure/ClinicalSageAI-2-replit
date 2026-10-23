# Live browser verification after the latest Authoring access update

## What already exists

`client/src/concept2cure/v2/surfaces/CompanyDocumentSettings.tsx` renders the existing company identity, letterhead designer, legal inventory and governance controls. `CompanyDocumentsAccountSection.tsx` reaches that same screen from Account. `surfaces/VaultLibraryResults.tsx:VaultVersionPicker` supplies the canonical scoped exact-version search, paging and retry used by legal registration and evidence. This evidence requalifies those existing mounted workflows after the latest Authoring access and Shell update; it introduces no UI, renderer or search implementation. Earlier integration evidence records convergence of the temporary duplicate picker onto this canonical picker. The prior deletion-history search returned no matching deleted implementation.

## Actual execution and source

The Chromium run began at `2026-10-23T16:03:09.569Z` and passed. The local application had been restarted through the saved startup script from the current merged source. The run used normal password authentication, existing private onboarding credentials and `/usr/bin/chromium`; requests and responses were not mocked. Private reproducibility files are:

- `/workspace/.cloud-setup/company-gap-browser-oct23-current-authoring.cjs`
- `/workspace/.cloud-setup/gap-closure/browser-oct23-current-authoring.txt`

HEAD was `e87c01595db9e2f1dc300b1858522f3d2f646510` at the beginning and `e87c01595db9e2f1dc300b1858522f3d2f646510` at completion. No Git merge was in progress at either observation. The 31-file checked-out UI source SHA-256 is `39b1cd2728e65572c3770e3cf0330abb33d631d171951dd9391ff0368562b0d4` and remained unchanged throughout the run. The UI source matched HEAD at completion: `true`. `smoke-result.json` records both start/end Git observations and `source-manifest.json` lists each source hash. The aggregate hashes sorted `path + NUL + bytes + NUL`. This is local application qualification, not a production deployment claim.

## Mounted behavior verified

- Admin Settings loads company data. An unsaved running-header change appears in visual and readable previews. Keyboard focus works. Preview typography scales from Times New Roman 9px at 100% to 18px at 200%.
- The actual unsaved Word proof downloads through the audited renderer. Its OOXML contains `UNSAVED LETTERHEAD PREVIEW`, makes no saved-revision claim and is 10779 bytes; its exact SHA-256 is retained in the result. Nothing was saved as company content or attached to a filing.
- Permissions, default-review policy, retained history and named designs load. The policy matches saved state and its activation prerequisite. Draft staging reads admitted project choices; no governance mutation is performed.
- Legal inventory search returns HTTP 200 and an honest empty result for the unique query. Deliberately going offline produces an error without an empty-library claim. Retry after reconnection preserves both query and document-kind filter and succeeds.
- Registration reaches the canonical Vault picker. Its unique query returns HTTP 200, an honest empty result and excludes superseded versions. Repeating the same query offline displays a refusal; Retry preserves that query and succeeds after reconnection. No version is selected or registered.
- Account opens the reused settings and designer. The company panel measures 477px client width and 477px scroll width with no horizontal overflow. Designer, offline picker refusal and Account preview screenshots were inspected.

The saved company profile stayed unchanged at revision 2. No persisted company mutations were sent. There were zero page errors, failed API responses or unexpected failed requests. Recorded console resource errors are deliberate offline requests and Google Fonts blocked by the environment policy; local fallback fonts rendered the app.

## Limits and retained history

Nonempty-result pagination, delegated-member login, historical comparison, design review/publication/default activation, permission changes, legal registration/approval and filing transmission were not exercised. The read-only query has no matching versions; this local organization has no retained presentation history or published designs for those actions. Focused automated tests cover governed mutations, scope changes, pagination and broader Vault metadata filters separately.

All earlier dated browser proof remains unchanged. This directory contains the current October 23 result, source manifest and nine screenshots after the latest Authoring access and shared Shell updates. Earlier runs remain historical proof of their recorded commits. It makes no agency acceptance or production verification claim.
