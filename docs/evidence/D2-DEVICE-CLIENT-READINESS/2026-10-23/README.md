# Device and diagnostic client readiness corrections

W1 / D2; canonical `concept2cure-v2`; 2026-10-23.

Completed code corrections preserve exact CDx/SaMD identity, expose valid product
refinements in the existing wizard, and align the project actions with their
actual supported pathways. This is local automated qualification, not human
acceptance or a production/agency release.

## What already exists

- `shared/constants/domain/product-types.ts` owns device/IVD/CDx/SaMD vocabulary,
  family membership and pathway defaults. It explains why CDx and SaMD identity
  is persisted separately; a lane default does not identify those subtypes.
- `shared/regulatory/filing-catalog.ts` resolves canonical, catalog and legacy
  filing identifiers and bounds regional device application product types.
  Exact CDx and SaMD selections exist in the global registry, but generic
  pathway defaults erase their more specific identity during wizard intake.
- `shared/regulatory/filing-document-classes.ts` owns documentary classes and
  their medicinal fixed-class exception. It must remain documentary-only.
- `client/src/concept2cure/v2/surfaces/Projects.tsx` already has the canonical
  project wizard, review and product-class choices. Its fixed default currently
  prevents a human from recording supported device refinements. Extend the
  existing control and shared resolver; do not add a wizard or duplicate taxonomy.
- `server/routes/c2c/project-intake.ts` validates product classes before the
  transactional route writes. It permits device refinements but does not retain
  exact named CDx/SaMD filing identity or refuse contradictory exact selections.
  `projects.ts` owns the actual project creation and governed scaffold call.
- `server/services/c2c/add-project-market.ts` already refuses all device-family
  home projects; `submission-service.ts` refuses eight regional preparation
  application classes before inserting a submission. `market-support.ts` owns
  the author-only offers. These are existing limits, not missing transports.
- `client/src/concept2cure/v2/surfaces/ProjectHome.tsx`, `ProjectMarkets.tsx` and
  `DispatchReadiness.tsx` already render documentary author-only states, but do
  not apply those states to the regional preparation classes. The first two
  also offer an Add a market action on device projects the server refuses.
- `ProjectDossier.tsx` already renders server-owned document/section completion
  figures. Some labels still assume CTD modules. No new readiness evaluator or
  document binding is required for this slice.
- Existing wizard, intake, route, market, readiness, dossier and PGlite scaffold
  suites own these behaviors. Current human acceptance guide records unrun
  cases; automated coverage must not be represented as human sign-off.

Searches cover productTypeFixedByFiling/productTypeForFilingType/intake,
CDx/companion/complementary/SaMD, filing catalog and aliases, route/service/shared
schema/migration paths, AnA client-segment routing, and project/market/readiness
client surfaces. Full history was fetched and deleted-history searches on
product/filing/project/CDx/SaMD/ProjectMarkets/DispatchReadiness paths were run.
No alternate canonical intake or preparation-only UI should be built.


## Resulting behavior

- Exact US/EU/Japan CDx selections remain companion diagnostics. A complementary
  diagnostic remains IVD. Named software selections remain SaMD. Compatible
  generic device/diagnostic applications offer their bounded refinements through
  the existing product-class control, with the same value in review and POST.
  Preserving identity does not admit an otherwise unsupported filing: the
  existing offer, exact pack and pathway refusals remain authoritative.
- Filing changes retire stale choices. A contradictory subtype, incompatible
  pathway or unknown nonempty device filing ID refuses before project writes.
  Actual router tests cover saved CDx values and omitted-value inference; those
  route fixtures mock SQL/scaffolding and are not a full installation.
- All eight regional preparation classes state their preparation-only limit in
  Project home, Submit, standalone readiness and AnA context. They offer no
  nonexistent market or sequence action. Existing 510(k)/PMA access remains.
- Add a market and CTD compile require a successfully read current project and
  an appropriate filing. Known device pathways remain device pathways even with
  inconsistent legacy product metadata. The server's existing add-market writer
  also refuses them before any document/submission/audit write; the real-migration
  PGlite suite asserts unchanged complete database state and keeps NDA-to-MAA
  creation as a positive control.
- The existing agency-interaction step now says it records an interaction using
  the canonical closed label vocabulary. It does not imply an invitation was
  sent. The generated contrast sheet was refreshed through its existing generator;
  authored token values and layouts were not replaced.

## Verification receipts

- `source-freeze.json` pins the first combined 27-file integration: **692 passed**,
  no failures (`integration-tests.json`, `integration.json`, compressed log).
  It includes the real-router/service 510(k) intake-to-eSTAR journey, actual
  regional pack contracts, authoring templates, readiness refusal, governed
  dossier and market services, and editor-to-Vault continuity/placement.
- `source-freeze-final.json` adds only the existing tool label metadata and
  generated contrast sheet to that source. The original functional hashes are
  unchanged. All **16 selected static gates** passed, including design system,
  vocabulary, filing exits, UI copy, state honesty, contrast/cascade/ramp,
  shell-CSS collision and the step-presentation selftest. The existing presentation
  suite passed **24 tests**. Original red gate receipts remain retained.
- Identity RED: 23 semantic failures; unknown selected-ID RED: 2 failures. The
  focused final identity receipt is 242 passing tests across 8 files. These
  overlap the combined run and are not added to its total.
- Actions RED: 20 semantic failures; independent-review RED: 5 failures. Focused
  actions receipt is 78 passing tests across 7 files, overlapping integration.
- Legacy add-market RED: 9 targeted cases unexpectedly added medicinal markets.
  The first full RED also contaminated its later audit-count positive control,
  so its 10 failures are not 10 separate production defects. The corrected
  full service suite passed 37 tests, also included in integration.
- `independent-review.json` records the reviewed sources, corrected findings and
  no remaining code blocker within this slice. Initial lint comparison found
  two added complexity warnings; their correction and final canonical integration
  are recorded separately below.

## Canonical reconciliation and final qualification

Fast-forwarded eight incoming context-recovery commits without source overlap to
`0a15a0725731eb50d33ca25902c67ca3421da792`; preserved them unchanged. The final
`source-freeze-canonical.json` pins this combined source. `qualification.json`
records **861 passing tests across 35 files**, all **16 gates passed**, TypeScript
**0 errors**, a successful production build, and **0 added lint warnings** (15
existing warnings retained). Two warning-only refactors are covered by the
rerun; no warning baseline or suppression was added.

`canonical-integration.json` records exact test arguments; the corresponding
result and compressed output retain every outcome. Every final receipt reports
zero source drift. `independent-review-final.json` carries the final nine
production-file hashes and no remaining code blocker; its compiler/build status
was pending when reviewed and is completed by `canonical-typecheck.json` and
`canonical-build.json`.

`component-browser-review.json` and eight PNGs show actual captured ProjectMarkets
markup with built styles at 390/1440px, light/dark, with no horizontal page or
text overflow. The existing visual-QA all-chunks CSS convention is a superset of
one route's CSS. These are component layout checks with serialized DOM, not a
live authenticated application, interaction test or human acceptance. Earlier
receipts remain tied to their own source manifests; overlapping totals are not
added together.

## Human acceptance and remaining qualification

Cases 59–64 in
[`CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md`](../../../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md)
cover the subtype, stale-selection, preparation-only, existing-device and
medicinal-control workflows, including narrow/light/dark keyboard review. They
remain **Not run**. Existing cases 1–58 retain their recorded status.

This work does not establish a fresh full installation, production deployment,
qualified live-provider drafting, adequacy of current official agency forms or
regional legal requirements, actual recipient transport, or agency acceptance.
Regional preparation outlines remain unreviewed guidance, not complete mandatory
requirements or qualified submission packages. The reachable editor, a validated
package and transmission acceptance are distinct outcomes. Existing direct
Authoring/Documents access remains the route for non-CTD work; no guessed
cross-store document navigation was introduced.
