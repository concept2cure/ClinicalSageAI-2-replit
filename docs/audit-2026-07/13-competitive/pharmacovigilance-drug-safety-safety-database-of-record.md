# Pharmacovigilance & drug safety (safety database of record,…

> **Verdict: 🔴 Not competitive**
> Weighted capability score — **us 1.1 / 5** vs **best competitor 5.0 / 5** across 15 dimensions.

**Full category as scoped:** Pharmacovigilance & drug safety (safety database of record, ICSR/E2B(R3) submission, signal detection & management, aggregate safety reporting)

## Who buys, and what they are actually buying

Head of Pharmacovigilance / QPPV (EU) or Drug Safety Officer, usually co-signed by Head of Quality/CSV and IT. They hold a PV operations budget and buy one thing: a validated system of record that provably gets ICSRs to FAERS/EudraVigilance/PMDA inside the 7- and 15-day clocks, survives an EMA/FDA PV inspection, and produces the DSUR/PBRER on the EURD date. Failure mode they are buying insurance against is a GVP non-compliance finding or a Form 483 — not efficiency. Secondary buyer at small biotech (<10 marketed products) is the VP RA/Clinical who wants PV bundled rather than a separate six-figure Argus program, which is the only door this platform could realistically enter through.

## Market structure

SIZE AND SHAPE. Estimates diverge sharply by scope definition and a buyer should not anchor on any single one. Narrow PV software: USD 234.73M in 2026 rising to USD 309.03M by 2031 at 5.65% CAGR (Mordor Intelligence); a competing estimate puts 2026 at USD 228.57M from USD 215.84M in 2025 (Global Growth Insights). Broad PV and drug-safety software including services-adjacent tooling: USD 2.53B in 2025 to USD 2.86B in 2026 at 12.8% CAGR. Total PV market including outsourced services: roughly USD 10.5B in 2026 growing toward USD 31.6B by 2034 at ~15%. The gap between the ~USD 235M software number and the ~USD 10.5B total is the single most important structural fact in this category: PV is overwhelmingly a SERVICES market, and most small and mid-size biotechs solve pharmacovigilance by hiring IQVIA or a specialist CRO, not by buying software. Any PV revenue model for this platform is competing against outsourcing, not just against Argus. Sources: https://www.mordorintelligence.com/industry-reports/pharmacovigilance-and-drug-safety-software-market ; https://www.globalgrowthinsights.com/market-reports/pharmacovigilance-software-market-108058 ; https://www.fortunebusinessinsights.com/pharmacovigilance-pv-market-102746

SEGMENT MIX AND DEPLOYMENT. Pharma and biotech held 54.10% of PV software spend in 2025, while business process outsourcing firms are the fastest-growing buyer at 17.2% CAGR — confirming the services-led shape above. Cloud/SaaS is now 66.55% of revenue and growing at 21.3% CAGR, so on-premise is no longer a competitive position. Source: https://www.mordorintelligence.com/industry-reports/pharmacovigilance-and-drug-safety-software-market

STRUCTURE AND CONSOLIDATION. The category is concentrated around Oracle, ArisGlobal, IQVIA and Veeva at enterprise scale, with RxLogix named alongside them in 2026 vendor coverage, and a long tail of SME/multivigilance specialists (AB Cube, Ennov, EXTEDO, Sarjen). Consolidation is active: in early 2026 AB Cube brought Marvin, asthenis and SafetyEasy together under the AB Cube Group to form an integrated real-world and clinical-trial safety suite, and EXTEDO distributes SafetyEasy under its own brand — meaning the SME tier this platform would enter is itself consolidating and gaining distribution reach while we have no product to sell into it. Sources: https://www.globenewswire.com/news-release/2026/04/30/3285101/0/en/pharmacovigilance-and-drug-safety-software-market-report-2026-featuring-profiles-of-iqvia-oracle-corporation-arisglobal-and-rxlogix.html ; https://www.ab-cube.com/vigilance/ ; https://extedo.com/products/pharmacovigilance-and-drug-safety/safetyeasy

PROCUREMENT PATTERN AND DEAL SIZE. Pricing is almost universally undisclosed across every vendor examined — enterprise subscription with modules, users and case volume as the meters. The one usable public benchmark for the segment: small SaaS PV solutions start at roughly USD 10,000-20,000 per year, while large enterprise systems run hundreds of thousands in licence plus millions in implementation and validation. Veeva Vault Safety is estimated in secondary analysis at hundreds to low thousands per user per year plus fixed platform cost, and Veeva has said AI usage will be metered and usage-priced. AB Cube competes explicitly on 'most cost-effective,' 'full price transparency,' 'no hidden costs.' The decisive procurement mechanic is that the software line item is frequently the smaller half of the cost — the implementation, data migration and computer system validation program dominates. That is exactly why Veeva's vendor-executed IQ/OQ three times a year with a customer validation package, and customer-reported validation cycle times up to 80% shorter than legacy on-premise, is the sharpest commercial weapon in the category, and why our zero-page PV validation posture is not a documentation gap but a pricing disadvantage. Sources: https://intuitionlabs.ai/articles/veeva-vault-pricing-2026-cost-breakdown ; https://www.veeva.com/resources/veeva-vault-validation-product-brief/ ; https://www.veeva.com/wp-content/uploads/2022/03/Veeva-Vault-Validation-Datasheet.pdf ; https://en.ennov.com/pharmacovigilance-full-features/

TECHNICAL GATE. E2B(R3) is an XML model derived from HL7 version 3; individual and batch ICSRs use the HL7 batch message wrapper with message interaction identifier MCCI_IN200100UV01, and EMA publishes the schema at http://eudravigilance.ema.europa.eu/XSD/multicacheschemas/MCCI_IN200100UV01.xsd. EU legislation requires MAHs to submit ICSRs to EudraVigilance in E2B(R3), and FDA publishes a Regional Implementation Guide. This is a hard, externally-verified conformance boundary — not a spec a vendor can approximate — which is why AB Cube publicises passing China NMPA E2B(R3) testing as a differentiator, and why our bespoke <element id=\"C.1.1\"> projection is a category-exclusion rather than a feature gap. Sources: https://www.fda.gov/media/98536/download ; https://www.ema.europa.eu/en/documents/scientific-guideline/international-conference-harmonisation-technical-requirements-registration-pharmaceuticals-human-use-guideline-e2b-r3-electronic-transmission-individual-case-safety-reports-icsrs-data-elements_en.pdf ; https://database.ich.org/sites/default/files/ICH_E2B-R3_QA_v2_4_Step4_2022_1202.pdf ; https://www.pharmiweb.com/press-release/2023-07-26/ab-cube-s-safetyeasy-suite-cloud-based-multivigilance-software-successfully-passes-china-ich-e2b-r3-testing

WHAT THE CATEGORY IS NOW COMPETING ON. Not features — measured automation. ArisGlobal publishes >1M cases processed on NavaX at >95% accuracy and >30% efficiency gain, heading to 2.5M by mid-2026, with seven global life-sciences companies publicly selected. IQVIA publishes up to 80% fewer false positives from GenAI in Vigilance Detect. Veeva ships Safety.AI MedDRA pre-coding, multilingual coding and duplicate detection today with metered AI agents phasing in from April 2026. AB Cube claims up to 70% faster intake from CasEasy AI and OCR. A new entrant with no shipped case-processing automation, no intake surface and no validation package has no credible answer to the first question in any 2026 PV bake-off. Sources: https://www.arisglobal.com/lifesphere/safety/ ; https://www.prnewswire.com/news-releases/arisglobal-announces-xdi-navax-data-intelligence-three-new-agents-and-navax-translation-302684836.html ; https://www.iqvia.com/library/fact-sheets/iqvia-vigilance-detect-transforming-pharmacovigilance-with-measurable-outcomes ; https://safety.veevavault.help/en/gr/753121/ ; https://www.ab-cube.com/vigilance/

UNVERIFIED CLAIMS FLAGGED. A secondary source attributes Oracle a 24% enterprise-segment share and Argus a 9.4/10 data-integrity rating; neither is traceable to a primary or audited source and both should be treated as marketing-adjacent. Vault Safety-specific customer counts are not disclosed (Veeva reported 1,552 cumulative customers across all Vault products at FY2026). All vendor automation and accuracy metrics cited above are vendor-published and none are independently audited.

## The five closest competitors

### Oracle Argus Safety (Oracle Life Sciences "Safety One") — Argus Safety / Argus Cloud Service (releases 8.4.x and 2026.1.x), with Argus Insight, Argus Mart, Empirica Signal, and Axway-based E2B e-submission gateway

The default incumbent and de-facto reference safety database. Sold to large pharma, established biotech, CROs and PV service providers that need a validated, globally familiar safety database with regulatory reporting continuity. Argus is the system most PV staff have already been trained on, which makes it the risk-free choice in a procurement.

**Strengths**

- Widest installed base and deepest regulatory reporting rule library across FDA/EMA/PMDA/NMPA/Health Canada — the reporting rules engine is the actual product
- Empirica Signal brings MGPS/EBGM disproportionality with a full database-wide fit, not a single-cell approximation
- Trained-labor market: PV staff and CRO partners already know Argus, which collapses change-management risk in a deal
- Proven E2B gateway path (Axway) with ACK reconciliation and submission tracking at scale
- Inspection track record — Argus case files have survived thousands of FDA/EMA PV inspections

**Weaknesses**

- Heaviest and most expensive to implement and validate; long time-to-first-case
- UX is dated relative to Veeva/ArisGlobal and drives per-case processing cost
- AI story is the weakest of the top three incumbents as of 2026; Oracle is defending, not leading
- Configuration depth becomes a validation liability — every change is a CSV event
- Poor fit below ~mid-size biotech; effectively unsellable to a 5-person safety group

| | |
|---|---|
| AI shipped today | Oracle markets the Life Sciences PV solution as "cloud-enabled automation and advanced analytics, built on OCI and leveraging AI to streamline intake, case management, signal detection, and regulatory workflows." Specific shipped, GA AI case-processing agents in Argus as of mid-2026 are not verified from Oracle primary sources; Oracle's AI messaging is materially less concrete than ArisGlobal's or Veeva's. Empirica Signal (MGPS/EBGM data mining) is long-standing statistical, not LLM, capability. |
| GxP / validation posture | Long-established GxP/21 CFR Part 11 posture; Oracle publishes Argus Cloud Service administration and qualification documentation. Historically the customer carries a heavier CSV burden than on Veeva because Argus is more configurable and, in on-prem/hybrid form, customer-qualified. Exact current Oracle-supplied validation package contents not verified. |
| Pricing signal | Not public. Enterprise subscription, licensed by usage, modules and user count; requires Oracle Sales engagement (secondary source: rxalmanac vendor profile). Real-world programs are commonly multi-hundred-thousand-dollar annual license plus a separate implementation/validation project — not independently verified. |

<details><summary>Sources</summary>

- https://www.oracle.com/life-sciences/pharmacovigilance/
- https://www.oracle.com/life-sciences/safety-solutions/argus-safety-case-management/
- https://docs.oracle.com/en/industries/life-sciences/argus-safety/index.html
- https://docs.oracle.com/en/industries/life-sciences/argus-safety/8.4.3/acadm/oracle-argus-cloud-service-administration-guide.pdf
- https://rxalmanac.com/vendor/oracle-argus-safety/
- https://docs.oracle.com/en/industries/health-sciences/argus-safety/8.2.2/aeoas/mfds-reports.html

</details>

### ArisGlobal LifeSphere Safety (NavaX) — LifeSphere Safety with LifeSphere NavaX (GenAI case processing), MedDRA Coding Agent, NavaX Translation, and XDI data intelligence cortex

The AI-native incumbent. Positions explicitly as "AI Pharmacovigilance Software for Drug Safety & Case Processing" and is winning displacement deals on case-processing cost per case rather than on database features. This is the vendor most likely to define what "AI PV" means in a 2026 procurement.

**Strengths**

- The only vendor with a public, large-N production metric for AI case processing (>1M cases, >95% accuracy, >30% efficiency)
- Full PV suite — intake, case processing, coding, submissions, signal, aggregate reporting — not a point tool
- Named-logo momentum: seven global pharma selections publicly announced for NavaX alone
- NavaX Translation removes the multilingual intake bottleneck that historically forced regional PV vendors
- XDI positions them to arbitrage safety data against regulatory, clinical and quality — a platform play the point vendors cannot match

**Weaknesses**

- Validation of probabilistic AI components under GAMP 5 is an unsettled area; conservative QA groups will resist
- Smaller installed base than Oracle; less PV labor-market familiarity
- Enterprise-only commercial motion — very poor fit for small biotech
- Efficiency claims are vendor-published and not independently audited
- Migration off Argus is still a multi-quarter data-migration and revalidation project

| | |
|---|---|
| AI shipped today | Shipped and in production, not roadmap: ArisGlobal states NavaX is processing more than 1 million safety cases with data accuracy greater than 95% and efficiency gains greater than 30%, with volumes projected to reach 2.5 million cases by mid-2026. At Breakthrough 2026 it announced XDI (data intelligence cortex), three new AI agents, and NavaX Translation — the latter GA to LifeSphere Safety customers from July 2026, bringing pharma-grade multilingual case intake. A dedicated MedDRA Coding Agent is part of the shipped agent set. Seven named global life-sciences companies have publicly selected NavaX for GenAI-driven case processing. |
| GxP / validation posture | GxP-validated enterprise PV platform sold to top-20 pharma; ArisGlobal supplies validation documentation as part of the cloud service. Specific IQ/OQ package contents and the validation approach for the GenAI agents (how a >95%-accuracy probabilistic component is qualified under GAMP 5) are not verified from primary sources — this is the single best question to ask them in diligence. |
| Pricing signal | Not public. Enterprise subscription; NavaX is sold as an add-on/uplift to LifeSphere Safety. No published per-case or per-user rate. |

<details><summary>Sources</summary>

- https://www.arisglobal.com/lifesphere/safety/
- https://www.prnewswire.com/news-releases/arisglobal-announces-xdi-navax-data-intelligence-three-new-agents-and-navax-translation-302684836.html
- https://www.prnewswire.com/apac/news-releases/arisglobal-launches-navax-translation-to-eliminate-manual-translation-in-global-pharmacovigilance-302698489.html
- https://www.arisglobal.com/media/press-release/seventh-global-life-sciences-company-selects-lifesphere-navax-for-genai-driven-case-processing/
- https://www.arisglobal.com/media/press-release/another-top-global-pharmaceutical-organization-goes-live-with-lifesphere-navax/
- https://rxalmanac.com/vendor/arisglobal/

</details>

### Veeva Vault Safety (with Vault Safety.AI and Veeva Safety Signal) — Vault Safety, Vault Safety.AI, Veeva Safety Signal, Vault SafetyDocs; part of the Vault platform and the new Falcon AI platform

The cloud-native modern challenger, and the strongest displacement threat because the buyer often already owns Vault for RIM/Clinical/Quality. Sells on unified data across safety, clinical and regulatory plus the lowest validation burden in the category.

**Strengths**

- Best-in-category validation economics — vendor-performed IQ/OQ per release plus a customer validation package
- Signal module ingests EVDAS and literature alongside internal PV data — genuinely multi-source signal detection
- Multilingual MedDRA coding and duplicate detection are shipped, not roadmap
- Platform gravity: if the buyer runs Vault RIM/Clinical/QualityDocs, safety data joins the same object model with no integration project
- 3x/year release cadence means feature gaps close fast

**Weaknesses**

- Newest of the big three in safety; less deep regulatory reporting rule coverage in long-tail markets than Argus
- Agentic safety capability is April-2026-to-late-2026 phased, so "agents" are partly forward-looking in a 2026 procurement
- Platform lock-in and per-user pricing scale badly for a CRO/service model with many low-usage users
- Vault Safety-specific reference count is not publicly disclosed, so segment proof is thinner than Argus
- Requires buying into the Vault platform to get the full benefit

| | |
|---|---|
| AI shipped today | Shipped: Safety.AI auto-extracts event terms from narratives and pre-codes them with MedDRA suggestions; Vault Safety includes intelligent duplicate detection and follow-up; a multilingual MedDRA browser maps Japanese/Spanish reported terms to MedDRA codes; Veeva codes events using the latest published MedDRA version with manual coding fallback. Veeva Safety Signal runs scheduled and ad-hoc signal detection over PV data from Veeva Safety, literature data from SafetyDocs, and external health-authority sources including EMA EVDAS. Agentic: Veeva stated Safety and Quality AI agents were slated for April 2026 release, with usage-metered pricing; Falcon safety case intake and processing agents target late 2026 for early adopters — treat the agents as emerging, and Safety.AI/Signal as the shipped baseline. |
| GxP / validation posture | Strongest published position in the category. Veeva validates every release itself (IQ and OQ) three times a year and supplies customers a validation package; customers report validation cycle times up to 80% shorter than legacy on-premise; a comprehensive revalidation of all functionality is performed every two years. This is a decisive advantage in front of a QA buyer. |
| Pricing signal | Not public for Safety specifically. Secondary analysis puts Vault Safety on the order of hundreds to low thousands per user per year plus fixed platform cost, with Safety historically sold to large enterprises; Veeva has stated AI usage will be metered and usage-priced. Veeva reported 1,552 cumulative customers at FY2026 (Jan 2026) across all Vault products; a Vault Safety-specific customer count is not verified. |

<details><summary>Sources</summary>

- https://safety.veevavault.help/en/gr/753121/
- https://safety.veevavault.help/en/gr/752950/
- https://safety.veevavault.help/en/lr/752955/
- https://safety.veevavault.help/en/lr/826975/
- https://platform.veevavault.help/en/gr/21893/
- https://www.veeva.com/resources/veeva-vault-validation-product-brief/
- https://www.veeva.com/wp-content/uploads/2022/03/Veeva-Vault-Validation-Datasheet.pdf
- https://www.veeva.com/resources/veeva-ai-agents-to-be-released-across-all-veeva-applications/
- https://intuitionlabs.ai/articles/veeva-ai-agents-pharmacovigilance-case-processing
- https://intuitionlabs.ai/articles/veeva-vault-pricing-2026-cost-breakdown
- https://www.clinicaltrialvanguard.com/conference-coverage/veeva-unveils-falcon-ai-platform-and-agentic-authoring-at-2026-summit/

</details>

### IQVIA Vigilance Platform — IQVIA Vigilance Platform — modules: Vigilance Intake, Vigilance Collect, Vigilance Case, Vigilance Detect, Vigilance Signal (formerly the Safety Suite lineage)

True-SaaS PV platform sold alongside IQVIA's PV outsourcing services. Wins where the buyer wants to outsource the safety function rather than staff it — the most common answer for small and mid-size biotech, and therefore a direct substitute for buying any PV software at all.

**Strengths**

- Substitutes for the whole PV function, not just the database — beats software-only vendors at small biotech
- Quantified GenAI outcome claim (up to 80% fewer false positives in Detect) tied to case studies
- End-to-end module coverage from reporter portal through signal, all on one SaaS
- Deep literature and RWD assets to feed signal detection
- Buyer offloads inspection risk onto IQVIA, which is the real thing being purchased

**Weaknesses**

- Service-led model means less buyer control and higher long-run cost per case at scale
- Software is less frequently bought standalone, so standalone references are thinner
- Vendor lock-in extends to the operating model, not just the data
- Efficiency claims are client-case-study based, not independently audited
- Conflicted where the buyer also uses IQVIA as CRO — concentration risk

| | |
|---|---|
| AI shipped today | Shipped: Vigilance Detect is GenAI-powered for automated drug safety event detection and extraction, with client case studies reporting up to 80% fewer false positives and notable reductions in manual review. Vigilance Intake uses AI/ML/NLP to capture adverse events from external and internal sources. Vigilance Collect provides web/mobile reporter portals that store submissions in E2B+ format, auto-validate each submission and auto-create the case in the safety database. IQVIA has also announced custom-built AI agents using NVIDIA technology for life-sciences workflows. |
| GxP / validation posture | Delivered as a validated SaaS within IQVIA's regulated services organisation; IQVIA carries the inspection exposure when the service is bundled. Specific customer-facing validation package contents not verified. |
| Pricing signal | Not public as software. Commercially usually bundled into a PV services contract; the effective procurement unit is a per-case processing fee plus an annual PV service retainer rather than a license. Specific rates not verified. |

<details><summary>Sources</summary>

- https://www.iqvia.com/solutions/safety-regulatory-compliance/safety-and-pharmacovigilance/iqvia-vigilance-platform
- https://www.iqvia.com/solutions/safety-regulatory-compliance/safety-and-pharmacovigilance/iqvia-vigilance-platform/iqvia-vigilance-detect
- https://www.iqvia.com/solutions/safety-regulatory-compliance/safety-and-pharmacovigilance/iqvia-vigilance-platform/iqvia-vigilance-collect
- https://www.iqvia.com/solutions/safety-regulatory-compliance/safety-and-pharmacovigilance/iqvia-vigilance-platform/iqvia-vigilance-intake
- https://www.iqvia.com/library/fact-sheets/iqvia-vigilance-detect-transforming-pharmacovigilance-with-measurable-outcomes
- https://www.iqvia.com/library/fact-sheets/iqvia-vigilance-platform-fact-sheet

</details>

### AB Cube SafetyEasy Suite (also distributed by EXTEDO) — SafetyEasy Suite — unified multivigilance database (pharmacovigilance, materiovigilance/device, cosmetovigilance, nutrivigilance) with the AB Cube Galaxy AI modules: CasEasy AI (NLP case creation) and Converter (OCR form extraction)

THE realistic head-to-head competitor for this product. Explicitly targets pharmacovigilance for small-to-mid-sized companies and CROs managing multiple clients, marketed as the cost-effective, compliant, easy-to-use multi-vigilance platform for SMEs. A SaaS vigilance pioneer since 2006; in early 2026 AB Cube consolidated Marvin, asthenis and SafetyEasy under the AB Cube Group.

**Strengths**

- Occupies exactly the SME/CRO segment this platform must enter, at a price a small biotech will actually pay
- Third-party-proven E2B(R3) conformance including China NMPA testing
- Multivigilance in one database (drug + device + cosmetic + nutritional) — combination-product cases handled in one application
- Explicit GAMP 5 / Part 11 posture with vendor-managed regulatory updates
- Real shipped intake AI (NLP + OCR) with a ~70% intake acceleration claim

**Weaknesses**

- Weakest brand and smallest reference base of the five — loses large-pharma deals on perceived risk
- Signal detection and analytics are thinner than Empirica/Veeva Signal
- Less capital behind AI than ArisGlobal, IQVIA or Veeva; risk of falling behind on agentic case processing
- Intake acceleration and cost claims are vendor-published, not independently audited
- Recent portfolio consolidation (Marvin/asthenis/SafetyEasy) creates roadmap and rationalisation uncertainty

| | |
|---|---|
| AI shipped today | Shipped: CasEasy AI applies NLP to case creation and Converter applies OCR to extract data from reporting forms; AB Cube claims case intake acceleration of up to 70%. This is narrower than NavaX/Safety.AI (intake and extraction, not end-to-end autonomous case processing) but it is real, GA, and priced for the segment this platform would sell into. |
| GxP / validation posture | States full compliance with ICH E2B(R3), FDA 21 CFR Part 11 and GAMP 5, with automatic system updates to stay current with regulations. Independently demonstrated E2B(R3) gateway competence: SafetyEasy Suite passed China NMPA ICH E2B(R3) testing, which is a genuine third-party conformance proof point rather than a marketing claim. |
| Pricing signal | Enterprise subscription, not publicly disclosed, but the company markets on "most cost-effective," "full price transparency" and "no hidden costs" — i.e. it competes on published-ish, SME-scale pricing. Broader category benchmark: small SaaS PV solutions start around $10,000–$20,000/year while large enterprise systems run hundreds of thousands in license plus millions in implementation and validation. |

<details><summary>Sources</summary>

- https://www.ab-cube.com/vigilance/
- https://www.pharmiweb.com/press-release/2023-07-26/ab-cube-s-safetyeasy-suite-cloud-based-multivigilance-software-successfully-passes-china-ich-e2b-r3-testing
- https://extedo.com/products/pharmacovigilance-and-drug-safety/safetyeasy
- https://www.extedo.com/software/pharmacovigilance-and-drug-safety
- https://intuitionlabs.ai/software/pharmacovigilance-safety/e2br3-submission-automation/ab-cube-safetyeasy-suite

</details>

## Capability rubric

Our score is cited to `file:line` in this repository. Theirs is cited in the competitor sections above. Scored on what **ships and is reachable**, not what is architected — an unreachable or unvalidated capability scores low regardless of code quality.

| Dimension | Weight | Us | Best competitor | Their score | Our evidence |
|---|---|:--:|---|:--:|---|
| Case intake — can a safety officer actually enter a case in the product | critical | **0** 🔻 | IQVIA Vigilance Collect / ArisGlobal NavaX | 5 | absent — POST /api/pharmacovigilance/adverse-events exists and is Zod-validated at server/routes/pharmacovigilance-routes.ts:271-319, but a grep of the entire client/src tree returns ZERO references to that endpoint. The only PV endpoints any UI calls are overview, compliance-matrix, signals/screen and calculate-deadline (client/src/concept2cure/v2/surfaces/PvCockpit.tsx:87-90,102,117) plus /api/pharmacovigilance/board and /api/safety-narratives/cases. There is no case-intake form, no case worklist with create, and no inbound E2B import anywhere in the repo. Every KPI, signal and compliance number in the UI is therefore structurally empty for any real customer. |
| E2B(R3) ICSR generation conformant to the HL7 v3 ICH schema | critical | **1** 🔻 | AB Cube SafetyEasy (passed China NMPA E2B(R3) conformance testing) / Oracle Argus | 5 | server/services/ind-lifecycle/e2b-icsr-composer.ts:276-290 — serializeE2bXml emits <ichicsr standard="E2B(R3)" projection="data-elements"> containing generic <element id="C.1.1" label="...">value</element> tags. That is a bespoke key-value projection, not the HL7 v3 MCCI_IN200100UV01 message EMA and FDA require; the file admits this at :12-17. Two further blockers: pharmacovigilanceService.ts:972-977 hardcodes the C.1.8.1 worldwide unique case id prefix to 'XX-C2CRI-' ('XX' is not an ISO 3166 country code, so every case fails agency validation), and pharmacovigilanceService.ts:959-965 mints the C.1.1 sender's unique identifier from Math.random() despite crypto.randomUUID being imported at :27 and used at :1264. Separately, the PV module's own endpoint POST /api/pharmacovigilance/icsr/generate never calls the composer at all — pharmacovigilanceService.ts:563-630 returns a metadata row with a hardcoded e2bVersion:'R3' string and no XML. |
| Agency gateway transmission and ACK reconciliation (FDA ESG/FAERS, EudraVigilance, PMDA, NMPA) | critical | **0** 🔻 | Oracle Argus (Axway E2B gateway) | 5 | server/services/ind-lifecycle/icsr-gateway-transport.ts:189-201 — when a gateway IS configured, transmitIcsr() unconditionally throws 'ICSR gateway transport client is not implemented ... Refusing to fabricate a gateway acknowledgement.' With no gateway configured it throws in production (:204-212) or returns an explicitly simulated:true receipt outside production (:216-227). There is no AS2, no SFTP, no ESG client anywhere in the repo. Zero ICSRs can be transmitted, in any environment, ever. The ACK parser at e2b-icsr-message.ts:143-162 is well built but has no ACK to parse. |
| MedDRA / WHODrug dictionary management, auto-coding and version upgrade | critical | **1** 🔻 | Veeva Vault Safety (multilingual MedDRA browser, coded to latest published MedDRA version) | 5 | server/services/compliance/pharmacovigilanceService.ts:1136-1165 — searchMeddraTerms queries meddra_term_reference and returns [] on 42P01/42703. The migration never creates that table: migrations/20260603_pv_operational.sql:165-167 only adds an index IF to_regclass('public.meddra_term_reference') IS NOT NULL. There is no MedDRA loader, no seed, no version-upgrade path, and no WHODrug support anywhere in scripts/ or ingestion/. Auto-coding does not exist; the field is free text (adverseEventSchema reactionPt/reactionPtCode are optional strings, pharmacovigilance-routes.ts:76-79). |
| Quantitative signal detection math (disproportionality) | high | **4** 🔻 | Veeva Safety Signal (multi-source: internal PV + literature + EMA EVDAS, scheduled and ad-hoc) / Oracle Empirica | 5 | server/services/compliance/pv-signal-detection.ts:95-152 — genuine, literature-cited PRR, ROR with log-method 95% CI, Yates-corrected chi-squared, and Gamma-Poisson EBGM/EB05, with total (non-throwing) zero-cell handling and Acklam/Wilson-Hilferty numerics at :254-329. server/routes/pharmacovigilance-board.routes.ts:133-187 automatically cross-tabulates the org's own adverse_events by (suspect_product × reaction_pt) into 2x2 tables with an n>=3 floor and runs the screen. A BCPNN IC + EBGM multi-method consolidator is exposed as an ANA tool (server/services/ana/statisticalDesignTools.ts:239). The file honestly self-declares the single-Gamma (alpha0=beta0=0.5) approximation vs a full database-wide MGPS fit at :155-179. Deducted one point for that approximation and for the UI exposing only a hand-typed 2x2 (PvCockpit.tsx:150-172). |
| Signal management workflow (GVP Module IX: validation, prioritisation, assessment, closure, ownership) | high | **1** 🔻 | Veeva Safety Signal / Oracle Empirica Signal | 5 | server/services/compliance/pharmacovigilanceService.ts:192-208 — SafetySignal is a flat row with no owner, no assignee, no due date, no evidence links, no state-transition history and no closure record; evaluationStatus is a free enum with no workflow enforcing it. server/routes/pharmacovigilance-board.routes.ts:66,182 explicitly returns owner:null with the comment 'GAP: no signal owner/assignee exists in adverse_events or safety_signals'. reportSignal (pharmacovigilanceService.ts:745-786) is a bare INSERT with no route that ever transitions a signal. |
| Aggregate safety reporting (DSUR / PBRER / PSUR / PADER) authoring and line listings | high | **2** 🔻 | Oracle Argus / ArisGlobal LifeSphere Safety | 5 | server/services/compliance/pv-periodic-scheduler.ts (234 lines) computes upcoming deadlines from data-lock points and is exposed at POST /api/pharmacovigilance/periodic-reports/schedule (pharmacovigilance-routes.ts:423-443); server/services/ana/pharmacovigilance.ts:29-70+ encodes DSUR/PBRER section structure and pitfalls for AI advisory. But PeriodicSafetyReport (pharmacovigilanceService.ts:171-183) is metadata only — reportType, dates, status, dueDate. There is no document authoring, no summary tabulations, no line listings, no cumulative exposure computation, and no UI. Scheduling and knowledge without generation. |
| Literature monitoring (GVP Modules VI/VIIa — mandatory PV activity) | high | **0** 🔻 | Veeva (SafetyDocs literature feeding Safety Signal) / IQVIA | 5 | absent — 'literature' appears in this codebase only as a signalSource enum value (server/services/compliance/pharmacovigilanceService.ts:196 and server/routes/pharmacovigilance-routes.ts:105). No Embase/Medline ingestion, no abstract screening, no ICSR-from-literature triage, no EMA Medical Literature Monitoring reconciliation exists anywhere in server/. |
| Expedited reporting clock and regulatory compliance tracking | critical | **3** 🔻 | Oracle Argus reporting rules engine | 5 | server/services/compliance/pharmacovigilanceService.ts:284-336 computes 7/15-day deadlines across FDA/EMA/PMDA/NMPA/Health Canada with cited legal bases; :1093-1115 computeReportingClock is a pure, unit-tested day-6-of-15 escalation function; server/routes/safety-narrative.ts:60-80 recomputes the 21 CFR 312.32(c) clock LIVE from awareness_date and fails closed to null rather than displaying a stale stored value. This is the strongest thing in our PV module. Deductions: calendar-day arithmetic only (no business-day or holiday handling), the PMDA 72-hour first-notice obligation is deferred to a 'workflow layer' that does not exist (:313-315), and the compliance matrix hardcodes a 7-country map so any other country silently vanishes from the matrix (pharmacovigilance-routes.ts:638-641,647-650). |
| 21 CFR Part 11 audit trail and electronic signature on safety records | critical | **1** 🔻 | Oracle Argus / Veeva Vault Safety | 5 | server/services/compliance/pharmacovigilanceService.ts:1233-1278 — writePvAudit is documented as 'best-effort', swallows every error and returns false (:1271-1274); submitCaseToTriage calls it with .catch(() => false) at :1216, so a case can transition state with no audit record and the API still returns success:true with auditWritten:false. A Part 11 audit trail that can silently fail is not a Part 11 audit trail. There is also no electronic signature anywhere in PV — grep for 'signature' in server/routes/pharmacovigilance-routes.ts returns nothing, so no case submission, ICSR release or signal closure is e-signed. |
| GxP/CSV validation package and inspection readiness for the PV module | critical | **0** 🔻 | Veeva Vault Safety (vendor IQ/OQ every release, 3x/yr, customer validation package, biennial full revalidation) | 5 | absent — docs/validation/VMP-CORTEX-001-VALIDATION_MASTER_PLAN.md is 408 lines and contains ZERO occurrences of 'pharmacovigilance', 'adverse event', 'ICSR' or 'E2B' (verified by case-insensitive grep). There is no PV validation plan, no IQ/OQ/PQ, no requirements-to-test traceability against ICH E2B(R3), 21 CFR 312.32/314.80 or Part 11, and no supplier audit pack. Unit tests exist for the pure math (server/services/compliance/__tests__/pv-signal-detection.test.ts, pv-signal-screen.test.ts, pv-periodic-scheduler.test.ts, pharmacovigilance-clock.test.ts) but unit tests are not qualification evidence. |
| Reachability — is the capability in the product a user navigates | critical | **1** 🔻 | All five | 5 | client/src/concept2cure/v2/registryModel.ts:116-122 — RAIL_PRIMARY contains exactly five destinations (conversation-thread, projects, communication-center, apps, setup). No PV entry. pv-cockpit and safety-narrative are in shared/constants/ui-surface-registry.ts:622,638 so they surface in the ⌘K palette (Shell.tsx:982-984), which is the only front door. Worse, client/src/concept2cure/v2/surfaces/PvSignal.tsx:187 exports PvSignalPanel that is imported by nothing — it is absent from surfaceViews.ts (which registers only pv-cockpit at :196, safety-narrative at :211 and pharmacovigilance at :195) and BiopharmaSpecialty.tsx:893 carries the comment 'PvSignalPanel placeholder -- not yet ported as a standalone component'. 288 lines of dead signal UI. |
| Production AI shipped for PV case work (not advisory chat) | high | **1** 🔻 | ArisGlobal NavaX (>1M cases processed, >95% accuracy, >30% efficiency, in production) | 5 | server/services/ana/pharmacovigilance.ts and server/services/pharmacovigilance/pharmacovigilance-knowledge.ts (87KB) are advisory knowledge bases; the H.1 narrative is produced by a deterministic template composer (e2b-icsr-composer.ts:210-224 calling composeSafetyNarrative, which by design 'never invents clinical detail'). There is no AI intake, no OCR, no NLP extraction from source documents, no MedDRA auto-coding, no duplicate detection, no case triage model. The deterministic-narrative choice is defensible for audit but it is not the automation competitors are selling against. |
| Single case store of record / data integrity | high | **1** 🔻 | All five | 5 | The module has two disjoint, unreconciled case tables. adverse_events (migrations/20260603_pv_operational.sql:16, TEXT ids) backs /api/pharmacovigilance and the signal board; c2c_sae_cases (db/migrations/20260717_sae_cases_store.sql:8) backs /api/safety-narratives/cases (server/routes/safety-narrative.ts:48-56) and the SafetyNarrative surface. Nothing writes one from the other. A case entered via the API appears in the cockpit KPIs but never in the narrative worklist, and vice versa. The PV migration header itself documents that before 2026-06 the service silently degraded to in-memory because the tables it queried did not exist. |
| External safety data integration (FAERS / MAUDE / EVDAS) | medium | **2** 🔻 | Veeva Safety Signal (EVDAS + literature + internal PV as first-class signal sources) | 5 | server/fda_faers_client.js:88-182 is a real openFDA drug/event client with 24h caching, and server/fda_maude_client.js (364 lines) covers device MAUDE. But server/fda_faers_client.js:274 sets total_reports from apiResponse.results.length — the returned page size (default limit 100), not meta.results.total, which is read separately at :202 and then not used for the count. Every FAERS total surfaced to a user is silently truncated to the page size. No EVDAS integration exists. |

## Where we stand

**Where we win**

- Transparent, citable, deterministic disproportionality statistics. server/services/compliance/pv-signal-detection.ts:1-42 cites Evans 2001 (PRR), Rothman 2004 (ROR) and DuMouchel 1999 (GPS) inline, documents the exact formulas, and explicitly declares at :155-179 that EBGM uses a single-Gamma alpha0=beta0=0.5 prior rather than a full database-wide MGPS fit. Every incumbent's signal math is a black box behind a UI. For a methods-literate QPPV or a statistical reviewer this is a real, if narrow, differentiator — and it is the only dimension where we score 4.
- Fail-closed transmission and audit honesty as an engineering culture artifact. server/services/ind-lifecycle/icsr-gateway-transport.ts:11-19 refuses to fabricate an agency acknowledgement and states why ('the most dangerous lie a pharmacovigilance platform can tell'); non-production receipts are hard-flagged simulated:true. server/routes/pharmacovigilance-board.routes.ts:66,79-83 returns documented nulls for owner/author/reviewers rather than inventing them. This is a diligence positive about the team, not a product advantage — but it is unusual and it will read well to a technical acquirer.
- Multi-region expedited-reporting deadline logic as a pure, tested function across FDA/EMA/PMDA/NMPA/Health Canada with statutory citations (pharmacovigilanceService.ts:258-336), plus a live-recomputed 21 CFR 312.32(c) clock that fails closed rather than showing a stale stored value (server/routes/safety-narrative.ts:60-80). Cleaner and more testable than the equivalent buried inside a commercial rules engine.
- Zero marginal price if PV rides along with the platform's regulatory/CMC/submission modules. Against AB Cube's SME positioning this is the only commercially credible wedge — and only if the intake gap is closed first.

**Where we reach parity**

- Single drug-event-pair disproportionality computation on demand — matches the out-of-the-box signal math in Ennov and AB Cube, though not Empirica or Veeva Safety Signal.
- Automatic 2x2 cross-tabulation of the org's own case data into a ranked signal board (pharmacovigilance-board.routes.ts:133-187) with a defensible n>=3 floor — parity with basic mid-market signal data mining, conditional on cases existing.
- Periodic report deadline scheduling from data-lock points across DSUR/PSUR/PBRER/PADER (pv-periodic-scheduler.ts) — parity with the calendar function of mid-market tools.
- ICH domain knowledge content (E2A/E2B(R3)/E2C(R2)/E2D/E2E/E2F encoded in server/services/ana/pharmacovigilance.ts and the 87KB pharmacovigilance-knowledge.ts) — parity with vendor help systems as reference content, not as product.

**Where we lose**

- Case intake. There is no way for a user to enter a case. Zero client references to POST /api/pharmacovigilance/adverse-events. This alone is disqualifying: a safety database you cannot put a case into is not a safety database, and every downstream number in the UI is structurally zero.
- E2B(R3) conformance. The XML is a bespoke <element id="C.1.1"> projection, not HL7 v3 MCCI_IN200100UV01 (e2b-icsr-composer.ts:276-290); the worldwide unique case id is hardcoded to an invalid 'XX-' country prefix (pharmacovigilanceService.ts:972-977); case ids come from Math.random() (:959-965). Nothing we emit would pass EudraVigilance or FDA ESG validation.
- Gateway transmission. transmitIcsr throws in every configured path (icsr-gateway-transport.ts:189-201). No AS2, no SFTP, no ESG client exists. We cannot submit a single ICSR to any regulator.
- MedDRA and WHODrug. No dictionary is shipped, no loader exists, the reference table is never even created (migrations/20260603_pv_operational.sql:165-167 only conditionally indexes it), and there is no auto-coding. PV is not practicable without a licensed, versioned MedDRA.
- Part 11. The audit write is best-effort and silently returns false on failure (pharmacovigilanceService.ts:1271-1274, called with .catch(()=>false) at :1216); there is no electronic signature on any PV action. Fails an inspection question on day one.
- CSV/validation. The Validation Master Plan contains zero mentions of pharmacovigilance, ICSR or E2B. Veeva ships a customer validation package with vendor-executed IQ/OQ three times a year; we ship nothing.
- Literature monitoring (GVP VI/VIIa) — entirely absent. This is a mandatory PV activity, not a nice-to-have.
- Duplicate case detection — absent. Veeva ships it; every serious safety database has it.
- Signal management workflow — SafetySignal has no owner, no dates, no evidence links, no transitions (pharmacovigilance-board.routes.ts:66 documents the gap in code).
- Aggregate report generation — scheduling and section knowledge exist; DSUR/PBRER authoring, line listings, summary tabulations and cumulative exposure do not.
- Production AI for case work — competitors ship it at scale (NavaX >1M cases at >95% accuracy; IQVIA Detect up to 80% fewer false positives; Veeva Safety.AI MedDRA pre-coding and duplicate detection). We ship advisory chat and a deterministic narrative template.
- Discoverability — PV is not among the five global nav destinations (registryModel.ts:116-122); it is ⌘K-only, and PvSignal.tsx is 288 lines of orphaned dead code.

## Is the advantage durable?

No durable advantage exists in this category — and critically, the one place we score well is the easiest thing on the board for an incumbent to neutralise, because they have already shipped it. Taking the two candidate moats in turn. (1) Transparent disproportionality mathematics: PRR, ROR with CI, Yates chi-squared and EBGM are thirty-year-old published methods (Evans 2001, Rothman 2004, DuMouchel 1999, all cited in pv-signal-detection.ts:20-29). Oracle has shipped Empirica Signal with a full database-wide MGPS fit for two decades — strictly better than our single-Gamma alpha0=beta0=0.5 approximation, a limitation the file honestly declares at :155-179 — and Veeva Safety Signal already runs scheduled and ad-hoc detection across internal PV data, SafetyDocs literature and EMA EVDAS. Our differentiator is not the math, it is that the math is legible; any vendor could publish a methods appendix in one release cycle. Time to close: effectively zero, since it is already closed on capability and the transparency gap is a documentation exercise measured in weeks. (2) Fail-closed transmission and audit honesty (icsr-gateway-transport.ts:11-19): admirable engineering discipline, but it is a property of a module that cannot transmit. It is a positive signal about the team in diligence, not a defensible market position — you cannot sell 'refuses to lie about submissions it cannot make.' Now invert the question, which is the one that matters for an acquisition: how long before WE could close the gap the incumbents hold over US? That is the real clock, and it runs 12-18 months minimum, gated by things money and headcount only partially accelerate — a MedDRA MSSO and WHODrug UMC licence, an FDA ESG and EudraVigilance gateway registration and conformance-test cycle (AB Cube publicises passing China NMPA E2B(R3) testing precisely because it is a hurdle), and a full CSV package that must be authored, executed and defended. Meanwhile the frontier keeps moving away: ArisGlobal projects NavaX from 1M to 2.5M cases by mid-2026 and shipped NavaX Translation to Safety customers in July 2026, Veeva's Safety agents began landing April 2026 with Falcon safety case intake and processing agents targeting late 2026, and IQVIA is building custom AI agents on NVIDIA. The competitive gap in this category is widening faster than it can be closed from a standing start. Underwrite zero PV moat and zero PV revenue; value the signal-statistics and reporting-clock engines as reusable analytics components inside the regulatory platform, not as a pharmacovigilance business.

## Shortest credible path to parity

1. WEEKS 1-4 — Make it reachable and usable, or nothing else counts. Build the case-intake form and case worklist against the already-validated POST /api/pharmacovigilance/adverse-events (server/routes/pharmacovigilance-routes.ts:271-319), and add Pharmacovigilance to RAIL_PRIMARY (client/src/concept2cure/v2/registryModel.ts:116-122) or accept that no evaluator will ever find it. Delete or wire client/src/concept2cure/v2/surfaces/PvSignal.tsx — 288 orphaned lines is a diligence finding by itself. This is the highest-leverage work in the category: it converts an entire backend from structurally-zero to demonstrable.
2. WEEKS 1-4 — Collapse the two case stores. adverse_events (migrations/20260603_pv_operational.sql:16) and c2c_sae_cases (db/migrations/20260717_sae_cases_store.sql:8) are disjoint and unreconciled; pick one as the record of record and migrate the other, or the cockpit and the narrative worklist will permanently disagree about how many cases exist.
3. WEEKS 2-6 — Fix the three identifier defects that make every ICSR invalid regardless of schema: replace the Math.random() UUID generator (pharmacovigilanceService.ts:959-965) with the crypto.randomUUID already imported at :27; make the C.1.8.1 worldwide unique case id a real {ISO country}-{registered sender id}-{case no} instead of the hardcoded 'XX-C2CRI-' (:972-977); and wire POST /api/pharmacovigilance/icsr/generate to composeE2bR3Icsr so the PV module's own ICSR endpoint returns XML rather than a metadata row (:563-630).
4. MONTHS 2-4 — Replace the bespoke projection with real E2B(R3). Generate HL7 v3 MCCI_IN200100UV01 and validate against the published EMA XSD (http://eudravigilance.ema.europa.eu/XSD/multicacheschemas/MCCI_IN200100UV01.xsd) plus the FDA Regional Implementation Guide. Keep the existing gap/completeness gate (e2b-icsr-composer.ts:234-249) — it is good — but make what it gates schema-valid.
5. MONTHS 3-6 — Buy or build a gateway. Either implement FDA ESG AS2 and the EudraVigilance gateway behind the existing transmitIcsr seam (icsr-gateway-transport.ts:160-236, which currently throws at :196-200) or OEM Axway, then wire the already-written parseIcsrAcknowledgment (e2b-icsr-message.ts:143-162) to real ACKs and build submission tracking. Budget an agency gateway registration and conformance-test cycle; AB Cube's China NMPA E2B(R3) test pass is the proof point buyers will ask you to match.
6. MONTHS 3-6 — License MedDRA (MSSO) and WHODrug (UMC), ship an ingest pipeline into meddra_term_reference (which no migration currently creates), and build the twice-yearly version-upgrade and re-coding path. Then add auto-coding on the intake form. This is a hard dependency for every other PV capability and it carries recurring licence cost that must go into the model.
7. MONTHS 4-7 — Make Part 11 real. Convert writePvAudit from best-effort (pharmacovigilanceService.ts:1233-1278, silently returning false at :1271-1274 and swallowed by .catch(()=>false) at :1216) into a transactional write in the same commit as the state change, and add e-signature gating on case submit, ICSR release and signal closure. Reuse the existing recordGovernedAction path the file itself points at (:1229-1231) rather than the PV-local shortcut.
8. MONTHS 5-9 — Produce a PV-scoped validation package: validation plan, URS, functional and design specs, IQ/OQ/PQ protocols and a requirements-to-test traceability matrix against ICH E2B(R3), ICH E2A/E2C(R2)/E2F, 21 CFR 312.32, 21 CFR 314.80 and 21 CFR Part 11. docs/validation/VMP-CORTEX-001-VALIDATION_MASTER_PLAN.md currently mentions none of these. Without this you cannot answer a vendor qualification questionnaire, and Veeva's vendor-executed IQ/OQ-per-release with a customer validation package is the benchmark you are measured against.
9. MONTHS 6-12 — Close the two mandatory functional gaps: literature monitoring (Embase/Medline ingestion, abstract screening, ICSR triage, EMA MLM reconciliation) per GVP Modules VI/VIIa, and probabilistic duplicate case detection. Both are table stakes, not differentiators. Then complete signal management workflow — owner, dates, evidence links, validation/assessment/closure transitions — against the gap the code already documents at pharmacovigilance-board.routes.ts:66.
10. QUICK WIN, DAYS — Fix server/fda_faers_client.js:274, which reports total_reports as the returned page length (default limit 100) instead of meta.results.total read at :202. Every FAERS count shown to a user today is silently truncated. One line, and it removes a demo-killing wrong number.
11. STRATEGIC ALTERNATIVE — recommended. Do not chase parity. Twelve to eighteen months plus MedDRA/WHODrug licences and a gateway certification cycle buys entry to a category where ArisGlobal, Veeva and IQVIA are competing on measured automation at 1M-case scale. Reposition instead: keep the signal-statistics engine and the reporting-clock engine as differentiated analytics that sit ON TOP of the customer's existing Argus or Vault Safety via E2B import, and sell the platform on regulatory submissions where it is actually strong. That preserves the genuinely good code, removes the Part 11/validation exposure, and converts a losing category into an integration.

## Verdict

**🔴 Not competitive** — Score the four things that actually gate a PV purchase and we register 0, 1, 0, 0: no case intake UI, non-conformant E2B(R3) XML, a gateway transport that throws by construction, and a validation master plan with zero PV coverage. A safety database that cannot accept a case, cannot emit schema-valid ICSR XML, cannot transmit to any agency, has no MedDRA dictionary, and has a Part 11 audit trail that silently returns false on failure is not a product a QPPV can buy — it would not survive the first fifteen minutes of a vendor qualification questionnaire, let alone an EMA PV inspection. The signal-detection mathematics is genuinely good (PRR/ROR+CI/Yates chi-squared/EBGM/EB05 with cited literature and an honestly declared approximation, plus real automatic 2x2 cross-tabulation over org data at pharmacovigilance-board.routes.ts:133-187), and the expedited-reporting clock is clean and live-computed — but both compute over a case store nothing can populate. Reachability compounds it: PV is absent from the five-destination global rail (registryModel.ts:116-122), accessible only by ⌘K, and one of the three named surfaces (PvSignal.tsx) is imported by nothing at all. Meanwhile the field has moved decisively past feature parity into measured automation — ArisGlobal NavaX is in production on >1M cases at >95% accuracy, IQVIA Detect claims up to 80% fewer false positives, Veeva ships multilingual MedDRA coding plus duplicate detection and validates every release itself three times a year — so even a fully-built version of what is here would be arriving two product generations late. The correct read for an acquirer is that this is a competent PV statistics library and reporting-clock engine wearing the label of a PV platform. Do not underwrite any PV revenue in the model, and do not let the presence of pharmacovigilanceService.ts, an E2B composer and an ICSR gateway module in the file tree be mistaken for a shipping safety system — they are, respectively, a CRUD layer, a non-conformant XML serializer, and a module whose only runtime behaviour is to throw.
