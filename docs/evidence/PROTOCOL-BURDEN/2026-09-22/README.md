# Protocol complexity and participant burden — deterministic engine over the SoA

**Date:** 2026-09-22 · **Worker:** PC2 (control tower) ·
**Scope:** gap 1 of *"What is genuinely missing"* in
`docs/design/PROTOCOL_DESIGN_CONVERGENCE.md` — protocol complexity and
participant burden. Nothing else from that list.

Before this change `grep -ri "complexity score"` returned nothing in the
repository. The Schedule of Activities already carried everything needed to
count burden; nothing counted it.

## Files

| File | What it is |
|---|---|
| `server/services/study-design/burden-model.ts` | The engine. Input model, measures, findings, `computeBurdenProfile`. |
| `server/services/study-design/burden-adapters.ts` | The two Schedule-of-Activities models adapted onto the one engine input. |
| `server/services/study-design/burden-delta.ts` | `compareBurden(before, after)` — the amendment question. |
| `server/services/study-design/__tests__/burden-model.test.ts` | 33 tests. |
| `server/routes/study-design.ts` | Three read-only endpoints added; no other change. |

Split across three files because `eslint.config.js` caps a file at 500 code
lines (`max-lines`), and the repo's ratchet is frozen at exactly its baseline —
a single new warning turns the gate red. No rule was suppressed.

## Public surface

```
burden-model.ts
  computeBurdenProfile(matrix: BurdenMatrix): BurdenProfile
  absentBurdenProfile(source, reason): BurdenProfile
  BURDEN_BASIS, BURDEN_SECTION
  types: BurdenMatrix, BurdenVisitInput, BurdenActivityInput, BurdenCellInput,
         BurdenProfile, Measure<T>, NotComputedNote, BurdenVisitLoad,
         BurdenAssessmentLoad, BurdenComplexity, BurdenPeakVisit,
         BurdenCellState, BurdenInvasiveness
  slice-internal, shared by the three burden files:
         computedMeasure, absentMeasure, round2, burdenFinding

burden-adapters.ts
  burdenMatrixFromDesign(design: StudyDesign): BurdenMatrix | null
  burdenProfileForDesign(design: StudyDesign): BurdenProfile
  burdenMatrixFromProtocolSoaMatrix(matrix: SoaMatrix): BurdenMatrix

burden-delta.ts
  compareBurden(before: BurdenProfile, after: BurdenProfile): BurdenDelta
  types: BurdenDelta, MeasureDelta, VisitLoadChange
```

Routes (read-only, no mutation, no audit row needed):

```
POST /api/study-design/burden            body: <design>            → { burden }
POST /api/study-design/burden/compare    body: { before, after }   → { before, after, delta }
GET  /api/study-design/:studyId/burden                             → { burden, validation }
```

### One engine, two callers

The repository has two Schedule-of-Activities models: the study-design spine
(`study-design-types.ts`) and the protocol read model
(`server/services/protocol-soa/protocol-soa-logic.ts`). The engine takes
**neither** directly — it takes a plain `BurdenMatrix` (visits, activities,
sparse cells) and each model reaches it through an adapter. There is
deliberately no second burden implementation. A test drives a
`buildSoaMatrix()` result through the same engine to prove it.

## Each measure and the exact field it comes from

| Measure | Read from | Notes |
|---|---|---|
| `visitCount` | count of `ScheduleOfActivities.visits` | all columns, scheduled or not |
| `scheduledVisitCount` | visits where `SoaVisit.unscheduled !== true` | |
| `durationDays` | `max(SoaVisit.studyDay) − min(SoaVisit.studyDay)` over scheduled visits | the **span**, not an inclusive day count. Absent unless *every* scheduled visit carries a numeric day — a span over a subset would understate the study. |
| `procedureCount` | number of `SoaCell`s | dangling and duplicate cells dropped first |
| `activityCount` | count of `ScheduleOfActivities.activities` | |
| `visits[].procedureCount` | cells per visit column | per-visit breakdown, in column order |
| `visits[].byState` | `SoaCell.state` | performed / conditional / optional / unstated |
| `peakVisitLoad` | the scheduled visit with the most cells | ties resolve to the earlier column. The heaviest single visit is the one a participant weighs. |
| `medianVisitLoad` | median of the per-visit cell counts | the basis the outlier finding compares against |
| `assessments[].scheduledVisitCount` | cells per activity row | |
| `complexity.distinctAssessmentCategories` | distinct `SoaActivity.category` over scheduled activities | absent if any scheduled activity has no category |
| `complexity.armCount` | `StudyDesign.arms.length` | absent from the protocol read model, which has no arms |
| `complexity.hasUnscheduledVisits` | `SoaVisit.unscheduled` | absent where the source model has no such flag |
| `complexity.hasConditionalActivities` | `SoaCell.state === 'conditional'` | absent where the source carries no per-cell state |
| `complexity.proceduresPerVisit` | scheduled cells ÷ scheduled visits | |
| `participantTimeMinutes` | `BurdenActivityInput.participantMinutes` summed over cells | **absent today** — see below |
| `invasiveProcedureCount` | `BurdenActivityInput.invasiveness` | **absent today** — see below |

Findings, emitted in the repo's existing `DesignFinding` shape (`code`,
`section`, `severity`, `standard`, `title`, `detail`, `suggestedFix`) so the
surfaces that already render design-gate findings render these with no new
component:

| Code | Severity | Fires when |
|---|---|---|
| `BRD-010` | minor | a scheduled visit's load is ≥ 2× the median **and** ≥ 3 procedures above it, with ≥ 3 scheduled visits (below that there is no distribution to be an outlier in) |
| `BRD-011` | major | a visit column has nothing scheduled at it |
| `BRD-012` | info | an assessment is scheduled at *every* scheduled visit, with ≥ 4 visits, and its category is not one where that is expected (administrative, eligibility, drug_administration, safety) |
| `BRD-030` | minor | `compareBurden`: the amendment raises the scheduled-procedure count |
| `BRD-031` | info | `compareBurden`: the amendment raises the heaviest single visit |

Section label `§7 Participant burden`, standard `ICH M11`. Findings that
`schedule-of-activities.ts` already raises (dangling cells, unscheduled
activities, duplicate ids) are **not** repeated — zero duplication. Dangling
and duplicate cells are dropped from the counts so a broken grid cannot inflate
a burden figure.

## What is deliberately NOT computed, and why

Every refusal is enumerated on the profile in `notComputed`, each with a
reason, so a UI shows the absence as a fact rather than a blank.

1. **Participant time.** Needs a per-activity duration. `SoaActivity`
   (`study-design-types.ts`) carries none, so the total is `not_computable`
   with `value: null`. The input model has `participantMinutes` so the measure
   computes the moment an activity carries one; if even **one** scheduled
   activity lacks it the total goes absent rather than under-reporting.
   `activitiesMissingParticipantMinutes` names which ones, so the absence is
   actionable.
2. **Invasive procedure count.** Needs a per-activity invasiveness attribute.
   `SoaActivity` carries none. The engine does **not** infer invasiveness from
   an activity's name or its category: "PK sampling" is usually a blood draw
   and sometimes urine or saliva, and a name-matched count presented as a
   measurement is a fabrication. Absent until the model carries the attribute.
   `activitiesMissingInvasiveness` names the gap.
3. **Site staff time.** No input in *either* SoA model carries staff effort.
   Not computed at all.
4. **A composite burden score.** Not published, in any form. A 0–100 index
   would need weights across visits, procedures, invasiveness and time that
   this platform has no validated or published basis for, and a weighted number
   is read as a standard the moment it is displayed. The individual counts are
   reported instead. A test asserts the profile carries no `burdenScore` and no
   `compositeBurdenScore` key, so adding one silently is not possible.

**The honesty contract.** Every measure is a `Measure<T>` carrying
`status: 'computed' | 'not_computable'`, `value` (null when absent), the exact
`basis` it is read from, and an `absentReason`. A profile where duration is
unknown is therefore distinguishable from one where duration is genuinely zero
— a real zero (a single-visit study's span) comes back `computed` with
`value: 0`, and a test pins that case specifically.

`compareBurden` inherits the property: a measure absent on either side yields
an absent delta naming the side that failed, never a delta against an assumed
zero. Visits and assessments are matched by id, so a visit whose id changed
reads as one removed and one added — which is all the data supports, and the
docstring says so.

## Tests — failing first, then passing

33 tests in `server/services/study-design/__tests__/burden-model.test.ts`,
covering a realistic multi-visit design, a design with no durations, a
peak-load outlier, an empty visit, a single-visit design, a design with no SoA
at all, the delta across an amendment that adds a visit and drops an
assessment, and both adapters.

| Log | State of the code | Result |
|---|---|---|
| `01-red-tests-before-engine.txt` | engine absent (tests written first) | 1 file failed, `Cannot find module '../burden-model'` |
| `02-red-missing-duration-as-zero.txt` | **mutation:** a missing `participantMinutes` treated as 0 | **3 failed** / 30 passed |
| `03-red-invasiveness-guessed-from-name.txt` | **mutation:** invasiveness inferred by regex on the activity name | **2 failed** / 31 passed |
| `04-red-findings-removed.txt` | **mutation:** `base.findings = []` | **4 failed** / 29 passed |
| `05-green-study-design-suite.txt` | as shipped | **all study-design tests pass** — 219 across 15 files at the time of the final capture (165 at the start of this work + 33 new here + 21 added concurrently by PC1's `region-rules-adapter.test.ts`) |

The three mutations are the defects the rules exist to catch, and each was
observed failing before the engine was reported as working:

```
02: honesty … > refuses participant time when the activities carry no duration
    honesty … > lists every refused measure, with a reason, on the profile
    honesty proof > goes absent — not to 30, not to 0 — when one activity loses its duration
      → expected 'computed' to be 'not_computable'

03: honesty … > refuses the invasive-procedure count and says it will not guess from names
    honesty … > lists every refused measure, with a reason, on the profile
      → expected 'computed' to be 'not_computable'

04: findings > flags a visit far heavier than the rest (BRD-010)
    findings > flags a visit with nothing scheduled (BRD-011)
    findings > asks about an assessment scheduled at every single visit (BRD-012)
    findings > emits findings in the repo DesignFinding shape
```

### The honesty proof

`honesty proof — removing one duration makes the total absent, not smaller`
does exactly what its name says, on one fixture:

1. Two activities, each with `participantMinutes` (10 and 20), three scheduled
   cells → `participantTimeMinutes` is `computed`, value `40`; the first visit
   is `computed`, value `30`.
2. `delete stripped[1].participantMinutes` — one duration removed, nothing else
   changed.
3. The total is now `not_computable`, `value: null`, asserted explicitly
   **not** to be `0` and not to be the partial sum `30`. The reason names
   `1 of 2 scheduled activities`; `activitiesMissingParticipantMinutes` is
   `['ECG']`. The visit that still has complete data keeps its `10`; the visit
   with the gap goes absent rather than under-reporting.

## Gates

| Gate | Log | Result |
|---|---|---|
| `tsc --noEmit -p tsconfig.check.json` | `06-typecheck-fast.txt` | **0 errors in the files changed here.** The one error in the log is `server/services/protocol-development/__tests__/design-derivation.test.ts(332,13)` — an in-flight file belonging to PC1 in this shared tree, outside this worker's scope. |
| `node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD` | `07-eslint-ratchet-since-head.txt` | `no file changed its warning count since HEAD` — 9 changed files linted, **no burden file appears** |
| `npx eslint <the five touched files>` | `08-eslint-new-files.txt` | 0 errors, 0 warnings (empty output) |
| `vitest run server/services/study-design` | `05-green-study-design-suite.txt` | 219 passed / 15 files |

Notes on the two shared-tree gates:

- `npm run typecheck:fast` was first run concurrently with PC1's full
  `tsc --noEmit -p tsconfig.json`. Both scripts set
  `--max-old-space-size=24576` against 15 GB of physical memory, so the second
  run was OOM-killed (`Killed` in the log) and its wrapper still reported exit
  0. That is a false green and was **not** accepted: the check was re-run alone
  with a heap that fits, and the log in this directory is that clean run.
- An earlier `--since HEAD` capture reported `net +2` warnings, both in
  `client/src/concept2cure/v2/surfaces/ProtocolDevWorkspace.tsx` and
  `server/services/protocol-development/pdev-view-assembler.ts` — PC1's files,
  not this worker's. They are absent from the final capture because HEAD moved.
  Either way the five files changed here contribute zero warnings, confirmed
  directly by `08-eslint-new-files.txt`.

## Scope notes

- No git command was run by this worker.
- `server/services/study-design/index.ts` was **not** touched: it is outside the
  scope given to this worker, so `server/routes/study-design.ts` imports the two
  burden entry points from their modules directly rather than through the
  barrel. Adding the three burden modules to the barrel is a one-line follow-up
  for whoever owns that file.
- Nothing under `server/services/protocol-development/`,
  `server/routes/protocol-development.ts`, `client/**/ProtocolDev*.tsx`,
  `scripts/db/migration-set.mjs` or any migration was read for write or changed.
  `protocol-soa-logic.ts` is imported for its `SoaMatrix` **type only** and is
  unmodified.
