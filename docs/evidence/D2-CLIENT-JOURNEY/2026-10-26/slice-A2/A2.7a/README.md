# A2.7a — carry artifact section status into Author

D2 client journey, continuing the accepted core-workflow direction on
`concept2cure-v2`. Starting commit: `df1a3cc2`. This is the artifact-parity
prerequisite of A2.7; it does not retire the old dossier screens or routes.

## What already exists

- `server/routes/dossier-readiness.ts` reads the integer project's
  `concept2cure_artifacts`, grouping recorded CTD section and lifecycle state,
  with counts and maximum artifact update dates. `surfaces/Dossier.tsx`
  presents those facts. Its weakest-artifact calculation wrongly treats
  approved-plus-locked as locked and unknown-only states as locked.
- `server/services/c2c/dossier-read.ts` and `surfaces/ProjectDossier.tsx`
  already own the governed document-section figures and module details on
  Author. A2.6 carried section details, module dates, review/draft totals and
  the critical-path question. Those records cannot establish artifact counts
  or artifact lifecycle status. Extend the existing response and workflow.
- `server/services/c2c/current-program-access.ts` admits the canonical
  program and its exact integer project anchor. Reuse this admission before
  reading artifacts; no name matching, UUID truncation or tenant-wide fallback.
- `server/routes/c2c/artifacts.ts` already exposes project dossier metrics,
  but its weighted completion percentage does not provide the weakest-artifact
  function. Vault's artifact branch covers Module 3; Artifact Center is an
  organisation view. Neither establishes full per-project parity here.
- `server/services/dossier/dossier-map-view-assembler.ts` separately reads
  `project_sections`, deduplicating tracking records and counting
  approved/signed/locked. This is a third source, not an artifact rollup. Its
  recorded tracking facts remain a prerequisite before the old map folds.
- Existing tests include `projects-dossier.test.ts`,
  `dossier-read.pglite.test.ts`, `projectDossierDetails.test.tsx`,
  `projectHomeReadiness.test.tsx`, and native
  `tests/e2e/project-dossier-details.e2e.ts`. Extend their scope and reuse
  their fixtures rather than add another project or dossier implementation.

Searches covered dossier, readiness, artifact, section tracking, route/registry
owners and prior deletions. No matching alternative owner was found in the
available shallow deletion history; full-history absence is not established.

## Resulting behavior and boundary

The existing artifact read now uses one shared server reader, used by both
the legacy route and the admitted canonical dossier response. Author presents
the returned artifact counts, per-state counts, weakest state and per-section
date in a separately labelled panel; AnA receives the same facts and source
basis. Governed document-section percentages and home/market counts keep their
existing basis. The browser computes no new readiness figure or summary.

Unknown artifact states remain unassessed. Empty, unanchored, unavailable,
loading and failed reads remain distinct. Missing or malformed client payloads
cannot become an empty or ready artifact view. Mixed approved and locked
artifacts retain approved as their weakest state. Server calculations and client
consistency validation use the same canonical shared rule. The client rejects
contradictory counts/state/summary payloads and prints only the returned facts.

No additional app identity, navigation entry, model/provider call, store,
schema migration, commercial grant or dispatch decision is added. No legacy
screen, tracking read, capability or validation inventory is removed in this
increment. Full A2.7 alias/fold work follows verified function parity.

## Verification

- Client baseline: **13 failed** cases for the missing panel/context. An
  independent review then reproduced contradictory state and summary acceptance;
  their red cases produced **2 failed / 13 passed** before the shared-rule
  consistency checks. Client recheck: **34 passed in 3 files**.
- Server baseline: **11 failed / 6 passed**. The shared reader fixes mixed
  approved/locked and unknown/prototype-like states. Real-SQL PGlite tests
  exercise canonical actor/anchor admission, sibling/other-organisation
  exclusion, same-UUID anchor/client changes, membership revocation, and
  unresolved anchors. Initial combined server regression: **38 passed**.
- Related combined regression: **124 passed in 14 files**. It covers source
  isolation, document handoffs, selected-step return, launch scope, loading,
  failures and retry alongside the new artifact facts. One older source-pin
  test failed both on the starting component and the candidate: it assumed
  Evidence remains selected when switching to a different project. Its fixture
  now explicitly visits the new project's Evidence step while preserving the
  pin-retirement assertions. No source-pin production code changed.
- Native PostgreSQL 16 with pgvector, provisioned through the repository's
  fresh/deploy path, serves the browser as `app_service` with RLS on. The
  local development sign-up flow uses the existing explicit dev-auth setting;
  this is UI/data-scope evidence, not production authentication, IQ/OQ or
  deployment certification.
- Actual browser flow: fresh sign-up and reviewed IND creation; create two
  synthetic manually authored strategy artifacts tagged to section 1.1 via
  the UUID project API; submit one for review; compare Author's returned
  counts/state/date after reload. The governed section figure is unchanged.
  The critical-path question prefills AnA with **0 model requests / 0 dossier
  writes after the question**. Desktop/mobile screenshots and selected result
  JSON contain synthetic data only; runtime/auth traces are not committed.
- Node 22 production client/server/audit-verifier build passed. Independent
  source review passed after the consistency correction. Final targeted
  rechecks and normal pre-push checks are required before publication; no
  hook bypass is used.
- The first publication gate caught a nullable-union narrowing error in the
  panel and two unsupported Testing Library query options in tests. Publication
  was refused. The panel now narrows on the source's nullable sections, and
  those test options were removed; **36 affected tests pass**. The zero-error
  TypeScript baseline is retained.

## Remaining A2.7 work

The old map's separate tracking records still need a reachable, source-labelled
core home. Only then complete the coordinated alias, registry, route, catalogue,
capability and validation-package retirement. No removal is claimed here.
