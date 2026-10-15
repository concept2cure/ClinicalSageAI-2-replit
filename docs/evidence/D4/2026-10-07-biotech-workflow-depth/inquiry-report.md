# W2 / D4 — biotech inquiry depth, 2026-10-07

Anna's existing `get_document_template` preparation path now selects deterministic lifecycle questions from the exact active registry identity. Existing named component priorities take precedence: a protocol prepared in a CTA-A context still starts its scientific follow-up with estimands. Questions carry a reason and requested source records; no new tool, model, dependency or interface was introduced.

The first two topics establish filing scope and current source versions. The third and subsequent topics focus on the actual build:

| Existing use case | Inquiry focus |
| --- | --- |
| US IND amendment / Canada CTA-A | Existing authorization, change trigger, clean/tracked baseline and hold/deficiency response |
| Supplements and variations in US/EU/CA/JP | Approved-to-proposed change, affected records, comparability/stability and scientific impact assessment |
| Medicines meetings and scientific advice | Decisions, numbered questions, sponsor positions, alternatives and linked support |
| Master files in all four markets | Confidential quality parts, holder/applicant responsibilities and authorization/access/reference records |
| US PSP / EU PIP | Age groups, extrapolation, dose/formulation rationale, plans and applicable waiver/deferral decisions |
| US / EU orphan designation | Condition definition, reproducible regional rarity evidence and medical rationale; EU significant benefit is conditional |
| US / EU / Japan biosimilar applications | Reference-product lots, comparative analytical evidence, residual uncertainty and any indication extrapolation |
| Individual safety cases | Receipt/awareness, follow-up, duplicates, expectedness and medical/regional reportability assessment |
| IND safety reports | Individual cases, qualifying aggregate findings and other risks remain distinct |
| Periodic / annual reports | Actual reporting interval, data lock and interval versus cumulative evidence |
| Post-marketing commitments | Actual obligation, milestone record and plan/status/final-report identity |
| Comparability / stability / nonclinical builds | The applicable scientific experiment and its limits; no automatic human-trial result request |
| Risk management / signal assessment | Evidence-to-action linkage, effectiveness assessment, alternative explanations and documented medical review |
| Integral medicinal-product device opinion | Device-part configuration/interface evidence and actual Notified Body opinion |
| Regional administrative / electronic backbone | Confirmed jurisdiction and current technical validation evidence |

Discussion markers still only suppress repeat questions. The guidance now limits their use to the current document, source versions and filing scope, and requires revisiting affected topics after a change. Every result remains `readiness: not_assessed`, `evidenceReviewed: false`, and at most three questions per step. GLOBAL `ISO_CIP`, a medical-device clinical investigation, no longer passes the medicinal-product family exception. The PMDA English marketing-application trial measure is only raised for an identified Japanese marketing application, not CTN, master file, consultation or variation builds.

The shared `US_IND_SR` registry row no longer promises universal eCTD / Module 5 placement. Its mixed subtype-dependent format uses the existing `regional` dossier-standard value. FDA's current page distinguishes commercial 312.32(c)(1)(i) E2B(R3) submissions to AEMS effective 2026-04-01, noncommercial exemption, and eCTD for (ii)/(iii)/(iv). The row distinguishes the 15-day determination trigger from the 7-day initial-receipt trigger for unexpected fatal/life-threatening suspected reactions; it does not calculate a client deadline or decide reportability.

## Official sources checked

Checked 2026-10-07. The new interview profiles are platform planning prompts, not claims of mandatory sections or identical requirements across jurisdictions.

- FDA, [Pediatric Study Plans](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/pediatric-study-plans-content-and-process-submitting-initial-pediatric-study-plans-and-amended), final July 2020: current/agreed plan and amendments are distinct inputs.
- EMA, [PIP templates and forms](https://www.ema.europa.eu/en/human-regulatory-overview/research-development/paediatric-medicines-research-development/paediatric-investigation-plans/paediatric-investigation-plans-templates-forms): latest scientific/key-elements versions updated April 2026; includes waiver, modification and compliance-check records.
- FDA, [Comparative analytical assessment for therapeutic-protein biosimilars](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/development-therapeutic-protein-biosimilars-comparative-analytical-assessment-and-other-quality), final September 2025: comparative analytical evidence against the reference product is central to the scientific inquiry. This source does not establish another jurisdiction's requirements.
- EMA, [Applying for orphan designation](https://www.ema.europa.eu/en/human-regulatory-overview/research-development/orphan-designation-research-development/applying-orphan-designation): product-specific medical-plausibility and prevalence source records. No universal numeric rarity threshold was added to the interview.
- FDA, [IND safety reporting](https://www.fda.gov/drugs/investigational-new-drug-application-ind/ind-application-reporting-ind-safety-reports): individual, aggregate and other findings; trigger-specific clocks and subtype-specific submission formats. This source supports the `US_IND_SR` correction.
- PMDA/MHLW, [6 September 2024 English marketing-application notice](https://www.pmda.go.jp/files/000270639.pdf): qualifying marketing-application scope and advance consultation; its English translation expressly defers to the Japanese original. It provides no CTN language exception.

## Verification and limits

`inquiry-red.txt` captured 48 intended regression failures before the lifecycle profiles and GLOBAL device boundary fix. `inquiry-boundary-red.txt` captured nine further failures before IND aggregate, Japanese language scope, risk-management, signal and integral-device corrections. `inquiry-safety-route-red.txt` captured both registry route/clock failures before correcting `US_IND_SR`.

`inquiry-integration-green.txt` records 323 passing tests in five files: the final focused inquiry, registry route, existing tool, schema-description and registry coverage tests. These include direct tool-budget checks for representative lifecycle builds (maximum 7,800 characters). `inquiry-lint.txt` records ESLint for the four owned source/test files: zero errors and the existing registry helper max-parameters warning. No local whole-project typecheck was run; the lead session uses the previously authorized GitHub gate.

These tests qualify deterministic question selection, scope boundaries and tool delivery only. They do not qualify clinical evidence, expert review, a model, transmission, a package or a regulatory filing. Technical datasets/safety messages and governed approvals remain separate workflows.
