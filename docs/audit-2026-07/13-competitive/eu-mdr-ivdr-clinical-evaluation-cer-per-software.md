# EU MDR / IVDR clinical evaluation (CER / PER) software

> **Verdict: 🔴 Not competitive**
> Weighted capability score — **us 1.8 / 5** vs **best competitor 4.3 / 5** across 13 dimensions.

**Full category as scoped:** EU MDR / IVDR clinical evaluation (CER / PER) software

## Who buys, and what they are actually buying

VP/Director of Regulatory Affairs or Head of Clinical Evidence at a Class IIa–III device or Class B–D IVD manufacturer (or the RA consultancy/CRO writing on their behalf). They are not buying "documents" — they are buying a defensible, audit-survivable clinical evidence chain that clears a Notified Body technical documentation review under MDR 2017/745 Annex XIV / IVDR 2017/746 Annex XIII on the first or second cycle, and that can be re-run annually for PMS/PMCF/PSUR updates without re-doing the literature work. The purchase is justified against a hard alternative: outsourcing the CER to a consultancy at roughly EUR 150k–1M+ per Class IIb/III device over 8–24 months (qmedify.com), against a total MDR certification cost of roughly EUR 200k–600k per device (SNITEM data via meddeviceguide.com). Budget sits in RA/Clinical, not IT. Procurement gates on three things in order: (1) does the literature search-and-appraisal survive an auditor, (2) is the system validated (Part 11 / Annex 11 / CSV package + vendor audit), (3) does it reduce medical-writer hours. Feature novelty is a distant fourth.

## Market structure

Market structure. This category has an unusual shape: the dominant incumbent is not a software vendor at all, it is the consultancy. Manufacturers are highly likely to outsource CER development to specialist consultants given the cost and time involved, so every software deal is displacing a services line item rather than another tool. That sets the value anchor high and the switching bar high at the same time — the buyer is comparing your platform against a firm that will simply hand them a finished, signed CER.

Deal size and pricing. Class IIb/III CERs typically cost EUR 150k–1M+ and take 8–24 months (qmedify.com). Total MDR certification per device runs roughly EUR 200k–600k on SNITEM data, with a range from about EUR 8k for a simple Class I device to over EUR 600k for a Class III requiring clinical investigations (meddeviceguide.com, medenvoyglobal.com). Where MDD accepted literature reviews, MDR frequently demands clinical investigations or PMCF studies, adding USD 36k–120k or more. Four of the five competitors publish no pricing at all — only CiteMed exposes a public pricing page with usage-based billing and no per-user charge on Freelancer tiers (citemed.io/pricing). Practical read: platform ACVs in this category are anchored somewhere between a single outsourced CER and a fraction of it, sold per-product-family or per-seat, with the compelling pitch being amortisation across the annual PMS/PMCF/PSUR re-issue cycle rather than one-time report cost.

Segmentation. The five split cleanly into three groups, and a real RFP usually contains one from each. (1) Document suites — Celegence CAPTIS, CiteMed — sell the whole EU documentation family (CER, PER, PMS, PSUR, SSCP) and typically attach services. (2) Evidence infrastructure — DistillerSR, Nested Knowledge — sell the validated, auditable literature spine and leave authoring to someone else; DistillerSR claims use by more than 80% of the largest pharma and medical device companies. (3) AI-native whole-document challengers — Vespper — sell the integrated outcome but are the least publicly verifiable on viability, validation and AI governance. Concept2Cure.RI is architecturally in group 3 while its shipped literature capability is below group 2's floor.

What actually decides the deal. MDCG 2020-13 is the template Notified Bodies use to assess a CER, and it defines expectations for clinical evidence sufficiency, benefit-risk conclusions and PMCF integration; MDCG 2020-6 governs sufficient clinical evidence for legacy devices. Vendors are increasingly evaluated on whether their output survives that specific template. The pain is real and quantified: roughly 40% of medium-risk and 45% of high-risk device manufacturers report inconsistencies in the amount of clinical data accepted by notified bodies (PMC10276779). That inconsistency is precisely the gap a Notified Body simulator addresses — which is why our cer-auditor.ts is strategically well-aimed even though the surrounding product is not ready.

Consolidation. Clarivate is actively rolling up adjacent regulatory and literature assets — Dialog Solutions in Aug 2023 (MDR literature review search, PV literature monitoring) and Global QMS in Apr 2024 (automated regulatory reporting and compliance management). Note carefully: no acquisition of DistillerSR by Clarivate was found in public sources — DistillerSR appears to remain independent, and any claim otherwise is not verified. Rimsys is consolidating the adjacent MedTech RIM layer, claiming 6 of the top 12 global MedTech manufacturers, a KPMG partnership from Mar 2025, and a Spring 2026 release embedding submission authoring and AI-powered regulatory monitoring — a credible future entrant into clinical evaluation from the RIM side, and the most likely acquirer-or-competitor to watch. The strategic implication for a buyer of this asset: the CER category is being pulled into larger regulatory platforms from two directions (evidence infrastructure and RIM), so a point CER tool with no literature engine and no validation package has a narrowing window to matter on its own.

Sources: qmedify.com/articles/clinical-evaluation-report-for-medical-devices; meddeviceguide.com/blog/ce-marking-cost-medical-devices-guide; medenvoyglobal.com/blog/whats-the-cost-of-medical-device-approval-in-europe; citemed.io/pricing; distillersr.com/industries/medical-devices; mdxcro.com/mdcg-2020-13-for-medical-device-manufacturers; pmc.ncbi.nlm.nih.gov/articles/PMC10276779; clarivate.com/news/clarivate-acquires-global-qms-inc-expanding-life-sciences-healthcare-segment-into-new-markets; rimsys.io/blogs/rimsys-becomes-the-trusted-regulatory-partner-for-6-of-the-top-12-global-medtech-manufacturers; businesswire.com/news/home/20260505903088/en/Rimsys-Launches-the-Regulatory-Execution-Engine-for-MedTech; grandviewresearch.com/industry-analysis/regulatory-information-management-rim-system-market-report

## The five closest competitors

### Celegence — CAPTIS / CAPTIS Copilot — CAPTIS (cloud MDR/IVDR compliance and medical-writing platform) with the CAPTIS Copilot GenAI layer, sold both as software and bundled with Celegence's own medical-writing service

The purpose-built MDR/IVDR document factory. Positions as end-to-end CER/PER/PMS/PSUR/SSCP authoring with integrated literature search, structured extraction and an embedded citation manager, backed by in-house SMEs (physicians, PhDs, engineers). Public claim of MDR-compliant CER delivery in as few as 6 weeks. This is the vendor a buyer most often names in the same sentence as a CER RFP.

**Strengths**

- Scope covers the whole EU device documentation family (CER, PER, PMS, PSUR, safety reports, SSP/SSCP), not just literature — the closest thing in the market to a single-vendor answer
- Copilot is a shipped enterprise product (announced Aug 2023), built on pre-trained LLMs plus RLHF specifically for the device/diagnostic industry, not a generic wrapper
- Integrated literature module with automated retrieval and screening against PubMed and Google Scholar plus embedded citation management — auditability is preserved through the citation chain
- Software-plus-services model de-risks the buy: the customer can start as a writing engagement and convert to platform, which is how most CER budgets are actually released
- Celegence dogfoods it — their own medical-writing team runs PMS documentation on Copilot, which is a credible proof point in NB conversations

**Weaknesses**

- Pricing is entirely opaque; no public list price, no per-seat or per-report figure — every deal is a negotiated enterprise contract, which slows procurement
- No public 21 CFR Part 11, SOC 2, or ISO 27001 attestation found in searchable sources — not verified either way, which means the buyer's CSV team has to run a full vendor audit
- The services attachment is a strength commercially and a weakness architecturally: heavy reliance on human SMEs caps the automation ceiling and keeps marginal cost per CER high
- Literature source coverage as publicly described leans on PubMed and Google Scholar; Embase/Cochrane coverage depth is not verified, and NB assessors probe database justification hard
- No published quantitative validation of the AI (recall/precision on screening) comparable to what the SLR-native vendors disclose

| | |
|---|---|
| AI shipped today | Shipping. CAPTIS Copilot is an enterprise cloud platform using pre-trained LLMs with Reinforcement Learning from Human Feedback, targeted at device and diagnostic manufacturers. Publicly claimed average saving of 13 hours 16 minutes via the AI-powered systematic literature review module with automated data extraction. Applied to scientific literature summaries, clinical evaluations, safety reports and summary-of-safety-and-performance documents. |
| GxP / validation posture | Not verified. Marketing uses 'audit-ready' and 'MDR/IVDR compliance' language and describes audit-trail/traceability intent, but no public 21 CFR Part 11, EU Annex 11, SOC 2 or ISO 27001 certification statement was found. A buyer must assume a full vendor qualification and CSV effort. |
| Pricing signal | Not public. Enterprise negotiated. The adjacent service anchor is the outsourced-CER market: EUR 150k–1M+ per Class IIb/III CER. |

<details><summary>Sources</summary>

- https://www.celegence.com/technology/mdr-ivdr-compliance-tool-captis/
- https://www.celegence.com/clinical-evaluation-report-cer-template-captis-mdr/
- https://www.businesswire.com/news/home/20230801665651/en/Celegence-Launches-CAPTIS-Copilot-the-Most-Advanced-AI-Compliance-Solution-for-Device-and-Diagnostic-Manufacturers
- https://www.celegence.com/audit-ready-cers-captis-eu-mdr-compliance-tools/
- https://www.celegence.com/services/clinical-evaluation-reports-cer/
- https://www.celegence.com/how-ai-is-transforming-cer-development-for-medical-devices-ivds/
- https://www.celegence.com/responsible-ai-clinical-evaluation-reports-eu-mdr/

</details>

### DistillerSR — DistillerSR literature review platform + DistillerSR AI (Smart Evidence Extraction / SEE) + DistillerSR Agentic AI

The incumbent system-of-record for the literature spine of a CER. Does not claim to be a CER authoring tool end-to-end; claims to be the auditable, validated evidence layer that CERs, State-of-the-Art reports, 510(k) summaries, PSURs and PMCF plans are built on. Public claim: used by more than 80% of the world's largest pharmaceutical and medical device companies. This is the vendor that wins on the auditor's question, not the writer's question.

**Strengths**

- Explicit public compliance posture: 21 CFR Part 11, EU Annex 11, and NIST AI standards — the only one of the five with a clearly stated regulated-systems claim, which collapses the buyer's CSV risk
- Provenance to the cell level: the platform tracks all review activity so the origin of every extracted data point is inspectable — precisely what a Notified Body assessor asks for under MDCG 2020-13
- Deep installed base in medtech RA (>80% of the largest device companies) means reference calls are easy and the tool is already in the auditor's mental model
- Published outcome data: a case study claiming 30% reduction in CER time, and up to 70% reduction in screening time supporting timely PSUR/PMCF delivery
- AI is current and shipping in layers, not roadmap: Agentic AI launched Sep 2025, and new fully automated Smart Evidence Extraction capabilities launched 8 Apr 2026 — this vendor is not standing still
- SEE keeps human governance over AI-generated output while offering a fully automated mode, which is the exact human-in-the-loop shape MDCG/NB reviewers expect

**Weaknesses**

- It is a literature/evidence-synthesis platform, not a CER document generator — the buyer still needs a writing layer, so DistillerSR is frequently bought alongside a consultancy or a second tool, raising total cost
- No GSPR (Annex I) conformity matrix, no equivalence assessment framework, no PMS/PMCF/PSUR lifecycle object — the regulatory scaffolding around the literature is out of scope
- Priced and sold as an enterprise research platform; pricing is not public and seat-based licensing can be awkward for small RA teams doing 2–5 CERs a year
- Generic across pharma and medtech; the EU-MDR-specific opinionation (MEDDEV 2.7/1 rev 4 appraisal weighting, Annex XIV section order) is thinner than the device-only specialists
- No vigilance/postmarket database integration (EUDAMED, MAUDE) as part of the core evidence pipeline

| | |
|---|---|
| AI shipped today | Shipping and the most advanced of the five. DistillerSR AI combines traditional AI and GenAI. Smart Evidence Extraction finds, suggests, explains, extracts and links supporting evidence within a reference, in both human-in-the-loop and fully automated workflows, with full auditability. Agentic AI (launched Sep 2025) exposes a validated organization-wide evidence source to agents. April 2026 release added fully automated SEE. GenAI drafting of device safety-profile comparisons against equivalent devices is claimed to cut manual writing burden by up to 70%. |
| GxP / validation posture | Strongest publicly stated of the five. Maintains compliance with FDA 21 CFR Part 11, EU Annex 11, and NIST AI standards; built-in automation and validation tools; full activity tracking so the provenance of every cell of extracted data is viewable. Specific IQ/OQ/PQ package contents and SOC 2 status not verified from public sources. |
| Pricing signal | Not public. Enterprise subscription. Value anchor is the published 30% CER cycle-time reduction and up to 70% screening-time reduction. |

<details><summary>Sources</summary>

- https://www.distillersr.com/industries/medical-devices
- https://www.distillersr.com/products/distillersrai
- https://www.distillersr.com/resources/case-studies/distillersr-reduces-clinical-evaluation-report-time-by-30
- https://www.pharmiweb.com/press-release/2026-04-08/distillersr-launches-the-industrys-most-advanced-genai-capabilities-for-extracting-scientific-liter
- https://www.accessnewswire.com/newsroom/en/healthcare-and-pharmaceutical/distillersr-launches-first-of-its-kind-agentic-ai-capabilities-to-eli-1074366
- https://www.businesswire.com/news/home/20241118159269/en/DistillerSR-Launches-Industrys-First-Purpose-built-GenAI-Solution-for-Literature-Reviews

</details>

### CiteMed — CiteMed clinical evidence and literature review platform, plus CER/PMS writing services and a PMCF survey module

The medtech-only specialist. Narrower than Celegence, more opinionated than DistillerSR: evidence management purpose-built for EU MDR, IVDR and FDA device submissions, covering CER, PMS, PMCF, PSUR and vigilance reports. Sells a hybrid — software for teams that write in-house, and an end-to-end owned service (literature review, writing, revisions, final deliverable) for teams that do not.

**Strengths**

- Only vendor of the five with a public, self-serve pricing page and a usage-based model — 'pay when you use the software to review', no charge for additional users on Freelancer tiers — which is a real procurement advantage for small and mid-cap manufacturers
- Device-regulation-native scope end to end: CER, PMS, PMCF, PSUR and vigilance in one place, aligned to MDR/IVDR/FDA rather than to generic systematic review
- Full audit trail: every interaction is captured and logged, giving the documented evidence trail MDR/IVDR inspections require
- Concrete SLR mechanics that survive audit: automatic duplicate detection by DOI, PMID and title with optional manual validation; centralized source repository with tags, statuses and selection history
- PMCF survey creation, distribution, scheduling and automated reminders is a genuinely differentiated module — most competitors stop at literature and leave PMCF data collection to a separate tool
- MEDDEV 2.7/1 rev 4 compliant automated literature search is explicitly claimed, which is the methodology NB assessors actually cite

**Weaknesses**

- Smallest vendor of the five; concentration/continuity risk is a live procurement objection for a Class III manufacturer with a 10-year technical-documentation retention obligation
- No public 21 CFR Part 11 certification, no CSV/IQ-OQ-PQ package, no SOC 2 or ISO 27001 statement found — not verified
- AI capability is the least specified of the five: automation and screening are described, but no named GenAI product, no published recall/precision, no AI-disclosure documentation
- The services arm competes with the software arm — a buyer wanting pure tooling may find the roadmap biased toward the managed-service motion
- No GSPR conformity matrix or MDR equivalence framework; the regulatory scaffolding beyond literature and PMCF is thin
- Pricing transparency is partial: tiers are described but per-report cost is still gated behind a sales conversation

| | |
|---|---|
| AI shipped today | Automation-heavy rather than demonstrably GenAI-heavy as of 2026. Automated literature search and retrieval, automatic deduplication by DOI/PMID/title, screening workflow and status tracking. No named large-language-model product, no published model validation, and no AI transparency documentation found. Treat AI depth as not verified relative to DistillerSR or Celegence. |
| GxP / validation posture | Partial and self-asserted. Full audit trail with every interaction logged, decision-process tracking, and inspection-readiness framing for clinical evaluation, PMS and PMCF. No public Part 11 / Annex 11 certification, no validation package, no security attestation verified. |
| Pricing signal | Most transparent of the five. Public pricing page at citemed.io/pricing with usage-based billing ('only pay when you use the software to review') and no per-user charges on Freelancer tiers. Exact per-report figures still require contact. |

<details><summary>Sources</summary>

- https://citemed.com/
- https://citemed.com/literature/
- https://citemed.com/automated-literature-review-roi-eu-mdr-ivdr/
- https://citemed.com/pmcf-surveys-solution/
- https://citemed.io/pricing/
- https://citemed.com/eu-mdr-clinical-evaluation-reports-cers-writers/
- https://citemed.com/eu-mdr-literature-search/

</details>

### Nested Knowledge — AutoLit — AutoLit evidence-synthesis SaaS with Smart Search and Robot Screener AI modules; published CER demonstration nests

The AI-native evidence-synthesis challenger with the most scientifically honest AI posture in the category. Compresses search, screening, tagging, extraction and critical appraisal into one connected workflow. Not marketed as an MDR compliance suite, but explicitly demonstrated on device CER work — they publish a 'Clinical Evaluation Report: Aspiration Catheter' demo nest.

**Strengths**

- Publishes quantitative AI validation studies — Smart Search, an LLM chain-of-thought reasoning agent that builds Boolean strings, validated at over 75% recall against Cochrane and in-system SLRs; Robot Screener, an ML second-reviewer replacement in dual screening, at up to 97% recall in internal studies. No other vendor in this set publishes numbers a Notified Body can interrogate
- Publishes formal AI disclosure and AI-systems documentation — directly addresses the EU AI Act and MDCG expectations around responsible AI use in clinical evaluation, and pre-empts the NB question 'how do you know your AI did not miss studies'
- Robot Screener replacing the second human reviewer in dual screening is the single highest-leverage cost reduction in a CER literature workflow, and it is defensible because the recall is measured
- Critical appraisal is inside the workflow, not bolted on — matches MEDDEV 2.7/1 rev 4 appraisal expectations better than pure screening tools
- Genuinely modern architecture and a fast release cadence; strong fit for a buyer who wants an AI-forward tool without vendor hand-waving

**Weaknesses**

- Not a CER product. No CER document generation, no GSPR matrix, no equivalence assessment, no PMS/PMCF/PSUR lifecycle, no vigilance integration — the buyer gets a superb literature engine and nothing else
- 21 CFR Part 11 compliance, audit-trail-for-regulated-records posture, and validation package contents are not publicly documented and could not be verified — a serious gap for a GxP buyer, and the exact dimension where DistillerSR beats them
- Positioned across academic/clinical evidence synthesis broadly; medtech regulatory affairs is a segment, not the whole company, so MDR-specific opinionation is shallow
- Pricing not public; sales-gated via sales@nested-knowledge.com
- Smaller commercial footprint in device RA than DistillerSR; fewer NB-facing reference customers

| | |
|---|---|
| AI shipped today | Shipping, and the most transparently validated. Smart Search is a human-in-the-loop LLM reasoning agent generating Boolean search strategies (>75% recall vs Cochrane and in-system SLRs). Robot Screener is an ML classifier that replaces the second reviewer in dual screening (up to 97% recall, internal studies). Both are accompanied by published validation-study and AI-disclosure documentation. |
| GxP / validation posture | Not verified for GxP. Strong scientific/AI validation documentation, but no public 21 CFR Part 11 statement, no CSV/IQ-OQ-PQ package, no audit-trail-for-electronic-records attestation found. This is the inverse of most competitors: model validated, system not demonstrably validated. |
| Pricing signal | Not public. Subscription; pricing page directs to sales@nested-knowledge.com. |

<details><summary>Sources</summary>

- https://about.nested-knowledge.com/docs/validation-studies-of-ai-tools-in-nested-knowledge/
- https://about.nested-knowledge.com/docs/artificial-intelligence-in-nested-knowledge/
- https://about.nested-knowledge.com/docs/disclosure-of-ai-systems-in-nested-knowledge/
- https://about.nested-knowledge.com/pricing/
- https://about.nested-knowledge.com/docs/demo-nests/
- https://about.nested-knowledge.com/docs/autolit/

</details>

### Vespper — AI Clinical Evaluation Report Generator (medtech/biotech use case)

The closest structural analogue to what Concept2Cure.RI is attempting: an AI-native platform that connects clinical data, literature and post-market surveillance records into structured, traceable, EU MDR-compliant CERs. Sells the whole-document outcome rather than the literature substrate. This is the competitor that most directly contests our intended wedge.

**Strengths**

- Whole-CER framing — connects three evidence streams (clinical data, literature, PMS records) into one traceable report, which is exactly the integration story buyers want and which DistillerSR and Nested Knowledge explicitly do not sell
- Traceability is the headline claim, not an afterthought — aligns with the MDCG 2020-13 assessment posture where NB reviewers follow evidence from conclusion back to source
- Correctly frames the regulatory context in its own materials: EU MDR 2017/745 clinical evaluation is mandatory for every class from I to III, and the CER is required technical documentation under Annex II — indicating real domain grounding rather than generic AI marketing
- AI-native architecture with no legacy services business to protect, so automation ceiling is higher than Celegence's or CiteMed's
- Smallest switching friction for a greenfield buyer who has never bought a CER tool

**Weaknesses**

- Almost nothing about the company is publicly verifiable — funding, headcount, customer count, and pricing all returned nothing in search. For a system holding technical documentation subject to a 10-year retention obligation, unverifiable vendor viability is a hard procurement blocker
- No 21 CFR Part 11, Annex 11, SOC 2, ISO 27001, or CSV/validation-package evidence found — not verified
- No published AI validation: no recall/precision on screening, no AI disclosure documentation, no model governance statement. Against Nested Knowledge's published numbers this is a losing position in a technical evaluation
- No evidence of GSPR conformity matrix, MDR equivalence assessment (Art 61(4) / Annex XIV Part A §3), or PMS/PMCF/PSUR lifecycle objects
- No named Notified Body reference or case study found — in a category where NB acceptance is the whole point, absence of NB-facing proof is telling

| | |
|---|---|
| AI shipped today | Shipping per its own product page — an AI CER generator that connects clinical data, literature and PMS records into structured traceable CERs for EU MDR. Model family, provider, human-in-the-loop design, and any validation are all not verified from public sources. |
| GxP / validation posture | Not verified. No public GxP, Part 11, CSV, or security posture statement located. |
| Pricing signal | Not public. No funding or deal-size signal located. |

<details><summary>Sources</summary>

- https://www.vespper.com/use-cases/medtech-biotech/ai-clinical-evaluation-report-generator

</details>

## Capability rubric

Our score is cited to `file:line` in this repository. Theirs is cited in the competitor sections above. Scored on what **ships and is reachable**, not what is architected — an unreachable or unvalidated capability scores low regardless of code quality.

| Dimension | Weight | Us | Best competitor | Their score | Our evidence |
|---|---|:--:|---|:--:|---|
| Systematic literature review engine wired into CER (query build → multi-database search → dedup → dual screening → PRISMA counts) | critical | **1** 🔻 | DistillerSR | 5 | server/services/cerGenerationService.ts:545-552 — literatureReview is a hardcoded shell {searchStrategy:'Systematic literature search conducted', databases:['PubMed','EMBASE','Cochrane'], results:[]}; no search is executed. server/routes/cerv2-ai-routes.ts:164-167 — the 'dataset'/'search_strategy' CER section is a template string containing literal '[DATE RANGE]' and '[N] articles' placeholders. No literature-search service is imported by any CER route; server/services/research-intelligence/runLiteratureSearch.ts is referenced only by routeEvidenceRequest.ts:2 and never by CER code. |
| Literature appraisal and evidence weighting per MEDDEV 2.7/1 rev 4 Appendix A5/A6 (scientific validity, relevance, methodological quality, contribution weighting) | critical | **1** 🔻 | DistillerSR | 5 | server/routes/cerv2-ai-routes.ts:169-172 — the entire appraisal capability is one boilerplate sentence ('Each identified study was appraised per MEDDEV 2.7/1 rev. 4 criteria: scientific validity, relevance to the device, and methodological quality.'). No appraisal data model, no per-study scoring, no weighting algorithm, no appraisal table generator anywhere in server/services/cer/ or server/routes/cer-routes.ts. |
| GSPR (Annex I) conformity matrix with per-requirement status, applicability, and evidence linkage | critical | **2** 🔻 | Celegence CAPTIS | 4 | Split verdict. IVDR side is real: server/routes/ivdr-routes.ts:1027 defines all 23 IVDR Annex I GSPRs across Chapters I–III; :1060-1105 creates the assessment with per-requirement status/evidenceLinks/notes; :1151 updates a single requirement; :1213-1279 returns a chapter-grouped compliance matrix with rollups and an overall compliance percentage. MDR side is fabricated: server/services/cerGenerationService.ts:566-613 (generateGeneralRequirements / generateDesignRequirements / generateInformationRequirements / generateClinicalRequirements) emits five hardcoded items numbered 'ER 1/2/3/13/14' — the superseded MDD 93/42/EEC Essential Requirements vocabulary, not MDR Annex I GSPRs — each with conformity hardcoded to 'Conforms' and evidence hardcoded to a generic string, regardless of input. client/src/concept2cure/mdx/data/cer.ts:81-110 holds a correct 23-row MDR GSPR array but it has zero consumers (verified: no file outside data/cer.ts imports CER_GSPR). |
| Equivalence assessment framework (MDR Art. 61(4) / Annex XIV Part A §3 — technical, biological, clinical characteristics with data-access justification) | critical | **1** 🔻 | Celegence CAPTIS | 4 | client/src/concept2cure/mdx/data/cer.ts:136-172 defines CER_EQUIV_MATRIX across Technical/Biological/Clinical dimensions — correct MDR shape, but it is a hardcoded fixture for a fictional device and has zero consumers. The only live equivalence endpoint, server/routes/cerv2-ai-routes.ts:354 POST /equivalence, implements FDA 510(k) substantial equivalence to a predicate (template at :114-117 reads '[DEVICE NAME] is substantially equivalent to [PREDICATE DEVICE] ([PREDICATE K])'), which is a different legal test from MDR equivalence and cannot be used for an Annex XIV Part A §3 claim. |
| Postmarket / vigilance data integration for devices (EUDAMED, MAUDE, national competent-authority databases, complaint handling) | critical | **1** 🔻 | CiteMed | 4 | server/routes/cer-routes.ts:103 — the CER module's only live vigilance integration queries https://api.fda.gov/drug/event.json (FAERS, the FDA *drug* adverse-event database) keyed by NDC code. FAERS/NDC is a pharmaceutical pharmacovigilance source and is the wrong database for a medical-device CER; the correct source is MAUDE plus EU vigilance. A working MAUDE client exists in the codebase (server/services/ana/AnaToolExecutor.ts:18 imports fda_maude_client, executor at :1424-1459) but is never imported by any file under server/routes/cer*.ts or server/services/cer*. No EUDAMED integration exists; client/src/concept2cure/mdx/data/cer.ts:36-44 shows 'Eudamed' as a signal source only in fixture data. |
| PMS / PMCF / PSUR lifecycle linkage (MDR Arts. 83–86, Annex XIV Part B) — plans, surveys, trend reporting, periodic re-issue | high | **1** 🔻 | CiteMed | 5 | server/routes/cerv2-ai-routes.ts:177-180 — PMS is one boilerplate sentence asserting that plans 'have been established'. client/src/concept2cure/mdx/data/cer.ts:176-234 defines CER_PMS_KPIS, CER_PMS_COMPLAINTS, CER_PMCF_STUDIES and CER_PMS_TIMELINE with correct regulatory shape (including an Article 88 trend-report row), but all four are hardcoded fixtures with zero consumers. No PMS/PMCF data model, no survey capability, no PSUR generator, no periodicity scheduler in the CER module. |
| Reachable, task-complete CER workspace — a front door a regulatory writer can find and finish a CER in | critical | **1** 🔻 | Celegence CAPTIS | 5 | client/src/concept2cure/v2/registryModel.ts:116-122 — RAIL_PRIMARY, the global navigation, contains exactly 5 entries (Chats, Projects, Communication Center, Apps, Settings) against 100 surfaces registered in client/src/concept2cure/v2/surfaceViews.ts. registryModel.ts:140 places 'device-cer' in NAV_HIDDEN, demoted from the rail in the HEAD commit itself (3276b878, 2026-07-28); it is reachable only via ⌘K or deep link. The surface it lands on, client/src/concept2cure/mdx/surfaces/CerSurface.tsx, is 374 lines rendering three panels (signals, literature buckets, export checklist); its own header comment at :5-7 states the 7-tab CerWorkbench (Equivalence / GSPR / Lit corpus / Signals / PMS / Generator) 'is not present in this kit drop' — verified: no CerWorkbench file exists anywhere in client/. The 'Apps' rail entry is a module-subscription catalog (client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx via surfaceViews.ts:127), not a surface launcher. Decisively: zero frontend files call /api/cer/* — the entire CER backend (POST /api/cer/mdr/generate, GET /api/cer/mdr/:id/validate, /api/cer/reports, /api/cer/faers/*) has no UI caller. The registry's own note at shared/constants/ui-surface-registry.ts:362 admits 'Dashboard only today.' |
| GxP / CSV / 21 CFR Part 11 validation posture (audit trail, e-signature manifestation, IQ/OQ/PQ package, vendor-audit readiness) | critical | **2** 🔻 | DistillerSR | 5 | Real but incomplete. Audit trail is genuine: server/services/cerGenerationService.ts:35 imports auditService, with logAction calls at :210-215, :346, :427. Governed export is genuine and better than most AI-native rivals: server/routes/cerv2-export-routes.ts:118-167 implements a human-review gate (403 HUMAN_REVIEW_REQUIRED, enforced by default in production per :129-134) plus AI-generated / reviewer / review-timestamp response headers; server/routes/cerv2-sections.ts:538 records a Part 11 trail on accept-ana-draft. Missing: no 21 CFR Part 11 §11.50/§11.70 electronic-signature manifestation anywhere in the CER path; no IQ/OQ/PQ protocols or CSV package for the CER module (the only validation artifact in the repo is docs/validation/VMP-CORTEX-001-VALIDATION_MASTER_PLAN.md, which does not cover CER); no SOC 2 or ISO 27001 evidence. |
| AI that ships for CER drafting, with provenance and human-in-the-loop governance | high | **3** 🔻 | DistillerSR | 5 | Genuinely working and the second-best thing we have. server/routes/cerv2-ai-routes.ts:186-265 (generateWithRAG) performs tenant-scoped RAG retrieval via ragRouter against the rag_chunks corpus with reranking, then routes to the AI gateway with Claude primary (taskType 'document_drafting', temperature 0.3), returning ragSources for provenance and degrading to a template only on failure. Section-level accept-with-audit exists at server/routes/cerv2-sections.ts:547. Endpoints: /suggest, /equivalence, /benefit-risk, /analyze-section, rate-limited at :41-42. Ceiling: the fallback templates it degrades to (:155-183) are unfillable boilerplate containing literal '[N]' and '[DATE RANGE]' tokens, and no AI validation (recall/precision) is published. |
| Notified Body review simulation / deficiency prediction against MDCG 2020-13 CEAR expectations | high | **4** 🔺 | Celegence CAPTIS | 1 | Our single clear win, and it is reachable. server/services/ana/intelligence-questions/war-game/auditors/cer-auditor.ts is 875 lines implementing 25 audit rules (verified count of 'id: rid(' occurrences), each phrased as a question a Notified Body assessor would ask under EU MDR 2017/745 and citing the specific provision — e.g. the device-identification rule at :46-60 cites Annex XIV Part A Section 1 and returns severity 'critical'. Registered at war-game/auditors/index.ts:12 (createCerAuditor), executed via server/services/ana/AnaToolExecutor.ts, and rendered in the UI at client/src/concept2cure/components/ana/ChatView.tsx:236-241 (warGameReport) — reachable from 'Chats', which is RAIL_PRIMARY entry #1. Supporting depth: server/services/ana/intelligence-questions/flows/cer-report.ts is 2058 lines. Capped at 4 because it audits interview answers, not the actual CER artifact. |
| Deterministic conformance / completeness validation of the produced CER | medium | **3** | Celegence CAPTIS | 3 | server/services/cer/cerConformanceValidator.ts:69-160 runs 10 checks (9 mandatory, 1 recommended) against actual stored report content, correctly branching MDR Annex XIV Part A vs IVDR Annex XIII references at :72-74 and :112-137, and fails closed. Its own docstring at :12-16 honestly scopes itself as structural completeness only, explicitly not scientific adequacy. Backed by passing tests — 25/25 green across server/services/cer/__tests__/unified-cer-service.failclosed.test.ts and the IVDR PER suite. Capped at 3 because 10 presence checks is a section-existence test, not conformance: a CER can pass all 10 with fabricated content. |
| IVDR Performance Evaluation (Annex XIII: scientific validity / analytical performance / clinical performance) and IVDR technical-file assembly | high | **3** 🔻 | Celegence CAPTIS | 4 | Our deepest real asset, and mostly unreachable. server/routes/ivdr-routes.ts is 1610 lines: Annex VIII classification (:175), analytical validations with parameter history (:380-596), clinical evidence with results and history (:597-811), CDx workflows (:812-968), the 23-GSPR checklist and matrix (:1060-1279), submission-package build (:1307) and EUDAMED export (:1451). server/routes/ivdr-binder-routes.ts adds 1016 lines of claim → evidence → approve/revoke governance with pack readiness, build jobs and artifact hashing, plus a background worker started at server/bootstrap/register-regulatory-routes.ts:199. Reachability is the cap: only the classification/validation/clinical-evidence/GSPR-matrix slice has a UI (client/src/concept2cure/mdx/surfaces/IvdSurface.tsx:63-65 via hooks/useIvd.ts), and that surface sits behind 'device-diagnostics', also in NAV_HIDDEN (registryModel.ts:141). The binder and pack builder have zero frontend consumers (verified: no client file references /api/ivdr/binder or /packs). The Annex XIII PER pillar scorer, server/services/regulatory/ivdr-performance-evaluation.ts, is 70 lines scoring 10 boolean flags and is called only from server/routes/udi-ivdr.ts:81 and a demo script. |
| Output fidelity — MDCG 2020-13 / Annex XIV section order, PRISMA flow diagram, appraisal tables, GSPR traceability annex in the delivered document | high | **2** 🔻 | Celegence CAPTIS | 5 | server/routes/cerv2-export-routes.ts:268-331 (PDF) and :334+ (DOCX) render whatever the ProseMirror editor holds through renderCombinedPdf, then persist a governed artifact with CTD placement resolved at :168-172 (CER → m5.0). The CER style pack, server/export/stylePacks/cer_mdr_v1.html, is 19 lines — a header/footer carrying the string 'Annex XIV • MEDDEV 2.7/1 rev. 4', not a section-structure template. There is no PRISMA flow-diagram generator, no literature appraisal table generator, and no GSPR traceability annex in the export path. The governed-artifact chain and the human-review gate are real strengths here; the regulatory document structure is not. |

## Where we stand

**Where we win**

- Notified Body review simulation. server/services/ana/intelligence-questions/war-game/auditors/cer-auditor.ts ships 25 rules written as Annex XIV-cited assessor questions with severity grading, registered in the auditor index and rendered in the ANA chat UI (ChatView.tsx:236-241) — which is the #1 entry in the 5-item global nav. None of the five competitors ships anything comparable; they all optimize the writing side and leave the reviewer's side to consultants. This is the only capability in the category where we are ahead and reachable at the same time.
- Export governance chain. cerv2-export-routes.ts:118-167 enforces a human-review gate that returns 403 HUMAN_REVIEW_REQUIRED by default in production, stamps AI-generated / reviewer / review-timestamp headers, and persists a governed artifact with CTD placement. Against the AI-native challengers (Vespper, and Nested Knowledge on the GxP axis) this is a stronger shipped answer to 'how do you stop an AI-drafted CER reaching a Notified Body unreviewed' than anything they publish.
- IVDR technical-file depth. 2,626 lines across ivdr-routes.ts and ivdr-binder-routes.ts deliver Annex VIII classification, analytical/clinical performance records with history, CDx workflows, a complete and correct 23-requirement Annex I GSPR checklist with per-requirement evidence linkage and a chapter-rolled compliance matrix, plus a claim→evidence→approve/revoke evidence binder with pack building, artifact hashing and a background worker. No competitor in this set sells an IVDR technical-file assembly product — they all sell literature. This is a real, differentiated asset that is currently 90% invisible.
- Honest fail-closed engineering. cerConformanceValidator.ts scopes itself accurately in its own docstring, refuses to auto-certify, and is covered by 25 passing tests; UnifiedCERService.generateReport returns status 'failed' with the reason rather than fabricating a report. In a category where every competitor's marketing says 'audit-ready', a codebase that documents its own limits is a diligence asset.

**Where we reach parity**

- AI drafting mechanics. The RAG-plus-Claude pipeline at cerv2-ai-routes.ts:186-265 with tenant-scoped retrieval, reranking and provenance return is architecturally on par with what Celegence and Vespper describe. We are behind DistillerSR's Smart Evidence Extraction on evidence-level extraction and behind Nested Knowledge on published validation, but the plumbing is not the gap.
- Audit trail for electronic records. auditService logging at cerGenerationService.ts:210/:346/:427 plus section-level Part 11 trails at cerv2-sections.ts:538 reaches roughly CiteMed's stated level ('every interaction captured and logged'). It does not reach DistillerSR's stated Part 11 / Annex 11 / cell-level provenance posture.
- Deterministic completeness checking. Ten mandatory-element checks with correct MDR-vs-IVDR reference branching is a credible parity feature against the structural checks the document-suite vendors ship.

**Where we lose**

- Literature. This is the category's centre of gravity and we have no engine at all — cerGenerationService.ts:545-552 emits an empty results array and cerv2-ai-routes.ts:164 emits a '[N] articles' placeholder. DistillerSR publishes 30% CER cycle-time reduction and up to 70% screening-time reduction; Nested Knowledge publishes >75% search recall and up to 97% screener recall. We publish nothing because there is nothing running. A CER tool without a defensible literature search is not a CER tool.
- Appraisal and evidence weighting. One boilerplate sentence (cerv2-ai-routes.ts:169-172) against four competitors with real screening/extraction/appraisal workflows.
- MDR GSPR conformity. cerGenerationService.ts:566-613 emits obsolete MDD-era 'ER 1/2/3/13/14' items with conformity hardcoded to 'Conforms' and generic evidence strings — a fabricated conformity assertion, and the single most damaging artifact in this module for a diligence reviewer. Compounding it, generateRiskBenefitConclusion at :637-640 always appends 'The clinical benefits outweigh the residual risks when the device is used as intended.' even when calculateBenefitRiskRatio returned 'Needs review', re-fabricating the exact conclusion that :620 was explicitly patched to prevent.
- Vigilance data. cer-routes.ts:103 queries the FDA *drug* event API by NDC code for a *medical device* CER. This is a category error a regulatory buyer will spot in the first demo, and it is worse than having no integration. A working MAUDE client already exists at AnaToolExecutor.ts:18 and is simply not wired in.
- Equivalence. No MDR Art. 61(4) / Annex XIV Part A §3 capability; the only live equivalence endpoint implements FDA substantial equivalence to a predicate, which is a different legal test.
- PMS/PMCF/PSUR. Fixtures with zero consumers against CiteMed's shipped PMCF survey creation, distribution and automated reminders.
- Reachability. 'device-cer' sits in NAV_HIDDEN (registryModel.ts:140) with 5 of 100 surfaces in the global rail; the surface it reaches is a 3-panel dashboard whose own comment says the 7-tab workbench does not exist; and no frontend file calls /api/cer/* at all. Every competitor has a front door. A capability a user cannot reach does not win deals, and here even the reachable door opens onto a room with no GSPR, no equivalence, no appraisal and no generator.
- Validation package. No Part 11 e-signature manifestation, no IQ/OQ/PQ, no CSV documentation for the CER module, no SOC 2 / ISO 27001. DistillerSR states Part 11, EU Annex 11 and NIST AI compliance outright. In a GxP procurement this alone can end the evaluation before capability is discussed.

## Is the advantage durable?

No durable advantage exists here, and the honest window is short.

Our one clear win, the Notified Body auditor (cer-auditor.ts, 25 Annex XIV-cited rules), is a corpus-plus-prompt asset. Celegence or DistillerSR could ship an equivalent in two to three quarters: both already hold the regulatory corpus and the customer relationships, MDCG 2020-13 is a public template that defines exactly what an assessor checks, and DistillerSR has shipped three distinct AI capability waves in eighteen months (Nov 2024 purpose-built GenAI, Sep 2025 Agentic AI, Apr 2026 fully automated Smart Evidence Extraction) — a cadence that says a deficiency-simulator feature is a release, not a research programme. There is no data moat: the rules encode published regulation, not proprietary NB outcomes. If we had a corpus of real NB deficiency letters mapped to CER content, that would be defensible; we do not.

The IVDR technical-file machinery (2,626 lines of classification, GSPR matrix, evidence binder with approve/revoke and pack hashing) is the more durable asset — perhaps three to four quarters for a competitor to replicate, because it is genuine domain modelling and workflow rather than a prompt. But durability is irrelevant while it is unreachable: no frontend calls the binder or pack endpoints at all, and the one IVDR surface that exists sits behind 'device-diagnostics' in NAV_HIDDEN. An advantage no user can reach cannot be defended, only lost. Worse, the IVDR clock is running independently of us — IVDR transition deadlines are pulling every device-regulation vendor toward PER and Annex XIII coverage, so the window in which 'nobody else sells IVDR technical-file assembly' stays true is narrowing on its own.

Meanwhile the deficits are getting harder to close, not easier. Literature is where the compounding happens: DistillerSR's advantage is not its algorithms but the curated, reusable, provenance-tracked evidence base its customers have accumulated inside it, plus a stated Part 11 / Annex 11 / NIST AI posture that took years and audits to establish. Nested Knowledge's published recall figures (>75% search, up to 97% screening) are a validation asset we cannot match by shipping code — we would have to run and publish comparable studies. Every quarter we do not have a literature engine, the gap widens by whatever the incumbents' customers extracted that quarter.

Net: assume roughly two to three quarters before an incumbent could neutralise the NB-auditor differentiator if it were visible enough to provoke a response — and it currently is not. The realistic strategy is not to defend a moat but to convert the IVDR asset into a reachable, sellable product fast, using the NB auditor as the demo hook, and to buy rather than build the literature layer. Betting on defensibility here would be a mistake; betting on speed to a reachable IVDR offering is the only credible play.

## Shortest credible path to parity

1. Fix the two fabrication defects before anything else — this is a one-day change and it is a diligence gate, not a feature. Delete generateGeneralRequirements / generateDesignRequirements / generateInformationRequirements / generateClinicalRequirements (cerGenerationService.ts:566-613), which assert 'Conforms' against obsolete MDD 'ER' numbering with no evidence, and rewrite generateRiskBenefitConclusion (:637-640) so it stops appending 'The clinical benefits outweigh the residual risks' when calculateBenefitRiskRatio returned 'Needs review'. Until this ships, every other investment is building on a generator that fabricates conformity claims.
2. Repoint vigilance at the right database — days, not weeks, because the client already exists. Replace the api.fda.gov/drug/event.json NDC lookup at cer-routes.ts:103 with the fda_maude_client already imported at AnaToolExecutor.ts:18 (device/event.json by product code), and retain FAERS only for drug-device combination products. Add EUDAMED and national competent-authority vigilance behind the same interface. This closes a demo-killing category error at near-zero cost.
3. Clone the working IVDR GSPR implementation onto the MDR side — the hardest part is already built and tested. ivdr-routes.ts:1027-1279 is a complete 23-requirement Annex I checklist with per-requirement status, applicability, evidence links, notes, update history and a chapter-rolled compliance matrix. Re-point it at MDR Annex I (the correct 23-row MDR requirement text already sits unused at client/src/concept2cure/mdx/data/cer.ts:81-110) and reuse the existing matrix endpoint and IvdSurface rendering pattern. Estimated 2-4 weeks; moves a critical dimension from 1 to 4.
4. Build the literature engine. This is the long pole and the one that decides whether the product exists: PubMed E-utilities plus a licensed Embase/Cochrane connector, protocol-driven query construction with a saved and re-runnable search strategy, deduplication by DOI/PMID/title (the pattern CiteMed publishes), dual screening with reviewer assignment and conflict resolution, MEDDEV 2.7/1 rev 4 Appendix A5/A6 appraisal scoring per study, and PRISMA counts emitted as structured data rather than the '[N] articles' placeholder at cerv2-ai-routes.ts:164. Estimated one to two quarters. Consider buying rather than building the screening layer — reselling or OEM-ing an existing validated screener would let the wedge be the Notified Body auditor plus the IVDR binder rather than a from-scratch race against a vendor with published recall figures.
5. Give the offering a front door and finish the workspace. Build the CerWorkbench that CerSurface.tsx:5-7 says is missing — the fixtures at mdx/data/cer.ts already define every tab's data shape (GSPR at :81, equivalence at :136, PMS/PMCF at :176-234), so the contracts are settled and only the live wiring and components are missing. Surface it through the Projects → project → CER module route, which approvedRoutePolicy.ts already allows ('cer' is in APPROVED_PROJECT_MODULES), so no navigation-constitution fight is required. Also fix the broken affordance where the diagnostics segment's 'IVDR GSPR checklist' chip (registryModel.ts:993) routes to a surface that has no GSPR tab.
6. Ship a CSV package and Part 11 electronic signatures. IQ/OQ/PQ protocols, a requirements traceability matrix, and §11.50/§11.70 signature manifestation on CER approval and export. DistillerSR clears this bar publicly and it is frequently a pass/fail gate before capability is even discussed. The audit trail (cerGenerationService.ts:210/:346/:427) and the human-review export gate (cerv2-export-routes.ts:118-167) already exist, so this is documentation and a signature workflow rather than new architecture — one quarter with a CSV consultant.
7. Restructure the export to the document a Notified Body expects. cer_mdr_v1.html is 19 lines of header/footer; replace it with an MDCG 2020-13 / Annex XIV Part A section-ordered template that emits a PRISMA flow diagram, MEDDEV A5/A6 appraisal tables, and a GSPR traceability annex from structured data rather than rendering whatever the editor happens to hold.
8. Sell the wedge while the gaps close. Package the 25-rule Notified Body auditor as a standalone pre-submission CER readiness review and the IVDR binder as an IVDR technical-file product. Both are real, both are differentiated, and both can carry revenue and reference customers during the two-to-three quarters the literature engine takes — provided step 5 gives them a front door.

## Verdict

**🔴 Not competitive** — Scored on the thirteen dimensions that actually decide CER/PER deals, we average roughly 1.9 out of 5, and the failures are concentrated exactly where the money is: all six critical-weighted dimensions score 1 or 2. The three questions a Notified-Body-facing buyer asks first — how does your literature search hold up, how do you demonstrate GSPR conformity, and is the system validated — return, respectively, an empty results array (cerGenerationService.ts:545-552), five obsolete MDD-era requirements hardcoded to 'Conforms' (cerGenerationService.ts:566-613), and no CSV package or Part 11 signature capability at all. Against that, DistillerSR states 21 CFR Part 11 / EU Annex 11 / NIST AI compliance publicly and publishes a 30% CER cycle-time reduction, and Nested Knowledge publishes measured screener recall of up to 97%. We cannot enter that comparison.

The reachability finding is what converts a weak position into a non-position. The premise held: HEAD commit 3276b878 (2026-07-28) leaves exactly 5 of 100 registered surfaces in the global rail (registryModel.ts:116-122), and that same commit demoted 'device-cer' into NAV_HIDDEN (registryModel.ts:140). But the deeper problem is not the missing rail entry — it is that the door leads nowhere. CerSurface.tsx is a three-panel dashboard whose own header comment (:5-7) states that the 7-tab CerWorkbench containing Equivalence, GSPR, Lit corpus, PMS and Generator does not exist, and no such file exists anywhere in client/. The MDR GSPR matrix, the equivalence matrix and the full PMS/PMCF dataset all exist as correctly-shaped fixtures in mdx/data/cer.ts (lines 81, 136, 176) with zero consumers. And no frontend file anywhere calls /api/cer/* — the CER backend has no UI caller at all. This is not a navigation regression; it is an offering that was never assembled.

Two findings go beyond 'incomplete' into affirmative liability, and a buyer should price them as such. First, cer-routes.ts:103 queries the FDA drug adverse-event database (FAERS, by NDC code) to build the postmarket section of a medical-device CER — the wrong regulatory database for the wrong product class, while a working MAUDE client sits unused at AnaToolExecutor.ts:18. Second, cerGenerationService.ts:637-640 appends 'The clinical benefits outweigh the residual risks when the device is used as intended' to every benefit-risk conclusion, including when the adjacent function returned 'Needs review' — silently re-fabricating the precise conformity claim that line 620 was explicitly patched to stop fabricating. A generator that asserts GSPR conformity and a favourable benefit-risk determination with no supporting evidence is not a partially-built product; it manufactures the exact defect a Notified Body assessor is trained to find.

The asset that survives diligence is not the CER module. It is the 875-line Notified Body auditor (25 Annex XIV-cited assessor rules, reachable today through the ANA chat, which is rail entry #1) and the 2,626 lines of IVDR technical-file machinery — a complete and correct 23-requirement Annex I GSPR checklist with evidence linkage and a compliance matrix, plus a claim→evidence→approve/revoke binder with pack hashing and a live worker. No competitor in this set sells IVDR technical-file assembly; they all sell literature. That is a genuine differentiated wedge, and it is roughly 90% invisible: the binder and pack builder have no frontend at all, and the one IVDR surface that does exist sits behind 'device-diagnostics', also in NAV_HIDDEN. The verdict is not-competitive for MDR CER as a standalone purchase. It is not a verdict on the engineering, which in the IVDR module and the audit/governance chain is materially better than the CER module's marketing would suggest — it is a verdict on what a buyer can actually take to a Notified Body this quarter.
