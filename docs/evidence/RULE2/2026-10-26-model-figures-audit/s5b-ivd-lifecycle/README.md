# Rule 2 · S5b IVD lifecycle, QMS and pathway eligibility: the calculators and checks read no missing or malformed input as an answer

**Rule:** CLAUDE.md Rule 2 and "fail closed, never fabricate".
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1** (a repair of shipped behaviour). The coordinating session
approved S5b under F1 and holds its files (`54da281ca`, `.design/claude-convergence/COORDINATION.md`): the IVD
lifecycle modules, the QMS and pathway-eligibility assessments and their definitions, and (`d1e158266`) the QMS
route in `server/routes/submissions.ts`, whose two edits it cleared for this commit. This is the last of the four S5b
commits (after `4766b5061`, `089047f7a` and `d9878ab1e`), and it releases the hold.
**Audit:** `../design.md`, S5b: `assess_iso17511_traceability`, `assess_scientific_validity`,
`assess_shelf_life_stability`, `assess_accelerated_stability`, `assess_qms`, `assess_pathway_eligibility`.
**Date:** 2026-11-09 (planned read-only on 2026-11-08, then corrected by an independent critic).

## The defect

None of the five engines checked a value. Each input below was run on the engines as they were before this change.

- **Traceability** (`assess_iso17511_traceability`, `regulatory/iso-17511-traceability.ts`). Every input is
  required by the definition, and none was checked.
  - `{ tier: 'si_unit' }` returned `valid: false`, completeness 0, and four gaps nobody stated, such as
    "Commutability of the reference material with clinical samples is not demonstrated".
  - A complete chain with `commutabilityDemonstrated` omitted returned that gap; with `'false'` (text) it returned
    `valid: true`, completeness 1.
  - `tier: 'SI'` returned `tierRank: -1` and no recommendation.
- **Scientific validity** (`assess_scientific_validity`, `regulatory/scientific-validity.ts`).
  - A guideline item with `directlyOnTarget` omitted scored 0, "insufficient", "No evidence directly concerns the
    claimed analyte–condition association".
  - An expert-opinion item with `directlyOnTarget: 'false'` (text) was counted on target.
  - `source: 'Guidelines'` scored nothing, with no gap; evidence given as text, or a `null` item, crashed with a
    `TypeError` into the tool's `{ error }`.
- **Real-time stability** (`assess_shelf_life_stability`, `stats/analytical-performance-extensions.ts`).
  - With `maxPercentChange` omitted, or `NaN`, a declining series returned `shelfLife: null` (which the result type
    documents as "no measurable degradation") and `withinSpecAcrossWindow: false`, as a computed result.
  - `maxPercentChange: '10'`, `initialValue: '100'` and a point with `time: '30'` (text) were coerced and read.
  - Two points at one time, or a point with no value, returned all nulls and "out of spec".
  - The definition said an omitted `initialValue` "Defaults to the first point"; the engine uses the regression
    intercept, and the result did not say so.
- **Accelerated stability** (`assess_accelerated_stability`).
  - With `degradationThreshold` omitted it returned `predictedShelfLife: null`; with `storageTemperatureC` omitted,
    a null rate and shelf-life.
  - `storageTemperatureC: '4'` (text) returned a shelf-life of 0 (the string concatenated into the temperature);
    `temperatureC: '40'` returned a negative activation energy; `rateConstant: '0.004'` was coerced.
  - `temperatureC: -300` and two points at one temperature were read.
- **QMS readiness** (`assess_qms`, `market-specs/quality-system.ts`).
  - The ten clause ids with `capa` given as `'CAPA'` returned `ready: false`, `missingRequiredClauses: ['capa']`.
  - `[1, 2]` returned every clause missing.
- **Designation eligibility** (`assess_pathway_eligibility`, `market-specs/pathway-eligibility.ts`).
  - `fda_orphan` with `{}`, or `fda_breakthrough` with `{ serious: true }`, returned `eligible: false`: "not
    eligible" for a criterion nobody answered. The definition and the regulatory-strategy skill already said
    "undetermined".
  - `serious: 'true'` (text) was read as unanswered, not refused; `answers: [true]` was read as no answers.

## What already exists (RULE 3)

This is a completion: nothing was rebuilt.
- **The engines:** the five files above, each the one implementation of its check. None had a three-valued helper;
  eligibility already listed an unanswered criterion in `unanswered`. Their suites (`iso-17511-traceability.test.ts`,
  `scientific-validity.test.ts`, `analytical-performance-extensions.test.ts`, `tests/biostat/
  analytical-and-reader-reference.test.ts`, `tests/biostat/json-wire-contract.test.ts`, `quality-system.test.ts`,
  `qmsr-crosswalk.test.ts`, `pathway-eligibility.test.ts`) pin the stated results.
- **The definitions:** `server/services/ana/ivdLifecycleTools.ts` (the four IVD tools) and
  `server/services/ana/submission-center-tool-defs.ts` (`ASSESS_QMS`, `ASSESS_PATHWAY_ELIGIBILITY`).
- **The handlers (`AnaToolExecutor.ts`, not touched).**
  - The four IVD handlers call their engines through `ivdComputed` and `ivdError`, not `runStatsTool`. A success
    carries `statedInputEnvelope`. On a throw, `ivdError` answers `needs_parameters` naming any schema-required input
    that is null or missing; otherwise a non-`TypeError` whose message `isStatsParamError` accepts ("must be",
    "required", "at least" …) is `needs_parameters` with that message; anything else is `{ error }`. So a
    `ComputationRefusal` reaches AnA as `needs_parameters` with the engine's message, which names the field, but
    without `code` or `field`. An omitted boolean never threw, so it was computed.
  - `assess_qms` and `assess_pathway_eligibility` catch any throw as `{ error: "<tool> failed: <message>" }`, as
    their siblings do for validation (`assess_combination_product`). `assess_qms` assesses only when
    `present_clause_ids` is a list; `assess_pathway_eligibility` only when `answers` is an object.
  - Relaying `biostatsRefusal` in `ivdError` and in those two catches would add `code` and `field`. It is not done:
    nothing is computed from a refused value, and the red test passes without it.
- **The routes.** `routes/ivd-lifecycle.ts` runs the four IVD engines through `calcK`, which answers any throw 422;
  it is not touched. `routes/submissions.ts` runs the QMS check (`POST /device/qms/assess`, a zod list of strings) and
  the eligibility check (`POST /designations/:id/assess`, a zod record of booleans, so a malformed answer never
  reaches the engine). No client caller of either was found.
- **The shared readers, reused:** `refuseUnlessStated` and `ComputationRefusal` (`ana-biostats/computation-engine.ts`),
  `statedBoolean` and `statedNumber` (`immunogenicity/immunogenicity-reference.ts`).
- **Other code with similar names, not touched:** the global-RI designation engines
  (`global-ri/special-designations.ts`, pinned by
  `special-designations-orphan-unassessed-criteria-not-ineligible.test.ts`, and `global-ri/expedited-programs.ts`),
  the study-design eligibility model (`study-design/eligibility-model.ts`), the IVD knowledge base's
  scientific-validity entries, and `estimate_shelf_life` / `estimate_recorded_shelf_life`, the CMC shelf-life tools.
- **The skills:** `diagnostics.ts` (scientific validity, traceability), `cmc.ts` (the two stability tools),
  `quality-systems.ts` and `device.ts` (`assess_qms`), `clinical.ts` and `regulatory-strategy.ts`
  (`assess_pathway_eligibility`). No line becomes false; the regulatory-strategy line "stays undetermined while any
  criterion is unanswered" is now what the engine returns.
- **Searches run:** `git grep` for the six tool names, the five function names, the engine file names,
  `IVD_LIFECYCLE_TOOLS`, `ASSESS_QMS`, `ASSESS_PATHWAY_ELIGIBILITY`, `missingRequiredClauses`, `unanswered`,
  `initialValue` and `not_stated` across client, shared, server, scripts and tests.
- **History:** `git log --all` shows only `fbe9ab4d9`, `9dcbd060a` and `4eda1a3dd` on the five engines and
  `ivdLifecycleTools.ts` (with `--full-history`, merges down to `182fed957`, the shallow root).
  `git log --all --diff-filter=D --name-only`, filtered for `17511|traceab|scientific-valid|stability|arrhenius|
  quality-system|qms|pathway-eligib|designation`, finds only `server/services/innovation/auto-traceability-service.ts`,
  a requirements-traceability service, not calibrator traceability. The clone is shallow.

## The change

- **Traceability.** The tier and the five facts are refused by name when missing or malformed
  (`refuseUnlessStated`); a stated chain is assessed exactly as before.
- **Scientific validity.** `evidence` must be a list; each item's `source` must be one of the five listed and its
  `directlyOnTarget` true or false, refused by index (`evidence[1].directlyOnTarget`).
- **Stability.** The points must be a list of at least two, each field a finite number in range (time 0 or more;
  temperature above −273.15 °C; rate constant above 0), with at least two distinct times or temperatures.
  `maxPercentChange` (above 0), `storageTemperatureC` and `degradationThreshold` (strictly between 0 and 1) are
  required; a stated `initialValue` must be a non-zero number. Each is refused by field. The real-time result gains
  `initialValueSource: 'stated' | 'regression_intercept'`.
- **QMS.** An id that is not a clause id is refused by index (`presentClauseIds[9]`), never counted missing.
- **The QMS route** (`POST /api/submissions/device/qms/assess`, `server/routes/submissions.ts`), cleared by the
  coordinating session. With the engine change alone, `{ presentClauseIds: ['CAPA'] }` would have answered 500
  `INTERNAL`: `fail()` has no status for `invalid_input`, and a `ComputationRefusal` cannot carry the `VALIDATION`
  code its table maps. The route now answers that refusal 400 `{ code: 'VALIDATION', message, field }` before
  `fail()`. Its schema no longer defaults an omitted `presentClauseIds` to `[]`, which answered `{}` with 200,
  `ready: false` and all ten clauses missing; `{}` now answers 400. No client caller of the route was found.
- **Eligibility.** `eligible` is `true` only when every criterion is answered true, `false` when any is false, and
  `null` while one is unanswered and none is false. A non-boolean answer is refused by criterion
  (`answers.serious`); `answers` that is not an object is refused.
- **The definitions** say what is refused, the shelf-life `initialValue` describes the intercept, and the unread
  scientific-validity inputs (`intendedPurpose`, `reference`, `subjects`) say so. All stay far under 1,024
  characters (524 to 726). The eligibility description keeps the words "eligible" and "met", which the tool selector
  scores ("are we eligible for breakthrough therapy designation" ranks it 24th of the 50 offered, as before).
- **`pathway-eligibility.test.ts`** pinned `eligible: false` for an unanswered criterion; its two expectations are
  updated in place to `null`.
- **The design** records this family's "What already exists" and its result, and its status row. This is the last
  S5b commit: S5b leaves the queued row, and the S5b hold in `.design/claude-convergence/COORDINATION.md` is
  released.

**Stated inputs whose result changes.** Fully stated, well-formed inputs were compared with the engines before this
change: 160 traceability chains (every tier and fact), 1,111 evidence lists (every combination of up to three items
over the five sources, on and off target, in order), 640 real-time series (four time grids, five starting values, one
of them negative, four slopes, four limits, each with and without a stated initial value), 54 accelerated studies
(six point sets, three storage temperatures, three thresholds), all 1,024 subsets of the ten clause ids, and every
fully answered criterion set of the ten designations (60).
- **Nothing changes** but the new `initialValueSource` on the real-time result.

**Results that change because an input was omitted or malformed**, for example:
- Eligibility with a criterion unanswered and none false: 50 of the 144 partly answered criterion sets move from
  `eligible: false` to `null`; the 94 with a false answer stay `false`.
- `{ tier: 'si_unit' }`, or `commutabilityDemonstrated: 'false'`: four invented gaps, or a valid chain, become a
  refusal naming the facts.
- A missing `maxPercentChange`: `shelfLife: null`, "out of spec" becomes `needs_parameters` naming it.
- `storageTemperatureC: '4'`: a shelf-life of 0 becomes a refusal by field.
- `'CAPA'`: "not ready, capa missing" becomes a refusal naming `presentClauseIds[9]`.

**Residuals, recorded rather than changed:**
- **Handler envelope.** Through `ivdError`, a refusal is `needs_parameters` without `code` or `field`; through
  `assess_qms` and `assess_pathway_eligibility`, it is the tool's `{ error }`. Both name the field in the message;
  nothing is computed from the refused value, so no handler edit is needed. The QMS refusal names the engine's
  `presentClauseIds[i]`, which the tool calls `present_clause_ids`.
- **Unread or unvalidated text.** `analyte`, `clinicalCondition`, `intendedPurpose` and `reference` are not
  validated (the first two are echoed); `subjects` is not read.
- **An answer under an unknown key.** An eligibility answer keyed by an id the designation does not have is
  ignored; the criterion it was meant for stays unanswered, so `eligible` is `null`, not a misreading.
- **A disclosed default.** An omitted `initialValue` is still the regression intercept, now said in the result.
- **A list that is not a list.** Through the tools, a `present_clause_ids` that is not a list returns the clause
  structure, and `answers` that is not an object returns the designation; the handlers decide that, not the engines.

**User-visible:** AnA no longer reports a traceability gap, a validity verdict, a shelf-life, an unready QMS or an
ineligible designation from an input it was not given or could not read. It asks for that input by name.

## Proof

Run in this session on the working tree.
- `red/before.txt`: on `d1e158266` (trunk, with the three earlier S5b commits), before this change:
  - `ivd-lifecycle-unstated-inputs.test.ts` fails 46 of 50, all on assertions; the 4 controls pass (the four "stated
    answers are kept" cases);
  - `device-qms-assess-refuses-an-unknown-or-omitted-clause-list.test.ts`: `{ presentClauseIds: ['CAPA'] }` and `{}`
    each answer 200 where 400 is expected; the stated-list control passes.
- `red/engine-only.txt`: with the engine edits and not the route's, the engine test passes 50 of 50, but
  `['CAPA']` answers 500 and `{}` still 200. That is why the route edits land in the same commit.
- `green/after.txt`: 680 of 680 pass: both tests (50 and 3), the whole `market-specs/__tests__` and the traceability,
  scientific-validity and analytical-performance suites.
- **The neighbourhood: 166 files, 4,160 tests, 4,149 pass.** It is the medical-device commit's 147 files with this
  red test, the route test and the 22 tests that import `routes/submissions.ts` (found by `git grep`). The 11 failures
  are the `tests/lineage/founder-path-lineage.pglite.test.ts` cases that fail identically on a copy of trunk without
  the S5b commits.
- **Gates:**
  - typecheck (`typecheck-no-regression --incremental`): 0 errors;
  - ESLint ratchet: no file changes its warning count; the two new tests have none;
  - `manifest:ana`: regenerated in the same commit, and only these tools' descriptions change. No renderer, scope,
    governed flag or required input changes. The six descriptions are 524 to 726 characters.
- **Mutations (the review's).** Against deliberately broken copies the red test fails: traceability unrefused (MUT7);
  an unanswered criterion ineligible (MUT8); unknown clause ids counted missing (MUT9); `maxPercentChange` unchecked
  (MUT10); `directlyOnTarget` unchecked (MUT11).

**How it was made.** A read-only planner wrote the patch on scratch copies, ran it through the real executor in a
copied mirror, enumerated the stated inputs above against the engines before this change, and re-read the plan as a
critic. An independent critic re-ran it in its own mirror, ran the stated enumeration, the QMS and designation routes
and the tool selector, and made the corrections recorded here. This session applied the corrected plan and the two
route edits the coordinating session cleared to the working tree, and ran the red, green, neighbourhood and gates
above. How S5b was planned, and an incident during the planning, are recorded in `../s5b-biomarkers/README.md`,
"Process note".
