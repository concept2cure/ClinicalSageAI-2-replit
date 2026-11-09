# Rule 2 · S5d immunogenicity: the immunogenicity worksheets say which facts were stated, and read none of them by truthiness

**Rule:** CLAUDE.md Rule 2 and "fail closed, never fabricate".
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1** (a repair of shipped behaviour). The engine
(`server/services/immunogenicity/`) is in no narrower package; the tool definitions are an S4 path, which F1 covers.
**Audit:** `../design.md`, S5d, the immunogenicity family.
**Date:** 2026-11-09.

## The defect

The 2026-10-15 sweep had already made this family's conclusions wait for their facts: an unstated risk factor,
clinical-impact domain, NAb deciding fact, sampling driver or comparability trigger is listed in `notAssessed` and
leaves its verdict undetermined. What it left: no result said which true/false inputs were stated, one function read
its inputs by truthiness and checked none of them, and two inferences were silent. Inputs below were run on the
engine as it is on trunk (`f68840f22`; the engine is unchanged since `6215e5d31`).

- **No `inputStates` anywhere.** None of the six results reports whether a true/false input was stated true, stated
  false or left out.
- **ADA assay strategy** (`design_ada_assay_strategy`).
  - `highSolubleTarget: 'false'` added the acid-dissociation sentence, and `isMonoclonalAntibody: 'false'` for a
    fusion protein added the monoclonal-antibody clause: text read as true.
  - `{}` and `productType: 'Humanized mAb'` were served a bridging ECL strategy: productType was never checked.
  - `preferredPlatform: 'elisa'` (outside the list) was described with bridging ECL's strengths and limitations.
  - `targetSensitivity_ng_per_mL: -5` printed "Target assay sensitivity is -5 ng/mL"; `'50'` printed 50.
  - With no target, "Target assay sensitivity is 100 ng/mL" did not say that 100 was not stated. With
    highSolubleTarget left out, nothing was said of it; isMonoclonalAntibody left out was inferred from productType
    without a word.
  - `phase` was accepted and never read, while its definition said it "Drives the expected validation rigor".
- **Clinical impact** (`classify_immunogenicity_clinical_impact`). `lifeThreateningIndication: 'false'` added the
  life-threatening benefit-risk line (two monitoring recommendations where `false` gives one); `persistentADA:
  'false'` was accepted (persistence and titer set a grade that was already "high"). With the indication left out,
  nothing said whether that line applies; with it stated true and the severity undetermined (an IgE fact left out, so
  the severity is high or critical), the line said loss of efficacy "may be tolerable", which the engine withholds at
  critical.
- **NAb assay** (`design_nab_assay`). `{ mechanismClass: 'ligand_neutralizer', endogenousNonRedundant: false }`
  returned a competitive ligand-binding format with `notAssessed: []`: actsThroughCellReceptor was taken as false
  from the mechanism, and nothing said so. For `cell_depleting`, stating it true changes the format to cell-based.
- **Risk** (`assess_immunogenicity_risk`). With `hasEndogenousCounterpart: true` and the redundancy left out, the key
  concern was the redundant-counterpart one ("Potential cross-reactivity … should be characterized"), as for a
  stated false.

## What already exists (RULE 3)

This is a completion: nothing was rebuilt.
- **The engine:** `server/services/immunogenicity/immunogenicity-knowledge.ts` holds five functions and
  `immunogenicity-comparability.ts` the sixth (split out 2026-10-15 for size; the knowledge module re-exports it).
  The 2026-10-15 sweep's three-valued reading (`notAssessed`, the undetermined tier, severity, format and verdict) is
  pinned by the engine's nine suites in `server/services/immunogenicity/__tests__/`, which pass unchanged.
- **The shared readers:** `server/services/immunogenicity/immunogenicity-reference.ts` holds `statedBoolean`,
  `booleanInputStates`, `statedNumber` and `statedOneOf`, which every S5 family uses. It is reused and **not
  touched**.
- **The definitions and handlers:** `server/services/ana/immunogenicityTools.ts`, spread into `ALL_ANA_TOOLS`. The six
  handlers in `AnaToolExecutor.ts` run through `runStatsTool`, which labels a success with `statedInputEnvelope` and
  turns a `ComputationRefusal` into `needs_parameters` with `code` and `field`. `AnaToolExecutor.ts` is not touched.
- **The skills:** `skills/library/clinical-pharmacology.ts` (immunogenicity steps 1–7) and `skills/library/cmc.ts`
  (comparability step 3). Each line stays true of the patched tools, so none is changed.
- **Other immunogenicity code, not touched:** the incidence engine `server/services/biologics/immunogenicity.ts`
  (`assess_immunogenicity`, in `bla-biologics-tool-defs.ts`), the vaccine engine's immune-response endpoints, and the
  biosimilar clinical program's ADA strategy text. None imports this engine.
- **Readers of the changed result fields:** none outside the engine and its tests. `client/.../fixtures/intelligence.ts`
  and `ana-ri/persona.ts` name the tools only.
- **Searches run:** `git grep` for the six tool and function names, `immunogenicityTools`, `IMMUNOGENICITY_TOOLS`,
  `immunogenicity-knowledge` and `immunogenicity-comparability`; "immunogenicity", "anti-drug antibod", "neutralizing
  antibod" and "ADA" across `server/services` and `shared`; the result fields `notAssessed`, `formatRationale`,
  `platformRationale` and `sensitivityStatement`.
- **History:** `git log --all --diff-filter=D --name-only`, filtered for
  `immunogen|nab-assay|ada-assay`, finds nothing. The clone is shallow, so this covers local history only.

## The change

- **Booleans.** Each of the 26 true/false inputs the six functions read (risk 5, ADA strategy 2, clinical impact 9,
  NAb 3, sampling 1, comparability 6) reports `true`, `false` or `not_stated` through a new `inputStates` field, and
  a malformed value (`'false'`, `0`) is refused by field. The five that were read by truthiness (highSolubleTarget,
  isMonoclonalAntibody, persistentADA, highTiter, lifeThreateningIndication) now go through `statedBoolean`.
  Sampling's `endogenousNonRedundant` stays required, as before.
- **ADA strategy.** A missing productType is refused by name; a productType or preferredPlatform outside its list, and
  a sensitivity target that is not a positive number, by field. The rationale names an unstated highSolubleTarget and
  what it would add, and says when isMonoclonalAntibody was taken from productType (and as what). The sensitivity
  statement says when the FDA 2019 figure (100 ng/mL) stood in for an unstated target. The reading moved into a small
  `adaInputs` helper, so the function's ESLint complexity does not grow.
- **Clinical impact.** An unstated lifeThreateningIndication adds a monitoring line that names it (unless the severity
  is already critical). A stated one, while the severity is undetermined, says to weigh the findings within the
  benefit-risk once every domain is graded, and no longer that loss of efficacy may be tolerable. A line that set the
  efficacy grade to "high" when it was already "high" from persistence or titer is removed; both are reported and
  change no grade, as before.
- **NAb.** Where the mechanism reads the receptor fact (receptor_antagonist, ligand_neutralizer, enzyme,
  cell_depleting) and it was left out, the rationale says it was taken from mechanismClass, true or false. The
  inference is the definition's disclosed default and is kept.
- **Risk.** With a counterpart and its redundancy unstated, the concern names the redundancy and what a non-redundant
  counterpart would mean.
- **Sampling and comparability.** `inputStates` only.
- **The definitions** fit the gateway's 1,024 characters (995 to 1,024; all six were 1,218 to 1,516, so the gateway
  cut their ends), keep their manifest renderers (ranked-cards, navigation, findings-list, result-card, result-card,
  findings-list) and required inputs, and say "relay the validation error". Each optional true/false input says
  "omitted or null stays not_stated". `phase` says it is not read; the sensitivity input no longer says "Default 100".
- **Size.** The engine is 95,337 → 99,668 bytes, under the 100,000-byte ceiling; no table had to move. The
  comparability file is 16,117 → 16,403; the tools file 29,222 → 28,667.
- **The design** records this family's "What already exists" and result, and its status row.

**Stated inputs whose result changes.** Fully stated, well-formed inputs were compared with the engine on trunk,
ignoring the new `inputStates`: 2,016,000 risk inputs (every product type, foreignness including left out,
endogenous counterpart and redundancy, aggregation, glycosylation, impurity, formulation, route, frequency, immune
status and concomitant answer), 5,040 ADA inputs (every product type, both booleans, two phases, every preferred
platform and none, three targets, three drug levels), 3,072 clinical-impact inputs (all 512 answers by six exposure
fractions), 96 NAb, 5,040 sampling and 960 comparability inputs. **None changes.**

**Results that change because an input was omitted or malformed:**
- An ADA strategy with highSolubleTarget, isMonoclonalAntibody or the sensitivity target left out gains a sentence
  that says so.
- A clinical impact with lifeThreateningIndication left out, below critical, gains the monitoring line that names it.
- A NAb design with actsThroughCellReceptor left out for the four mechanisms that read it gains the inference sentence.
- A risk assessment with a counterpart and its redundancy left out names the redundancy in its concern.
- `'false'`, `'true'`, 0 or 1 for highSolubleTarget, isMonoclonalAntibody, persistentADA, highTiter or
  lifeThreateningIndication is refused by field (the other 21 were already refused); so are productType `{}` (by
  name) and `'Humanized mAb'`, preferredPlatform `'elisa'`, and a sensitivity of `'50'`, -5 or 0.

**Residuals, recorded rather than changed** (the counts are the planning agent's probe of 2,572 inputs with
true/false facts omitted, each field against every completion of the omitted facts; the reviewing agent's probe of
15,576 such inputs, which flags a value or list entry that only some completions give, finds only the receptor
inference and the inconsistent IgE completion below):
- **Lists that hold stated items only.** An unstated risk factor adds no mitigation (168 of 186 risk cases), an
  ungraded clinical-impact domain adds no labeling or monitoring item (1,632 and 1,136 of 2,044), and the
  comparability `riskFactorsTriggered` lists stated triggers only (248 of 252), as its type says. In each case the
  fact is listed in `notAssessed` and its verdict is undetermined. The digital-health slice recorded the same
  ("actions dropped, not made conditional").
- **The NAb assay kept while the tier is undetermined** (requiredStudies, 26 of 186). This is the 2026-10-15 decision,
  pinned by `risk-tier-undetermined-when-factors-unstated.test.ts` ("keeps the NAb assay, because a low tier was never
  established"), with a rationale that says so; keyConcerns says the high-tier elements are open.
- **The receptor inference.** `design_nab_assay` keeps inferring actsThroughCellReceptor from the mechanism (6 of 84
  format cases, 12 of 84 cell-based-requirement cases): the definition discloses it and the rationale now says it.
  With the counterpart unstated for a receptor agonist, the rationale names only the mechanism, which decides it.
- **Clinical-impact severity** "picks" only through a completion that states hypersensitivity false and IgE-mediated
  true (96 of 2,304 single omissions in the reviewing probe). The engine, as on trunk, grades that pair critical
  (`igeMediated: true` makes the domain present), but it is inconsistent (IgE-mediated hypersensitivity without
  hypersensitivity), so with hypersensitivity stated false and igeMediated left out the domain is absent. Over
  consistent completions there are none.
- A `drugName` that is not text is echoed, not refused (nothing crashes). Sampling's `route` is not read and not
  refused; its definition says so.
- **Size.** The engine is 332 bytes under the ceiling and over the 1,500-line threshold (as on trunk), so almost any
  later edit to it crosses 100,000 bytes and raises the `audit:repo-health:ceiling` count, which fails the pre-push
  gate. That later edit should first move `PRODUCT_FOREIGNNESS` (2,108 bytes) and `PLATFORM_LIBRARY` (1,649) unchanged
  into `immunogenicity-reference.ts`'s neighbour or a new sibling in this folder; nothing is moved here because nothing
  needs to be.

**User-visible:** AnA's immunogenicity answers say which facts were given, no longer read "false" as true, no longer
describe a platform nobody asked for as the requested one or print a negative sensitivity target, and say when they
used the FDA figure, inferred a mAb status or a receptor mechanism, or were not told whether the indication is
life-threatening.

## Review (adversarial critic, 2026-11-09)

Re-run and re-checked against HEAD `f68840f22` (the engine, tools, manifest and design are unchanged since the
planner's base `6215e5d31`). The plan is sound as written apart from one completeness defect and three statements:
1. **One monitoring line picked an answer.** With lifeThreateningIndication stated true and the severity undetermined
   (for example igeMediated left out with hypersensitivity true), the line "loss of efficacy may be tolerable…" was
   given, though on the critical answer the engine withholds it. It is now replaced by a line that waits for the grade
   (203 bytes; the engine is 99,668). Fully stated inputs: still none of 2,030,208 changes.
2. **The clinical-impact residual misdescribed the code:** the engine does not treat hypersensitivity false with
   igeMediated true as absent; it grades it critical. Corrected above.
3. **"`manifest:ana` changes their descriptions only"**: it also changes the input descriptions of five of the six
   (no required input, renderer, scope or governed field). Corrected below.
4. **Size:** 535 bytes of headroom became 332; nothing had to move, and the residual says what moves first.
5. **S5d-0b** (`a023cb045`, landed during this review) changes nothing this plan touches, and the plan defines none of
   the ten names its one-home guard covers; the guard passes with the plan applied.
No other defect was found: the 26 booleans read through the shared readers, the probe of 15,576 inputs with facts
omitted finds no verdict that only some completions give beyond the recorded residuals, and the routing and
definitions check out.

## Proof

Run in this session on the working tree, red first, after the regulatory-strategy commit.
- `red/before.txt`: `immunogenicity-unstated-inputs.test.ts` before the change: 45 of 58 fail, all on assertions. The 13
  controls pass: the six stated-basis pins, "keeps the stated soluble-target and mAb answers", and the six routing
  cases.
- `green/after.txt`: 161 of 161 pass in 11 files: the 58, the engine's suites in `server/services/immunogenicity/
  __tests__/` (the one-home guard among them) and every test that reads the engine or its tools.
- **The neighbourhood: 193 files, 4,791 tests, 4,780 pass.** It is the regulatory-strategy commit's set with this
  family's suites. The 11 failures are the `tests/lineage/founder-path-lineage.pglite.test.ts` cases that fail
  identically on trunk.
- **Gates:**
  - typecheck (`typecheck-no-regression --incremental`): 0 errors;
  - ESLint ratchet: no file changes its warning count (the engine 7, comparability 1; the tools file and the test 0);
  - `manifest:ana`: regenerated in the same commit; only the six tools' descriptions and input descriptions change
    (995 to 1,024 characters), with no renderer, scope or governed change.
- **Size:** the engine is 99,668 bytes, 332 under the ceiling; nothing moved. If a later edit needs room,
  `PRODUCT_FOREIGNNESS` (2,108 bytes) and `PLATFORM_LIBRARY` (1,649) can move to `immunogenicity-reference.ts`, as the
  review notes.

The plan was written by a read-only planner and corrected by an independent critic, both in private copies of trunk
(the review's figures are in **Review**). This session applied it to the working tree and ran the red, green,
neighbourhood and gates above.
