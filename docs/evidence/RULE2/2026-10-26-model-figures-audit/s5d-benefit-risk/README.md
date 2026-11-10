# Rule 2 · S5d benefit-risk: the benefit-risk worksheets weigh, conclude and frame nothing from a fact nobody stated

**Rule:** CLAUDE.md Rule 2 and "fail closed, never fabricate".
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1** (a repair of shipped behaviour). The engine
(`server/services/benefit-risk/`) is in no narrower package. The tool definitions and the safety skill are S4 paths,
which F1 covers.
**Audit:** `../design.md`, S5d, the benefit-risk family.
**Date:** 2026-11-09 (planned in a private mirror; the plan applies to trunk `f75de861e`, which includes S5d-0,
`37135699b`).

## The defect

Inputs below were run on the engine as it is on trunk (the engine and its definitions are unchanged from `96ae110e8`
to `f75de861e`).

- **Balance** (`assess_benefit_risk_balance`). Serious condition; benefit "Overall survival" (low magnitude,
  mortality, low uncertainty); risk "Neutropenia" (moderate, fully reversible, common, low uncertainty).
  - With `mitigated: true` and `unmetMedicalNeed` omitted: `favourable_with_conditions`, net 0.115, exactly as a
    stated false. A stated true gives `favourable`, net 0.195.
  - With `unmetMedicalNeed: false` and `mitigated` omitted: `indeterminate`, net 0.043, exactly as a stated false. A
    stated true gives `favourable_with_conditions`, net 0.115.
  - `'true'` for either read as false.
  - Magnitude `'large'` was scored at 0.5. An omitted severity was scored 0.5 and printed "severity undefined".
  - Weight `'heavy'` or `NaN` gave `unfavourable` from NaN arithmetic, and weight 1.5 was clamped to 1.
  - `benefits: 'OS'` crashed (`benefits.filter is not a function`).
- **FDA framework** (`structure_benefit_risk_framework`).
  - An omitted unmet need beside an approved option gave `unmetNeedConsidered: false` and "Effective alternatives
    exist", as a stated false.
  - A stated `unmetMedicalNeed: false` with no treatment list was overridden: `unmetNeedConsidered: true`.
  - An omitted `manageable` read "Considered manageable with stated measures." and was scored as manageable.
  - An omitted severity concluded "The condition is of lower severity, which sets a higher safety bar".
  - `conditionSeverity: 'Severe'` gave the same.
  - `manageable: 'false'` read as manageable.
  - `keyRisks: 'neutropenia'` (a text) was read one character at a time: 12 evidence rows.
- **Effects table** (`build_effects_table`).
  - Direction `'Favourable'` was tabulated as unfavourable.
  - `treatmentValue: '12'` was printed as "12" and subtracted.
  - `evidenceSource: 'RCT'` read as "not specified".
  - An omitted `effects` list gave an empty table graded "high".
- **Value tree** (`design_value_tree`).
  - `weightingApproach: 'MCDA'` gave "Weighting approach not specified."
  - `importanceRank: '1'` was ranked, and `type: 'Benefit'` dropped the criterion.
- **Uncertainty** (`assess_br_uncertainty`).
  - `level: 'High'` read as not stated.
  - `type: 'bias'` was graded as a generic source, and the conclusion was judged robust.
  - `netBalanceEstimate: '0.3'` read as no margin.
- **Communication** (`plan_br_communication`).
  - An omitted `patientExperienceDataAvailable` left the PFDD line out with nothing said.
  - `includeVisualSummary: 'false'` read as include.
  - `audiences: ['Patients']` was planned as "Audience" with generic text.
  - `audiences: 'patient'` was planned as seven audiences, one per character.

The run log is in `probe-trunk.txt` and `examples.txt` beside this README: the planner's runs of trunk's engine, which
this change does not alter, in a private copy of trunk.

## What already exists (RULE 3)

This is a completion: nothing was rebuilt.
- **The engine:** `benefit-risk-knowledge.ts` is the one engine for all six functions.
  - S3 (2026-10-26, review `dd60c6e12`) made `assess_br_uncertainty` read an omitted level, side or margin as not
    stated, and `plan_br_communication` refuse an unstated verdict.
  - The CER fix made an empty benefit or risk side indeterminate.

  Each is pinned by a test in `benefit-risk/__tests__/` (three files, 26 tests), and all pass unchanged in assertion.
  S3 did not validate values or add `inputStates`, and did not reach the other four functions. This change extends
  them.
- **The definitions and handlers:** `server/services/ana/benefitRiskTools.ts`, spread into `ALL_ANA_TOOLS`. The
  handlers run through `runStatsTool`, which labels a success with the stated basis and turns a `ComputationRefusal`
  into `needs_parameters` with `code` and `field`. `AnaToolExecutor.ts` is not touched.
- **S7 (2026-11-09, `7ec502cea`)** retired `assess_benefit_risk` (`regulatory/benefit-risk.ts`) onto
  `assess_benefit_risk_balance`. Its pin `assess-benefit-risk-retired-onto-the-balance.test.ts` passes with this
  change, including its four routing prompts.
- **The shared readers, reused:** `statedBoolean`, `booleanInputStates`, `statedNumber`, `statedOneOf`, `shown`,
  `listed`, `oneOfInput` and, for the verdicts an undecided balance could give, the every-answer search's
  `conclusions` (`immunogenicity/immunogenicity-reference.ts`, the one home of the S5 helpers since S5d-0), and
  `refuseUnlessStated` and `ComputationRefusal` (`ana-biostats/computation-engine.ts`). None is copied.
- **Two readers join the home with this commit, their first caller:** `statedText` and `statedList`, `statedBoolean`'s
  twins for text and for a list. The S5d plans for this engine, post-approval and regulatory strategy had each written
  its own; the coordinating session asked that they land with their first caller rather than ahead of it. The one-home
  guard takes both names. Its new exceptions are four same-named functions that are not these: the three governance
  ledgers' text readers and dose optimization's `statedList`, which reads each entry with a reader. The readers only
  this engine uses stay local: `statedTexts`, `statedItem`, `listInput`, and `requiredOneOf`, which is now built on the
  shared `oneOfInput`.
- **The skill:** `server/services/ana/skills/library/safety.ts`, benefit-risk step 6.
- **Other benefit-risk code, not touched:** the CER generator's `calculateBenefitRiskRatio` (`cerGenerationService.ts`)
  and the CER benefit-risk interview nodes (`intelligence-questions/flows/cer-report/benefit-risk-pmcf-nodes.ts`).
  Neither imports this engine.
- **Readers of the changed result fields:** none outside the engine. `grep` for `verdict`, `netBalance`, `riskWeight`,
  `unmetNeedConsidered` and `severityContextScore` with `benefit-risk-knowledge` finds only the engine and its tests.
- **Searches run:** `git grep` for the six tool and function names, `BENEFIT_RISK_TOOLS`, `benefit-risk-knowledge`,
  `benefit.?risk`, `effects.?table`, `value.?tree`, `brat` and `mcda` in server, client and shared.
- **History:** `git log --all --diff-filter=D --name-only` filtered for `benefit.?risk|effects.?table|value.?tree|br-`
  finds only S7's `regulatory/benefit-risk.ts` and its test. The clone is shallow, so this covers local history only.

## The change

- **Booleans.** The six true/false inputs report `true`, `false` or `not_stated` through `inputStates`:
  - `unmetMedicalNeed`, in the framework and the balance;
  - `keyRisks[i].manageable` and `risks[i].mitigated`;
  - `includeVisualSummary` and `patientExperienceDataAvailable`.

  A malformed one (`'false'`, `0`) is refused by field.
- **Enums, numbers, lists and entries** are refused by field when malformed: severities, courses, statuses,
  endpoints, magnitudes, uncertainties, reversibilities, frequencies, directions, evidence sources, criterion types,
  approaches, source types, sides and audiences outside their vocabularies; a weight outside 0–1, a rank that is not a
  whole number of at least 1, a value or bound that is not a finite number; a text for a list and a non-object entry.
  The balance's benefits and risks (with each magnitude and severity), the effects (with each direction), the criteria
  (with each type) and the uncertainty sources (with each type) are refused by name when missing.
- **Balance.** The verdict is given only when every answer to an unstated unmet need or mitigation gives the same one.
  Net rises with each, so the best and worst answers bound the others.
  - Otherwise the verdict is null, `undecided` names the facts and lists the verdicts the answers give (each answer is
    tried, up to 12 unstated facts; past that, every verdict from the worst to the best), and the conclusion gives the
    best and the worst.
  - The net balance is null while either is unstated, the risk weight while a mitigation is.
  - An unstated risk's driver contribution is null, and an unstated unmet need is listed as a driver with a null
    contribution.
  - The "strengthen risk minimisation" condition becomes "State whether risks[i].mitigated holds" while the
    mitigation is unstated.
- **Framework.**
  - The unmet need is true when stated true, or when a stated list is empty or all none or supportive care, and false
    when stated false with no such list; otherwise null, and the Current Treatment Options conclusion is "Not assessed".
  - An option of unstated status reads "status not stated", not approved, and is named as a deciding fact only while no
    stated approved or off-label option settles the list.
  - An omitted manageability reads "Manageability not stated.". The risk conclusion and the overall phrase are given
    only when both answers fall in one band; the narrative gives the risk-weight and net range.
  - An omitted severity makes the Analysis of Condition conclusion "Not assessed" and `severityContextScore` null.
- **Communication.** An omitted PFDD fact adds "Whether patient-experience/PFDD data are available was not stated" to
  the patient framing. An omitted visual-summary flag or audience list keeps its default, said in `methodNotes`.
- **Disclosed defaults.** An omitted magnitude, severity, reversibility, uncertainty, endpoint, frequency or condition
  severity that a score still uses keeps its middle value and is named in `methodNotes`.
- **Size (Rule 6 split).** The citation registry, the four ordinal score tables and the condition-severity ranks, and
  24 pure functions move unchanged into the new sibling `benefit-risk-reference.ts`:
  - 22 lookups: the four score readers, the condition, endpoint, frequency and evidence-source texts and the evidence
    floor, the default importance weights and the weighting guidance, and the uncertainty-source and per-audience
    texts;
  - two helpers: `deriveMagnitude` (the ordinal magnitude from stated treatment and control values) and
    `worseUncertainty`.

  All 33 moved declarations (the six constants, the 24 functions and three types; 23,738 bytes) occur verbatim in
  trunk's engine. The six constants are deep-equal to an exporting copy of trunk's engine, and the 24 functions give
  the same results over their vocabularies (8,520 calls). The sibling's header says it holds the two helpers.
- **The definitions** say what an omission leaves, and none claims a default for a fact. The six descriptions are
  condensed to the gateway's 1,024 characters (they were 1,299 to 1,400; now 1,007 to 1,021): the shared note shortens,
  and the balance's says the verdict can be none. Their schema properties are reformatted onto single lines, with
  definitions deep-equal to the unformatted version.
- **The safety skill**, step 6, says the balance gives no verdict while a fact it turns on is unstated, and to ask for
  it.

**Stated inputs whose result changes.** Fully stated, well-formed inputs were compared with trunk's engine, ignoring
`inputStates` and `undecided`: 162,200 framework, 81,201 balance, 3,888 effects-table, 45 value-tree, 57,331
uncertainty and 2,048 communication inputs (306,713). Only 32 change: a communication plan with `audiences: []` gains
the `methodNotes` line saying all six were planned by default. Nothing else differs.

**Results that change because an input was omitted or malformed** (the old result was a default or a misreading):
- the balance examples above become `verdict: null`, with `undecided` naming `unmetMedicalNeed` or
  `risks[0].mitigated` and both verdicts;
- the framework's omitted unmet need gives `unmetNeedConsidered: null` and "Not assessed";
- the stated false with no list stays false;
- every malformed value above is refused by field, and every missing required list by name.

**Completeness probe.** For inputs with facts omitted, each determined field was checked against every completion of
the omitted booleans: 160,508 checks over 6,000 balance, 6,000 framework and 3,000 communication inputs (one to four
risks, each `mitigated` and `manageable`, the unmet need and the two communication flags stated or omitted at random).
The verdict, weights, net balance, confidence, each given driver contribution, the conditions, the unmet need, the row
conclusions and evidence lines agree with every completion, and each verdict an undecided balance lists is given by
some completion. What differs from some completion, each by design:
- the "State whether risks[i].mitigated holds" condition, which stands in for the line one answer would add;
- the included visual summary (1,387 inputs with `includeVisualSummary` omitted), a disclosed view default;
- the patient framing's not-stated sentence (559);
- the framework's unmet need, which can be false only through a treatment option's status, a non-boolean deciding
  fact the probe does not complete (507).

**Residuals, recorded rather than changed:**
- **Middle values kept.** An omitted magnitude, severity, reversibility, uncertainty, endpoint or frequency still
  scores at its middle value; each is named in `methodNotes` rather than leaving the score open.
- **Placeholders kept.** An omitted product name or indication still reads "the product" or "the indication".
- **An input not read.** `assess_br_uncertainty`'s `currentVerdict` is not read; the definition now says so.
- **Duplicated vocabularies.** The vocabularies live in the schema and the engine. The balance's monotone bounds are
  local to it; the every-answer search they stand beside is imported from `immunogenicity-reference.ts`.
- **Bounds, not every value.** An undecided risk weight or net balance lists its lowest and highest values in
  `couldBe`, not each sum between them; the framework's overall phrase lists the bands at its two bounds.
- **A later slice.** S8 reads `build_effects_table`'s effects from the approved CSR Vault source; the refusals here
  apply to whatever it passes.

**User-visible:** AnA's benefit-risk answers no longer give a verdict, call a risk manageable, call alternatives
effective or a condition mild, or leave patient-experience data out, from facts it was not given. Each names what was
not stated and asks for it. A malformed value is asked for again, not read as another or crashed on.

## Proof

Run in this session on the working tree, red first.
- `red/before.txt`: `benefit-risk-unstated-inputs.test.ts` on `f68840f22`, before the change: 69 of 78 fail, all on
  assertions. The 9 controls pass: the six stated-basis pins, and "keeps the stated answer" for the framework, the
  balance and the communication framing.
- `green/after.txt`: 168 of 168 pass in 7 files: the 78, the engine's three suites, S7's retirement test, the CSR
  builder's retirement test and the one-home guard (with `statedText` and `statedList`).
- **The neighbourhood: 172 files, 4,317 tests, 4,306 pass.** It covers every `*unstated*` suite, the skills,
  tool-selection, registry, launch-scope and tool-authorization suites, the engines' own suites, and the design's pins
  (`submission-center-tools`, `ivd-lifecycle-tools`, `deepening-tools`). The 11 failures are the
  `tests/lineage/founder-path-lineage.pglite.test.ts` cases that fail identically on trunk.
- **Gates:**
  - typecheck (`typecheck-no-regression --incremental`): 0 errors;
  - ESLint ratchet: net 0. The definitions lose `max-lines` (1 to 0) and the sibling gains it (0 to 1); the red test
    has none;
  - `manifest:ana`: regenerated in the same commit; only the six tools' descriptions change. They were 1,299 to 1,400
    characters, over the gateway's 1,024, and are now 1,007 to 1,021. No renderer, scope, governed flag or required
    input changes.
- **Sizes:** the engine is 98,936 bytes (98,802 before), the sibling `benefit-risk-reference.ts` 26,297, and
  `immunogenicity-reference.ts` 15,849.

How S5d was planned and reviewed: two read-only planners wrote the six families' plans in private copies of trunk, and
two independent critics corrected them (below). This session applied each plan to the working tree, converged its
local helpers onto the shared ones, and ran the red, green, neighbourhood and gates above. The process note on the
planning agents is in `../s5b-biomarkers/README.md`.

## Review (adversarial critic, 2026-11-09)

The first draft was sound in its rules but not in two lists, and its text described a superseded base. Found and
fixed:
1. **A verdict no answer gives.** An undecided balance listed every verdict between its worst and best answers, though
   an answer can jump a category: with one unstated mitigation and the unmet need stated, `couldBe` read
   `['unfavourable', 'indeterminate', 'favourable_with_conditions']` where only the first and last are reachable (48 of
   2,038 undecided verdicts in the probe). It now lists the verdicts the answers give, using the shared `conclusions`.
2. **A deciding fact that decides nothing.** The framework named an option's unstated status as deciding the unmet
   need even beside a stated off-label option, which settles the list. It is now named only while the list is open.
3. **S5d-0 and text.** The README and design paragraph are re-based on `f75de861e` (S5d-0 moved the answer search into
   `immunogenicity-reference.ts`); the sibling's header and this README now say it holds two helpers as well as
   lookups; the move is counted by declaration (33, 23,738 bytes); the completeness numbers are this review's. The
   design paragraph is inserted before the S5 **Pins** line so the three families read in order.

Checked and sound: the six booleans and their refusals; the monotone bound (the verdict rises with net, and net with
each unstated fact answered true, so the verdict is decided exactly when the best and worst agree: no completeness
flag on the verdict, net, weights or drivers); the framework's unmet-need rule; the stated comparison (306,713 inputs,
32 changed, each a communication plan with `audiences: []` gaining its `methodNotes` line; the same 32 against trunk
with this review's fixes); the pure move; the 1,024-character descriptions; S7's retirement pin. The engine was 99,933
bytes in the review's version, 67 under the ceiling; with `statedText`, `statedList` and `listed` imported from the
shared home instead of defined here, it is 98,936.

Critic's measured values on `f75de861e` (the committer replaces the placeholders with its own run): red 69 of 78
failing, all on assertions, 9 controls passing; green 78 of 78, 6 files and 151 tests with the engine's suites, S7's pin
and the guard; the neighbourhood 64 files, 3,413 tests, all passing.
