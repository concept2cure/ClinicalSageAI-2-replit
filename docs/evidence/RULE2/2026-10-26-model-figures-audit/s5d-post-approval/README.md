# Rule 2 · S5d post-approval: the ICH Q12 worksheets classify, designate and plan nothing from a fact nobody stated

**Rule:** CLAUDE.md Rule 2 and "fail closed, never fabricate".
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1** (a repair of shipped behaviour). The engine
(`server/services/post-approval/`) is in no narrower package. The tool definitions are S4 paths, which F1 covers.
**Audit:** `../design.md`, S5d, the post-approval family.
**Date:** 2026-11-09 (planned in a private mirror; the plan applies to trunk `f75de861e`, which includes S5d-0,
`37135699b`).

## The defect

Inputs below were run on the engine as it is on trunk (the engine and its definitions are unchanged from `96ae110e8`
to `f75de861e`). Full log: `probe-trunk.txt` beside this README, the planner's run of trunk's engine, which this change
does not alter, in a private copy of trunk.

- **Change classification** (`classify_post_approval_change`). Each omitted risk qualifier, `solidOralProduct`,
  `modifiedRelease` and `biologicLicense` read as false.
  - A minor process change with no risk facts: CBE-0, IAIN, tier low, 21 CFR 314.70(c)(6). The sterile-process fact
    nobody stated decides PAS.
  - A composition change, solid oral, modified release unstated: PAS, II, SUPAC Level 2.
  - Every regulation was the NDA's (314.70) unless `biologicLicense` was stated true.
  - A `risk` object without its own magnitude dropped the stated top-level one. Minor scale with every risk fact false
    scored 3 (moderate, CBE-30) instead of 1 (low, CBE-0).
  - `sterileProcess: 'true'` read as false.
  - `biologicLicense: 'yes'`, `magnitude: 'Major'` and `risk: 'high'` were read as absent.
  - `changeArea: 'site'` was classified "Unclassified change", PAS.
- **Established conditions** (`assess_established_conditions`).
  - A process parameter with no facts: supportive information, Annual Report.
  - With only `cqaImpact: true`: an EC, CBE-30, though an unstated design space decides it.
  - `cqaImpact: 'false'` read as false.
  - `elementType: 'parameter'` was "treated conservatively as an EC", PAS.
  - An omitted `elements` list crashed (`Cannot read properties of undefined (reading 'map')`).
- **PACMP** (`design_pacmp`).
  - A site change with no risk facts: "without protocol PAS, reduced to CBE-30".
  - A reduction to Annual Report with the sterile fact unstated: feasible.
  - An omitted `cqa` read "Confirm the quality attribute is unaffected" (not a CQA).
  - `includeStability: 'yes'` read as no.
  - `tests: 'assay'` crashed (`suppliedTests.map is not a function`).
- **Annual report** (`plan_annual_report`).
  - A change with no asserted category was classified with its risk facts read as false: a minor equipment change
    was flagged CBE-0. This tool takes no risk facts.
  - An omitted `stabilityProtocolOngoing` gave the "no protocol" text.
  - `'true'` read as false, and `biologicLicense: 'false'` (a text) read as a BLA.
  - `changes: 'blender'` was read as no changes.
- **Comparability** (`assess_postapproval_comparability`).
  - For a biologic downstream change with `analyticalCoverageComplete` omitted: `analytical_only`, no bridging,
    because "default true unless explicitly false". A stated false gives `analytical_plus_clinical`.
  - `'false'` read as complete coverage.
  - `changeStage: 'Upstream'` read as no stage.
- **Lifecycle** (`plan_lifecycle_management`).
  - A planned change's omitted risk facts read as false when choosing its category and ICH Q12 tool.
  - A history entry with no reported category was classified the same way.
  - `marketedRegions: ['EU ']` was kept.

## What already exists (RULE 3)

This is a completion: nothing was rebuilt.
- **The engine:** `post-approval-knowledge.ts` is the one engine for all six functions. The 2026-10-29 BLA change
  (`42bbb941e`) already took an annual report's licensure from a stated `biologicLicense` or, said in the guidance,
  from the modality. That disclosed default is kept, pinned by the engine's one test,
  `tests/regulatory/us-biotech-filing-identities.test.ts` ("an unstated licence follows the modality and says so"),
  which passes unchanged. No function validated a value or kept an omitted fact open.
- **The definitions and handlers:** `server/services/ana/postApprovalTools.ts`, spread into `ALL_ANA_TOOLS`. The
  handlers run through `runStatsTool`, which labels a success with the stated basis and turns a `ComputationRefusal`
  into `needs_parameters` with `code` and `field`. `AnaToolExecutor.ts` is not touched.
- **The shared readers and the answer search, imported:** `statedBoolean`, `statedNumber`, `statedOneOf`, `shown`,
  `statedText` and `statedList` (which joined the home with the benefit-risk commit), `listed`, `oneOfInput`,
  `everyAnswer` and `decidingFacts` (`immunogenicity/immunogenicity-reference.ts`, their one home since S5d-0), and
  `refuseUnlessStated` and `ComputationRefusal` (`ana-biostats/computation-engine.ts`). None is copied;
  `s5-three-valued-helpers-have-one-home.test.ts` passes. The plan's own `statedText`, `statedList` and `listed` were
  copies and are imported instead, and `requiredOneOf` is built on the shared `oneOfInput`. `statedObject`, `objects`
  and their `refuse` stay local: this engine is their only caller.
- **Other post-approval code, not touched.** None imports this engine:
  - `global-ri/post-approval-changes.ts`, market by category;
  - `cmc/supac-classifier.ts`, behind the CMC change-control store;
  - `regulatory/change-assessment.ts` and `market-specs/post-submission-changes.ts`;
  - `biologics/comparability.ts`, an ICH Q5E engine over measured lots;
  - `shared/regulatory/change-control-taxonomy.ts`, the shared vocabulary of the first three.

  They are a second and third answer to "which reporting category", recorded as a residual.
- **Readers of the changed result fields:** none outside the engine; the PACMP, annual report and lifecycle read the
  classification inside it.
- **Searches run:** `git grep` for the six tool and function names, `POST_APPROVAL_TOOLS`, `post-approval-knowledge`,
  `pacmp`, `established.?cond`, `q12`, `comparab`, `supac`, `variation`, `annual.?report` and `plcm` in server and
  shared.
- **History:** `git log --all --diff-filter=D --name-only`, filtered for
  `post.?approval|pacmp|established.?cond|plcm|q12|comparability`, finds nothing outside the skills tree. The clone is
  shallow, so this covers local history only.

## The change

- **Booleans.** Each true/false input reports `true`, `false` or `not_stated` through `inputStates`, and a malformed
  one is refused by field:
  - the five risk qualifiers, wherever a `risk` object is taken;
  - `solidOralProduct`, `modifiedRelease` and `biologicLicense`;
  - an element's `cqaImpact`, `controlledDownstream` and `withinDesignSpace`;
  - a test's `cqa`, `includeStability`, `stabilityProtocolOngoing` and `includePlcmDocument`;
  - `affectsCqa`, `analyticalCoverageComplete` and `clinicalDataAvailable`.

  `parameterRange` is not read, and the definition now says so.
- **Enums, numbers, lists and objects** are refused by field when malformed: an area, element type or category outside
  its vocabulary is refused by name, no longer classified as PAS or as an EC, as is a modality, magnitude, approach,
  stage, frequency or region outside its own. A year that is not a whole number, a text for a list or object, and a
  non-object entry are refused. Missing elements, a missing change description and missing test fields are refused by
  name.
- **The answers.** Each classification is computed on every answer to its unstated facts (at most 2^8, memoised). The
  risk score and tier, the US category, regulation and distribution rule, the EU variation type and procedure, the
  SUPAC applicability, level and note, and whether comparability is likely are given only when every answer gives the
  same one. Otherwise they are null, and `undecided` names the facts that decide each and what it could be.
  - A factor's `applies` is null while its fact is unstated.
  - The recommended tools and the warnings are those every answer gives, plus a line per undecided conclusion.
  - The same rule applies to an element's EC status, reporting category and EU change type; the category without a
    PACMP and the protocol's feasibility (an unstated sterile process leaves an Annual Report reduction open); and the
    comparability extent, bridging studies and functional comparability.
  - The same rule applies to a planned change's category and ICH Q12 tool, which is null when the possible
    categories give different tools.
- **One fact, two inputs.** `affectsCqa` and `risk.affectsCqa` state one fact: when one is stated it answers the
  other, and when neither is, the answer search tries it once, never as two facts that disagree. A `risk` object
  without a magnitude keeps the stated top-level magnitude.
- **What a tool cannot take.** An annual-report change with no asserted category whose facts leave it open is listed in
  `notDetermined`, since the planner takes no risk facts; the note says to assert a category or classify the change. A
  history change with no reported category is counted as "not determined", said in the plan's `notes`.
- **Disclosed defaults.** An omitted modality (small molecule), magnitude (moderate), development approach (minimal),
  change stage (from the area), region list (global), test panel (the engine's default), stability commitment (none
  unless the area needs one) and PLCM document (not included) keep their defaults, said in `warnings`, `guidance` or
  `notes`. An omitted stability protocol gives both texts.
- **Size (Rule 6 split).** The citation library, the change-area profiles, the US and EU category texts, the
  established-condition base rules and the default PACMP test panels move unchanged into the new sibling
  `post-approval-reference.ts` (11 declarations: three constants, five lookups and three types, 20,642 bytes, all
  verbatim in trunk's engine).
- **Lint.** Two warnings already on trunk go: an unused `eslint-disable` directive and a useless initial assignment.
- **The definitions** say what an omission leaves. The shared note shortens, and the classification and comparability
  descriptions say a result can be null; all six fit 1,024 characters (830 to 1,021).

**Stated inputs whose result changes.** Fully stated, well-formed inputs were compared with trunk's engine, ignoring
the fields this change adds: 107,520 classification, 1,920 EC, 26,880 PACMP, 8,400 annual-report, 89,600
comparability and 48,384 lifecycle inputs (282,704).
- **EC and comparability:** nothing changes.
- **Classification:** 35,712 change, each a risk object without its own magnitude beside a stated `minor` or `major`.
  The stated magnitude is now used, where trunk scored the change as moderate. 10,076 of them change category; the rest
  change score or tier only. With the magnitude also in the risk object, nothing changes.
- **PACMP:** 80 change: composition changes with no category without a protocol. Their category turns on the
  modified-release fact, which the PACMP tool does not take, so it is now null.
- **Annual report:** 1,312 change: unasserted changes whose risk facts leave the category open, now in `notDetermined`.
- **Lifecycle:** 24,432 change.
  - 24,192 history entries without a reported category are counted as "not determined".
  - 480 planned composition changes have no category or tool, for the modified-release fact the planner does not take.

**Results that change because an input was omitted or malformed:** each example above. The minor process change gives
`us.category: null`, with `undecided` naming `risk.sterileProcess` among the facts and PAS and CBE-0 among the
answers. The EC with only `cqaImpact` stated is `not_determined`. Each malformed value is refused by field, each crash
is a refusal.

**Completeness probe.** For inputs with facts omitted, each determined value, list entry and `couldBe` value was
checked against every completion of the omitted facts: 216,480 checks over 2,500 classification, 1,500 EC, 2,500
PACMP, 2,500 comparability, 1,500 lifecycle and 1,500 annual-report inputs, the facts stated, omitted or false at
random. The CQA pair counts as one fact. Every determined value and list entry agrees with every completion, except,
by design:
- the classification's citations, which cite both 21 CFR 314.70 and 601.12 while `biologicLicense` is unstated
  (`us.regulation` is then null);
- 18 PACMP `couldBe` values reachable only through `solidOralProduct` or `modifiedRelease`, which the PACMP tool does
  not take;
- the annual report's stability text, which gives both texts while `stabilityProtocolOngoing` is omitted, and its
  PLCM document, not included while `includePlcmDocument` is omitted;
- the annual report's regime, sections and change notes, which follow the modality while `biologicLicense` is omitted
  (the 42bbb941e default above). With `biologicLicense` stated, only the stability text and the PLCM default differ.

**Residuals, recorded rather than changed:**
- **Defaults kept, said in the result:** modality, magnitude, approach, stage, regions, the default test panel (whose
  acceptance criteria are the engine's, with a warning to confirm them) and the PLCM and stability options.
- **Facts a tool cannot take.** The PACMP, annual report and lifecycle tools take no `solidOralProduct`,
  `modifiedRelease` or `biologicLicense`, and the annual report no risk facts. Their classification stays open where
  those facts decide it, and says how to supply it.
- **A dead branch.** `planLifecycleManagement` compares a change area with `'process_parameter'`, which is not a change
  area.
- **Peptides.** The comparability framework counts a peptide or oligonucleotide as a biologic, and the risk model does
  not.
- **Other classifiers.** Three other engines classify post-approval changes; converging them is outside S5d.

**User-visible:** AnA's post-approval answers no longer name a reporting category, variation type, SUPAC level, EC
status, comparability extent or ICH Q12 tool from facts it was not given. Each names the facts the answer turns on,
what each answer would give, and asks for them. A malformed value is asked for again, not read as another or crashed
on.

## Proof

Run in this session on the working tree, red first, after the benefit-risk commit.
- `red/before.txt`: `post-approval-unstated-inputs.test.ts` before the change: 108 of 121 fail, all on assertions (one
  catches trunk's handler returning a crash, "Cannot read properties of undefined (reading 'map')", as its error). The
  13 controls pass: the six stated-basis pins, five "keeps the stated answer", "a status every answer gives is kept"
  and "each description fits the gateway limit".
- `green/after.txt`: 255 of 255 pass in 4 files: the 121, the engine's suite
  `tests/regulatory/us-biotech-filing-identities.test.ts`, `guidance-ingestion-service.test.ts` and the one-home guard.
- **The neighbourhood: 175 files, 4,529 tests, 4,518 pass.** It is the benefit-risk commit's set with this family's
  suites. The 11 failures are the `tests/lineage/founder-path-lineage.pglite.test.ts` cases that fail identically on
  trunk.
- **Gates:**
  - typecheck (`typecheck-no-regression --incremental`): 0 errors;
  - ESLint ratchet: net 0 (the engine 9 to 8, the sibling 0 to 1, `max-lines`);
  - `manifest:ana`: regenerated in the same commit; only the six tools' descriptions and input descriptions change
    (830 to 1,021 characters), with no renderer, scope, governed flag or required-input change.
- **Sizes:** the engine is 96,928 bytes (85,769 before), the sibling `post-approval-reference.ts` 22,025.

## Review (adversarial critic, 2026-11-09)

The first draft was sound in its classifications, but one search was wrong and the README misdescribed what existed.
Found and fixed:
1. **One fact searched as two.** With neither `affectsCqa` nor `risk.affectsCqa` stated, the comparability search
   tried them as independent facts, including answers where the change affects a CQA but its risk score does not
   count it. That gave `couldBe` values no consistent answer gives and left conclusions null that every consistent
   answer settles: for a major upstream biologic change in a design space, `extent` listed
   `analytical_plus_nonclinical` and `bridgingStudies.nonclinicalRequired` was null, where the two answers give
   `analytical_plus_clinical` or `analytical_only` and no nonclinical study. The pair is now one fact in the search.
2. **S5d-0.** The draft copied `everyAnswer` and `decidingFacts`; they are imported from `immunogenicity-reference.ts`,
   and the one-home guard passes with all three plans applied.
3. **"There were no engine tests" was false.** `tests/regulatory/us-biotech-filing-identities.test.ts` tests the annual
   planner's BLA regime; it was outside the draft's neighbourhood. It passes with this change.
4. **The completeness claim left out the annual report** and the citations; this review checks both and lists what
   differs by design. The design paragraph is re-based on S5d-0 and inserted before the S5 **Pins** line.

Checked and sound: every stated count, re-run against trunk: classification 35,712 of 107,520, and each of them equals
trunk's result with the stated magnitude written into the risk object (35,712 of 35,712), so the magnitude is the only
change; EC 0 of 1,920; PACMP 80 of 26,880 (composition changes with no category, open on the modified-release fact);
annual report 1,312 of 8,400 (unasserted changes now `notDetermined`); comparability 0 of 89,600; lifecycle 24,432 of
48,384 (24,192 unreported history categories, 480 planned composition changes, 240 being both). The pure move (11
declarations, verbatim in trunk's engine; the three constants deep-equal and the five lookups identical over 1,775
calls). The descriptions (830 to 1,021 characters). The engine is 97,740 bytes.

Critic's measured values on `f75de861e` (the committer replaces the placeholders with its own run): red 108 of 121
failing, all on assertions, 13 controls passing; green 121 of 121, 3 files and 216 tests with
`us-biotech-filing-identities` and the guard; the neighbourhood 64 files, 3,413 tests, all passing.
