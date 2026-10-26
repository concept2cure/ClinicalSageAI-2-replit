# Rule 2 S5a — vaccine omitted inputs

D2, continuing the existing clinical-family audit. Vaccine capabilities remain functions
of the project's clinical/study-design and CMC workflows. The founder reinforced on
2026-10-26 that specialist apps should converge into core screens tailored to project
needs; standardized central services retain their identities. The canonical client-journey
placement map records that direction. This increment adds no standalone app or service.
R-2/F2 worksheet availability remains open and unchanged.

## What already exists

- `server/services/vaccine/vaccine-knowledge.ts` owns six pure engines for CMC,
  correlates, clinical planning, lot-study planning, platforms and special populations.
  Five consume thirteen optional boolean occurrences. Missing flags currently choose
  positive or negative facts, and condition/platform references can fill product evidence.
- `server/services/ana/vaccineTools.ts` defines the existing six tools; thin handlers
  in `AnaToolExecutor.ts` call them through the shared stated-input wrapper. Clinical
  and CMC skills and a persona supply their consumers; no other direct result-type
  consumer or exact-engine tests were found. Extend these functions and definitions.
- `immunogenicity-reference.ts` owns `booleanInputStates` and strict boolean, enum and
  number readers. The computation engine owns the named refusal; S5-0 owns the result
  basis. `stats/normal.ts` already owns `normalQuantile`; the vaccine lot planner's
  private inverse-normal approximation should converge onto that canonical helper.
- `shared/navigation/callable-apps.ts`, `v2/catalogWorkflows.ts`, the launch scope,
  `.design/client-journey/INFORMATION_ARCHITECTURE.md` and its function-parity map
  already describe existing screens, callable capabilities and their workflow homes.
  Preserve those paths and safeguards while the canonical placement plan is updated.
- Searches covered the six function/tool names and vaccine/platform/lot/correlate names
  across server, client, shared, services and tests. The local deletion search
  `git log --all --diff-filter=D -- '*vaccine*' '*Vaccine*'` found no matches.
  The checkout is shallow; full-history absence is not established.

## Resulting behavior

Preserve explicit facts; expose unanswered booleans as `not_stated` and withhold dependent
conclusions. Keep condition/platform profiles as reference context, not a product marker,
threshold, efficacy link, presentation, prior evidence or eligibility determination.
Unknown clinical-pathway facts must not choose Phase 3 endpoints independently. Unknown
special-population facts must not imply no adult data or no correlate. Do not default an
unknown platform to protein subunit. Retain disclosed illustrative lot-planning assumptions,
refuse malformed/unimplemented numeric cases, and reuse canonical normal quantiles.

The five boolean consumers expose all thirteen flags through the existing shared
`inputStates` reader. Undefined/null remain unanswered; malformed boolean values use
the existing named parameter-refusal boundary without a success basis.

- CMC keeps the actual adjuvant, valences and presentation separate from `platformReference`
  (`basis: reference_only`). Missing multivalence does not imply one antigen; a missing
  multivalent count does not become two. An unknown adjuvant flag/name remains unknown,
  and contradictory no-adjuvant/name or valence inputs are refused. Presentation-dependent
  module/stability text stays unassessed; profile storage prose is labeled reference-only.
- CoP classification needs both stated flags. A known pathogen cannot supply the actual
  marker, threshold, classification or efficacy link. Registry matches remain reference
  profiles. Surrogate validation, Prentice evidence and agency acceptance are not determined
  by three booleans; a known negative link does not endorse bridging. Missing intended use
  selects no intended-use assessment.
- Clinical planning retains labeled reference phase outlines. Missing pathway facts, or
  explicit no-correlate/no-feasible-efficacy facts, do not select an efficacy/bridging
  Phase 3. Known answered facts can still describe the supported planning branch. Unknown
  seriousness withholds its safety sizing; missing novelty is disclosed. Accelerated-
  approval eligibility stays null because the shape does not establish it.
- Platform prior knowledge and master-file potential remain references; the worksheet does
  not grade product evidence or determine eligibility. Unknown reuse/population facts stay
  unassessed. The broad viral-vector category cannot establish replication competence.
- Special-population guidance retains general reference strategies. Missing platform does
  not become protein subunit, missing correlate does not choose an endpoint, and pediatric
  bridging requires stated source-data availability. General elderly guidance is independent
  of missing pediatric data. Maternal dosing is not inferred as adult-equivalent.
- Lot planning retains the disclosed illustrative defaults and the explicit 26-per-group,
  78-total fixture. It refuses nonfinite/unsupported quantities and nonreciprocal margins
  rather than clamping them or using only one displayed bound. The private inverse-normal
  copy is removed in favor of `stats/normal.ts`. Exact supplied bounds and power are reported
  without rounding a tight interval into `1–1`. This is a planning approximation, not an
  assessment of recorded manufacturing lots or observed consistency.

Platform recognition rejects incidental substrings such as “delivery system” while
preserving recognized platform and vector aliases, including compact legacy spellings.
Explicit unsupported frameworks/enums are refused. If no framework is stated, FDA is
disclosed as a citation/reference default, not a recorded project jurisdiction.

Definitions, clinical/CMC skill instructions and the capability manifest describe these
limits. Existing core-screen placement and service ownership are unchanged. The separate
direction commit `301ca385` records the founder's central-service/workflow goal in the
canonical map, handoff and `AGENTS.md`; it does not claim the remaining UI migrations are done.

## Verification

The initial engine baseline (unchanged from `7eec0035`; documentation-only `301ca385`
landed before the run) produced **53 failed / 13 passed** cases. All six explicit handler
fixtures and the four explicit CoP nomenclature combinations already passed.

The supplemental behavioral run produced **7 failed / 6 passed**, with the original
66 cases skipped. It caught the adjuvant contradiction, incidental platform recognition,
vector identity/maternal wording, pediatric source-data summary and both-false Phase 3
issues. A further **2 failed** precision cases proved tight-margin/power reporting losses.
Compatibility checks then caught compact aliases and vector identifiers rejected during
the strict-normalization correction; these are labeled regressions during implementation,
not original findings. Full compressed logs and summaries are filed under `red/`.

The first focused greens were **66/66**, then **81/81**. The final suite contains
**83 vaccine cases**, including the compatibility corrections. The final broader run
passed **1,065 tests in 32 files** after all changes: vaccine, pediatric, COA, existing
selection advice, stated-envelope/source controls, submission-center/IVD/deepening pins,
clinical/CMC skill consumers, immunogenicity/GCP, the canonical refusal helper, global-RI
pediatrics, canonical normal-precision references and project-fact context controls.

Whole-program TypeScript passed with **0 errors**. The five-file ESLint ratchet passed
with **3 fewer warnings** and validation traceability passed. The manifest diff changes
exactly the six existing vaccine tools and adds none. Full final logs and summaries are
under `green/`; source-compatible shared-branch editor changes were synchronized before
these checks. Independent review found no remaining material blocker after the final
compatibility and wording fixes.

Tests exercise pure engines and tool
boundaries; no native database or live-provider proof is claimed. Independent review
checked tri-state dependencies, reference claims, numeric precision and existing consumers.
This is not a comprehensive review of vaccine clinical methodology or every cited guideline.
