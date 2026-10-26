# A2.10: complete remaining function carryovers before folding shells

Launch row D2, client journey. Started 2026-10-26 from `f033cc722`.
Evidence: `docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/slice-A2/A2.10/README.md`.
The accepted placement map and FUNCTION_PARITY remain authoritative.

## What already exists

- `client/src/concept2cure/v2/surfaces/Projects.tsx` owns canonical intake,
  recorded client/workstream/pathway filtering and the wizard's AnA context.
  `surfaces/AnaVerbs.tsx::RegistryPicker` reads the server's filing offers,
  searches offered and refused entries, shows reference/build facts and Ask AnA.
  It does not yet carry all catalogue search labels, category descriptions or
  lifecycle reference content. Extend it; do not introduce another picker.
- `shared/regulatory/filing-catalog.ts` owns filing identities, categories,
  workflow codes and Ask AnA wording. `v2/fixtures/filings-catalog-data.ts`
  derives its taxonomy from that owner, but still owns authored lifecycle
  archetypes/clocks and workflow labels. These are reference text, not project
  progress, agency promises, readiness, deadline calculations or support grants.
- `v2/surfaces/FilingsCatalog.tsx` independently renders those same filings,
  metadata, loops and navigation links. Its Start opens an editor rather than
  preserving the choice through canonical intake. It is outside launch scope.
  Its shell can be removed only after all ten parity functions are reached.
- `v2/surfaces/ProjectPlan.tsx` already composes IND/device plans, assignments
  and Tasks. It has no lifecycle reference projection today. Extend this owner
  with exact recorded filing context, without guessing a pathway from a tenant.
- `mdx/surfaces/Overview.tsx`, `mdx/components/ClientReviewZone.tsx`,
  `mdx/MdxSurfaceHost.tsx` still own device portfolio/review behavior.
  `server/services/ana-ri/mdx-command-handlers-phase2.ts` owns the two device
  commands. A2.8 moved only the mdx alias. Remaining per-function and admission
  gaps prevent automatic retirement of device-workstream.
- `v2/surfaces/CroPortfolio.tsx`, `server/routes/cro-portfolio.routes.ts` and
  `server/services/cro/cro-portfolio-view-assembler.ts` own CRO
  engagement/roster reads; `server/routes/clients-routes.ts` owns client workspace
  creation. Projects' canonical client key does not establish a migration of
  cro_* engagement, SOW, study or submission data. Preserve these functions.
- `v2/surfaces/MissionControl.tsx` and `server/routes/mission-control.ts` own a
  separate store and characterization/readiness behavior. No production tenant
  inventory is available here; an empty local test database cannot prove that
  the legacy store has no tenant records.
- `v2/surfaces/BiopharmaJourney.tsx`, the journey reader/service and both
  creating migrations retain journey records and stage reference content.
  A2.9 removed HTTP writers, not these functions or stored data. Display-column
  review figures and the remaining parity row are not resolved by that deletion.
- `v2/registryModel.ts`, `v2/routing.ts`, `v2/surfaceViews.ts`, shared surface
  registries and navigation contracts already implement aliases plus validated
  one-time actions. Reuse that resolver for any qualified fold. Creator seed
  `20260810` is amended in place; subscription rows must not be deleted.

Searches included all five ids, components, routes, services, migrations, AnA
commands and callers. Deleted-history search found the older DeviceWorkstream
shell (`2895218b8`), useMissionControl (`440071600`) and the old MissionControl
page family (`77034aa5f`); these are evidence against recreating parallel owners.
No matching historical FilingsCatalog/CroPortfolio deletion was returned in the
available checkout. This is not proof of absence from unobserved history.

## Implementation boundary

Complete and prove the filing catalogue's reference/search/context carryovers
in RegistryPicker and Plan, then fold only its qualified shell. Reference clocks
remain visibly authored and never become project deadlines or assessed facts.
Inventory all other remaining folds with concrete current replacement/gap paths;
carry additional functions only where existing ownership and admission permit it.
No new commercial grant, external sponsor admission, legacy data deletion,
readiness engine, second project creator or parallel workflow is authorized by
this continuation.

## Verification

The expanded review clarifies the existing project-context ownership of AnA
commands `evidence_sufficiency.assess` and `reviewer_simulation.run`. Actual
source trace proves both are already independently in scope; no executable
classification or handler change is needed. Their implementations,
program ownership validation, transactions, audit and current launch/commercial
checks remain mandatory. This does not complete or retire the device shell.

Show new behavior tests red before implementation. Qualify component behavior,
shared alias/action routing, offer failure/refusal, canonical creation and a real
native-server browser journey. Preserve all mandatory push gates and TypeScript
zero-error baseline. Record exact source and residual gaps in evidence.


## Observed disposition

The qualified filing shell is folded, with all ten function rows confirmed.
Continuation snapshot 37f2ed240 qualified 378 tests/33 suites, 16 native database checks,
three native browser flows and production build. The current four-fold audit
also supplies CRO type-label corrections and proves the two project commands
were already independently in scope; their metadata clarification changes no
handler/guard/admission. Those four shells/stores remain. Formal revised OQ is
owed; normal publication acceptance is recorded in the evidence README.


## What already exists at convergence

Published A2.10a c7f320403 independently folds the same filing shell. Its shared
reference owner adds explicit active exact-identity admissions plus recorded
project-type/agency agreement, preventing coarse US/NB guide substitution.
Its surfaces/FilingLifecycleReference.tsx is the canonical collapsed reference
projection; the continuation’s v2/FilingReference.tsx has converged onto it and is removed.
Its existing catalogue-claims SQL harness uses actual schema/FK definitions,
and the continuation’s fresh-install proof belongs there. Its OQ helper also
covers exact identity and recorded Plan. Preserve these stricter owners while
carrying the continuation’s unavailable inspection/context and CRO corrections.
Both pre-merge proofs remain attributed; final combined checks are separate.


The combined 37f2ed240/c7f320403 source now passes 671 tests in 48 disjoint suites,
four native browser flows and the production build. Native SQL teardown and
normal publication acceptance are recorded separately in A2.10 evidence; no
pre-merge result is relabelled as a combined or formal execution.
