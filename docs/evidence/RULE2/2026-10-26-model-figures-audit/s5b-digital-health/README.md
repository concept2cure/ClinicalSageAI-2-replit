# Rule 2 · S5b digital health: the SaMD and AI/ML worksheets pass, recommend and score nothing from a fact nobody stated

**Rule:** CLAUDE.md Rule 2 and "fail closed, never fabricate".
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1** (a repair of shipped behaviour). The engine
(`server/services/digital-health/`) is in no narrower package. The tool definitions are an S4 path, which F1 covers.
The coordinating session holds S5b under F1 (`.design/claude-convergence/COORDINATION.md`, "Four commits, one per
engine"); this is the digital-health one.
**Audit:** `../design.md`, S5b, the digital-health family.
**Date:** 2026-11-09.

## The defect

S3 (2026-10-26) had made one of the six functions, the cybersecurity worksheet, read an omitted fact as not stated.
The other five read an omitted boolean as an answer, and none of them refused a malformed enum, list or entry. Inputs
below were run on the engine as it was before this change.

- **SaMD classification** (`classify_samd`).
  - `{ healthcareSituation: 'serious', informationSignificance: 'drive' }` returned `isSaMD: true` and no word on the
    platform: `meetsSaMDDefinition` and `generalPurposePlatform` were "Default true".
  - `healthcareSituation: 'Critical'` matched no N12 cell and fell back to Category I, "Lowest impact", in the cell
    "Non-serious × Treat or diagnose".
- **AI/ML device** (`assess_ai_ml_device`).
  - `{ algorithmType: 'locked', autonomyLevel: 'autonomous' }` passed four facts nobody gave: "Transparency
    documentation is provided", training data "asserted representative", external validation "was performed",
    monitoring "is in place". The PCCP was "OPTIONAL. With a locked model and no planned post-market modifications".
  - An omitted generative component, or an omitted SaMD category for an autonomous function, raised nothing.
  - `algorithmType: 'Locked'` read as hybrid ("Hybrid algorithm"), beside "PCCP OPTIONAL. With a locked model".
- **PCCP** (`design_pccp`).
  - A modification of type `'Population-expansion'` was "Eligible for inclusion in the PCCP".
  - `plannedModifications: 'retrain'` crashed (`params.plannedModifications.map is not a function`), which the handler
    returns as an error; `[]` returned "NOTE: No planned modification fits within a PCCP envelope as specified".
  - With the four scope facts omitted, `outOfScopeModifications` was empty: an omitted intended-use change read as
    none.
- **GMLP** (`assess_gmlp`).
  - Nine principles conformant and one left out scored 90, "gap": the one left out counted as non-conformant.
  - `principleInputs: []` scored 0, "gap".
  - `{ principle: '3' }` and `{ principle: 11 }` were dropped, a principle listed twice was overwritten, and
    `conformity: 'Conformant'` counted as not assessed while it was reported as given.
- **SaMD clinical validation** (`design_samd_clinical_validation`).
  - `{ samdCategory: 'III' }` returned "Prospective data collection is planned", no reference-standard requirement
    (CE-06), the non-AI/ML analytical element and no AI/ML generalizability requirement (CE-08), the high rigor for
    establishing the clinical association, and "Human-in-the-loop use: evaluate the Human-AI team performance".
  - `samdCategory: 'V'` returned "SaMD Category V", rigor "standard".
- **Cybersecurity** (`assess_device_cybersecurity`, S3). An omitted `handlesSensitiveData` added no data-protection
  row, the same as a stated false.
- **Device name.** `design_pccp` and `assess_device_cybersecurity` crashed on a `deviceName` that is not text
  (`deviceName: 5`: "params.deviceName.trim is not a function"), which the handler returns as an error.

## What already exists (RULE 3)

This is a completion: nothing was rebuilt.
- **The engine:** `server/services/digital-health/digital-health-knowledge.ts` is the one engine for all six
  functions. S3 (`5aa47407d`, and its review `dd60c6e12`) made the cybersecurity worksheet three-valued:
  `cyberRequirementState`, `notStated`, the undetermined cyber-device and 524B status, and `statedBoolean` refusing a
  non-boolean. An unstated artifact counts as a gap, critical for the three mandatory 524B artifacts until 524B is
  ruled out. `device-cybersecurity-reads-an-omitted-input-as-not-stated.test.ts` pins that, and passes unchanged.
  This change keeps the rule and extends the other five functions.
- **The definitions and handlers:** `server/services/ana/digitalHealthTools.ts`, spread into `ALL_ANA_TOOLS`. The six
  handlers in `AnaToolExecutor.ts` run through `runStatsTool`, which labels a success with `statedInputEnvelope` and
  turns a `ComputationRefusal` into `needs_parameters` with `code` and `field`. `AnaToolExecutor.ts` is not touched.
- **The shared readers, reused:** `statedBoolean`, `booleanInputStates` and `statedOneOf`
  (`immunogenicity/immunogenicity-reference.ts`), and `refuseUnlessStated` with `RequiredInputCheck`
  (`ana-biostats/computation-engine.ts`).
- **The skill:** `server/services/ana/skills/library/device.ts` (software steps 2 and 5–7, cybersecurity step 1 and
  "Before answering"). Each line stays true of the patched tools, so none is changed.
- **Other digital-health code, not touched:** the record-backed PCCP service (`server/services/ai-ml-pccp/`, behind
  `server/routes/pccp.ts`), `server/routes/cybersecurity-524b.ts`, `server/routes/mdx-software.ts` and
  `server/routes/device-classification.ts`. None imports the engine. Two of them reach services that overlap it:
  - `server/services/regulatory/samd-classification.ts` (`categorizeSamd`) keeps a second IMDRF N12 matrix, used by
    `routes/device-classification.ts`, `routes/ivd-lifecycle.ts` and `market-specs/software-lifecycle.ts`. Its nine
    cells agree with the engine's (checked cell by cell). Converging the two is a separate change (residual below).
  - `server/services/regulatory/cybersecurity-524b.ts` checks SBOM completeness against the NTIA elements and 524B
    artifact presence from recorded documentation, behind `routes/cybersecurity-524b.ts`; it is a records check,
    not this worksheet's stated-fact assessment.
- **Readers of the changed result fields:** none outside the engine. The manifest's renderers are generic.
- **Searches run:** `git grep` for:
  - the six tool and function names, `DIGITAL_HEALTH_TOOLS`, `digitalHealthTools` and `digital-health-knowledge`;
  - `not_stated` in the engine (only the S3 cybersecurity code before this change);
  - "samd", "pccp", "predetermined change", "gmlp", "good machine learning", "sbom", "524b" and "imdrf" across
    server and shared;
  - the result fields `isSaMD`, `pccpRecommended`, `overallConformityScore` and `outOfScopeModifications`.
- **History:** `git log` on the engine and the tools file shows `182fed957`, `5aa47407d` and `dd60c6e12`.
  `git log --all --diff-filter=D --name-only`, filtered for `digital-health|samd|pccp|gmlp|cyber|sbom|ai-ml|aiml`,
  finds only unrelated `.claude/skills/gstack/` files. The clone is shallow, so this covers local history only.

## The change

- **Booleans.** Each of the 25 optional booleans the six functions read reports `true`, `false` or `not_stated`
  through `inputStates`, and is never passed, recommended or scored as either, except that the cybersecurity
  worksheet keeps S3's rule for an unstated artifact (below). A malformed value (`'true'`, `0`) is refused by field.
- **Required inputs** are refused by name when missing or malformed: the situation and significance, the algorithm
  type and autonomy, `plannedModifications` (a list of at least one), `principleInputs` (a list) and the SaMD
  category.
- **Enums and entries** are refused by field when malformed: an optional SaMD category or autonomy outside its
  vocabulary; a modification whose label, description or type is missing or outside the vocabulary
  (`plannedModifications[0].type`); a principle that is not a whole number from 1 to 10 or is listed twice, or a
  conformity outside the vocabulary (`principleInputs[1].principle`); a `deviceName` that is not text.
- **SaMD classification.** An omitted SaMD-definition fact leaves `isSaMD` null; each omitted gating fact adds a
  consideration that names it. The category is unchanged: it depends only on the two required enums.
- **AI/ML device.** An omitted transparency, representativeness, external-validation or monitoring fact gives an
  "attention" finding that says it was not stated, never a pass. A locked model's `pccpRecommended` is null while
  `plannedPostMarketModifications` is unstated; adaptive and hybrid models, and stated plans, settle it as before. An
  omitted generative component, and for an autonomous function an omitted SaMD category, add a risk flag that names
  them.
- **PCCP.** An omitted scope fact is named in one "Scope facts not stated" entry of `outOfScopeModifications`, with
  what it would mean if true. A clause that read an omitted `expandsPopulation` as true for a population-expansion
  modification decided nothing (that type breaks the envelope anyway) and is removed. The comments on the envelope
  and on `pccpAppropriate` said they read the intended use and population; they now say both read the type only.
- **GMLP.** While a principle is not assessed (left out or stated "not-assessed"), the score is null and the verdict
  `not_assessed`, unless a principle is non-conformant, which makes it "critical-gap" whatever the rest are.
- **SaMD clinical validation.** An omitted fact is named where the plan used it: the association pillar (whose rigor
  is `not_assessed`), the AI/ML analytical element and narrative, a CE-06 that asks to confirm a reference standard,
  a CE-08 that asks to confirm whether it is an AI/ML function, the study-design guidance and the clinical pillar's
  autonomy element.
- **Cybersecurity.** `inputStates` reports all nine booleans. An omitted `handlesSensitiveData` adds the CY-DATA row
  as `not_stated`, at attention, which is not a gap. The S3 rule is otherwise unchanged.
- **Size.** The engine would have passed the 100,000-byte ceiling. The citation registry, the IMDRF N12 matrix and
  category descriptions, and the ten GMLP principles move, unchanged, to the sibling
  `server/services/digital-health/digital-health-reference.ts` (Rule 6 split). The engine is 99,633 bytes; the sibling
  13,068. The moved values were compared with the engine's before the move and are deep-equal.
- **The definitions** say what an omission leaves, fit within the gateway's 1,024 characters (916 to 1,012), and
  keep their manifest renderers. Each lost its "Use when" sentence; `design_pccp` keeps the words that sentence was
  found by ("pre-authorize iterative AI/ML model updates without a new submission for each change"), without which
  that request no longer selected the tool. The tools' header names the cybersecurity exception. Inputs the engine
  never reads say so: `intendedUse` and `targetPopulation`
  (classification), `intendedModifications`, the PCCP's `algorithmType`, the GMLP's `samdCategory` and the clinical
  plan's `intendedUse`. The AI/ML transparency input no longer says "Default treated as unknown unless set", which
  was not what the code did.
- **The design** records this family's "What already exists" and its result, and its status rows move on.

**Stated inputs whose result changes.** Fully stated, well-formed inputs were compared with the engine before this
change, ignoring the new `inputStates`: 72 classification inputs, 2,304 AI/ML inputs, 3,456 PCCP inputs (each
modification type alone, all seven together and a pair, every SaMD category, two algorithm types, every scope fact
and a device name of 'D', '' or '  '), all 59,049 GMLP inputs with every principle conformant, partial or
non-conformant (and one listed in reverse order), 192 clinical-plan inputs and 1,024 cybersecurity inputs (all 512
answers, with and without a device name). **None changes.** An input that states a GMLP principle "not-assessed"
changes as one that
leaves it out does (below), and `plannedModifications: []` is now refused instead of returning the "No planned
modification fits" note.

**Results that change because an input was omitted or malformed** (the old result was a default or a misreading), for
example:
- GMLP with one to ten principles left out: all 220 count compositions change. 55 with no non-conformant principle
  move from "gap" (score 0 to 90) to `not_assessed` with a null score; the 165 with one keep "critical-gap" with a
  null score.
- `assessAIMLDevice({ algorithmType: 'locked', autonomyLevel: 'autonomous' })`: four passes and "PCCP OPTIONAL"
  become four not-stated findings, `pccpRecommended: null`, and risk flags naming the generative component and the
  SaMD category.
- `designSaMDClinicalValidation({ samdCategory: 'III' })`: "Prospective data collection is planned" and
  human-in-the-loop become not-stated guidance, the association rigor `not_assessed`, a CE-06 to confirm the
  reference standard and a CE-08 to confirm whether it is AI/ML.
- `classifySaMD` with the gating facts omitted: `isSaMD` true becomes null, with two considerations.
- `healthcareSituation: 'Critical'`, `algorithmType: 'Locked'`, a `'Population-expansion'` type, a principle of `'3'`
  or 11, a repeated principle and `samdCategory: 'V'` are refused by field, and `plannedModifications: 'retrain'` or
  `[]` by name, and `deviceName: 5` by field, instead of being read as another value, crashing or returning an empty
  plan.
- An omitted `handlesSensitiveData` adds the CY-DATA row as not stated.

**Residuals, recorded rather than changed:**
- **The S3 cybersecurity rule is kept.** An unstated artifact is reported `not_stated` but takes the severity a
  stated false would (a gap; critical for SBOM, vulnerability handling and the update plan until 524B is ruled out),
  so `assessDeviceCybersecurity({})` is still "critical-gap" with three critical gaps. S5's rule would leave such a
  verdict `not_assessed`: of the 19,171 inputs with at least one of the nine facts omitted, 6,942 get a verdict
  (5,103 "critical-gap", 1,839 "gap") that some answer to the omitted facts would change. This is a remaining
  default, kept by decision: S3's review (`dd60c6e12`, row [2]) decided that "missing and unstated SBOM/CVD/patch-plan
  rows are critical unless 524B is explicitly ruled out", and kept the `notStated` contract that each unstated
  criterion or artifact "counts as a gap, so the verdict is never pass while one is listed". That decides how an
  unstated input is graded, so changing it is the founder's call, not this slice's. The biomarker slice moved the
  same review's row [1] (validity requires a stated cutoff) from false to null; that row decided only that an
  unstated cutoff does not establish validity, which null keeps.
- **Informational mappings kept.** `classify_samd`'s implied US class and likely pathway follow the category, as the
  device skill says they are informational.
- **A plan judged by type alone.** `pccpAppropriate` reads only the modification types; a stated
  `changesIntendedUse: true` does not make it false, before or after this change.
- **Guidance not added.** With the autonomy unstated, `performanceMetricsGuidance` adds no autonomy line; the
  clinical pillar names both cases.
- **Actions dropped, not made conditional.** An unstated transparency, representativeness, external-validation or
  monitoring fact adds no recommended action (its finding says it was not stated), and a locked model with planned
  modifications unstated gets no "Author a PCCP" action (`pccpRecommended` is null). The GMP slice recorded the same
  for its sterile recommendations.
- **Two IMDRF N12 matrices.** `regulatory/samd-classification.ts` keeps its own copy of the matrix the engine's
  sibling holds. They agree today; zero duplication asks for one, which is a separate change.
- **Small adapters.** Each of the two S5b engines keeps a two-line adapter from a vocabulary to `RequiredInputCheck`
  (`oneOfInput`); RWE writes the same check inline. A shared one would belong beside `refuseUnlessStated`, outside
  these files.
- **Size.** The engine is 99,633 bytes, 367 under the ceiling, and over the 1,500-line threshold. A follow-up that
  needs room should first move the cybersecurity guidance lists or the PCCP modification protocol into
  `digital-health-reference.ts`.

**User-visible:** AnA's SaMD and AI/ML answers no longer pass transparency, representativeness, validation or
monitoring, call a PCCP optional, score a GMLP principle nobody assessed, plan prospective data or a human-in-the-loop
study, or call software SaMD, from facts it was not given. Each names what was not stated and asks for it. A
malformed value is asked for again, not read as another or crashed on.

## Proof

Run in this session on the working tree.
- `red/before.txt`: `digital-health-unstated-inputs.test.ts` fails 66 of 77 cases on `4766b5061` (the biomarker
  commit, whose digital-health files are trunk's), all on assertions. The 11 controls pass: the six stated-basis pins,
  the four "keeps the stated answers" / "keeps a population expansion outside the envelope" cases, and "keeps the
  routing words design_pccp is found by".
- `green/after.txt`: 89 of 89 pass: the 77, with the S3 cybersecurity suite (12).
- **The neighbourhood: 53 files, 2,991 tests, 2,990 pass.** It covers:
  - every S5 unstated-input suite, this one and the biomarker one included, and the S6 record-document and
    nonclinical-draft suites;
  - the S3 cybersecurity, clinical-validation and device suites;
  - `ivd-lifecycle-tools`, `ivd-tools-report-an-engine-fault-as-an-error`, `submission-center-tools` and
    `deepening-tools` (the design's S5b pins);
  - `cdx-pairing`, `cdx-study-design`, `samd-classification` and both `cybersecurity-524b` suites;
  - the five skills suites, the six tool-selection suites, the tool registry, the three tool-authorization suites,
    both launch-scope suites and `flow-registry-consistency`.

  The one failure is `deepening-tools.test.ts`, "the OPEN program outranks a project id the model supplied". It
  fails identically on trunk without this change, and is not this slice's.
- **Gates:**
  - typecheck (`typecheck-no-regression --incremental`): 0 errors;
  - ESLint: unchanged (the engine 10 warnings before and after; the tools file, the sibling and the test 0);
  - `manifest:ana`: regenerated in the same commit, and only the six digital-health tools' descriptions change. No
    renderer, scope, governed flag or required input changes. The six descriptions are 916 to 1,012 characters.

**How it was made.** A read-only planner wrote the patch. An adversarial critic then applied it to a scratch copy of
`9a1ac9bca`, ran it through the real executor, and probed it: 52,521 inputs with a fact omitted, each against every
completion of the omitted facts, the 220 GMLP count compositions, and the 66,098 stated inputs above against the
engine before the change. The critic found and fixed:
- an omitted `isAIML` that left CE-08 out of the evidence plan, exactly as a stated false (the red test pinned it);
- a `deviceName` that is not text, which crashed two functions;
- the `design_pccp` description, which no longer selected the tool for "We want to pre-authorize iterative AI/ML
  model updates" (rank 53 of the scored tools, outside the selection; rank 1 again);
- three sentences false of the code: the tools' header, and the envelope and `pccpAppropriate` comments;
- this README's account of the kept S3 rule, which now names the decision row and the inputs it leaves graded.

On the critic's mirror: red, 66 of 77 cases fail on trunk (all assertions; 11 controls pass); green, 77 of 77 and the
S3 cybersecurity suite (12); neighbourhood, 52 files, 2,900 tests, 2,899 pass, and with the biomarker slice 53 files,
2,991 tests, 2,990 pass (the one failure, `deepening-tools.test.ts`, fails identically on trunk); typecheck 0 errors
in the changed files; ESLint unchanged (10 on the engine, 0 elsewhere). This session reproduced the red, the green and
the 53-file neighbourhood on the working tree (above). How S5b was planned, and an incident during the planning, are
recorded in `../s5b-biomarkers/README.md`, "Process note".
