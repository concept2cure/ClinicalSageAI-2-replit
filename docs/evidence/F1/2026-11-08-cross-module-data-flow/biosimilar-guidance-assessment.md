# Biosimilar guidance and caller contract — read-only engineering assessment

Assessment date: **2026-11-08**. Primary FDA and EMA pages were checked during this session. This is evidence for review of existing code, not a new product design, an implementation, an agency decision or a clinical-development recommendation for a particular product. No biosimilar source, tool definition, executor, route, schema or approval gate was changed by this assessment.

## Finding

The existing deterministic biosimilar knowledge engine presents withdrawn or superseded sources as current authority and converts some development considerations into universal requirements. Its interchangeability result also treats two caller-supplied booleans as sufficient to say that requirements appear met. These are defects in regulatory attribution and in the scope of the conclusions returned, even though repeated inputs produce repeated outputs.

**FDA's recommendation for at least 10 reference-product lots is not obsolete.** The September 2025 final guidance retains that recommendation and allows discussion of justified alternatives where supply is limited. The defects are the code's attribution to a withdrawn 2017 draft, the presentation of a recommendation as a universal requirement, and the continued use of the historical tier framework as if it were a current FDA rule. This review does not recommend deleting the number 10 or replacing it with an invented threshold.

## What already exists and who calls it

| Existing path | Observed responsibility |
|---|---|
| `server/services/biosimilar/biosimilar-knowledge.ts` | Pure, deterministic reference data and functions. The module declares no database, network or LLM access. Its inputs do not verify native project, source-document, assay, lot, clinical-result or agency-decision records. |
| `server/services/ana/biosimilarTools.ts` | Six existing tool schemas and descriptions. The shared description tells the caller to reproduce returned data and regulatory citations verbatim. Several descriptions repeat the outdated analytical and switching-study claims. |
| `server/services/ana/AnaToolDefinitions.ts` | Imports and includes `BIOSIMILAR_TOOLS` in the existing tool collection. |
| `server/services/ana/AnaToolExecutor.ts` | Registers the six tool handlers, runs them through the existing `runStatsTool` wrapper and dynamically imports the knowledge module. This file is held by another lane and was only read. |
| `tests/services/biologics/analytical-similarity.test.ts` | Tests the separate `server/services/biologics/analytical-similarity.ts` module. Its similarly named function does not qualify the regulatory assertions in the biosimilar knowledge module. |

The existing handler mapping is:

| Tool | Function in `biosimilar-knowledge.ts` |
|---|---|
| `assess_analytical_similarity_biosimilar` | `assessAnalyticalSimilarity` |
| `design_biosimilar_clinical` | `designBiosimilarClinicalProgram` |
| `assess_indication_extrapolation` | `assessExtrapolationOfIndications` |
| `assess_interchangeability` | `assessInterchangeability` |
| `plan_biosimilar_ip_strategy` | `planBiosimilarIPStrategy` |
| `assess_biosimilar_cmc` | `assessBiosimilarCMC` |

This review closely examined the analytical, clinical and interchangeability contracts and the historical citations reused in the CMC and extrapolation outputs. It did not validate the IP engine, every product-specific CQA assignment, every clinical-design number, historical product precedents or state pharmacy-substitution law. No actual signing or filing authorization issued by these advisory functions was demonstrated.

## Primary-source status as checked

The distinctions below must remain visible. A final FDA guidance still contains nonbinding recommendations; a draft is not a final rule. An adopted EMA reflection paper is not itself a product-specific agency acceptance decision.

| Subject | Current status and bounded finding | Primary source |
|---|---|---|
| FDA statistical approaches, 2017 | **Withdrawn June 21, 2018.** The withdrawal register identifies the September 2017 document. It cannot be cited as current FDA authority for a mandatory three-tier analytical framework. | [FDA withdrawn and expired drug guidances](https://www.fda.gov/drugs/guidances-drugs/withdrawn-and-expired-guidances-drugs) |
| FDA quality considerations, 2015 | **Replaced.** The September 2025 final comparative-analytical guidance replaces the April 2015 quality guidance and finalizes the May 2019 draft. | [FDA final comparative-analytical guidance page](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/development-therapeutic-protein-biosimilars-comparative-analytical-assessment-and-other-quality) |
| FDA comparative analytical assessment, September 2025 | **Final guidance.** Recommends at least 10 reference lots, with justified alternatives discussed with FDA when availability is limited; recommends 6–10 proposed-product lots and addresses representation of manufacturing variability. The assessment plan must justify its data evaluation and lot sufficiency. | [FDA September 2025 final guidance PDF](https://www.fda.gov/media/159261/download) |
| FDA scientific considerations, 2015 | **Withdrawn March 9, 2026.** FDA states that the document no longer represents its current thinking. This is distinct from the continued draft status of newer documents. | [FDA withdrawal register](https://www.fda.gov/drugs/guidances-drugs/withdrawn-and-expired-guidances-drugs); [FDA March 9, 2026 announcement](https://www.fda.gov/news-events/press-announcements/fda-takes-further-steps-streamline-biosimilar-development-and-make-medicines-more-affordable) |
| FDA need for comparative efficacy studies, October 2025 | **Draft; not for implementation.** Describes considerations for assessing the need for CES. It must not be promoted to a final, universal waiver or used to declare every biosimilar's CES mandatory. | [FDA CES draft guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/scientific-considerations-demonstrating-biosimilarity-reference-product-updated-recommendations) |
| FDA interchangeability update, June 2024 | **Draft; not for implementation.** Describes an assessment of whether the application's comparative analytical and clinical evidence supports the switching standard. FDA's accompanying statement reports approvals without additional clinical switching-study data. Therefore the code's universal dedicated-switching-study requirement is not supportable as stated. This does not establish interchangeability for any particular product. | [FDA interchangeability draft](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/considerations-demonstrating-interchangeability-reference-product-update); [FDA explanatory statement](https://www.fda.gov/drugs/drug-alerts-and-statements/fda-updates-guidance-interchangeability) |
| FDA revised development Q&As, Revision 4, March 2026 | **Draft; not for implementation.** Addresses use of non-US comparator data and scenarios avoiding an additional three-way PK study with scientific justification. It is not a universal permission to omit bridging. | [FDA Revision 4 draft](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/new-and-revised-draft-qas-biosimilar-development-and-bpci-act-revision-4); [FDA March 2026 explanation](https://www.fda.gov/news-events/press-announcements/fda-takes-further-steps-streamline-biosimilar-development-and-make-medicines-more-affordable) |
| FDA development Q&As, October 2026 | **Final Level 2 revised guidance.** The page describes withdrawal of Q&A I.20 because the subject is addressed in the postapproval manufacturing-changes Q&A guidance. This final publication must not be mistaken for finalization of the separate Revision 4 draft. | [FDA final development Q&As](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/questions-and-answers-biosimilar-development-and-bpci-act) |
| EMA tailored clinical approach | **Adopted by CHMP March 16, 2026; published March 27, 2026.** Describes circumstances in which analytical similarity, PK and appropriate safety assessment can support a tailored programme without CES. Generally recommends at least 10 reference-product batches and usually six or more biosimilar batches originating from independent drug-substance batches; the assessment plan justifies the number. | [EMA current-version page](https://www.ema.europa.eu/en/scientific-guidelines/reflection-paper-tailored-clinical-approach-biosimilar-development); [EMA adopted reflection paper](https://www.ema.europa.eu/en/documents/other/reflection-paper-tailored-clinical-approach-biosimilar-development_en.pdf-0) |

## Observed code defects and limits of the existing inputs

### Analytical and CMC knowledge

`assessAnalyticalSimilarity` returns `fdaMinimum: 10` and `emaMinimum: 3`. Its rationale attributes FDA expectations to the withdrawn 2017 document and describes the EMA quantity as a universal minimum. It also returns a fixed tier-1 equivalence construction with a 1.5 multiplier and minimum-SD rule as FDA guidance. Updating the bibliography alone would leave those assertions in the returned explanations and in the tool description.

The FDA final guidance uses a risk assessment and a justified quantitative/qualitative evaluation plan. A mathematical method may remain useful as a selected analytical method; deterministic calculation does not make that method the current regulatory requirement for every CQA. This assessment does not prescribe a replacement formula or acceptance threshold.

The EMA adopted tailored paper's reference-lot discussion does not support the current blanket `emaMinimum: 3` statement. Its recommendations are contextual, and should not be converted into a new universal automatic pass/fail rule either.

`assessBiosimilarCMC` also cites the replaced 2015 FDA quality guidance. Its general strategy output is not proof that native manufacturing, validation, stability, batch, deviation or change-control records have been reviewed or accepted.

### Clinical programme and interchangeability

`designBiosimilarClinicalProgram` always returns a comparative efficacy study design. Its switching guidance says a dedicated multiple-alternation study is required. For large molecules it promotes a three-arm US/EU comparator PK design without reflecting the newer draft bridging considerations. These may describe possible study designs; the existing inputs do not establish that they are required for the specific programme.

The function receives `indications` and `mechanismOfAction` but explicitly discards those variables. That is a separate caller-contract limitation: the description must not imply a product-specific decision based on evidence the function does not evaluate.

`assessInterchangeability` sets:

```ts
overallEligible = biosimilarityEstablished && switchingStudyDataAvailable;
```

It also treats `biosimilarityEstablished` as `expectedSameClinicalResult` and a study-availability boolean as `switchingSafetyDemonstrated`. With both booleans true, it reports that requirements appear met. With switching data false, it reports that a dedicated study is required. Neither direction is established by these booleans alone. The function has no verified study result, source version, exact product-specific assessment or agency decision supporting those conclusions.

The repair must not simply invert the switching gate, infer a waiver, or replace one universal requirement with another. It must keep planning information separate from a determination that the relevant evidence standard has been satisfied.

### Caller and downstream use

`biosimilarTools.ts` repeats the old guidance and asks AnA to repeat returned citations verbatim. Engine text and tool text therefore require a coordinated review. A correct citation title with an incorrect publication status remains misleading.

These pure inputs do not read native CMC or biostatistics evidence, prove a project/document relationship, or establish signed review of a source version. A future filing use must continue through the existing exact-source, document review and release controls. This assessment does not fabricate a cross-module evidence link, promote a knowledge response into a governed receipt, or authorize a new evidence schema.

## Required regression cases for a later existing-path repair

These are concrete acceptance checks for correcting the observed behavior, not new agency approval criteria. They were **not implemented or run** in this read-only slice.

| Case | Required observable result |
|---|---|
| 2017 analytical source | Returned recommendations and tool descriptions identify it as historical/withdrawn if retained; it is not the authority for a current mandatory tier framework. |
| 2015 quality source | Current CMC/analytical recommendations use the September 2025 final source with the correct status; retained historical citations are not silently rewritten into a different edition. |
| 2015 scientific source | Current outputs do not cite the withdrawn document as live FDA authority. The withdrawal is not presented as finalization of the newer CES draft. |
| FDA reference lots | At least 10 remains a sourced recommendation. Fewer than 10 does not automatically prove either regulatory failure or an accepted alternative; the output identifies the need for justification and appropriate agency discussion. |
| EMA reference lots | No blanket assertion that three reference lots satisfy the current tailored framework. Current contextual recommendations and justification are represented without inventing a universal new rejection threshold. |
| Selected statistical method | Arithmetic tests may still validate a deliberately selected method, but its calculation result is not labelled agency acceptance or a universal current FDA requirement. |
| No dedicated switching study | Absence of such a study does not by itself yield a universal statement that it must be conducted. The output preserves the current source's draft status and the unresolved product-specific assessment. |
| Both interchangeability booleans true | Two caller booleans do not generate an unsupported conclusion that all requirements are met, that switching safety is demonstrated, or that interchangeability has been established. |
| Comparative efficacy study | A product type alone does not conclusively select mandatory CES or automatic omission. The output discloses that the existing inputs do not decide the product-specific evidence question. |
| US versus EU | FDA draft considerations and the adopted EMA reflection paper remain distinguishable. An unspecified market does not silently become an authoritative determination for both jurisdictions. |
| Comparator bridging | A global programme is not told that three-way PK is universally required, or universally unnecessary. March 2026 Revision 4 remains explicitly draft. |
| Input relevance | If indications or mechanism of action are not evaluated, the result does not claim that its recommendation used them. Any later use of these inputs has behavioral cases showing how they affect a bounded assessment. |
| Tool caller consistency | Tool descriptions and returned citations agree with the corrected engine on edition, status and limits. Verbatim-output instructions do not reintroduce categorical obsolete claims. |
| Evidence and filing authority | Knowledge output does not claim that native source documents, lots, analytical results, clinical reports or agency decisions were verified when none were read. Existing authoring/signature/filing gates remain independent. |
| Historical reproducibility | New knowledge references do not mutate existing saved source receipts, signatures or historical regulatory assessments. A current advisory result and a retained historical result remain distinguishable. |

## Qualification and handoff

This note records code inspection and primary-source comparison. It does not claim execution coverage of the biosimilar knowledge engine or a complete audit of all biosimilar law and guidance. The similarly named analytical-similarity test found in the repository exercises another implementation; it must not be reported as proof of this engine's current regulatory accuracy.

The existing knowledge module and tool-description module are the direct repair homes. Any change touching the held executor or another shared caller requires the ordinary holder coordination. Root owns scope selection, tests, compiler/build, mandatory gates, commits and publication. No source edits are part of this assessment.
