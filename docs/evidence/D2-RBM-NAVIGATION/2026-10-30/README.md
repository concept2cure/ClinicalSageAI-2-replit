# Reach existing Risk-Based Monitoring from the main rail and project setup

W1 / D2, founder request 2026-10-30 / decision P-76. The existing RBM workspace
is reached from the main rail immediately after CMC. New project setup offers an
unchecked RBM choice, records it on the real project, repeats it in review and
reaches the same workspace from Evidence. Selected projects can start monitoring
without fabricated assessments, scores or clinical-study records.

The approval gap found during release review is closed: assessment and plan
approvals now persist a content-bound canonical electronic signature, the governed
ledger and the domain approval on the same request transaction. A failed signature
write rolls them all back. Current-source whole TypeScript, normal push gates and
fresh remote/source verification remain pending; publication is not yet claimed.

Professional-tier licensing, project sharing and editor/human-confirmation
checks remain the governing owners. No default module grants, new monitoring
engine or clinical-ops/store convergence are included.

Contract: `docs/design/RBM_NAVIGATION_PROJECT_SETUP_2026-10-30.md`.

## What already exists

Initial discovery inventory at `787b45505`, before this completion, with the later
approval-review finding identified separately below. These entries describe the
existing owners and gaps found then, rather than the final UI behavior.

- `client/src/concept2cure/v2/surfaces/Rbm.tsx`, `RbmSurfaces*.tsx`,
  `rbmBoard.ts`, `rbmWrites.tsx` already implement the live monitoring workspace:
  assessments, KRIs, QTLs, monitoring signals, patients, sites, plans and approvals.
  The current project picker lists programs with RBM data and chooses the first;
  project setup does not explicitly select this service.
- `server/routes/mdx-rbm-board.ts`, `mdx-rbm.ts`, `mdx-rbm-data.ts` and
  `server/services/rbm/` already own tenant-scoped reads, persisted writes,
  deterministic scores and governed approvals. No second monitoring engine/store.
- Approval review found the existing RBM routes re-verified credentials and
  enforced authority/two-person checks but saved only approval stamps.
  `server/services/part11/signature-persistence.ts` and
  `governed-target-binders.ts` already own canonical signature persistence and
  content re-derivation. Those owners were extended for the two RBM version
  targets; no parallel signature writer or policy was added.
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

The full signature successor at `09c83267b` passed the root combined cohort,
build and zero-regression lint below. Canonical integration, the later SQL gate
successor and the latest unrelated CSR/STF merge have their own named checks and
source-preservation links. The current packet selects 147 source/test/configuration
inputs; it does not relabel earlier executions as a full rerun of current source.
Whole TypeScript, normal push gates and fresh remote proof remain pending.

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
  prove canonical signature persistence; that distinct gap was then reproduced
  and closed by the signature successor below.
- Root combined attempt 1: **890 passed / 1 failed across 48 files**, exit 1,
  zero skipped and all 98 selected inputs stable. The failure was a stale
  expectation that `/api/mdx/Rbm-Kris` remained refused after RBM admission.
  That mixed-case path moved into the allowed loop, while `/api/mdx/Ldt`
  remained a mixed-case refusal control. No production change was needed.
  The retry (`final-02-*`) passed **891/891 across 48 actual files**, exit 0,
  zero skipped and 98 selected inputs unchanged. This remains the pre-signature
  source epoch, including intake/context/access, engine, AnA, sharing, endpoint
  and retained correspondence consumers.
- Signature closure: actual mounted assessment and plan approval RED **0/2**
  showed successful activation and supersession with zero electronic-signature
  rows. The first successor passed **29/31**; its two manifest-hash failures
  exposed a fixture `JSONB` column where the creating schema uses `JSON`.
  The fixture was corrected, preserving the canonical attribution hash recipe.
  A further race RED passed **32/33** and reproduced a stale plan editor writing
  after approval. A conditional draft update now refuses that edit with 409,
  while status-only retirement remains allowed. Final producer qualification
  passed **35/35 across 1 file**, with 15 selected inputs stable. It covers both
  persisted signature targets, atomic rollback, authority/reauthentication,
  verified MFA, two-person and legacy unknown-author attribution, exact request
  connection ownership, content re-derivation, relationship coherence and the
  stale editor. The same canonical signature writer, identity resolver and
  content binder execute against real migrated RBM/PGlite domain SQL. Credential
  and project decisions and the reduced `recordGovernedAction` hashing
  collaborator are controlled; its actual fixture audit/action rows share the
  transaction. This is not a test of the full production ledger hash service.
- Signature source succession: after that 35-case run, the baseline's unrelated
  authority-note em dash was restored from a JSON escape to the existing literal
  character. Parsed data and production/test sources are unchanged. Original
  exact GREEN02 pins and source snapshots remain retained; the explicit
  typography successor and current pins are in `access-signature-final-freeze`.
  The root regression below qualifies the final exact baseline bytes. The two
  existing actuator stamp allowances now describe a tested proof across the
  caller boundary, rather than the obsolete outside-catalog deferral; no new
  allowance was added. The signature gate passes.
- Root signature-successor regression (`final-03-*`) at `09c83267b` passed
  **1082/1082 across 54 actual files**, exit 0, zero skipped and all **119 selected
  inputs unchanged**. It includes the earlier 48-file cohort, the 35 signature
  cases and five existing canonical signature/binder suites. The production
  build at the same commit passed **exit 0**, with the same 119 selected inputs
  unchanged. These are the executed successor results, not a sum of the earlier
  overlapping cohorts.
- Canonical integration: the normal merge of `0ad3a15c` into `027c07b8f` required
  only a work-order documentation conflict resolution. All 119 predecessor
  selected inputs remained unchanged. Bounded incoming review found an existing
  project-core RBM door using verified project context and availability, plus
  Vault upload receipt changes; it found no change to the rail, RBM, ProjectHome,
  server/shared contracts, dependencies or configuration. The incoming
  `projectHomePlan` test still assumed RBM was hidden: witnessed RED **20/21**.
  Commit `007c5f0b6` corrected that test expectation only. The affected merged-source
  cohort (`final-merge-green-*`) then passed **169/169 across 12 actual files**,
  exit 0, zero skipped and all **137 selected inputs unchanged**. The production
  build at `007c5f0b6` passed **exit 0**, with those same 137 selected inputs stable.
  All 119 inputs from the full signature-successor cohort remained unchanged;
  the later test-only expectation correction lies outside that prior selection.
  This is a source-preservation chain plus affected integration execution, not
  a claim that all 54 earlier files were rerun after the merge.
- First normal push refusal (`push-refusal-01-*`): the gated push of
  `4c678fa5d` exited 1 before TypeScript and published nothing. All 137 selected
  inputs stayed unchanged through that attempt. The unchanged SQL-interpolation
  gate refused two new static-fragment sites: the plan retirement predicate and
  the assessment lock mode. This was a real gate failure, not a successful push
  or whole-TypeScript result.
- SQL gate successor: the plan retirement choice is now a bound boolean at `$1`;
  the existing patch builder defensively copies optional initial arguments and
  leaves every other caller's default bindings unchanged. Assessment lock mode
  chooses between two complete literal SELECT statements with `FOR UPDATE` or
  `FOR SHARE`. No scanner, SQL baseline or allowance changed. A new actual
  PGlite case verifies a successful draft title/strategy/status edit with the
  shifted values and final record/tenant parameters, alongside stale-editor
  refusal and status-only retirement. The producer cohort passed **121/121
  across 5 files**, with 26 selected inputs stable; the signature file now has
  **36 cases**, including that added binding check. At `b0caa86b4`, the root
  SQL-successor cohort (`final-sql-*`) passed **220/220 across 12 actual files**,
  exit 0, zero skipped and all **139 selected inputs unchanged**. The production
  build at that commit passed **exit 0** with those 139 inputs stable; all four
  selected CI checks passed. The earlier 119-input preservation claim applies
  through the first canonical merge, not across the intentional SQL changes to
  two production files and one test file. These later bytes have the 220-case
  affected qualification rather than a claim that the full 1082-case cohort ran
  again.
- Latest canonical merge: `383330547` merged normally into `ee4ce3da1` without
  conflicts. Read-only incoming review found CSR/STF source-role changes only,
  with no overlap in the prior 139 selected inputs or RBM actor/project/signature
  services. All 139 prior inputs remained unchanged. Fresh local checks of the
  three affected CSR/STF suites (`final-current-*`) passed **70/70 across 3 actual
  files**, exit 0, zero skipped and all **147 selected inputs unchanged**.
  Upstream historical totals are not borrowed. The fresh current production
  build at `ee4ce3da1` passed **exit 0**, with the same 147 selected inputs stable.
  All four current CI checks have passed on those stable inputs.
- In-memory changed-file lint: the current merged-source result is **0 errors,
  190→190 warnings, delta 0**. Earlier pre-signature lint was 189→189 on its own
  changed-file selection. The initial lint harness exceeded its historical text
  buffer and was corrected without temporary TypeScript files. Added warnings
  found during development and their test/helper refactors retain their exact
  receipts. No suppression or warning-baseline increase was used.
- Actual Chromium Rail: **5 checks**, 23 selected inputs stable, covering desktop
  and phone, keyboard focus, placement/navigation and Professional lock. Actual
  wizard: **12 checks**, 28 selected inputs stable, covering desktop/phone
  selection, review, the submitted boolean and exact mocked project opening.
  Auth/HTTP records and POST replies were synthetic intercepted fixtures; no
  backend project, grant or assessment was created. The cached-host intermediate
  is explicitly unqualified; the final corrected-copy capture restarted the
  fixture host and verified the served label in the actual DOM.
- Browser CSS limit: these receipts precede later canonical CSS successors.
  Bounded source reviews found `.qms-training-successor` added to the existing
  `surface-text-ramp.css` selector lists, then new `.pj-core-work-controls` and
  `.pde-work-heading` selectors in the incoming project/protocol styles. Existing
  declarations and RBM/rail selectors did not change in those reviewed diffs.
  These reviews do **not** establish an exact-current whole-CSS browser rerun.
  Screenshots retain their original source scope and are not relabeled as later
  browser execution.
- Root endpoint checks: **39/39 across 2 files** preserve nested write URLs,
  bodies and receipt metadata and refuse unrelated namespace paths. The static
  API gate first exposed the old shared base literal; explicit addresses fixed
  it without broadening claims or weakening the gate. The recorded API gate
  passes 590 named paths. Current launch scope, launch API scope, signature
  ceremony and SQL-interpolation CI checks all pass **exit 0**, with **147 selected
  inputs unchanged** through those checks (`final-ci-summary.json`).
- Independent read-only review cleared the pinned navigation, project/access,
  signature and incoming compatibility boundaries within its stated scopes.
  Review found the missing-signature gap and checked its final closure; review
  alone is not execution, deployment or clinical qualification.

Exact REDs, failed intermediates, source snapshots, tests and browser receipts are
retained under `qualification/` as archived by the root owner, with raw/stored
bytes and hashes in `artifact-manifest.json`. Later root receipts are added to
that archive by the root owner; this README does not mutate or replace them.
Large text is deterministically compressed. Cohorts and browser scenarios overlap;
do not add their counts. Selected source pins are not a complete dependency closure.

## Publication and acceptance limits

Publication is pending. This packet proves local mounted HTTP, SQL/PGlite and
explicitly synthetic browser behavior only at the named sources. It does not
establish native PostgreSQL RLS, an authenticated hosted deployment, clinical
validation or agency acceptance. A successful current-source whole TypeScript
check, normal gated push and fresh remote/source verification need their own
receipts before publication can be claimed.
