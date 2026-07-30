# eTMF and regulated document management / Vault DMS

> **Verdict: 🔴 Not competitive**
> Weighted capability score — **us 1.7 / 5** vs **best competitor 4.9 / 5** across 13 dimensions.

**Full category as scoped:** eTMF and regulated document management / Vault DMS

## Who buys, and what they are actually buying

Two budget holders, usually jointly. (1) VP/Head of Clinical Operations (or TMF Lead / Head of Clinical Document Management) at a sponsor or CRO — buys "we survive a GCP inspection": a complete, timely, quality-checked TMF filed to the TMF Reference Model, with the missing-document punch list closed before the inspector arrives. (2) Head of Quality / CSV, who holds veto power and buys "the system is validated and the records are Part 11 / Annex 11 defensible": vendor qualification package, IQ/OQ/PQ, tamper-evident audit trail, e-signature manifestation, and a supplier audit the QA group can pass on. Neither buys a dashboard. The outcome purchased is a defensible record set — the actual document bytes, versioned, signed, retrievable years later, and a readiness verdict backed by them. In CRO deals a third voice, the sponsor oversight function, buys TMF exchange/handover: the ability to transfer the TMF to the sponsor's system at study close.

## Market structure

Market size and shape. The eTMF systems market is estimated at roughly $1.55B in 2025 growing to about $1.73B in 2026 at ~11.8% CAGR, reaching approximately $2.67B by 2030 (The Business Research Company, via GlobeNewswire, 24 Apr 2026 — https://www.globenewswire.com/news-release/2026/04/24/3280618/0/en/Electronic-Trial-Master-File-eTMF-Systems-Research-Report-2026-2-67-Bn-Market-Opportunities-Trends-Competitive-Landscape-Strategies-and-Forecasts-2020-2025-2025-2030F-2035F.html). A second house puts 2026 at ~$1.76B on ~10.1% CAGR to $3.16B by 2032. Directionally consistent: a ~$1.7B market growing low-double-digits, with AI-led document management cited as a named growth driver alongside trial volume and decentralised trials. Note this is a modest TAM for a standalone play — which is exactly why every serious vendor sells eTMF as part of a wider clinical or regulatory suite.

Concentration. Veeva owns the enterprise tier decisively: more than 450 biopharma companies, 18 of the top 20 pharmas, and 4 of the top 6 CROs run Vault eTMF (https://www.prnewswire.com/news-releases/more-than-450-companies-adopt-veeva-vault-etmf-for-improved-trial-efficiency-and-inspection-readiness-301841812.html). The remainder splits between TMF specialists (Phlexglobal), document-services-attached platforms (TransPerfect Trial Interactive), Microsoft-estate mid-market (Montrium), site-network players (Florence), and suite vendors attaching eTMF to CTMS/EDC (IQVIA/Wingspan, Ennov, Octalsoft, Cloudbyz). One caveat on secondary sources: at least one widely-syndicated market summary asserts that Veeva acquired Medidata in December 2023 — that is false and should not be relied on; Medidata belongs to Dassault Systèmes.

Ownership churn is a real procurement question in this category. Phlexglobal moved Bridgepoint → Vitruvian, then merged with PharmaLex in January 2022 (https://www.phlexglobal.com/mergers-and-acquisitions). Buyers ask about roadmap continuity and will discount accordingly.

Standards. The TMF Reference Model transferred to CDISC stewardship, with v4 published in 2025 (https://www.cdisc.org/standards/foundational/trial-master-file-reference-model/tmf-reference-model-v4). v4 renames artifact → Record Group and sub-artifact → Record Type and brings sub-artifacts into the standard. Full artifact counts sit behind CDISC sign-in and are not verified here — but the direction matters for scoring: a vendor still shipping a DIA v3 subset is two model generations behind what a 2026 sponsor QA group expects. Our 41-artifact catalog (server/services/etmf/tmf-completeness.ts:36) sits well below even v3's full scope.

Procurement pattern and deal size. No vendor in this category publishes list pricing; Florence and Montrium both show 'contact us' on G2 and Capterra, and Veeva explicitly never publishes Vault module pricing. Deals are negotiated multi-year with a base-plus-named-user structure. Third-party estimates for Vault put per-user cost at roughly $50–$200/user/month (~$600–$2,400/user/year) plus a per-application base fee (https://intuitionlabs.ai/articles/veeva-vault-pricing-2026-cost-breakdown), with early-stage biotechs reported at tens of thousands per year all-in. Implementation and migration frequently exceed year-one licence. Practically: an eTMF selection is a 3–6 month evaluation with a QA/CSV gate, a security review, a migration scoping exercise, and a reference-call requirement. A vendor with no executed validation package and no inspection precedent does not clear the gate regardless of product quality — which is the structural reason our GAMP 5 kit being 1.0.0-DRAFT with PENDING approvals (docs/validation/OQ-CORTEX-001-OPERATIONAL_QUALIFICATION.md:6-16) matters more than any feature gap.

Where the AI competition actually is. 2026 has split into two AI models. (1) Incumbent-embedded: Veeva TMF Bot (over a million documents classified) plus Vault AI going across all Vault applications in August 2026 and Falcon targeting TMF intake and QC with early-adopter availability in November 2026 (https://www.prnewswire.com/news-releases/veeva-announces-falcon-an-agentic-platform-and-standard-agents-to-deliver-agentic-labor-in-drug-development-302782537.html); TI AutoMate; PhlexTMF v21's right-first-time model. (2) Overlay-agentic: Medable's TMF Agent, announced 6 January 2026, which autonomously ingests from shared inboxes and drives, classifies, extracts metadata, holds a human-in-the-loop checkpoint, then one-click submits into Veeva Vault, Wingspan or OpenText, claiming automation of 95% of manual document workflows (https://www.medable.com/newsroom/medable-debuts-ai-agent-for-automating-trial-master-file-tmf-processes). The overlay model is the only lane an AI-first entrant can realistically enter, because it does not require winning a rip-and-replace against a validated system of record — and it is a lane that requires connectors into incumbent eTMFs, of which this codebase has none.

## The five closest competitors

### Veeva Systems — Veeva Vault eTMF (Vault Clinical / Development Cloud), with Vault AI and the Falcon agentic platform

The default enterprise incumbent and the system every eTMF RFP is benchmarked against. Sells the whole Development Cloud — eTMF, CTMS, Study Startup, RIM, Quality — on one Vault platform so clinical and regulatory documents share a repository and a lifecycle. Land-and-expand: eTMF is frequently the first Vault, RIM/QMS follow.

**Strengths**

- Installed base and inspection precedent: more than 450 biopharma companies including 18 of the top 20 pharmas and 4 of the top 6 CROs run Vault eTMF (Veeva/PRNewswire). Inspectors have seen it; QA groups do not have to defend the choice.
- Full TMF Reference Model support with maintained taxonomy, plus zone/section/artifact metadata, study-country-site hierarchy, and the completeness/timeliness/quality metric set that the TMF community actually manages to.
- TMF Bot ships production ML classification — Veeva states it has classified more than one million documents; this is shipped automation, not roadmap.
- Native Vault eTMF ↔ Vault RIM connection, so trial documents reused in a submission do not have to be re-filed or re-classified.
- Vault AI is generally available with agents in Safety and Quality, and Veeva has publicly committed Vault AI across all Vault applications in August 2026 with Clinical and Regulatory agents this year. Falcon (announced 27 May 2026) targets TMF document intake and quality control explicitly, with early-adopter availability November 2026.
- Full GxP validation apparatus: qualified multi-tenant cloud, release-cycle validation support, Vault Validation Management as a companion product, and a supplier-audit posture that QA organizations routinely accept.

**Weaknesses**

- Price and TCO: base-plus-named-user, multi-year, never published. Public estimates put Vault modules at roughly $50–$200 per user per month ($600–$2,400/user/yr) plus a per-application base fee, with implementation frequently exceeding first-year licence cost. Emerging small-biotech SKUs (Vault Basics) exist precisely because entry cost blocks the low end.
- Configuration and change control overhead; three releases a year each carry a regression-validation burden the customer absorbs.
- Clinical/Regulatory AI agents are the last wave, not the first — Vault AI went GA for Safety and Quality ahead of Clinical, and Falcon's TMF intake agent is early-adopter in November 2026. As of July 2026 the deepest shipped eTMF AI is still TMF Bot classification, not agentic TMF operations.
- Heavier than a 5-person biotech running two Phase I studies needs; the operating model assumes a dedicated TMF function.

| | |
|---|---|
| AI shipped today | Shipped: TMF Bot ML document classification (Veeva states >1M documents classified). Vault AI agentic capability GA for Safety and Quality; Veeva has stated Vault AI will be delivered across all Vault applications in August 2026, with first Clinical and Regulatory agents later in 2026. Falcon, announced 27 May 2026, is a separate agentic platform whose named initial focus areas include TMF document intake and quality control, health-authority correspondence, and safety case triage — early-adopter availability November 2026, i.e. not yet shipped as of 2026-07-28. |
| GxP / validation posture | Qualified GxP multi-tenant cloud; 21 CFR Part 11 / EU Annex 11 controls (audit trail, e-signature manifestation, record retention); vendor qualification and supplier-audit material available to customers; Vault Validation Management sold as a companion for customer-side CSV of the three annual releases. Widely accepted by pharma QA and seen in FDA/EMA GCP inspections. |
| Pricing signal | Not published by Veeva. Third-party estimates: base-plus-named-user model, roughly $50–$200 per user per month (~$600–$2,400 per user per year) depending on module and volume, plus per-application/environment base subscription; multi-year negotiated contracts; early-stage biotechs reported paying tens of thousands per year. Treat as directional, not verified vendor pricing. |

<details><summary>Sources</summary>

- https://www.prnewswire.com/news-releases/more-than-450-companies-adopt-veeva-vault-etmf-for-improved-trial-efficiency-and-inspection-readiness-301841812.html
- https://www.veeva.com/products/vault-ai/
- https://ir.veeva.com/news/news-details/2025/Veeva-AI-Agents-Now-Available-to-Increase-Productivity-and-Customer-Centricity/default.aspx
- https://www.prnewswire.com/news-releases/veeva-announces-falcon-an-agentic-platform-and-standard-agents-to-deliver-agentic-labor-in-drug-development-302782537.html
- https://pharmaphorum.com/rd/simplification-standardisation-ai-enabled-industry-veeva-rd-and-quality-summit-2026
- https://www.clinicaltrialvanguard.com/conference-coverage/veeva-unveils-falcon-ai-platform-and-agentic-authoring-at-2026-summit/
- https://intuitionlabs.ai/articles/veeva-vault-pricing-2026-cost-breakdown
- https://intuitionlabs.ai/articles/veeva-vault-etmf-guide

</details>

### Montrium — eTMF Connect (part of Montrium Connect, with Quality Connect eQMS and RIM)

The mid-market and scaling-biotech alternative to Veeva. Built on Microsoft 365 / SharePoint Online and Azure, so it lands inside the customer's existing Microsoft estate rather than as a separate island. Sells speed to go-live and a validation package that removes CSV burden, at a price point a 20–200 person biotech can approve.

**Strengths**

- Pre-configured TMF structures aligned to the TMF Reference Model, automated workflows and reusable templates — a study can be stood up without a configuration project.
- Validated electronic signature technology for 21 CFR Part 11 and EU Annex 11 compliance, with comprehensive audit trails and role-based access.
- Ships a complete validation and SOP template package and performs testing/qualification on the customer's behalf, explicitly to reduce the customer's validation burden and accelerate go-live — this is the single most effective wedge against Veeva in QA-led evaluations.
- Metadata and in-content search across TMF records; centrally managed tasks for authoring, review and filing.
- Microsoft 365/SharePoint/Azure foundation means familiar UX, existing SSO/identity, and Azure-native security (data isolation, encryption in transit and at rest, SOC 2-aligned monitoring).

**Weaknesses**

- No publicly verified AI document classification or metadata-extraction product as of 2026 — the marketed differentiators are structure, workflow and validation, not ML. Not verified that any LLM/ML classification ships.
- Smaller installed base and less inspection precedent than Veeva or Phlexglobal; large-pharma procurement often screens it out on scale.
- SharePoint lineage constrains some TMF-specific behaviours (deep artifact hierarchies, high-volume site-level filing) relative to purpose-built eTMFs.
- Pricing is quote-based; no verified public list price.

| | |
|---|---|
| AI shipped today | Not verified. Public marketing emphasises pre-configured TMF structure, workflow automation, metadata/in-content search and validation acceleration. No shipped AI classification or metadata-extraction capability could be confirmed from public sources as of 2026-07-28. |
| GxP / validation posture | Strong and explicitly sold: validated e-signature for 21 CFR Part 11 and Annex 11, comprehensive audit trails, and a complete validation + SOP template package with vendor-performed testing/qualification to reduce customer CSV effort. Azure hosting with SOC 2-aligned controls. |
| Pricing signal | Not public — quote-based across eTMF/eQMS/RIM plans. Third-party summaries describe a scalable per-user model targeted at small-to-mid biotech; no verified list price. Entry-level Connect 365 (SharePoint Online) and Azure-hosted multi-tenant Fast Track are positioned as low-upfront-investment options. |

<details><summary>Sources</summary>

- https://www.montrium.com/etmf-connect
- https://www.montrium.com/etmf-connect-features
- https://www.montrium.com/pricing
- https://www.capterra.com/p/206585/eTMF-Connect/
- https://blog.montrium.com/experts/managing-gxp-content-in-office-365
- https://intuitionlabs.ai/articles/etmf-software-comparison-veeva-montrium-iqvia

</details>

### TransPerfect Life Sciences — Trial Interactive eTMF (TI), with TI AutoMate

The AI-forward, CRO- and sponsor-services-heavy eTMF. Sells document processing throughput: bulk intake, automated classification and filing, CRA reconciliation, and a live completeness view so the study is continuously inspection-ready. Bundles TransPerfect's translation and document-services muscle, which matters for multi-region trials.

**Strengths**

- TI AutoMate is shipped AI: it identifies document type, extracts metadata, and auto-files to the correct TMF Index location, eliminating manual classification.
- Vendor-published performance claims of ~40% reduction in document processing time and 98% metadata extraction accuracy (vendor claim, not independently verified).
- Operational TMF features the day-to-day users care about: CRA reconciliation, one-step approvals, bulk uploads, live completeness view.
- Mobile eTMF (myTI) for site and monitor workflows.
- Strong CRO/multi-sponsor fit and TransPerfect's global document/translation services attached to the same contract.

**Weaknesses**

- Vendor-published accuracy and time-saving figures are not independently verified.
- Smaller enterprise footprint than Veeva; less common as the sponsor-side system of record at top-20 pharma.
- Pricing not published; deal size not publicly verifiable.
- Positioned as a clinical-document platform, not a cross-functional Vault — weaker regulatory/RIM adjacency than Veeva if the buyer wants one repository for eTMF and submissions.

| | |
|---|---|
| AI shipped today | Shipped. TI AutoMate applies machine learning to auto-classify documents to the TMF Index, extract metadata, and auto-file to the correct folder; scanning/OCR is part of the intake pipeline. Vendor claims ~40% faster document processing and 98% metadata extraction accuracy. First introduced with TI 10.2 and carried forward in later releases. |
| GxP / validation posture | Marketed as a compliant cloud eTMF with audit trail, e-signature and inspection-readiness tooling. Specific validation-package contents, IQ/OQ/PQ deliverables and supplier-audit terms are not published — not verified. |
| Pricing signal | Not public. No verified per-user or per-study list price; deals are quoted. No credible public deal-size signal found. |

<details><summary>Sources</summary>

- https://www.transperfect.com/about/press/transperfect-life-sciences-unveils-ai-powered-tmf-automation-trial-interactive-102
- https://www.trialinteractive.com/etmf-tmf-solutions/automate
- https://www.trialinteractive.com/etmf-tmf-solutions/etmf
- https://www.prnewswire.com/news-releases/transperfect-life-sciences-unveils-ai-powered-tmf-automation-with-trial-interactive-10-2--301311805.html
- https://www.transperfect.com/about/press/transperfect-life-sciences-releases-trial-interactive-105

</details>

### Phlexglobal (a PharmaLex company) — PhlexTMF v21 / PhlexEview eTMF, plus TMF services (TMF health checks, remediation, managed TMF)

The TMF specialist. Sells the combination almost nobody else offers — purpose-built eTMF technology plus a large bench of TMF experts who will remediate, migrate and run the TMF as a service. Wins where the buyer's real problem is a legacy TMF in bad shape, not a greenfield study.

**Strengths**

- AI at the point of upload: PhlexTMF v21 is marketed as the industry's only purpose-built eTMF with next-generation AI making documents 'right-first-time' at the critical upload step, reducing misfiles and metadata errors before they occur.
- The model is pre-trained on millions of documents and embeds the accumulated guidance of hundreds of Phlexglobal TMF experts — a domain-data moat a generic LLM does not have.
- Directly targets the three TMF health metrics inspectors ask about: quality, completeness and timeliness.
- Technology-plus-services is a genuine differentiator for legacy TMF migration and remediation — the hardest, least automatable part of an eTMF displacement.
- Deep TMF-only focus and long enterprise reference base (e.g. a global consolidated eTMF for Bayer).

**Weaknesses**

- Narrow platform: TMF and clinical documents, not a cross-functional regulated DMS. Buyers wanting eTMF + RIM + QMS on one platform go elsewhere.
- Ownership has changed repeatedly (Bridgepoint → Vitruvian; merged with PharmaLex in January 2022, PharmaLex subsequently within the Cencora orbit) — procurement will ask about roadmap continuity. Current ultimate ownership as of 2026 not independently verified here.
- The services attachment that is a strength for remediation is a cost and lock-in concern for a sponsor that wants to run its own TMF.
- No public pricing; deal size not verifiable.

| | |
|---|---|
| AI shipped today | Shipped. PhlexTMF v21 embeds pre-trained AI at document upload that reduces misfiles and metadata errors, pre-trained on millions of documents and encoding the cumulative guidance of Phlexglobal's TMF experts. Positioned as prevention (right-first-time at intake) rather than downstream remediation. |
| GxP / validation posture | Purpose-built regulated eTMF with the inspection-readiness posture expected of a TMF specialist; the services arm supports customers directly through GCP inspections. Specific validation-package contents and supplier-audit terms are not published — not verified. |
| Pricing signal | Not public. No verified list price or deal-size figure. Services-plus-software bundles are negotiated per engagement. |

<details><summary>Sources</summary>

- https://www.phlexglobal.com/phlextmfv21-pr
- https://www.phlexglobal.com/phlextmf-v21
- https://www.clinicalleader.com/doc/phlexglobal-announces-industry-first-etmf-ai-0001
- https://www.phlexglobal.com/etmf-software
- https://www.phlexglobal.com/mergers-and-acquisitions
- https://www.businesswire.com/news/home/20161025005976/en/Phlexglobal-provides-a-global-consolidated-eTMF-solution-for-Bayer

</details>

### Florence Healthcare — Florence eTMF, Florence eBinders (site eISF), Florence SiteLink

The site-side network that grew into the sponsor side. Owns the investigator site file at scale and sells sponsors the ability to reach into sites' binders directly — collapsing the collect-scan-email-file loop that produces most TMF latency and most misfiles. Wins on the sponsor↔site seam rather than on repository depth.

**Strengths**

- Network scale on the side nobody else owns: publicly claims connections across 65,000 study sites and 600 sponsors worldwide (Oct 2025), with SiteLink cited at 5.2 million remote workflows per month across 18,000 study sites in 52 countries.
- Part 11-compliant e-signatures (stamp or addendum), from individuals or groups, plus role-based permissions, access controls and workflow management.
- Structurally solves TMF timeliness — the metric that fails most often — because documents are captured at the site at the moment of execution rather than reconstructed later.
- Strong fit for sponsors and CROs running decentralised or site-heavy programmes; low friction for site staff, which is the actual adoption constraint.
- Free trial with no credit card, which is unheard of in this category and a real SMB wedge.

**Weaknesses**

- Sponsor-side eTMF depth (artifact taxonomy governance, complex zone/section configuration, enterprise migration) is generally regarded as thinner than Veeva or Phlexglobal.
- The value proposition depends on site network adoption; in trials where sites already use another eISF the differentiator collapses.
- No verified shipped AI classification product comparable to TMF Bot, AutoMate or PhlexTMF v21 — marketing refers to AI-driven automation reducing manual tasks, but the specific capability is not verified.
- No published pricing on G2 or Capterra; quote-only.

| | |
|---|---|
| AI shipped today | Partially verified. Florence markets AI-driven automation that reduces manual tasks in eTMF workflows, but no specific shipped classification/metadata-extraction product with published accuracy figures was confirmed. Treat as weaker AI posture than Veeva/TransPerfect/Phlexglobal as of 2026-07-28. |
| GxP / validation posture | 21 CFR Part 11-compliant electronic signatures (stamp and addendum, individual and group), audit trail, role-based permissions and access controls; published security/compliance material covering how clinical research workflows are protected. Detailed IQ/OQ/PQ and supplier-audit deliverables not published — not verified. |
| Pricing signal | Not published on G2 or Capterra — quote-only for both Florence eTMF and eBinders. A free trial with no credit card is offered for Florence eTMF, which is a meaningful low-end signal even absent a price. |

<details><summary>Sources</summary>

- https://www.florencehc.com/21-cfr-part-11-ensuring-eregulatory-and-esource-compliance/
- https://www.florencehc.com/sitelink-accelerator-program/
- https://www.g2.com/products/florence-etmf/reviews
- https://www.capterra.com/p/276610/Florence-eTMF/
- https://markets.financialcontent.com/ridgwayrecord/article/accwirecq-2025-10-23-florence-connects-65000-study-sites-and-600-sponsors-worldwide-unleashing-the-next-era-of-clinical-trial-intelligence
- https://www.florencehc.com/wp-content/uploads/How-Florence-Protects-Your-Clinical-Research-Workflows-.pdf

</details>

### Medable — TMF Agent (built on Medable Agent Studio)

The AI-native challenger, and the most important one to understand because it does not try to replace the eTMF — it sits above it. Announced at JPM on 6 January 2026 as an agentic layer that autonomously ingests, classifies and prepares documents, then pushes them into whichever eTMF the customer already owns. This is the attack vector an AI-first entrant can actually execute, and it is the lane a product like ours would be competing in.

**Strengths**

- System-agnostic by design: writes into Veeva Vault, Wingspan and OpenText, so it does not have to win a rip-and-replace fight.
- Autonomous upstream ingestion from shared inboxes, drives and other sources — it attacks the document-collection problem, not just the filing problem.
- Claims automation of 95% of manual document workflows, and frames the value as recovering the ~33% of a CRA's time consumed by administrative burden (vendor claims, not independently verified).
- Human-in-the-loop checkpoints for validation, QC and audit traceability are architected in, with one-click submission after human review — the right compliance posture for an agentic tool in a GxP setting.
- Agent Studio gives a repeatable path to further agents beyond TMF.

**Weaknesses**

- Brand-new: announced 6 January 2026, roughly 7 months old at the time of this analysis. No inspection precedent, no published customer evidence, no independent accuracy validation.
- Not a system of record — it does not store, version or retain documents; it depends on an incumbent eTMF underneath. Cannot be the eTMF of record and does not try to be.
- Automation percentages and CRA time figures are vendor-stated.
- No published validation package, GxP qualification detail or pricing — not verified.
- Medable's core identity is decentralised trials, not document management; the TMF Agent is an extension of that platform rather than a TMF-native product.

| | |
|---|---|
| AI shipped today | Shipped as of January 2026 and genuinely agentic: autonomous document ingestion from shared inboxes and drives, classification, metadata extraction, preparation for human review, then one-click submission into Veeva Vault, Wingspan or OpenText. Human-in-the-loop checkpoints for validation, QC and audit traceability. Vendor claims 95% of manual document workflows automated. |
| GxP / validation posture | Human-in-the-loop checkpoints and audit traceability are stated design principles, and the agent writes into the customer's already-validated eTMF (which carries the Part 11 record). Medable's own validation package, GAMP 5 categorisation and supplier-audit terms for the TMF Agent are not published — not verified. |
| Pricing signal | Not public. No verified pricing or deal-size figure disclosed at or since the January 2026 launch. |

<details><summary>Sources</summary>

- https://www.medable.com/newsroom/medable-debuts-ai-agent-for-automating-trial-master-file-tmf-processes
- https://businesswire.com/news/home/20260106426800/en/Medable-Debuts-AI-Agent-for-Automating-Trial-Master-File-TMF-Processes
- https://hitconsultant.net/2026/01/06/how-medables-agentic-ai-tmf-solves-the-clinical-trial-clerical-debt-problem/
- https://www.pharmtech.com/view/medable-presents-ai-agent-for-automating-trial-master-file-processes-at-jp-morgan-healthcare-conference
- https://www.clinicalresearchnewsonline.com/news/2026/01/27/mount-sinai-connects-cancer-patients-with-trials--molecular-testing-in-sub-saharan-africa--medable-announces-tmf-agent

</details>

## Capability rubric

Our score is cited to `file:line` in this repository. Theirs is cited in the competitor sections above. Scored on what **ships and is reachable**, not what is architected — an unreachable or unvalidated capability scores low regardless of code quality.

| Dimension | Weight | Us | Best competitor | Their score | Our evidence |
|---|---|:--:|---|:--:|---|
| Document repository — stores, retains, versions and returns the actual document bytes | critical | **1** 🔻 | Veeva Vault eTMF | 5 | server/routes/evidence-management.routes.ts:276 (multer temp file is fs.unlink'd in the finally block after text extraction; the DB row written at :218 records file_path = `/uploads/${fileId}` where nothing was ever written, and the router exposes no download endpoint); shared/schema/vault.ts:5-8 (module header: vaultDocumentChunks and vaultEvidenceCitations INACTIVE — 'no routes/services query this table'; vaultDocuments' only consumer in the whole server tree is server/jobs/retentionCron.ts, a non-auto-registered job); server/services/vaultService.ts:27 (the one real byte store is local filesystem `storage/vault`, and its only caller is server/routes/ivdr-binder-routes.ts); client/src/concept2cure/v2/surfaces/Vault.tsx:228 (the Vault surface's 'Upload' button calls onAsk() with a chat prompt, not an upload) and :460 ('Download' likewise dispatches a chat message) |
| Reachability — can a licensed user actually get to the eTMF/Vault in the shipped product | critical | **1** 🔻 | Veeva Vault eTMF | 5 | client/src/concept2cure/v2/registryModel.ts:116-122 (RAIL_PRIMARY is exactly five entries: Chats, Projects, Communication Center, Apps, Settings) rendered by client/src/concept2cure/v2/Shell.tsx:185, against 100 registered surface views in client/src/concept2cure/v2/surfaceViews.ts (SURFACE_VIEWS) and 96 registry entries in shared/constants/ui-surface-registry.ts + .ui-v2.ts; 'etmf' appears at client/src/concept2cure/v2/surfaceViews.ts:165 and shared/constants/ui-surface-registry.ui-v2.ts:57 but is in neither RAIL_PRIMARY nor even NAV_HIDDEN (registryModel.ts:125-171); the Apps launcher (client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx:1219) renders the module catalog seeded at db/migrations/20260220_user_intelligence_platform.sql:78-107, which contains 20 modules and no eTMF row — and its 'evidence-engine' module id has no matching SURFACE_VIEWS key, so it lands on the KitSurfaceScaffold placeholder (client/src/concept2cure/v2/V2App.tsx:219). eTMF is therefore reachable only by ⌘K substring-matching the surface's notes text (Shell.tsx:983) or by deep link. |
| TMF Reference Model coverage and taxonomy depth (artifact catalog, study/country/site levels, v4 currency) | critical | **2** 🔻 | Veeva Vault eTMF | 5 | server/services/etmf/tmf-completeness.ts:36 (TMF_REFERENCE_MODEL = 11 zones, 41 artifacts total, 26 flagged essential — versus the several-hundred-artifact DIA/CDISC model); server/services/etmf/etmf-logic.ts:15-27 (zone list only, 'DIA RM v3'); shared/schema/etmf.ts:29 (tmfModel defaults to 'dia_rm_v3'); shared/schema/tmf-artifacts.ts:24-49 (tmf_artifact_filings is keyed on org+trial+artifactCode with a zoneNumber — there is no country or site dimension, so the study/country/site hierarchy the TMF RM requires cannot be represented). No CDISC TMF RM v4 support anywhere in the tree. |
| AI document classification and metadata extraction from document content | critical | **1** 🔻 | Phlexglobal PhlexTMF v21 (tie: TransPerfect TI AutoMate, Veeva TMF Bot) | 5 | server/services/etmf/etmf-logic.ts:35-49 (the entire TMF classifier is 11 regex rules matched against the artifact NAME string, defaulting to Zone 2 when nothing matches — module header states 'Pure, DB-free, LLM-free'); server/services/etmf/etmf-service.ts:56 (addArtifactTx calls that name-based classifier); the platform's real LLM classifier at server/services/ingestion/ingestion-service.ts:164-265 classifies into eCTD/CTD section codes over coauthor_documents HTML and writes submissionLeaves — it never touches TMF zones or artifact codes, and is only reachable from server/routes/ctd-onboarding.ts and server/routes/ectd-documents.ts. server/services/ocr/* exists but its only consumer in the route tree is server/routes/chat/upload.ts. |
| Validation package / CSV / supplier-audit support covering the eTMF itself | critical | **2** 🔻 | Montrium eTMF Connect (tie: Veeva) | 5 | server/routes/validation-kit.ts:1-17 + docs/validation/ (a genuine GAMP 5 kit exists — VMP, IQ, OQ, PQ, ISO 14971 RA, Part 11 traceability matrix, cloud vendor qualification, VSR, security assessment — mounted at /api/validation-kit via server/bootstrap/register-inline-routes.ts:1059), BUT docs/validation/OQ-CORTEX-001-OPERATIONAL_QUALIFICATION.md:6-16 shows Version 1.0.0-DRAFT, 'Status: ⚠️ DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE', Approved By PENDING, dated 2025-01-24; and a case-insensitive grep for 'etmf' or 'trial master' across docs/validation/ returns zero hits — the kit covers the AI platform, not the eTMF. No executed protocols, no approvals, no eTMF test scripts. |
| Part 11 / Annex 11 e-signature bound to a document record, plus tamper-evident audit trail | critical | **3** 🔻 | Veeva Vault eTMF | 5 | GENUINE STRENGTH on the audit side: server/services/auditService.ts:230-298 (sha256-chained + HMAC-sealed audit_logs writes) and server/routes/part11-compliance.ts:573,602,791,1192 (signature retrieval, signature manifest, /audit-trail/chain-integrity re-computing a linear SHA-256 hash chain JWT-bound to the caller's org, /audit-trail/seal-integrity), with server/services/part11/{signing-authority,version-binding,resolve-signer-role}.ts. TMF mutations are audited — server/services/etmf/tmf-artifact-persistence.ts:76-85 and :101-110 emit TMF_ARTIFACT_FILED / TMF_ARTIFACT_REMOVED. THE GAP: there is no TMF document record to sign. shared/schema/etmf.ts:50-77 (tmf_artifacts has zone, section, artifactName, status, documentDate — and no document foreign key or file reference at all) and shared/schema/tmf-artifacts.ts:38 (documentRef is a free-text column). Worse, client/src/concept2cure/v2/surfaces/Etmf.tsx:124 and :142 hard-code documentRef = 'vault://' + trialId + '/' + artifactCode, which does not match the one real vault URI scheme in the codebase (server/services/storage/storage-provider.ts:91 emits vault://{orgId}/{projectId}/{filename}) and resolves to nothing. |
| TMF health metrics inspectors actually ask for — completeness AND timeliness AND quality | high | **2** 🔻 | Veeva Vault eTMF (tie: Phlexglobal) | 5 | Completeness is real and well-tested: server/services/etmf/tmf-completeness.ts:36 + server/services/etmf/etmf-logic.ts (evaluateCompleteness), with 20 passing unit tests across server/services/etmf/__tests__/{etmf-logic,tmf-completeness,tmf-inspection-package}.test.ts (verified: 3 files, 20 tests passed). Timeliness and quality do not exist — client/src/concept2cure/v2/surfaces/Etmf.tsx:18-27 states it explicitly: 'Timeliness and QUALITY (QC) have NO backend on this path: tmf_artifact_filings persists only the artifact CODE and filedAt — there is no document date to compute a filing lag against and no QC status column', and shared/schema/tmf-artifacts.ts:24-44 confirms the columns are absent. |
| Inspection deliverable — exportable, archivable TMF the inspector or sponsor can actually open | high | **2** 🔻 | Veeva Vault eTMF | 5 | server/services/etmf/tmf-inspection-package.ts:1-20 + server/routes/etmf.routes.ts:160 (GET /trials/:trialId/inspection-package streams a ZIP with manifest.json, completeness.json, inspection-index.csv, README.txt, SHA-256 in an X-TMF-SHA256 header; deterministic and unit-tested). Its own honesty contract at tmf-inspection-package.ts:13-17 is the scoring constraint: 'tmf_artifacts stores metadata only — no document bytes. This package therefore assembles the inspection index and readiness picture... It never fabricates document content it does not hold.' An inspection package with no documents in it is a readiness report, not a TMF export or archive. |
| Sponsor ↔ CRO ↔ site exchange (TMF exchange, site eISF, handover at study close) | high | **0** 🔻 | Florence Healthcare | 5 | absent — no site portal, eISF, site binder, or TMF-exchange route or service exists. A grep across server/routes and server/services for 'site portal', 'investigator site file', 'eISF', 'site binder' and 'TMF exchange' returns one hit, server/services/ana/gcpOperationsTools.ts:241,249, which is an AnA advisory tool describing record-retention guidance — not a capability. shared/schema/tmf-artifacts.ts:24-49 has no site or country dimension to exchange against. |
| Semantic / RAG search over the TMF corpus with citations back to source documents | high | **2** 🔻 | Veeva Vault eTMF (Vault AI) | 4 | pgvector columns are declared widely (shared/schema.ts:1629,5759,11463,11876,13724,15028,15198,15316,16462 and shared/schema/vault.ts:142), and provenance modelling is real (server/services/evidence/provenance.ts:103,323 — EVIDENCE_SOURCES, buildProvenance, authority tiers, used by server/routes/ana-ri/stream.ts). But the TMF-facing path is not wired: shared/schema/vault.ts:6-8 marks vaultDocumentChunks INACTIVE with no querying routes; server/routes/evidence-search.ts:47 delegates entirely to an external OpenSearch cluster rather than pgvector; and the Evidence surface is fixture-first — client/src/concept2cure/v2/surfaces/Evidence.tsx:24-36 hard-codes EV_ANSWER/EV_CHUNKS (a canned CGM/K221847 answer) and only replaces them if /api/evidence-asks returns a complete saved shape (:64-86), otherwise rendering the demo behind a SampleTag. |
| Legacy TMF migration and high-volume bulk ingestion | high | **1** 🔻 | Phlexglobal (technology + TMF remediation services) | 5 | server/routes/etmf.routes.ts:113 provides POST /trials/:trialId/artifacts/bulk, but it files at most 500 artifact CODES per call with no document payload — it is a checklist bulk-tick, not an ingestion path. The only bulk document intake, server/routes/knowledge-base.ts:718-747, re-posts the multipart body to /knowledge/ingest-files on an out-of-repo Python 'shadow service'; the shadow_service/ directory in this repo contains only scoring/risk-code files, so that ingestion endpoint does not ship with the deployable and returns 502 'Shadow service unreachable' when absent. |
| Deployment integrity — does the eTMF schema exist in a deployed environment | high | **2** 🔻 | Veeva Vault eTMF (SaaS — no customer-side schema risk) | 5 | scripts/db/migration-set.mjs (the curated 25-file out-of-band set that scripts/db/deploy-migrate.mjs applies as the production deploy-time entrypoint) contains no entry for migrations/20260610_etmf.sql or migrations/20260615_tmf_artifact_filings.sql — grep for 'tmf' returns zero hits. scripts/db_migrate.sh:35 points at db/migrations/ while both eTMF migrations live in the root migrations/ tree. Only scripts/db/install-fresh.mjs:65,121-137 (the from-scratch provisioning path, which shells out to a devDependency absent from the production image) sweeps the whole migrations/ directory. Neither eTMF migration declares RLS. Consequence: on an existing production database the eTMF tables are not created by any automated path, and every /api/etmf endpoint 42P01s — the repo's own 'merged ≠ applied' failure mode, documented at scripts/db/deploy-migrate.mjs:6-14. |
| eTMF ↔ RIM / eCTD adjacency — trial documents reusable in a submission without re-filing | medium | **4** 🔻 | Veeva Vault eTMF ↔ Vault RIM | 5 | GENUINE STRENGTH. server/services/ingestion/ingestion-service.ts:164-247 classifies a document to a CTD section code and drafts a submissionLeaf into an owned eCTD sequence in one governed, audited transaction; server/routes/etmf.ts:56-79 runs every TMF mutation through BEGIN → setTenantContextTx → recordGovernedAction → COMMIT with a mandatory ≥8-character reason string (:52); shared/constants/domain/vault-taxonomy.ts:1-30 defines one cross-segment document taxonomy spanning CTD modules, device DHF folders and TMF zones. Scored 4 not 5 because the eTMF side of that bridge holds no documents to reuse. |

## Where we stand

**Where we win**

- Governed-mutation discipline. Every eTMF write runs BEGIN → setTenantContextTx → recordGovernedAction → COMMIT with a mandatory reason of at least 8 characters (server/routes/etmf.ts:52,56-79). Competitors log who and when; we force why, at the transaction boundary, and roll back if the ledger write fails. That is a better Part 11 §11.10(e) story than most of this field ships, and it is real code.
- Cryptographically sealed audit ledger. server/services/auditService.ts:230-298 writes sha256-chained, HMAC-sealed rows, and server/routes/part11-compliance.ts:791,1192 exposes JWT-org-bound chain-integrity and seal-integrity verification an auditor can run on demand. Veeva and Montrium assert tamper-evidence; we can demonstrate it with a re-computation endpoint. This is a legitimate technical asset independent of the eTMF.
- Deterministic, byte-stable, unit-tested readiness core. server/services/etmf/tmf-completeness.ts and etmf-logic.ts are pure functions with no IO, covered by 20 passing tests, and the inspection package (tmf-inspection-package.ts) is deterministic given a caller-supplied timestamp so the same TMF state yields the same SHA-256. In a category where AI classification accuracy is the marketing claim, a provably deterministic readiness verdict is defensible in a way an ML confidence score is not.
- Refusal to fabricate. server/services/etmf/tmf-inspection-package.ts:13-17 and client/src/concept2cure/v2/surfaces/Etmf.tsx:18-27 explicitly render 'not yet available' for timeliness and QC rather than synthesising them, and the surface removed its fabricated sample trial. In a GxP demo this honesty engineering survives scrutiny that polished competitors' demos sometimes do not. It is a cultural asset for an acquirer, not a feature.
- eTMF ↔ eCTD adjacency in one governed transaction. server/services/ingestion/ingestion-service.ts:164-247 classifies a document to a CTD section and drafts a submission leaf in one audited step. Only Veeva offers the eTMF↔RIM bridge at all, and it is a cross-product integration there rather than a single transaction.

**Where we reach parity**

- Nothing. There is no dimension in this rubric on which the as-built product reaches parity with the weakest of the five incumbents. The closest is the governed-audit layer, where we exceed several competitors — but audit is a platform capability here, not an eTMF capability, because there is no TMF document record for it to bind to (shared/schema/etmf.ts:50-77 has no document foreign key; shared/schema/tmf-artifacts.ts:38 documentRef is free text that the UI populates with an unresolvable 'vault://trialId/artifactCode' string at client/src/concept2cure/v2/surfaces/Etmf.tsx:124).

**Where we lose**

- The document repository — the category's definition. We cannot store, version, retrieve or retain a document. Uploaded bytes are read for text extraction and then deleted (server/routes/evidence-management.routes.ts:276) while the DB row claims a file_path that was never written; the S3-backed vault schema has no CRUD routes and only a non-registered retention cron reads it (shared/schema/vault.ts:5-8, server/jobs/retentionCron.ts); the one working byte store is local disk used solely by the IVDR binder (server/services/vaultService.ts:27). The Vault surface's Upload and Download buttons open a chat prompt (client/src/concept2cure/v2/surfaces/Vault.tsx:228,460). A DMS that cannot hold a document is not in this category.
- Reachability. Five of 100 registered surfaces are in the global rail (client/src/concept2cure/v2/registryModel.ts:116-122, Shell.tsx:185); eTMF is in neither the rail nor NAV_HIDDEN, and the Apps launcher's 20-module catalog (db/migrations/20260220_user_intelligence_platform.sql:78-107) has no eTMF entry. A buyer's user cannot find the eTMF without a deep link. A capability nobody can reach loses every deal it is in.
- AI classification. Eleven regexes against the artifact's NAME (server/services/etmf/etmf-logic.ts:35-49, header: 'LLM-free') against TMF Bot's million-plus classified documents, TI AutoMate's claimed 98% metadata accuracy, and PhlexTMF v21's model pre-trained on millions of documents. This is the loudest gap for an 'AI-native' pitch — we ship less AI in eTMF than every incumbent.
- TMF Reference Model depth. 41 artifacts across 11 zones (server/services/etmf/tmf-completeness.ts:36), DIA v3 only, with no country or site level anywhere in the schema (shared/schema/tmf-artifacts.ts:24-49). CDISC published TMF RM v4 in 2025. A TMF assessed against a 41-artifact subset produces a readiness verdict a sponsor's QA cannot rely on.
- Validation. The GAMP 5 kit is real but every document is 1.0.0-DRAFT with approval PENDING (docs/validation/OQ-CORTEX-001-OPERATIONAL_QUALIFICATION.md:6-16) and contains zero references to eTMF or TMF. Montrium wins mid-market eTMF deals specifically on a delivered validation and SOP package. We have templates.
- Timeliness and quality — two of the three TMF health metrics inspectors ask about — do not exist (client/src/concept2cure/v2/surfaces/Etmf.tsx:18-27).
- Sponsor↔CRO↔site exchange: absent entirely. Florence's 65,000-site network is a structural moat we have no answer to.
- Legacy TMF migration: the only bulk document intake proxies to a Python service that is not in this repo (server/routes/knowledge-base.ts:735-745, shadow_service/ contains only scoring files).
- Deployment integrity: neither eTMF migration is in the production migration set (scripts/db/migration-set.mjs), so on an existing deployed database every /api/etmf endpoint fails on a missing table.

## Is the advantage durable?

There is no durable advantage in this category, because there is no advantage in this category — we are not on the board. The honest question is whether anything in the codebase could become a moat if the repository gap were closed, and how long we would have.

What is genuinely differentiated today: the governed-mutation pattern (server/routes/etmf.ts:52,56-79 — mandatory ≥8-character reason at the transaction boundary, ledger write inside the same transaction, rollback on failure) combined with a sha256-chained, HMAC-sealed audit ledger that exposes on-demand chain and seal re-verification (server/services/auditService.ts:230-298, server/routes/part11-compliance.ts:791,1192). No competitor markets customer-runnable cryptographic chain verification. That is a real, defensible technical claim.

Durability: 12–24 months at most, and probably less. This is roughly a one-quarter engineering effort for any incumbent — a hash-chain column, a verification endpoint, a reason field on the mutation API. Nothing about it is patent-shaped or data-shaped. It is a good engineering decision, not a moat. Veeva shipping Vault AI across all applications in August 2026 and Falcon's TMF intake/QC agent in November 2026 both carry audit-traceability requirements that will push exactly this kind of tamper-evidence into the incumbent platforms as a side effect.

The determinism argument — a provably byte-stable readiness verdict rather than an ML confidence score (server/services/etmf/tmf-inspection-package.ts, 20 passing unit tests) — has slightly longer legs because it is a philosophical position an ML-first vendor is structurally reluctant to adopt. But it is worth 6–12 months of differentiation at most, and only against vendors leading with AI accuracy claims. The moment a competitor pairs its classifier with a deterministic rules-based verdict layer, the argument evaporates. Phlexglobal's 'right-first-time at upload' framing is already halfway there.

What we would be attacking, and why it does not yield. The incumbents' moats are the kind that do not erode on an engineering timeline: Veeva's 450+ customers with inspection precedent and QA acceptance (a switching cost measured in validated-migration years, not licence dollars); Phlexglobal's model pre-trained on millions of TMF documents plus a services bench that can remediate a broken legacy TMF (a data-and-labour moat an entrant cannot buy); Florence's 65,000 study sites and 600 sponsors (a two-sided network — the hardest structure in this category to displace). None of these is closable with code.

The one time-boxed opening. The overlay lane Medable opened in January 2026 is the only entry a product like ours could contest, and the window is roughly 18–24 months before the incumbents' own agents (Falcon's TMF intake and QC agent, early-adopter November 2026) close it from above and Medable's Agent Studio compounds from below. Contesting it requires connectors into Veeva Vault, Wingspan and OpenText — of which this codebase has exactly zero — plus a validated, executed CSV package. That is a 12–18 month build against a 18–24 month window. The arithmetic does not work as a standalone bet; it works only as a bolt-on to an acquirer who already has the connectors, the customers, or the validation apparatus.

## Shortest credible path to parity

1. STOP FIRST — decide whether to compete at all. Parity with Veeva/Phlexglobal on eTMF is a 3–5 year, tens-of-millions build against a ~$1.7B TAM that Veeva already holds at the enterprise tier. The recommendation is NOT to pursue eTMF parity. The rest of this list is the shortest credible path if the acquisition thesis nonetheless requires an eTMF story — sequenced so that the earliest steps also pay off if the answer is 'sell the audit substrate, not the eTMF'.
2. P0 / ~1 week — make the front door exist. Add an 'etmf' row to the module catalog (db/migrations/20260220_user_intelligence_platform.sql:78-107) so the surface appears in the Apps launcher, and add 'etmf' plus 'evidence-search' to NAV_HIDDEN (client/src/concept2cure/v2/registryModel.ts:125) so ⌘K resolves them by id rather than by notes-substring luck. Also fix the dead 'evidence-engine' module id, which currently lands on a placeholder scaffold (client/src/concept2cure/v2/V2App.tsx:219). This costs days and converts an invisible capability into a demoable one. It does not win a deal, but every subsequent step is worthless without it.
3. P0 / ~1 week — fix deployment integrity. Add migrations/20260610_etmf.sql and migrations/20260615_tmf_artifact_filings.sql to scripts/db/migration-set.mjs, and add RLS policies to both (neither declares any). Today, on any already-deployed database, every /api/etmf endpoint fails on a missing table. A diligence team that runs the deploy path and hits 42P01 will discount the whole eTMF line to zero — this is the single highest-leverage week in the list.
4. P0 / ~2 weeks — stop the data loss and stop the false pointer. server/routes/evidence-management.routes.ts:276 deletes uploaded bytes while :218 records a file_path that was never written; either persist through server/services/storage/storage-provider.ts or stop claiming a path. Separately, client/src/concept2cure/v2/surfaces/Etmf.tsx:124,142 writes documentRef = 'vault://trialId/artifactCode', which does not match the real scheme at storage-provider.ts:91 and resolves to nothing — either bind it to a real stored object or leave it null. Recording an unresolvable document reference in a regulated filing log is the kind of finding that ends a diligence conversation.
5. P1 / ~2–3 months — build the actual repository, or concede the category. Promote shared/schema/vault.ts's vaultDocuments from schema-with-a-cron to a real service: object storage behind server/services/storage/s3-provider.ts, content-hash on write, immutable version chain (the supersedesId/parentDocumentId columns already exist at shared/schema/vault.ts:104-105), retention enforcement wired to the existing server/jobs/retentionCron.ts, and check-in/check-out. Add an organization_id column — the table is currently scoped only by programId, which is a tenancy defect. Then give tmf_artifacts a foreign key to it (shared/schema/etmf.ts:50-77 has none today). Until this exists nothing else in this list matters, because the category is defined by it.
6. P1 / ~1 month, gated on the repository — bind e-signature to the TMF document record. The Part 11 machinery already works (server/routes/part11-compliance.ts:360,573,602; server/services/part11/version-binding.ts); it simply has no TMF document to sign. Once a versioned document record exists, wiring signature manifestation and version binding to it is small work and converts our strongest existing asset into a category-relevant one.
7. P1 / ~2 months — expand to CDISC TMF RM v4 and add the country/site dimension. Replace the 41-artifact DIA v3 subset (server/services/etmf/tmf-completeness.ts:36) with the full v4 Record Group / Record Type model, and add country and site columns to shared/schema/tmf-artifacts.ts:24-49. Without the three-level hierarchy the completeness verdict cannot be trusted by a sponsor QA group, and the readiness score is the only thing we currently sell.
8. P2 / ~2 months — content-based classification. Route TMF intake through the existing LLM gateway pattern already proven at server/services/ingestion/ingestion-service.ts:164-247, targeting TMF zones/artifacts instead of CTD section codes, with the deterministic regex classifier (server/services/etmf/etmf-logic.ts:35-49) retained as a fallback and as an explainability layer. Publish a measured accuracy figure against a held-out set — competitors publish unverified vendor claims; a reproducible number is the differentiated position.
9. P2 / ~1 month — add timeliness and quality. Add documentDate and a QC status/outcome column to tmf_artifact_filings, then compute filing lag and QC pass rate. This closes the gap the surface itself documents at client/src/concept2cure/v2/surfaces/Etmf.tsx:18-27 and completes the three TMF health metrics inspectors ask for. Cheap relative to its sales impact.
10. P2 / ~3–4 months and unavoidable — execute the validation package. The GAMP 5 kit at docs/validation/ is real but every artifact is 1.0.0-DRAFT with approval PENDING and contains zero eTMF coverage. Write eTMF-specific IQ/OQ/PQ protocols, execute them, get them approved by a named quality function, and produce a supplier-audit pack. Montrium wins mid-market deals on precisely this. No amount of product work substitutes for it — this is the QA gate, and it is pass/fail.
11. STRATEGIC ALTERNATIVE, and the one actually worth funding — take the overlay lane instead of the repository lane. Rather than rebuild a system of record, build connectors into Veeva Vault, Wingspan and OpenText and sell the readiness verdict, the governed reason-coded mutation ledger and the sealed audit chain as an inspection-readiness layer over the customer's existing eTMF. This is the Medable TMF Agent model. It needs: P0+P1 connectors (~4–6 months), the content classifier above (~2 months), and the executed validation package (~3–4 months) — call it 9–12 months, versus 3–5 years for repository parity. It plays to the two things we genuinely do better than the field (governed mutations with mandatory reason codes, and customer-verifiable cryptographic audit sealing) and it does not require winning a rip-and-replace against a validated incumbent. The window is roughly 18–24 months before Falcon's TMF intake/QC agent closes it from above.

## Verdict

**🔴 Not competitive** — This is a category verdict, not a quality verdict on the code — the eTMF code that exists is clean, deterministic, honestly documented and unit-tested. But a buyer in this category is purchasing a system of record for regulated documents, and the as-built product cannot hold a document.

Three facts decide it, and any one of them is disqualifying on its own.

First, there is no document repository. The evidence upload path reads the file, extracts text, writes a database row whose file_path points at a location that was never created, and then deletes the bytes (server/routes/evidence-management.routes.ts:218,276) — with no download endpoint anywhere in that router. The S3-backed vault schema that would be the real repository has no CRUD routes at all; its only consumer in the entire server tree is a retention cron that is not auto-registered at boot (shared/schema/vault.ts:5-8, server/jobs/retentionCron.ts). The single working byte store is a local-filesystem service used exclusively by the IVDR binder routes (server/services/vaultService.ts:27) — local disk, which is not a defensible GxP retention substrate on a multi-node deployment regardless. And the Vault surface's Upload and Download buttons dispatch chat prompts to the assistant rather than moving files (client/src/concept2cure/v2/surfaces/Vault.tsx:228,460). What is actually built is a TMF completeness checklist: tmf_artifact_filings stores an organization, a trial string, a reference-model artifact code, a zone number and a filedAt (shared/schema/tmf-artifacts.ts:24-49). The richer tmf_artifacts table has no document foreign key at all (shared/schema/etmf.ts:50-77). The product's own inspection-package module states the constraint plainly: 'tmf_artifacts stores metadata only — no document bytes... It never fabricates document content it does not hold' (server/services/etmf/tmf-inspection-package.ts:13-17). That honesty is admirable and it is also the finding.

Second, it is unreachable. The global navigation rail renders exactly five destinations (client/src/concept2cure/v2/registryModel.ts:116-122, Shell.tsx:185) against 100 registered surface views. The eTMF surface exists and is wired to live endpoints (client/src/concept2cure/v2/surfaces/Etmf.tsx:105,124,170 → surfaceViews.ts:165), but 'etmf' appears in neither RAIL_PRIMARY nor NAV_HIDDEN, and the Apps launcher renders a 20-module catalog seeded at db/migrations/20260220_user_intelligence_platform.sql:78-107 that contains no eTMF row. The only routes in are a ⌘K search that happens to substring-match the surface's notes text, or a deep link someone hands you. This is the pattern the brief flagged, and for this category it is decisive twice over — the same catalog's 'evidence-engine' module id has no matching surface view, so clicking it in Apps lands on a placeholder scaffold (client/src/concept2cure/v2/V2App.tsx:219).

Third, even the checklist is not defensible as an inspection instrument. The reference model encodes 41 artifacts across 11 zones with 26 marked essential (server/services/etmf/tmf-completeness.ts:36) — a fraction of the DIA/CDISC model, with no country or site level in the schema, and no CDISC TMF RM v4 support. Two of the three TMF health metrics inspectors ask about, timeliness and quality, have no backing columns and are shown as 'not yet available' (client/src/concept2cure/v2/surfaces/Etmf.tsx:18-27). Classification is eleven regexes against the artifact's name string in a module whose header says 'LLM-free' (server/services/etmf/etmf-logic.ts:35-49) — against Veeva's TMF Bot at over a million documents classified, TransPerfect's claimed 98% metadata accuracy, and PhlexTMF v21 pre-trained on millions of documents. And the filing action in the UI writes a documentRef of 'vault://' + trialId + '/' + artifactCode (Etmf.tsx:124,142) that does not match the one real vault URI scheme in the codebase (server/services/storage/storage-provider.ts:91) and resolves to nothing — so the checklist's pointer back to the source document is a dead string.

There is a fourth issue an acquirer's technical diligence will find: neither migrations/20260610_etmf.sql nor migrations/20260615_tmf_artifact_filings.sql appears in scripts/db/migration-set.mjs, the curated 25-file set that scripts/db/deploy-migrate.mjs applies at production deploy time. Only the from-scratch install path sweeps the whole migrations/ tree (scripts/db/install-fresh.mjs:65). On an already-deployed database, every /api/etmf endpoint returns a missing-table error. The repo documents this exact failure mode as 'merged ≠ applied' at scripts/db/deploy-migrate.mjs:6-14 — it has simply not been closed for eTMF.

What is genuinely valuable here is orthogonal to the category: a sha256-chained, HMAC-sealed audit ledger with on-demand chain and seal verification (server/services/auditService.ts:230-298, server/routes/part11-compliance.ts:791,1192), and a governed-mutation pattern that forces a reason string at the transaction boundary and rolls back if the ledger write fails (server/routes/etmf.ts:52,56-79). That is a better Part 11 §11.10(e) story than most of this field ships. It is an asset — for a platform, or bolted onto an acquirer's existing DMS. It is not an eTMF.

Verdict for an acquirer: do not value this line as eTMF/DMS revenue capability. Value it as (a) a governed-audit and provenance substrate, and (b) an eCTD/submission adjacency that happens to include a TMF gap-checker. If the thesis requires an eTMF, this is a build, not a buy.
