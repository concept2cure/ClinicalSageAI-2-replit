# QMS: SOP / document control, CAPA, change control, deviatio…

> **Verdict: 🔴 Not competitive**
> Weighted capability score — **us 1.6 / 5** vs **best competitor 4.9 / 5** across 13 dimensions.

**Full category as scoped:** QMS: SOP / document control, CAPA, change control, deviations & nonconformance, GxP training

## Who buys, and what they are actually buying

The VP/Head of Quality (or Quality Systems Manager) at a 50–1,000-person biotech, medtech or CDMO, with the CFO co-signing and IT/CSV validating. They hold a $25K–$250K/yr line item and they are buying one outcome: surviving an FDA/Notified Body inspection without a 483 observation on document control, CAPA closure, or training records. Concretely they buy (a) a system of record that is itself validated (vendor IQ/OQ/PQ package + release-by-release validation docs), (b) 21 CFR Part 11 e-signatures on every quality approval, (c) a defensible training matrix showing every employee is current on every effective SOP, and (d) an auditor-ready export in the room during an inspection. Secondary buyer in medtech is the RA lead who wants QMS and submission evidence in one place. AI is a tiebreaker in 2026, never the reason for the purchase — no Head of Quality has ever been fired for slow root-cause narratives, but plenty have for an unvalidated system.

## Market structure

MARKET SIZE AND SHAPE. The pharmaceutical QMS software market is projected to grow from USD 1.59B (2025) to USD 2.98B (2030) at 13.3% CAGR; the broader QMS software market is forecast at $20.43B by 2031. Pharma firms accounted for >57.29% of life-sciences QMS revenue in 2024, so a device-first product addresses well under half the money. Veeva and MasterControl are named the leading players in pharmaceutical QMS; the rest of the field — Dassault, IQVIA (Pilgrim), AmpleLogic, Qualio, QT9, Sparta/TrackWise (Honeywell), AssurX, ETQ (Hexagon), Qualityze, Ideagen — sits behind them. The category is consolidating: high M&A activity as players buy technical capability and share (Honeywell/Sparta, Hexagon/ETQ are the completed examples).

PROCUREMENT PATTERN. This is a replacement sale, not a greenfield sale. The buyer already has SOPs somewhere — SharePoint, paper, or a legacy eQMS — and is migrating under audit pressure or investor pressure. Two distinct motions:
(1) Emerging-company motion ($12K–$60K/yr, 4–12 week cycle): Qualio, Dot Compliance Xpress, Greenlight Guru. Decided on time-to-value and the pre-validation package. Qualio's "deploys in weeks, pre-validation package used by 99% of customers" is the canonical winning line. Vendr median for Greenlight Guru is $43,989/yr with observed deals $20,975–$54,739 — that is the real mid-market band.
(2) Enterprise motion ($100K–$1M+/yr, 6–18 month cycle): Veeva Vault Quality, MasterControl. Base-plus-named-user (Veeva ~$50–$200/user/month) or $25K entry scaling past $100K (MasterControl). Decided by a formal RFP with a CSV/validation workstream, a security review, and a supplier-audit of the vendor's own quality system.

THE GATING QUESTION IN EVERY DEAL. Before any feature is discussed, the buyer asks: "Send me your validation package and your Part 11 statement." Veeva answers with built-in validation documentation supplied with each release plus a Part 11/Annex 11 compliance statement on QualityDocs. Qualio answers with a pre-validation package and documented IQ/OQ/PQ. MasterControl answers with Part 11 + Annex 11 compliance and an ISO 42001-certified AI management system. Dot answers with "pre-built and pre-validated." A vendor without an answer does not reach the demo. This is not a scoring dimension among many — it is the qualifying gate.

WHERE AI ACTUALLY SITS IN 2026. The market has moved past copilots. Industry commentary is explicit that successful quality organisations are no longer running standalone tools or copilots outside the QMS; they are embedding AI directly into existing validated workflows at the points that rely on manual review, free text and institutional memory — which is precisely deviation investigation, root-cause narrative, and CAPA drafting. Two vendors shipped agentic capability in April 2026 in the same month: Veeva's AI Agents for Quality (GA April 2026, Anthropic + Amazon models on Bedrock, with the Deviation Agent generating investigation and CAPA-plan narratives) and Dot Compliance's Dottie AI 5.0 Personas (GA 21 April 2026). MasterControl differentiates on AI governance rather than agent count, holding ISO 42001 certification since July 2025 and marketing Assist AI as "validated and ready to use." The implication for a challenger: the AI-native window in eQMS effectively closed in April 2026. AI is now a feature comparison inside validated systems, not a wedge against them.

## The five closest competitors

### Veeva Systems — Vault Quality (Vault QMS + QualityDocs + Training + Station Manager + Validation Management) — Vault QMS with the surrounding Vault Quality application family on the single Vault platform

The enterprise default for pharma/biopharma and increasingly medtech. Sold as 'one platform for quality, clinical and regulatory' — the QMS shares the Vault object model with Vault RIM, so quality events and submission content live in one system. Land is usually QualityDocs + QMS; Training, Station Manager, LIMS, Batch Release and Validation Management are the expansion path.

**Strengths**

- Complete process coverage on one platform: deviations, CAPA, change control, audits, complaints, plus QualityDocs for controlled SOP content and Training for GxP curricula tied to those SOPs
- QualityDocs is stated as FDA 21 CFR Part 11 compliant with electronic records, e-signatures and audit trails, EU Annex 11 compliant, and ships built-in validation documentation with each release — this is the single biggest procurement unlock
- Training application creates curricula from QualityDocs SOPs/policies, assigns by role, and tracks completion and re-certification — the exact artifact a 483 turns on
- Ships a real, in-product AI agent: the Deviation Agent generates narrative summaries of the investigation or CAPA plan for a Deviation, pulling from related Investigation and Root Cause records, and answers questions about the deviation via Vault AI Chat
- AI Agents for Quality reached general availability April 2026, running on LLMs from Anthropic and Amazon via Bedrock — this is shipped, not roadmap
- Station Manager puts controlled documents on the manufacturing floor on approved tablets — closes the paper-on-the-line gap most cloud eQMS vendors leave open

**Weaknesses**

- Most expensive option; base-plus-named-user model means costs scale badly for large operator populations
- Implementation is a consulting engagement, typically multi-quarter, and configuration debt is real
- Deviation Agent as shipped is summarization/Q&A over existing records — it does not classify a GMP deviation against 21 CFR 211.192 thresholds or derive Field Alert / recall evaluation triggers
- Pricing is never published; every deal is a negotiated multi-year contract, which slows small-buyer procurement
- Overkill for a sub-200-person biotech; frequently loses those deals to Qualio/Dot on time-to-value

| | |
|---|---|
| AI shipped today | Shipped as of 2026: Deviation Agent in Vaults licensed for Vault AI for Quality — generates investigation/CAPA-plan narrative summaries from related records and answers deviation questions in Vault AI Chat. Veeva AI Agents for Quality (and PV) became generally available April 2026, powered by Anthropic and Amazon models on Amazon Bedrock, targeting quality-event summarization, investigation narrative generation, translation and APQR drafting. Customers can build their own agents. Human review remains required — the agent drafts, the quality unit approves. |
| GxP / validation posture | Strongest in the set. QualityDocs stated FDA 21 CFR Part 11 compliant (e-records, e-signatures, audit trails), EU Annex 11 compliant, with built-in validation documentation supplied with each release. A separate Vault Validation Management application manages IQ/OQ/PQ protocols and execution for the customer's own systems. |
| Pricing signal | Not public. Industry analysis of 2026 deals reports a base-plus-named-user model — an annual base subscription per application/environment plus per-user licences, with standard Vault fees roughly $50–$200 per user per month (low hundreds to low thousands of dollars per user per year). AI agent pricing not disclosed. |

<details><summary>Sources</summary>

- https://www.veeva.com/ap/products/veeva-qms/
- https://quality.veevavault.help/en/lr/1006459
- https://quality.veevavault.help/en/lr/34812/
- https://www.veeva.com/medtech/products/quality/qualitydocs/
- https://intuitionlabs.ai/articles/automating-capa-deviations-veeva-vault-qms-ai
- https://intuitionlabs.ai/articles/veeva-ai-roadmap-crm-bot-agents-2026
- https://intuitionlabs.ai/articles/veeva-vault-pricing-2026-cost-breakdown
- https://intuitionlabs.ai/articles/veeva-vault-architecture-modules-guide
- https://www.g2.com/products/veeva-vault-qms/reviews

</details>

### MasterControl — Quality Excellence — MasterControl Quality Excellence (document management, CAPA, deviations, change control, training, audits, complaints) on the ADAPT platform, with MasterControl Assist AI

The manufacturing-heavy incumbent. Positions as 'AI-first quality' for regulated manufacturers, with the strongest story where quality meets the shop floor (eDHR / electronic batch records feeding deviations). Deepest install base in pharma manufacturing and long-tenured medtech.

**Strengths**

- Centralises CAPA, deviations, change control, training, document control and audit management in one integrated environment at enterprise scale
- Stated 21 CFR Part 11 and EU Annex 11 compliant — the procurement checkbox is answered out of the box
- ISO 42001 certification (July 2025) for its AI management system, explicitly covering layered security, validation and compliance oversight of its AI tools for life sciences — this is the most defensible AI-governance credential in the category and directly answers the CSV lead's 'how do I validate your AI' question
- MasterControl Assist AI is marketed as validated and ready to use for content generation and quality trend monitoring — validated AI, not beta AI
- eDHR captures live shop-floor data, flags deviations and links them to batch records — closes the manufacturing-to-quality loop that pure cloud eQMS vendors cannot
- March 2026 expansion of the AI-first quality platform including support for secure AI adoption inside regulated quality processes

**Weaknesses**

- Legacy UX; long-standing user complaints about configuration complexity and admin burden
- Priced and scoped for mid-to-large manufacturers — the $25K entry plan is thin and real deployments land far higher
- Implementation and validation effort is substantial; not a weeks-to-value product
- Weaker than Veeva on unifying quality with regulatory submission content

| | |
|---|---|
| AI shipped today | Shipped: MasterControl Assist AI for content generation and quality trend monitoring, described as validated and ready to use. The ADAPT platform is built in alignment with ISO 42001 to provide a compliant foundation for AI services with regulatory and manufacturing context. Company reports the AI tooling saves customers 1,000+ hours/year. No publicly documented autonomous deviation-classification agent. |
| GxP / validation posture | Stated 21 CFR Part 11 and Annex 11 compliant; ISO 42001 certified AI management system (July 2025) covering validation and compliance oversight of AI tools. Vendor validation packages and validation services are part of the standard commercial motion. |
| Pricing signal | Quality Excellence starts at ~$25,000/year for the Basic plan (analytics, document management, BI, change control) and commonly scales past $100K/year. SaaS subscription with per-user licences (full-access and basic/read-only tiers). No public tiered pricing on mastercontrol.com — quote-based. |

<details><summary>Sources</summary>

- https://www.mastercontrol.com/gxp-lifeline/ai-enhanced-fda-iso-compliance-for-pharma-manufacturing/
- https://www.mastercontrol.com/gxp-lifeline/mastercontrol-wins-2026-buyers-choice-award-by-trustradius/
- https://www.capterra.com/p/148577/MasterControl/
- https://www.g2.com/products/mastercontrol-quality-management-system/pricing
- https://intuitionlabs.ai/articles/gxp-compliance-software-eqms-comparison-2026
- https://factory-talk.com/mastercontrol-eqms-insights-ai-factorytalk/

</details>

### Dot Compliance — eQMS (QMS Xpress / Compliance Xpand / Enterprise Xact) with Dottie AI — Salesforce-native pre-validated eQMS with the Dottie AI assistant and, from 2026, Dottie AI 5.0 agentic personas

The AI-native challenger with an incumbent-grade compliance story. Sells 'ready-to-deploy and pre-validated' against Veeva's implementation timeline and MasterControl's admin burden. Salesforce platform gives enterprise IT a familiar security and integration surface.

**Strengths**

- Pre-built and pre-validated out of the box with life-sciences best-practice workflows — the shortest credible path from signature to a defensible QMS
- Broadest process list in the set: document management, change management, audit management, training, CAPA, complaints, quality events, risk, equipment, electronic batch records and supplier quality
- Dottie AI 5.0 with Dottie Personas — a class of agentic AI specialists intended to operate as members of a hybrid workforce, announced generally available April 2026. This is the most aggressive agentic positioning of any established eQMS vendor
- Embedded assistant lets users query quality data conversationally and surfaces proactive compliance insights — the same conversational-QMS thesis Concept2Cure is chasing, already in market inside a validated system
- Three-tier packaging (Xpress → Xpand → Xact) lets a 30-person biotech start small and grow without replatforming
- Salesforce foundation means SSO, org security model and integration tooling are enterprise-grade on day one

**Weaknesses**

- Salesforce dependency adds a platform layer and a second vendor relationship to the risk register
- Smaller install base and reference pool than Veeva/MasterControl in large pharma
- Agentic personas are new (April 2026) — limited public evidence of inspection-tested outcomes as of mid-2026
- No public per-user pricing; deal shape must be discovered through sales

| | |
|---|---|
| AI shipped today | Shipped: Dottie, an AI assistant trained on quality and compliance workflows, embedded across the eQMS for querying quality data and surfacing proactive compliance insights. Dottie AI 5.0 with Dottie Personas — agentic AI specialists designed to operate as trusted members of hybrid workforces — announced generally available 21 April 2026. Specific per-process autonomy boundaries and human-review gates are not verified from public sources. |
| GxP / validation posture | Ships pre-built and pre-validated with industry best practices and key workflows incorporated out of the box — this is the core commercial claim. Detailed contents of the validation package (IQ/OQ/PQ scope, release-by-release regression evidence) not verified from public sources. |
| Pricing signal | Not public. Independent comparison places it alongside Greenlight Guru and Qualio at roughly $20K–$60K/year with a typical one-to-three-year minimum commitment. No per-user rate published on Capterra, GetApp or G2. |

<details><summary>Sources</summary>

- https://www.dotcompliance.com/eqms/
- https://www.dotcompliance.com/blog/eqms/what-is-the-top-qms-software-to-use-in-2026/
- https://www.pharmiweb.com/press-release/2026-04-21/dot-compliance-launches-dottie-ai-50-introduces-agentic-ai-personas-to-power-the-future-of-hybrid-workforces
- https://atlas.verdantix.com/dot-compliance/dot-compliance-eqms
- https://openregulatory.com/articles/dot-compliance-price
- https://www.g2.com/products/dot-compliance-qms/reviews

</details>

### Qualio — Qualio cloud eQMS (Foundation / Growth / Scale)

The emerging-company default. Explicitly built for life-sciences companies moving off paper or hybrid systems, and the most common first eQMS for a Series A–C biotech or a small medtech. Competes on time-to-value and pre-validation, not on depth.

**Strengths**

- Deploys in weeks using pre-built life-sciences workflows and a pre-validation package used by 99% of customers — the single most quoted line in this segment's procurement
- Covers document control, training, CAPA, audit management, risk, design controls and pharmacovigilance in one subscription
- Supports FDA 21 CFR Part 11, ISO 13485, EU MDR, MDSAP, GxP and ICH Q10 in one validated system, with Part 11-compliant electronic signatures and documented IQ/OQ/PQ protocols for GxP environments
- Pricing is the most transparent in the category via third-party data — a buyer can budget before the first call
- Tiering by edit-user count with unlimited free basic (read/train) users is exactly right for training compliance economics: you pay for authors, not for the 400 people who must read-and-understand
- Ships AI for predictive quality-issue identification, automated root-cause and CAPA-monitoring analysis, anomaly detection, AI-assisted document review, predictive risk analysis and AI-powered search

**Weaknesses**

- Depth ceiling: enterprise pharma manufacturing processes (batch records, shop-floor deviation intake, complex multi-site change control) outgrow it
- Less configurable than MasterControl/Veeva; opinionated workflows are a virtue at 50 people and a constraint at 500
- AI features are analytics-and-assist rather than agentic action inside the governed workflow
- Per-user cost is high relative to the base fee, so growth is expensive

| | |
|---|---|
| AI shipped today | Shipped: AI-powered predictive analytics for identifying quality issues, automated data analysis for root-cause investigation and CAPA monitoring, AI-driven anomaly detection, AI-assisted document review, predictive risk analysis using machine learning, and AI-powered search/knowledge management. No publicly documented autonomous write-agent that transitions quality records. |
| GxP / validation posture | Strong for the segment. Pre-validation package used by 99% of customers; 21 CFR Part 11-compliant electronic signatures; documented IQ/OQ/PQ protocols for GxP deployments; single validated system spanning Part 11, ISO 13485, EU MDR, MDSAP, GxP and ICH Q10. |
| Pricing signal | Base platform fee starts around $12,000/year plus approximately $3,000 per (edit) user — e.g. ~$36,000/year for 10 users. Three tiers: Foundation (5 edit + 10 basic users), Growth (10 + 20), Scale (20 + 50); basic users unlimited at no extra cost. Small-team estimates of $5K–$15K/year appear in third-party analyses. Qualio's own /pricing page is quote-request only. |

<details><summary>Sources</summary>

- https://www.qualio.com/pricing
- https://softwareconnect.com/reviews/qualio/
- https://www.g2.com/products/qualio/reviews
- https://www.softwareadvice.com/capa/qualio-profile/
- https://www.getapp.com/collaboration-software/a/qualio/
- https://qmswrapper.com/qmswrapper-vs-qualio/

</details>

### Greenlight Guru — Quality Management System (with Greenlight Guru AI) — Greenlight Guru QMS — medical-device-only eQMS covering document control, CAPA, design controls, risk, complaints, training and traceability

The medtech-only specialist and the most likely head-to-head for Concept2Cure's device segment. Sells depth-in-one-vertical: design controls, ISO 14971 risk and traceability wired to the QMS, rather than a horizontal quality platform configured for devices.

**Strengths**

- Only eQMS in this set built exclusively for medical device companies; 1,100+ medtech customers with pre-configured workflows aligned to ISO 13485, FDA 21 CFR Part 820/QMSR, ISO 14971 and EU MDR
- Differentiator that actually decides medtech deals: design controls, risk management and traceability linking user needs → design inputs → outputs → V&V → approvals inside the same eQMS as CAPA and document control
- Core Part 11 machinery present — document control, audit trails, electronic signatures, CAPA workflows
- Greenlight Guru AI works from the customer's own QMS data (documents, records, traceability) and keeps outputs inside the governed system — the correct architecture for regulated AI
- Strong brand and reference density in medtech; often shortlisted by default

**Weaknesses**

- Medtech-only — irrelevant for a pharma/biotech buyer, which halves its addressable overlap with a multi-vertical platform
- Pricing rose sharply: reports of an increase starting January 2026 potentially approaching +100% without new features, plus a mandatory $2,000–$5,000 one-time onboarding fee — this is actively creating switching intent in the installed base
- AI GA is targeted for Q2 2026 with beta customers ahead of broad release, so as of mid-2026 the AI story is newer and thinner than Veeva's or Dot's
- No manufacturing/batch-record depth; weak for combination products and drug-side quality

| | |
|---|---|
| AI shipped today | Greenlight Guru AI is grounded in the customer's own QMS documents, records and traceability, with outputs staying inside the governing system. GA targeted for Q2 2026, with beta customers getting early access and shaping features before broad release. The specific per-feature GA set as of July 2026 is not verified from public sources. |
| GxP / validation posture | Pre-configured workflows aligned to ISO 13485, FDA 21 CFR Part 820/QMSR, ISO 14971 and EU MDR; ships document control, audit trails and electronic signatures. Vendor validation-package specifics not verified from public sources. |
| Pricing signal | Not published by the vendor. Verified third-party data: annual cost ranges $25,000–$35,000 for small teams to $50,000–$60,000+ for larger multi-module deployments; Vendr procurement median $43,989/year with observed deals $20,975–$54,739. Alternative reported structure ~$500/month for a single user scaling to ~$10,000/month at 100 users. Price increase from 01/2026 reported as potentially +100%; budget $2,000–$5,000 mandatory one-time onboarding. |

<details><summary>Sources</summary>

- https://www.greenlight.guru/quality-management-software
- https://www.greenlight.guru/greenlight-guru-ai
- https://www.greenlight.guru/blog/greenlight-guru-ai-features
- https://openregulatory.com/articles/greenlight-guru-price
- https://www.capterra.com/p/140578/greenlight-guru/
- https://meddeviceguide.com/blog/best-eqms-software-medical-devices-2026-guide

</details>

## Capability rubric

Our score is cited to `file:line` in this repository. Theirs is cited in the competitor sections above. Scored on what **ships and is reachable**, not what is architected — an unreachable or unvalidated capability scores low regardless of code quality.

| Dimension | Weight | Us | Best competitor | Their score | Our evidence |
|---|---|:--:|---|:--:|---|
| Vendor validation package + Part 11/Annex 11 compliance statement (the qualifying gate — no package, no evaluation) | critical | **1** 🔻 | Veeva Vault QualityDocs — Part 11 e-records/e-signatures/audit trails, EU Annex 11, built-in validation documentation with each release | 5 | docs/validation/VMP-CORTEX-001-VALIDATION_MASTER_PLAN.md:1-20 (scoped to 'Cortex Prime AI System', v1.0.0-DRAFT, 'REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE', Approved By: PENDING — no QMS-module coverage); server/routes/part11-compliance.ts:1132-1149 (every §11.10 section returned as 'not_assessed', overallStatus 'not_assessed', readinessScore null, disclaimer 'Self-assessment only'), rendered by client/src/concept2cure/v2/surfaces/Part11Console.tsx:7-13 |
| 21 CFR Part 11 electronic signature on quality approvals — §11.200 two identification components + §11.50 signature manifestation on SOP approval, change approval, CAPA closure | critical | **1** 🔻 | Veeva Vault QualityDocs / MasterControl / Qualio (all three at parity) | 5 | server/routes/c2c/actions.ts:74 (HIGH_RISK_COMMANDS = {'sign','lock','revoke-signature','transmittal_rollback'}) vs server/services/ana/AnaToolExecutor.ts:13239 (SOP approval records command:'transition' — not high-risk, so the re-auth at actions.ts:225-236 never fires); AnaToolExecutor.ts:13426-13453 (change transition bypasses the ledger entirely, calling auditService.logAction); server/services/part11ComplianceService.ts:546 (working bcrypt second-factor exists) with zero QMS callers — only server/services/510kComplianceTracker.ts:16 imports it |
| Reachability — can the target user find and operate the QMS from the product's own navigation | critical | **1** 🔻 | Qualio / Veeva / MasterControl / Dot / Greenlight Guru (the QMS is the product) | 5 | client/src/concept2cure/v2/registryModel.ts:116-122 (RAIL_PRIMARY = 5 destinations, none is Quality) and :170 ('quality' in NAV_HIDDEN); db/migrations/20260220_user_intelligence_platform.sql:78 (available_modules seed = 18 modules, no Quality/QMS row, so the Apps catalog cannot surface it); registryModel.ts:467/493/551/634 (SEGMENT_MODULES lists quality but is imported only by client/src/concept2cure/v2/__tests__/registryModel.test.ts:20); reachable only via ⌘K (Shell.tsx:982, which does not filter NAV_HIDDEN) or the URL /concept2cure/quality |
| GxP training management — role-based curricula, assignment, due/overdue per person, retraining cycle, effectiveness check, inspection-ready training matrix | critical | **1** 🔻 | Veeva Vault Training — curricula built from QualityDocs SOPs, assigned by role, completion and re-certification tracked | 5 | migrations/20260511_qms_and_labeling.sql:51-70 (qms_training_records has user_id/document_version/quiz_score/expires_at but no curriculum, assignment, role or due-date table); server/routes/mdx-qms.ts (training endpoints are list, expiring, compliance, ack only); client/src/concept2cure/quality/hooks.ts:105-118 (compliance = distinct current acknowledgements over org roster); no assignment engine, scheduler, notification or matrix export anywhere |
| Deviation / nonconformance management — intake, classification, investigation, product impact and batch disposition, closure | critical | **1** 🔻 | Veeva Vault QMS (deviations native, with Deviation Agent narrative generation) / MasterControl (eDHR shop-floor deviation capture linked to batch records) | 5 | shared/schema.ts:9737 (`deviations` table fully specified, zero routes/services/UI — grep finds no reads or writes); server/routes/qc.routes.ts:41-47 and server/storage.ts:1524,1528 (QC deviations and OOS investigations return HTTP 501 NOT_IMPLEMENTED); qms_nonconforming_products has endpoints in mdx-qms.ts but no client consumer; only GCP protocol deviations are built (server/services/protocol-deviations/, 301 lines) |
| Controlled document control — lifecycle, periodic review, versioning, rendered document viewing, controlled copy, redline | critical | **2** 🔻 | Veeva Vault QualityDocs + Station Manager (controlled content, floor-level tablet access) | 5 | server/routes/mdx-qms.ts:79-115 (8 doc types, 5-state lifecycle, review dates, template-seeded sections, nextMajorVersion bump) and 35 endpoints total — the model is real; but client/src/concept2cure/quality/SopRegister.tsx:10-15 is explicitly read-only ('No mutation is performed directly here'), there is no document viewer, no redline, no controlled-copy print, and no approval inbox anywhere in client/src/concept2cure/quality/ |
| Data integrity / ALCOA+ — no synthetic records presented as real, immutable audit trail | critical | **2** 🔻 | Veeva / MasterControl / Qualio (validated systems never render fixtures) | 5 | Strong substrate: server/services/auditService.ts:251-302 (SHA-256 hash chain, HMAC seal, immutability triggers). Fatally undercut by client/src/concept2cure/quality/SopRegister.tsx:80,86 (`reg.docs ?? FIXTURE_DOCS`, `trainComp.rows ?? FIXTURE_TRAINING`) and ChangeControl.tsx:73-74 — on error or unprovisioned tenant the register renders 8 invented SOPs (data.ts:146-155, e.g. 'SOP-820-100 CAPA v5.0 effective 2026-03-30') and '47 of 47' training compliance with no badge or state marker; contrast client/src/concept2cure/v2/surfaces/Training.tsx:29-33 which is fixture-free with honest EmptyState |
| CAPA lifecycle — root cause, action plan, effectiveness verification, closure gating, and a working front end | critical | **2** 🔻 | Veeva Vault QMS (CAPA native with agentic CAPA-plan narrative) / Qualio (CAPA with pre-validated workflow) | 5 | Backend is genuinely strong: server/services/capa-mdr/stateMachine.ts:87-88 (action_implemented → effectiveness_check → closed_effective \| closed_not_effective \| escalated), capaMdr.service.ts (1,022 lines, org-scoped, audited), shared/schema/capa-mdr.ts:398-399 (effectivenessCheckCriteria/Result), clockCalculator.ts + triageEngine.ts for 21 CFR 803 / EU MDR Art. 87 reportability. But the only CAPA UI is client/src/concept2cure/v2/surfaces/DeviceSubmission.tsx:285-287, which no file imports; the second is PostmarketSurface.tsx routed at mdx/App.tsx:240 under nav id 'postmarket', absent from mdx/data/nav.ts:31-49. Device postmarket CAPA only — no general pharma CAPA record exists |
| Change control — impact assessment, segregation of duties, implementation, effectiveness verification, cross-record linkage (ICH Q10 §3.2.3 / Annex 15) | high | **3** 🔻 | Veeva Vault QMS (change control native, object-graph linked to deviations/CAPA/docs, e-signed) | 5 | server/services/qms/changeControl.service.ts:46-55 (explicit 8-state machine, illegal transitions throw), :203-205 (SegregationOfDutiesError — approver must differ from proposer, enforced in code), :31-36 (typed links to deviation/capa/validation/document/sop/supplier/risk with 5 relationship kinds); tested at server/services/qms/__tests__/changeControl.pglite.integration.test.ts; real read UI at client/src/concept2cure/quality/ChangeControl.tsx (375 lines) + ChangeFlow.tsx lifecycle chart. Capped at 3: no e-signature on approval, no impact-assessment form in the UI, all writes are chat-only, and links are free-text refs because no deviation register exists to link to |
| AI that acts inside the governed quality workflow — classify, draft, transition — with human-in-loop and audit trail | high | **4** | Veeva Deviation Agent + AI Agents for Quality (GA April 2026, Anthropic/Amazon on Bedrock) — narrower in scope but inside a validated, e-signed system; Dot Compliance Dottie 5.0 Personas (GA 21 April 2026) comparable | 4 | server/services/gmp-quality-systems/gmp-quality-systems-knowledge.ts:1554 classifyGMPDeviation (critical/major/minor with per-rule rationale, 24/48/72h response clock, 21 CFR 211.192 30-day investigation target, batch disposition, and automatic 21 CFR 314.81(b)(1) Field Alert + Part 7 recall evaluation triggers) and :1308 designCAPA (ICH Q9(R1) §5.2 proportionate formality, cited root-cause method selection, ICH Q10 §3.2.2 correction/corrective/preventive split, effectiveness checks with acceptance criteria and 3/6-month timing); 6 tools exposed via gmpQualitySystemsTools.ts:33-458, registered at AnaToolDefinitions.ts:2174; 11 QMS write tools at qms-labeling-analytics-tool-defs.ts:18-186 with real handlers at AnaToolExecutor.ts:13152/13205/13353/13393/13426 — tenant-scoped, transactional, audited, reason-for-change enforced (13432), SoD surfaced to the user (13449) |
| Supplier quality, internal audit and management review | medium | **1** 🔻 | Dot Compliance (supplier quality, audit management, equipment, eBR in one pre-validated suite) | 5 | migrations/20260511_qms_and_labeling.sql:72,95,121 (qms_suppliers, qms_internal_audits, qms_management_reviews) and endpoints in server/routes/mdx-qms.ts — zero client consumers; a second unused router at server/routes/qms.ts (227 lines, mounted via server/bootstrap/register-document-routes.ts:292) covers the same ground with no UI either |
| Time to a defensible, validated go-live (preconfigured GxP workflows + procedure library) | high | **1** 🔻 | Qualio — deploys in weeks on pre-built life-sciences workflows with a pre-validation package used by 99% of customers | 5 | server/services/qms/sopTemplates.ts (199 lines, 7 generic templates sharing one STANDARD_SECTIONS skeleton — client/src/concept2cure/quality/data.ts:135-143); no ISO 13485 / 21 CFR 820 / QMSR procedure library, no preconfigured validated workflow pack, no migration tooling, no customer validation deliverables |
| Inspection readiness and quality analytics (483 response clock, readiness scoring, management-review metrics) | high | **2** 🔻 | MasterControl (quality trend monitoring + AI-assisted audit readiness) / Veeva (audit-readiness summarisation agents) | 4 | server/services/inspection/inspection-service.ts + server/services/inspection/inspection-logic.ts (Form 483 responses default to 15 business days from inspection end; per-area readiness scoring), mounted at server/bootstrap/register-inline-routes.ts:688; server/routes/mdx-qms.ts:160-275 (cross-domain readiness aggregate with honest available:false degradation). Scored 2 because the only inspection UI is the unreferenced DeviceSubmission.tsx:333, and useQmsReadiness is consumed only by client/src/concept2cure/mdx/projectHome/ProjectHome.tsx:202, itself inside the ⌘K-only MDX app |

## Where we stand

**Where we win**

- Deterministic, citation-bearing GMP quality reasoning that no competitor ships. server/services/gmp-quality-systems/gmp-quality-systems-knowledge.ts is 2,558 lines of real regulatory logic: classifyGMPDeviation (line 1554) takes area, patient-safety impact, OOS status, sterility and recurrence and returns a critical/major/minor classification with per-rule rationale, a 24/48/72-hour initial-response clock, a 30-day investigation target anchored to 21 CFR 211.192, a product-impact and batch-disposition recommendation, and — the part nobody else has — automatic Field Alert Report evaluation against 21 CFR 314.81(b)(1) with the 3-working-day clock, and a recall/health-hazard evaluation trigger against 21 CFR Part 7. designCAPA (line 1308) applies ICH Q9(R1) §5.2 QRM-proportionate formality, selects a root-cause method with citations, separates correction/corrective/preventive per ICH Q10 §3.2.2, and emits effectiveness checks with acceptance criteria and 3/6-month review timing. Veeva's Deviation Agent summarises records; this reasons to a regulatory conclusion.
- Write-capable AI inside the governed workflow, not a read-only assistant. 11 QMS write tools are registered in the model's live tool registry (server/services/ana/qms-labeling-analytics-tool-defs.ts lines 18–186: create/approve/revise/retire_qms_document, ack_training, register_supplier, log_nonconforming_product, qms_change_create/transition/link) plus 6 GMP reasoning tools (gmpQualitySystemsTools.ts, registered at AnaToolDefinitions.ts:2174). Handlers are real, tenant-scoped, transactional and audited — qms_change_transition (AnaToolExecutor.ts:13426) refuses to execute without a reason-for-change of ≥3 characters and surfaces the segregation-of-duties error verbatim to the user. A quality engineer can raise, assess, approve and link a change control in conversation. Neither Veeva's Deviation Agent nor Qualio's assist layer transitions records.
- Change control that is architecturally correct and provably tested. server/services/qms/changeControl.service.ts implements the ICH Q10 §3.2.3 / EU GMP Annex 15 lifecycle as an explicit state machine (lines 46–55: proposed → under_assessment → approved/rejected → in_implementation → verification → closed, with cancel from any live state and rejected/closed/cancelled terminal), enforces segregation of duties in code (lines 203–205: the approver must differ from the proposer), and carries a typed cross-reference table linking a change to deviations, CAPAs, validation records, SOPs, suppliers and risks with relationship semantics (triggered_by/addresses/requires/impacts/references). It has a PGlite integration test (server/services/qms/__tests__/changeControl.pglite.integration.test.ts) and a client component test. This is the one dimension where the design is genuinely competitive with Veeva.
- Quality-system readiness as an aggregate that crosses domains. GET /api/mdx/qms/readiness (server/routes/mdx-qms.ts:160) computes effective/overdue-review document counts, unapproved-critical-supplier and overdue-supplier-audit counts, training currency, open audit findings and nonconformance counts in one org-scoped block — and does it honestly, degrading each block independently on a missing table to available:false rather than reporting a misleading zero (documented at lines 154–159: 'a zero from an absent system reads as an all-clear'). That engineering judgment is better than most incumbents' dashboards.
- Tamper-evident audit trail with real cryptography. server/services/auditService.ts delegates to a hash-chain log with SHA-256 chaining, HMAC seals and database immutability triggers (lines 251–302), and the platform ships a Part 11 console reading /api/part11/audit-trail/chain-integrity. The substrate for an inspection-grade audit trail exists and is stronger than a plain append-only table.
- Adjacent regulatory depth an eQMS vendor cannot match. Inspection readiness with the Form 483 15-business-day response clock and per-area readiness scoring (server/services/inspection/inspection-service.ts, mounted at /api/inspections), and a complete device postmarket chain — complaint → MDR reportability triage → CAPA with an effectiveness_check state that closes to closed_effective / closed_not_effective / escalated (server/services/capa-mdr/stateMachine.ts:87–88, capaMdr.service.ts, 1,022 lines) with FDA 21 CFR 803 / EU MDR Art. 87 / 21 CFR 806 clock calculation. For a medtech buyer this is Greenlight Guru's territory, built.

**Where we reach parity**

- Controlled-document data model and lifecycle. qms_documents supports 8 document types, the full draft → in_review → effective → superseded → retired lifecycle, periodic review dates with overdue derivation, artifact linkage, template-seeded section skeletons and automatic major-version bump on revision. 35 REST endpoints across mdx-qms.ts cover documents, training, suppliers, internal audits, management reviews, nonconforming products and change control. Structurally this is at parity with Qualio's data model — the gap is everything above the data model.
- Cross-record traceability. The qms_change_links table gives a change control typed references to deviations, CAPAs, validation records and SOPs with relationship semantics — comparable in ambition to Veeva's object-graph linkage, though it links by free-text ref rather than by enforced foreign key to a live deviation record (because no deviation register exists to link to).
- Tenant isolation and governed-action ledger. Every QMS read and write is organization-scoped from the JWT, mutations run BEGIN → setTenantContextTx → recordGovernedAction → COMMIT, and cross-tenant IDOR was explicitly hardened at the compile boundary. Multi-tenant security posture is at or above the mid-market field.

**Where we lose**

- THE MODULE HAS NO FRONT DOOR. As of HEAD the global rail contains exactly five destinations — Chats, Projects, Communication Center, Apps, Settings (client/src/concept2cure/v2/registryModel.ts:116–122) — and 'quality' was demoted into NAV_HIDDEN (line 170). The fallback discovery surface is the Apps catalog, which renders from /api/module-subscriptions/catalog, seeded from available_modules in db/migrations/20260220_user_intelligence_platform.sql:78 — 18 modules, none of which is Quality/QMS. SEGMENT_MODULES, the registry map that does list 'quality' under 'Review & govern' (registryModel.ts:467, 493, 551, 634), is imported only by a test file and renders nowhere. Net: a Head of Quality can reach the QMS only by typing 'quality' into ⌘K or by knowing the URL /concept2cure/quality. In a competitive bake-off the evaluator never finds it.
- NO ELECTRONIC SIGNATURE ON ANY QUALITY APPROVAL. This is the disqualifying gap. A working Part 11 §11.200 implementation exists — part11ComplianceService.verifyUserCredentials (line 546) does bcrypt password re-authentication for the second identification component, and the governed-action ledger has a re-auth gate — but HIGH_RISK_COMMANDS in server/routes/c2c/actions.ts:74 is exactly {'sign','lock','revoke-signature','transmittal_rollback'}. SOP approval (AnaToolExecutor.ts:13205) records command:'transition', which is not in that set, so no re-auth fires. qms_change_transition bypasses the ledger entirely, calling auditService.logAction directly. Result: an SOP goes effective and a change control gets approved on a session cookie, with no signature manifestation (§11.50: printed name, date/time, meaning), no re-authentication, no signature record. Grep confirms no QMS code path imports part11ComplianceService at all.
- NO VENDOR VALIDATION PACKAGE — AND THE PRODUCT SAYS SO. docs/validation/ contains IQ/OQ/PQ/VMP/traceability documents, but they are scoped to the 'Cortex Prime AI System', versioned 1.0.0-DRAFT, dated 2025-01-24, marked 'REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE' with Approved By: PENDING. Nothing covers the QMS module. Worse, the shipping product self-reports the answer: GET /api/part11/compliance-status returns overallStatus 'not_assessed' with every §11.10 section 'not_assessed', readinessScore null and the disclaimer 'Self-assessment only' (server/routes/part11-compliance.ts:1132–1149) — and Part11Console renders it. A buyer clicking the compliance console in the demo sees the vendor state it has not assessed its own Part 11 compliance. Against Veeva shipping validation documentation with every release and Qualio's pre-validation package used by 99% of customers, this ends the evaluation.
- THE QUALITY SURFACE FABRICATES QUALITY RECORDS. SopRegister.tsx:80 does `const docs = reg.docs ?? FIXTURE_DOCS` and line 86 `const training = trainComp.rows ?? FIXTURE_TRAINING`; ChangeControl.tsx:73–74 does the same for changes and KPIs. On an unauthenticated session, an unprovisioned tenant, or any fetch error, the register renders eight invented SOPs with invented numbers, versions and effective dates (QM-001 v4.0, SOP-820-100 CAPA v5.0 effective 2026-03-30, VP-7 sterilizer OQ/PQ) and a training board reading '47 of 47' — with no badge, watermark or state distinguishing them from real records. In a GxP system of record this is an ALCOA+ attributability and accuracy defect, and it is the specific thing a diligence QA lead will screenshot. The rest of the platform already does this correctly — Training.tsx uses fixture-free live reads with honest EmptyState components, and Apps.tsx is explicitly 'fixture-free' — so the QMS surface is the outlier, not the house style.
- NO DEVIATION REGISTER. The category name includes 'deviations' and there is no place to record one. The `deviations` table in shared/schema.ts:9737 (deviation_number, severity, investigation_status, root_cause, batch_disposition, regulatory_reporting_required) has no route, service or UI — grep finds zero reads or writes. QC deviations and OOS investigations route to server/routes/qc.routes.ts, whose storage layer throws NOT_IMPLEMENTED and returns an honest HTTP 501 (qc.routes.ts:41–47; server/storage.ts:1524 createQcDeviation, 1528 updateQcDeviation). qms_nonconforming_products has endpoints but no UI. Only protocol deviations (GCP, a different regulation) are actually built. classifyGMPDeviation therefore produces an excellent classification with a Field Alert trigger that has nowhere to be written down.
- TRAINING IS AN ACKNOWLEDGEMENT COUNTER, NOT A TRAINING SYSTEM. qms_training_records (migrations/20260511_qms_and_labeling.sql:51) has user_id, document_id, document_version, acknowledged_at, method, trainer_id, quiz_score and expires_at — good columns. What is missing is the system: no curriculum table, no role-to-curriculum assignment, no assignment engine, no due/overdue computation per person, no retraining scheduler, no notification, no quiz delivery, no training matrix export. 'curriculum' exists only as a document type string. The compliance endpoint divides distinct current acknowledgements by the org roster. Veeva Training builds curricula from QualityDocs SOPs, assigns by role and tracks re-certification; Qualio ships training with unlimited free read-and-understand users. On the single artifact an inspector asks for first — 'show me this person's training record against every effective SOP' — we cannot produce it.
- THE UI CANNOT MUTATE ANYTHING. SopRegister.tsx documents the decision at lines 10–15: 'No mutation is performed directly here; AnA runs the governed action.' Every button on both quality surfaces calls onAsk(promptString). There is no create-document form, no approval queue, no review-and-approve inbox, no reject-with-reason, no impact-assessment form, no training-acknowledgement action. A quality organisation running 200 change controls a quarter will not conduct them by typing prompts, and an inspector will not accept a chat transcript as the approval record.
- THE CAPA AND INSPECTION UIs ARE UNREACHABLE CODE. client/src/concept2cure/v2/surfaces/DeviceSubmission.tsx holds the only complaint/MDR/CAPA panels (lines 285–287) and the only inspection-readiness panel (line 333) — and nothing imports it. Grep across client/src returns exactly one hit, a comment in EditorCanvas.tsx. The 'device-submission' registry id aliases to DeviceWorkstream, not to this file. The second CAPA UI, PostmarketSurface.tsx, is routed inside mdx/App.tsx:240 under the nav id 'postmarket' — which does not appear in that app's NAV_ITEMS (client/src/concept2cure/mdx/data/nav.ts:31–49). So the 1,022-line CAPA service is behind a hash deep-link, inside an app that is itself only reachable by ⌘K. Three complete backends, zero doors.
- SUPPLIER QUALITY, INTERNAL AUDITS AND MANAGEMENT REVIEW HAVE NO UI AT ALL. Tables and endpoints exist in mdx-qms.ts; no client code consumes them. A second full QMS router, server/routes/qms.ts (227 lines, mounted at /api/qms via register-document-routes.ts:292), has zero client consumers — two parallel QMS APIs, one entirely unused.
- NO DOCUMENT CONTENT. The register is metadata. There is no rendered SOP body, no PDF/Word viewer, no watermarked controlled-copy print, no read-and-understand reading pane, no redline between versions, no shop-floor access. Veeva ships QualityDocs plus Station Manager for tablets on the manufacturing floor. A document-control system that cannot display the document is not a document-control system.
- NO PRECONFIGURED QMS CONTENT. Seven generic SOP templates with a shared section skeleton (server/services/qms/sopTemplates.ts, 199 lines). Competitors ship complete ISO 13485 / 21 CFR 820 / QMSR procedure libraries and pre-built validated workflows that let a customer go live in weeks. Time-to-value is the whole basis of the emerging-company purchase and we have no answer.

## Is the advantage durable?

NOT DURABLE, AND THE WINDOW IS ALREADY MOSTLY CLOSED.

The one real advantage is the deterministic, citation-bearing GMP reasoning layer — classifyGMPDeviation deriving a 21 CFR 211.192 classification, a 24/48/72-hour response clock, a batch disposition, and automatic Field Alert (21 CFR 314.81(b)(1), 3 working days) and Part 7 recall evaluation triggers; designCAPA applying ICH Q9(R1) §5.2 proportionate formality with cited root-cause method selection and effectiveness criteria. That is 2,558 lines of encoded regulatory judgment, and it is not a weekend of prompt engineering — call it 6–12 months of domain-expert-plus-engineer time to reproduce with equivalent citation fidelity.

But three things make it non-durable in this category:

FIRST, THE INCUMBENTS ALREADY SHIPPED THE CATEGORY-DEFINING VERSION. April 2026 was the month the window closed. Veeva's AI Agents for Quality reached GA in April 2026 on Anthropic and Amazon models via Bedrock, with the Deviation Agent generating investigation and CAPA-plan narratives from related records and answering deviation questions in Vault AI Chat. Dot Compliance made Dottie AI 5.0 with agentic Personas generally available on 21 April 2026. MasterControl markets Assist AI as validated and ready to use and has held ISO 42001 certification for its AI management system since July 2025. Industry commentary is explicit that the market has moved past standalone copilots to AI embedded in existing validated workflows. Our depth advantage is real but narrow — reasoning-to-a-regulatory-conclusion versus summarisation — and it sits on the wrong side of the validation line.

SECOND, THE MOAT IS UNREACHABLE AND THEREFORE UNMONETISABLE. An advantage a buyer cannot see in a demo generates no pricing power and no reference customers. Today the quality module is not in the rail, not in the Apps catalog, and reachable only by ⌘K or a memorised URL; the CAPA UI is imported by zero files. You cannot defend a position you have never occupied. Every month this stays true, the incumbents accumulate the thing that actually compounds in this market — inspection-tested reference accounts — while we accumulate nothing.

THIRD, THE ASYMMETRY RUNS AGAINST US. Veeva or Qualio adding deviation-classification logic to an already-validated, already-e-signed, already-deployed QMS is a feature release: they have the record to write into, the signature to bind it with, and the validation evidence to ship it under. We adding validation, e-signatures, a deviation register and a training system is a rebuild of the product's foundation. They are 2–4 quarters from our differentiation; we are 3–5 quarters from their table stakes. Realistically the reasoning advantage is defensible for about 12 months and is not defensible at all inside this category — where validation and reachability, not reasoning quality, decide deals.

FOR THE ACQUIRER: do not underwrite this as an eQMS. Underwrite the gmp-quality-systems knowledge engines, the 17 governed write-tools with segregation-of-duties enforced in code, and the hash-chained audit substrate as an AI/regulatory-intelligence asset — most valuable embedded into a validated eQMS (whether an acquirer's own or a partner's), least valuable as a standalone challenger to Qualio at $36K/year. Price the QMS category at option value, not at revenue.

## Shortest credible path to parity

1. WEEK 1 — Stop the two findings that end diligence, both one-day changes. (a) Delete 'quality' from NAV_HIDDEN (client/src/concept2cure/v2/registryModel.ts:170) or, better, add a 'quality-management' row to the available_modules seed (db/migrations/20260220_user_intelligence_platform.sql:78) with path /concept2cure/quality so the module appears in the Apps catalog the shell already renders — the design constitution's five-destination rule is satisfied by Apps, so no rule is broken. (b) Remove the fixture fallbacks: SopRegister.tsx:80,86 and ChangeControl.tsx:73-74 become honest empty/error states using the EmptyState component already used in Training.tsx:52-57 and the pendingStore meta flag mdx-qms.ts:1010 already returns. A QMS that invents SOP records will not survive a QA diligence read, and the correct pattern is already in the codebase.
2. WEEKS 2–4 — Turn on the e-signature that already exists. Add 'transition' and 'approve' to HIGH_RISK_COMMANDS (server/routes/c2c/actions.ts:74), route qms_change_transition through recordGovernedAction instead of auditService.logAction (AnaToolExecutor.ts:13440), and persist a signature record — printed name, UTC timestamp, signature meaning — via part11ComplianceService.createElectronicSignature on SOP approval, change approval and CAPA closure. Build the one modal the product lacks: re-enter password + select meaning + reason for change, rendered on the record. Everything needed exists (bcrypt verification at part11ComplianceService.ts:546, the re-auth gate at actions.ts:225-236); this is wiring, not invention, and it converts the single most disqualifying gap into a checkbox.
3. WEEKS 4–10 — Build the deviation register, then point the AI at it. Promote the orphaned `deviations` table (shared/schema.ts:9737) into a real service + router modelled on changeControl.service.ts, with a state machine (open → investigation → root_cause → impact_assessed → closed) and a UI. Then wire classifyGMPDeviation's output — classification, response clock, product-impact and disposition, Field Alert and recall evaluation triggers — to write into that record as an AI-proposed draft the quality unit confirms and e-signs. This is the highest-leverage work in the plan: it converts the strongest existing asset from a chat answer into the demo that no competitor can match, and it fills the largest hole in the category name simultaneously. Link the register to qms_change_links so change control finally references live deviation IDs instead of free text.
4. WEEKS 6–14 (parallel) — Make training a training system. Add qms_curricula, qms_curriculum_items and qms_training_assignments; an assignment engine that fans a curriculum out to a role and computes per-person due/overdue; a retraining scheduler driven by the expires_at column that already exists; and one export the buyer will ask for in the demo — 'every employee × every effective SOP, current or overdue, as of today.' Auto-assign on document approval so the training obligation is created by the same transaction that makes the SOP effective. Without this the product cannot answer an inspector's first question.
5. WEEKS 6–12 (parallel) — Give the existing backends doors. Register DeviceSubmission.tsx (or port its CAPA/complaint/MDR and inspection panels into the Quality shell as tabs) so the 1,022-line capaMdr service becomes reachable; add 'postmarket' to client/src/concept2cure/mdx/data/nav.ts:31-49; build minimal supplier, internal-audit and management-review tabs over the endpoints already in mdx-qms.ts; and retire the duplicate unused /api/qms router (server/routes/qms.ts) so there is one QMS API. Add real forms — create document, approve, revise, raise change, complete impact assessment — alongside the AnA path rather than replacing it. Keeping chat as the only write path is a differentiator; keeping it as the only write path is a deal-loser.
6. QUARTER 2 — Produce a QMS validation package and stop self-reporting 'not_assessed'. A VMP, IQ/OQ/PQ protocols and a Part 11 traceability matrix scoped to the QMS module (not Cortex Prime), executed against a release, plus release-by-release regression evidence and a customer-facing Part 11 / Annex 11 compliance statement. Replace the 'not_assessed' payload at part11-compliance.ts:1132-1149 with real assessed status once evidence exists — until then it is honest, and honest is disqualifying. Add a GxP procedure library (ISO 13485 / 21 CFR 820 / QMSR mapped SOP set) so time-to-value can be quoted in weeks. This needs a QA/CSV lead on payroll, not an engineer; it is the difference between shipping software and shipping a regulated system of record.
7. STRATEGIC ALTERNATIVE, worth pricing before committing to the above. Two-to-three quarters of a dedicated squad plus a QA/CSV hire buys parity in a category where the incumbent price floor is $12K–$36K/year (Qualio) and the differentiated asset is the reasoning engine, not the register. The higher-return path may be to package gmp-quality-systems-knowledge.ts and the 17 governed tools as an embeddable quality-intelligence layer — Veeva, Qualio and Dot all now sell AI inside their QMS and none of them derives a Field Alert Report trigger from a deviation's facts. Sell the reasoning into their validated systems rather than rebuilding their validated systems around the reasoning.

## Verdict

**🔴 Not competitive** — Weighted against the eight critical dimensions, this scores 11/40 (27%) versus a best-competitor 40/40. Across all thirteen dimensions it is 22/65 (34%) versus 58/65 (89%). It wins one dimension outright — deterministic GMP quality reasoning — ties on agentic AI, and loses or is heavily capped on everything a Head of Quality actually signs for.

Three findings independently disqualify it from this category, and any one of them ends a real procurement before the demo:

1. There is no vendor validation package, and the product says so out loud. The only IQ/OQ/PQ/VMP documents in the repo are scoped to a different subsystem, versioned 1.0.0-DRAFT, dated January 2025, and stamped "Approved By: PENDING." Meanwhile /api/part11/compliance-status returns every §11.10 section as "not_assessed" with the disclaimer "Self-assessment only" — and the shipping Part11Console renders it. Every competitor in this set answers the validation question in their first email: Veeva ships validation documentation with each release, Qualio's pre-validation package is used by 99% of customers, MasterControl holds ISO 42001 certification for AI governance on top of Part 11/Annex 11, Dot Compliance sells "pre-built and pre-validated" as the product.

2. There is no electronic signature on any quality approval. The Part 11 machinery exists and works — bcrypt second-factor re-authentication at part11ComplianceService.ts:546, a re-auth gate in the governed-action ledger — but the gate fires only for HIGH_RISK_COMMANDS = {sign, lock, revoke-signature, transmittal_rollback}, and SOP approval records command:'transition' while change-control approval bypasses the ledger entirely. An SOP goes effective on a session cookie. For a QMS this is not a gap, it is the absence of the product's defining control.

3. The category name says "SOP, CAPA, change control, deviations, training," and three of those five have no working front door. Deviations do not exist as a record type at all: the `deviations` table has zero routes, QC deviations and OOS return HTTP 501 NOT_IMPLEMENTED, and only GCP protocol deviations are built — so classifyGMPDeviation produces an excellent 21 CFR 211.192 classification with a Field Alert trigger that has nowhere to be written. Training is an acknowledgement counter with no curriculum, no role assignment, no due dates and no matrix export. CAPA is a 1,022-line service whose only UI file, DeviceSubmission.tsx, is imported by nothing.

The reachability problem compounds rather than causes this. The five-destination nav collapse put 'quality' in NAV_HIDDEN, the Apps catalog seed contains no QMS module, and SEGMENT_MODULES — the map that would have listed it — is imported only by a test. But even if the module were pinned to the rail tomorrow, the evaluator would land on a read-only register that renders eight fabricated SOPs and "47 of 47" training compliance whenever the store is empty, with no visual distinction from real records. In a GxP system of record, synthetic quality data indistinguishable from real quality data is the finding, not a polish item — and it is inconsistent with the platform's own house style, since Training.tsx and Apps.tsx are explicitly fixture-free with honest empty states.

What is genuinely here is not a QMS. It is a quality-reasoning engine — 2,558 lines of cited GMP logic that derives regulatory conclusions no competitor's AI derives, plus 17 tenant-scoped, audited, write-capable tools that let a model raise and transition change controls with segregation of duties enforced in code. Veeva's Deviation Agent summarises records; classifyGMPDeviation decides whether you owe FDA a Field Alert Report in three working days. That is real, defensible IP. It should be valued as an AI/knowledge asset and a candidate integration into someone else's validated eQMS — not underwritten as an eQMS that will win a competitive deal against Qualio at $36K/year.
