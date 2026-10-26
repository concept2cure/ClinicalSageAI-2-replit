# A2.6 — complete the existing ProjectDossier

Workstream: D2 client journey. Branch: `concept2cure-v2`. Starting commit:
`c7f2745a655aba0d6be88638bb22be0d02762df6`.

## What already exists

- `server/services/c2c/dossier-read.ts` owns the single org-scoped governed
  section read (`DOSSIER_SECTIONS_SQL`), counted-section rules, home versus
  added-market figures, pack-derived module labels and module update dates.
  It does not return each row's counted section labels and statuses. Extend
  this read; add no query, store or readiness calculation.
- `server/routes/c2c/projects.ts` already gates the dossier route through
  project organisation scope. `projects-dossier.test.ts` and
  `dossier-read.pglite.test.ts` cover its counts, market boundaries and failures.
- `client/src/concept2cure/v2/surfaces/ProjectDossier.tsx` already owns the
  readiness card, module rows and AnA facts from that same response. Dates
  are typed but not printed; section details, summary review/draft counts
  and the critical-path question are missing.
- `surfaces/ProjectHome.tsx` already mounts module completion on Author,
  publishes `dossierFacts`, and receives the existing `onAsk` handoff.
- `surfaces/Dossier.tsx` and `surfaces/DossierMap.tsx` still provide visible
  section status, summary counts, section facts and the critical-path prompt.
  They remain callable in this additive slice. `FUNCTION_PARITY.md` requires
  visible section readiness before their later removal; AnA facts alone do
  not fulfill that promise.
- `shared/regulatory/section-code.ts` already owns `compareSectionCode`.
  Reuse it for module and section order rather than add a comparator.
- Deleted-history search (`git log --all --diff-filter=D` for dossier,
  readiness and section-code names) found prior consolidation and retired
  gateways, not a missing alternative dossier owner to restore.

## Boundary

Follow `SLICE_A2_PLAN.md` A2.6 and its review correction: enrich the existing
read and Author module details. Keep pack labels, server figures, home/market
separation, missing-data states and editor handoffs. Show counted sections as
read-only module details, without recreating Vault's editable document tree.
No screen/route/catalog deletion, schema/dependency change, entitlement change,
new navigation identity or provider call is authorized by this slice.

## Completed change

Each backend row now returns exactly its counted sections, preserving stored
keys, labels and statuses. Module and section order use the existing regulatory
comparator. Home and added-market regional rows keep their own section sets;
document classes remain one row. No second query is added.

Author shows a separate read-only section-status disclosure beneath each module,
without nesting it inside the existing editor-opening button. The module's
recorded update time is printed separately. Missing/malformed section detail
states that it is unavailable and is null in AnA facts; unknown statuses remain
literal. The readiness card sums server review/draft counts from home rows only.
The exact existing critical-path question uses ProjectHome's existing onAsk.

The parity review found an important limit: legacy `Dossier.tsx` and the old
map endpoint derive artifact rollups, while this read provides governed section
statuses. Legacy artifact counts, weakest-artifact readiness and per-section
dates still require reconciliation in A2.7. A module date is not a section date.
`FUNCTION_PARITY.md` records partial carryover explicitly. Old screens and routes
remain callable; this slice does not authorize their removal.

## Validation

- Backend red: 4 failed / 15 passed before implementation. Green: 19 passed
  including real-SQL PGlite scope, heading, market and regulatory-order checks.
  See [backend.md](backend.md).
- Client red: 4 expected failures / 1 passed for missing section facts, date,
  summary counts and critical-path prompt. The review caught prototype-like
  unknown statuses; its new negative case failed before replacing ordinary
  object lookup with Map. Missing/malformed detail and invalid dates are also
  covered. Combined final regression: **72 passed in 8 suites**, including
  editor targets, launch scope, loading/failure/retry and CSS ownership checks.
- Native browser: fresh signup and human-reviewed IND creation, actual scoped
  API response, Author details compared against that response, module timestamp,
  home counts and exact question prefill. No model request or dossier write is
  made by the question. The existing template/editor/chip/reload/Vault return
  flow also passes: **2 passed together in 28.4 seconds**. A cold first attempt
  was interrupted after development hot reload reset its in-progress intake;
  the stable run is recorded. The final dossier-only run includes the canonical
  `ana-ri/stream` request matcher.
- Node 22 production client, server and audit verifier build passed (Vite
  19.95 seconds; existing chunk-size warning).
- Independent read-only review confirms unchanged scope, counting rules,
  server figures, home/market separation and editor handoffs after the unknown
  status correction.
- Concurrent onboarding changes through `ddbdfb938` merged cleanly. The merged
  dossier/readiness and onboarding suites pass: **47 tests in 4 suites**.
- All pre-push gates then passed, including TypeScript **0 errors**, but Git
  rejected the ref update after concurrent vaccine safeguards landed. Changes
  through `619a946f8` merged cleanly; the vaccine/dossier suites pass together:
  **91 tests in 2 suites**. The shared IA continuation now points to A2.7.
- Required pre-push gates, including the zero-baseline TypeScript check, run
  during publication; no bypass is used.
  The first typecheck caught a missing required `empty` flag in the new test
  fixture. The fixture was corrected; production state handling was unchanged.

Raw outputs are compressed beside this file. Screenshots and selected result
JSON contain only synthetic test data; auth traces/tokens are not included.

## Next

A2.7: reconcile the remaining legacy artifact parity, then complete step-aware
aliases and the no-project rule. Screen/route/catalog removal must follow that
reconciliation and its reachable replacement proof.
