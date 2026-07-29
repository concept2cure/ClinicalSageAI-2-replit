# Biostatistics, SAP authoring & statistical programming

> **Verdict: 🔴 Not competitive**
> Weighted capability score — **us 1.6 / 5** vs **best competitor 4.6 / 5** across 11 dimensions.

**Full category as scoped:** Biostatistics, SAP authoring & statistical programming

## Who buys, and what they are actually buying

Head of Biostatistics / VP Biometrics at a sponsor (or the Biometrics lead at a CRO), co-signed by Quality/CSV and Regulatory. The budget line is "biometrics tooling + statistical computing environment." What they are buying is a defensible, auditable path from protocol to locked SAP to submission-ready TLF/ADaM package — with a validation package their QA group can hand an inspector. Their two hard gates are (1) can my statistician actually run a study design and produce a signed SAP in this tool today, and (2) can you show me qualification evidence against SAS/nQuery reference values. Deals are lost on gate 2 more often than on features. Secondary influencer: the statistical programming lead, who cares only about SAS/R execution, double programming, and CDISC conformance on real datasets.

## Market structure

STRUCTURE. This is not one market; it is three adjacent ones that no single vendor yet spans, which is why procurements routinely end in two or three purchases:

(1) DESIGN — sample size, power, group-sequential boundaries, adaptive simulation. Owned by Cytel (East/East Horizon/Solara) with nQuery/Statsols as the value alternative (370+ procedures, 1,000+ sample-size and power scenarios, and — notably — published validation documentation comparing results to other statistical software, which is exactly the artifact most vendors will not produce). See https://cytel.com/east-horizon/ and https://info.statsols.com/hubfs/Resources_/nQuery%20Validation%20Reports/nQuerySampleSizeandPowerCalculationValidationDocumentation.pdf

(2) EXECUTION — the statistical computing environment where SAS/R/Python actually run, with double programming and audit trail. A two-horse incumbent-vs-modernizer race: SAS LSAF (single GxP-validated environment) versus Domino (multi-language, plus SCE QC launched 13 Nov 2025 for automated dual-programmer validation traceable to Part 11). UCB is a public reference for the modernization thesis. See https://domino.ai/press-releases/sce-qc and https://www.ucb.com/newsroom/press-releases/article/ucb-and-domino-data-lab-collaborate-to-modernize-statistical-computing-environment-in-life-sciences

(3) STANDARDS + NARRATIVE — CDISC conformance, define.xml, and the documents. Certara owns this via Pinnacle 21 Enterprise (SDTM/ADaM/Define-XML/SEND validation rules, real-time error highlighting, clinical metadata repository) plus CoAuthor. Public efficiency claims: validated studies up to 85% faster, define.xml deliverables up to 80% faster. See https://www.certara.com/pinnacle-21-enterprise-software/validation/ and https://www.certara.com/pinnacle-21-enterprise-software/demo/

CONSOLIDATION. Certara has rolled up the standards layer (Pinnacle 21) and stitched it to AI authoring (CoAuthor, next-gen announced June 2024) — the clearest attempt to span (3) into (1)/(2). Cytel has extended from desktop East into cloud East Horizon and downmarket via East On Demand. Nobody has convincingly spanned design → execution → standards, which is the strategic opening — and also the reason a challenger that spans none of them credibly is invisible in an RFP.

THE 2026 AI INFLECTION IS REAL AND IS ABOUT ARCHITECTURE, NOT FEATURES. The industry has converged on a specific question: where is the LLM allowed to sit? Two camps have formed. Cytel's RCACTS puts GPT-4o at the code-generation layer (generating R for the East Horizon engine). Veristat's InStat (launched 13 May 2026) explicitly rejects that, putting AI agents at the specification layer to drive a library of pre-validated statistical engines — marketed verbatim as automation speed "without the risk or regulatory exposure of LLM-generated analysis code," with a 5-weeks-to-5-days readout claim and Clene Nanomedicine as first customer. The specification-layer architecture is winning the credibility argument. Any acquisition thesis in this category must state which camp it is in. See https://cytel.com/by-topic/artificial-intelligence-and-machine-learning/ and https://www.businesswire.com/news/home/20260513591002/en/Veristat-Launches-AI-Biostatistics-Platform-Cutting-Clinical-Trial-Data-Readout-Time-from-5-Weeks-to-5-Days-Without-Regulatory-Risks

ACADEMIC/OPEN PRESSURE ON SAP AUTHORING SPECIFICALLY. SAP drafting is the sub-segment most exposed to commoditization. SAPAI, from King's College London CTU, generates SAPs from protocols and was validated by independent trial statisticians across nine real-world trials: 71 SAPs drafted in 1.0–3.4 minutes each versus a traditional 1–2 days, with SME quality ratings of 3.6–4.2 on a 5-point scale. It is published, peer-reviewed in Clinical Trials, and has a public demo app. A buyer should assume the floor price of "AI drafts a SAP" trends toward zero within 24 months, and that defensibility must come from governance, validation and traceability rather than from generation. See https://journals.sagepub.com/doi/10.1177/17407745261422365 and https://www.medrxiv.org/content/10.64898/2026.03.19.26348626v2.full

CRO/FSP AS THE REAL COMPETITIVE SET. For mid-cap sponsors the alternative to buying software is buying people with proprietary automation: Phastar's REPIT and MAPIT for TFL/SDTM automation, Veramed's CDISC ARM v1.0 metadata-driven generation of standalone SAS programs, Saama BRAIN centralizing statistical programming and generating submission-ready TLFs. Any software-only pitch is priced against an FSP contract that already includes the statistician. See https://phastar.com/solutions/biostatistical-programming/, https://veramed.com/resources/automation-of-safety-tables-for-phase-1-2-biotech-trial/, https://www.saama.com/platform/products/biometrics-research-and-analysis-information-network-brain/

PROCUREMENT PATTERN AND DEAL SIZE. Pricing is uniformly opaque — none of the five publish list prices; Capterra's Cytel listing discloses no starting price. Deals are demo-led and QA-gated, and the gate that kills challengers is not features, it is the validation package: SAS LSAF and nQuery both lead with qualification evidence, and a biometrics QA group will not sign without an IQ/OQ/PQ or a statistical qualification report benchmarking outputs against reference software. Practical implication for this asset: absent that artifact, the product does not reach technical evaluation regardless of engine quality.

## The five closest competitors

### Cytel — East / East Horizon / Solara (East On Demand)

The incumbent standard for group-sequential and adaptive trial design and simulation. East Horizon launched as a cloud 'collaborative workbench for biostatisticians to create and optimize trials'; Solara is the trial-simulation/design-optimization layer. Sold to sponsor biostatistics groups as the tool of record for sample size, boundaries and operating characteristics.

**Strengths**

- Decades of regulatory acceptance for East-derived designs; the reference implementation most FDA/EMA statisticians recognize on sight
- East Horizon consolidates East + Solara + open-source analytics into one cloud workflow
- Ships a real AI capability, not a roadmap: RCACTS, an R coding assistant built on GPT-4o and deployed inside Microsoft Azure, that generates R tailored to the East Horizon simulation engine rather than generic standalone scripts
- East On Demand lowers the entry point to smaller biopharma, widening the wedge against challengers
- Partnership credibility (e.g. Solara co-development with GSK)

**Weaknesses**

- Design-centric: it is not a SAP authoring system and not a statistical computing environment — no ADaM derivation, no TLF production, no CDISC define.xml
- Pricing opacity and historically seat-heavy licensing makes it painful for small sponsors
- RCACTS is an LLM code assistant, so it inherits the reviewability concerns competitors like Veristat explicitly market against
- Collaboration/governance (versioning, e-signature, amendment control) is thin relative to document platforms

| | |
|---|---|
| AI shipped today | RCACTS (R Coding Assistant for Clinical Trial Simulation) — OpenAI GPT-4o, deployed in Azure, generates R code specifically targeted at the East Horizon simulation engine from plain-English descriptions. Shipping, not roadmap. |
| GxP / validation posture | Not verified. Cytel does not publish a validation/qualification package on the pages reviewed; East's regulatory standing rests on decades of submission precedent rather than a published CSV artifact. |
| Pricing signal | Not public. Capterra maintains a Cytel listing but discloses no starting price or free trial; East On Demand is positioned as a lower-commitment entry tier. |

<details><summary>Sources</summary>

- https://cytel.com/east-horizon/
- https://cytel.com/news-and-events/cytel-launches-east-horizon/
- https://cytel.com/by-topic/artificial-intelligence-and-machine-learning/
- https://cytel.com/solutions/clinical-trial-design/software-for-trial-design/
- https://www.capterra.com/p/201994/Cytel/
- https://www.biospace.com/cytel-launches-east-on-demand-bringing-adaptive-clinical-trial-design-capabilities-to-wider-biopharma-audience
- https://www.globenewswire.com/de/news-release/2023/02/07/2603127/0/en/Cytel-and-GSK-Partner-to-Advance-Clinical-Trial-Design-with-Solara.html

</details>

### Certara — Pinnacle 21 Enterprise + CoAuthor

The CDISC conformance and define.xml standard, bundled with a generative-AI regulatory writing tool. P21 Enterprise validates clinical datasets against current CDISC standards and global regulatory rules; CoAuthor puts a life-science GPT plus eCTD structured templates inside Microsoft Word and pulls in analysis datasets, tables, listings and figures. Together they cover the 'metadata + narrative' half of biometrics deliverables.

**Strengths**

- Pinnacle 21 is the de-facto industry validator: SDTM, ADaM, Define-XML and SEND validation rules, with errors highlighted in real time
- Operates on real submission datasets, not hand-entered metadata — the thing a demo is won or lost on
- Clinical Metadata Repository gives standards governance across a portfolio, which is a genuine enterprise moat
- CoAuthor ships a purpose-built biomedical GPT with client-specific isolation, integrated to P21 validation and the Certara.AI engine, and can import/refresh analysis datasets and TLFs
- Quantified claims sponsors repeat in RFPs: validated studies up to 85% faster, submission deliverables via the Define.xml tool up to 80% faster

**Weaknesses**

- No trial design or sample-size engine — cedes the front half of the biostatistics workflow entirely to Cytel/nQuery
- No statistical computing environment: does not execute SAS or R, does not derive ADaM
- CoAuthor is a medical-writing tool that consumes SAPs and TLFs; it is not a SAP authoring or estimand system
- Word-centric authoring is a structural constraint for teams wanting API-first pipelines
- Two products, two procurement motions, and the AI value concentrates in CoAuthor rather than in biostatistics proper

| | |
|---|---|
| AI shipped today | CoAuthor: purpose-built biomedical GPT embedded in Microsoft Word with structured content authoring and eCTD templates, integrated with Pinnacle 21 Enterprise validation and the Certara.AI deep-learning engine; imports and refreshes analysis datasets, tables, listings and figures. Next-generation CoAuthor announced June 2024 and shipping. |
| GxP / validation posture | Pinnacle 21 Enterprise is built around regulatory conformance rules (CDISC + FDA/PMDA-published validation rules) and is the tool sponsors cite in submissions. Specific 21 CFR Part 11 / CSV documentation for CoAuthor was not verified on the pages reviewed. |
| Pricing signal | Not public. Certara routes to demo/consultation; no list pricing published for P21 Enterprise or CoAuthor. |

<details><summary>Sources</summary>

- https://www.certara.com/pinnacle-21-enterprise-software/
- https://www.certara.com/pinnacle-21-enterprise-software/validation/
- https://www.certara.com/pinnacle-21-enterprise-software/define-xml/
- https://www.certara.com/pinnacle-21-enterprise-software/clinical-metadata-repository/
- https://www.certara.com/pinnacle-21-enterprise-software/demo/
- https://www.certara.com/coauthor/
- https://ir.certara.com/news-releases/news-release-details/certara-launches-next-generation-coauthortm-generative-ai
- https://www.certara.com/blog/generative-ai-tools-for-regulatory-writing/

</details>

### Domino Data Lab — Domino Statistical Computing Environment (SCE) for Life Sciences + Domino SCE QC

The modern statistical computing environment — the place statistical programming actually happens. Unifies SAS, R and Python in one governed workspace so biometrics teams deliver analyses with full traceability in a 21 CFR Part 11-compliant environment. SCE QC (announced 13 November 2025) extends this into automated, audit-ready quality control for clinical programming.

**Strengths**

- Owns the execution layer — the single largest capability in this category and the one no design tool touches
- SCE QC embeds QC tracking in the environment: create, assign and approve deliverables inside the SCE, with every dataset, code file and output automatically linked and version-controlled
- Supports dual-programmer validation (double programming) with complete traceability aligned to 21 CFR Part 11 — this is the core compliance workflow of statistical programming
- Multi-language (SAS + R + Python) is a durable advantage over SAS-only incumbents as sponsors migrate to R
- Named enterprise reference: UCB publicly collaborating with Domino to modernize its SCE; SCE QC developed with pharma partners

**Weaknesses**

- Infrastructure, not domain content: no sample-size engine, no adaptive design, no estimand framework, no SAP authoring
- No CDISC conformance validator or define.xml generator — sponsors still buy Pinnacle 21 alongside
- Substantial implementation and platform-engineering burden; not a tool a lone biostatistician adopts
- AI story is automation and traceability rather than generative assistance to the statistician
- Horizontal-platform DNA means life-sciences depth varies by module

| | |
|---|---|
| AI shipped today | Automation and traceability rather than generative AI: SCE QC automates QC assignment, approval and lineage capture. Domino is broadly an enterprise AI platform, but the shipping life-sciences differentiator as of 2026 is automated audit-ready QC, not an LLM statistician. Generative-AI features specific to the SCE were not verified. |
| GxP / validation posture | Strongest of the set on this axis: explicitly positioned as a 21 CFR Part 11-compliant environment supporting submissions, with dual-programmer validation and audit-ready documentation of every step. |
| Pricing signal | Not public. Enterprise platform licensing; deal sizes are consistent with multi-year six- to seven-figure infrastructure contracts, but no figure is published. |

<details><summary>Sources</summary>

- https://domino.ai/solutions/life-sciences-sce
- https://domino.ai/press-releases/sce-qc
- https://www.prnewswire.com/news-releases/domino-data-lab-accelerates-statistical-programming-and-submissions-with-audit-ready-traceability-302613917.html
- https://www.ucb.com/newsroom/press-releases/article/ucb-and-domino-data-lab-collaborate-to-modernize-statistical-computing-environment-in-life-sciences
- https://domino.ai/data-science-dictionary/statistical-computing-environment-sce
- https://domino.ai/blog/moving-faster-how-can-a-modern-statistical-computing-environment-promote-innovation-and-accelerate-clinical-trials
- https://www.selectscience.net/article/domino-data-lab-launches-domino-sce-qc

</details>

### SAS Institute — SAS Life Science Analytics Framework (LSAF) / Clinical Acceleration Repository

The default incumbent statistical computing environment for large pharma. Sold as a single GxP-validated environment providing reproducibility, traceability and governance across the clinical development process. The safe choice that no QA group argues with.

**Strengths**

- Explicitly marketed as a single GxP-validated environment — the validation posture competitors have to argue around
- SAS remains the language of record for the majority of submitted analyses; incumbency in programmer skill base is enormous
- Sustained investment to keep solutions qualified and adherent to new trial types
- Deep integration with the rest of a sponsor's SAS estate; nothing to re-platform
- Governance, reproducibility and traceability are the product, not an add-on

**Weaknesses**

- SAS-centric in an industry actively migrating to R and Python — the strategic vulnerability Domino targets directly
- No trial design/sample-size engine, no SAP authoring, no estimand framework, no CDISC validator
- Heavy, expensive, slow to deploy; poor fit for small and mid-cap sponsors
- No credible generative-AI biostatistics capability verified as shipping in LSAF as of 2026
- Modernization pressure: the UCB/Domino-style 'modernize the SCE' narrative is explicitly aimed at displacing it

| | |
|---|---|
| AI shipped today | Not verified. No shipping generative-AI biostatistics or SAP-authoring capability within LSAF was confirmed in the sources reviewed. Treat any AI claim here as unproven. |
| GxP / validation posture | Strongest published claim in the category: LSAF is described as a single GxP-validated environment delivering reproducibility, traceability and governance, with continuous investment to keep solutions qualified for regulated use. |
| Pricing signal | Not public. Enterprise licensing, historically among the highest-cost options in the category; no figure published. |

<details><summary>Sources</summary>

- https://www.lexjansen.com/phuse/2023/sd/PAP_SD02.pdf
- https://domino.ai/data-science-dictionary/statistical-computing-environment-sce
- https://lifebit.ai/blog/clinical-trial-data-analysis-2026/

</details>

### Veristat — InStat by Veristat

The AI-native challenger, launched 13 May 2026. Marketed as the clinical research industry's first zero-code, fully automated biostatistics solution — compressing database-lock-to-submission-ready TLF from the typical four-to-six weeks to five days or less, with every output backed by validated statistical engines and expert biostatistician review. Delivered as a CRO-attached platform with a sponsor-facing collaboration portal.

**Strengths**

- Architecturally the sharpest answer to the LLM-in-regulated-analysis problem: AI agents turn a biostatistician's plain description into precise specifications, which then drive a library of validated statistical engines — automation speed without the regulatory exposure of LLM-generated analysis code
- Attacks the metric buyers actually feel: readout cycle time, with a concrete 5-weeks-to-5-days claim
- Transparent collaborative readout review via a secure sponsor portal, working with Veristat in real time to finalize readouts
- System-agnostic — sponsors keep their preferred EDC and their own formatting requirements
- Named reference customer already in a regulatory path: Clene Nanomedicine, NfL biomarker analyses supporting a planned 2026 NDA
- CRO delivery model means the statistician-in-the-loop is included, neutralizing the 'who validates the AI' objection

**Weaknesses**

- Very new — launched May 2026, one named customer; limited production track record
- Service-attached rather than a licensed product: sponsors wanting to run analyses in-house are not the target
- No published trial-design or sample-size capability; this is a readout/TLF automation play, not a design tool
- No SAP authoring, estimand engine or CDISC validator surfaced in launch materials
- SDTM/ADaM and TFL validation specifics were not verified in the sources reviewed — the 'validated statistical engines' claim is asserted, not evidenced publicly
- Buying InStat generally means buying Veristat as the CRO

| | |
|---|---|
| AI shipped today | Shipping and architecturally explicit: AI agents convert biostatistician descriptions into precise analysis specifications, which drive a library of pre-validated statistical engines that perform every analytical step. Deliberately excludes LLM-generated analysis code. This is the most credible AI posture in the category because it puts the LLM at the specification layer, not the computation layer. |
| GxP / validation posture | Claims every output is backed by validated statistical engines plus expert biostatistician review, and markets itself as delivering automation speed 'without regulatory risks.' The underlying validation/CSV package is not published — not verified. |
| Pricing signal | Not public. Sold as part of Veristat's biometrics/CRO engagement rather than as standalone software, so deal size tracks study-level biometrics service contracts. |

<details><summary>Sources</summary>

- https://www.businesswire.com/news/home/20260513591002/en/Veristat-Launches-AI-Biostatistics-Platform-Cutting-Clinical-Trial-Data-Readout-Time-from-5-Weeks-to-5-Days-Without-Regulatory-Risks
- https://www.veristat.com/news/veristat-launches-ai-biostatistics-platform
- https://oncodaily.com/voices/zhaohui-su-508119
- https://lasvegassun.com/news/2026/may/13/veristat-launches-ai-biostatistics-platform-cuttin/
- https://trial.medpath.com/news/veristat-launches-ai-powered-biostatistics-platform-to-accelerate-clinical-trial-data-analysis

</details>

## Capability rubric

Our score is cited to `file:line` in this repository. Theirs is cited in the competitor sections above. Scored on what **ships and is reachable**, not what is architected — an unreachable or unvalidated capability scores low regardless of code quality.

| Dimension | Weight | Us | Best competitor | Their score | Our evidence |
|---|---|:--:|---|:--:|---|
| Reachable front door — can a biostatistician find and use the module in a normal session | critical | **1** 🔻 | Cytel | 5 | shared/constants/ui-surface-registry.ts (biostatistics and biostat-workbench both navTier:'specialist'; only 4 of 47 surfaces are navTier:'global' — projects, apps, artifacts-center, ana-memory); client/src/concept2cure/v2/V2App.tsx:121 (deep-link-only routing via surfaceIdFromLocation); client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:112 (the single endpoint of 63 with a client caller) |
| Validation package / CSV / statistical qualification against reference software | critical | **0** 🔻 | SAS Institute (LSAF), matched by nQuery on published qualification evidence | 5 | absent — no IQ/OQ/PQ, validation summary, qualification report or traceability matrix anywhere in the repo; 249 passing tests across 19 files (server/services/stats/__tests__, server/services/cdisc/__tests__) are unit tests, not a CSV artifact |
| Statistical programming execution — SAS/R compute, ADaM derivation, TFL production, double programming | critical | **0** 🔻 | Domino Data Lab (SCE + SCE QC) | 5 | absent — grep across server/services for proc mixed\|proc lifetest\|proc glm\|.sas\|generateSasCode\|rscript\|generateRCode returns zero files; TLF exists only as gpt-4o-generated shells at server/services/statistical-continuum-service.ts:334-341, and /continuum has zero client callers |
| 21 CFR Part 11 e-signature integrity on the locked SAP | critical | **1** 🔻 | Domino Data Lab | 5 | server/services/collaborative-sap-service.ts:388-446 — signVersion writes client-supplied signatureId/signerName/timestamp/method verbatim; the 'Part 11 compliance' check at :415-426 only asserts non-empty fields; no re-authentication, no second ID component, no content hash bound to the signature (violates 11.100(a), 11.200(a)(1)(i), 11.70). Audit-trail route exists at server/routes/biostatPlatform.ts:524 |
| Design & sample-size method breadth incl. group-sequential and adaptive operating characteristics | high | **4** 🔻 | Cytel | 5 | server/services/stats/group-sequential-oc.ts:1-31 (exact OC by recursive numerical integration, Jennison & Turnbull ch. 19; binding-futility scope stated explicitly at :26-31); multiplicity.ts:56-276 (Bonferroni/Holm/Hochberg/fixed-sequence/graphical + FWER); mmrm-design.ts (280), rmst.ts (183), win-ratio.ts (205), dose-finding-boin.ts (197), assurance.ts (207) — 6,324 LOC total, 249 tests passing |
| CDISC conformance and define.xml on REAL datasets (XPT / Dataset-JSON ingestion) | high | **2** 🔻 | Certara (Pinnacle 21 Enterprise) | 5 | server/services/cdisc/ 2,786 LOC of real checkers (sdtm-domain 396, send 324, adam-bds 303, adam-adsl 252, adam-occds 244, controlled-terminology 214, define-xml-generator 228) each with tests — but define-xml-generator.ts:22-45 consumes hand-supplied DefineVariable/DefineDataset objects, and no XPT/sas7bdat/Dataset-JSON parser exists anywhere in server/ |
| SAP authoring, versioning, amendment control and collaborative review, reachable end to end | high | **2** 🔻 | Certara (CoAuthor) | 4 | server/services/collaborative-sap-service.ts:88-340 (drizzle-backed versioning with auto-diff, section edits blocked on lock, threaded comments, formal amendments with rationale) is a genuinely good data model — but grep of client/src for biostat/sap/create returns 0 callers, and all 12 SAP routes (server/routes/biostatPlatform.ts:391-556) are unreachable |
| ICH E9(R1) estimand framework depth and evidentiary honesty | high | **2** 🔻 | Cytel | 3 | server/services/estimand-engine-service.ts:229-253 (ICE-level strategy validation against the recognized E9(R1) set) and :372-473 (strategy-to-method map, parallel gatekeeping) are real — but the engine is unreachable (0 client callers for biostat/estimand) and :388 hard-codes an unsourced 'FDA, EMA, and PMDA have accepted this approach' claim into every recommendation |
| Reproducibility, determinism and computation provenance | high | **4** 🔻 | Domino Data Lab | 5 | server/services/stats/computation-provenance.ts (buildProvenance attached to results); rng.ts seedFromObject (seeded, reproducible Monte Carlo — verified by 'is reproducible for a fixed seed' tests in __tests__/monte-carlo.test.ts); compute-cache.ts order-invariant stable keying (tested); group-sequential-oc.ts:11-13 deterministic exact computation, no RNG; define-xml-generator.ts:11-12 byte-identical output |
| Regulatory judgment layer — telling the statistician what a reviewer will object to | medium | **3** | Veristat (InStat, biostatistician-in-the-loop review) | 3 | server/services/biostatistics-judgment/index.ts:55-61 and :73/:123/:155 (runJudgmentPipeline, runPipelineAndGenerateArtifact, runPipelineForRole) over 8 modules ~127 KB — power-adequacy, assumption-fragility, endpoint-method-defensibility, tradeoff-interpreter, risk-classifier, role-aware-interpreter, statistical-artifact-generator; genuinely differentiated content, but unreachable (0 client callers for biostat/judgment) |
| AI that actually ships in this category, with a defensible regulatory architecture | medium | **2** 🔻 | Veristat (InStat: AI agents at the specification layer driving validated engines) | 4 | zero LLM in biostatistics-judgment/, biostats-signal-engine/, ana-biostats/, estimand-engine-service.ts, sap-generator-service.ts, collaborative-sap-service.ts (grep-verified) — architecturally the right posture; but the only LLM path is server/services/statistical-continuum-service.ts:230,337,515 (gpt-4o for SAP narrative and TLF shells) and /continuum has 0 client callers, so nothing AI can be demonstrated running |

## Where we stand

**Where we win**

- Depth and correctness of the deterministic statistical method library. server/services/stats/ is 6,324 LOC of genuine biostatistics, not wrappers: exact group-sequential operating characteristics computed by recursive numerical integration of the joint distribution of the sequential test statistics (Armitage–McPherson–Rowe; Jennison & Turnbull ch. 19) — deterministic, no RNG, reproducing the closed-form fixed-design result at a single look (server/services/stats/group-sequential-oc.ts:1-30, 586 LOC). Alongside it: multiplicity with Bonferroni/Holm/Hochberg/fixed-sequence/graphical procedures and FWER estimation (multiplicity.ts:56-276), MMRM sample size (280 LOC), RMST (183), win ratio (205), BOIN dose-finding (197), assurance (207), MRMC (145), Bayesian device (255), external control (461), enrollment forecast (319). 249 tests across 19 files pass in 2.54s. The source comments state scope limits honestly rather than hiding them — group-sequential-oc.ts:26-31 explicitly flags that futility boundaries are treated as BINDING and tells the user to omit them for the conservative non-binding type-I-error computation. That is the voice of a statistician, and it is rare.
- Intellectual honesty and determinism as an architecture. Zero LLM calls in biostatistics-judgment/, biostats-signal-engine/, ana-biostats/, estimand-engine-service.ts, sap-generator-service.ts and collaborative-sap-service.ts (verified by grep across all six). Computation provenance is a first-class module (server/services/stats/computation-provenance.ts) with seeded RNG (rng.ts, seedFromObject) and an LRU compute cache keyed by order-invariant stable hashing (compute-cache.ts, tested for key-order invariance). Define-XML generation is documented and built as byte-identical for identical metadata (server/services/cdisc/define-xml-generator.ts:11-12). This is precisely the specification-layer/validated-engine architecture Veristat launched in May 2026 — we arrived at it independently and can defend it.
- Breadth of regulatory-judgment content that no competitor ships as software. server/services/biostatistics-judgment/ is eight modules (~127 KB) covering power adequacy, assumption fragility, endpoint-method defensibility, tradeoff interpretation, statistical risk classification, role-aware reporting and artifact generation, exposed through a composed pipeline (biostatistics-judgment/index.ts:73 runJudgmentPipeline, :123 runPipelineAndGenerateArtifact, :155 runPipelineForRole). Cytel computes designs; it does not tell a Head of Biostatistics that an assumption is fragile and why a reviewer will object. This is the most genuinely differentiated asset in the repository.
- CDISC conformance breadth per dollar of engineering. server/services/cdisc/ is 2,786 LOC spanning SDTM domain conformance (396), SEND (324), ADaM ADSL (252) / BDS (303) / OCCDS (244), controlled terminology validation (214), Define-XML 2.1 generation (228) and package readiness (134), each with a matching test file. As a component library this is a real fraction of what Pinnacle 21 does, built small.

**Where we reach parity**

- SAP versioning and amendment governance as a data model. server/services/collaborative-sap-service.ts (718 LOC) is DB-backed via drizzle — not in-memory — with automatic diffing against the prior version (:88-135), section-level edits that mint a new version and refuse edits to a locked version (:137-207), threaded comments with parent/child resolution (:208-298), formal amendments linking previous to new version with recorded rationale (:299-340), and lock (:449+). Route-level audit trail exists (server/routes/biostatPlatform.ts:524). The model is at parity with Certara CoAuthor's document governance — but see the Part 11 defect under 'lose'.
- ICH E9(R1) estimand structure. server/services/estimand-engine-service.ts (884 LOC) models intercurrent events as first-class objects with per-ICE strategies, and validates that at least one ICE is identified and that every ICE names a strategy against the recognized E9(R1) strategy set (:229-253). Nobody in the comparison set ships a dedicated estimand engine, so structurally this is parity-to-slight-lead on paper — undercut by the reachability and fabrication defects below.
- Method-recommendation coverage relative to a design tool. The strategy-to-method mapping plus multiplicity/gatekeeping design (estimand-engine-service.ts:372-473, including parallel gatekeeping across hypothesis families) covers the analysis-selection conversation Cytel leaves to the statistician.

**Where we lose**

- THERE IS NO FRONT DOOR. This decides the category. shared/constants/ui-surface-registry.ts registers 47 surfaces with navTier distribution: 4 global, 21 project, 12 specialist, 7 admin. The four global-nav destinations are projects, apps, artifacts-center and ana-memory. Both biostatistics and biostat-workbench are navTier: 'specialist' — in neither global nor project navigation. They are reachable only by typing a deep link, because V2App routes /concept2cure/:surfaceId off the registry (client/src/concept2cure/v2/V2App.tsx:121). registryModel.ts:707 does place 'biostatistics' in a 'Science & intelligence' group for the health segment, but no rendered navigation consumes that group. A biostatistician handed this product cannot find the biostatistics module.
- 62 OF 63 ENDPOINTS ARE DEAD. server/routes/biostatPlatform.ts registers 48 endpoints and server/routes/biostat-design-stats.ts registers 15, both mounted at /api/biostat (server/bootstrap/register-document-routes.ts:404). Grepping client/src for every route family — continuum, design-optimizer, estimand, multiplicity, sap/create, external-control, adaptive, knowledge/query, judgment/analyze — returns zero callers for all nine. Exactly one endpoint has a client caller: /api/biostat/assurance at client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx:112. The entire SAP authoring, estimand, multiplicity, adaptive/IDMC, external-control and judgment surface area is unreachable code.
- THE SHIPPED UI DOES NOT USE THE GOOD ENGINES — IT DUPLICATES THEM IN THE BROWSER. client/src/concept2cure/v2/surfaces/Biostatistics.tsx (672 LOC) re-implements sample size client-side: computeContinuous (:252), computeBinary (:265), computeSurvival (:275), computeDevicePerformance (:283), computeDiagnostic (:289), dispatched at :297-302, with the file's own comment at :523 conceding 'the design/document body is computed in-browser deterministically.' Its only server call is a read of persisted artifacts (:527, /api/ana-biostats/governed-documents). So there are two divergent sample-size implementations, and the one users actually touch is the untested one. Under CSV this is disqualifying: you cannot validate a computation that the UI bypasses.
- NO STATISTICAL PROGRAMMING WHATSOEVER — one third of the category name is absent. Grep across server/services for SAS or R code generation and execution (proc mixed, proc lifetest, proc glm, .sas, generateSasCode, rscript, generateRCode) returns zero files. There is no compute environment, no SAS/R execution, no double programming, no ADaM dataset derivation. TLFs exist only as LLM-generated *shells* (server/services/statistical-continuum-service.ts:334-341, gpt-4o) — and /continuum has zero client callers, so even those are unreachable. Against Domino SCE QC and SAS LSAF this is not a gap, it is an absence.
- CDISC MODULES CANNOT READ A REAL SUBMISSION PACKAGE. No XPT, sas7bdat or Dataset-JSON parser exists anywhere in server/. The Define-XML generator consumes hand-supplied metadata objects — DefineVariable/DefineDataset TypeScript interfaces at server/services/cdisc/define-xml-generator.ts:22-45. Pinnacle 21 ingests actual datasets and highlights errors in real time. In a side-by-side demo, ours cannot be pointed at the customer's data.
- THE PART 11 E-SIGNATURE IS NOT PART 11 COMPLIANT. server/services/collaborative-sap-service.ts:388-446 signVersion accepts client-supplied signatureId, signerName, signerTitle, signerEmail, timestamp and method and writes them verbatim to the row. Its 'Part 11 compliance' check (:415-426) only asserts those fields are non-empty — presence checking, not identity verification. There is no re-authentication at the point of signing, no second distinct identification component, and no cryptographic binding of the signature to the signed content (no hash of the version stored with the signature). 21 CFR 11.100(a), 11.200(a)(1)(i) and 11.70 require exactly those properties. A caller can sign as anyone, at any timestamp. This fails an inspection and it fails a technical due-diligence read.
- A FABRICATED REGULATORY PRECEDENT CLAIM IS HARD-CODED INTO OUTPUT. server/services/estimand-engine-service.ts:388 emits, in every method recommendation regardless of indication, strategy or evidence: 'The "${estimand.strategy}" strategy with ${mapping.primary} is well-established in regulatory submissions. FDA, EMA, and PMDA have accepted this approach in recent approvals for similar indications.' This is an unsourced agency-acceptance assertion generated into a regulatory deliverable. It is a product-liability and credibility exposure, and it must be removed before any demo.
- NO VALIDATION PACKAGE OF ANY KIND. No IQ/OQ/PQ, no validation summary, no statistical qualification report benchmarking stats/* against SAS, R, nQuery or PASS reference values, no traceability matrix. 249 passing unit tests are good engineering and are not a CSV artifact. nQuery publishes validation documentation comparing its results to other statistical software; SAS LSAF leads with 'single GxP-validated environment.' This is the gate that stops the deal before features are ever discussed.
- NO SHIPPING AI IN THE CATEGORY. The deterministic engines contain no LLM — defensible and correct — but the only LLM path is statistical-continuum-service.ts (gpt-4o at :230, :337, :515) for SAP narrative and TLF shells, and that service has zero client callers. So against Cytel RCACTS, Certara CoAuthor and Veristat InStat, there is no AI capability a buyer can be shown running.

## Is the advantage durable?

LOW TO MODERATE, AND THE CLOCK IS ALREADY RUNNING WITH NOTHING TO SHOW FOR IT.

Separate the three candidate moats, because they decay at very different rates.

(1) The exact group-sequential OC engine and the broader stats library — NOT A MOAT, roughly 6-9 months to replicate. server/services/stats/group-sequential-oc.ts implements a published algorithm (Armitage–McPherson–Rowe; Jennison & Turnbull ch. 19) that any competent statistician-engineer pair can rebuild from the textbook. It is excellent work and it is not defensible IP. More to the point, Cytel already has a superior, submission-precedented implementation of the same math, so there is nothing here to defend against the one competitor who cares.

(2) The deterministic judgment layer (biostatistics-judgment/, 8 modules, ~127 KB) plus the estimand engine plus SAP governance — THE ONLY REAL CANDIDATE, and it is worth 12-18 months at most. The differentiated asset is not the computation, it is the encoded regulatory judgment: knowing that an assumption is fragile, that an endpoint-method pairing is indefensible, that a reviewer will object. No competitor in the set ships this as software. But two things are closing it fast. Certara already covers roughly 70% of the adjacent ground with CoAuthor's biomedical GPT plus Pinnacle 21's rule engine, and Certara has both the corpus and the regulatory-writing services business to encode the same judgment faster than we can. And Veristat's InStat, launched 13 May 2026, is the same architectural thesis — AI agents at the specification layer driving pre-validated statistical engines, explicitly avoiding LLM-generated analysis code — shipped with a CRO delivery model and biostatistician review behind it, which answers the 'who validates the judgment' objection that we cannot currently answer at all.

(3) The zero-LLM-in-computation architecture — NOT A MOAT, it is now table stakes. This was a genuine insight when it was built. As of May 2026 it is the headline of a competitor's launch press release. The window in which 'we don't let an LLM write the analysis' was a differentiator has closed.

THE COMPOUNDING PROBLEM: a moat requires a product in market to build brand, reference customers and encoded feedback around. We have none, because the module is not in the navigation and 62 of 63 endpoints are dead. Every month in this state is a month of pure decay — the judgment content ages against evolving ICH/agency practice with no customer signal to refresh it, while Certara and Veristat accumulate deployments. Meanwhile SAP drafting specifically, the piece most likely to be pitched as the AI story, is being actively commoditized from the academic side: SAPAI (King's College London CTU) drafted 71 SAPs in 1.0-3.4 minutes each with independent-statistician validation across nine real trials and SME ratings of 3.6-4.2/5, published in Clinical Trials with a public demo. Assume the floor price of 'AI drafts a SAP' approaches zero within 24 months.

HONEST CONCLUSION FOR AN ACQUIRER: there is no durable category moat here and there is no realistic path to one, because the two structural pillars of the category — a validated computing environment and a published qualification package — are exactly what we lack and are the most expensive things to acquire. What is durable is narrower and real: a tested, deterministic, provenance-carrying statistical component library (6,324 LOC, 249 passing tests) and a CDISC conformance module (2,786 LOC) that would take a competent team 9-12 months and a seven-figure engineering spend to reproduce at this quality. Value the asset as components with a 12-18 month head start, not as a market position. If the thesis is 'buy the category,' walk. If the thesis is 'buy the engines and drop them into a platform that already has navigation, an SCE and a CSV program,' the price should reflect roughly a year of saved engineering — and the fabricated-precedent string at estimand-engine-service.ts:388 and the non-compliant signVersion at collaborative-sap-service.ts:388-446 should be pre-close remediation conditions with holdback attached.

## Shortest credible path to parity

1. WEEK 1 — Remove the two liabilities before anyone sees a demo. (a) Delete the hard-coded regulatory assertion at server/services/estimand-engine-service.ts:388 and replace it with either a cited precedent retrieved from the knowledge graph or an explicit 'no regulatory precedent retrieved for this indication/strategy' — one day of work, and it is the difference between a credible product and a discoverable misrepresentation. (b) Add a one-line scope disclaimer to any surface asserting Part 11 compliance until item 3 lands.
2. WEEKS 1-2 — Open the front door. Change biostatistics and biostat-workbench from navTier:'specialist' to 'project' in shared/constants/ui-surface-registry.ts, and render the 'Science & intelligence' group that registryModel.ts:707 already defines. This is a configuration change plus nav wiring, it is the single highest ratio of deal impact to engineering cost in the entire category, and nothing else on this list matters until it is done.
3. WEEKS 2-5 — Kill the duplicate engine. Delete computeContinuous/computeBinary/computeSurvival/computeDevicePerformance/computeDiagnostic from client/src/concept2cure/v2/surfaces/Biostatistics.tsx:252-341 and have the surface call the server engines in server/services/stats/. This removes the dual-implementation defect that would otherwise sink any CSV effort, and it makes the 249 existing tests actually cover what users run. Do this BEFORE the validation package, not after — validating two implementations is wasted money.
4. WEEKS 2-5 (parallel) — Make the e-signature real. Rewrite server/services/collaborative-sap-service.ts:388-446: derive signer identity from the authenticated session rather than the request body, require a re-authentication challenge at the point of signing (second distinct identification component per 11.200(a)(1)(i)), store a SHA-256 hash of the signed version content alongside the signature so it cannot be excised or transferred (11.70), and write an append-only audit record. Roughly 2-3 weeks. This is a hard gate for every GxP buyer — it is not optional and it cannot be deferred to a services engagement.
5. WEEKS 4-12 — Wire the dead endpoints, in deal-impact order. Of the 48 unreachable routes in server/routes/biostatPlatform.ts, connect them in this sequence: SAP lifecycle (:391-556 — create, section edit, comment, amendment, sign, lock, audit trail, versions), then estimand (:276-390), then multiplicity (:318), then adaptive/IDMC (:692-830), then judgment (:950-1010). Six to ten weeks. Skip the external-control and knowledge families until a customer asks — they are not what wins this category.
6. WEEKS 8-20 — Produce the statistical qualification report. This is the highest-value item on the list for revenue, and the one most likely to be under-resourced. Benchmark every procedure in server/services/stats/ against published reference values from SAS, R, nQuery and PASS; document IQ/OQ/PQ; build a traceability matrix from requirement to test to result. nQuery publishes exactly this artifact and SAS leads with 'single GxP-validated environment' — without it the product does not reach technical evaluation no matter how good group-sequential-oc.ts is. Budget a contract statistician plus a CSV consultant; 8-12 weeks.
7. WEEKS 10-16 — Add real dataset ingestion. Implement XPT and CDISC Dataset-JSON readers feeding the existing checkers in server/services/cdisc/, so define-xml-generator.ts stops requiring hand-authored metadata objects (:22-45). Four to six weeks. Until this exists, any CDISC claim collapses the moment a prospect asks to point it at their own study — which Pinnacle 21 does in the first five minutes of its demo.
8. STRATEGIC — Concede statistical programming execution explicitly. Do not build a statistical computing environment. Domino and SAS have a multi-year, multi-hundred-engineer head start on SAS/R compute, double programming and lineage, and SCE QC (Nov 2025) just raised the bar again. Integrate instead: publish the SAP, estimand specification and TLF shells as structured artifacts a Domino or Posit environment consumes, and reposition the product as the design-and-governance intelligence layer that sits upstream of the SCE. This turns the largest 0/5 on the rubric from a losing comparison into a partnership, and it is the only positioning where the genuinely strong assets — the exact OC engine, the judgment layer, the estimand engine — are the point of the product rather than a footnote to it.

## Verdict

**🔴 Not competitive** — Scored as a product in this category, this cannot win a deal today — and the reason is not engine quality, it is that no buyer can reach the engines. Weighted against the four critical dimensions the outcome is stark: reachable front door 1/5, validation package 0/5, statistical programming execution 0/5, Part 11 signature integrity 1/5. Losing all four criticals is disqualifying regardless of what the high-weight dimensions say.

The specific, verifiable facts a buyer will find in the first hour of technical diligence: 62 of 63 registered biostatistics endpoints have zero client callers, with only /api/biostat/assurance wired (BiostatWorkbench.tsx:112). Both biostatistics surfaces are navTier:'specialist' in a registry whose global navigation contains four destinations, none of them biostatistics. The one surface that does render re-implements sample size in the browser (Biostatistics.tsx:252-341) instead of calling the tested server engines — two divergent implementations of the same computation, and users touch the unvalidated one. The category's third pillar, statistical programming, is entirely absent: no SAS or R generation or execution anywhere in server/. The CDISC modules cannot ingest a real dataset. signVersion accepts a client-supplied signer name and timestamp with no re-authentication and no content hash, so it fails 11.100(a) and 11.200(a)(1)(i) outright. And estimand-engine-service.ts:388 emits a hard-coded, unsourced claim that FDA, EMA and PMDA have accepted the recommended approach — a fabricated regulatory precedent shipped into a regulatory deliverable.

None of that contradicts the other honest finding: the underlying statistical work is good. The exact group-sequential operating-characteristics engine (586 LOC of recursive numerical integration per Jennison & Turnbull, deterministic, with binding-futility scope stated openly at :26-31) is work a competent trial statistician wrote, not scaffolding. 249 tests pass across 19 files in 2.54s. The 6,324-line stats library, the 2,786-line CDISC module, the 8-module judgment layer and the drizzle-backed SAP amendment model are real components. The zero-LLM-in-computation architecture independently matches the posture Veristat shipped in May 2026 and is the one that is winning the credibility argument.

So the correct read for an acquirer is that this is an engine library mispresented as a platform. As a product line in Biostatistics/SAP/statistical programming it is not competitive and would not survive a bake-off against Cytel on design, Certara on standards, or Domino on execution. As a set of components to fold into an existing biometrics platform that already has navigation, a compute environment and a validation program, the stats and CDISC modules have genuine value. Price it as the former, diligence it as the latter — and treat the fabricated-precedent string and the e-signature defect as pre-close remediation conditions, not post-close backlog.
