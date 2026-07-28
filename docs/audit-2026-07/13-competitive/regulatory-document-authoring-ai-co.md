# Regulatory document authoring & AI co

> **Verdict: 🔴 Not competitive**
> Weighted capability score — **us 1.9 / 5** vs **best competitor 4.7 / 5** across 12 dimensions.

**Full category as scoped:** Regulatory document authoring & AI co-authoring (eCTD/CTD module, CSR, IB, protocol, narrative drafting with LLM assistance, under GxP/Part 11 governance)

## Who buys, and what they are actually buying

Global Head of Medical Writing or VP Regulatory Affairs (with Reg Ops as co-signer and QA/CSV as gatekeeper). The budget is the medical-writing outsourcing line — CRO/FSP writer hours per submission, typically $300K–$3M/yr for a mid-cap. What they buy is: a defensible first draft of a CSR/Module 2.x/IB produced in days instead of weeks, in Word, with every claim traceable to a source, that QA will let them file. They do not buy an editor; they buy fewer contracted writer hours plus an audit story that survives an FDA inspection. The QA/CSV gate is a hard veto: no validation package, no purchase, regardless of demo quality.

## Market structure

STRUCTURE — a barbell, and we sit in the empty middle. One end is the system of record: Veeva Vault RIM already holds the customer's regulatory content, workflows and validated Part 11 environment. The other end is a well-funded AI-native challenger tier: Peer AI ($12.1M, Oct 2025, Flare Capital + SignalFire), Weave Bio ($36M Series A, Oct 2025, USVP, following $10M in May 2024, 59 employees as of 2026-06-30), and Ritivel (Y Combinator W26, agents drafting CTDs/CSRs/INDs/BLAs directly in Microsoft Word, sourcing from SharePoint and Veeva, founders ex-Microsoft Research AI copilots). In between sit the specialist AI writing vendors — Certara CoAuthor, Yseop Copilot, Narrativa Navigator. A platform with neither the content estate nor the capital nor a Word-native editor has no natural position on this barbell.\n\nCONSOLIDATION VIA PARTNERSHIP, NOT M&A — the defining market dynamic. Veeva converted its two most credible competitors into channel: Yseop joined the Veeva AI Partner Program in September 2024 (Copilot ↔ Vault RIM integration for visibility, data quality and agility), and Certara joined to connect CoAuthor's generative AI to content stored in Vault RIM. The strategic consequence is that "best AI writer" is no longer a standalone category — it is a plug-in slot on Veeva's platform. Any vendor without a Vault connector is competing for a slot that has already been filled twice.\n\nTHE 2026–2027 WINDOW. Veeva's own roadmap defines the timing. Clinical/Regulatory/Medical AI Agents are slated for August 2026 and are intelligence-and-QC features — auto-tagging, regulatory intelligence extraction, submission-timeline prediction, labeling paragraph analysis, missing-content detection, drafting HA question responses — not full document generation. Agentic Authoring, the application that proactively drafts submissible documents natively into Vault RIM and Word when incoming data meets conditions, is expected late 2027. That leaves roughly 18 months in which the incumbent cannot demo native AI first-draft generation. Every challenger in this analysis is sprinting into that window right now.\n\nPRICING AND DEAL SIZE. Only Veeva has usable public signal: Vault RIM baselines around $500–$1,000 per user per year at small scale; Veeva prices per enterprise deal with no public rate card; the "enterprise redline" is estimated near $500K/yr of combined Vault spend, with large pharma at $1–5M+ annually and reduced per-user rates under those deals; implementation runs $10K–$50K for SMB covering consulting, configuration, migration and training. Certara, Yseop, Narrativa, Peer AI and Weave Bio all publish no pricing and require a demo to obtain cost. Yseop is listed on AWS Marketplace but the listing returned 403 to automated fetch, so its terms are not verified. One third-party customer account claims Narrativa's patient-narrative automation displaced roughly $500K of CRO spend — a proxy for the pain being displaced, not a license price, and not independently verified. Practical read: AI-native challenger ACVs are low-to-mid six figures; the specialist vendors ride existing service relationships; Veeva is the only seven-figure motion.\n\nHOW THE DEAL IS ACTUALLY WON. Three published proof points dominate evaluations: Yseop's less-than-7%-requiring-re-authoring on a GSK CSR; Narrativa's 65,000 regulatory documents delivered with agentic AI in 2025; Peer AI's customer-reported 55–94% drafting acceleration with claimed Top 20 pharma adoption. Buyers now open conversations by asking for the number. There is no equivalent number for Concept2Cure.RI — no named customer, no measured acceptance rate, no third-party award. In a market where every vendor's demo looks similar, the published metric is the differentiator, and acquiring one is cheaper than building most of the missing features.\n\nPROCUREMENT PATTERN. Three gates in sequence. (1) The writer gate: does it work in Word, and does it round-trip tracked changes — this is why Certara, Yseop and Ritivel all deliver through Word rather than a browser canvas. (2) The QA/CSV gate: a hard veto, where Veeva's validated platform is the reference standard and the AI-natives are conspicuously silent — none of Peer AI, Weave Bio or Ritivel publishes a CSV package or Part 11 attestation, which is the one place a challenger can genuinely differentiate. (3) The IT gate: does it read from where our content already lives (Vault, SharePoint), because content migration for an unproven vendor is a non-starter. A product that fails gate 1 never reaches gates 2 and 3 — which is precisely our position, since our strength sits entirely in gate 2.

## The five closest competitors

### Certara — CoAuthor (Certara.AI platform)

The incumbent AI regulatory-writing product for medical writers — 'human-at-the-helm' drafting inside Microsoft Word, sold by the company that also sells the regulatory writing services, so it lands with existing CRO relationships.

**Strengths**

- Native Microsoft Word integration — writers stay in the tool they already validate, train on, and template against; zero editor-migration risk
- Comprehensive eCTD writing templates spanning Modules 1–5, not a single document type
- Sold alongside Certara's regulatory writing services, so the buyer can start as a service engagement and convert to software — the lowest-friction procurement path in this category
- Veeva AI Partner Program integration means it reads from where the customer's content already lives rather than demanding migration
- Brand trust with regulatory affairs buyers built over a decade of submission consulting

**Weaknesses**

- Word-bound: no strong structured/component single-source story compared to purpose-built structured content management
- Client-specific GPT means per-customer tuning cost and slower time-to-value than a general agentic product
- Public validation/Part 11 documentation is thin — ISO 27001 and Part 11 compliance are documented for certain modules but not explicitly confirmed for all modules on public pages (not verified)
- No public pricing or self-serve motion makes it slow to evaluate for emerging biotech
- Perceived as a services company selling software, which invites the 'are we buying a tool or a retainer' objection

| | |
|---|---|
| AI shipped today | Ships today: a life-science-specialized, client-specific GPT combined with structured content authoring and eCTD regulatory writing templates covering Modules 1–5. Marketed as AI-assisted drafting with the writer retaining control, not autonomous generation. Joined the Veeva AI Partner Program to flow content between Vault RIM and CoAuthor. |
| GxP / validation posture | ISO 27001 certification and 21 CFR Part 11 compliance are documented for certain modules; explicit confirmation for all modules is not on public pages. Full GxP validation documentation requires direct contact with Certara. Treat as: credible but not publicly verified end-to-end. |
| Pricing signal | Not public. No rate card, no per-seat or per-submission figure, no free trial or self-serve onboarding — evaluation requires a sales demo. Certara reports a 'Regulatory and Medical Writing' segment in its IR supplemental disclosures, so deal size is bundled with services engagements. |

<details><summary>Sources</summary>

- https://www.certara.com/coauthor/
- https://ir.certara.com/news-releases/news-release-details/certara-launches-next-generation-coauthortm-generative-ai
- https://www.certara.com/announcement/certara-joins-veeva-ai-partner-program-to-simplify-and-expedite-regulatory-submissions-for-life-sciences/
- https://www.certara.com/certara-ai/
- https://ir.certara.com/static-files/86ae3d22-94bc-4639-8d28-fac8668c66f6
- https://www.assyro.com/insights/ectd-software-vendors

</details>

### Yseop — Yseop Copilot (incl. 'One-Click Dossier')

The deepest data-to-document automation in the category — starts from clinical datasets and TLFs, not from a blank page. Positions on measured re-authoring rate rather than on editor experience.

**Strengths**

- The only competitor with a published, customer-attributed quality metric: less than 7% of generated content required re-authoring on a GSK CSR — this single number wins evaluations
- True structured-data-to-narrative: table-to-text and data integration, which is where the actual writer hours are spent
- Word plug-in preserves the writer's existing workflow and validated toolchain
- Explicit GxP compliance, data privacy and model explainability posture aimed directly at the QA/CSV gatekeeper
- Joined Veeva's AI Partner Program (Sept 2024), integrating Copilot with Vault RIM for visibility and data quality
- External validation signals: 2026 BIG Innovation Award for regulatory writing with generative AI; TIME Best Inventions 2025 (Medical & Healthcare)

**Weaknesses**

- Narrow document set — heavily clinical (CSR/narrative/summary/IB/ICF); much weaker on CMC Module 3, device 510(k)/CER, and administrative Module 1
- Requires clean, standardized source data (ADaM/SDTM/TLF) to hit the headline numbers; messy sponsors get far worse results
- Deployment is heavyweight — data pipeline integration, not a login
- No independent third-party verification of the <7% figure; it is a single vendor-published customer case
- Word plug-in means it inherits Word's weak multi-user co-authoring and governance, pushing control back to the customer's DMS

| | |
|---|---|
| AI shipped today | Ships today: automated generation of CSR, Clinical Trial Narrative (CTN), Summary of Clinical Safety (SCS), Summary of Clinical Efficacy (SCE), Investigator's Brochure (IB) and Informed Consent Form (ICF). Generates a complete CSR first draft combining data-driven sections with reuse from approved templates. Delivered through a Microsoft Word plug-in. 'One-Click Dossier' automates data ingestion through draft creation end to end. Explicit emphasis on AI model explainability alongside accuracy and reliability. |
| GxP / validation posture | Publicly claims GxP compliance, data privacy controls, accuracy/reliability and AI model explainability as core product properties, and states output is validated against regulatory rules and templates. Specific IQ/OQ/PQ or CSV package contents are not public (not verified). |
| Pricing signal | Not public. Listed on AWS Marketplace (private-offer style listing; no public rate card retrievable — listing page returned 403 to automated fetch, so terms are not verified). Enterprise contract motion; contact-sales only. |

<details><summary>Sources</summary>

- https://yseop.com/
- https://yseop.com/medical-writing-automation/
- https://yseop.com/regulatory-document-automation/
- https://aws.amazon.com/marketplace/pp/prodview-wzkfr67cebozi
- https://markets.financialcontent.com/firstheritage/article/gnwcq-2025-6-16-yseop-unveils-roadmap-to-one-click-dossier-accelerating-scalable-compliant-regulatory-writing
- https://markets.financialcontent.com/wral/article/gnwcq-2024-9-5-yseop-joins-veevas-ai-partner-program-to-accelerate-regulatory-document-writing-and-ai-driven-content-automation
- https://yseop.com/blog/generative-ai-biopharma-innovation/

</details>

### Veeva Systems — Vault RIM Suite + Veeva AI (Regulatory AI Agents) + Agentic Authoring

Not the best authoring tool — the tool that owns the content. Veeva already holds the customer's regulatory documents, workflows, and validated Part 11 environment, so authoring becomes a feature of the system of record rather than a separate purchase.

**Strengths**

- Owns the system of record — displacing Veeva means a content migration nobody wants to sponsor
- Validated, inspected, Part 11 GxP platform with a decade of customer audit history; QA sign-off is effectively pre-granted
- Incumbency in RIM, QualityDocs, eTMF and submissions publishing means one vendor, one validation, one audit trail
- Partner program converts would-be competitors (Certara, Yseop) into features, neutralizing point solutions
- Gartner Peer Insights presence and enterprise procurement familiarity shorten the buying cycle

**Weaknesses**

- Agentic Authoring is a late-2027 expectation, not a 2026 product — there is a real ~18-month window where Veeva cannot demo native AI first-draft generation
- AI Agents (Aug 2026) are intelligence and QC features (tagging, gap-spotting, HA response drafting), not full document generation
- Cost: $500K–$5M+/yr enterprise deals price out emerging biotech entirely
- Configuration-heavy and slow to change; every customization re-triggers validation
- Partner-dependency for the highest-value capability means the customer buys two contracts and owns the integration seam

| | |
|---|---|
| AI shipped today | Shipping/near-term: Clinical, Regulatory and Medical AI Agents slated for August 2026 — auto-tagging documents, extracting regulatory intelligence, predictive insights such as submission-timeline estimation, labeling paragraph analysis, spotting missing content, and drafting responses to health authority questions. Agentic Authoring — an application that proactively drafts submissible documents, integrates natively with Vault RIM and Microsoft Word, monitors incoming data and initiates drafting when conditions are met — is expected late 2027, i.e. NOT shipping as of 2026-07. Today the AI-authoring gap is filled by partners (Certara CoAuthor, Yseop) via the Veeva AI Partner Program. |
| GxP / validation posture | Strongest in the category. Vault is a validated GxP/Part 11 platform with vendor-supplied qualification documentation, release-by-release validation support (e.g. 26R2 cycle), and an extensive record of customer and regulator audits. This is the reference standard other vendors are measured against. |
| Pricing signal | Vault RIM baselines around $500–$1,000 per user per year at small scale. Veeva prices on enterprise-deal basis with no public rate card; the 'enterprise redline' is estimated around $500K/yr combined Vault spend, and large pharma pay $1–5M+ annually with reduced per-user rates. Implementation typically $10K–$50K for SMB, covering consulting, configuration, migration and training. |

<details><summary>Sources</summary>

- https://www.clinicaltrialvanguard.com/conference-coverage/veeva-unveils-falcon-ai-platform-and-agentic-authoring-at-2026-summit/
- https://intuitionlabs.ai/articles/veeva-vault-pricing-2026-cost-breakdown
- https://intuitionlabs.ai/articles/veeva-vault-26r2-release-preview
- https://www.gartner.com/reviews/product/veeva-vault-rim-guide
- https://intuitionlabs.ai/articles/veeva-vault-rim-guide-2
- https://www.gartner.com/reviews/product/veeva-vault-rim-suite
- https://www.certara.com/announcement/certara-joins-veeva-ai-partner-program-to-simplify-and-expedite-regulatory-submissions-for-life-sciences/

</details>

### Narrativa — Narrativa Navigator (Clinical Atlas · Narrative Pathway · TLF Voyager · Redaction Scout)

Agentic AI at production volume — sells throughput and traceability rather than editor experience. Aimed at teams drowning in patient narratives and TLF-to-text work.

**Strengths**

- Published production volume (65,000 documents in 2025) is the strongest throughput evidence in the category
- Agent decomposition (dataset → TLF → table-to-text → QA) maps to how CSR work is actually staffed, so the ROI story is legible to a writing lead
- Broadest ancillary coverage: redaction (Redaction Scout) and TLF generation are adjacent budgets other vendors ignore
- Publishes explicit guidance on validating AI-generated regulatory content — meets the QA gatekeeper on their own terms
- Expanding into adjacent verticals (veterinary regulatory with VMD Sciences), indicating a repeatable agent architecture

**Weaknesses**

- Weaker brand recognition with large-pharma regulatory affairs buyers than Certara or Veeva
- No published quality metric comparable to Yseop's <7% re-authoring figure
- No public pricing and no self-serve evaluation
- Positioning spread across many sub-products risks a 'suite of demos' impression versus one deep capability
- Depends on structured clinical data quality; same ceiling as Yseop without the marquee customer proof point

| | |
|---|---|
| AI shipped today | Ships today: specialized AI agents across the regulatory documentation lifecycle that analyze data, apply regulatory rules, generate compliant narratives and validate outputs with full traceability. Clinical Atlas automates CSR and protocol generation via agents for dataset creation, TLF generation, table-to-text conversion and QA validation. Also covers patient narratives, eCTD document generation/transformation/maintenance, redaction, and collaborative authoring. Published a delivery figure of 65,000 regulatory documents produced with agentic AI in 2025. |
| GxP / validation posture | Publishes a public position on how to validate AI-generated regulatory content (demonstrating outputs are reliable, consistent and fit for intended use) and markets full traceability on agent outputs. A formal vendor CSV/IQ-OQ-PQ package is not public (not verified). |
| Pricing signal | Not public. One third-party customer account claims patient-narrative automation replaced roughly $500K of CRO spend — a deal-size proxy for the pain being displaced, not a license price (single-source, not independently verified). |

<details><summary>Sources</summary>

- https://www.narrativa.com/ai-agents-regulatory-life-sciences/
- https://www.narrativa.com/delivering-65000-regulatory-documents-with-agentic-ai-in-2025/
- https://www.narrativa.com/ectd-automation/
- https://www.narrativa.com/automation-of-clinical-study-reports/
- https://www.narrativa.com/ai-regulatory-content-validation/
- https://www.narrativa.com/narrativa-and-vmd-sciences-bring-agentic-ai-to-veterinary-regulatory-documentation/

</details>

### Peer AI — Peer AI regulatory platform (agentic authoring + submission orchestration + query prediction)

The funded AI-native challenger — unified agentic platform spanning authoring, orchestration and regulatory-query prediction, with medical writers kept in the oversight seat. This is the company most likely to be in the same competitive bake-off as Concept2Cure.RI.

**Strengths**

- Customer-reported drafting acceleration of 55–94%, with claimed adoption by Top 20 pharma and emerging biotech — the most specific efficiency range published by an AI-native entrant
- Unified scope (author + orchestrate submission + predict HA queries) matches the workflow, not just the document
- Query prediction is genuinely differentiated — it moves the value from drafting speed to approval risk, which is a bigger budget
- Venture-funded and expanding fast (Oct 2025 raise, Apr 2026 platform expansion), so feature velocity outpaces incumbents
- Explicit human-oversight framing defuses the QA objection early

**Weaknesses**

- $12.1M total funding is small — enterprise procurement will run vendor-viability diligence and may require escrow or a parent guarantee
- No public GxP/CSV validation package or Part 11 attestation (not verified)
- No public pricing; early-stage commercial motion means inconsistent implementation quality
- Efficiency claims are vendor-published and customer-anonymized; 55–94% is a very wide band that implies high variance
- Competing head-on with Weave Bio ($36M Series A) for the same AI-native budget, with more capital on the other side

| | |
|---|---|
| AI shipped today | Ships today: specialized AI agents automating document creation across protocols, CSRs, patient narratives, INDs, Investigator's Brochures and plain-language summaries, with writers retaining oversight and control. April 2026 expansion added real-time visibility and control across every document plus predictive intelligence that aligns submissions with regulator expectations before filing. Single unified platform for authoring, submission orchestration and query anticipation. |
| GxP / validation posture | Not verified. No public CSV/IQ-OQ-PQ package, Part 11 attestation or audit history located. Markets human-in-the-loop oversight and compliance maintenance as the control story rather than a formal validation deliverable. |
| Pricing signal | Not public. $12.1M total funding announced October 2025, led by Flare Capital Partners and SignalFire — implies startup-scale ACVs (low six figures) and a land-and-expand motion, not enterprise-suite pricing. |

<details><summary>Sources</summary>

- https://www.prnewswire.com/news-releases/peer-ai-raises-12-1-million-to-accelerate-drug-approvals-with-an-intelligent-regulatory-workflow-302576612.html
- https://www.prnewswire.com/news-releases/peer-ai-expands-platform-to-provide-real-time-program-visibility-and-predict-regulatory-queries-302741400.html
- https://www.signalfire.com/blog/peer-ai-investor
- https://www.crunchbase.com/organization/peer-1121
- https://intuitionlabs.ai/articles/peer-ai-weave-bio-regulatory-tools-analysis

</details>

### Weave Bio — Weave Bio platform / AutoIND

AI-native regulatory automation organized around the filing, not the document — single source of truth across jurisdictions, from IND/CTA through NDA. The best-capitalized AI-native challenger.

**Strengths**

- Best-capitalized AI-native competitor ($36M Series A, USVP) — survives vendor-viability diligence better than peers
- eCTD-native output formatting from the start, so the draft lands in a publishable shape rather than needing reformatting
- Cross-jurisdiction single-source-of-truth architecture directly attacks the most expensive problem in global filings (reusing one dossier across FDA/EMA/PMDA)
- Covers the full arc — authoring, review, publishing, response management — rather than drafting alone
- AutoIND gives it a sharp, demonstrable wedge product for emerging biotech's first filing

**Weaknesses**

- Small team (59 as of mid-2026) for the breadth of scope claimed; execution risk across authoring + publishing + response management
- No public GxP/CSV validation package or Part 11 attestation located (not verified)
- No public pricing and demo-gated evaluation slows emerging-biotech adoption, its natural market
- IND-first heritage means less depth on CSR/narrative volume work where Yseop and Narrativa are strongest
- Competes with Veeva on publishing/submission management — a fight against an incumbent with a validated platform

| | |
|---|---|
| AI shipped today | Ships today: AutoIND takes source data (study reports, lab results, prior submissions) and generates draft regulatory documents — narratives, tables, figures — formatted to eCTD standards using eCTD-formatted templates, covering authoring, review, publishing and response management. June 2026: global submission capability giving one connected platform for every filing across a program's lifecycle from a single source of truth. |
| GxP / validation posture | Not verified. No public CSV package, IQ/OQ/PQ documentation or Part 11 attestation located. Positions on eCTD-standard output conformance rather than on system validation. |
| Pricing signal | Not public; demo required to obtain cost. $36M Series A October 2025 led by USVP (plus a prior $10M in May 2024). 59 employees as of 2026-06-30 — implies a focused mid-market/biotech ACV, likely low-to-mid six figures. |

<details><summary>Sources</summary>

- https://www.weave.bio/
- https://finance.yahoo.com/sectors/healthcare/articles/weave-bio-enables-global-submissions-120000938.html
- https://markets.financialcontent.com/dowtheoryletters/article/bizwire-2024-5-30-weave-bio-announces-10m-in-new-funding-and-launch-of-its-ai-powered-platform-to-streamline-drafting-reviewing-and-submitting-regulatory-documents-in-drug-development
- https://thebrightbyte.com/playbook/expertise/regfo-vs-weave-bio
- https://www.excedr.com/blog/weave-bio-ai-powered-regulatory-automation-for-drug-development
- https://tracxn.com/d/companies/weave/__3YLvroH9wm_teS4j6UKrDVlE8QQaypv4Bc4ntIqPAkg

</details>

## Capability rubric

Our score is cited to `file:line` in this repository. Theirs is cited in the competitor sections above. Scored on what **ships and is reachable**, not what is architected — an unreachable or unvalidated capability scores low regardless of code quality.

| Dimension | Weight | Us | Best competitor | Their score | Our evidence |
|---|---|:--:|---|:--:|---|
| Editor fidelity & Word round-trip (styles, tables, TOC, cross-refs, tracked changes, .docx in/out) | critical | **1** 🔻 | Certara CoAuthor | 5 | client/src/concept2cure/v2/surfaces/DocumentAuthoring.tsx:636 — the shipped authoring canvas is a plain <textarea> holding plain text (no rich text, no tables, no styles). server/routes/authoring.router.ts:4884 — DOCX export is a 6-line inline `require('docx')` emitting title + one HEADING_1 + one Paragraph per section: no styles, numbering, TOC, tables, headers/footers or eCTD Word template. No .docx import anywhere (grep for mammoth/importDocx returns zero). No Office add-in / Office.js manifest in the client. |
| AI first-draft generation wired into the authoring surface (in-canvas generate / accept / reject) | critical | **2** 🔻 | Yseop Copilot | 5 | server/routes/authoring.router.ts:2500 — /sections/:id/ai/draft is genuinely real: hybrid RAG (searchHybrid, k=5, threshold 0.65) over the Data Room, [SRC-n] citation discipline, anti-fabrication instruction, routed through the AI gateway. But it has ZERO client callers (grep 'ai/draft' across client/src returns nothing). client/src/concept2cure/v2/surfaces/DocumentAuthoring.tsx:596 — the only AI affordance in the editor is 'Draft with AnA', which calls onAsk(draftPrompt), i.e. hands off to a chat assistant and injects nothing into the canvas. server/routes/authoring.router.ts:2730 (/ai/deficiency-scan) likewise has zero client callers. server/services/authoring/section-generation-service.ts is stronger still (SSE streaming, per-claim citations, explicit `ungrounded` reporting, audited, persisted as a governed artifact) but is reachable only through client/src/concept2cure/submission/_install/submissionClient.ts:146 — a drop-in kit whose workspaces.tsx slots still render `Temporary`. |
| Structured clinical data → narrative (ADaM/SDTM/TLF ingestion, table-to-text) | critical | **1** 🔻 | Yseop Copilot | 5 | absent — the authoring path ingests only free-text Data Room chunks via enhancedEmbeddingService (server/routes/authoring.router.ts:2530-2545). No TLF ingestion, no table-to-text, no dataset connector anywhere under server/services/authoring/ or server/routes/authoring*.ts. |
| Part 11 electronic signature, freeze, and signature-to-record binding | critical | **4** 🔻 | Veeva Vault RIM | 5 | server/routes/authoring.router.ts:5074 — /docs/:docId/sign takes the signer from the VERIFIED principal via getActorEmail (explicitly not x-user-email), requires PIN + reason, computes a reproducible signature digest over durable columns bound to the frozen snapshot (§11.70 record link), persists covered_freeze_version + covered_content_hash, and writes an audit event. :3288 freeze, :3372 e-sign, :5198 signatures, :5232 audit. REACHABLE: client/src/concept2cure/v2/surfaces/AuthoringFilingBar.tsx:76 (freeze) and :96 (e-sign) with a §11.50 meaning selector and intent declaration. This is the strongest part of our implementation. |
| Vendor validation package / CSV posture the customer's QA will accept | critical | **2** 🔻 | Veeva Vault RIM | 5 | docs/validation/ holds a genuine artifact set — VMP, IQ, OQ, PQ, ISO 14971 risk analysis, cloud vendor qualification, validation summary report, HIPAA/FDA security assessment — plus docs/validation/TM-CORTEX-001-PART11-TRACEABILITY.md, a code-linked Part 11 matrix (P11-01..P11-12) naming the implementing module and the CI gate for each clause. But docs/validation/VMP-CORTEX-001-VALIDATION_MASTER_PLAN.md:9-11 states 'Version 1.0.0-DRAFT ... ⚠️ DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE', approver PENDING, and P11-01 lists IQ/OQ/PQ execution records as '(operator)' — i.e. the vendor supplies templates, the customer executes. Its §1.2 scope table names Cortex AI components, not the authoring module. No executed package, no customer audit history. |
| Claim-level source provenance and staleness detection (does the citation still hold?) | high | **4** | Peer AI | 4 | client/src/concept2cure/v2/surfaces/DocumentAuthoring.tsx:88-108 — SectionSource carries a server-computed checksum state machine: current \| changed \| unverified \| unresolved, so a citation whose source moved after citing is flagged rather than silently trusted. Backed by server/routes/authoring.router.ts:1909/1924/1983 (sources, cite-source, citations), :770/:3622 (evidence tokens), :3654 (refresh-token), :3987 (refresh-all) and :3938 (/docs/:docId/diff-since-export). This is a real, shipped differentiator and the one dimension where we are at or above the funded AI-natives. |
| (doc_type × agency) rule-pack breadth and depth | high | **2** 🔻 | Certara CoAuthor | 4 | NOT 8 agencies × 16 doc types. migrations/20260528_phase9_document_schema.sql:209-217 seeds 13 packs / 115 sections; migrations/20260529_phase9_backfill.sql adds 5 more (bla·fda, denovo·fda, nda·fda, maa·ema, jnda·pmda) — 18 packs total across 5 agency codes (fda, ema, mhra, ich, pmda) and 17 doc types, not a 128-cell matrix. Depth is shallow: IND×MHRA is 4 sections; NDA/BLA/MAA/J-NDA packs are 5 module-level headings each. Worse for this category, the packs hang off c2c_documents (server/routes/c2c/documents.ts:217-233) — a document model entirely separate from the authoring_documents / authoring_sections tables the shipped editor uses, so the rule packs do not drive the editor. |
| Real-time multi-writer co-authoring (live cursors, CRDT merge, durable locks) | high | **1** 🔻 | Veeva Vault RIM | 4 | server/services/hocuspocus-server.ts:88 — CRDT collaboration is behind ENABLE_COLLAB_CRDT and off by default; its own header (lines 14-26) records that no browser WebSocket ever established, no persistence existed, and 'nothing imports @hocuspocus/provider' — confirmed, grep across client/ returns zero importers. TipTap is in package.json:213-230 but the only component using it, client/src/components/ui/editor.jsx, is imported by nothing. What ships is REST presence + locking (client/src/concept2cure/v2/surfaces/AuthoringCollab.tsx → /api/realtime-collab/rooms and /locks), and server/routes/realtime-collab.ts:240 and :377 hold rooms and locks in in-memory Maps — so a Part 11 section lock is lost on restart and does not hold across instances. |
| Review, comment, tracked-change and approval workflow | high | **3** 🔻 | Veeva Vault RIM | 5 | Real and reachable: server/routes/authoring.router.ts:2013/2095/2160/2260 (comments CRUD), :2315/:2352/:2430 (reviews, request-review), :5040 (workflow), :1609/:1655 (revision history + revert, snapshotting current content before revert), rendered in DocumentAuthoring.tsx's right rail. Gap: tracked changes exist server-side at :5830/:5894/:5963 (/documents/:id/tracked-change-decisions, incl. bulk) with ZERO client callers — grep 'tracked-change' across client/src returns nothing — and the textarea canvas has no redline rendering at all. |
| Content reuse / structured component authoring (single-source across documents) | high | **1** 🔻 | Certara CoAuthor | 4 | absent — no component library, no reuse-with-variant, no single-source propagation in the authoring path. server/routes/authoring.router.ts:4060 (/apply-template) and :995 (/templates/apply/:id) only stamp a section skeleton from authoring_templates; there is no cross-document component identity. |
| Discoverability — can an evaluator find and reach the product in the shipped UI? | critical | **2** 🔻 | Certara CoAuthor | 5 | CONFIRMED as of HEAD 576ec5dd5. client/src/concept2cure/v2/registryModel.ts:116-122 — RAIL_PRIMARY is exactly five destinations (Chats, Projects, Communication Center, Apps, Settings). registryModel.ts:132 — 'document-authoring' sits in NAV_HIDDEN, one of 42 demoted ids, against 100 registered entries in client/src/concept2cure/v2/surfaceViews.ts. Not unreachable: Shell.tsx:983-994 searches all UI_SURFACES (not filtered by NAV_HIDDEN) so ⌘K finds it by label 'Document editor & authoring'; DEEP_LINK_ALIASES (registryModel.ts:1066-1070) maps /concept2cure/device-submission to it; and registryModel.ts:263 makes it the defaultSurface for the medical_writing segment, honored at V2App.tsx:260. Net: a buyer landing in the product will not find the flagship authoring surface unless they press ⌘K or their tenant is on one specific segment. Every competitor's authoring product is the front door. |
| Integration into the customer's existing content estate (Veeva, SharePoint, Word) | critical | **0** 🔻 | Ritivel / Certara CoAuthor | 5 | absent — no Veeva connector, no SharePoint connector, no Word add-in and no Office.js manifest in the client (the only Office.js reference in the repo is server/services/ectdExportService.ts, unrelated to authoring). server/routes/docx-factory.ts:45-53 is not an engine but a proxy to an external 'shadow service' that 503s unless REVIEW_ADMIN_TOKEN is set, and its only client caller is client/src/concept2cure/components/ana/Ana.tsx:881. Certara, Yseop and Ritivel all draft inside the customer's own Word; Ritivel additionally sources from SharePoint and Veeva. |

## Where we stand

**Where we win**

- Signature-to-record binding done properly. server/routes/authoring.router.ts:5074 derives the signer from the verified principal, requires PIN + declared meaning + intent, and computes a REPRODUCIBLE digest bound to the frozen snapshot (covered_freeze_version + covered_content_hash) — a §11.70 link an inspector can independently recompute. The code comments record that the prior digest hashed a timestamp and was unverifiable, and that it was fixed. Most AI-native competitors (Peer AI, Weave Bio, Ritivel) publish no Part 11 attestation at all. This is a genuine, demonstrable win over the challenger set.
- Citation staleness as a first-class state. The current | changed | unverified | unresolved checksum state machine (DocumentAuthoring.tsx:88-108, computed server-side) answers a question no competitor answers publicly: not 'where did this claim come from' but 'does that source still say what it said when we cited it'. Combined with /docs/:docId/diff-since-export (authoring.router.ts:3938) and /refresh-all (:3987), this is a defensible product idea for change control on a live dossier.
- Governance depth per document. Freeze (:3288), e-sign (:3372/:5074), immutable revision snapshot on every save (:1474), revert-that-snapshots-first (:1655), export history with hash (:3811), audit trail (:5232), workflow steps with role-gated approval — reachable end-to-end from AuthoringFilingBar.tsx:76/96. Peer AI and Weave Bio sell speed; nobody in the AI-native tier ships this governance surface.
- A code-linked Part 11 traceability matrix. docs/validation/TM-CORTEX-001-PART11-TRACEABILITY.md maps P11-01..P11-12 to implementing modules AND to the specific CI gate or contract test that verifies each. For a QA auditor this is materially better evidence than a marketing compliance page, which is all Peer AI, Weave Bio and Narrativa offer publicly.
- Anti-fabrication discipline in the generation service. server/services/authoring/section-generation-service.ts returns an explicit `ungrounded` array — points the model could not source — rather than silently emitting them. That is a better honesty posture than 'every data point includes citations', because it names what it could NOT ground.

**Where we reach parity**

- Breadth of regulatory scope on paper. 18 seeded (doc_type × agency) packs across FDA/EMA/MHRA/ICH/PMDA and 17 doc types, plus device (510(k), PMA, CER) coverage that Yseop and Peer AI largely lack. Parity on the org chart of documents, not on the quality of any one of them.
- Retrieval-grounded drafting as a backend capability. authoring.router.ts:2500 (hybrid RAG, [SRC-n] discipline) and section-generation-service.ts (SSE, per-claim citations) are architecturally comparable to what the AI-natives ship. The gap is delivery, not capability.
- Comment / review / approval workflow. Reachable and real; roughly at parity with a mid-tier RIM's review module, below Veeva and below dedicated collaborative-review tooling.
- Multi-tenant isolation and audit hygiene. Every authoring query is tenant-scoped (tenant_id = $2 on every statement inspected); the hash-chained audit trail with API-level immutability guards is enterprise-grade.

**Where we lose**

- The editor. We ship a plain <textarea> (DocumentAuthoring.tsx:636). Every competitor either IS Microsoft Word (Certara, Yseop, Ritivel) or has a rich-text regulatory canvas. A regulatory writer will not move a CSR into a textarea, and this ends the evaluation in the first five minutes of a demo.
- The Word round-trip. No .docx import, no tracked-change round-trip, no Office add-in. Export is title + heading + raw paragraph (authoring.router.ts:4884) — no styles, TOC, tables, numbering or headers/footers. Regulatory writing IS a Word round-trip; this is the single largest procurement blocker.
- AI drafting is not in the editor. The good RAG endpoint (:2500) has zero client callers; the shipped 'Draft with AnA' button (:596) forwards to chat and injects nothing. We demo an AI co-authoring product in which the AI does not write into the document. Yseop generates a full CSR first draft with <7% needing re-authoring; Peer AI reports 55–94% drafting acceleration.
- Structured data → document. No ADaM/SDTM/TLF ingestion, no table-to-text. This is where the writer hours actually are, and it is where Yseop and Narrativa (TLF Voyager, Clinical Atlas) win outright.
- Real-time co-authoring is fiction as shipped. CRDT off by default (hocuspocus-server.ts:88) with no client socket; TipTap present in package.json but its one component is imported by nothing; presence and Part 11 section LOCKS live in in-memory Maps (realtime-collab.ts:240, :377) that are lost on restart and broken across instances. A lock is a Part 11 control — an in-memory lock is not a control.
- Discoverability. 5 of 100 registered surfaces are in the rail; document-authoring is demoted to NAV_HIDDEN (registryModel.ts:132), reachable only by ⌘K, deep link, or the medical_writing segment default. A capability the evaluator cannot find does not win deals.
- Content estate integration. Zero Veeva, SharePoint or Word connectors. Certara and Yseop are both in Veeva's AI Partner Program; Ritivel sources from SharePoint and Veeva natively. We ask the customer to migrate content to us — the one thing no regulatory organization will do for an unproven vendor.
- Vendor validation status. The VMP is 1.0.0-DRAFT with approval PENDING and an explicit 'REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE' banner; IQ/OQ/PQ execution is delegated to the operator; the scope table names Cortex AI components, not authoring. Against Veeva this is not a contest.
- Commercial proof. No named customers, no published efficiency metric, no third-party award, no funding signal. Yseop has GSK <7%; Narrativa has 65,000 documents in 2025; Peer AI has 55–94% and $12.1M; Weave Bio has $36M. We have none of these.

## Is the advantage durable?

No durable moat. Twelve to eighteen months at the outside, and probably less.\n\nWhat could be a moat is the governance layer: the reproducible signature digest bound to a frozen snapshot (authoring.router.ts:5074), the citation checksum state machine (current/changed/unverified/unresolved), export-diff-since-last-publish (:3938), and the code-linked Part 11 traceability matrix. Against the AI-native tier — Peer AI, Weave Bio, Ritivel, none of whom publish any Part 11 attestation — that is a real 9–18 month lead, and it is the only place we are genuinely ahead.\n\nBut it is not a moat, for three reasons.\n\nFirst, the incumbent already has it. Veeva ships a validated Part 11 GxP platform with a decade of customer and regulator audit history; e-signature and record binding are table stakes there, not differentiation. We are ahead of the startups on a dimension where the incumbent is already ahead of us, which is the worst position in a two-front market.\n\nSecond, the distribution shape of this market neutralizes point advantages. Veeva converted its two strongest would-be competitors into partners — Certara joined the AI Partner Program and Yseop joined in September 2024 — so the governance layer arrives to the customer through Vault regardless of who generates the text. A buyer does not need us to get Part 11 plus AI drafting; they get it from Vault plus a partner.\n\nThird, and decisively, an advantage you cannot demonstrate is not an advantage. Our governance depth sits behind a plain textarea on a surface demoted out of the global nav. The evaluation ends before the differentiator is reached. Meanwhile the capabilities we lack — Word round-trip, TLF-to-text, in-canvas generation — are exactly the ones the challengers already ship and the incumbent has scheduled: Veeva's Regulatory AI Agents land August 2026 (gap-spotting, HA response drafting, labeling analysis) and Agentic Authoring — native drafting into Vault RIM and Word, triggered by incoming data — is expected late 2027.\n\nThat 2027 Agentic Authoring date is the real clock. It defines roughly an 18-month window in which no incumbent can demo native AI first-draft generation from inside the system of record. Certara, Yseop, Narrativa, Peer AI, Weave Bio and Ritivel are all sprinting into that window now. We are not in it: as of HEAD the AI does not write into the document. The window closes whether or not we enter it.\n\nFor an acquirer the honest read is that the asset here is the governance and provenance engine plus the validation groundwork, not the authoring product — roughly 12–18 months of regulated-systems engineering that is genuinely hard to replicate and genuinely useful to a buyer who already has an editor and a distribution channel. Acquired standalone to compete in this category, the moat is zero and the clock is short.

## Shortest credible path to parity

1. 1. WIRE THE AI INTO THE CANVAS (days, not weeks — highest ROI in the entire list). /api/authoring/sections/:id/ai/draft already works: hybrid RAG over the Data Room, [SRC-n] citation discipline, gateway-routed (authoring.router.ts:2500). Replace the onAsk() handoff at DocumentAuthoring.tsx:596 with a real call that streams into the canvas behind an accept/reject diff. Do the same for /ai/deficiency-scan (:2730). Today we own an AI co-authoring product whose AI does not write — this is a front-end wiring task against finished backends, and it is the difference between a losing demo and a competitive one.
2. 2. REPLACE THE TEXTAREA WITH THE TIPTAP EDITOR ALREADY IN package.json (2–4 weeks). @tiptap/core 3.22.3 plus table, heading, list, link, mention, character-count and superscript/subscript extensions are already dependencies (package.json:213-230) and client/src/components/ui/editor.jsx is a working component nobody imports. Swap it in at DocumentAuthoring.tsx:636, add table and cross-reference support, and render the tracked-change decisions the server already stores at authoring.router.ts:5830/:5894/:5963.
3. 3. FIX THE DOCX PIPELINE (2–3 weeks). Route /docs/:docId/export (authoring.router.ts:4802) through server/services/docx/masterDocumentBuilder.ts and templateRegistry.ts — 47KB of existing template machinery currently reachable only from Ana tool handlers — instead of the inline six-line `require('docx')` at :4884. Ship real styles, numbering, TOC field, tables, headers/footers and an eCTD-conformant Word template. Without this the export is unusable as a submission artifact regardless of content quality.
4. 4. SHIP .docx IMPORT WITH TRACKED-CHANGE ROUND-TRIP (4–6 weeks). This is the single largest procurement blocker and there is currently zero code for it. Writers will not abandon existing drafts; they need to bring a Word document in, work on it, and hand it back with redlines intact. Until this exists no medical writing group will pilot the product, no matter how good the governance is.
5. 5. PUT THE PRODUCT BACK IN THE FRONT DOOR (1 week). Either restore document-authoring to RAIL_PRIMARY (registryModel.ts:116) or make Apps a genuine surface launcher for the 42 NAV_HIDDEN ids. The five-destination collapse is defensible as an information-architecture decision, but shipping the flagship offering behind ⌘K means evaluators never see it. If the constitution forbids a sixth rail entry, surface it under Projects as the project-level authoring action.
6. 6. MOVE LOCKS AND PRESENCE TO POSTGRES (1 week). server/routes/realtime-collab.ts:240 and :377 hold rooms and locks in in-memory Maps. A Part 11 section lock that vanishes on restart and does not hold across instances is not a control and will be written up in any serious CSV review. This is a small change that removes a real audit finding.
7. 7. BUILD ONE CONTENT-ESTATE CONNECTOR — Veeva Vault first (6–10 weeks). Every serious competitor either lives in Word or reads from Vault; Certara and Yseop are both in Veeva's AI Partner Program. Read documents and metadata from Vault RIM and write drafts back. This converts 'migrate your dossier to us' into 'point us at what you already have', which is the difference between a pilot and a polite no.
8. 8. EXECUTE THE VALIDATION PACKAGE AGAINST THE AUTHORING MODULE (4–8 weeks, mostly QA effort). Take docs/validation/VMP-CORTEX-001 out of 1.0.0-DRAFT, get it approved, extend §1.2's scope table to cover authoring_documents/authoring_sections/signatures, and execute IQ/OQ/PQ rather than leaving execution to '(operator)'. The traceability matrix (TM-CORTEX-001) is already the hard part and it is done and code-linked — finishing this is the cheapest way to beat every AI-native challenger on the QA gate.
9. 9. GET ONE PUBLISHABLE NUMBER AND ONE NAMED CUSTOMER. Yseop has <7% re-authoring at GSK; Peer AI has 55–94%; Narrativa has 65,000 documents. A measured first-draft acceptance rate on a real CSR or Module 2.5, published, is worth more in this market than any additional feature on this list.
10. 10. DEPRIORITIZE CRDT CO-AUTHORING. It is the most visible gap and the least valuable one. Regulatory writers work in serialized section ownership with locks and redlines, not Google-Docs-style simultaneity — which is why Certara and Yseop, the two leaders, both ship into single-writer Word. Fix the locks (item 6), skip Hocuspocus until items 1–5 ship.

## Verdict

**🔴 Not competitive** — Purchase-grade call: as a regulatory document AUTHORING product, this does not survive a competitive bake-off, and the reason is delivery, not engineering.\n\nThe backend is genuinely deep — 5,990 lines in authoring.router.ts, ~11,000 across the category's five route files, a correct Part 11 freeze/sign/record-link loop, a citation-checksum staleness model no competitor publishes, and a RAG drafting endpoint with real anti-fabrication discipline. On architecture, several pieces are ahead of the funded AI-native challengers.\n\nBut the three dimensions that decide this category are Word fidelity, data-to-document generation, and vendor validation, and we score 1, 2 and 2 out of 5. Concretely: the shipped canvas is a plain <textarea> (DocumentAuthoring.tsx:636); DOCX export is six lines of unstyled `docx` calls (authoring.router.ts:4884); there is no .docx import, no tracked-change UI (the endpoints at :5830 have zero client callers), and no Word add-in; the working AI draft endpoint (:2500) is never called by the client, and the editor's only AI button (:596) forwards to chat and writes nothing into the document. The CRDT co-authoring in the brief does not exist as shipped — Hocuspocus is off by default (hocuspocus-server.ts:88), no client opens the socket, TipTap's one component is imported by nothing, and section locks live in in-memory Maps (realtime-collab.ts:240, :377).\n\nThree of the brief's own premises are false against HEAD and a buyer would find this in diligence: (1) there is no TipTap+Hocuspocus editor in the product; (2) the rule packs are 18 (doc_type × agency) combinations over 5 agency codes and 17 doc types — not 8 × 16 — and they hang off c2c_documents, a document model the shipped editor does not use; (3) the ui-surface-registry's own note (line 202) still claims the backends have 'no UI', which is stale in the other direction. The repo's marketing is unreliable in both directions.\n\nThe nav finding is real but is NOT the decisive one, and I want to be precise because the brief invited me to let it decide the score: RAIL_PRIMARY is five destinations (registryModel.ts:116) against 100 registered surfaces, and document-authoring is demoted to NAV_HIDDEN (:132). It is still reachable — ⌘K searches all UI_SURFACES unfiltered (Shell.tsx:983), deep links resolve, and it is the medical_writing segment's defaultSurface (:263, honored at V2App.tsx:260). So this is a severe discoverability defect (score 2), not an unreachable capability (score 0). What actually decides the verdict is that even once the evaluator reaches the surface, what they find is a textarea with no AI writing into it.\n\nAgainst Certara or Yseop this loses in the demo. Against Peer AI or Weave Bio it loses on commercial proof and capital. What it would win on — Part 11 governance, signature-to-record binding, citation staleness, a code-linked traceability matrix — is real and sellable, but as a governance and provenance layer beneath someone else's editor, not as the editor. Repositioned that way it is niche-viable. Sold as an authoring product against this field in 2026, it is not competitive.
