# Complete device and diagnostic project identity and reachable actions

W1 / D2; canonical `concept2cure-v2`. Evidence:
`docs/evidence/D2-DEVICE-CLIENT-READINESS/2026-10-23/`.

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

## Implementation contract

1. Extend the canonical product-type resolver with exact filing identity using
   the catalog's existing identifier resolution. A named companion diagnostic
   stays CDx, a named software device stays SaMD, and a complementary diagnostic
   is not reclassified by its broad registry family. Conflicting filing/pathway
   or stated exact subtype must refuse before writes. Preserve medicinal and
   generic device positive controls and existing regional class limits.
2. Extend the existing product-class control to let a person record only valid
   refinements where a device application permits them. Preserve the existing
   lane default, show the same saved class on review and POST, and retire stale
   choices when a filing changes. Do not infer regulatory risk class, flags,
   intended use, paired drug, classification result or submission qualification.
3. Reach the existing author-only state for all eight regional preparation
   classes. Suppress the unsupported Add a market action for all device-family
   home projects. Preserve supported device submission actions and medicinal
   added-market actions. Readiness must name the actual preparation limit.
4. Keep current layout, CSS tokens, controls, query/loading/error patterns and
   accessibility. Correct CTD-only completion wording if safe, without inventing
   a governed-to-authoring document binding or adding a surface.

Root owns this design/evidence, integration and verification. The identity worker
owns product-types/filing metadata/intake/Projects wizard and their tests. The
existing-action worker owns ProjectHome/ProjectMarkets/DispatchReadiness and
focused tests; it may correct ProjectDossier wording. No overlapping writes.

## Qualification and limits

Show regressions failing before changes, then passing. Cover actual wizard
review/POST and actual intake route persistence/refusals where fixtures permit;
cover device, IVD, CDx, SaMD, regional preparation and medicinal controls. Run
focused existing workflow regressions, design-system and relevant copy/gate
checks, TypeScript no-regression and build. Retain exact commands/results.

This slice does not establish production deployment, a fresh full installation,
qualified live model drafting, acceptance of official forms, expert legal
adequacy, agency transmission or human acceptance. Those remain explicit
qualification work rather than being implied by the reachable editor.

## Review corrections before qualification

Independent review found that the add-market UI could offer the action while its
project read was pending or failed. Reach it only after the project has positively
resolved as an eCTD application. A known device program type also establishes the
device family when a legacy saved product_type is absent or inconsistent. The
existing server add-market guard checks product type and regional classes only;
extend that same guard with the canonical pathway product resolver and qualify
its unchanged-state refusal on the existing real-migration PGlite fixture. Root
owns this service/test addition. The positive NDA-to-MAA control remains required.

A nonempty unresolved device filing identifier must refuse rather than be treated
as an omitted selection. Exact complementary diagnostic identity remains IVD,
including an explicit contradictory CDx request. These are consistency checks in
the same canonical resolver and intake, not new product capabilities.

## Existing UI qualification gaps found by the combined checks

The frozen device integration passed 692 tests, but two repository-wide UI gates
failed on unchanged inputs. `server/services/ana/tool-authorization.register.json`
already registers `create_ha_interaction` as a confirmed governed record write;
`AnaToolExecutor.ts` reaches the existing transactional `ha-service.ts` writer.
`server/services/ana/step-presentation.ts` and `shared/ana/step-verbs.ts` already
provide the canonical running/completed labels, but this register entry lacks
its `present` block and falls back to “Ran a step”. Extend the existing entry
with the closed record/project vocabulary and a human agency-interaction noun;
do not imply a meeting invitation was sent or change authorization/transport.
The existing presentation test and gate/selftest qualify the metadata correction.

`scripts/design/generate-surface-text-ramp.mjs` already owns the generated
per-shell contrast selectors. No authored stylesheet changed in this slice, but
its checked-in v2 output is stale. Regenerate through that existing generator,
review the delta, and rerun contrast/cascade/ramp/shell-collision checks; do not
hand-edit token values or add a second contrast layer. Source/deleted-history
searches found no alternate label renderer or contrast generator to restore.
Root owns these two narrow UI-standard corrections and their final verification.
The original frozen integration and red gate receipts remain attributed to their
original source manifest. Freeze and qualify the final source separately.

## Canonical catch-up

The remote advanced by eight context-refusal recovery commits during local
qualification. Fast-forwarded from `55f75b72fac95a387d3b72e82a1998a08ff5ef96` to
`0a15a0725731eb50d33ca25902c67ca3421da792` with no overlapping local source paths.
Preserve those changes. Two added complexity warnings in the UI changes were
removed without suppressions: redundant optional-prop defaults were dropped and
test response defaulting moved out of its async callback. The final canonical
source manifest and 35-file combined run include all affected device tests,
existing presentation tests and the six incoming context-recovery suites.
Earlier RED/GREEN counts remain tied to their original manifests, not pooled.
