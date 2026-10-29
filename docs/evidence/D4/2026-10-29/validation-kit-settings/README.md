# The GAMP 5 validation package, reached on Settings (decision P-67)

Launch row D4 (validation package). Date 2026-10-29. Working tree over `3830ae34d`.

Decision: `docs/LAUNCH_DEFINITION_OF_DONE.md` P-67, with its same-day amendment on implementation.

A regulated customer validates the system they use (21 CFR 11.10(a), EU GMP Annex 11 §4). The vendor's validation
package is the first thing their QA asks for, and it goes into their computer-system-validation file. So it has to
describe the deployed system truthfully. Before this change it had no reachable screen, and the route behind it
described the package wrongly.

## What already exists

| Piece | Path | What it does today | What it did not do |
|---|---|---|---|
| The route | `server/routes/validation-kit.ts` | `GET /api/validation-kit` lists documents parsed from `docs/validation/*.md`. `GET /:docId` delivers one through `sendAuditedDownload` (EXPORT_GENERATED with the SHA-256 of the bytes, nothing delivered when the row does not persist; `validation-kit-download-recorded.test.ts`). Mounted with `authMiddleware` (`register-inline-routes.ts`). | It listed every markdown file in the folder (30), not the package (19). It read only the `**Label:** value` header form, so the launch package's `\| Field \| Value \|` header tables came back with no version and no status. Its note promised "executed and approved records … through QA at contract". |
| The documents | `docs/validation/` | The launch package: VMP-001, URS-001…007, RA-001, IQ-001, OQ-001…006 and OQ-008, TM-001 (generated), VSR-001. Every one is "DRAFT — UNSIGNED". Shipped in the image (`.dockerignore` `!docs/validation`, `Dockerfile.optimized:231`, `check-image-runtime-assets.mjs`). | — |
| Other files in the folder | `docs/validation/*CORTEX*`, `C2C_BLOCKING_CI_GATES.md`, `IQ_OQ_EVIDENCE_PACK.md` | The CORTEX series is a second VMP/IQ/OQ/PQ/RA/TM/VQ/VSR/CSRA set for "Cortex Prime AI System", dated 2025-01-24. VMP-001 §3 says it covers the AI engines, out of scope, and is not superseded. The other two are an internal CI work order and a generated evidence pack. | Not deliverables of the launch package. |
| The only UI | `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx` `AdminConsole`, its `sec === 'validation'` section | Rendered the catalog with a badge per document. | No surface has mounted it since `af973c5e8` (2026-07-27, "one product admin", confirmed on GitHub). It turned a failed read into "Provided at contract — not yet self-serve". It turned a status into a badge, and an unreadable one into "Available". Beside the kit it showed hard-coded "Live" rows. |
| AdminConsole's other sections | same component | Access grants, organization profile, subscription, SSO/SCIM, security, modules, API keys, audit. | Every one already has a mounted home (below). |
| Settings | `client/src/concept2cure/v2/surfaces/AdminSettings.tsx` `OrganizationSettingsCards`, mounted by `AdminAccess.tsx` at `admin-console` | One card per governed organization setting, each with its own read. | No validation card. |
| The claim | `shared/constants/ui-surface-registry.ui-v2.ts` `admin-console` `apiPrefixes` | Already claims `/api/validation-kit`, since the setup fold (`beede0408`). | — |

Searches run:

- `validation-kit`, `validationKit`, `ValidationKit`, `vkit`, `GAMP`, `IQ/OQ` across `client/src`, `server`, `shared`, `scripts` and `tests`. The kit is read only by `AdminSurfaces.tsx` and its two server tests.
- Every endpoint `AdminConsole` read, and where else it is read:
  - `/api/admin/access/grants`: `AdminPlatformGrants.tsx`, mounted at `AdminAccess.tsx:599`.
  - `/api/api-keys`: `AdminAccess.tsx`, `AdminApiKeyCreate.tsx` and `AdminApiKeyUsage.tsx`, mounted at `AdminAccess.tsx:777-778`.
  - `/api/module-subscriptions/catalog`: `WorkflowCatalog.tsx`.
  - `SessionPolicySetting`: `AdminSettings.tsx:62`.
  - The organization profile: `OrganizationProfileCard.tsx`.
  - The SSO/SCIM and audit sections are text, plus a link to `audit-trail`.
- `git log --all --diff-filter=D -- '*AdminConsole*' '*ValidationKit*' '*validation-kit*' '*validationKit*' '*AdminSurfaces*'`: nothing. This clone is shallow (1394 commits), so `af973c5e8` itself was checked on GitHub.

## What changed

- **The route offers the package and nothing else**: VMP-001, the documents that name it as their `Parent`, and
  TM-001. A document whose id is not `VMP|URS|RA|IQ|OQ|TM|VSR-NNN` is neither listed nor served (404). The
  ordering is the plan's.
- **Each document's header is read as written**, in either form, with emphasis dropped. VMP-001 now reports
  version `0.4` and status `DRAFT — UNSIGNED`. OQ-008 reports `DRAFT — UNSIGNED, NOT EXECUTED`. The download's
  audit metadata carries the same values, where it used to carry nulls.
- **The note promises nothing the package does not keep.**
- **`ValidationKitCard.tsx` on Settings** shows each document's id, version, title and status, verbatim, with a
  download. A document that records no status says so. The card has four distinct states: reading, a failed read
  (with its HTTP status and Retry), an empty package (the server's own words), and the list. A refused download
  is announced beside the list.
- **`AdminConsole` is deleted** (`AdminSurfaces.tsx` goes from 1855 to 897 lines), along with its now-dead CSS: the `ac-*` rules in
  `coverage-v2.css` and the `ac-val-err` rule in `app-v2.css`. `surface-text-ramp.css` was regenerated from the
  sheets. It had also been stale on HEAD: three selectors from `review-decision.css`, `misc-surfaces-v2.css` and
  `journey-v2.css` were missing.

Deletion rule:
- The replacement is `client/src/concept2cure/v2/surfaces/ValidationKitCard.tsx`, mounted by `AdminSettings.tsx`.
- Reachability is pinned by `client/src/concept2cure/v2/__tests__/validationKitCard.test.tsx`, "where it is reached".
- The history search is above.

## Red, green, mutations

- `red-server.txt`: the four package tests against the old route. 4 of 4 fail: 30 documents listed against 19, 11 outside the package, a null version and status, and the note's promise.
- `red-client-old-console.txt`: the card's two honesty claims against the old `AdminConsole`, run as a temporary test that was not committed. 2 of 2 fail: it shows a badge, not "DRAFT — UNSIGNED", and a failed read is not called one.
- `green.txt`: the package, download-recording, card, Settings and setup-fold suites. 6 files, 38 tests, all pass.
- `mutations.txt`: 7 mutations, each restored byte for byte. 7 of 7 turn red:
  - the header table not read;
  - the whole folder offered;
  - the "at contract" promise restored;
  - the status as a badge;
  - a failed read shown as empty;
  - a refused download silent;
  - the card unmounted.

## Not carried

- **VMP-001 §5 lags its children.** It lists URS-001…006 and OQ-001…006, while URS-007 and OQ-008 (CMC / Module 3) name VMP-001 as their parent and are offered. The plan is a controlled document; the revision is its owner's.
- **No executed records.** The execution records under `docs/evidence/W3/` are not part of this download. The package is the plan, the requirements, the protocols, the trace and the summary, as they stand.
- **Who may download.** The route admits any signed-in member of an organization, and the card is on administration's Settings. Narrowing it is not this change.
