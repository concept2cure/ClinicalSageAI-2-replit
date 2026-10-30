# Developing and qualifying AnA's CSR capability

> Archived implementation-review evidence for [commit e6efa61109ed](https://github.com/concept2cure/ClinicalSageAI-2-replit/commit/e6efa61109eddbe0d9e508642a28e710a48f3b1f). This document describes the separately prepared application implementation, which has an incomplete whole-repository TypeScript verdict. Its application paths refer to that review commit, not to deployed functionality or this documentary publication. This package does not deploy or import the implementation.

Date: 2026-10-27. Scope: improve CSR assistance through the existing Concept2Cure CRE evidence, Vault and governed CSR/Authoring workflows.
The goal is demonstrably accurate, traceable, expert-reviewed drafting. A large PDF collection or a fluent draft does not establish CSR expertise or guarantee a perfect report.

## 1. What exists and what still needs qualification

| Capability | Current code | Recommended next step |
| --- | --- | --- |
| Public reference discovery | Existing CRE source search and repaired FDA/EMA metadata connectors distinguish listed documents from retained originals. | Expand acquired, correctly classified examples according to usefulness and permitted use. |
| Reference reading | `public-reference-sources.ts` checks original/text/page identities and retrieval permission; `search_clinical_regulatory_evidence` exposes bounded page reads. | Have a reviewer qualify extraction and section mappings before relying on examples for drafting. |
| Evidence separation | Public references are marked external, `clientStudyEvidence:false`, `trainingApproved:false`; tenant/project sources use their existing access controls. | Preserve these distinctions in every prompt, generated claim and review record. |
| Client CSR preparation | Existing source readiness, explicit per-run source selection, CSR jobs, saved tables and governed Authoring provide the workflow. | Qualify the exact client-input mapping and each eligible drafting task; public references cannot enable missing client inputs. |
| Writing expertise | Retrieval and software checks are engineering capabilities. | Establish an independent medical-writing evaluation and expert sign-off; these are not delivered by the reference seed alone. |

Code owners: `server/services/clinical-regulatory-evidence/public-reference-sources.ts`, `server/services/ana/AnaToolExecutor.ts`, `server/services/csr/program-source-readiness.ts`, `server/services/csr/load-csr-inputs-for-project.ts`, and `server/services/csr/csr-job-runner.ts`.
These statements describe the code; deployment, migration completion and production source availability require their own receipts.
The currently reported **97 focused software tests do not prove CSR-writing expertise**, statistical validity or regulatory acceptance.

## 2. Admit usable evidence before teaching from it

1. Retain the original, source URL, retrieval date, study/protocol identifiers, version, document class, checksum and any archive-member identity.
2. Distinguish full/redacted CSR, synopsis, protocol, SAP, registry record, publication and regulator assessment. Record missing appendices, redactions and scanned pages.
3. Record the permitted uses separately: access, storage, commercial retrieval, derivative examples, redistribution and model training. Public access alone does not grant all of them.
4. Preserve rights/account restrictions. Keep unresolved uses restricted or awaiting review; use the existing admission gate rather than an alternate store or bypass.
5. Inspect extracted text and tables against page images, including headings, footnotes, symbols, decimal points and denominators. High character count can still mean corrupted text.
6. Keep originals and page-linked derivatives together; record extraction/OCR method and review state. Integrity checks establish identity, not clinical accuracy.
7. Group protocol versions, SAP versions, amendments, synopses, main reports, appendices and follow-up reports into one study family.

Prioritize CDI recurrence-prevention studies that match treatment timing, comparator, patient history, diagnostic criteria, analysis population and follow-up window.
Use other therapeutic areas for report organization or difficult reporting patterns, with their scientific differences explicit. FDA/EMA assessments teach regulator reasoning; sponsor CSRs teach sponsor report presentation.

## 3. Ground the reporting rules in primary guidance

- [ICH E3: Structure and Content of Clinical Study Reports](https://database.ich.org/sites/default/files/E3_Guideline.pdf), Step 4, 30 November 1995: the report's structure and presentation of design, conduct, efficacy and safety.
- [ICH E3 Questions and Answers (R1)](https://database.ich.org/sites/default/files/E3_Q%26As_R1_Q%26As.pdf), 6 July 2012: adapt the presentation to the study; E3 is guidance rather than a rigid template.
- [ICH E9: Statistical Principles for Clinical Trials](https://database.ich.org/sites/default/files/E9_Guideline.pdf), Step 4, 5 February 1998: prespecified analysis, bias, analysis sets, statistical interpretation and reporting.
- [ICH E9(R1): Estimands and Sensitivity Analysis](https://database.ich.org/sites/default/files/E9-R1_Step4_Guideline_2019_1203.pdf), adopted 20 November 2019: align the treatment question, estimand, intercurrent-event handling, estimator and sensitivity analyses.

These official documents were opened and their title/version pages checked on 2026-10-27. Apply relevant agency adoption, clarifications and the client's approved reporting plan; a borrowed CSR is not the reporting authority.
Map each eligible drafting task to its applicable E3 section, required client inputs, supporting guidance and permitted external examples. Preserve existing manual/source-preparation restrictions for signatures, original appendices and other ineligible content.

## 4. Resolve LMN-201 study identity before drafting results

The target is RePreve / CDI02, [NCT05330182](https://clinicaltrials.gov/study/NCT05330182). Retain the exact [registry snapshot](https://clinicaltrials.gov/api/v2/studies/NCT05330182) used for comparison.
The 2026-10-27 snapshot lists estimated enrollment 375, phase 2/3 and global cure through up to 16 weeks; its last posted update is 2026-10-05.
The [sponsor's 21 October 2026 release](https://www.prnewswire.com/news-releases/lumen-bio-reports-positive-phase-2-results-from-the-repreve-clinical-trial-lmn-201-for-c-difficile-infection-302915046.html) reports 45 participants: Part A 22 and Part B 23, with a prespecified Bayesian analysis.
This is a material scope/version discrepancy to reconcile with the client. Do not assume the public report covers the registry's entire planned trial, pool the cohorts, or infer the final analysis set from publicity.

Obtain and version the following in the client's existing project:

- Final protocol and amendments, cohort/stage definitions, trial registration history, consent/ethics records and study-conduct records.
- Final approved SAP and amendments, timing relative to unblinding, estimands, analysis populations, missing-data/intercurrent-event rules, and multiplicity strategy.
- For Bayesian analyses: exact prior, likelihood/model, borrowing assumptions, decision thresholds, sensitivity analyses and approved statistical outputs. Never transfer another trial's prior or threshold.
- Locked analysis data and specifications, approved tables/listings/figures, database-lock/data-cut dates, derivation/program versions and statistical QC records.
- Disposition, deviations, exposure, concomitant therapy, diagnostic/adjudication criteria, recurrence/global-cure definitions, laboratory outputs, safety reconciliations and medically reviewed narratives.

Public examples supply external reporting precedents. Only verified, authorised client records supply the client's methods, conduct and results.

## 5. Build supervised examples in the existing workflow

For each selected section, a medical writer defines a bounded task and identifies the exact source pages, client inputs, expected answer and required abstentions.
AnA retrieves eligible evidence, produces a working draft and marks missing/conflicting inputs. It must not fill a missing count, analysis, ethics assertion or outcome with a plausible example.
A medical writer reviews reporting clarity and E3 coverage; a statistician reviews analysis interpretation; a safety clinician reviews the relevant safety content.
Store approved revisions and the reasons for corrections alongside the versioned source references and existing authoring/job lineage.
Use the reviewed examples first as retrieval and task-demonstration material. This improves assistance without claiming that ingestion changed model weights.
Consider optional fine-tuning only after a recurring, measured failure remains, with approved training rights, appropriate de-identification and a separately frozen evaluation set. Do not bulk-train on raw PDFs.

## 6. Evaluate on genuinely independent study families

Freeze learning/development and evaluation splits before selecting exemplar passages; split by study family, not document or page.
Keep a study's protocol, SAP, CSR, translations, synopses and repeated follow-up reports together. Keep linked rollover studies together where participants or analyses overlap.
For example, the NexoBrid 12/24-month reports belong together; related ECOSPOR III/IV material needs a shared-family decision before splitting.
Do not use held-out answer passages as prompting examples or fine-tuning data. When evaluating grounded drafting, provide only the task's authorised source packet; keep its expert answer withheld.
Include incomplete-source tasks, contradictory versions, redacted tables, changed denominators, missing-data cases and misleading external examples.
Compare the same blinded tasks with and without the new references; record material error rate, correction time, grounded-claim coverage and appropriate abstention, not fluency alone.

## 7. Proposed acceptance checks for every client draft

These are proposed project release checks for expert agreement, not a claim that an automated validator currently performs them all.

| Area | Required evidence before acceptance |
| --- | --- |
| Citations | Every material factual claim resolves to the exact source version and page/table/cell or approved output; citation content supports the claim. External precedent is labeled. |
| Numbers | Every reported count, percentage, estimate, interval and probability reconciles to approved outputs; denominator, units, rounding, direction and timepoint agree. No invented statistical calculation. |
| Tables and figures | Titles, treatment ordering, analysis set, visit/window, footnotes, missing categories, n/N and statistical annotations match the approved version; prose and displays agree. |
| Populations and estimands | Randomized, treated, safety, full-analysis and per-protocol sets remain distinct; exclusions and intercurrent-event/missing-data rules match the protocol/SAP. |
| Efficacy interpretation | Primary/secondary/exploratory and prespecified/post-hoc analyses remain distinct; sensitivity analyses and limitations are reported; credible intervals and posterior probabilities are not recast as frequentist results. |
| Safety | Participant counts and event counts remain distinct; denominators/exposure, TEAEs, serious events, deaths, discontinuations, severity and relatedness trace to reconciled outputs and reviewed narratives. |
| Conduct and completeness | Disposition, deviations, amendments, ethics/consent, investigator information, references and required appendices are supported or explicitly outstanding; missing records block completion where required. |
| Separation and approval | No external study fact becomes a client result; no unresolved material discrepancy remains; authorised medical-writing, statistical and clinical reviewers approve their portions. |

Set a release target of **zero critical unsupported clinical/statistical claims and zero unresolved material numeric discrepancies** in the reviewed draft; a failed check triggers correction and re-review.
Record failures and corrective changes as new supervised examples while keeping the frozen evaluation set protected. Monitor performance after any model, prompt, extractor, template or reference-corpus change.
AnA earns broader drafting responsibility through these recorded evaluations and approvals. The defensible deliverable is a reproducible, traceable, reviewed CSR workflow, with limitations visible at every stage.
