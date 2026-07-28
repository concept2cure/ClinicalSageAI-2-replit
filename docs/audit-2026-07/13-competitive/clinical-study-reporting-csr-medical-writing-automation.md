# Clinical study reporting (CSR) & medical writing automation

> **Verdict: 🔴 Not competitive**
> Weighted capability score — **us 1.5 / 5** vs **best competitor 4.7 / 5** across 10 dimensions.

**Full category as scoped:** Clinical study reporting (CSR) & medical writing automation — software that turns locked clinical trial data (ADaM/SDTM, TLFs, protocol, SAP) into ICH E3-structured Clinical Study Reports, patient/SAE narratives, and their downstream CTD clinical summaries.

## Who buys, and what they are actually buying

Economic buyer is the Head/VP of Clinical & Regulatory Medical Writing inside a sponsor (reporting to Head of Regulatory Affairs or Clinical Development Operations), or the Medical Writing practice lead at a CRO/FSP. Budget is carved out of an existing outsourced-medical-writing line, not new spend. What they are buying is a shorter database-lock-to-final-CSR cycle and a reduction in per-document CRO fees. The reference cost they benchmark against: a CRO delivers a first CSR draft in 4-5 weeks after lock with each revision round adding 5-10 business days, and senior contract regulatory medical writers were advertised in the UK in early 2026 at GBP 50-75/hour before CRO project-management, QC and review overhead (https://kitsa.ai/blog/ai-medical-writing-vs-cro-outsourcing-clinical-trials). Technical veto power sits with Clinical Data Standards/Biostatistics (does it read our ADaM and do the numbers in the prose match the TLFs?) and with Computer System Validation/QA (is it a validated GxP system with Part 11 record binding?). Either veto kills the deal regardless of drafting quality.

## Market structure

Market size and shape. The global medical writing market was estimated at USD 5.07B in 2025, reaching USD 5.59B in 2026 (https://www.grandviewresearch.com/industry-analysis/medical-writing-market). The AI-in-medical-writing slice is USD 1.21B in 2026 growing at 15.1% CAGR (https://www.globenewswire.com/news-release/2026/07/01/3320868/28124/en/AI-in-Medical-Writing-Market-Trends-Insights-Competitive-Forecast-to-2026.html). Roughly 59% of pharmaceutical organizations are integrating automation into regulatory and scientific documentation. The market is moderately fragmented — the top 10 players held only about 25% of revenue in 2024 (https://www.fortunebusinessinsights.com/medical-writing-market-116331) — which is why five credible AI-native challengers can coexist with Certara.

Critical framing for an acquirer: most of that USD 5.6B is services revenue (IQVIA, ICON, Parexel, Syneos), not software. The software TAM this asset competes for is the USD 1.21B AI slice, and it is being won by displacing per-document CRO fees rather than by adding a new line item. That is a substitution sale, and substitution sales are won on demonstrated cycle-time reduction against a specific study — precisely the demo we cannot run today because the build endpoints have no client caller.

Consolidation is active and running through the services layer. Indegene acquired Trilogy Writing & Consulting GmbH in March 2024 specifically to combine regulatory writing expertise with generative-AI content automation (https://www.grandviewresearch.com/industry-analysis/medical-writing-market). Larger CROs and life-science service providers are buying specialized medical writing firms to fold AI tooling into delivery. The strategic implication is that the natural acquirer of a CSR automation asset is a CRO or a services roll-up that wants to arbitrage writer hours — not a platform buyer, and those acquirers underwrite on demonstrated hours saved per document, which requires working software in a customer's hands.

Procurement pattern. Deals in this category are program-level or enterprise, run over 6-12 months, and gated by three independent reviews that occur in this order: (1) enterprise security review, (2) CSV/QA validation review, (3) capability bake-off with the medical writing team on a real locked study. Our asset fails gate 1 outright (four unauthenticated LLM endpoints at server/routes/csr-builder-routes.ts:227,281,309,375 mounted without authenticateToken at server/bootstrap/register-clinical-intel-routes.ts:139-141) and fails gate 2 (unexecuted IQ/OQ/PQ, no audit-chain entry on generation, no e-signature binding). It never reaches gate 3, where its deterministic narrative composer would actually score well.

Pricing signals, ranked by how public they are. Clinion is the only vendor of the five with a disclosed model — flat per-study-per-month, explicitly priced at parity with traditional non-AI systems (https://www.clinion.com/). Certara's CoAuthor is not separately priced; third-party aggregator data across all Certara software shows an average near USD 16,000/year and a maximum near USD 41,000, which is best read as a point-purchase floor rather than an enterprise CoAuthor price (https://www.vendr.com/buyer-guides/certara). Yseop is a private-offer listing on AWS Marketplace with no published price (https://aws.amazon.com/marketplace/pp/prodview-wzkfr67cebozi). AuroraPrime has a 'Create CSR pilot' SKU on the Microsoft commercial marketplace, implying a land-and-expand motion but no published figure (https://marketplace.microsoft.com/en-us/product/web-apps/alphalife_clinical_saas.create_csr_pilot?tab=overview). Narrativa publishes nothing; one vendor-adjacent listing claims a customer displaced roughly USD 500K of CRO patient-narrative spend and accelerated FDA submissions by 60%, which is directional marketing, not verified (https://healthydata.science/listings/narrativas-medical-writing-ai-agents-how-patient-narrative-automation-replaced-our-500k-cro-spend-and-accelerated-fda-submissions-by-60/). Net: no public per-seat benchmark exists in this category, so pricing power is set by demonstrated hours displaced, not by feature comparison.

Vendor-claimed ROI benchmarks a buyer will hold us to: Certara at least 30% reduction in initial drafting time; Yseop 50-80% reduction in manual effort; AuroraPrime 90% reduction in first-draft time and 50% overall cycle savings; Clinion up to 70% of the CSR auto-populated from Protocol/SAP/TLFs. Every one of those claims is measured against real study data as input. We cannot produce a comparable number because we do not read study data.

Regulatory backdrop that cuts both ways. As of early 2026 there are no official guidelines specifically addressing the use of AI to write regulatory documents, and vendors including Narrativa explicitly keep the human writer responsible for reviewing and validating output (https://intuitionlabs.ai/articles/clinical-study-report-automation-ai-risks). That vacuum is why validation posture is currently a marketing claim across all five competitors rather than a certified fact — none of the five could be independently verified as holding an executed customer-facing GxP validation package. It is the only genuinely open flank in this market, and it is the flank our audit-chain engineering is best positioned to attack.

## The five closest competitors

### Certara — CoAuthor — CoAuthor (formerly Synchrogenix Writer), launched October 2023, next-generation generative-AI release subsequently; sold alongside Certara.AI, Pinnacle 21 Enterprise and GlobalSubmit

The incumbent regulatory-writing system of record. Sells the whole chain — structured authoring, CDISC data validation, and eCTD publishing — from one vendor, backed by a large in-house regulatory writing services arm that can do the work if the software does not.

**Strengths**

- Direct incorporation of analysis datasets, CDISC data, and tables/listings/figures inside the report with real-time preview, and results can be refreshed at any point in the cycle (https://www.certara.com/coauthor/)
- Word-native structured content authoring with eTemplate libraries that auto-populate content, headings and styles, plus automated formatting, hyperlinking and metadata population (https://www.certara.com/announcement/certara-launches-coauthor-a-regulatory-and-medical-writing-tool/)
- Covers protocols, synopses, CSRs and patient narratives in one turnkey system; documented SDTM-to-patient-narrative path (https://www.certara.com/blog/using-sdtm-data-to-produce-patient-narratives/)
- Integrates with Pinnacle 21 Enterprise validation and GlobalSubmit to form one workflow from study design to eCTD submission (https://www.certara.com/pinnacle-21-enterprise-software/)
- Vendor-reported at least 30% reduction in initial drafting time (https://www.certara.com/blog/generative-ai-tools-for-regulatory-writing/)

**Weaknesses**

- Genuinely enterprise-scale procurement — heavier and slower to land than an AI-native point tool
- AI is positioned as a plugin/assist layer (Certara.AI generative AI plugin) on top of a structured-authoring core rather than an agentic pipeline, so it is arguably behind Narrativa on autonomous section generation
- Public per-seat pricing for CoAuthor is not disclosed; only aggregate Certara software pricing is visible, which makes budget-setting hard for a mid-cap buyer
- Independent (non-vendor) confirmation of a formal GxP/CSV validation package and Part 11 audit-trail architecture for CoAuthor specifically was not verified in this research

| | |
|---|---|
| AI shipped today | Generative AI is delivered via the Certara.AI plugin for messaging and results-conclusion drafting, layered on a structured-authoring and eTemplate core; Certara.AI deep learning is also used with Pinnacle 21 for data quality and insight generation. Verified as shipping, not roadmap (https://www.certara.com/coauthor/, https://www.certara.com/certara-ai/real-world-applications/). |
| GxP / validation posture | Not verified. Certara markets CoAuthor to regulated submission workflows and integrates Pinnacle 21 validation plus GlobalSubmit publishing/validation, but a customer-facing GxP validation package (IQ/OQ/PQ, Part 11 traceability matrix, audit support) was not confirmed from public sources in this research. |
| Pricing signal | CoAuthor-specific pricing is not public. Third-party aggregator data across all Certara software reports an average around USD 16,000/year and a maximum around USD 41,000 (https://www.vendr.com/buyer-guides/certara) — treat as a floor indicator for a point purchase, not a CoAuthor enterprise price. Certara states clients can engage CoAuthor at program level or across the enterprise. |

<details><summary>Sources</summary>

- https://www.certara.com/coauthor/
- https://www.certara.com/announcement/certara-launches-coauthor-a-regulatory-and-medical-writing-tool/
- https://www.certara.com/pressrelease/certara-launches-next-generation-coauthor-generative-ai-regulatory-writing-software/
- https://www.certara.com/blog/generative-ai-tools-for-regulatory-writing/
- https://www.certara.com/blog/using-sdtm-data-to-produce-patient-narratives/
- https://www.certara.com/pinnacle-21-enterprise-software/
- https://www.certara.com/certara-ai/real-world-applications/
- https://www.vendr.com/buyer-guides/certara

</details>

### Yseop — Yseop Copilot — Yseop Copilot, an end-to-end enterprise GenAI platform for life-sciences document automation, delivered partly as a Microsoft Word plug-in; roadmap product 'One-Click Dossier'

'Regulatory-Grade AI' — the compliance-first challenger. Sells hybrid symbolic-plus-LLM generation as the answer to the hallucination objection that blocks LLM tools from GxP procurement, and rides the Veeva Vault RIM install base as its distribution channel.

**Strengths**

- Automates CSRs, clinical narratives, Investigator Brochures, safety/efficacy summaries and preclinical PK/PD/tox reports by transforming structured data tables into first drafts (https://yseop.com/solutions/life-sciences/clinical/)
- Deterministic RAG: retrieval logic is fixed at system setup so output is constrained to validated, traceable content sources; symbolic AI is combined with LLMs specifically for determinism and traceability (https://yseop.com/faqs/)
- Explicitly markets GxP compliance, data privacy, accuracy and model explainability, with per-use-case testing before deployment and built-in quality monitoring (https://yseop.com/medical-writing-automation/)
- Works inside the medical writer's existing tool (Word plug-in) rather than demanding a new authoring environment (https://yseop.com/automate-medical-regulatory-authoringworkflows/)
- Veeva AI Partner Program member with Yseop Copilot ↔ Veeva Vault RIM integration, which is the single most valuable distribution position in this category (https://yseop.com/news-and-press-releases/yseop-joins-veevas-ai-partner-program-to-accelerate-regulatory-document-writing-and-ai-driven-content-automation/)
- Vendor-claimed 50-80% reduction in manual effort; TIME Best Inventions 2025 (Medical & Healthcare) and 2026 BIG Innovation Award

**Weaknesses**

- Deterministic RAG requires per-use-case configuration and setup effort — implementation is a project, not a self-serve turn-on, which lengthens time-to-value
- Document coverage is still expanding: Batch Analysis/Stability Reports, Nonclinical Summaries and Nonclinical Overview were 2026 additions, meaning breadth lags Certara
- Smaller company than Certara or Veeva; single-vendor risk and less leverage in an enterprise MSA negotiation
- No public pricing; AWS Marketplace listing exists but the offer is private (https://aws.amazon.com/marketplace/pp/prodview-wzkfr67cebozi)

| | |
|---|---|
| AI shipped today | Hybrid symbolic AI + LLM with deterministic RAG, domain-specific models, structured/validated data inputs and a per-use-case evaluation framework — shipping, not roadmap. 'One-Click Dossier' (fully automated ingestion-to-draft for CSRs, patient narratives and summaries) was announced as a roadmap direction in mid-2025 (https://markets.financialcontent.com/firstheritage/article/gnwcq-2025-6-16-yseop-unveils-roadmap-to-one-click-dossier-accelerating-scalable-compliant-regulatory-writing). |
| GxP / validation posture | Vendor-claimed GxP compliance with FDA/EMA standards, model explainability, per-use-case pre-deployment testing and built-in quality controls (https://yseop.com/medical-writing-automation/). A customer-executable IQ/OQ/PQ validation package and Part 11 audit-trail specification were not verified from public sources. |
| Pricing signal | Not public. Listed on AWS Marketplace (private offer / custom pricing) at https://aws.amazon.com/marketplace/pp/prodview-wzkfr67cebozi. Deal size not verified. |

<details><summary>Sources</summary>

- https://yseop.com/solutions/life-sciences/clinical/
- https://yseop.com/medical-writing-automation/
- https://yseop.com/faqs/
- https://yseop.com/automate-medical-regulatory-authoringworkflows/
- https://yseop.com/regulatory-document-automation/
- https://aws.amazon.com/marketplace/pp/prodview-wzkfr67cebozi
- https://yseop.com/news-and-press-releases/yseop-joins-veevas-ai-partner-program-to-accelerate-regulatory-document-writing-and-ai-driven-content-automation/
- https://www.veeva.com/eu/wp-content/uploads/2026/04/Yseop-Regulatory-Grade-AI-for-Life-Sciences-One-Pager-Feb2026.pdf
- https://markets.financialcontent.com/firstheritage/article/gnwcq-2025-6-16-yseop-unveils-roadmap-to-one-click-dossier-accelerating-scalable-compliant-regulatory-writing

</details>

### Narrativa — Clinical Atlas (CSR Atlas) / Navigator — Clinical Atlas within the Narrativa Navigator platform, alongside Narrative Pathway (patient narratives), R-Developer (TLF generation) and Redaction Scout; hosted on AWS

The agentic-AI native. Sells a pipeline of specialized AI agents that carry a study from protocol through TLFs to submission-ready CSR content, with QA agents doing the numeric cross-checking that medical writers currently do by hand.

**Strengths**

- Specialized AI Agents for dataset creation, TLF generation, table-to-text conversion and QA validation, transforming TLFs into submission-ready CSR content (https://www.narrativa.com/automation-of-clinical-study-reports/)
- The QA agent capability is the sharpest differentiator in the category: an agent that generates a CSR efficacy section, checks that numbers in the text match the tables, and links each sentence back to its source (https://www.narrativa.com/ai-agents-regulatory-life-sciences/)
- Continuous oversight and rigorous quality-control checks to catch errors early in the process rather than at QC (https://www.narrativa.com/automation-of-clinical-study-reports/)
- Covers the full clinical document lifecycle from protocol to final CSR as one AI pipeline (https://www.narrativa.com/protocol-clinical-trials-automation-with-ai-agents/)
- Evolved to an agentic architecture in 2025 with 65,000+ regulatory documents generated; President Jennifer Bittinger appointed to the CDISC Board in January 2026 as the first AI-vendor representative — a strong standards-credibility signal (https://www.narrativa.com/ai-trends-in-pharma-for-2026-what-to-expect/)
- Owns the TLF-generation step itself (R-Developer), so it is not dependent on the sponsor's biostat programming pipeline being finished

**Weaknesses**

- Smaller and younger than Certara; no publishing/eCTD arm, so it stops at document content and hands off to another vendor for submission assembly
- Named biopharma customers are largely anonymized in public case studies ('a top biopharmaceutical company'), which weakens reference-selling in a conservative procurement
- Agentic architecture is the newest and least battle-tested pattern in this category — CSV/QA groups will scrutinize non-determinism harder than they scrutinize Yseop's symbolic approach
- No public pricing or deal-size signal found

| | |
|---|---|
| AI shipped today | Agentic AI in production as of 2026: multiple specialized agents (dataset creation, TLF generation, table-to-text, QA validation) chained into a CSR pipeline on a proprietary generative-AI platform hosted in a secure AWS environment. Narrativa explicitly keeps the human writer responsible for reviewing and validating output (https://intuitionlabs.ai/articles/clinical-study-report-automation-ai-risks). |
| GxP / validation posture | Not verified. Narrativa markets full compliance in highly regulated environments and keeps the human writer accountable for review/validation, but no public IQ/OQ/PQ package, Part 11 traceability matrix or audit-support commitment was confirmed. Note the broader market fact: as of early 2026 there are no official guidelines specifically addressing the use of AI to write regulatory documents (https://intuitionlabs.ai/articles/clinical-study-report-automation-ai-risks). |
| Pricing signal | Not public. One third-party listing claims a customer replaced roughly USD 500K of CRO patient-narrative spend using Narrativa's medical writing AI agents and accelerated FDA submissions by 60% — vendor-adjacent marketing content, treat as directional only, not verified (https://healthydata.science/listings/narrativas-medical-writing-ai-agents-how-patient-narrative-automation-replaced-our-500k-cro-spend-and-accelerated-fda-submissions-by-60/). |

<details><summary>Sources</summary>

- https://www.narrativa.com/automation-of-clinical-study-reports/
- https://www.narrativa.com/ai-agents-regulatory-life-sciences/
- https://www.narrativa.com/protocol-clinical-trials-automation-with-ai-agents/
- https://www.narrativa.com/how-a-top-biopharmaceutical-company-accelerates-clinical-trials-with-narrativas-csr-atlas/
- https://www.narrativa.com/ai-trends-in-pharma-for-2026-what-to-expect/
- https://www.narrativa.com/ai-agent/
- https://intuitionlabs.ai/articles/clinical-study-report-automation-ai-risks
- https://healthydata.science/listings/narrativas-medical-writing-ai-agents-how-patient-narrative-automation-replaced-our-500k-cro-spend-and-accelerated-fda-submissions-by-60/

</details>

### AlphaLife Sciences — AuroraPrime RMA — AuroraPrime RMA (Regulatory and Medical Authoring) Add-In for Microsoft Word 365, part of the AuroraPrime platform (Create / Connect / Build)

The lowest-friction adoption play. Lives inside Word 365 where the medical writer already works, synthesizes upstream documents and data into drafts, and integrates with Veeva RIM so the output lands in the customer's existing system of record.

**Strengths**

- Word 365 add-in — no new authoring environment for the writer to learn, which materially reduces change-management risk (https://alphalifesci.com/products/auroraprime-rma/medical-writing)
- Customizable templates for CSRs and protocols giving a structured, requirement-specific foundation
- Automates content creation by synthesizing upstream documents and data, integrated with Veeva RIM (https://alphalifesci.com/products/auroraprime-platform)
- Vendor-claimed 90% reduction in first-draft time and 50% overall time savings across the CSR document cycle — the most aggressive quantitative claim in the category (https://alphalifesci.com/blog/accelerating-ctd-module-5-clinical-study-reports-csr-with-ai)
- Listed on the Microsoft commercial marketplace with a CSR pilot SKU, which lowers procurement friction for Azure-committed buyers (https://marketplace.microsoft.com/en-us/product/web-apps/alphalife_clinical_saas.create_csr_pilot?tab=overview)
- Listed in the DIA Global marketplace, giving industry-body visibility (https://marketplace.diaglobal.org/listing/alphalife-sciences1/products/auroraprime-rmaaipowered-medical-writing-solutions)

**Weaknesses**

- Least-known brand of the five in US/EU procurement; reference base and Western enterprise footprint are the weakest
- Positioning emphasizes template-driven authoring and upstream-document synthesis rather than direct ADaM/TLF ingestion with numeric traceability — the harder half of the problem
- The 90%/50% savings claims are vendor-reported with no independent validation found
- No public pricing beyond a marketplace pilot listing; validation posture not verified

| | |
|---|---|
| AI shipped today | AI-assisted authoring shipping inside a Word 365 add-in: template-driven CSR and protocol first-draft generation by synthesizing upstream documents and data, with Veeva RIM integration. Verified as a shipping product via vendor and marketplace listings; specific model/architecture not disclosed. |
| GxP / validation posture | Not verified. No public information on GxP/CSV validation packages, 21 CFR Part 11 posture, or customer audit support was found for AuroraPrime. |
| Pricing signal | Not public. A 'Create CSR pilot' SKU is listed on the Microsoft commercial marketplace (https://marketplace.microsoft.com/en-us/product/web-apps/alphalife_clinical_saas.create_csr_pilot?tab=overview) — the existence of a pilot SKU implies a land-and-expand motion with a low entry price, but the figure is not published. |

<details><summary>Sources</summary>

- https://alphalifesci.com/products/auroraprime-rma/medical-writing
- https://alphalifesci.com/products/auroraprime-platform
- https://alphalifesci.com/blog/accelerating-ctd-module-5-clinical-study-reports-csr-with-ai
- https://alphalifesci.com/blog/from-lab-to-launchpad-auroraprime-s-ai-powers-every-phase-of-clinical-document-creation
- https://marketplace.microsoft.com/en-us/product/web-apps/alphalife_clinical_saas.create_csr_pilot?tab=overview
- https://marketplace.diaglobal.org/listing/alphalife-sciences1/products/auroraprime-rmaaipowered-medical-writing-solutions
- https://www.dip-ai.com/use-cases/en/the-best-automated-clinical-study-reports

</details>

### Clinion — Clinion CSR Automation — Clinion CSR Automation, a module inside the Clinion AI-native eClinical suite (EDC, RTSM, CTMS, ePRO, eConsent, eSource, eTMF, medical coding)

The bundled AI-native eClinical play, aimed at small and mid-cap sponsors and regional CROs. Sells CSR automation as one more module on a platform that already holds the trial's EDC data, with transparent flat per-study-per-month pricing instead of enterprise negotiation.

**Strengths**

- Auto-generates ICH E3-compliant CSRs from protocols, SAPs and TLFs using generative AI, auto-populating up to 70% of the document from source data (https://www.clinion.com/csr-automation/)
- The only competitor of the five with a published pricing model: flat per-study-per-month, explicitly positioned as AI capabilities at the cost of traditional systems (https://www.clinion.com/)
- Owns the upstream data: EDC, eSource, ePRO and AI-powered medical coding sit on the same platform, so the CSR module is not blind to the trial database (https://www.clinion.com/innovate-clinical-trials-with-aiml-genai/)
- AI-native architecture rather than AI bolted onto a legacy eClinical stack (https://www.clinion.com/insight/top-5-reasons-to-choose-clinions-ai-enabled-eclinical-platform-for-your-next-trial/)
- Named among top clinical trial solution providers in 2026 lists and among the top-5 CSR automation vendors alongside Medidata, Veeva and Oracle (https://www.dip-ai.com/use-cases/en/the-best-automated-clinical-study-reports)

**Weaknesses**

- Bundling is also the weakness: buying CSR automation means adopting or interoperating with the Clinion suite, which is a non-starter for a sponsor standardized on Medidata Rave or Veeva CDB
- 'Up to 70% auto-populated' leaves the hardest 30% (efficacy interpretation, benefit-risk, discussion) fully manual — a narrower claim than Narrativa's or AuroraPrime's
- Weakest brand recognition among large-pharma regulatory writing groups in US/EU; strongest in India and emerging-market CRO channels
- No public GxP validation package, Part 11 documentation or audit-support commitment verified

| | |
|---|---|
| AI shipped today | Generative AI shipping in production: extracts key study insights from Protocol, SAP and TLFs and auto-populates up to 70% of an ICH E3-structured CSR; separately launched an AI-powered medical coding solution (https://www.clinion.com/news/clinion-launches-revolutionary-ai-powered-medical-coding-solution/). |
| GxP / validation posture | Not verified. Clinion markets ICH E3 compliance of the generated CSR structure, but no public GxP/CSV validation package, 21 CFR Part 11 documentation or audit-support commitment was found. |
| Pricing signal | Flat per-study-per-month pricing model, publicly stated as designed for transparency and fairness and priced at the cost of traditional (non-AI) systems (https://www.clinion.com/). Absolute figure not published — this is the only per-unit pricing model disclosed by any of the five. |

<details><summary>Sources</summary>

- https://www.clinion.com/csr-automation/
- https://www.clinion.com/
- https://www.clinion.com/insight/clinical-study-reports-csr-complete-guide/
- https://www.clinion.com/insight/top-5-reasons-to-choose-clinions-ai-enabled-eclinical-platform-for-your-next-trial/
- https://www.clinion.com/innovate-clinical-trials-with-aiml-genai/
- https://www.clinion.com/news/clinion-launches-revolutionary-ai-powered-medical-coding-solution/
- https://www.dip-ai.com/use-cases/en/the-best-automated-clinical-study-reports

</details>

## Capability rubric

Our score is cited to `file:line` in this repository. Theirs is cited in the competitor sections above. Scored on what **ships and is reachable**, not what is architected — an unreachable or unvalidated capability scores low regardless of code quality.

| Dimension | Weight | Us | Best competitor | Their score | Our evidence |
|---|---|:--:|---|:--:|---|
| Data-driven authoring: generate CSR prose from CDISC ADaM/SDTM datasets and TLFs rather than from a typed-in study description | critical | **1** 🔻 | Narrativa Clinical Atlas | 5 | server/routes/submission-orchestrator.ts:214-217 — the code's own comment: 'clinicalStudyData has NO loader yet (per PATH_TO_GA §D.3 — needs a real CDISC ADaM extractor)'. The CSR builder's only input is a free-text form: server/services/csr-builder.ts:119-133 (studyInfo = title, protocolNumber, phase, indication, sponsor, design, endpoints as strings). The section prompt at server/services/csr-builder.ts:438 literally instructs the model to 'Include placeholders like [DATA TO BE INSERTED] where actual study data would go', and the template fallbacks emit exactly that at csr-builder.ts:699,701,703,705 for §10.1, §11.4, §12.2 and §12.3. Real table builders exist (server/services/csr-tabulation-builders.ts:151 buildCSRTables) but consume a hand-authored StudyData JSON and are never called by the CSR builder — only by server/routes/submission-orchestrator.ts:672 with a client-supplied body. |
| Numeric consistency QC: automated verification that every number in the narrative matches the source table, with sentence-to-source linking | critical | **0** 🔻 | Narrativa Clinical Atlas | 5 | absent — no cross-check exists anywhere in the CSR path. server/services/csr-builder.ts generates prose and server/services/csr-tabulation-builders.ts generates tables from two entirely disjoint inputs that never meet. The provenance envelope at server/services/csr-builder.ts:352-360 carries only an optional deepResearchJobId, no table references and no per-sentence source spans. |
| Reachable end-to-end CSR workflow in the shipped UI (start a build, watch it, open and edit the draft) | critical | **1** 🔻 | Certara CoAuthor | 5 | client/src/concept2cure/v2/registryModel.ts:116-122 — the global rail is exactly five destinations (Chats, Projects, Communication Center, Apps, Settings), rendered at client/src/concept2cure/v2/Shell.tsx:185. Both 'csr-workflow' (registryModel.ts:143) and 'safety-narrative' (registryModel.ts:162) are in NAV_HIDDEN, i.e. reachable only by ⌘K or deep link. Worse, the surface that does exist is read-only: client/src/concept2cure/v2/surfaces/BiopharmaProject.tsx:434 fetches GET /api/csr-workflow/board and nothing else; its 'Draft section' button at BiopharmaProject.tsx:496 calls onAsk() into chat. A repo-wide grep for client calls to /api/csr finds only that one board URL — POST /api/csr/jobs (server/routes/csr-jobs.ts:116) and POST /api/csr-builder/build (server/routes/csr-builder-routes.ts:190) have zero client callers. The async build pipeline is curl-only. |
| Author-in-the-loop environment: Word/DOCX round-trip, structured content reuse, templates, redline and review cycle on the CSR itself | critical | **1** 🔻 | Certara CoAuthor | 5 | absent for CSR — grep for docx/Packer across server/services/csr*.ts, server/services/csr/*.ts and server/routes/csr*.ts returns nothing. Output is plain text with headers in CAPS by explicit instruction (server/services/csr-builder.ts:436-437: 'Do NOT use markdown. Write in plain text with section headers in CAPS'). The only template layer is 5 static [PLACEHOLDER] documents at server/services/templates/clinical-csr-templates.ts:40,144,187,233,272. server/routes/csr-workflow-routes.ts:33-40 concedes there is no review/approval state at all: 'The values review/complete/approved are DELIBERATELY never emitted: csr_section_outputs has no review/approval status column'. |
| GxP/CSV validation package and Part 11 record binding for AI-generated regulatory content | critical | **2** 🔻 | Yseop Copilot | 4 | Documents exist but are unexecuted and the CSR path itself is outside the controls. docs/validation/ holds IQ-CORTEX-001, OQ-CORTEX-001, PQ-CORTEX-001, VMP, VSR and TM-CORTEX-001-PART11-TRACEABILITY. But grep for audit/signature across server/services/csr/csr-job-runner.ts returns zero hits — no CSR generation event is written to the audit hash chain (server/services/audit/chain.ts). Provenance is structurally hollow: csr_section_outputs has model and token_cost columns (shared/schema.ts:8698-8723) and the runner writes them (csr-job-runner.ts:309-310,319-320), but draftCSRSectionWithProvenance hardcodes model: null and tokenCost: 0 on the AI path (server/services/csr-builder.ts:388-389 and 408-409) — so no record ever says which model wrote which section. The repo's own Part 11 chapter records the binding gap: docs/audit-2026-07/07-compliance-21cfr11.md:121-132 ('no signatureId, no manifestHash, and no electronic_signatures row'). |
| Patient / SAE narrative generation at volume, from the safety database, with MedDRA coding and persisted versions | high | **2** 🔻 | Certara CoAuthor | 5 | The composer itself is good and genuinely reachable — server/services/ana/safety-narrative.ts:57 composeSafetyNarrative is pure, deterministic ICH E3 §16 prose that never invents clinical detail, wired as an AnA tool at server/services/ana/AnaToolExecutor.ts:3195 and surfaced in the chat composer at client/src/concept2cure/components/ana/Composer.tsx:210 (chat IS in the global rail). But it stops there: the UI at client/src/concept2cure/v2/surfaces/SafetyNarrative.tsx:79 runs the client-side copy of the composer and never calls the AI-backed server service (server/services/safety-narrative-service.ts:358 generateSAENarrative), and the 'Save version' button at SafetyNarrative.tsx:240 fires the literal toast 'Narrative versioning isn't wired to the safety store yet — nothing was saved'. No MedDRA integration exists in the safety path (grep MedDRA across server/services returns only terminology-glossary and study-design files). |
| Hallucination control and AI governance defensible to a CSV/QA reviewer | high | **3** 🔻 | Yseop Copilot | 5 | Split. The narrative composer is fully deterministic and non-LLM (server/services/ana/safety-narrative.ts:9-12: 'Pure and deterministic — drafts the prose from the supplied facts only and NEVER invents clinical detail'), which is exactly the Yseop argument and is a genuine credit. The CSR section drafter is the opposite: an ungrounded LLM call at temperature 0.3 with no retrieval, no citation and no source binding (server/services/csr-builder.ts:472-487), whose prompt tells the model to write submission-ready regulatory prose from a study description alone. That is the single highest-risk thing in this category and a QA reviewer will find it in the first hour. |
| CSR-to-CTD continuity: generated CSR content flowing into Module 2.5 / 2.7 and on into eCTD assembly without re-keying | high | **4** | Certara CoAuthor | 4 | Genuinely built and the strongest thing in this category. server/services/csr/load-csr-inputs-for-project.ts:1-42 is a tenant-scoped reader that turns completed CSR build jobs into orchestrator-shaped CSRSummaryInput[], feeding m2-summary-builders and then server/services/submission-package-orchestrator.ts:1166-1169 (M2.5/M2.7 composition plus CSR tabulation) and on to eCTD export. The file header names the exact gap it closed. Held at 4 rather than 5 only because the upstream CSR content it carries is placeholder-laden. |
| Cross-study / precedent intelligence over a real CSR corpus (benchmark this study's design and outcome against comparable trials) | medium | **1** 🔻 | Certara CoAuthor | 3 | Architecturally present, empirically empty. compareWithExistingCSRs at server/services/csr-builder.ts:525-580 runs a tenant-scoped ILIKE over csr_reports and its own comment concedes the outcome column does not exist, so every row returns outcome: 'Unknown' (csr-builder.ts:571) and similarity is a hardcoded 0.95/0.6 string comparison (csr-builder.ts:572). The shipped corpus is data/csr_dataset.csv at 535 rows of thin fields (nct_id, indication, phase, sample_size, ...) with many zeros, and data/processed_csrs/ is empty (0 files), so server/services/csr-search-service.ts:32-50 initializes an empty embedding store. |
| Security posture of the generation endpoints (an enterprise security review will run this before the capability review) | high | **1** 🔻 | Certara CoAuthor | 5 | server/bootstrap/register-clinical-intel-routes.ts:139-141 mounts the CSR builder router at /api/csr-builder and /api/csr with NO authenticateToken middleware, unlike its immediate neighbours (citations at register-clinical-intel-routes.ts:130 and the eCTD family at server/bootstrap/register-document-routes.ts:60-77, both auth-gated). Four of the six handlers never call getAuthContext: POST /draft-section (server/routes/csr-builder-routes.ts:227), /safety-signals (:281), /generate-narrative (:309) and /analyze-benefit-risk (:375). All four invoke the LLM. That is unauthenticated, unmetered, unattributed AI invocation on a public path — an abuse and cost vector, and no Part 11 attribution for content that could reach a submission. |

## Where we stand

**Where we win**

- CSR-to-CTD continuity inside one codebase. server/services/csr/load-csr-inputs-for-project.ts reads completed CSR build jobs into orchestrator-shaped inputs, m2-summary-builders composes Module 2.5/2.7 from them, and server/services/submission-package-orchestrator.ts:1166-1169 carries that into eCTD assembly and export. Of the five competitors only Certara sells this span, and Certara does it by stitching CoAuthor to GlobalSubmit — two products, two contracts. Narrativa, Yseop, AuroraPrime and Clinion all stop at document content.
- Deterministic, non-LLM patient-narrative generation that is genuinely reachable today. server/services/ana/safety-narrative.ts:57 composes ICH E3 §16 narratives from structured facts only, never invents clinical detail, and reports missingFields so the writer sees the completeness gate before handoff. It ships as an AnA tool (AnaToolExecutor.ts:3195) inside the chat composer (Composer.tsx:210), and chat is one of the five global-rail destinations — so unlike the CSR builder, this one has a real front door. This is the same 'symbolic, traceable, no hallucination' argument Yseop wins GxP procurement with.
- Honest degradation contract in the UI. server/routes/csr-workflow-routes.ts:33-40 refuses to emit review/complete/approved states because no column can source them honestly, and SafetyNarrative.tsx:240 tells the user outright that nothing was saved. That discipline is rare and it is worth real money in a CSV audit — the system does not lie about its own state. It is also, however, the reason the demo looks thin.
- Single-vendor breadth for a small-biotech or regional-CRO buyer: CSR, PV/safety, CMC, device, submissions and eCTD in one platform. None of the five point tools offer that, and it is the only credible go-to-market wedge left in this category.

**Where we reach parity**

- ICH E3 section taxonomy completeness — all 16 top-level sections with subsections at server/services/csr-builder.ts:38-109, matching what every competitor templates.
- LLM-backed first-draft prose per section (server/services/csr-builder.ts:472-487) with graceful template fallback.
- Async job orchestration with resume semantics, per-section SHA-256 content hashing, quota reservation before enqueue and tenant pinning from the auth principal (server/services/csr/csr-job-runner.ts:222-260, server/routes/csr-jobs.ts:116-160). The engineering here is clean and is genuinely at parity — it is simply attached to the wrong inputs and has no caller.
- ICH E3 §10-12 table builders — disposition, analysis populations, demographics, efficacy, exposure, AE by SOC and PT, deaths/SAEs, lab shifts (server/services/csr-tabulation-builders.ts:171-509). The code is correct and tested; only its input path is missing.
- A 25-node / 120+ field structured CSR intake flow (server/services/ana/intelligence-questions/flows/csr-report.ts) and a 1,036-line CSR auditor, which is a credible substitute for the guided-authoring templates competitors ship.

**Where we lose**

- No CDISC ingestion in the CSR path at all. This is the deal-loser. Every one of the five competitors generates from ADaM/SDTM or TLFs; we generate from a typed-in study description and emit '[DATA TO BE INSERTED]'. Biostatistics will veto in the first demo.
- No numeric consistency QC between narrative and tables. Narrativa sells exactly this as its headline agent. We have nothing.
- No reachable UI to start, monitor or edit a CSR build. The build endpoints have zero client callers; the one CSR surface is a read-only board and is demoted out of the global rail into NAV_HIDDEN.
- No Word/DOCX authoring or export for CSR, and no review/approval workflow state. Medical writers live in Word; Certara, Yseop and AuroraPrime all meet them there.
- Not a validated system for this module. The IQ/OQ/PQ documents exist but are unexecuted, no CSR generation event reaches the audit hash chain, no e-signature binds an approved section, and the model/token_cost provenance columns are always written null/0 (csr-builder.ts:388-389,408-409).
- The CSR corpus that would justify 'cross-study intelligence' is effectively empty — 535 thin CSV rows and zero processed CSRs — while compareWithExistingCSRs returns hardcoded similarity scores and outcome 'Unknown'.
- Four unauthenticated LLM endpoints on /api/csr-builder. This fails enterprise security review before anyone evaluates drafting quality.

## Is the advantage durable?

No durable advantage exists in this category. Take the two real assets in turn. The deterministic ICH E3 §16 narrative composer (server/services/ana/safety-narrative.ts) is roughly 600 lines of rule-based prose assembly with a completeness gate — a competent team reproduces it in two to four weeks, and Yseop already ships the same idea at greater depth as its 'symbolic AI plus deterministic RAG' architecture, which is its central marketing claim. Certara already documents SDTM-to-patient-narrative generation. There is no moat here, only a correct design choice that others made first. The CSR-to-M2.5/2.7-to-eCTD chain is the more valuable asset because it spans a boundary competitors sell across two products, and it carries genuine switching cost once a sponsor has run a submission through it. But Certara already covers the same span with CoAuthor plus GlobalSubmit plus Pinnacle 21 and can close the seam whenever it chooses — and critically, that chain's value is proportional to the quality of the CSR content flowing through it, which today is placeholder-laden. A pipe carrying '[DATA TO BE INSERTED]' has no switching cost. Everything else in our stack — ICH E3 taxonomy, async job runner, table builders, LLM section drafting — is commodity that all five competitors already ship. Meanwhile the gap is widening, not narrowing: Narrativa moved to agentic architecture in 2025 with 65,000+ regulatory documents generated and put its president on the CDISC Board in January 2026 (https://www.narrativa.com/ai-trends-in-pharma-for-2026-what-to-expect/); Yseop announced One-Click Dossier in mid-2025 and holds a Veeva AI Partner integration into Vault RIM, which is the distribution position that decides this market (https://yseop.com/news-and-press-releases/yseop-joins-veevas-ai-partner-program-to-accelerate-regulatory-document-writing-and-ai-driven-content-automation/). Time for an incumbent to close everything we have: zero to six months, because for the most part they have already closed it. The honest read for an acquirer is that the CSR module should be valued as engineering substrate and as an option on the submission chain, not as a defensible product position. The one window that exists is narrow and time-boxed: no official regulatory guidance yet addresses AI-authored regulatory documents as of early 2026 (https://intuitionlabs.ai/articles/clinical-study-report-automation-ai-risks), so a vendor that arrives first with an executed validation package and Part 11-bound AI provenance can define the compliance bar. We currently have the strongest tamper-evidence engineering of anyone in this comparison (hash chain with FOR UPDATE anti-fork locking plus keyed HMAC seal, per docs/audit-2026-07/07-compliance-21cfr11.md) and we do not connect it to the CSR path at all. That is the one asymmetry worth funding, and it expires the moment FDA or EMA publishes guidance and every vendor is forced to the same bar.

## Shortest credible path to parity

1. Ship a front door first — it is the cheapest point on the board and nothing else can be demoed without it. Promote 'csr-workflow' out of NAV_HIDDEN (client/src/concept2cure/v2/registryModel.ts:143) or expose it under the Apps destination, then wire the existing surface to POST /api/csr/jobs and poll GET /api/csr/jobs/:jobId — both endpoints already exist and are tested (server/routes/csr-jobs.ts:116,182). Roughly 1-2 weeks of frontend work turns an invisible pipeline into a demoable one. Do this before anything else.
2. Auth-gate and instrument the generation endpoints. Add authenticateToken at server/bootstrap/register-clinical-intel-routes.ts:139-141 and require getAuthContext in the four handlers that skip it (csr-builder-routes.ts:227,281,309,375); populate the model and tokenCost provenance the runner already persists by returning the real values from draftCSRSectionWithProvenance instead of the hardcoded null/0 (csr-builder.ts:388-389,408-409); write an audit-chain entry per generated section via server/services/audit/chain.ts. About 1 week, and it removes the security-review blocker and half the Part 11 objection at once.
3. Build the ADaM/ARD-to-StudyData loader that the code already names as missing (server/routes/submission-orchestrator.ts:214). The target shape is fully specified at server/services/csr-tabulation-builders.ts:25-120 and the CDISC conformance machinery already exists (server/services/cdisc/adam-adsl-conformance-checker.ts, define-xml-generator.ts). Start with ADSL, ADAE and one ADaM BDS efficacy dataset — that covers §10.1, §11.1, §11.2, §12.1, §12.2 and §12.3. Estimate 6-10 weeks. This is the single highest-value item and nothing about the category is winnable without it.
4. Wire buildCSRTables into the CSR builder so drafted sections receive real tables instead of '[DATA TO BE INSERTED]', and change the section prompt at csr-builder.ts:436-438 from 'write submission-ready prose about this study' to 'describe this table', passing the generated table as grounded context. This converts the highest-hallucination-risk component in the product into table-to-text, which is what Narrativa and Yseop actually do. 3-4 weeks once the loader lands.
5. Add a numeric consistency checker: extract every number from generated section prose, match it against the cells of the tables that fed that section, and fail the section on mismatch. This is the cheapest way to neutralize Narrativa's headline QA-agent claim and is ~2-3 weeks on top of the grounded pipeline. Persist the check result on csr_section_outputs so it becomes audit evidence.
6. Add DOCX round-trip for CSR — export the assembled ICH E3 report to Word with the section hierarchy, tables and cross-references intact, and re-import writer edits. Without this the product asks medical writers to abandon the tool they have used for twenty years. 4-6 weeks; a Word add-in (the Certara/Yseop/AuroraPrime pattern) is a further quarter and can wait.
7. Add review/approval state to csr_section_outputs and bind an electronic_signatures row on approval, closing the gap the route currently refuses to fake (csr-workflow-routes.ts:33-40) and the gap the repo's own Part 11 chapter documents (docs/audit-2026-07/07-compliance-21cfr11.md:121-132). 3-4 weeks.
8. Execute the validation package against the CSR module specifically — the IQ/OQ/PQ/VMP documents in docs/validation/ are written but not executed, and no OQ script currently exercises the CSR path. This needs a named validation owner and a signed VSR; it is months of mostly non-engineering work, so start it in parallel with step 3, not after step 7.
9. Either populate the CSR corpus properly or stop claiming cross-study intelligence. Today data/processed_csrs/ is empty and compareWithExistingCSRs returns hardcoded similarity with outcome 'Unknown' (csr-builder.ts:571-572). Ingesting the Health Canada Clinical Information Portal and EMA clinical-data corpora is a real 4-8 week effort; if it is not funded, remove the claim rather than demo it.
10. Sequencing note for the buyer: steps 1-2 (about 3 weeks) make the asset demoable. Steps 3-5 (about 12-17 weeks) make it competitive on the critical dimension. Steps 6-8 (about 2 quarters, mostly non-engineering) make it sellable into a GxP procurement. Total realistic time to genuine parity: 9-12 months with 3-4 engineers plus a validation owner.

## Verdict

**🔴 Not competitive** — In this category the product is not losing on drafting quality — it is losing on the two things that define the category. First, a CSR tool that cannot read ADaM/SDTM or TLFs is not a CSR tool; it is a prose generator that emits '[DATA TO BE INSERTED]' at exactly the four sections (§10.1, §11.4, §12.2, §12.3) that constitute the actual work of writing a CSR. All five competitors ingest study data; the repo's own code comment at server/routes/submission-orchestrator.ts:214 concedes there is no ADaM extractor. Second, the capability that does exist has no front door: POST /api/csr/jobs and POST /api/csr-builder/build have zero callers anywhere in the client, and the csr-workflow surface is both read-only and explicitly demoted into NAV_HIDDEN (registryModel.ts:143) behind a five-item global rail. A capability a user cannot reach does not win deals, and in a competitive bake-off it does not even get scored. Layer on top: no Word round-trip, no review/approval state by the route's own admission, an unexecuted validation package with no audit-chain entry or e-signature binding on generated content, an empty CSR corpus behind the 'cross-study intelligence' claim, and four unauthenticated LLM endpoints that will fail security review before the capability review starts. The genuine assets — the deterministic ICH E3 §16 narrative composer and the CSR-to-M2.5/2.7-to-eCTD chain — are real and defensible, but they are one reachable feature and one plumbing advantage, not a product in this category. A buyer running this against CoAuthor, Yseop, Clinical Atlas, AuroraPrime and Clinion would eliminate it in the first round.
