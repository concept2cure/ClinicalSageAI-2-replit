# Reach existing Risk-Based Monitoring from the main rail and project setup

W1 / D2, founder request2026-10-30 / decisionP-76. Existing RBM is now reached
from the main rail immediately after CMC. New project setup offers an unchecked
RBM choice, records it on the real project, shows it in review and reaches the
same workspace from Evidence. Newly selected projects can start monitoring
without fabricated assessments, scores or clinical-study records.

The implementation preserves professional-tier licensing, current-project
sharing, editor/human-confirmation authority and signed approval. Readable
retained rows, draft creation, amendment attribution and transaction ownership
were corrected before admitting the existing routes/tools. No module grants,
new monitoring engine or clinical-ops/store convergence are included.

Contract: `docs/design/RBM_NAVIGATION_PROJECT_SETUP_2026-10-30.md`.

## What already exists

- `client/src/concept2cure/v2/surfaces/Rbm.tsx`, `RbmSurfaces*.tsx`,
  `rbmBoard.ts`, `rbmWrites.tsx` already implement the live monitoring workspace:
  assessments, KRIs, QTLs, monitoring signals, patients, sites, plans and approvals.
  The current project picker lists programs with RBM data and chooses the first;
  project setup does not explicitly select this service.
- `server/routes/mdx-rbm-board.ts`, `mdx-rbm.ts`, `mdx-rbm-data.ts` and
  `server/services/rbm/` already own tenant-scoped reads, persisted writes,
  deterministic scores and governed approvals. No second monitoring engine/store.
- `shared/constants/ui-surface-registry.ui-v2.ts` already registers `rbm` and
  its granular API claims; the actual aggregated `/api/mdx-rbm` reads need review.
  `surfaceViews.ts` already routes `rbm` to the existing Rbm component.
- `registryModel.ts` / `Shell.tsx` own the main rail. `RAIL_CORE` lacks RBM.
  `shared/constants/launch-scope.ts` also lacks it; a client-only entry would
  still be withheld by the server. Existing catalog `rbm` is professional tier
  (`db/migrations/20260823_module_catalog_commercial_packaging.sql`); preserve
  commercial/role verdicts rather than adding blanket grants.
- `surfaces/Projects.tsx` owns the existing NewProjectWizard; canonical create
  uses `projectIntakeRequest.ts`, `server/routes/c2c/projects.ts` and
  `project-intake.ts`. The existing regulatory_programs metadata column can
  carry project service choices; no existing RBM setup selector was found.
- `.design/client-journey/INFORMATION_ARCHITECTURE.md` accepted direction names
  RBM as a central service, with project Evidence/study context and gaps in
  project linking, API claims and admission (slice25). Current founder request
  of2026-10-30 explicitly authorizes rail reachability and project-setup choice.
  It does not request clinical-ops/store convergence or replacement engines.

Searches cover RBM/risk-based monitoring aliases, nav/registry/launch/AnA,
project wizard/intake, service/routes/tables and deleted history. Raw inventory
is retained privately under `/workspace/.cloud-setup/rbm-navigation/`.
Deleted history finds3historical retirements/rewrites, not an absent module.

## Qualification

The implementation is frozen; root merged-source qualification and publication
are still pending. Prior successful cohorts have their exact source pins; they
are not a claim that later source changes have been executed.

- Navigation: initial RED37pass/31fail on unchanged inputs reproduced the omitted
  rail entry and scope refusal. An intermediate64/68 corrected4test bindings
  (appended synthetic verdicts and existing accessible lock copy). Final owned
  **68/68 across3files**, stable12inputs. All67original shell assertions preserved.
- Project setup/context: initial real-wizard RED0/1; later owned failures included
  raw browser bearer drift and batched project A→B→A. Final producer
  **174/174 across8files**, stable13inputs. One JSX-space successor was verified
  in browser; test-only decomposition preserves every assertion and moves the
  same174cases into9files for root's final regression.
- Server: functional REDs reproduced private-project dispatch, unsigned active
  seed, mismatched/ignored target aliases, retained child leakage, signed-record
  mutation, missing amendment creator and seed ownership mistakes. Real migration
  DDL exposed an invalid site-risk soft-delete column before correction. Final
  producer **184/184 across11files**, stable26inputs. Two subsequent readability
  extractions preserve order/arguments/provenance and are independently reviewed;
  current freeze explicitly awaits root's post-extraction regression.
- Actual Chromium Rail: **5checks**,23stableinputs, desktop and phone, keyboard
  focus, placement/navigation and Professional lock. Actual wizard: **12checks**,
  28stableinputs, desktop and phone, selection/review/submitted boolean and exact
  returned project opening. Authentication/HTTP records and POST replies are
  intercepted synthetic fixtures; no backend project, grant or assessment was
  created. A cached-host intermediate is explicitly unqualified; the host was
  restarted for the final corrected-copy capture. Exact sources/screenshots kept.
- Root endpoint checks: **39/39 across2files** preserve nested write URLs, bodies
  and receipt metadata and refuse unrelated namespace paths. The static API gate
  first exposed the old shared base literal; explicit addresses fixed it without
  broadening claims or weakening the gate. Current API gate passes590namedpaths.
- Independent read-only review cleared pinned navigation, project and server
  boundaries, including the two lint-only extractions. Review is not execution.
- Initial in-memory lint runner exceeded its default historical-source buffer;
  that harness limit was corrected without temporary TypeScript files. First full
  lint found0errors and6addedwarnings; test decomposition and small helper
  extraction address these. Focused server lint now matches101existingwarnings
  before/after with0errors. Final whole changed-file lint remains pending.

Exact REDs, all failed intermediates, source snapshots, tests and browser receipts
are preserved under `qualification/`, with raw/stored bytes and hashes in
`artifact-manifest.json`. Large text is deterministically compressed. Cohorts
and browser scenarios overlap; do not add their counts.

Local mounted HTTP, PGlite SQL and synthetic browser checks do not establish
native PostgreSQL RLS, authenticated hosted deployment, clinical validation or
agency acceptance. Current source publication requires the remaining root
checks/build, whole TypeScript, normal push gates and fresh remote proof.
