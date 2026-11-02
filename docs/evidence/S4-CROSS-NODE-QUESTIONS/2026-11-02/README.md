# S4 — AnA asks what ten silent cross-node rules were waiting on

Package **S4** ("AnA … asks the right questions"), 2026-11-02. Founder directive of
2026-10-12: AnA asks with an actionable selection of positions the person can take,
with an Other, subject-matter intelligent across device, diagnostics and biotech.

## What already exists

- **The rules:** the cross-node rules, `server/services/ana/intelligence-questions/`.
  Before this change they were in `issue-detector.ts`. They are now in
  `cross-node-rules.ts` and `cross-node-rules-stability.ts`, split out under RULE 6.
  `issue-detector.ts` still runs them.
- **The mitigation contract:** `cross-node-context.ts`.
  - A rule asserts an absence only when its mitigating question was asked, reached
    and left blank or refused.
  - Where the flow asks none of the rule's mitigating questions, the state is
    `unasked`. The rule then stays silent rather than assert something AnA never
    asked about.
- **The gate:** `__tests__/cross-node-rules-can-fire.test.ts`. It requires every rule
  to be reachable in each flow it applies to, or named in `NOT_ASKED_YET` with a
  checkable reason (`asks none of: a, b, c`).
- **Governed positions:** `QuestionOption.commits` / `.authority` and
  `QuestionField.allowOther` (`shared/types/intelligence-questions.ts`). The pattern
  follows `shared/regulatory/*-positions.ts`.
- **Engines reused, not restated:**
  - `services/cmc/shelf-life.ts` `q1eExtrapolationLimit`, for the ICH Q1E ceiling;
  - `services/biomarkers/biomarker-knowledge.ts` `EnrichmentDesignOption`, for the
    four enrichment designs;
  - `shared/ana/question-predicate.ts` `evaluatePredicate`, for yes/no coercion.

  The designs proposed a new `affirms()` helper. It was not added, because it would
  duplicate the shared predicate's coercion.

## The measurement

`NOT_ASKED_YET` held 21 rule/flow pairs across 10 rules. Each was silent, with a
written reason naming the unasked mitigation.

The gate accepted a reason whenever the fields it named were unasked. It was
tightened so that a reason must account for **every** dead side of a rule. On the
unchanged tree that turned **14 of the 21 entries red**: in each, the rule's
**triggers** were asked by no flow it applied to either. A rule that is dead on both
sides cannot be revived by asking only one of them, so each rule was re-read against
the interview it serves.

The gate's run on the tightened code, before any rule was fixed, listed all 14 pairs.
After the change the gate is green. One entry remains, and it is true:
`xn_stability_insufficient_for_shelf_life/cmc_specification`. The CMC specification
interview asks no shelf-life claim and no long-term data. It was dead before this
change too, and hidden.

## Method

- **Design and review:** one investigator per rule. Each read the rule, the flows it
  applies to, and the real flow definitions (`nodes[].fields[]`, never a text search).
  An independent adversarial reviewer followed each investigator, told to refute the
  design. Run `wf_bcd2362c-a32`: 20 agents, 0 errors. All ten designs came back
  "sound with corrections".
- **What the reviews corrected:**
  - an overstated reading of 21 CFR 314.126(b)(2)(v);
  - two gates that would have fired for programmes the rule does not apply to:
    emergency-use INDs, and healthy-volunteer studies;
  - a remap that would have reported one fact twice and scored it twice. This was
    human factors: both device flows already have a node check on the same answer.
  - an `allowOther: true` that does not type-check;
  - several citations a sponsor would read. Project Optimus and ICH E16 are not
    about patient selection, and "FDA expects" overstated a guidance.
- **Implementation:** done by this session, rule by rule.
- **Verification by failure:**
  - The tightened gate went red on the real tree.
  - Each stale entry failed "writes no reason for a pair that IS reachable" until it
    was removed.
  - The human-factors tests, run against the old rule, fail 6 of 8.
  - Reverting the REMS boolean read makes its `true` case fail.
  - Restoring the orphan rule's old trigger ids makes three tests fail.
  - The refactored gate rejects a reason that names one dead trigger out of three.

## Per rule

| Rule | Was dead because | Now |
|---|---|---|
| `xn_high_risk_device_no_human_factors` | Trigger `risk_level` asked nowhere. The substring `'iii'` missed `class_ii_pma`. The mitigation was asked nowhere. | Remapped onto each device flow's own summative-testing field. It defers to the node check that already reports a "no": one fact, one finding. |
| `xn_biologic_no_immunogenicity` | The BLA asks `product_class`, not `product_type`. One mitigation was a node id. | Remapped onto `ada_assay_strategy` (351(a)) and `immunogenicity_comparison` (351(k)). |
| `xn_iso_14971_no_post_production` | Triggers asked nowhere. Both mitigations were node ids. | Remapped onto `iso_14971_applied` and a surveillance plan OR complaint handling. The risk-management flow is dropped: its own node check makes this finding. |
| `xn_accelerated_approval_no_confirmatory` | Read `regulatory_pathway`, which neither flow asks. | Remapped onto `accelerated_pathway`. Two node checks that fired a CRITICAL at every traditional-approval "no" were **deleted**; this rule replaces them (named by path in commit `1634ac5ad6`). |
| `xn_phase3_no_interim` | Triggers not fields (`sample_size` is a node id). Mitigation asked nowhere. | Asks `interim_analysis` (six positions plus Other), gated to large confirmatory non-adaptive designs. |
| `xn_rems_without_etasu` | The labeling flow asked the trigger and not the elements. | Asks `rems_elements` (FD&C 505-1 subsections), only for a prescription drug or a biologic. |
| `xn_global_trial_no_ethnic_bridging` | Required `countries` to be an array of more than three; it is free text. | Asks `ethnicity_factors` (ICH E5/E17 positions) where an East Asian country is listed. The gate and the rule read one word list. The IND pair is removed: the IND asks no enrolment geography. |
| `xn_stability_insufficient_for_shelf_life` | Its four ids were asked by none of its flows. | Reads each flow's ids. The NDA asks the dating period, and its banded data answer fires only where the claim is past the limit for every value in the band. The BLA asks the dating period and real-time months, held to Q5C by product class. |
| `xn_orphan_without_natural_history` | Triggers (`expedited_designations`, `special_designations`) asked by none of its four flows. | Reads `orphan_designation` in every vocabulary. Asks `natural_history` in each flow. The NDA gains an `orphan_designation` question it never had. It fires at filing only without a concurrent control. |
| `xn_oncology_no_biomarker_strategy` | The IND asks neither trigger. A haematologic malignancy never contained `'oncology'`. | Asks `is_oncology` and `biomarker_strategy` (nine positions shared by protocol and IND in `flows/protocol-development-biomarker-selection.ts`). The NDA asks how the indicated population is identified. |

## Not done here: found, stated, left for their owners

- **`contains` is false on a multi-select array** (`shared/ana/question-predicate.ts`).
  At least these gates and branches are dead because of it:
  - the NDA `endpoint_analysis` branch;
  - `pmc_pme.accelerated_approval_conditions`;
  - the NDA and BLA `etasu_description`;
  - protocol `pediatric_study_plan`.

  None of the new questions uses `contains` on an array.
- **IND immunogenicity counts one fact as two CRITICALs:** the node check
  `biologic_no_immunogenicity` and the cross-node rule both fire on the same answer.
  This predates the change. The reviewer ruled it out of this rule's scope.
- **Node-check wording outside these rules overstates guidance:**
  - human factors "requires", in the 510(k) and PMA node guidance;
  - `no_post_market_plan_check`, on 21 CFR 814.82;
  - the adaptive-design node, on ICH E20 as a draft.
- **The oncology design's optional step 7 was not taken:** a companion-diagnostic
  question for the BLA. It is a scope widening.
- **Ethnic factors:** a trial with no East Asian sites whose data will be filed with
  PMDA or NMPA is not covered. Feeding this answer to `region-design-rules`
  `ethnicSensitivityAssessed` is a separate completion.
- **Citations held at less than verified confidence are said to be so in the text a
  sponsor reads:**
  - the December 2023 MHLW notice ("reference to be verified");
  - the 2023 registries guidance ("date to be verified");
  - theranostic patient selection ("unverified");
  - "complementary diagnostic" ("unverified").
- **#7 (S4):** the designation, paediatric-plan and comparability questions exist in
  divergent per-flow vocabularies. This change added the NDA `orphan_designation`
  in the IND's vocabulary, and left convergence to that task.
