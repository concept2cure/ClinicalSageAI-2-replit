# D0-14: the spark marks an AnA action, and only that (D0.md §8.1, 2026-11-09)

**The finding.** The D0 review raised this as a spec question, and D0.md §8.1 decided it. `AnswerLead` drew
`I.sparkles` on every lead action by default. Actions that only change local state still carried the mark AnA's
actions carry. Two examples:
- "Open a pediatric plan" opens a form.
- "Review sections on changed sources" asks AnA, but drew a shield.

A spark on an action AnA does not take is a false signal. §8.1 set an order: the owners add the spark to their own
`ask()` actions first, and then D0 flips the default, so that no AnA action loses its mark in between. This commit does
both halves at once.

## What already exists (RULE 3)

- **`client/src/concept2cure/v2/AnswerLead.tsx`.**
  - `AnswerLeadAction` already has an optional `icon`.
  - The button rendered `{action.icon ?? I.sparkles}`.
  - No new prop or component is added.
- **The lead actions, all in `surfaces/`.**
  - The TypeScript parser finds 35 literal lead-action objects across 18 surfaces, counting each branch of a
    conditional.
  - 14 of them ask AnA through `ask(…)` or `onAsk(…)`, in 10 surfaces: BiopharmaSpecialty ×4, DesignControlsTrace ×2,
    CrlLibrary, HumanFactors, IndLifecycle, NdaCockpit, PrecedentEngine, RiskRegister, SafetyNarrative and SourceTracer.
  - Only SourceTracer's had an icon, `I.shieldCheck`.
  - One action is held in a variable: Review's `signAction` ("Review …", "Open the queue"). Both of its branches are
    local.
- **What is not a lead action that asks AnA.**
  - DeepResearch's "Launch this research" runs the research engine, not an `ask()`.
  - EctdCoauthor's "Run eCTD validation" and Etmf's "Generate the … package" are engine steps.
  - None of the three carries the spark.
- **Owners.** Every surface is open to `F1` (repairs, `**`). SafetyNarrative is also `S3`, and DeepResearch `S4`. The
  only edit in a surface is the `icon` property on the action object. No behaviour changes.

## The change

**`AnswerLead.tsx`.** The default is `action.icon ?? null`, and the prop's doc comment states the rule.

**Fourteen actions now pass `icon: I.sparkles`:**
- **SourceTracer:** the shield becomes the spark, the one sign for "AnA does this".
- **IndLifecycle:** its one action asks AnA in two of its three states. In the third, "Assemble the submission
  sequence", it navigates. So it passes `R.assessed && R.ready ? undefined : I.sparkles`.
- **HumanFactors:** only the "Draft the HFE/UE report" branch asks AnA, so only that branch has the spark.
  "Mitigate …" and "Record a hazard-related use scenario" open local forms and stay plain.

**Documents.** D0.md §8.1 records that this is done.

## Red, then green

`client/src/concept2cure/v2/__tests__/answerLeadSpark.test.tsx` makes two checks:
1. **The component.** An action without an icon draws no `svg`. One given `I.sparkles` draws it.
2. **Every literal lead action in v2,** read with the TypeScript parser. The spark is present if and only if
   `onClick` calls `ask(` or `onAsk(`.
   - Floors: more than 15 actions found (35 today), and more than 5 that ask AnA, so a parser change cannot pass it empty.
   - A variable-held action is named, so a new one is seen.

| Run | Result | Detail |
|---|---|---|
| At HEAD, with the change stashed (`red-at-head.txt`) | 2 of 2 fail | The default drew the sparkles `svg`, and 14 actions ask AnA with no spark. All 14 are listed. |
| With the change (`green.txt`) | 2 of 2 pass | |

A first run of the green side found 3 actions that a text grep had missed: IndLifecycle, PrecedentEngine and
RiskRegister. That is why the check reads the syntax tree.

## Gates

- **Suites that render the changed surfaces or `AnswerLead`:** 119 files, 1,090 cases, all pass.
- **ESLint:** 0 errors on the changed files. The 37 warnings are the existing function-length and complexity warnings
  on these surfaces. None is new.

**What this is not.** It is not the running-app walk. Whether the spark is seen only on AnA's actions in the seeded app
is part of the D0 acceptance walk (D0.md §7), which is still owed.
