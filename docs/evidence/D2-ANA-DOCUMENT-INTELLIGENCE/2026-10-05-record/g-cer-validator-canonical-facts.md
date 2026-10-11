# g-cer-validator-canonical — facts relied on

Step: the CER conformance validator (`GET /api/cer/mdr/:reportId/validate`) checks the
canonical CER / PER structure instead of a private 10-column checklist. A section is
present only when a populated report column covers it or a content-bearing
`cer_sections` row has a **heading** that names it in the framework's heading
vocabulary.

Checked 2026-10-05. Regulator hosts (eur-lex.europa.eu, health.ec.europa.eu,
ec.europa.eu) are blocked for WebFetch here. WebSearch returned search snippets
from regulator-hosted URLs, but the full texts were not read. A snippet is
recorded as **snippet**, never as **regulator text**.

## Repository facts (checked in the code at HEAD)

| Fact | Basis |
|---|---|
| `cer_reports` has no scope, appraisal, evaluator-qualification, PMCF or references column. Those sections exist only as `cer_sections` rows (`sectionId`, `title`, `content`). | `shared/schema.ts` `cerReports` / `cerSections` |
| The old validator read only `cer_reports` columns and returned `valid: true` for the column-complete MDR and IVDR input, and for a framework it does not know (`FDA_510K`). | red run, `g-cer-validator-canonical-red.txt` (22 failed / 5 passed), plus its HEAD probe addendum |
| The old row mapper matched substrings of id + title: "Endoscope Design Overview" was a scope section, "Reprocessing Validation and Qualification" was evaluator qualification, "Reference Interval Study" was a references section, "Appraisal Plan" was the appraisal. | HEAD probe, red addendum |
| The canonical CER structure is `CER_SECTIONS` / `assessCerStructure` in `server/services/market-specs/cer-structure.ts`: 12 sections, with equivalence required only when it is claimed. | code |
| The canonical PER structure is `PER_SECTIONS` / `assessPerStructure` in `server/services/market-specs/per-structure.ts`: 8 sections, all required. Its three pillar sections are scientific validity, analytical performance and clinical performance. | code |
| Nothing in `cer_reports` records whether equivalence is claimed. The validator therefore takes it as an option. When the option is unknown and no equivalence heading is stored, it reports a `recommended` failure that says so. `cer-routes.ts:674` does not pass the option yet (see needs-elsewhere in the step result). | `shared/schema.ts`; decision 1 (fail closed) |

## Heading rule (code, not a regulatory fact, but it decides `valid`)

The rule lives in `server/services/market-specs/stored-cer-assessment.ts`: `normaliseHeading`, `sectionForHeading`, `CER_HEADING_VOCABULARY` and `PER_HEADING_VOCABULARY`.

- **The heading is the row's `title`.** The row id is never read. Body content only has to be populated. A section that appears only inside another row's body is not found, so the check fails closed.
- **Normalisation removes:**
  - HTML tags and `&nbsp;`;
  - markdown `#` and emphasis markers;
  - parentheticals;
  - leading numbering, such as `2.`, `4.5`, `12.`, `Section 8:`, `iv)` and `A9`.

  It then lower-cases the heading and collapses punctuation to spaces.
- **Exact match only.** The normalised heading must *be* a phrase in the vocabulary. Every accepted form is spelled out. No keyword containment and no generic qualifier word are allowed: "Appraisal Plan", "Scope Justification" and "References Report" name nothing.
- **Terms of art of the other framework name nothing.** No vocabulary phrase may contain one, and the test checks this.
  - A heading in a CER that contains an IVDR term names no CER section. The IVDR terms are: performance evaluation, scientific validity, analytical or clinical performance, PMPF, PEP, analyte, and reference interval / range / material / method / measurement / standard.
  - A heading in a PER that contains an MDR / MEDDEV term names no PER section. Those terms are: clinical evaluation, clinical investigation, clinical evidence, clinical data, PMCF, equivalence, equivalent device(s), and CEP.
  - In particular, the bare word "reference" is in neither vocabulary. In an IVD document it is a term of art.
- **IVDR columns.** The `clinicalEvidence` column no longer stands in for the clinical-performance pillar. "Clinical evidence" is an IVDR term spanning all three pillars. Only `riskBenefitAnalysis` and `conclusions` map, both to the integration / benefit-risk section.
- **Unrecognised headings are reported.** Headings that name nothing are listed in the detail of each section that was not found. `assess_stored_cer` also returns them as `unmatchedHeadings`.

## Regulatory facts

| Fact | Basis | Label |
|---|---|---|
| IVDR performance evaluation demonstrates scientific validity, analytical performance and clinical performance. The data, their assessment and the clinical evidence derived from them are documented in the performance evaluation report (Annex XIII Part A §1.3.2), which is part of the Annex II technical documentation. | WebSearch snippet, 2026-10-05, from https://eur-lex.europa.eu/eli/reg/2017/746/oj and https://health.ec.europa.eu/system/files/2022-01/mdcg_2022-2_en.pdf (MDCG 2022-2). Full text not read. | snippet + recall |
| "Clinical evidence" is an IVDR term covering the scientific-validity, analytical-performance and clinical-performance data together. A CER-shaped `clinicalEvidence` column therefore cannot stand for one pillar. | The same snippet ("…their assessment and the clinical evidence derived therefrom"); IVDR Art 2 definitions from recall. | snippet + recall |
| MEDDEV 2.7/1 Rev 4 asks for the qualification of the responsible evaluators to be justified and documented, with a declaration of interest for each evaluator. | WebSearch snippet, 2026-10-05, citing https://webgate.ec.europa.eu/circabc-ewpp/rest/download/7423d348-1e94-4fb8-8a65-02dd2075dec0 (MEDDEV 2.7/1 Rev 4). Full text not read. | snippet + recall |
| The CER heading vocabulary follows the MEDDEV 2.7/1 Rev 4 Appendix A9 proposed table of contents: summary; scope; clinical background, current knowledge, state of the art; device under evaluation, with demonstration of equivalence, clinical data generated and held by the manufacturer, clinical data from literature, summary and appraisal of clinical data, and analysis of the clinical data; conclusions; qualification of the responsible evaluators; references. It also follows MDR Annex XIV Part A, and the canonical `CER_SECTIONS` titles. | recall. Appendix A9 was not read. | recall |
| The PER heading vocabulary follows IVDR Annex XIII Part A: the performance evaluation plan (§1.1), the scientific validity, analytical performance and clinical performance reports (§1.2, §1.3), and post-market performance follow-up (Part B). It also follows the canonical `PER_SECTIONS` titles. | recall. Annex XIII was not read. | recall |
| UK MDR 2002 (SI 2002/618) transposes Directive 93/42/EEC, whose clinical evaluation is Annex X, not EU MDR Annex XIV. Swiss MedDO (SR 812.213) follows EU MDR. | recall. Not checked against legislation.gov.uk or fedlex.admin.ch. | recall |

Every check reference the validator emits carries "(recall — not checked against regulator text)". The validator states no regulatory fact of its own. It projects `cer-structure.ts` and `per-structure.ts`.

## Reads owed

- MEDDEV 2.7/1 Rev 4 Appendix A9, and MDR 2017/745 Annex XIV Part A §4: CER contents, which the CER heading vocabulary is checked against.
- IVDR 2017/746 Annex XIII Part A §1.1–1.3 and Part B: PEP, the three reports, and PMPF.
- UK MDR 2002 (SI 2002/618) Part II and Directive 93/42/EEC Annex X.
- UK MDR 2002 Part IV, which covers IVDs under Directive 98/79/EC. The `regulatoryFramework` enum has only `UK_MDR_2002`, so a UK IVD report is checked as a CER. This is a known limit, not a regression.
