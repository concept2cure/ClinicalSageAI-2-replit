# Rule 2 S4 — nonclinical and labeling record boundaries

D2, following the existing Rule 2 audit design. S1–S3 are already published. This slice fixes the
independent S4 defects in place. **R-2/F2 is still unresolved:** the founder has not chosen whether
stated-input calculators remain available or are withheld until records exist. That choice was
asked asynchronously during this session. Existing calculator availability is preserved; the
universal stated-input labeling required under either option is applied to the S4 calculators.
This evidence does not treat silence or “Continue” as acceptance of the recommendation.

Decision source: `../../../D2-FILING-TYPE-TEMPLATES/2026-10-18/FOUNDER-DECISIONS-OWED-2026-10-26.md`,
R-2: “Nothing here is done before a decision.” Readiness/labeling corrections and removing the
second dose implementation do not depend on deciding the availability policy. S4 remains partial
in the design register for that policy choice; S5–S14 remain queued.

## What already exists

- `ana/record-source-project.ts` resolves the open/named project through `resolveCsrScope`, with
  the actor and organization, and handles cross-project/scope refusals. Reused for safety readiness;
  its optional assessment label preserves the existing Module 2 callers' behavior.
- `preclinical/nonclinical-program-requirements.ts` provides both a required battery and a gap
  comparison. Readiness now uses only `requiredNonclinicalBattery` when clinical duration is stated.
- `preclinical/nonclinical-safety-assessment.ts` remains the pure integrated engine; the AnA
  entrypoint now withholds readiness until a recorded study source is reached. Missing drug name
  uses the already shared `DRUG_SUBSTANCE_NAME_NOT_RECORDED` marker.
- `preclinical/fih-dose-engine.ts` is the canonical HED/MRSD engine. `toxicology-knowledge.ts`
  had a second numeric Km table and a misleading species-factor table; its existing safety-margin
  capability now adapts the canonical engine rather than being replaced by another capability.
- `labeling/labeling-intelligence-knowledge.ts` owns PLLR and the PLR section catalog. Its existing
  PLLR function now uses section 8's existing titles and returns structure/reference guidance only.
- Existing executor/definitions and nonclinical/labeling skill instructions are corrected in place.
  No new route, UI, database table, migration, dependency or external API call was added.
- Searches covered handlers, definitions, schema/route/service consumers, tests and skill instructions.
  Available local deletion history for the affected safety/PLLR names found no earlier generation.

## Resulting behavior

- `assess_nonclinical_safety` takes the project and clinical context, with no study/FIH figure fields.
  It resolves access first, then returns `readiness: not_assessed`, `programAssessed: false` and
  `programGaps: null`. It returns a requirement list only for a positive finite clinical duration,
  never a program dose. Raw legacy figures are ignored and flagged. Missing project and scope
  errors remain distinct from empty records; opening a project does not promise a nonexistent reader.
- `assess_nonclinical_program` with a listed battery returns `adequate: null`, `basis: stated` and
  comparisons “against the studies you listed.” With no list, S3's requirement-only behavior remains.
- Successful FIH, safety-margin, tox-classification and carcinogenicity worksheet answers identify
  their stated basis. Faults/refusals keep their original envelope. Instructions forbid treating a
  worksheet as a recorded program conclusion or governed content; the loader no longer directs an
  automatic raw-extraction → program-dose chain. This is S4-only labeling, not a claim S5 is done.
- `calculate_safety_margin` rejects unknown species instead of computing zero doses, uses canonical
  HED/MRSD/body-weight/factor/rounding and keeps its AUC/Cmax fields, calculations and warnings.
  `safetyMargin` now reports the actual applied dose factor rather than an unrelated species scaling
  constant. Canonical minipig Km is 35 (the old duplicate used 27); micro-pig remains 27. Legacy spellings
  are adapted by name, with every numeric Km obtained from the canonical engine.
- PLLR returns the existing 8.1–8.3 headings and subsections, `requiredStatements: null` per section,
  a not-assessed reason and an explicit instruction against selecting generic risk templates from
  typed facts. Negated findings cannot become a product fetal-risk statement. The tool schema no
  longer requests product evidence. OTC behavior and static reference/citation material remain.

## Verification

Behavioral red evidence was collected before each correction:

- `red/readiness-and-worksheets.txt`: 10 failures on the then-current S3 handlers/schema.
- `red/safety-margin.txt`: 7 failures before converging the pure engine.
- `red/pllr.txt`: 4 failures before removing product inference.
- `red/pllr-template-instruction.txt`: the explicit instruction pin fails before its addition.
- `red/stated-dose-labels.txt`: 2 failures with only the published executor restored temporarily.
  The fixed executor was restored in a finally block. This is an isolated mutation check, not a
  claim that all files were reset to the same historical tree.

Final neighborhood/skill verification: **23 files, 662 tests passed**, in
`green/related-suites.txt`. Whole-program TypeScript passed with **0 errors**; the changed-file
ESLint warning ratchet passed with **3 fewer warnings**. Manifest regeneration and validation
traceability passed. Gate output is in `green/gates.txt`. The full run first caught an over-budget carcinogenicity description; it was
shortened and verified again. Independent reviews found no concrete scope/fault/record-boundary
regression. No real-database claim is made for S4: the project-source compatibility check uses the
existing PGlite suite, while the new readiness seam tests script its project lookup.

Limits: the study store and counted statuses remain R-1/S14 work. Optional-boolean/default audits
outside these S4 boundaries remain queued S5 work. The standalone pure safety engine is not a new
record reader, and the existing arithmetic defaults are visible worksheet defaults. No regulated
starting dose or label is approved by these outputs.
