# Reporting legal chooser completion — W1 / D2

Discovery source: `9f8cae7f0` on `concept2cure-v2`. Status: implementation,
component/canonical qualification and build complete; normal push gates/publication pending.
Contract:
`docs/design/REPORTING_LEGAL_CHOOSER_COMPLETION_2026-10-23.md`.

## What already exists

`InsightsLegalPackage.tsx` already explicitly selects up to 50 eligible legal
originals and downloads the canonical report ZIP, but reads the whole company
profile into an unpaged list. `InsightsBundlesPanel.tsx` reaches it.
`company-documents/PagedCompanyLegalPicker.tsx` already supports 25-row search,
kind filters and cross-page IDs for legal requirements/lifecycle forms.
`server/routes/company-legal-inventory.ts` and
`server/services/company-documents/legal-inventory.ts` already provide that
paged exact-version inventory with current program access and source refusals.
`companySession.ts` / `useCompanyLegalResource.ts` already guard canonical owners
and scope visits. `InsightsPackageStationery.tsx` already pages published designs.
`server/services/report-os/report-package.ts` and `server/routes/report-os.ts`
already enforce distinct IDs, current legal access/approval/hash and unchanged
original bytes, ZIP integrity, size and export audit.

Searches covered alternate companion/package/library/picker/letterhead names,
current claims, reachable callers, routes/services/shared contracts/migrations
and deleted InsightsLegal/CompanyLegalPicker/legal-package/report-package history.
No competing completion or deleted predecessor was found. Existing report and
company workflow tests cover ordinary exports and shared cross-page selection;
the report-specific paging, cap and current-owner integration are the gap.

## Qualification record

Before production edits, two mounted checks failed functionally: the current
chooser lacked Next-page navigation, and a retained enabled ZIP button sent one
POST in the same frame as actual account replacement (expected zero). Both
synthetic transports support the old full profile and the existing paged
endpoint, using the real canonical auth service. These are behavior failures,
not missing-provider or rejected-fixture setup failures.

`red-inputs.json` pins all three production components and the three test inputs
before that run; `red-freeze-verification.json` verifies all six stayed unchanged.
`red-results.json`, `red-output.txt` and `red-run.json` retain the actual 0-pass / 2-fail
result, command and failure messages. The two `red-*.test.tsx.txt` files retain
the initial tests separately from later coverage additions. Production hashes
also match the discovery manifest captured before implementation.

The first combined attempt was 38 passed / 2 failed. Its source hashes changed
during the null-row correction, so it is explicitly intermediate. The failures
also exposed a real refresh defect: identical sibling picker/stationery keys
retained old checkbox rows. Distinct prefixed visit keys fixed it without
weakening either assertion. `first-combined-*` retain this attempt. The next
stable-input focused run passed 41 cases in 3 files (`final-owned-*`). The
original nine cases and 23 original assertion lines remain, allowing only more
specific status/combobox locators; a separate network case preserves transport
failure coverage (`original-nine-preservation.json`).

Lint initially found three warnings, retained in `lint-first.json`. Same-file
render/body extraction and a describe-group split removed them without changing
case bodies. The **final refactored source** then passed **231 cases in 13 files,
zero failed/skipped**, including company/shared-picker/session consumers, actual
paged legal inventory on PGlite, and unchanged server ZIP routes/original-byte
integrity checks. `test-selection.json`, `final-test-*.json`, `final-results.json`
and `final-tests.txt` pin the exact command, results and 37 selected source/test
inputs unchanged before/after. These selected inputs are not a complete
transitive dependency closure. Do not add overlapping cohort counts together.

`lint-final.json` records zero errors and zero warnings in all six changed
source/test paths. Production build exited zero with the same 37 stable inputs
(`build-*`, `build.txt`). An independent read-only final review found no remaining
blockers; all 14 protected discovery boundaries are unchanged
(`review-and-boundaries.json`). No auth helper, shared resource hook, server
export policy or registry change was made.

## Canonical catch-up

Implementation `1790d8fcf` was merged with incoming workflow discovery
`aef1b6a15` at `38ed4c587`, with no conflicts. All 37 component-qualified inputs
remained byte-identical. All 27 incoming changed code/test paths match upstream
(including retirement of the duplicate Home browser into the existing canonical
catalog). Independent read-only review found no integration blocker; root also
verified the incoming 71 source pins and 75 evidence artifacts. The incoming
502/46 and browser counts remain upstream historical qualification only.

Root reran **195 passing cases in 20 navigation/catalog files**, then the
review-requested audit-path consumer separately (**10 passing cases / 1 file**),
with zero failures/skips. Both include all 11 changed incoming suites and direct
navigation consumers. These are separate cohorts from the company/report 231/13
run; counts are not added. `incoming-*` retain exact selections, results and
source snapshots. The merged production build exited zero with stable inputs
(`canonical-build-*`, `canonical-build.txt`). `qualified-source.json` records the
106-input selected union, all verified at the merged commit. It is not a full
dependency closure.

The first normal push attempt at `8b01b1072` was **rejected** by whole TypeScript:
three errors came from the same `useRef<string>()` declaration. Current React
types require an initializer and the slot is also cleared to `undefined`.
`type-refusal-*` retain the actual rejection and unchanged before/after inputs;
that attempt published no source. The declaration is corrected to
`useRef<string | undefined>(undefined)`. Independent read-only review confirms
the same runtime initial/reset value and optional payload behavior, with no
guard or policy change. Earlier counts remain bound to their original sources;
post-correction qualification and a fresh normal push are pending.

Normal push gates remain pending. Local mounted checks do not establish
production deployment or agency acceptance. The separate
[reader check](reader-check.md) is not run. Separate correspondence form ownership
and live deployment qualification remain outside this bounded completion.
