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
successor and later canonical integrations have their own named checks and
source-preservation links. The current packet selects 310 source/test/configuration
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
- CSR/STF canonical integration: `383330547` merged normally into `ee4ce3da1` without
  conflicts. Read-only incoming review found CSR/STF source-role changes only,
  with no overlap in the prior 139 selected inputs or RBM actor/project/signature
  services. All 139 prior inputs remained unchanged. Fresh local checks of the
  three affected CSR/STF suites (`final-current-*`) passed **70/70 across 3 actual
  files**, exit 0, zero skipped and all **147 selected inputs unchanged**.
  Upstream historical totals are not borrowed. The fresh current production
  build at `ee4ce3da1` passed **exit 0**, with the same 147 selected inputs stable.
  All four current CI checks have passed on those stable inputs.
- Second normal push refusal (`push-refusal-02-*`): the gated push of
  `7b0c1f64f` reached the canonical TypeScript gate and exited 1 with **27 errors
  against a zero-error baseline**. It published nothing, and all 147 selected
  inputs stayed unchanged. Earlier hook gates, including lint and warning
  growth, passed. The hook transcript displays only 15 diagnostics; all 27 were
  extracted from the canonical incremental build information into
  `push-refusal-02-all-diagnostics.json`. The compiler cache was not altered or
  published, and no baseline, suppression or query-contract weakening was used.
- Compiler successor at `e0c8ed618`: nine files correct the actual RBM
  surface/segment test props, minimal request-database fixture assignments,
  explicit PGlite row/projection generics and the truthful assessment-seed return
  shape. The author comparison now narrows an unknown database value: only a
  missing null/undefined value is treated as a legacy unknown author; a valid
  positive integer remains an author, and any malformed non-null value refuses
  approval before a domain write. The malformed-author RED passed **36/38**;
  the final approval cohort passed **38/38 across 1 file**, with 20 inputs
  stable, preserving the valid, self-approval and legacy cases. Two other
  producers independently passed **37/37 across 4 files**, with 5 selected
  inputs stable, and **19/19 across 2 files**, with 15 selected inputs stable.
  Their assertion-bearing lines remain unchanged. These are separate,
  overlapping producer cohorts, not a sum or whole-TypeScript result.
- Vault receipt integration: incoming `819029e2c` merged into `506064adb`
  without production conflicts. The work-order documentation conflict was
  resolved by preserving the incoming Vault receipt/convergence row and the
  distinct RBM/company rows. Bounded review found only stored-title confirmation
  changes using the already validated upload receipt, with a neutral fallback
  for a blank title; actor, exact-project/ID checks, navigation, signature,
  CSS and dependency contracts remain unchanged. Root's compiler-successor
  qualification (`final-types-*`) at `506064adb` passed **334/334 across 18 actual
  files**, exit 0, zero skipped and all **153 selected inputs unchanged**. It
  includes all nine compiler changes and the five affected Vault suites. The
  production build at that same commit passed **exit 0**, with 153 inputs stable;
  all four selected CI checks passed and changed-file lint remained flat at
  190→190 warnings with zero errors. Upstream historical totals are not borrowed.
  These affected tests and build remain a distinct source epoch from the whole
  TypeScript execution and later integration checks below.
- Third normal push (`push-refusal-03-*`) at `498403dc3` passed **whole
  TypeScript with 0 errors against baseline 0** and all normal pre-push gates,
  with all 153 selected inputs unchanged. Git then refused the remote
  compare-and-swap because the canonical branch had advanced from `819029e2c`
  to `ed5c91058`. The attempt published nothing and overwrote no remote changes.
  The exact successful compiler/gate result is retained at that prior source;
  it is not relabeled as a current-source retry. No force push or gate bypass
  was used.
- Product-risk/Engineering integration: the normal merge into `5df5084dd`
  completed without conflicts; all 153 prior selected inputs remained
  byte-identical. Independent server and UI reviews found product-risk guards
  on literal risk/Engineering routes that do not match RBM, optional owner and
  navigation parameters limited to device Engineering with unchanged defaults,
  and narrowly scoped mobile risk CSS. Actor, project, sharing and signature
  services did not change. Root's affected integration cohort
  (`final-integration-*`) at `5df5084dd` passed **237/237 across 12 actual files**,
  exit 0, zero skipped and all **174 selected inputs unchanged**. The production
  build at that commit passed **exit 0**, with those same 174 inputs
  unchanged; all four selected CI checks passed and lint remained at 190→190
  warnings with zero errors. Upstream historical totals are not borrowed.
- Fourth normal push (`push-refusal-04-*`) at `59d0bd6eb` again passed
  **whole TypeScript with 0 errors against baseline 0** and all normal gates,
  with 174 selected inputs unchanged. The remote then advanced to `c3f16c8a2`,
  and Git refused the update. No remote changes were overwritten, nothing was
  published by this attempt, and no force push or bypass was used. Both this
  successful compiler result and the earlier one at `498403dc3` retain their
  exact source epochs.
- Device attachment integration: incoming `c3f16c8a2` merged normally into
  `bbaffa1f7`, with no production conflicts. The work-order documentation
  conflict retained the distinct incoming attachment row and both owned rows.
  Read-only review found only the indexed file-selection snapshot in
  `PathwayPanes.tsx` and two DossierDrawer tests: the selected file is captured
  before asynchronous attachment work, while programme/section identity and
  validated receipt handling are preserved. No RBM, shared actor/policy,
  signature or CSS contract changed. Root's affected cohort
  (`final-attachments-*`) at `bbaffa1f7` passed **38/38 across 4 actual files**,
  exit 0, zero skipped and all **175 selected inputs unchanged**. Its production
  build passed **exit 0**, with those 175 inputs stable; all four selected CI
  checks passed, and lint remained 190→190 with zero errors. The earlier
  334-case/153-input and 237-case/174-input results remain prior source epochs;
  their totals are not borrowed or added to this new affected cohort.
- Pre-push STF packaging integration: fresh synchronization found incoming
  `9e6ee17ba`, which merged normally into `0af600d7e` without conflicts. The
  seven-file change includes three production files for supportive STF files
  and agency prerequisites. Read-only review found no RBM, canonical actor,
  signature or import-side-effect change. The only overlap with the prior
  175-input selection is `stf-generator`; its new optional argument preserves
  existing callers. Root's affected packaging cohort (`final-packaging-*`) at
  `0af600d7e` passed **90/90 across 4 actual files**, exit 0, zero skipped and all
  **180 selected inputs unchanged**. The production build passed **exit 0** on
  those 180 stable inputs; all four selected CI checks passed and lint remained
  190→190 with zero errors. This is a new affected cohort, not a rerun or sum of
  the preceding attachment, RBM or upstream suites. Upstream totals are not
  borrowed.
- Fifth normal push (`push-refusal-05-*`) at `dd53c5a5f` passed **whole
  TypeScript with 0 errors against baseline 0** and all normal gates, with the
  180 selected inputs unchanged. Git refused the update after the remote
  advanced to `1ba873279`. No remote work was overwritten and this attempt
  published nothing; no force push or bypass was used. This is the third actual
  zero-error whole-compiler source epoch, alongside `498403dc3` and `59d0bd6eb`.
- Protocol workflow integration: the net incoming nine-file change is protocol
  workflow UI only. It merged normally into `837b34a03` without conflicts.
  Read-only compatibility review found no RBM, actor, server or shared-contract
  change. The protocol selection and protocol CSS are the prior selected-input
  overlaps; the workflow hook uses the existing navigation guard and unregisters
  on cleanup, so it does not leave a stale RBM navigation block. Added
  `.pde-flow` CSS selectors stay scoped to the protocol UI. Root's affected
  cohort (`final-protocol-*`) at `837b34a03` passed **28/28 across 3 actual files**,
  exit 0, zero skipped and all **187 selected inputs unchanged**. Its production
  build passed **exit 0** with those 187 inputs stable; all four selected CI
  checks passed, and lint remained 190→190 with zero errors. Previous source
  epochs remain intact; neither earlier local nor upstream totals are borrowed
  or summed into this affected cohort.
- Sixth normal push (`push-refusal-06-*`) at `624cd9285` passed **whole
  TypeScript with 0 errors against baseline 0** and all normal gates, with 187
  selected inputs unchanged. Git refused the update after the remote advanced
  to `89b67685e`. This attempt published nothing and overwrote no remote work;
  no force push or bypass was used. The successful compiler source epoch stays
  distinct from the following settings integration.
- Project settings integration: the incoming settings work merged normally;
  a subsequent test-only commit `ae4ec443d` verifies RBM compatibility.
  Independent server/UI reviews found only three editable profile fields, with
  arbitrary metadata updates rejected and existing metadata preserved. Project
  Home rereads the full programme after save using its retained owner and
  metadata epoch; it does not replace the programme with a reduced settings
  receipt. The literal RBM boolean, current-project identity and guarded RBM
  door remain intact. No broad RBM, shared actor or signature contract changed;
  new settings CSS is scoped to that UI. The focused actual settings PATCH
  regression passed **38/38**, including preservation of the RBM selection
  (`riskBasedMonitoring: true`) and an unrelated metadata key. Root's affected settings cohort
  (`final-settings-*`) at `ae4ec443d` passed **318/318 across 15 actual files**,
  exit 0, zero skipped and all **210 selected inputs unchanged**. Its production
  build passed **exit 0** on those 210 stable inputs; all four selected CI checks
  passed, and changed-file lint across 55 TypeScript files remained 190→190 with
  zero errors. This is a separate source epoch; previous local and upstream
  totals are not borrowed or summed into it.
- Catalog/task-board recovery integration: incoming `d4c745c5f` merged normally
  into `f254676b3` without conflicts. The six source/test/style inputs add honest
  catalog and task-read recovery while preserving licensing, tier locks, governed
  toggles, actor-keyed task sessions and project filters. No RBM rail, wizard,
  launch admission, shared project-context or backend access source changed.
  Root's affected cohort (`final-recovery-*`) at `f254676b3` passed **178/178
  across 11 actual files**, exit 0, zero skipped and all **220 selected inputs
  unchanged**. The production build passed **exit 0** with those 220 inputs
  stable. Changed-file lint across 55 TypeScript files against `d4c745c5f`
  remained 190→190 with zero errors. This separate source epoch does not borrow
  or sum the preceding settings, RBM or upstream totals. Its lint is retained
  as `final-recovery-lint.json`.
- Vault upload/access integration: incoming `d79abdf9f` merged normally into
  `1afc89725`; the sole work-order conflict was resolved by retaining all distinct
  owned rows. The net 26 source/test inputs include five production files.
  Independent review found the same shell-project channel, retained canonical
  actor/project guards, retired upload callbacks and final archive admission
  checks; no RBM rail or project-setup source changed. Root's affected cohort
  (`final-vault-*`) at `1afc89725` passed **119/119 across 12 actual files**, exit
  0, zero skipped and all **245 selected inputs unchanged**. Its production build
  passed **exit 0** on those stable inputs; changed-file lint across 55 TypeScript
  files remained 190→190 with zero errors. The incoming
  [D5 archive-access packet](../../D5/2026-10-30-vault-final-access/README.md)
  retains its native archive executions at its own named source; those are
  upstream evidence, not a root native-PostgreSQL rerun at this merge. Cohorts
  remain separate and overlap. Its lint is retained as `final-vault-lint.json`.
- Seventh and eighth normal pushes (`push-refusal-07-*` and
  `push-refusal-08-*`) at `3e8840459` and `5d7568304` each passed **whole
  TypeScript with 0 errors against baseline 0** and all normal gates, with all
  245 selected inputs unchanged. Git refused the first update after remote
  advancement to `af226ae6a` and the second after advancement to `8f0b6df37`.
  Neither attempt published or overwrote remote work; no force or bypass was
  used. These actual compiler source epochs remain distinct from the following
  IND/AnA integration.
- IND/AnA shared-path integration: incoming `3ab7b7220` merged normally into
  `30bacbc37` without conflicts. The net incoming 66 source/test inputs overlap
  the prior 245-input selection only at `AnaToolExecutor.ts`: one batch-drafting
  line passes the existing canonical `ctx?.sqlClient`. Independent review found
  no RBM handler, assessment-seed dispatch, admission, launch or signing-refusal
  change. Root's affected cohort (`final-ana-*`) at `30bacbc37` passed **223/223
  across 9 actual files**, exit 0, zero skipped and all **310 selected inputs
  unchanged**. Its production build passed **exit 0** on those stable inputs;
  changed-file lint across 55 TypeScript files remained 190→190 with zero errors.
  The [incoming IND packet](../../D4/2026-10-30-ind-development/README.md) retains
  its separately qualified source and tests; its whole-suite results are not
  borrowed as a root rerun here. Current-source whole TypeScript, all normal push
  gates and fresh remote proof remain pending.
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
  Later mobile product-risk CSS is scoped to the MDX risk surfaces and does not
  match RBM in the bounded incoming review. The later recovery styles use only
  `.tb` and `.workflow-page` selectors; the bounded diff does not change the
  rail, RBM or project-wizard selectors.
  These reviews do **not** establish an exact-current whole-CSS browser rerun.
  Screenshots retain their original source scope and are not relabeled as later
  browser execution.
- Root endpoint checks: **39/39 across 2 files** preserve nested write URLs,
  bodies and receipt metadata and refuse unrelated namespace paths. The static
  API gate first exposed the old shared base literal; explicit addresses fixed
  it without broadening claims or weakening the gate. The recorded API gate
  passed 590 and then 591 named paths at earlier source epochs; the settings
  source epoch's API check passes **593 named paths** with none refused. Its
  launch scope, launch API scope, signature ceremony and SQL-interpolation CI
  checks all pass **exit 0**, with **210 selected inputs unchanged** through
  those checks (`final-settings-ci-summary.json`). These are prior-epoch focused
  receipts; the current IND/AnA integration still requires all normal push gates.
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
validation or agency acceptance. Whole TypeScript and all normal gates passed at
`498403dc3`, `59d0bd6eb`, `dd53c5a5f`, `624cd9285`, `3e8840459` and
`5d7568304`; remote advancement then refused those updates. The current 310-input
integration still requires its own
compiler/gated-push retry
and fresh remote/source verification before publication can be claimed.
