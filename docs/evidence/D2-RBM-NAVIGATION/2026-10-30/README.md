# Reach existing Risk-Based Monitoring from the main rail and project setup

W1 / D2, founder request 2026-10-30 / decision P-76. The existing RBM workspace
is reached from the main rail immediately after CMC. New project setup offers an
unchecked RBM choice, records it on the real project, repeats it in review and
reaches the same workspace from Evidence. Selected projects can start monitoring
without fabricated assessments, scores or clinical-study records.

**Release pending:** the reachability and setup work has passed the bounded
checks below, but approval-ceremony review found that reauthentication did not
persist the canonical `electronic_signatures` record. The existing signature
ceremony must be reused and the successor qualified before publication. The
predecessor tests below are not proof that this remaining approval gap is closed.

Professional-tier licensing, project sharing and editor/human-confirmation
checks remain the governing owners. No default module grants, new monitoring
engine or clinical-ops/store convergence are included.

Contract: `docs/design/RBM_NAVIGATION_PROJECT_SETUP_2026-10-30.md`.

## What already exists

Discovery inventory at `787b45505`, before this completion. These entries describe
the existing owners and the gaps found then, rather than the final UI behavior.

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
  project linking, API claims and admission (slice 25). Current founder request
  of 2026-10-30 explicitly authorizes rail reachability and project-setup choice.
  It does not request clinical-ops/store convergence or replacement engines.

Searches cover RBM/risk-based monitoring aliases, nav/registry/launch/AnA,
project wizard/intake, service/routes/tables and deleted history. Raw inventory
is retained privately under `/workspace/.cloud-setup/rbm-navigation/`.
Deleted history finds 3 historical retirements/rewrites, not an absent module.

## Qualification

The latest combined root result described here is the exact **pre-ceremony
successor** at the source epoch recorded by `final-02-*`. Release remains pending
the canonical signature-record fix, its affected regression/build/lint, whole
TypeScript, normal push gates and fresh remote/source proof. Earlier successful
cohorts retain their own source pins; their counts are not borrowed for successors.

- Navigation: initial RED **37 passed / 31 failed** on unchanged inputs. Raw
  receipts distinguish the omitted rail/scope failures from overbroad test-array
  comparisons. The intermediate **64/68** corrected four test bindings involving
  appended synthetic verdicts and existing accessible lock copy. Final owned
  **68/68 across 3 files**, with 12 inputs stable; all 67 original shell assertion
  lines remain preserved.
- Project setup/context: real-wizard RED **0/1**; later failures included raw
  browser bearer drift and batched project A→B→A. Producer qualification passed
  **174/174 across 8 files**, with 13 inputs stable. A JSX-space successor was
  verified in the browser. Test-only decomposition preserved the same 174 cases
  in 9 files, which the combined root regression then exercised.
- Server: REDs reproduced private-project dispatch, unsigned active seeding,
  mismatched/ignored target aliases, retained-child leakage, signed-record
  mutation, missing amendment creator and seed ownership mistakes. PGlite
  executed migration DDL and exposed an invalid site-risk soft-delete column.
  Producer qualification passed **184/184 across 11 files**, with 26 inputs
  stable. Two readability extractions preserved order, arguments and provenance;
  the root combined regression exercised their successors. These checks did not
  establish persistence of a canonical electronic-signature ceremony record;
  that separate release-review finding remains open above.
- Root combined attempt 1: **890 passed / 1 failed across 48 files**, exit 1,
  zero skipped and all 98 selected inputs stable. The failure was a stale
  expectation that `/api/mdx/Rbm-Kris` remained refused after RBM admission.
  The same mixed-case path moved into the allowed loop, while mixed-case
  `/api/mdx/Ldt` remained a refusal control. No production change was needed.
- Root combined retry (`final-02-*`): **891/891 across 48 actual files**, exit 0,
  zero failed/skipped and all 98 selected inputs unchanged. This is the current
  recorded pre-ceremony regression, including affected intake/context/access,
  engine, AnA, project-sharing, endpoint and retained correspondence consumers.
  It must not be presented as execution of the forthcoming signature successor.
- Production build: **exit 0**, with 98 selected inputs unchanged through the
  build at `50bf225d`. The mixed-case expectation correction afterward changed
  only a test, not the built production sources. The signature implementation
  successor still requires its own appropriate build qualification.
- In-memory changed-file lint: **0 errors, 189→189 warnings, delta 0**, including
  the corrected mixed-case test. The initial lint harness exceeded its historical
  text buffer; the harness limit was corrected without temporary TypeScript
  files. Earlier added warnings and the test/helper refactors are retained in
  their exact receipts. Lint must be repeated for the signature successor.
- Actual Chromium Rail: **5 checks**, 23 selected inputs stable, covering desktop
  and phone, keyboard focus, placement/navigation and Professional lock. Actual
  wizard: **12 checks**, 28 selected inputs stable, covering desktop/phone
  selection, review, the submitted boolean and exact mocked project opening.
  Auth/HTTP records and POST replies were synthetic intercepted fixtures; no
  backend project, grant or assessment was created. The cached-host intermediate
  is explicitly unqualified; the final corrected-copy capture restarted the
  fixture host and verified the served label in the actual DOM.
- Browser CSS limit: these browser receipts precede the later canonical
  `surface-text-ramp.css` successor. A narrow source review found only the added
  `.qms-training-successor` selector and corresponding generated selector-list
  bookkeeping; no RBM selector behavior changed in that diff. This does **not**
  constitute an exact-current whole-CSS browser rerun. Screenshots keep their
  original source scope and are not relabeled as later browser execution.
- Root endpoint checks: **39/39 across 2 files** preserve nested write URLs,
  bodies and receipt metadata and refuse unrelated namespace paths. The static
  API gate first exposed the old shared base literal; explicit addresses fixed
  it without broadening claims or weakening the gate. The recorded API gate
  passes 590 named paths.
- Independent read-only review cleared pinned navigation, project and server
  boundaries and the two lint-only extractions within its stated scope. Later
  approval-ceremony review found the release blocker above. Review alone is not
  execution or proof of a completed signature ceremony.

Exact REDs, failed intermediates, source snapshots, tests and browser receipts are
retained under `qualification/` as archived by the root owner, with raw/stored
bytes and hashes in `artifact-manifest.json`. Later root receipts are added to
that archive by the root owner; this README does not mutate or replace them.
Large text is deterministically compressed. Cohorts and browser scenarios overlap;
do not add their counts. Selected source pins are not a complete dependency closure.

## Publication and acceptance limits

Publication is pending. This packet currently proves local mounted HTTP,
SQL/PGlite and explicitly synthetic browser behavior only at the named sources.
It does not establish native PostgreSQL RLS, an authenticated hosted deployment,
clinical validation or agency acceptance. A successful current-source whole
TypeScript check, normal gated push and fresh remote/source verification still
need their own receipts after the approval-ceremony successor is complete.
