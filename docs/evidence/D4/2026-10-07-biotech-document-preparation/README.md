# Biotech document preparation — W2 / D4 scoped evidence

**Date:** 2026-10-07 UTC. **Product/branch:** `concept2cure-v2`.

This change strengthens the existing Authoring workflow and Anna's existing
`get_document_template` reference tool. It does not introduce another product,
renderer, filing gateway or document-generation engine. It contributes local
regression evidence to D4; it does **not** declare D4 green or qualify every
regulatory document type for commercial use.

## What this tranche changes

- Exposes existing component and exact registry-linked outlines through one
  paged reference tool. Unsupported or known mis-scoped outlines remain
  unavailable rather than falling back to a plausible full CTD skeleton.
- Adds optional preparation questions for medicinal-product documents in the
  United States, EU/EEA, Canada and Japan. The inquiry establishes the product,
  filing objective, current source versions, scientific evidence, regional
  requirements, agency commitments and accountable reviewers.
- Places conversation preparation instructions in Anna's persona. Section
  drafting has separate instructions: draft supported prose, preserve source
  references and mark unresolved facts without inserting interview questions
  into the formal document or claiming unavailable tools were called.
- Corrects guided-intake routing: whole-token, specific-document matching
  replaces substring guesses; generic `marketing application` and `biologic`
  do not imply US NDA/BLA. Explicit foreign submission context cannot select or
  advertise the US IND/NDA/BLA interviews. Shared protocol and CSR interviews
  remain available where applicable.

The preparation reference tool reads no sponsor files, makes no tenant-data
writes and issues no evidence-sufficiency, approval or filing-readiness verdict.
Source retrieval, approved-model/privacy policy, governed authoring saves,
scientific review, signatures and technical submission gates remain separate
existing workflows.

## Outline availability is not builder qualification

| Outline/source | What the reference supplies | What it does not establish |
| --- | --- | --- |
| `clinical_study_report` | Existing canonical ICH E3 record and its ordered headings | Validated analyses, a completed CSR or review approval |
| `dsur` | Corrected ICH E2F lifecycle record: 20 numbered sections plus front/back matter | Regional placement, complete safety data or an accepted annual report |
| `smpc` | Existing QRD SmPC record | Applicability to another region's labeling or approved product information |
| `protocol`, `statistical_analysis_plan`, `informed_consent`, `drug_substance`, `drug_product` | Projections of existing project blueprints | Current agency-mandated headings or universal applicability of platform `required` flags |
| Existing overview, summary, IB, IMPD, RMP, PBRER and administrative components | Existing platform outlines with their recorded basis and limitations | Independent current-source validation of every heading |
| Exact registry-linked filing outlines | Existing dedicated/shared blueprint, when specifically available | Qualified end-to-end filing capability merely because a registry row exists |

Project/dedicated blueprint provenance is labeled `platform-convention`.
Checked regulator text records its official URL or vendored source and check
date. A well-formed citation record is traceability evidence, not proof that a
finished document is scientifically correct. Legacy protocol/GCP references,
US-oriented consent scaffolds and regional labeling limitations must remain
visible to the author.

`EU_CTA`, `CA_CTA`, `CA_CTA_A`, `JP_CTN` and `ICH_NONCLIN_SUMMARY` outlines are explicitly
withheld here pending correction/review of their existing scaffolds. A withheld
outline is not a claim that the entire platform lacks the corresponding
workflow. Coverage output records both available outlines and gaps; the
separately generated coverage JSON is the snapshot to inspect for exact counts.

The four requested markets plus shared ICH components contain **87** active
biotech registry entries: **81** have an indexed scaffold and **6** require a
source template or correction. The sixth gap is `US_IND_AMENDMENT`, which has
no exact existing outline. These counts measure outline availability only.

Section drafting uses the same canonical component records, including the full
corrected E2F DSUR. It declines known mis-scoped or default-fallback outlines.
Global ICH identities receive no assumed filing authority/channel, and bare
`CTA` requires jurisdiction clarification before regional drafting.
Non-ICH global reference documents retain their own source-body context.
SmPC, IMPD and the EU RMP require a compatible EU target context; this API does
not silently model their use as regional reference documents or addenda.
Device outlines remain available as references, while medicinal preparation
is refused for device pathways. Explicit `prepare:false` removes the interview
brief without bypassing exact identity or regional scope checks.

## Preparation questions and evidence

Questions are returned in batches of at most three, with a reason and requested
source material. Profiles distinguish study results from planned analyses,
safety reporting and CMC authoring. Relevant evidence includes protocol/SAP
versions and prespecification, reporting cutoffs, database lock, estimands,
analysis populations, validated TLFs, missing data, deviations, unfavorable
findings, exposure/signals, comparability and manufacturing changes.

`discussed_topics` only suppresses repeated conversational questions. It never
proves an answer was accurate, a record was supplied, a reviewer approved it or
the evidence is sufficient. Preparation continues to report
`readiness: not_assessed` and `evidenceReviewed: false`. Anna must inspect current
project sources and earlier answers before asking for information already
available. Numeric findings come from deterministic analyses, not model prose.

Pediatric, orphan, accelerated/conditional, cell/gene therapy, GMO/environmental,
combination-product and companion-diagnostic considerations are applicability
questions, not obligations imposed on every product. E2B safety messages,
validated study datasets/`define.xml`, eCTD backbones and agency transmission
require their dedicated engines and validation records.

## Official routing and currency checks

The sources below were inspected on **2026-10-07 UTC**. This date records the
research check; it is not a promise of perpetual regulatory currency. Source
publication, adoption, support-start and legal-effective dates have different
meanings and must not be collapsed into one status.

| Area | Verified distinction and dated source | Official source |
| --- | --- | --- |
| US IND | Clinical, nonclinical and manufacturing content plus applicable FDA forms; IND is distinct from NDA/BLA marketing applications. | [FDA IND administrative components](https://www.fda.gov/Drugs/DevelopmentApprovalProcess/HowDrugsareDevelopedandApproved/ApprovalApplications/InvestigationalNewDrugINDApplication/ucm360054.htm); [FDA current IND forms](https://www.fda.gov/drugs/investigational-new-drug-application-ind/ind-forms-and-instructions) |
| EU/EEA trials | CTIS supports trial applications, modifications, RFIs, milestones, annual safety reports and results. Part I scientific content and country-specific Part II differ from a marketing eCTD dossier. Revised transparency rules apply from **18 June 2024**. | [EMA CTIS](https://www.ema.europa.eu/en/human-regulatory-overview/research-development/clinical-trials-human-medicines/clinical-trials-information-system-ctis); [EMA CTIS support and current handbook](https://www.ema.europa.eu/en/human-regulatory-overview/research-development/clinical-trials-human-medicines/clinical-trials-information-system-ctis-training-support) |
| Canada CTA | Final CTA guidance describes administrative/clinical Module 1, quality summaries Module 2 and supporting quality Module 3 as applicable. Current management guidance permits CTA/CTA-A in eCTD or non-eCTD. PSEAT-CTA replaces PCERT; old delivery wording must not override newer format instructions. | [Health Canada CTA guidance](https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/applications-submissions/guidance-documents/clinical-trials/clinical-trial-sponsors-applications.html); [Current filing guidance](https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/applications-submissions/guidance-documents/management-drug-submissions-applications/pre-application-filing.html); [PSEAT-CTA](https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/applications-submissions/templates/protocol-safety-efficacy-assessment-template-clinical-trial-application-drug-products.html) |
| Canada modernization | Interim policy dated **14 September 2026** addresses multisite REB information, investigator qualifications and documented consent. Proposed new regulations and their draft guidance must not be treated as already operative regulations. | [Health Canada interim policy](https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/announcements/interim-policy-modernization-clinical-trial-framework-notice.html) |
| Japan trial vs marketing | Clinical trial notification is distinct from marketing approval. Current product-specific notification content and procedure require confirmation; the preparation route is labeled a platform convention. | [PMDA clinical-trial notices](https://www.pmda.go.jp/english/review-services/regulatory-info/0016.html) |
| Japan local evidence | **25 December 2023** principles make additional Japanese Phase I studies conditional on available safety/tolerability evidence. **23 October 2024** principles describe circumstances permitting an application without Japanese-patient trial results; ethnic sensitivity, dose and safety can still require additional data. | [Japanese Phase I principles](https://www.pmda.go.jp/files/000266773.pdf); [Foreign confirmatory evidence principles](https://www.pmda.go.jp/files/000275134.pdf) |
| Japan language | **6 September 2024** notice confirms English CTD Modules 3–5 were already allowed and introduces a trial measure for entire initial applications in English for qualifying foreign companies/new-drug categories, with advance PMDA consultation. This is not a blanket exemption. Japanese originals prevail over provisional translations. | [MHLW notice hosted by PMDA](https://www.pmda.go.jp/files/000270639.pdf) |
| Shared CTD | Module 1 is regional; Modules 2–5 provide the harmonized quality, nonclinical and clinical organization. A shared structure does not establish identical requirements or technical conformance. | [ICH CTD](https://www.ich.org/page/ctd) |
| GCP | FDA E6(R3) final guidance: **September 2025**. EMA Principles/Annex 1 effective **23 July 2025**; Annex 2 adopted June 2026 but EU effective **15 January 2027**. Health Canada states E6(R3) fully adopted **1 April 2026**. Japan implementation needs its own operative-source check. | [FDA E6(R3)](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/e6r3-good-clinical-practice-gcp); [EMA E6 status/effective dates](https://www.ema.europa.eu/en/scientific-guidelines/ich-e6-good-clinical-practice); [Health Canada GUI-0100](https://www.canada.ca/en/health-canada/services/drugs-health-products/compliance-enforcement/good-clinical-practices/guidance-documents/guidance-drugs-clinical-trials-human-subjects-gui-0100.html) |
| Protocol format | FDA M11 guideline, template and technical specification are final **May 2026**; EMA lists M11 at Step 5. Confirm agency/client adoption and applicable template before prescribing exact headings or exchange format. | [FDA M11](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/m11-clinical-electronic-structured-harmonised-protocol); [EMA M11](https://www.ema.europa.eu/en/scientific-guidelines/ich-m11-guideline-clinical-study-protocol-template-technical-specifications) |
| Technical specifications | FDA eCTD v4 M1 guide **1.9** and regional CV **1.2** list support beginning **28 September 2026**; validation criteria **1.6** list support beginning **28 August 2026**. Support does not mean universal mandatory use. FDA and PMDA study-data specifications/validation rules require independent checks. | [FDA eCTD v4 standards](https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/ectd-submission-standards-ectd-v40-and-regional-m1); [FDA study data](https://www.fda.gov/industry/study-data-standards-resources/study-data-submission-cder-and-cber); [PMDA electronic data](https://www.pmda.go.jp/english/review-services/reviews/0002.html) |

## Local evidence and outstanding qualification

| Local check | Result and evidence |
| --- | --- |
| Integrated outlines, preparation, intake, governed toolsets and launch scope | 441 passing tests in 15 files: `integrated-green.txt` |
| Final drafting correction and existing canonical requirements | 34 passing tests in two files: `drafting-outline-green.txt` |
| Production build | Client and server build passed: `build.txt`; existing chunk-size warnings remain |
| Changed-file lint gates | 16 files have zero lint errors; warnings decreased by one against the parent commit |
| Existing Authoring path | `ci:canvas-path:selftest` rejects every intentional path cut, then `ci:canvas-path` passes |
| Canonical push preflight preceding TypeScript | All preceding checks passed: `push-preflight.txt`; this is not a full pre-push pass |
| Required full-project TypeScript gate | **Blocked by host capacity.** Default 24 GB heap was killed by the 8 GiB host; 4 GB and 6 GB runs exhausted their heaps: `typecheck.txt`, `typecheck-retry.txt`, `typecheck-six-gb.txt` |

The parent for changed-file comparisons is
`2c989403a8f8e92c0a4a5d2451524c106091d49d`. Full typechecking must complete
through the canonical gate before the branch is updated; an OOM termination
is not a typecheck pass. The implementation is a reviewable candidate, and the
remote `concept2cure-v2` ref has not been advanced. The existing CI can check a
branch update, but no existing workflow accepts an unreferenced candidate SHA
as a checkout input. A larger execution host or explicit permission to rely on
CI for this required gate is needed to complete branch publication. No baseline
or repository gate was weakened.

The neighboring logs record failing-before-fix and passing-after-fix checks for
outline availability/provenance, tool schema/description, preparation and
intake routing. `intake-red.txt` demonstrates 40 failures; `intake-green.txt`
records 66 passing intake checks. Use the combined test and lint logs for the
final integrated code snapshot rather than treating one earlier passing run as
proof of all later edits. These are focused local tests, not a completed
production qualification or live sponsor filing.

Remaining work includes:

1. Run a representative client conversation through current project retrieval,
   focused questions, supported section drafting, governed save, review and
   export; verify source/version links, unresolved facts and region context
   survive every boundary.
2. Have accountable medical, statistical, CMC and regional regulatory experts
   review representative outputs against current agency/client templates;
   resolve the withheld outlines and qualify each claimed build type.
3. Exercise actual approved models and tenant/privacy policy in the intended
   deployed posture. Static guidance and mocked/unit assertions do not prove
   retrieval quality, questioning behavior or model grounding in production.
4. Independently validate study datasets, safety-message payloads and regional
   submission packages where claimed; record required approval and agency
   acknowledgments through their existing workflows.
5. Recheck guidance status, local language/disclosure requirements and technical
   versions at the actual filing date, and carry this change through the broader
   D4 validation package and release process.

No agency approval, successful transmission, production deployment, exhaustive
document coverage or full D4 completion is asserted by this evidence folder.
