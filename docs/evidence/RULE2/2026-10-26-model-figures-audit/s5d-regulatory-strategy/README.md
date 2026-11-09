# Rule 2 · S5d regulatory strategy: the strategy worksheets choose no pathway and call no designation from a fact nobody stated

**Rule:** CLAUDE.md Rule 2 and "fail closed, never fabricate".
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1** (a repair of shipped behaviour). The engine
(`server/services/regulatory-strategy/`) is in no narrower package. The tool definitions and the regulatory-strategy
and markets skills are S4 paths, which F1 covers.
**Audit:** `../design.md`, S5d, the regulatory-strategy family, and its sub-item: "`assess_orphan_designation`: a
prevalence with no stated source gives `fdaEligible: null`."
**Date:** 2026-11-09 (planned in a private mirror; the plan applies to trunk `f75de861e`, which includes S5d-0,
`37135699b`).

## The defect

Inputs below were run on the engine as it is on trunk. The engine and its definitions are unchanged from `96ae110e8`
to `f75de861e`. Full log: `probe-trunk.txt` beside this README, the planner's run of trunk's engine in a private
copy of trunk.

- **Orphan** (`assess_orphan_designation`).
  - US 30,000 and EU 2 per 10,000, with no source for either: `fdaEligible` and EMA `eligible` true. The design's
    sub-item.
  - A null US prevalence gave FDA `eligible: false`, beside "cannot assess".
  - A sourced US prevalence of 250,000 gave false, beside the rationale's own "Alternative: demonstrate that costs of
    development cannot be recovered".
  - All three seriousness facts omitted: EMA `eligible: undefined`, and the rationale printed "undefined".
  - EU prevalence exactly 5 failed "must not exceed 5 in 10,000".
  - With two approved therapies, any clinical-rationale text made EMA eligible: the text was read as significant
    benefit.
  - With the rationale omitted and therapies existing, it crashed (`Cannot read properties of undefined (reading
    'length')`).
  - `isSerious: true` alone, with `isLifeThreatening` and `isDebilitating` false, met the EU prevalence limb, which
    Regulation (EC) No 141/2000 Art 3(1)(a) gives to a life-threatening or chronically debilitating condition. The
    criteria text quoted the insufficient-return limb's wording ("life-threatening, seriously debilitating, or serious
    and chronic"), the wording `global-ri/special-designations.ts` corrected on 2026-10-15.
  - `productType: 'vaccine'` or `'diagnostic'` with a US disease prevalence of 30,000 gave FDA `eligible: true`. For a
    vaccine or diagnostic drug the count in 21 CFR 316.20(b)(8)(i) is the persons to whom it will be administered per
    year, which no input carries.
  - A text prevalence (`'30000'`) was compared as a number, and `isSerious: 'false'` read as true.
- **505 pathway** (`select_505_pathway`).
  - `{ activeIngredient: 'known' }` alone: 505(b)(1), the six facts read as false (no RLD).
  - An omitted RLD with a dosage-form change: 505(b)(1).
  - `routeChange: 'false'` read as true.
  - An omitted active ingredient was a known one: 505(j).
- **Rolling submission** (`assess_rolling_submission`).
  - No designation stated: `eligible: undefined`.
  - `fastTrack: 'false'` returned `eligible: "false"` (the text).
  - An omitted status object crashed.
- **Expedited programs** (`assess_expedited_program`).
  - An omitted therapy landscape read as an unmet need, then crashed (`reading 'replace'`).
  - An omitted evidence level read as clinical evidence.
  - `indication: 'Serious'` made every program ineligible.
  - Breakthrough Therapy, Accelerated Approval and Priority Review were true or false on criteria no input states:
    substantial improvement on a clinically significant endpoint, a surrogate endpoint, significant improvement.
    Early clinical evidence made Breakthrough Therapy false, though preliminary clinical evidence is what it asks for.
  - A biosimilar was eligible for Fast Track, Breakthrough Therapy, Accelerated Approval and Priority Review. A 351(k)
    product is licensed only for its reference product's approved conditions of use (PHS Act §351(k)(2)(A)(i)(III))
    and has no clinically meaningful difference from it (§351(i)(2)), and §506(c)(1)(A) applies Accelerated Approval
    to applications under §505(c) or §351(a).
  - RMAT was eligible beside "Adequate existing therapy available — unmet medical need criterion not satisfied" for
    Fast Track: §506(g)(1) asks for potential to address unmet medical needs. A combination product was "not a
    regenerative medicine therapy", though §506(g) covers one that uses such a therapy and no input says whether it
    does.
- **Meeting and global pathways.**
  - `purpose: 'EOP2'` gave a meeting type of `undefined`, and an omitted phase was planned as none.
  - `targetMarkets: ['USA']` and an omitted list crashed.

## What already exists (RULE 3)

This is a completion: nothing was rebuilt.
- **The engine:** `regulatory-strategy-knowledge.ts` is the one engine for all six functions. Japan's expedited and
  conditional-approval rows are read from `ind/ctd/jp-programs.ts`. No function refused a missing or malformed value,
  and none had a not-stated state.
- **The definitions and handlers:** `server/services/ana/regulatoryStrategyTools.ts`, spread into `ALL_ANA_TOOLS`. The
  handlers run through `runStatsTool`, which turns a `ComputationRefusal` into `needs_parameters` with `code` and
  `field`. `AnaToolExecutor.ts` is not touched.
- **The design's pins test other engines.** `expedited-programs-unstated-facts-not-assessed.test.ts`,
  `special-designations-orphan-unassessed-criteria-not-ineligible.test.ts`,
  `special-designations-eu-orphan-says-chronically-debilitating.test.ts` and the three `regulatory-strategy-brief*`
  tests import `global-ri/expedited-programs.ts`, `global-ri/special-designations.ts` and
  `global-ri/regulatory-strategy-brief.ts`, not this engine. Their decided rules are followed here: an unstated fact,
  or an unassessed prong or limb, is not assessed and never ineligible; a criterion is unmet only when a stated fact
  fails it; and the EU prevalence limb is "life-threatening or chronically debilitating". They pass unchanged. This
  engine's only test was `jp-programs.test.ts` (Japan rows of `compareGlobalPathways`).
- **The shared readers and helpers, imported:** `statedBoolean`, `statedNumber`, `shown`, `anyOf`, `allOf`,
  `everyAnswer` and `decidingFacts` (`immunogenicity/immunogenicity-reference.ts`, their one home since S5d-0), and
  `refuseUnlessStated`, `RequiredInputCheck` and `ComputationRefusal` (`computation-engine.ts`). None is copied;
  `s5-three-valued-helpers-have-one-home.test.ts` passes.
- **The skills:** `regulatory-strategy.ts`, expedited step 5 and orphan step 2, and `markets-international.ts`, whose
  record reference names the file that holds the global pathway registry.
- **Other strategy code, not touched:** the three global-RI engines above, `ana/special-designations.ts`,
  `ana/regulatory-pathway.ts`, `market-specs/pathway-eligibility.ts`, `global-ri/ha-meetings.ts` and
  `global-ri/regulatory-pathway-advisor.ts`. They are second answers to the same questions, recorded as a residual.
- **Readers of the changed result fields:** none outside the engine and `jp-programs.test.ts`. The engine's only
  importers are the executor's six handlers; `jp-programs.ts` and `markets-international.ts` name it in text.
- **Searches run:** `git grep` for the six tool and function names, `REGULATORY_STRATEGY_TOOLS`,
  `regulatory-strategy-knowledge`, `orphan`, `expedited`, `designation`, `505`, `rolling`, `meeting` and `pathway` in
  server, client and shared.
- **History:** `git log --all --diff-filter=D --name-only`, filtered for
  `regulatory.?strategy|orphan|expedited|505|rolling.?sub|fda.?meeting|global.?pathway|designation`, finds nothing
  outside the skills tree. The clone is shallow, so this covers local history only.

## The change

- **Booleans.** The twelve true/false inputs report `true`, `false` or `not_stated` through `inputStates`:
  - `isSerious`, `isLifeThreatening` and `isDebilitating`;
  - the six 505 facts;
  - the three designations under `expeditedDesignationStatus`.

  A malformed one is refused by field. None is schema-required any longer, so the model is not pushed to supply one.
- **Required values** are refused by name when missing or outside their vocabulary: the expedited program's five
  inputs, the orphan product type, the meeting's phase, purpose and product type, the 505 active ingredient, and the
  market list (non-empty, each a known market). A text prevalence, a negative one, a fractional therapy count, a
  non-text source and a non-object status are refused by field.
- **Orphan.**
  - `diseasePrevalenceUSSource` and `diseasePrevalenceEUSource` (text) are new optional inputs of the existing tool. A
    prevalence with no stated source is not used.
  - FDA `eligible` is true on a sourced US prevalence under 200,000, and null otherwise: a missing prevalence or source
    is named in `missing`, and 200,000 or more leaves the cost-recovery prong in `notAssessedCriteria`. For a vaccine or
    a diagnostic it is null with the persons-dosed-per-year count and the cost-recovery prong in
    `notAssessedCriteria`. The product type is read for this and is required again, as it was on trunk.
  - EMA `eligible` is true when a sourced prevalence does not exceed 5 in 10,000, the condition is stated
    life-threatening or chronically debilitating, and there is no approved therapy. It is false when the condition is
    stated not serious, not life-threatening and not debilitating, which fails both limbs of Art 3(1)(a). Otherwise it
    is null: the unstated facts are in `missing`, and the insufficient-return limb and significant benefit are in
    `notAssessedCriteria`. `isDebilitating` now asks whether the condition is chronically debilitating, the prevalence
    limb's word; `isSerious` alone meets neither limb.
  - The rationale names a stated source.
- **505.** The pathway is computed on every answer to the unstated facts (at most 64). It is given only when every
  answer gives it, and is otherwise null, with `undecided` naming the deciding facts and the possible pathways. The
  alternatives are those every answer gives. When the pathway is settled but the reasoning is not, the rationale says
  so.
- **Rolling.** Eligible when a designation is stated true, ineligible when all three are stated false, otherwise null
  with the unstated ones named. `productType` and the module dates are not read; the definition and the skill say so.
- **Expedited.**
  - Breakthrough Therapy, Accelerated Approval and Priority Review are null, with `notAssessedCriteria`, where a
    criterion no input states decides them. A stated fact that fails one keeps it false: preclinical evidence only
    (Breakthrough Therapy, FD&C Act §506(a)(1)), a condition not serious, a §351(k) biosimilar (all of them).
  - **An available therapy stated adequate settles nothing on its own** (the coordinating session's correction,
    2026-11-09). An unmet need can remain beside it: an improved effect, patients intolerant of or refractory to it, a
    serious outcome it does not address (FDA, Expedited Programs for Serious Conditions, 2014). A meaningful advantage
    over it can too. So Fast Track (§506(b)(1)), Accelerated Approval (§506(c)(1)(A), 21 CFR 314.500, 601.40) and RMAT
    (§506(g)(1)) are null beside it, each naming that finding in `notAssessedCriteria`. Each is false only where an
    input states the absence of what it needs, and none does. The review's plan had all three false there.
  - Fast Track is false for a biosimilar. RMAT is null for a combination product, with the criterion named.
  - Each remaining `false` rule cites its statute or regulation in a comment beside it in the engine.
  - The recommendations name the programs not assessed. The Breakthrough-first recommendation says it depends on
    substantial improvement.
- **Size (Rule 6 split).** The engine was over the ceiling (149,969 bytes). Its fixed tables move unchanged into the
  new sibling `regulatory-strategy-reference.ts` (14 declarations, 72,309 bytes: 11 constants, the registry's type and
  the two Japan row builders `jpExpeditedPathway` and `jpConditionalApproval`, each verbatim in trunk's engine; the
  constants are deep-equal to it):
  - the Japan rows, still read from `jp-programs.ts`;
  - the expedited registry and comparison matrix;
  - the meeting types, briefing template and purpose map;
  - the orphan thresholds;
  - the 505, exclusivity and certification data;
  - the global pathway registry.

  The FDA meeting timing and advice lookups (`getSubmissionTiming`, `getTimingRecommendations`, `getPracticalAdvice`),
  pure functions of the meeting purpose, phase and product type, move verbatim into a second sibling,
  `regulatory-strategy-meeting-advice.ts`: with the correction's citations the engine would otherwise have been 100,805
  bytes, and in `regulatory-strategy-reference.ts` they took that file past 1,500 lines, which the repo-health line
  ceiling refuses (a follow-up commit, before the push, moved them there). The engine is now 94,275 bytes, the
  reference sibling 75,961 bytes (1,474 lines) and the meeting-advice sibling 7,373 bytes.
  `jp-programs.test.ts`'s prose guard lists the sibling too, a one-line pin edit;
  `jp-programs.ts`'s list of readers and the markets skill's record reference name the sibling.
- **The definitions** say what an omission leaves. `questionsToDiscuss`, `productType` and `indication` are marked not
  read where they are not, and the orphan description says a prevalence needs its source and states the EU criteria
  as "not more than 5 per 10,000" and "life-threatening or chronically debilitating". Four descriptions that were over
  the gateway's 1,024 characters are condensed: expedited 1,044, meeting 1,128, 505 1,039, global 1,193; now 1,004 to
  1,017. Orphan 923 to 987, rolling 956 to 907.
- **The skill.** Expedited step 5 no longer says the rolling tool plans from the module dates, and orphan step 2 says
  to pass the source the person gave.

**Stated inputs whose result changes.** Fully stated, well-formed inputs (orphan with both sources) were compared with
trunk's engine, ignoring the fields this change adds: 270 expedited, 648 meeting, 1,200 orphan (small molecule), 128
pathway, 8 rolling and 255 global inputs (2,509), and, for the product-type rules, 10,800 orphan inputs across the nine
product types.
- **Meeting, 505, rolling and global:** nothing changes.
- **Expedited:** 266 of the 270 change a verdict, and every recommendation list names the programs not assessed. The
  table is `expedited-stated-comparison.txt` beside this README, re-run by this session after the correction:
  - Priority Review: null in 240 (160 were true; 80, beside an adequate therapy, false); false in the 20 biosimilars
    where it was true.
  - Accelerated Approval: null in 240 (160 were true; 80, beside an adequate therapy, false); false in the 20
    biosimilars where it was true.
  - Breakthrough Therapy: null in 192 (144 were true, 48 false); false in the 18 biosimilars where it was true.
  - Fast Track: null in the 80 non-biosimilar inputs beside an adequate therapy (each was false); false in the 20
    biosimilars where it was true.
  - RMAT: null in the 24 regenerative therapies beside an adequate therapy (each was true), and in the 24 combination
    products whose other criteria are met (each was false).
- **Orphan, 1,200 small-molecule inputs:** all change, since each rationale names its stated source.
  - FDA: 480 with a prevalence of 200,000 or more move from false to null (the cost-recovery prong).
  - EMA: 60 move from false to true: exactly 5 in 10,000, life-threatening or chronically debilitating, no approved
    therapy. 810 move to null (570 from false, 240 from true): an approved therapy (significant benefit), a prevalence
    over 5 (the insufficient-return limb), or a condition stated only serious. The 150 stated not serious, not
    life-threatening and not debilitating stay false.
- **Orphan, 10,800 inputs across product types:** in addition, 2,400 vaccine and diagnostic FDA verdicts move to null
  (1,440 from true, 960 from false at 200,000 or more).

**Results that change because an input was omitted or malformed:** each example above. No source gives `eligible:
null` with the source in `missing`. `{ activeIngredient: 'known' }` gives `recommendedPathway: null`, with 505(b)(1),
505(b)(2) and 505(j) possible. No designation gives `eligible: null`. Each malformed value and each crash is a
refusal.

**Completeness probe.** For inputs with facts omitted, each determined value was checked against every completion of
the omitted facts: 63,954 checks over the orphan verdicts (nine product types, five US and four EU prevalences, with
and without sources, three therapy counts, every combination of the three seriousness facts stated, omitted or
false), the 505 pathway, alternatives and rationale (all 1,458 patterns) and rolling eligibility (all 27), with no flag.
A determined orphan verdict never stands beside a missing input or an unassessed criterion, and a null one always
names one.

**Residuals, recorded rather than changed:**
- **Proxies kept.** Fast Track reads the unmet need from the therapy landscape, and RMAT reads clinical evidence from
  the evidence level. Fast Track's "demonstrates the potential to address an unmet medical need" and RMAT's
  "preliminary clinical evidence indicates the potential" are findings no input states.
  `global-ri/expedited-programs.ts` also screens them on the unmet need and preliminary clinical evidence alone.
- **Orphan criteria not assessed while FDA or EMA is true.** The FDA screen does not assess the medically plausible
  rationale (21 CFR 316.20(b)(4)) or, where the same drug is approved for the condition, the plausible hypothesis of
  clinical superiority (316.20(a)); a preventive use of a product that is not a vaccine is not an input. The EMA screen
  reads "no satisfactory method" from `existingApprovedTherapies: 0`, though COMP counts methods other than
  authorised medicines and the count's jurisdiction is not stated. `global-ri/special-designations.ts` has a
  `noSatisfactoryTreatment` input for this.
- **Inputs not read.** `unmetMedicalNeedDescription` is printed, never weighed. `questionsToDiscuss`, the module dates,
  and `productType` and `indication` in three tools are not read.
- **A citation moved verbatim.** The Fast Track registry cites "21 CFR 312.300 — IND content and format"; 312.300 is
  the general provision of Subpart I, expanded access (IND content is 312.23). It moved unchanged with the registry.
- **Second answers.** The global-RI engines and the advisors above answer the same questions with their own tables;
  converging them is outside S5d.

**User-visible:** AnA no longer calls a product orphan-eligible on a prevalence nobody sourced, on a condition stated
only serious, or for a vaccine on its disease prevalence, or ineligible on a prong it never assessed. It recommends no
505 pathway, rolling review or expedited program from facts it was not given, and no longer offers a biosimilar Fast
Track, Breakthrough Therapy, Accelerated Approval or Priority Review. Each names what was not stated or not assessed
and asks for it. A malformed value is asked for again, not read as another or crashed on.

## Proof

Run in this session on the working tree, red first, after the post-approval commit.
- `red/before.txt`: `regulatory-strategy-unstated-inputs.test.ts`, as corrected, before the change: 65 of 77 fail, all
  on assertions (three catch trunk's handlers returning a crash as their error). The 12 controls pass: the six
  stated-basis pins, four "keeps the stated answer", "a condition stated not serious, not life-threatening and not
  debilitating meets neither EU limb" and "keeps a stated failure (no clinical evidence rules out Breakthrough
  Therapy)". The review's control "keeps a stated failure" pinned Fast Track and Accelerated Approval false beside an
  adequate therapy; with the correction it is replaced by that control and by a case for the null, and the RMAT case
  likewise expects null.
- `green/after.txt`: 255 of 255 pass in 18 files: the 77, `jp-programs.test.ts`, the global-RI orphan, expedited and
  strategy-brief pins, `cross-jurisdictional-intelligence.jp.test.ts` and the one-home guard.
- **The neighbourhood: 189 files, 4,717 tests, 4,706 pass.** It is the post-approval commit's set with this family's
  suites. The 11 failures are the `tests/lineage/founder-path-lineage.pglite.test.ts` cases that fail identically on
  trunk.
- **Gates:**
  - typecheck (`typecheck-no-regression --incremental`): 0 errors;
  - ESLint ratchet: net −4 (the engine 17 to 10, the sibling 0 to 3);
  - `manifest:ana`: regenerated in the same commit. The six tools' descriptions change, the booleans leave the
    `required` lists, and the orphan tool gains its two source inputs. No renderer, scope or governed flag changes.
    The descriptions are 907 to 1,017 characters.
- **Helpers:** `listed`, `oneOfInput`, `textInput` and `statedText` are imported from `immunogenicity-reference.ts`;
  the review's plan had copies, which the one-home guard would refuse.

## Review (adversarial critic, 2026-11-09)

The first draft of this plan was not sound as written. Found and fixed:
1. **Stated failures read as null (EMA).** A condition stated not serious, not life-threatening and not debilitating
   fails both limbs of Art 3(1)(a), including the insufficient-return limb (which needs a life-threatening, seriously
   debilitating or serious and chronic condition). The draft made it null "for the insufficient-return limb" (150 of
   the 1,200 small-molecule inputs). It is false again, as on trunk.
2. **A true the facts do not establish (EMA).** The draft kept `isSerious` alone as meeting the prevalence limb (its own
   residual). The limb needs a life-threatening or chronically debilitating condition, the repository's decided
   wording (`special-designations-eu-orphan-says-chronically-debilitating.test.ts`). `isSerious` alone is now null, and
   `isDebilitating` asks for chronic debilitation.
3. **A true on the wrong count (FDA).** A vaccine or diagnostic was eligible on its disease prevalence; 316.20(b)(8)(i)
   counts the persons dosed per year. Now null, with the criterion named; the product type is required again.
4. **Stated failures in the expedited screen.** A biosimilar was null (or true, for Fast Track) for programs its
   statute excludes; RMAT stayed true beside a stated adequate therapy, and false for a combination product whose
   qualifying fact is not stated. (After this review the coordinating session corrected one call: an adequate
   therapy does not make Fast Track, Accelerated Approval or RMAT false, since an unmet need or a meaningful advantage
   can remain beside it. Each is null there; see **The change**.)
5. **S5d-0.** The draft copied `everyAnswer` and `decidingFacts`; they are imported from
   `immunogenicity-reference.ts`, and the one-home guard passes with all three plans applied.
6. **Text.** The orphan description said "<5 per 10,000" and "serious/debilitating/life-threatening"; the README's
   counts and the design paragraph described the draft's rules; `jp-programs.ts` and the markets skill still named the
   engine as the holder of the moved rows. Corrected. The design paragraph is inserted before the S5 **Pins** line so
   the three families' paragraphs read in order.

Checked and sound: the 505, rolling, meeting and global changes; the source rule for the design's sub-item (adding
two optional inputs to an existing tool is a completion of that tool, not a new tool, and no input carried a source
before); the 5-in-10,000 boundary; significant benefit not read from rationale text; the pure move (14 declarations
verbatim in trunk's engine, the 11 constants deep-equal and the two builders identical over 710 calls); routing; the
renderer. 21 CFR 312.320 (named in the review brief) is the treatment IND provision of expanded access; Breakthrough
Therapy's basis is FD&C Act §506(a), added by FDASIA §902. The FDA guidance text on biosimilars and expedited programs
could not be fetched (the regulator hosts are outside this session's network); the biosimilar rule rests on the
statute's own terms, cited above.

Critic's measured values on `f75de861e` (the committer replaces the placeholders with its own run): red 64 of 76
failing, all on assertions, 12 controls passing; green 76 of 76, 9 files and 163 tests with the pins and the guard; the
neighbourhood 64 files, 3,413 tests, all passing. The thirteen cases this review added fail on the first draft and pass
here; the one-home guard fails on the first draft (four copies named) and passes here. Each plan also applies and passes
alone.
