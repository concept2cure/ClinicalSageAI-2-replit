# Rule 2 · S3: invented defaults (fail closed; no records needed)

**Rule:** CLAUDE.md Rule 2, and the working agreement's "fail closed, never fabricate". The design's rules for every
slice say: "Absence of a record is not absence of the thing … no gap list, `adequate: false`, 'not conducted' or 0 is
derived from an empty input", and "unavailable is not empty".
**Audit:** `../design.md`, slice S3.
**Date:** 2026-10-26.

**Review follow-up:** the resumed S3 review corrects the remaining affected-side, cutoff, 524B,
IVD missing-input and MDR defects. See [`review/README.md`](review/README.md) for the fixes and
fresh evidence. The red/green counts below describe the original S3 run.

Seven deterministic engines or handlers produced a regulated answer from inputs nobody stated: a benefit-risk
conclusion, a robustness verdict, a cybersecurity "pass", a 0% sensitivity, an under-reported MDR, a failed tool
presented as "more details needed", and a nonclinical program declared inadequate. Each one is fixed in place. Nothing
is rebuilt (Rule 3): every item extends the engine that already exists, and item 4 converges a second 2×2 onto the one
2×2 engine.

**How this slice was made.**
- A read-only workflow wrote one patch plan per item. Each plan carried "What already exists", the consumers, an exact
  red test and exact edits.
- A second agent then critiqued each plan against the code. Every critic found something: untrue comments, a lenient
  default replacing a strict one, a missed DB-test consumer, and a null prevalence read as 0. Their corrected edits and
  red tests are what was applied.
- The items were applied one at a time, each red first.

## The items

| # | Engine / handler | On trunk | Now | Red (trunk) |
|---|---|---|---|---|
| 1 | `planBRCommunication` (`benefit-risk/benefit-risk-knowledge.ts`), `plan_br_communication` | `({})` planned `favourable_with_conditions`, with "provides the demonstrated benefit in the indicated population, with manageable, characterized risks" for every audience | An unstated or unknown verdict is refused through `refuseUnlessStated` (the one helper), so AnA answers `needs_parameters` because the conclusion is the sponsor's. An absent message reads "[key … messages not stated]" and is listed in `notStated`. The tool's verdict property no longer advertises a default | 6/6 defect cases fail |
| 2 | `assessBRUncertainty`, `assess_br_uncertainty` | No margin: assumed 0.15, giving "sensitive given a net margin of approximately 0.15". An unstated level was graded `moderate`. No sources: `moderate` overall, "the conclusion appears insensitive" and "no high-grade residual uncertainty" | No margin, or no sources, gives robustness `not_assessed`, with the reason. An unstated level is `not_stated` (a stated `fragile` still stands). No sources: the grade is `not_assessed`, and nothing is claimed about sensitivity or labeling | 8/8 defect cases fail |
| 3 | `assessDeviceCybersecurity` (`digital-health/digital-health-knowledge.ts`), `assess_device_cybersecurity` | `({})` returned `pass`, "Threat model provided." and "Section 524B applies" | `true` means present, `false` means missing, and omitted means `not_stated`, counted as a gap. It never passes while anything is unstated. After review, applicability requires both device criteria and `submissionUnder524B` explicitly true; a stated false rules it out. Missing or unstated SBOM, CVD and patch-plan artifacts remain critical unless 524B is explicitly ruled out. A non-boolean yes/no answer is refused through the shared `statedBoolean` | 9/9 fail in the original S3 run; follow-up proof is in `review/` |
| 4 | `assessBiomarkerClinicalValidation` (`biomarkers/biomarker-knowledge.ts`) | No diseased subjects gave sensitivity 0; an empty table gave every metric as 0; a null prevalence was read as 0 | **Converged** onto `computeDiagnosticAccuracy` (`stats/clinical-performance.ts`), the one 2×2 engine. An empty stratum is refused (`needs_parameters`), and an all-zero table comes back as an error, never as zero metrics. Exact Clopper–Pearson intervals are added. A null prevalence is not stated, and PPV/NPV are `null` where undefined | 12/12 fail |
| 5 | MDR reportability: `classify` (`capa-mdr/triageEngine.ts`), intake `requireComplaintAssessments` (`capaMdr.service.ts`), `POST /api/capa-mdr/complaints`, `assess_mdr_reportability` / `create_complaint` | `{patientHarm:'serious_injury'}` gave FDA 30-day, not EU-reportable, no 806 notice. Every unstated fact was read as `false`, and intake stored that classification | An unstated fact is unknown: what it decides is `null`, `missingFacts` names it, and `determinationComplete` is false. A country stated as `unknown` leaves EU vigilance undetermined. Intake refuses a complaint missing any of the four facts (422, naming the field). The AnA handlers ask for each omitted fact. `preliminary_classification` records the facts as stated (json, no new column) | 12/12 fail |
| 5a | (the critic's residual) a malfunction in the EU | `mdrEuReportable: false`; with this item's first patch it also showed `determinationComplete: true` | This engine does not model whether a malfunction is an EU MDR serious incident (Article 2(65), 87). So in the EU, `mdrEuReportable` is `null` with the reason "not assessed here", and the determination is not complete. An unstated country is listed as missing | 1/1 fails |
| 6 | `ivdError` (`AnaToolExecutor.ts`) | Every IVD engine failure, a TypeError included, became `needs_parameters` ("more details needed") | Missing schema-required inputs ask the user for the named fields. With those present, TypeErrors remain errors; other parameter messages recognized by `isStatsParamError` ask for inputs. Anything else is `{error: '<tool> failed: …'}` | Original S3: 1/1 defect case fails; follow-up proof in `review/` |
| 7 | `assess_nonclinical_program` with no `present` | Compared the ICH M3(R2) battery against `[]`: `adequate: false`, with Ames, repeat-dose and safety pharmacology "not present" | `status: 'requirements'`, the `required` battery from `requiredNonclinicalBattery`, `adequate: null`, `gaps: null`, and "No studies were read; this is the requirement list, not a gap analysis." | 2/2 defect cases fail |

Each item's red output is in `red/<item>.txt`, and the green run is in `green/after.txt`.

## What already exists (Rule 3)

Each plan's searches are kept in the workflow journal. In summary:

- **The refusal helpers already in use:**
  - `refuseUnlessStated` / `ComputationRefusal` (`ana-biostats/computation-engine.ts`) are the one "refuse unless stated" helper. `biostatsRefusal` in `runStatsTool` turns their refusal into `needs_parameters`. Items 1 and 3 use them.
  - `statedBoolean` (`immunogenicity/immunogenicity-reference.ts`) is the exported tri-state reader, used by item 3. A private copy exists in `mutagenic-impurity-knowledge.ts`, and a non-refusing one in the executor; both are named here and left for the inventory.
  - `isStatsParamError` and the `runStatsTool` convention: item 6.
  - `computeDiagnosticAccuracy`, the canonical 2×2 with Clopper–Pearson intervals: item 4 converges onto it.
  - `requiredNonclinicalBattery`, the requirement list, already exported: item 7.
  - `requireComplaintAssessments` / `ComplaintAssessmentRequired`, the existing intake gate: extended in item 5, not duplicated.
- **No second implementation** of any of the seven was found.
- `git log --all --diff-filter=D` on `*benefit-risk*`, `*benefitRisk*`, `*uncertainty*`, `*cyber*`, `*524b*`,
  `*digital-health*`, `*triage*`, `*reportab*`, `*mdr*`, `*nonclinical-program*` and `*nonclinical-gap*` finds no
  earlier generation.

## Consumers and contracts

- **The intake contract changes (item 5).** `POST /api/capa-mdr/complaints` and AnA's `create_complaint` now require
  `isMalfunction`, `anticipatesCorrection` and `trendThresholdCrossed` as booleans, and `eventLocationCountry` as an
  ISO 3166-1 alpha-2 code or the literal `"unknown"`; otherwise they answer 422 naming the field.
  - No client form posts a complaint today: the client only reads `/api/capa-mdr/complaints` and `/triage`.
  - The UI session is told the field contract for any future intake form.
  - The DB suite's fixture (`tests/db/capa-governed-transactions.dbtest.ts`) now states the four facts. That suite needs
    Postgres and was not run in this session.
- **Classification consumers:** `capaMdr.service.ts` stores the whole `PreliminaryClassification`, and AnA's
  `create_complaint` handler forwards it. No production branch outside `triageEngine.ts` interprets its individual
  reportability fields. The nullable fields and added `facts`, `missingFacts` and `determinationComplete` are covered
  by the engine and intake tests; this is not a claim that the object has no consumers.
- **The tool definitions** for items 1, 2, 3 and 5 describe the changed input contracts. This is not a claim that
  every optional field in those tools has no default: item 2 still offers category-specific descriptions when no
  free-text description is supplied. The follow-up review removes the remaining factual defaults for the uncertainty's
  affected side and the 524B submission date. `docs/ana-capability-manifest.json` is regenerated from these definitions.

## Proof

- Red: each item's new test, run on trunk `3e06155de`, gives the counts in the table (`red/*.txt`).
- Green on each item's neighbourhood:
  - items 1–2: benefit-risk, 4 files;
  - item 3: 4 files, 43 tests;
  - item 4: 4 files, 82 tests;
  - item 5: 13 files, 107 tests;
  - item 6: 5 files, 846 tests;
  - item 7: 4 files, 61 tests.
- The broad sweep is in `green/after.txt`. It covers every AnA suite, the skills suites, the benefit-risk, biomarker,
  capa-mdr, digital-health, stats, preclinical, regulatory and market-specs suites, the capa-mdr and cybersecurity route
  tests, and `tests/biostat`.
- Gates:
  - `ci:typecheck-no-regression`: 0;
  - ESLint ratchet: net −1, in `biomarker-knowledge.ts`;
  - `manifest:ana`: regenerated.

**User-visible.** None of these answers is produced from nothing stated any more:
- a favourable benefit-risk conclusion;
- a robustness verdict on an assumed margin;
- a cybersecurity "pass";
- a 0% sensitivity;
- an under-reported MDR;
- "more details needed" for a broken tool;
- "your program lacks every study".

AnA asks for what is missing, or says what was not assessed.
