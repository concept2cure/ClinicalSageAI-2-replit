# Rule 2 · S5b medical device: the device worksheets route, find, choose and plan nothing from a fact nobody stated

**Rule:** CLAUDE.md Rule 2 and "fail closed, never fabricate".
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1** (a repair of shipped behaviour). The coordinating session
approved S5b under F1 and holds its files (`54da281ca`, `.design/claude-convergence/COORDINATION.md`): the
medical-device engine "and a sibling split if it needs one", its definitions and the skill text naming them.
**Audit:** `../design.md`, S5b, the medical-device family (the third of four S5b commits).
**Date:** 2026-11-08 (planned read-only); corrected 2026-11-09 after an independent critic pass.

## The defect

The 2026-10-15 sweep had made parts of this engine three-valued: the substantial-equivalence steps, the
clinical-data answer, the GSPR applicability, the IVDR Class A sterility route and the plan's conditional sections.
Nothing refused a malformed value, and elsewhere an omitted fact was read as false. Each input below was run on the
engine as it was before this change.

- **US pathway** (`select_device_pathway`).
  - `{ usClass: 'II', predicateExists: true }` returned "510(k)", "MDUFA V goal 90 FDA days", with the product
    code's exemption and the biologic status never stated (`exempt: true` gives "exempt", `isBiologic: true` "BLA").
  - `{ usClass: 'III', predicateExists: false }` returned "IDE-then-PMA" with novelty, HUD status and biologic
    status unstated (`novelLowModerateRisk: true` gives De Novo).
  - `isBiologic: 'false'` (text) returned "BLA"; `usClass: 'Class II'`, or no `usClass`, returned "510(k)";
    `predicateExists: 'false'` returned "510(k)".
  - `humanitarianUseDevice: true` with `estimatedAnnualUSPopulation: null` returned "HDE" (null compared as 0);
    `'5000'` (text) returned "HDE" too.
  - `clinicalEvidenceLikelyRequired` was `false` for every undetermined pathway, including a class III HUD device
    with no population, whose alternatives (HDE, PMA) both need clinical evidence.
- **EU route** (same tool).
  - `euMdrClass: 'I'` with sterility, measuring and reuse unstated (or `sterile: null`) returned
    "self-certification (no NB)".
  - `euMdrClass: 'Class IIa'` returned the notified-body route with the rationale "MDR Class III: …".
  - `euIvdrClass: 'B'` with `isIVD` omitted returned "undetermined", "EU class not supplied".
  - Stated: IVDR Class A, `sterile: false`, `measuringFunction: true` returned "notified body involvement",
    "IVDR Class A sterile: …". IVDR Article 48(10) has a Class A manufacturer declare conformity on the Annex II and
    III technical documentation, with a notified body (Annex IX or XI) only for a device placed on the market
    sterile, and only for the sterility aspects. A measuring function sends a Class I device to a notified body
    under the MDR (Article 52(7)(b), Class Im); the IVDR has no such rule.
- **Substantial equivalence** (`assess_substantial_equivalence`).
  - Every step answered yes and `predicateRecalledForSafety` omitted returned "SE", "Adequate — valid predicate
    with same intended use.", "510(k)-Abbreviated".
  - `predicateRecalledForSafety: 'true'` (text) returned "NSE", "De Novo (no valid predicate)".
  - `performanceDataDemonstratesEquivalence: 'true'` was read as unstated (indeterminate), not refused.
  - With `patientContacting`, `sterile`, `hasSoftware` and `isIVD` omitted, the performance data listed only bench
    testing, and the submission type was "510(k)-Abbreviated" (unstated software and IVD read as false).
  - With the technology different and `differentQuestionsOfSafetyEffectiveness` omitted, the determination was
    "indeterminate" and the submission type "510(k)-Traditional", though `true` makes the device NSE (De Novo).
- **Clinical evidence** (`design_device_clinical_evidence`).
  - `{ usClass: 'II', clinicalDataNeededForSE: true, significantRisk: false }` recommended a "pivotal" study with
    `isIVD` omitted, and named no feasibility, literature or real-world route an unstated fact had left out.
  - `euMarket` omitted gave "EU market not indicated…", as a stated false does; `euMarket: true` with `isIVD`
    omitted gave the MDR clinical-evaluation plan.
  - `{ usClass: 'II', novelTechnology: false, clinicalDataNeededForSE: false, implantable: 'true',
    lifeSustaining: false }` returned `clinicalDataRequired: false`, "Clinical data are generally NOT required", for
    a device stated, as text, to be implanted.
  - `usClass: 'Class III'` and `usPathway: 'pma'` were not refused.
- **GSPR matrix** (`assess_essential_principles`).
  - `{}` built the MDR Annex I matrix (isIVD unstated), graded GSPR 1–4 as gaps and raised the critical findings
    "QMS-MISSING" ("No ISO 13485 QMS indicated") and "RMF-MISSING" for files nobody described.
  - `sterile: 'true'` was read as unstated; `standardsClaimed: 'ISO 14971'` crashed
    (`(params.standardsClaimed ?? []).map is not a function`) into the tool's `{ error }`.
- **Submission plan** (`plan_device_submission`).
  - `usPathway: '510k'`, or none, returned "Pathway undetermined — run selectDevicePathway first." with eight
    sections.
  - `preSubmissionDone: 'true'` (text) was read as "a Pre-Submission has already occurred".
  - A 510(k) with `isIVD` omitted was planned on the nIVD eSTAR, so the ten IVD questions (analytical performance
    first) were absent; an IVD De Novo lost its IVD performance section the same way.
  - `euMarket` omitted planned no EU documentation and said nothing; `euMarket: true` with `isIVD` omitted planned
    "MDR Annex II/III".
  - An omitted `preSubmissionDone` gave the Q-Sub phase and "strongly recommended" with no word that it was unstated.
  - `asOf: 'tomorrow'` threw a plain `Error`, so AnA got `needs_parameters` with no `code` or `field`.

## What already exists (RULE 3)

This is a completion: nothing was rebuilt.
- **The engine:** `server/services/medical-device/medical-device-knowledge.ts` is the one engine for the five
  worksheets. Its 2026-10-15 sweep added `seStepAnswer`, `unstated`, `notRequiredMissingFacts`,
  `statedProperty` and `conditionalSection`; they are pinned by the five suites in `medical-device/__tests__/`. This
  change extends them. It does not add an engine, a service or a folder.
- **The data sibling:** `medical-device-knowledge-data.ts`, the existing sibling of the engine (standards, CFR map,
  citation lists). The engine was 100,392 bytes, over the 100,000-byte ceiling, so the fixed entries it selects from
  move there: the clinical study types, the evidence hierarchy, the SE performance data and open steps, the PMA
  modules, the non-eSTAR and EU technical-documentation sections and the MDR Class I aspects. No logic moves.
- **`classify_medical_device`:** `classify_device` under a second name (`medicalDeviceTools.ts`, handler in
  `AnaToolExecutor.ts`), which runs the fail-closed `market-specs/device-classification.ts`. Not touched; its own
  missing-fact handling and refusals (`DeviceClassificationFactError`) are pinned by
  `classify-medical-device-states-no-class-without-facts.test.ts` and
  `device-tools-leave-unstated-facts-undetermined.test.ts`.
- **The definitions and handlers:** `server/services/ana/medicalDeviceTools.ts`, spread into `ALL_ANA_TOOLS`. The
  five handlers run through `runStatsTool`, which labels a success with `statedInputEnvelope` and turns a
  `ComputationRefusal` into `needs_parameters` with `code` and `field`. `AnaToolExecutor.ts` is not touched.
- **The shared readers, reused:** `booleanInputStates`, `statedNumber` and `statedOneOf`
  (`immunogenicity/immunogenicity-reference.ts`), `ComputationRefusal` and `refuseUnlessStated`
  (`ana-biostats/computation-engine.ts`), and the class vocabularies `DEVICE_CLASSES`, `MDR_DECLARED_CLASSES` and
  `IVDR_CLASSES` (`shared/regulatory/device-class.ts`).
- **The eSTAR registry:** `pathway-engines/estar/estar-mapper.ts` (`estarSlots`, `slotApplicability`), read, not
  edited; the IVD slot set it already models is what an unstated `isIVD` now keeps on the plan.
- **The skills:** `skills/library/device.ts`, `diagnostics.ts`, `regulatory-strategy.ts` and `submissions.ts` name
  these tools. No line becomes false. Two lines list the facts to pass and omit one the engine now asks for, so a
  call made as they say would always come back undetermined; each gains it (below).
- **Readers of the changed result fields:** none outside the engine and its tests (`git grep` for
  `clinicalEvidenceLikelyRequired`, `recommendedSubmissionType`, `overallConformity` and the five function names
  across client, shared and server). The manifest's renderers are derived from the descriptions and do not change.
- **Searches run:** `git grep` for the six tool names, the five function names, `MEDICAL_DEVICE_TOOLS`,
  `medical-device-knowledge`, `not_stated` and `inputStates` in the device files (none before this change), and the
  result fields above; `ls server/services` for device, pathway, gspr and estar.
- **History:** `git log --all` on the engine, its tests and the definitions shows only `182fed957` (2026-10-15).
  `git log --all --diff-filter=D --name-only`, filtered for
  `medical-device|device-pathway|substantial-equiv|essential-princip|device-submission|clinical-evidence|gspr`,
  finds nothing; the only device-name removal is `classifyDevice`, taken out of the engine in place on 2026-10-15.
  The clone is shallow, so this covers local history only.

## The change

- **Booleans.** Each of the 47 true/false inputs the five functions read reports `true`, `false` or `not_stated`
  through `inputStates`, and a malformed one (`'true'`, `0`) is refused by field. `layUse`, which the engine never
  reads, is not listed and its definition says so.
- **Required inputs and vocabularies** are refused by name: `usClass` and `predicateExists` of the pathway,
  `usPathway` of the plan and, new, `isIVD` of the GSPR matrix. A malformed US class, US pathway, EU class, HUD
  population, standards list or entry, or `asOf` is refused by field.
- **US pathway.** It is given only when no answer to an unstated `isBiologic`, `exempt`, `novelLowModerateRisk` or
  `humanitarianUseDevice` could change it. Otherwise it is "undetermined": the rationale says what each true answer
  gives and what the stated facts give if each is false, the alternatives list them, and a `NEEDS-INPUT-UNSTATED`
  finding names them. `clinicalEvidenceLikelyRequired` is `null` while the pathway is undetermined. An unstated
  `exempt` does not open a class III pathway: no class III device is 510(k)-exempt, and the engine already answers
  class III with `exempt: true` as a conflict.
- **EU route.** An MDR Class I device with no aspect stated true and one unstated is "undetermined", naming it. A
  stated IVDR (or MDR) class without `isIVD` names its own regulation; two stated classes without it leave the route
  undetermined. An IVDR Class A device goes to a notified body for sterility only.
- **Substantial equivalence.** An unstated `predicateRecalledForSafety` is an open step: the determination is not
  SE, and the predicate adequacy says it was not stated. A `PERF-UNDETERMINED` entry names the performance data an
  unstated device property decides. The 510(k) type is `null` while an unstated recall or different-questions answer
  could make the device NSE, or an unstated `hasSoftware` or `isIVD` decides between Abbreviated and Traditional. An
  unstated performance-data answer leaves the type as it is: either answer is a 510(k).
- **Clinical evidence.** A `STUDIES-NOT-ASSESSED` finding names the feasibility, confirmatory (IVD clinical
  performance or pivotal), literature and real-world studies an unstated fact decides; none is chosen for it. The
  EU plan says when the EU market, the IVD status, the MDR class or the implant fact was not stated.
- **GSPR matrix.** GSPR 1–4 are `not-assessed` when the QMS or risk-file fact that addresses them is unstated (a gap
  only when stated false). `QMS-MISSING` and `RMF-MISSING` need a stated false; `FILES-NOT-STATED` names an unstated
  one. The verdict is unchanged: `insufficient-information` unless both are true, else `gaps-present`.
- **Submission plan.** An unstated `isIVD` keeps the IVD eSTAR questions on a 510(k) plan and the IVD performance
  section on a De Novo plan, each marked undetermined, and the EU documentation names "MDR or IVDR". An unstated
  `euMarket` adds `EU-NOT-STATED`; an unstated `preSubmissionDone` is named in the Q-Sub phase and strategy.
- **Size.** The engine goes from 100,392 to 99,816 bytes (1,974 to 1,922 lines): the fixed entries listed above move
  into `medical-device-knowledge-data.ts` (11,204 to 29,560 bytes), and `selectDevicePathway`'s US and EU halves
  become `usPathwayOn`, `euRouteOf`, `ivdrRoute` and `mdrRoute`. An unused `eslint-disable` directive goes.
- **The definitions** say what an omission leaves and what is refused, and all five now fit the gateway's 1,024
  characters (1,015 to 1,023; they were 1,077 to 1,527). The shared note no longer mentions "a generic drug
  submission". Unread inputs say so: `layUse`, the plan's `euMdrClass` and `euIvdrClass`, and the SE device names.
  `assess_essential_principles` now requires `isIVD`. The SE description keeps "Traditional or Abbreviated": without
  those words "should we file a traditional, special or abbreviated 510(k)" fell out of the 50 tools offered for the
  turn (rank 19 before, outside after; 27 with them). It names no Special 510(k), which the engine never returns.
- **The skills.** `regulatory-strategy.device-pathways` (method step 2) now lists the biologic status among the facts
  to pass to `select_device_pathway`, and `device.substantial-equivalence` (method step 6) lists whether the predicate
  was removed from the market for safety reasons among the `assess_substantial_equivalence` answers.
- **Engine tests updated in place**, each to state a fact it had left unstated: `pathway-decisions.test.ts` states
  the biologic, exemption, novelty and HUD facts false unless a case sets one (the class I case keeps `exempt`
  unstated); `device-verdicts-need-the-facts-that-decide-them.test.ts` states `predicateRecalledForSafety: false`
  and `isIVD: false`; `plan-device-submission.test.ts` states `isIVD: false` where it checks a non-IVD 510(k).
  No expectation changes.
- **The design** records this family's "What already exists" and its result, and its status row.

**Stated inputs whose result changes.** Fully stated, well-formed inputs were compared with the engine before this
change (all booleans and enums stated; populations 4,000 and 9,000): 53,248 pathway, 2,048 substantial-equivalence,
114,688 clinical-evidence, 12,288 GSPR and 2,048 plan inputs.
- **Four functions:** nothing changes but the new `inputStates`.
- **Pathway:** 8,368 of 53,248 change, in two ways only.
  - 7,488 whose US pathway is undetermined on the stated facts change `clinicalEvidenceLikelyRequired` from `false`
    (a default nothing set) to `null`. For example `{ usClass: 'III', predicateExists: false,
    humanitarianUseDevice: true, novelLowModerateRisk: false, exempt: false, isBiologic: false }` with no
    population, whose HDE and PMA alternatives both need clinical evidence; and class I with `exempt: false`.
  - 1,024 IVDR Class A, `sterile: false` inputs: the 512 with `measuringFunction: true` move from "notified body
    involvement" ("IVDR Class A sterile: …") to "self-certification (no NB)"; all 1,024 read "IVDR Class A, not
    supplied sterile: …" for "IVDR Class A (non-sterile, non-measuring): …". (144 of them are also among the 7,488.)

**Results that change because an input was omitted or malformed** (the old result was a default or a misreading),
for example:
- `{ usClass: 'II', predicateExists: true }`: "510(k)" becomes "undetermined", "isBiologic (true gives BLA), exempt
  (true gives exempt) were not stated. If each is false the pathway is 510(k): …".
- `isBiologic: 'false'`, `usClass: 'Class II'`, `euMdrClass: 'Class IIa'`, `estimatedAnnualUSPopulation: '5000'`,
  `implantable: 'true'`, `usPathway: '510k'`, `standardsClaimed: 'ISO 14971'`, `asOf: 'tomorrow'`: each is refused by
  field (`needs_parameters`, `invalid_input`).
- A null HUD population: "HDE" becomes "undetermined".
- SE with the recall omitted: "SE" and "510(k)-Abbreviated" become "indeterminate" and `null`, naming
  `predicateRecalledForSafety`.
- SE with the technology different and `differentQuestionsOfSafetyEffectiveness` omitted: "510(k)-Traditional"
  becomes `null`.
- GSPR `{ isIVD: false }`: GSPR 1–4 go from gaps to not assessed, and the two critical findings become
  `FILES-NOT-STATED`. `{}` is refused (`isIVD`).
- A 510(k) plan with `isIVD` omitted gains the ten IVD eSTAR questions, each marked undetermined.

**Residuals, recorded rather than changed:**
- **A stated answer still asked for.** Class I with `exempt: false` stays "undetermined" and still says "Supply
  `exempt`"; whether a non-exempt class I device needs a 510(k) or a De Novo is a regulatory change beyond this slice.
- **Cautious readings kept.** With `clinicalDataIncluded` unstated a 510(k) Q-Sub is still "strongly recommended"
  (now prefixed when `preSubmissionDone` is unstated), as `device-verdicts-need-the-facts-that-decide-them.test.ts`
  pins. An omitted `usPathway` is read as none of PMA, HDE and IDE-then-PMA in the clinical-data answer; class III
  already requires clinical data, and the definition says so.
- **Advice that is not a determination.** An unstated `usesReferenceDevice` adds no reference-device note.
- **An open answer worded thinly.** A class III device with `humanitarianUseDevice` omitted and no population reads
  "humanitarianUseDevice (true gives undetermined) was not stated", and the alternatives list only the pathway if it
  is false; the HDE route a true answer could open is not listed. The pathway is undetermined, as it must be.
- **Stated contradictions left as they were.** `isIVD: false` with only an IVDR class still reads "EU class not
  supplied". An exempt pathway still gets the "strongly recommended" Q-Sub text.
- **Disclosed default.** An omitted standards list claims no standard, so GSPR 5, 10, 11, 17 and 18 are gaps when
  applicable, as the 2026-10-15 sweep pins; the definition says so.
- **Not this family's engine.** `classify_medical_device` runs `market-specs/device-classification.ts` (91,847 bytes),
  which this change does not audit beyond its existing pins.
- **Lines.** The engine is still over the 1,500-line threshold (1,922). It leaves the over-100,000-bytes list, so
  the repo-health ceiling (`--ceiling-large-bytes 33`) may be lowered by one when the scan baseline is regenerated.

**User-visible:** AnA no longer names a 510(k), a PMA, a BLA, an HDE, self-certification, SE, an Abbreviated 510(k), a
pivotal study, an MDR plan or a missing QMS from facts it was not given. It says which fact would change the answer
and asks for it. A malformed value is asked for again, by field.

## Proof

Run in this session on the working tree.
- `red/before.txt`: `medical-device-unstated-inputs.test.ts` fails 132 of 141 cases on `089047f7a` (the digital-health
  commit, whose medical-device files are trunk's), all on assertions; one of them catches the engine throwing
  `s.trim is not a function` on a malformed value. The 9 controls pass: the five stated-basis cases, the three
  malformed SE step answers (already refused by `seStepAnswer`) and "still ends at a stated NSE whatever the recall".
- `green/after.txt`: 141 of 141 pass, and 188 of 188 with the engine's five suites.
- **The neighbourhood: 147 files, 4,006 tests, 3,994 pass.** It is the review's 128-file set (the five engine suites,
  the FDA-pathway and classification-description suites, every `*unstated*` suite, the skills suites, the
  tool-selection suites, the tool registry, `submission-center-tools.test.ts` and every test naming the engine, its
  tools or the submissions routes) with the biomarker and digital-health neighbourhoods. The 12 failures are not this
  change's:
  - 11 in `tests/lineage/founder-path-lineage.pglite.test.ts`, the same 11 cases on a copy of trunk
    (`origin/concept2cure-v2`) without this change;
  - `deepening-tools.test.ts`, "the OPEN program outranks a project id the model supplied", which fails identically
    on trunk.
- **Gates:**
  - typecheck (`typecheck-no-regression --incremental`): 0 errors;
  - ESLint ratchet: net one warning fewer (the engine 15 to 14: an unused `eslint-disable` directive removed; the
    split keeps the pathway's two size warnings, now on `usPathwayOn`); the new test 0;
  - `manifest:ana`: regenerated in the same commit. Only the six device tools change: their descriptions and input
    descriptions, and `isIVD` becomes a required input of `assess_essential_principles`. No renderer, scope or
    governed flag changes. The six descriptions are 980 to 1,023 characters.
- **Mutations (the review's).** Against deliberately broken copies of the patched engine the red test fails: the
  pathway from the stated facts only (MUT1); the recall never open (MUT2); an unstated `isIVD` given a pivotal study
  (MUT3); an unstated risk file graded a gap (MUT4); an unstated `isIVD` planned on the nIVD eSTAR (MUT5); the
  pathway booleans unvalidated (MUT6); a 510(k) type named while the recall is open (MUT12); an unstated exemption
  opening a class III pathway (MUT13).

**How it was made.** A read-only planner wrote the patch on scratch copies, ran it through the real executor in a
copied mirror, enumerated the stated inputs above against the engine before this change, and re-read the plan as a
critic. An independent critic then re-ran it in its own mirror, compared 184,320 fully stated inputs with the engine
before this change (the counts above), ran the route, gate and selector checks, and made the corrections recorded
in this file: the SE type while an answer could make it NSE, the class III exemption, the two skill lines and the
SE description's routing words. This session applied the corrected plan to the working tree and
ran the red, green, neighbourhood and gates above. How S5b was planned, and an incident during the planning, are
recorded in `../s5b-biomarkers/README.md`, "Process note".
