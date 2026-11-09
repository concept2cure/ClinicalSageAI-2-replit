# Rule 2 · S5d bioequivalence: the BE worksheets waive, size, classify and route nothing from a fact nobody stated

**Rule:** CLAUDE.md Rule 2 and "fail closed, never fabricate".
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1** (a repair of shipped behaviour). The engine
(`server/services/bioequivalence/`) is in no narrower package; the tool definitions are an S4 path, which F1 covers.
**Audit:** `../design.md`, S5d, the bioequivalence family, including its bullet that the `assess_dissolution_similarity`
instruction say "for recorded profiles use `compare_recorded_dissolution`".
**Date:** 2026-11-09.

## The defect

Two biowaiver rules had been made fail-closed before (`biowaiver-fail-closed.test.ts`: Class III excipients, Class I
reference dissolution). Elsewhere an omitted fact was read as false, nothing refused a malformed value, a
modified-release form read as immediate release, and two waivers were granted that ICH M9 does not contain. Inputs
below were run on the engine as it is on trunk (`f68840f22`; the engine is unchanged since `6215e5d31`).

- **BCS** (`classify_bcs`). `{}` was Class IV (NaN volumes compared false); `fractionAbsorbed: '0.9'` was read as
  0.9 (Class I); with no drug name or dosage form, Class I was `biowaiverEligible: true, isNTI: false`;
  `dosageForm: 'extended-release tablet'` was eligible ('tablet' matched); `drugName: 5` crashed. The Class II
  reference text said ICH M9 and the EMA permit a "Class IIa" weak-acid waiver, and the Class III text that ICH M9
  accepts a rapidly dissolving product with f2 >= 50.
- **BE study** (`design_be_study`).
  - `{}` designed a 2x2 crossover with `perGroup: null` ("CVw=undefined%") and a null washout.
  - With no isNTI and no drug name, NTI status was false: 80–125% limits and 32 subjects.
  - `isNTI: false, drugName: 'warfarin'` came back `isNTI: true`: the list silently overwrote a stated answer.
    `isNTI: 'false'` came back `isNTI: 'false'` (text, read as NTI).
  - The power was a three-step table: 0.85 was sized at 0.80 (44 subjects) and 0.95 at 0.90 (60), each labelled with
    the stated power. A GMR outside the limits gave 9,999 subjects per group (7,500 in a replicate design).
  - `formulationsToCompare: '3'` was a 2x2 crossover; a `'delayed-release capsule'` got no modified-release
    requirements; an omitted fedStudyRequired was "Default false" and said nothing.
- **Dissolution** (`assess_dissolution_similarity`). `{}` and `reference: 'x'` crashed; means of `'40'` were read as
  40; without a unit count, f2 was not computed and `f2Pass`/`f1Pass` were **false**, as for dissimilar profiles, and
  the same for two very rapidly dissolving products, where f2 is not needed.
- **Biowaiver** (`assess_biowaiver`).
  - `{}` crashed (`dosageForm.toLowerCase`).
  - Class I, both products very rapidly dissolving, no drug name and no isNTI: **BIOWAIVER_GRANTED**.
  - **Class II, a weak acid with a pH 6.8 dose/solubility ratio <= 250 mL, under `ich_m9` (the default) or `ema`:
    GRANTED (very rapidly dissolving) or CONDITIONAL, citing "ICH M9 Step 4 (2019) — BCS Class IIa weak acid
    biowaiver".** ICH M9 (adopted by the FDA in 2021 and applied by the EMA) admits Class I and III only; there is no
    Class IIa exception in it, and the platform's own ICH M9 table (`global-ri/bioequivalence-requirements.ts`) lists
    Class II as not eligible.
  - **Class III, test only rapidly dissolving, f2 >= 50, `ich_m9`: GRANTED.** ICH M9 requires both products to be very
    rapidly dissolving for Class III (as the engine's own Class III conditions and the Global RI table say).
  - `dosageForm: 'extended-release tablet'` could be GRANTED; `isWeakAcid: 'false'` read as true; `framework: 'ICH'`
    was read as a framework; `f2: '60'` was read as 60; a stated `isNTI: false` for warfarin was silently overwritten.
  - Class I with only `rapidlyDissolving: true` was CONDITIONAL with `eligible: false`, though both very-rapid facts
    were left out.
- **ANDA pathway** (`guidance_for_anda`). With the three sameness facts left out, a **505(b)(2)**; with the route the
  same and form and strength left out, a suitability petition "because the proposed product has different dosage form
  … and different strength(s)"; `sameRouteAsRLD: 'false'` gave an ANDA; with bcsClass left out, "In vivo BE study
  required"; `bcsClass: 'Class I'` likewise; `strengths: '10 mg'` crashed. `activeIngredient: 'warfarin'` with isNTI
  left out got no NTI line, though the other worksheets look the name up. `routeOfAdministration` was required and
  never read. The ANDA requirements said "Class I, III, or IIa per ICH M9".

## What already exists (RULE 3)

This is a completion: nothing was rebuilt.
- **The engine:** `server/services/bioequivalence/bioequivalence-knowledge.ts` is the one engine for the five
  functions. The f2 statistic and every eligibility condition around it are
  `server/services/cmc/dissolution-comparison.ts` (`compareDissolutionProfiles`), shared with the recorded twin
  `compare_recorded_dissolution` (`deepeningTools.ts`) and the CMC dissolution register; it is **not touched**.
  `biowaiver-fail-closed.test.ts` pins the two earlier biowaiver repairs.
- **The shared readers, reused:** `refuseUnlessStated` and `RequiredInputCheck` (`ana-biostats/computation-engine.ts`);
  `booleanInputStates`, `statedBoolean`, `statedNumber` and `statedOneOf`, the adapters `textInput` and `listed`, and
  the answer search `everyAnswer`, `conclusions` and `decidingFacts`, from
  `immunogenicity/immunogenicity-reference.ts` (not touched here); `normalQuantile` (`stats/normal.ts`). The answer
  search has lived there since **S5d-0** (`37135699b`) and the adapters since **S5d-0b** (`a023cb045`);
  `s5-three-valued-helpers-have-one-home.test.ts` refuses a copy of any of the ten in an engine, and this engine
  defines none of them. Its optional-text check (`optionalText`) and number check (`numberInput`) are its own; no other
  engine has them.
- **The ICH M9 rule, already on the platform:** `global-ri/bioequivalence-requirements.ts` (`global_ri_bcs_biowaiver`)
  lists Class I and III as eligible, Class II and IV as not, and Class III as needing both products very rapidly
  dissolving. This engine is brought into line with it; that file is not touched.
- **The conflict rule, already on the platform:** `medical-device/medical-device-knowledge.ts` leaves the pathway
  `undetermined` and names the conflict when a class III device is stated 510(k)-exempt ("Do not guess which"). A
  stated `isNTI: false` for a drug on the NTI list is treated the same way.
- **The definitions and handlers:** `server/services/ana/bioequivalenceTools.ts`; the five handlers in
  `AnaToolExecutor.ts` run through `runStatsTool`. `AnaToolExecutor.ts` is not touched.
- **The skill:** `skills/library/clinical-pharmacology.ts`, "Bioequivalence and biowaivers", steps 2–5, and
  `skills/library/cmc.ts` step 3. Each line stays true (step 5 already sends recorded profiles to
  `compare_recorded_dissolution`; no line names a Class IIa waiver), so none is changed.
- **Other BE code, not touched:** the Global RI criteria and ICH M9 eligibility tools
  (`global_ri_bioequivalence_criteria`, `global_ri_bcs_biowaiver`) and the pharmacometrics engine. None imports this
  engine. No other code reads a dosage form's text for modified release: `post-approval`, `clinical-pharmacology` and
  `cmc/supac-classifier.ts` take a boolean or a dosage-form family
  (`git grep -n "modified.release\|isModifiedRelease\|extended.release" server/`).
- **Readers of the changed result fields:** none outside the engine and its tests.
- **Searches run:** `git grep` for the five tool and function names, `bioequivalenceTools`, `BIOEQUIVALENCE_TOOLS` and
  `bioequivalence-knowledge`; "biowaiver", "BCS", "IIa", "weak acid", "NTI", "narrow therapeutic", "dissolution", "f2",
  "ANDA", "suitability petition", "modified release" and "extended release" across `server/services` and `shared`; the
  result fields `decision`, `eligible`, `biowaiverEligible`, `isNTI`, `estimatedSampleSize`, `f2Pass` and
  `recommendedPathway`.
- **History:** `git log --all --diff-filter=D --name-only`, filtered for
  `bioequiv|biowaiver|dissolution|bcs|anda`, finds nothing. The clone is shallow, so this covers local history only.

## The change

- **Booleans.** Each of the 14 true/false inputs (design 2, biowaiver 7, ANDA 5) reports `true`, `false` or
  `not_stated` through `inputStates`; a malformed one is refused by field.
- **Required and malformed inputs** are refused by field through `refuseUnlessStated` and the shared readers: the
  three BCS numbers (dose > 0, solubility >= 0, fraction 0–1), CV and half-life (> 0), GMR (> 0), power (0–1),
  formulations (a whole number >= 2), each profile list (finite numbers, as long as its time points), the unit count
  (a whole number), the BCS class and framework (their lists), f2 (0–100), the pH 6.8 ratio (> 0), the ANDA texts and
  strength list, and an optional drug name or dosage form that is not text.
- **NTI status** (`ntiBasis`, new in every result that reads it). A stated isNTI is kept; otherwise the drug name (the
  active ingredient for the ANDA guidance) is looked up on the platform's NTI list, which the basis says is not
  exhaustive (a disclosed default); with neither, NTI status is not assessed. **A stated false for a listed drug is a
  conflict of inputs, named as a finding:** NTI status is then not assessed, every conclusion NTI status could change is
  null or `BIOWAIVER_NOT_ASSESSED` with the conflict named, and every conclusion both readings give is kept (a Class IV
  or extended-release biowaiver is DENIED either way; the washout and variability are unchanged).
- **Biowaiver.** The decision is given only when every answer to the unstated true/false facts gives it; otherwise it
  is `BIOWAIVER_NOT_ASSESSED`, `eligible` is null, the first rationale line names the deciding facts and the decisions
  their answers give, and the rest of the rationale and the citations are only those every answer gives (no "eligible
  for biowaiver", no "biowaiver granted" citation). The dissolution conditions are those any waiver would need, and
  the outstanding requirements ask for the facts and keep those of the reading in which an unstated fact is not
  established. f2 and the pH 6.8 ratio are evidence: an omitted f2 is an outstanding requirement, as before. An
  omitted framework is ich_m9 and `defaultsApplied` says so; the framework now labels the result only.
- **ICH M9 scope.** Class II is denied under every framework: the "Class IIa" weak-acid branch is removed, and
  `isWeakAcid` (reported in `inputStates`) and the pH 6.8 ratio (still checked) decide nothing. A Class III product
  that is only rapidly dissolving is not granted on f2. The Class II and III reference text, the Class II denial's
  rationale and citation, and the ANDA requirement line say what ICH M9 says. The decision tree is otherwise unchanged
  (`biowaiverOutcome`); the search reuses it for each answer.
- **BCS.** Eligibility is null, and says why, while the drug name or the dosage form is not stated for an otherwise
  eligible class.
- **BE study.** With NTI status not assessed, the design fields an NTI answer would change, the acceptance criteria and
  the sample size are null, and the first additional requirement names why (not stated, or the conflict); the
  citations are both answers'. `defaultsApplied` lists an omitted GMR (100%), power (0.80) or formulation count (2).
  The power is sized as stated: z is `normalQuantile(power)` rounded to the table's three decimals, so 0.70, 0.80 and
  0.90 keep 0.524, 0.842 and 1.282. A GMR outside the limits has a null sample size and says why. An omitted
  fedStudyRequired adds a study condition that says it is not assessed.
- **Modified release.** One helper (`isModifiedRelease`: modified, extended, delayed, sustained, controlled,
  prolonged, enteric, and the words ER, XR, XL, SR, CR, DR, MR) decides it for the BCS check, the biowaiver's
  immediate-release gate, the BE study's requirements and the ANDA strategy, which each had their own partial list.
  It is the only dosage-form-text reader of release type in `server/`.
- **Dissolution.** `f2`, `f1`, `f2Pass` and `f1Pass` are null when f2 is not computed. The validation sits in two small
  helpers (`finiteList`, `profileChecks`), so the function stays within ESLint's length limit.
- **ANDA.** The pathway is given only when every answer to the unstated sameness facts gives it; otherwise
  `not_assessed`, with `pathwayGuidance` null, `suitabilityPetitionRequired` null unless every answer agrees, and a
  reason naming the facts and the candidate pathways. A suitability petition decided with a fact unstated names it. An
  unstated BCS class, NTI status or combination fact is named where it would add a line. The three sameness facts and
  `routeOfAdministration` (not read: the pathway reads `sameRouteAsRLD`) are no longer schema-required.
- **Size.** The BE study design registry (`BE_STUDY_DESIGNS`, 15,940 bytes) moves unchanged, byte for byte, into the
  sibling `server/services/bioequivalence/bioequivalence-reference.ts` (Rule 6 split), which imports its types from
  the engine. The engine is 85,799 → 87,633 bytes, the sibling 16,576.
- **The definitions** fit the gateway's 1,024 characters (950 to 1,021; four were 1,081 to 1,749), keep the
  result-card renderer, say "relay the validation error", name what an omission leaves, and no longer say "Default
  false", "Default 100", "Default 0.80" or "IIa". `assess_dissolution_similarity` says "For recorded profiles use
  compare_recorded_dissolution, which reads the CMC dissolution register", as the design asks.
- **Pins moved in place:** `biowaiver-fail-closed.test.ts`, three assertions that pinned a default: two `eligible`
  false → null (excipients, and the reference product, left out) and one CONDITIONAL → BIOWAIVER_NOT_ASSESSED (Class I
  rapidly dissolving with both very-rapid facts left out). In each, an omitted fact could grant the waiver, so false
  was an answer nobody gave. Their outstanding-requirement checks are unchanged and pass.
- **The design** records this family's "What already exists" and result, and its status row.

**Stated inputs whose result changes.** Fully stated, well-formed inputs were compared with the engine on trunk,
ignoring the new `inputStates`, `ntiBasis` and `defaultsApplied`. A change is counted under every reason that explains
one of its changed fields; **every changed case is explained, and none by a reason it does not have**:
- `classify_bcs`, 19,872 compared: 14,256 change. 8,640 a modified-release form that is no longer immediate release
  (eligibility true → false, or a not-IR line where the class was ineligible anyway); 9,936 a Class II or III result
  whose reference text and citations no longer claim a "IIa" waiver or a rapid-plus-f2 Class III waiver.
- `design_be_study`, 336,000 compared: 303,872 change. 120,000 a GMR outside the limits (9,999 or 7,500 subjects become
  null); 84,000 a stated `isNTI: false` for warfarin, now a named conflict with the NTI-dependent fields null, where it
  was silently NTI; 51,680 a power other than 0.70, 0.80 or 0.90, now sized as stated; 151,200 a delayed-, sustained-,
  controlled-, prolonged-release, enteric-coated or ER form that now gets the modified-release requirements. The grid
  deliberately puts each of these in many cells.
- `assess_dissolution_similarity`: of 240 fully stated profile pairs, 200 are not computed by the CMC engine (very
  rapidly dissolving, fewer than three comparable points, or above the variability limits) and their `f2Pass`/`f1Pass`
  move from false to null; the 40 computed ones do not change.
- `assess_biowaiver`, 491,520 compared: 205,932 change. 122,880 the warfarin conflict (DENIED where both readings deny,
  otherwise NOT_ASSESSED); 73,728 a modified-release form denied at the dosage-form gate; 768 a "Class IIa" waiver
  (Class II weak acid, ratio <= 250 mL, `ich_m9` or `ema`) now DENIED; 108 a Class III product only rapidly dissolving
  with f2 >= 50 now CONDITIONAL; 8,448 a Class II denial whose rationale and citation no longer claim an ICH M9 IIa
  exception.
- `guidance_for_anda`, 11,776 compared: 3,440 change. 1,472 an ANDA pathway whose requirement line now reads "Class I or
  III per ICH M9"; 1,472 a stated `isNTI: false` for warfarin, which now adds the conflict line; 1,152 a delayed-,
  sustained-, prolonged-release, enteric-coated, ER or XR form that now gets the modified-release BE lines.
- A dose of 0, a formulation count of 1, an empty strength list, a power of 0 or 1 and an f2 outside 0–100 are now
  refused.

Each is a correction: 9,999 subjects and a power sized at another power were figures nobody stated; a pass flag of
false for an f2 never computed read as "dissimilar"; ICH M9 covers immediate-release forms and Class I and III only and
requires very rapid dissolution of both products for Class III; and the warfarin case silently replaced a stated
answer.

**Results that change because an input was omitted or malformed:** every case in "The defect" above. A probe of 172,032
biowaiver inputs with one or two of the seven true/false facts omitted, each result field against every completion,
finds no decision, eligibility or rationale line in a NOT_ASSESSED result that only some answers give; what it flags
there is by design (the dissolution conditions any waiver would need, the not-established reading's requirements) or
the generic fallback citation "ICH M9 Step 4 (2019)", which one CONDITIONAL answer also cites. The planner's version
flagged 10,752 rationale lines there ("BCS Class I …: eligible for biowaiver." beside an NTI answer that denies). The
design probe (576) flags only the citations, which are both answers' by design, and a null sample size that equals the
NTI answer's null (a GMR outside 90.00–111.11%); the ANDA probe (4,800) flags nothing.

**Residuals, recorded rather than changed:**
- **Texts of a decided result.** When the unstated facts cannot change a biowaiver decision, its rationale,
  conditions and outstanding requirements follow the reading in which an unstated fact is not established (the probe
  flags 68,544 rationale and 29,696 requirement entries that other completions reach by another path to the same
  decision). That reading never takes an unstated fact as true, and its requirement lines ask for what is not
  established. In a NOT_ASSESSED result, the dissolution conditions are those any waiver would need and the
  requirements those of that reading, by design.
- **The NTI list** is not exhaustive and the name lookup is a disclosed default; a drug not on it is treated as not NTI
  and the basis says so. A stated false for a listed drug is not resolved by the engine: the user confirms it.
- **The framework** labels the result; the criteria are ICH M9's, which the FDA and the EMA apply. WHO's own BCS
  criteria are not modelled (its 2006 proposal admitted some Class II weak acids; whether its current guidance does was
  not verified, and the engine denies, which is the fail-closed reading).
- **Class I with a test product very rapidly or rapidly dissolving and f2 >= 50** is granted without a stated
  reference-product rapid-dissolution fact (ICH M9 asks both to be rapidly dissolving); there is no such input. Kept.
- **Numbers are evidence, not facts searched.** An omitted f2 or pH 6.8 ratio is an outstanding requirement, not a
  third answer.
- **Text matching.** Immediate release is still read from words in the dosage form; "oral solution" and "oral
  suspension" are not immediate-release solid forms here (ICH M9 also covers suspensions).

**User-visible:** AnA no longer grants a biowaiver for an extended-release or enteric-coated tablet, for a Class II
weak acid, for a Class III product that is only rapidly dissolving, or for a drug whose NTI status nobody gave; no
longer designs a study of "undefined" subjects or 9,999 per group; sizes the power the user asked for; says when it used
a default; names a stated NTI answer that the NTI list contradicts; and asks before it picks an ANDA, a petition or a
505(b)(2).

## Review (adversarial critic, 2026-11-09)

The plan was re-run and re-checked against HEAD `f68840f22` (the engine, tools, pin, manifest and design are unchanged
since the planner's base `6215e5d31`). Found and fixed:
1. **The planner's "Class IIa" correction was a regression.** It called the denial of a Class II drug with isWeakAcid
   omitted a defect and made it NOT_ASSESSED, which asks the user for a fact ICH M9 does not use and, once given,
   grants a waiver ICH M9 does not contain. The branch is removed (768 stated grants or conditionals become DENIED).
2. **Class III rapid + f2 >= 50 under `ich_m9` was GRANTED**, against ICH M9's very-rapid requirement for Class III; not
   in the planner's plan. Removed (108 stated cases).
3. **The NTI conflict is a finding, not a refusal.** The planner refused `isNTI: false` for a listed drug. The input
   is well-formed, so refusal is the wrong tool (S5 refuses missing or malformed values); it withheld conclusions both
   readings give (`assess_biowaiver({ bcsClass: 'IV', dosageForm: 'tablet', drugName: 'warfarin', isNTI: false })` is
   DENIED either way, and the washout and variability do not depend on NTI); and its only exits (state true, or leave
   it out) both lead to the NTI answer. Reading the stated false would grant a BCS waiver for warfarin, which ICH M9
   excludes; overwriting it silently was the trunk defect. The repository's decided rule for conflicting inputs
   (`medical-device-knowledge.ts`, class III and 510(k)-exempt: "Do not guess which") is a named conflict and an
   undetermined conclusion, which this follows.
4. **A NOT_ASSESSED biowaiver spoke for one answer**: it kept the reading's first rationale line ("BCS Class I …:
   eligible for biowaiver.") while an NTI answer would deny, and its citations ("… biowaiver granted"). It now keeps
   only what every answer gives.
5. **`guidance_for_anda` ignored the NTI list** that the other worksheets use for an omitted isNTI, and required
   `routeOfAdministration`, which it does not read. Both fixed (the ANDA result gains `ntiBasis`).
6. **Modified release** missed "enteric-coated" and ER/XR forms, which then read as immediate release. Added.
7. **An unused import** (`ComputationRefusal`) would have added an ESLint warning (8 → 9); removed (8 → 8).
8. The README's stated-change counts are re-measured with every change explained (the planner's probe counted the
   first matching reason only).
9. **Rebased on S5d-0b** (`a023cb045`, landed during this review): the plan defined `textInput` and `listed`, which now
   live in `immunogenicity-reference.ts`, so with the plan applied the one-home guard fails ("expected [ …(5) ] to
   deeply equal []", the 5 being these two and the biosimilar plan's three, on `f68840f22`). The engine
   imports them.

## Proof

Run in this session on the working tree, red first, after the biosimilar commit.
- `red/before.txt`: `bioequivalence-unstated-inputs.test.ts` before the change: 68 of 79 fail, all on assertions
  (three catch trunk's handlers returning a crash as their error). The 11 controls pass.
- `green/after.txt`: 156 of 156 pass in 5 files: the 79, `biowaiver-fail-closed.test.ts` (its three pins moved in
  place), `cmc/__tests__/dissolution-comparison.test.ts`, `global-ri/__tests__/bioequivalence-requirements.test.ts` and
  the one-home guard.
- **The neighbourhood: 198 files, 4,954 tests, 4,943 pass.** It is the biosimilar commit's set with this family's
  suites. The 11 failures are the `tests/lineage/founder-path-lineage.pglite.test.ts` cases that fail identically on
  trunk.
- **Gates:**
  - typecheck (`typecheck-no-regression --incremental`): 0 errors;
  - ESLint ratchet: no file changes its warning count (the engine 8; the sibling, the tools file and the test 0);
  - `manifest:ana`: regenerated in the same commit; the five tools' descriptions and input descriptions change, and
    the inputs no function reads leave the `required` lists. No renderer, scope or governed change. The descriptions
    are 950 to 1,021 characters.
- **Citations beside each denial.** As the coordinating session asked, each `BIOWAIVER_DENIED` rule carries its basis
  in a comment beside it in the engine: ICH M9's scope (immediate-release solid oral forms; narrow-therapeutic-index
  drugs excluded; Class I and III only) and its Class III dissolution condition. ICH M9 is cited by its scope and
  dissolution provisions, not by section number: neither this session nor the review could open the guideline's text
  here.
- **Size:** the engine is 88,052 bytes (85,799 before; 104,087 without the move), the sibling
  `bioequivalence-reference.ts` 16,576.

**The last S5d commit.** It also:
- releases the S5d hold row in `.design/claude-convergence/COORDINATION.md`;
- moves S5d out of `design.md`'s queued row;
- lowers the repo-health byte ceiling in `package.json` (`audit:repo-health:ceiling`, `--ceiling-large-bytes`) from 56
  to 54, the count measured on this tree. The regulatory-strategy and biosimilar engines left the list of files over
  100,000 bytes, and the coordinating session asked for the ceiling to lock that in. The line ceiling stays at 113,
  the measured count.

The plan was written by a read-only planner and corrected by an independent critic, both in private copies of trunk
(the review's figures are in **Review**). This session applied it to the working tree and ran the red, green,
neighbourhood and gates above.
