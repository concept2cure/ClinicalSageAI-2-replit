# Live browser verification after the October 21 upstream merge

What already exists: Admin Settings and the Account dialog reuse the company
settings screen. Registration and legal evidence use the shared Vault version
picker. This run verifies those existing surfaces against the merged working
tree; it adds browser evidence only.

The actual Chromium run began at `2026-10-21T02:20:09.009Z` and passed. It used
password authentication against the local application on port 5000, existing
private onboarding credentials, and `/usr/bin/chromium`. Requests and responses
were not mocked. The private harness and command log are:

- `/workspace/.cloud-setup/company-gap-browser-post443.cjs`
- `/workspace/.cloud-setup/gap-closure/browser-post443.txt`

At verification the Git merge was pending commit, with all file conflicts
already resolved: HEAD `8d688686532d676067e8d199010966a5633c10ff` and MERGE_HEAD
`30afd3bd17a90c8de4a44098354d9de3a34cb4bc`. This evidence qualifies the checked-out production
UI source, not a completed merge commit. The 31-file working-tree SHA-256 is
`1120edd2b8b5441d72824c681d8b1aa718b92b82c7fda23c14efe7b808cf44ad`. `source-manifest.json` lists every source path and
individual hash; the aggregate hashes sorted `path + NUL + bytes + NUL`.

Verified through actual mounted screens:

- Admin Settings reads company data. Unsaved header changes appear in the
  visual and readable-text previews. Keyboard focus and 200% zoom work; sample
  paragraph typography scales from Times New Roman 9px to 18px.
- The unsaved Word proof downloads from the audited renderer. Its OOXML has
  `UNSAVED LETTERHEAD PREVIEW` and no saved-revision claim. The result records
  its size and hash. It was not saved as company content or attached to a filing.
- Permissions, default-review policy, retained history and named designs load.
  The policy reflects saved state and its activation prerequisite. The staging
  panel reads admitted project choices. No governance mutation is performed.
- Legal inventory search returns HTTP 200 and scoped counts. A deliberate
  offline interval shows an error without an empty-library claim. Retry after
  reconnection preserves the search and kind filter and succeeds.
- Canonical Vault search runs from legal registration, returns an honest empty
  result for the unique test query, and excludes superseded versions. Repeating
  that same query offline shows a failure. Its Retry control preserves the
  query and succeeds after reconnection. No version is selected or registered.
- The Account dialog opens the reused settings and designer. Its company panel
  remains 477px wide with no horizontal overflow. Screenshots were inspected.

The saved profile remains unchanged at revision 2.
No persisted company mutations were sent. There are no page errors, failed API
responses or unexpected failed requests. The recorded console resource errors
are the deliberate offline requests and Google Fonts blocked by the cloud
network policy; local fallback fonts render the app.

Live pagination of nonempty Vault results, a delegated-member login, historical
comparison, design review/publication/default activation, permission changes,
legal registration/approval and filing transmission were not exercised. The
read-only test query has no matching versions; this local organization has no
retained history or published designs for those actions. Focused automated tests
cover pagination, scope changes and governed mutation paths separately.

The October 18 screenshots and result remain in the parent folder as historical
evidence. They do not qualify this merged source. `smoke-result.json` and the
nine screenshots here are the fresh October 21 evidence.
