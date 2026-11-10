# Rule 2 · S5a pharmacovigilance: the PV worksheets decide no clock, threshold, tier or obligation from a fact nobody stated

**Rule:** CLAUDE.md Rule 2 and "fail closed, never fabricate".
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1** (a repair of shipped behaviour). The change spans the engine
(an S3 path), the tool definitions and the safety skill (S4 paths). The coordinating session approved it.
**Audit:** `../design.md`, S5a, the pharmacovigilance family.
**Date:** 2026-11-01.

## The defect

The six pharmacovigilance worksheets in `server/services/pharmacovigilance/pharmacovigilance-knowledge.ts` chose
regulatory answers from facts nobody stated:
- **The SUSAR clock.**
  - An omitted `seriousnessCriteria` gave a case the 15-day clock, so a fatal SUSAR stated without its criteria was
    "IND Safety Report (15-day)". The rationale then said "No death/life-threatening flag => the standard
    15-calendar-day clock applies".
  - An empty list did the same for a case stated serious. Under ICH E2A a serious case meets at least one criterion,
    so an empty list names none of them.
- **The case source.** Stage "both" with `fromInterventionalStudy` omitted became postmarketing: not a SUSAR, and the
  GVP VI obligations.
- **Required facts.** `serious`, `region`, `stage` and others were never checked.
- **The DME threshold.** An omitted `designatedMedicalEvent` chose the non-DME count threshold (a ≥ 3) in the
  signal-detection text.
- **Assessments from absence.** The causality, priority and PV-system assessments concluded from omitted
  `informationSufficient`, `vulnerablePopulation`, `newActiveSubstance` and `euMarketingAuthorization`:
  - a WHO-UMC category;
  - a priority tier;
  - "QPPV mandated";
  - "routine PV sufficient".

## What already exists (RULE 3)

This is a completion: nothing was rebuilt.
- **The engine:** `pharmacovigilance-knowledge.ts` is the one engine for all six functions. Causality already kept
  omitted Naranjo, dechallenge, rechallenge and temporal answers as `unknown`. That mechanism is extended to
  `informationSufficient`.
- **The definitions and handlers:** the six definitions are in `server/services/ana/pharmacovigilanceTools.ts`. The
  handlers go through `runStatsTool`, which labels a success with `statedInputEnvelope` and turns a
  `ComputationRefusal` into `needs_parameters` with `code` and `field`. No handler change was needed.
- **The shared readers, reused rather than copied:**
  - `refuseUnlessStated` and `ComputationRefusal` (`ana-biostats/computation-engine.ts`);
  - `statedBoolean` and `booleanInputStates` (`immunogenicity/immunogenicity-reference.ts`).

  These are the S5a precedents' readers: COA `49211250d`, pediatric `23eb03578`, vaccine `955d1b4c3`.
- **The same rule for recorded cases:** `server/services/compliance/pharmacovigilanceService.ts`
  `calculateReportingDeadline` already refuses the 7/15 window without a seriousness criterion. Its wording is
  mirrored here, not imported, because it serves persisted adverse events with another region vocabulary. Its 7/15
  table is a pre-existing second copy, recorded as a Rule 3 residual and not widened.
- **The inventory:** `../s5a-coa-pro/queued-clinical-families.md` (this family), and the 2026-11-01 re-baseline
  (`docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-11-01-plan-alignment/rebaseline-2026-11-01.json`).
- **History:** `git log --all --diff-filter=D` on the PV names finds nothing.

## The change

- **Booleans.** All 13 optional booleans report `true`, `false` or `not_stated` through `inputStates`. A malformed
  answer (`'false'`, `0`, `1`) is refused, never read.
- **Required facts.** `serious`, `region`, `stage` and each function's other required facts are refused by name
  (`missing_input`).
- **The SUSAR clock.** An expedited development case whose criteria are omitted, or empty while it is serious, gets
  `fatalOrLifeThreatening: 'not_stated'`, no 7- or 15-day clock and `fastestClockDays: 'not_assessed'`. Stated
  criteria keep their clock: death or life-threatening gives 7 days, hospitalisation 15.
- **The case source.** Stage "both" asks whether the case is from an interventional study instead of assuming
  postmarketing.
- **The DME threshold** is three-way: DME, not stated, and not DME. While it is not stated, `exceedsThreshold` is
  `null` unless the answer is the same either way.
- **Dependent conclusions** read `not_assessed`, or `null`, while what decides them is unstated:
  - the WHO-UMC category;
  - the priority tier;
  - the QPPV, PSMF and RMP need.
- **The definitions** say what an omitted flag means and claim no default.
- **The safety skill** (`skills/library/safety.ts`) now names information sufficiency for `assess_pv_causality` and
  says to ask about it.
- **The design** records this family's "What already exists" and its result, and its status row moves on.

**Residual, recorded rather than changed:** with stage `marketed` and `fromInterventionalStudy` omitted, the
postmarketing rules still apply, because the stated stage selects them, as the schema's stage text says.
`inputStates` shows `fromInterventionalStudy: 'not_stated'`.

**User-visible:** AnA's pharmacovigilance answers no longer fill in an unstated fact.
- A SUSAR without its seriousness criteria gets no 7- or 15-day clock.
- Without seriousness, region or stage, AnA asks for them.
- With an unstated DME status, the signal verdict or priority tier is withheld unless the answer is the same either
  way.
- With an unstated EU authorisation or risk profile, the QPPV, PSMF and RMP need is reported as not assessed.

## Proof

- `red/before.txt`: `pharmacovigilance-unstated-inputs.test.ts` fails 39 of 56 cases on `ffdfed428`; the 17 controls
  pass.
- `green/after.txt`: 56 of 56 pass.
- The neighbourhood passes: 15 files, 625 tests. It covers the PV tools, reporting tools, the deadline,
  board and overview routes, the skills suites, tool selection and the biostats refusal envelope.
- **Gates:** typecheck 0; ESLint ratchet unchanged; `manifest:ana` regenerated.

**How it was made.** A read-only planner wrote the patch; an adversarial critic then checked it against the code and
corrected it. It made the DME threshold three-way, read an empty criteria list as not stated, added the missed safety
skill and the design's paragraphs, and fixed the prose. The critic's corrected edits and red test were applied.
